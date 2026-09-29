/**
 * Products: the catalogue, and the stock movements behind every quantity.
 *
 * Same shape as the ledger, for the same reasons — totals are aggregated on
 * read, filters that depend on those totals are applied after the sums, and
 * history is appended to rather than edited.
 */

import { Router } from 'express';
import { Types, isValidObjectId, type PipelineStage } from 'mongoose';
import {
  createProductWithStockSchema,
  createStockMovementSchema,
  productQuerySchema,
  updateProductSchema,
  type ProductPage,
  type ProductSummary,
  type StockMovementPage,
} from '@suarza-oman/shared';
import { ProductModel, toProduct } from '../models/product.model.js';
import {
  SIGNED_QUANTITY,
  StockMovementModel,
  movementsOf,
  toStockMovement,
} from '../models/stock-movement.model.js';
import { ApiError } from '../lib/errors.js';
import { handle } from '../lib/async-handler.js';

export const productsRouter: Router = Router();

function requireId(id: unknown, what = 'Product'): string {
  if (typeof id !== 'string' || !isValidObjectId(id)) throw ApiError.notFound(what);
  return id;
}

/**
 * Quantity on hand, as a pipeline fragment.
 *
 * A `$lookup` with a sub-pipeline rather than one `$group` over movements: the
 * list is a list of PRODUCTS, and grouping movements would silently drop every
 * product that has never moved — which is every product on the day it is added.
 */
const STOCK_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      from: 'stock_movements',
      let: { productId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$product_id', '$$productId'] } } },
        { $group: { _id: null, stock: { $sum: SIGNED_QUANTITY }, movements: { $sum: 1 } } },
      ],
      as: 'totals',
    },
  },
  {
    $addFields: {
      stock_milli: { $ifNull: [{ $first: '$totals.stock' }, 0] },
      movement_count: { $ifNull: [{ $first: '$totals.movements' }, 0] },
    },
  },
];

/** Stock filters read the summed figure, so they can only run after the lookup. */
function stockMatch(filter: string): PipelineStage[] {
  switch (filter) {
    case 'OUT':
      return [{ $match: { track_stock: true, stock_milli: { $lte: 0 } } }];
    case 'IN_STOCK':
      return [{ $match: { track_stock: true, stock_milli: { $gt: 0 } } }];
    case 'LOW':
      /* Low means "at or under the reorder level but not yet empty" — a product
         with no reorder level set is never low, it is just stocked. */
      return [
        {
          $match: {
            track_stock: true,
            reorder_level_milli: { $gt: 0 },
            $expr: {
              $and: [{ $gt: ['$stock_milli', 0] }, { $lte: ['$stock_milli', '$reorder_level_milli'] }],
            },
          },
        },
      ];
    default:
      return [];
  }
}

function searchMatch(q: string): PipelineStage[] {
  if (!q) return [];
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const like = { $regex: safe, $options: 'i' };
  return [{ $match: { $or: [{ name: like }, { code: like }, { category: like }] } }];
}

productsRouter.get(
  '/',
  handle(async (req, res) => {
    const query = productQuerySchema.parse(req.query);
    const sortKey = query.sort === 'stock' ? 'stock_milli' : query.sort;

    const [result] = await ProductModel.aggregate([
      ...searchMatch(query.q),
      ...(query.category ? [{ $match: { category: query.category } }] : []),
      ...(query.status === 'ALL' ? [] : [{ $match: { status: query.status } }]),
      ...STOCK_LOOKUP,
      ...stockMatch(query.stock),
      {
        $facet: {
          rows: [
            { $sort: { [sortKey]: query.dir === 'asc' ? 1 : -1, _id: 1 } },
            { $skip: (query.page - 1) * query.page_size },
            { $limit: query.page_size },
          ],
          count: [{ $count: 'total' }],
        },
      },
    ]).collation({ locale: 'en', strength: 2 });

    const page: ProductPage = {
      rows: (result?.rows ?? []).map((row: never) =>
        toProduct(row, (row as { stock_milli: number }).stock_milli),
      ),
      total: result?.count?.[0]?.total ?? 0,
      page: query.page,
      page_size: query.page_size,
    };
    res.json(page);
  }),
);

/** The categories already in use, so the form can offer them instead of asking. */
productsRouter.get(
  '/categories',
  handle(async (_req, res) => {
    const categories = await ProductModel.distinct('category', { category: { $gt: '' } });
    res.json({ categories: categories.sort() });
  }),
);

