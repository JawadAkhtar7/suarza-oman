/**
 * Reports: the business on one screen.
 *
 * Everything here is aggregated from the documents, movements and ledger
 * entries that already exist — nothing is stored twice and no figure can be
 * stale. A report that keeps its own copy of a total is a report that
 * eventually disagrees with the screen the number came from.
 */

import { Router } from 'express';
import { z } from 'zod';
import { handle } from '../lib/async-handler.js';
import { TradeDocumentModel } from '../models/trade-document.model.js';
import { ProductModel } from '../models/product.model.js';
import { SIGNED_QUANTITY } from '../models/stock-movement.model.js';
import { CustomerModel } from '../models/customer.model.js';
import type { DocumentKind } from '@suarza-oman/shared';

export const reportsRouter: Router = Router();

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

/** Posted documents of one kind, inside the range. Voided ones are not business. */
const inRange = (kind: DocumentKind, from: Date, to: Date) => ({
  kind,
  status: 'POSTED',
  document_date: { $gte: from, $lte: to },
});

/**
 * Plus for what was sold or bought, minus for what came back.
 *
 * Every figure on this report is netted this way. A month that sold 40,000 and
 * took 9,000 of it back did 31,000 of business, and a dashboard that says
 * 40,000 is the kind of number somebody plans a purchase order around.
 */
const RETURN_KINDS: Record<string, DocumentKind> = {
  SALE: 'SALE_RETURN',
  PURCHASE: 'PURCHASE_RETURN',
};

const signedBy = (positiveKind: DocumentKind, field: string) => ({
  $cond: [{ $eq: ['$kind', positiveKind] }, field, { $multiply: [field, -1] }],
});

export interface DocumentTotals {
  count: number;
  net_baisa: number;
  vat_baisa: number;
  total_baisa: number;
}

export interface ReportsOverview {
  from: string;
  to: string;
  /** Gross, before anything came back. */
  sales: DocumentTotals;
  purchases: DocumentTotals;
  sale_returns: DocumentTotals;
  purchase_returns: DocumentTotals;
  /** Gross less returns — the figures to plan on. */
  net_sales_baisa: number;
  net_purchases_baisa: number;
  /** Sales net less what those goods cost, at today's cost price. */
  margin_baisa: number;
  receivable_baisa: number;
  payable_baisa: number;
  stock_value_baisa: number;
  /** One point per day in the range, zero-filled so the line has no gaps. */
  series: { date: string; sales: number; purchases: number }[];
  top_products: { name: string; quantity_milli: number; revenue_baisa: number }[];
  top_customers: { name: string; count: number; revenue_baisa: number }[];
  stock_by_category: { category: string; value_baisa: number }[];
}

async function documentTotals(kind: DocumentKind, from: Date, to: Date): Promise<DocumentTotals> {
  const [totals] = await TradeDocumentModel.aggregate([
    { $match: inRange(kind, from, to) },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        net_baisa: { $sum: '$net_baisa' },
        vat_baisa: { $sum: '$vat_baisa' },
        total_baisa: { $sum: '$total_baisa' },
      },
    },
  ]);
  return {
    count: totals?.count ?? 0,
    net_baisa: totals?.net_baisa ?? 0,
    vat_baisa: totals?.vat_baisa ?? 0,
    total_baisa: totals?.total_baisa ?? 0,
  };
}

