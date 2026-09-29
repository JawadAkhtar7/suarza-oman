/**
 * The product catalogue.
 *
 * Storage concerns only — what a valid product IS lives in
 * @suarza-oman/shared, and every write passes through that schema first.
 *
 * Note what is missing: there is no quantity column. Stock is the sum of the
 * movements in `stock_movements`, so the catalogue cannot hold a figure that
 * disagrees with its own history.
 */

import { Schema, model, type InferSchemaType, type Model } from 'mongoose';
import { PRODUCT_UNITS, type Product } from '@suarza-oman/shared';

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    code: { type: String, default: '', trim: true, uppercase: true, maxlength: 40 },
    category: { type: String, default: '', trim: true, maxlength: 60 },
    unit: { type: String, enum: PRODUCT_UNITS, default: 'PIECE' },
    cost_price_baisa: { type: Number, default: 0, min: 0 },
    sale_price_baisa: { type: Number, default: 0, min: 0 },
    vat_rate_percent: { type: Number, default: 5, min: 0, max: 100 },
    track_stock: { type: Boolean, default: true },
    reorder_level_milli: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'products',
    autoIndex: false,
  },
);

/* Partial rather than sparse: a code is optional, and every product without one
   stores '' — which a sparse index would happily let collide. */
productSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { code: { $gt: '' } } },
);
productSchema.index({ name: 1 }, { collation: { locale: 'en', strength: 2 } });
productSchema.index({ category: 1 });
productSchema.index({ created_at: -1 });

export type ProductDoc = InferSchemaType<typeof productSchema>;

export const ProductModel: Model<ProductDoc> = model<ProductDoc>('Product', productSchema);

export function toProduct(
  doc: ProductDoc & { _id: unknown; created_at?: Date; updated_at?: Date },
  stockMilli = 0,
): Product {
  return {
    id: String(doc._id),
    name: doc.name,
    code: doc.code ?? '',
    category: doc.category ?? '',
    unit: doc.unit as Product['unit'],
    cost_price_baisa: doc.cost_price_baisa ?? 0,
    sale_price_baisa: doc.sale_price_baisa ?? 0,
    vat_rate_percent: doc.vat_rate_percent ?? 5,
    track_stock: doc.track_stock ?? true,
    reorder_level_milli: doc.reorder_level_milli ?? 0,
    status: doc.status as Product['status'],
    notes: doc.notes ?? '',
    stock_milli: stockMilli,
    created_at: (doc.created_at ?? new Date()).toISOString(),
    updated_at: (doc.updated_at ?? new Date()).toISOString(),
  };
}

export async function syncProductIndexes(): Promise<void> {
  await ProductModel.syncIndexes();
}