productsRouter.get(
  '/summary',
  handle(async (_req, res) => {
    const [totals] = await ProductModel.aggregate([
      ...STOCK_LOOKUP,
      {
        $group: {
          _id: null,
          total_products: { $sum: 1 },
          active_products: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
          out_of_stock: {
            $sum: { $cond: [{ $and: ['$track_stock', { $lte: ['$stock_milli', 0] }] }, 1, 0] },
          },
          low_stock: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$track_stock',
                    { $gt: ['$reorder_level_milli', 0] },
                    { $gt: ['$stock_milli', 0] },
                    { $lte: ['$stock_milli', '$reorder_level_milli'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          /* Valued at cost, and only what is actually on hand: negative stock
             would otherwise subtract money the business never had. */
          stock_value_baisa: {
            $sum: {
              $multiply: [
                { $divide: [{ $max: ['$stock_milli', 0] }, 1000] },
                '$cost_price_baisa',
              ],
            },
          },
        },
      },
    ]);

    const summary: ProductSummary = {
      total_products: totals?.total_products ?? 0,
      active_products: totals?.active_products ?? 0,
      low_stock: totals?.low_stock ?? 0,
      out_of_stock: totals?.out_of_stock ?? 0,
      stock_value_baisa: Math.round(totals?.stock_value_baisa ?? 0),
    };
    res.json(summary);
  }),
);

productsRouter.get(
  '/:id',
  handle(async (req, res) => {
    const id = requireId(req.params.id);
    const [row] = await ProductModel.aggregate([
      { $match: { _id: new Types.ObjectId(id) } },
      ...STOCK_LOOKUP,
    ]);
    if (!row) throw ApiError.notFound('Product');
    res.json({ product: toProduct(row, row.stock_milli) });
  }),
);

/**
 * The stock card: every movement, newest first, with the running quantity.
 *
 * The total is accumulated oldest-to-newest in the database, then the page is
 * turned around for display — page two of a long card cannot work out what came
 * before it on its own.
 */
productsRouter.get(
  '/:id/movements',
  handle(async (req, res) => {
    const id = requireId(req.params.id);
    const page = Math.max(1, Number(req.query['page'] ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query['page_size'] ?? 50)));

    const [result] = await StockMovementModel.aggregate([
      { $match: movementsOf(id) },
      { $sort: { movement_date: 1, _id: 1 } },
      {
        $setWindowFields: {
          partitionBy: '$product_id',
          sortBy: { movement_date: 1, _id: 1 },
          output: {
            stock_after_milli: { $sum: SIGNED_QUANTITY, window: { documents: ['unbounded', 'current'] } },
          },
        },
      },
      {
        $facet: {
          rows: [
            { $sort: { movement_date: -1, _id: -1 } },
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
          ],
          count: [{ $count: 'total' }],
        },
      },
    ]);

    const body: StockMovementPage = {
      rows: (result?.rows ?? []).map((row: never) =>
        toStockMovement(row, (row as { stock_after_milli: number }).stock_after_milli),
      ),
      total: result?.count?.[0]?.total ?? 0,
      page,
      page_size: pageSize,
    };
    res.json(body);
  }),
);

/** A duplicate code is the user's mistake, not a crash — say which field. */
function rethrowDuplicate(error: unknown): never {
  if ((error as { code?: number }).code === 11000) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Check the highlighted fields', {
      code: 'Another product already uses this code',
    });
  }
  throw error;
}

productsRouter.post(
  '/',
  handle(async (req, res) => {
    const { opening_stock_milli, ...product } = createProductWithStockSchema.parse(req.body);

    let doc;
    try {
      doc = await ProductModel.create(product);
    } catch (error) {
      rethrowDuplicate(error);
    }

    /* Opening stock is a movement, not a field — so the quantity on hand is the
       sum of the movements from the very first one. */
    if (opening_stock_milli > 0 && product.track_stock) {
      await StockMovementModel.create({
        product_id: doc._id,
        kind: 'OPENING',
        direction: 'IN',
        quantity_milli: opening_stock_milli,
        reason: 'Opening stock',
        reference: '',
        movement_date: new Date(),
      });
    }

    res.status(201).json({ product: toProduct(doc.toObject(), opening_stock_milli) });
  }),
);

productsRouter.patch(
  '/:id',
  handle(async (req, res) => {
    const id = requireId(req.params.id);
    const input = updateProductSchema.parse(req.body);

    let doc;
    try {
      doc = await ProductModel.findByIdAndUpdate(id, input, { new: true, runValidators: true }).lean();
    } catch (error) {
      rethrowDuplicate(error);
    }
    if (!doc) throw ApiError.notFound('Product');

    const [totals] = await StockMovementModel.aggregate([
      { $match: movementsOf(id) },
      { $group: { _id: null, stock: { $sum: SIGNED_QUANTITY } } },
    ]);
    res.json({ product: toProduct(doc, totals?.stock ?? 0) });
  }),
);

productsRouter.post(
  '/:id/movements',
  handle(async (req, res) => {
    const id = requireId(req.params.id);
    const product = await ProductModel.findById(id).lean();
    if (!product) throw ApiError.notFound('Product');
    if (!product.track_stock) {
      throw ApiError.conflict('This product does not track stock. Turn tracking on first.');
    }

    const input = createStockMovementSchema.parse(req.body);
    const doc = await StockMovementModel.create({ ...input, product_id: new Types.ObjectId(id) });
    res.status(201).json({ movement: toStockMovement(doc.toObject()) });
  }),
);

productsRouter.delete(
  '/:id',
  handle(async (req, res) => {
    const id = requireId(req.params.id);

    /* A product with a stock history is not free to delete: the movements would
       be left pointing at nothing, and the stock they account for would vanish
       without a trace. Mark it inactive instead — it then stays out of the way
       without taking its history with it. */
    const movements = await StockMovementModel.countDocuments(movementsOf(id));
    if (movements > 0) {
      throw ApiError.conflict(
        `This product has ${movements} stock ${movements === 1 ? 'movement' : 'movements'}. Set it to Inactive instead of deleting it.`,
      );
    }

    const doc = await ProductModel.findByIdAndDelete(id).lean();
    if (!doc) throw ApiError.notFound('Product');
    res.json({ product: toProduct(doc) });
  }),
);