/** Every day in the range, so a quiet Friday is a zero rather than a gap. */
function emptySeries(from: Date, to: Date): Map<string, { sales: number; purchases: number }> {
  const series = new Map<string, { sales: number; purchases: number }>();
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  /* Capped: a five-year range would otherwise build two thousand points that no
     chart can show and no eye can read. */
  let guard = 0;
  while (cursor <= end && guard < 400) {
    series.set(cursor.toISOString().slice(0, 10), { sales: 0, purchases: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return series;
}

reportsRouter.get(
  '/overview',
  handle(async (req, res) => {
    const { from, to } = rangeSchema.parse({
      from: req.query['from'] ?? new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
      to: req.query['to'] ?? new Date(),
    });

    const [sales, purchases, saleReturns, purchaseReturns] = await Promise.all([
      documentTotals('SALE', from, to),
      documentTotals('PURCHASE', from, to),
      documentTotals(RETURN_KINDS['SALE']!, from, to),
      documentTotals(RETURN_KINDS['PURCHASE']!, from, to),
    ]);

    /* --- Daily series ---------------------------------------------------- */
    const series = emptySeries(from, to);
    const daily = await TradeDocumentModel.aggregate([
      { $match: { status: 'POSTED', document_date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$document_date' } },
            kind: '$kind',
          },
          total: { $sum: '$total_baisa' },
        },
      },
    ]);
    for (const row of daily) {
      const point = series.get(row._id.day);
      if (!point) continue;
      /* The line is what the business actually did that day, so a return comes
         straight off the day it was taken back on. */
      if (row._id.kind === 'SALE') point.sales += row.total;
      else if (row._id.kind === 'SALE_RETURN') point.sales -= row.total;
      else if (row._id.kind === 'PURCHASE') point.purchases += row.total;
      else if (row._id.kind === 'PURCHASE_RETURN') point.purchases -= row.total;
    }

    /* --- What sold, and what it cost -------------------------------------- */
    const soldLines = await TradeDocumentModel.aggregate([
      {
        $match: {
          kind: { $in: ['SALE', 'SALE_RETURN'] },
          status: 'POSTED',
          document_date: { $gte: from, $lte: to },
        },
      },
      { $unwind: '$lines' },
      {
        $group: {
          _id: { product: '$lines.product_id', name: '$lines.description' },
          quantity_milli: { $sum: signedBy('SALE', '$lines.quantity_milli') },
          revenue_baisa: { $sum: signedBy('SALE', '$lines.net_baisa') },
        },
      },
      /* A product that was entirely returned nets to nothing and belongs on no
         "top products" list. */
      { $match: { revenue_baisa: { $gt: 0 } } },
      { $sort: { revenue_baisa: -1 } },
    ]);

    const productIds = soldLines.map((row) => row._id.product).filter(Boolean);
    const products = await ProductModel.find({ _id: { $in: productIds } })
      .select('_id cost_price_baisa')
      .lean();
    const costOf = new Map(products.map((p) => [String(p._id), p.cost_price_baisa ?? 0]));

    /* Margin at TODAY's cost price: the system does not yet snapshot cost onto
       a sale line, so this is an estimate and is labelled as one on screen. */
    const margin = soldLines.reduce((sum, row) => {
      const cost = row._id.product ? (costOf.get(String(row._id.product)) ?? 0) : 0;
      return sum + row.revenue_baisa - Math.round((row.quantity_milli * cost) / 1000);
    }, 0);

    /* --- Who bought --------------------------------------------------------*/
    const topCustomers = await TradeDocumentModel.aggregate([
      {
        $match: {
          kind: { $in: ['SALE', 'SALE_RETURN'] },
          status: 'POSTED',
          document_date: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: '$party_name',
          /* Invoices only: "4 invoices, two of them returned" is not 6. */
          count: { $sum: { $cond: [{ $eq: ['$kind', 'SALE'] }, 1, 0] } },
          revenue_baisa: { $sum: signedBy('SALE', '$net_baisa') },
        },
      },
      { $match: { revenue_baisa: { $gt: 0 } } },
      { $sort: { revenue_baisa: -1 } },
      { $limit: 6 },
    ]);

    /* --- What we are owed, and what we owe -------------------------------- */
    const [balances] = await CustomerModel.aggregate([
      {
        $lookup: {
          from: 'ledger_entries',
          let: { customerId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$customer_id', '$$customerId'] }, voided_at: null } },
            {
              $group: {
                _id: null,
                balance: {
                  $sum: {
                    $cond: [
                      { $eq: ['$direction', 'DEBIT'] },
                      '$amount_baisa',
                      { $multiply: ['$amount_baisa', -1] },
                    ],
                  },
                },
              },
            },
          ],
          as: 'totals',
        },
      },
      { $addFields: { balance: { $ifNull: [{ $first: '$totals.balance' }, 0] } } },
      {
        $group: {
          _id: null,
          receivable: { $sum: { $cond: [{ $gt: ['$balance', 0] }, '$balance', 0] } },
          payable: { $sum: { $cond: [{ $lt: ['$balance', 0] }, { $abs: '$balance' }, 0] } },
        },
      },
    ]);

    /* --- Stock, by category ----------------------------------------------- */
    const stock = await ProductModel.aggregate([
      {
        $lookup: {
          from: 'stock_movements',
          let: { productId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$product_id', '$$productId'] } } },
            { $group: { _id: null, stock: { $sum: SIGNED_QUANTITY } } },
          ],
          as: 'totals',
        },
      },
      { $addFields: { stock_milli: { $ifNull: [{ $first: '$totals.stock' }, 0] } } },
      {
        $group: {
          _id: { $cond: [{ $gt: ['$category', ''] }, '$category', 'Uncategorised'] },
          value_baisa: {
            $sum: {
              $multiply: [{ $divide: [{ $max: ['$stock_milli', 0] }, 1000] }, '$cost_price_baisa'],
            },
          },
        },
      },
      { $match: { value_baisa: { $gt: 0 } } },
      { $sort: { value_baisa: -1 } },
      { $limit: 8 },
    ]);

    const overview: ReportsOverview = {
      from: from.toISOString(),
      to: to.toISOString(),
      sales,
      purchases,
      sale_returns: saleReturns,
      purchase_returns: purchaseReturns,
      net_sales_baisa: sales.total_baisa - saleReturns.total_baisa,
      net_purchases_baisa: purchases.total_baisa - purchaseReturns.total_baisa,
      margin_baisa: margin,
      receivable_baisa: balances?.receivable ?? 0,
      payable_baisa: balances?.payable ?? 0,
      stock_value_baisa: Math.round(stock.reduce((sum, row) => sum + row.value_baisa, 0)),
      series: [...series.entries()].map(([date, point]) => ({ date, ...point })),
      top_products: soldLines.slice(0, 6).map((row) => ({
        name: String(row._id.name),
        quantity_milli: row.quantity_milli,
        revenue_baisa: row.revenue_baisa,
      })),
      top_customers: topCustomers.map((row) => ({
        name: String(row._id),
        count: row.count,
        revenue_baisa: row.revenue_baisa,
      })),
      stock_by_category: stock.map((row) => ({
        category: String(row._id),
        value_baisa: Math.round(row.value_baisa),
      })),
    };

    res.json(overview);
  }),
);
