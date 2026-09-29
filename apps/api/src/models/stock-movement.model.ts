/**
 * Every change to a product's quantity, and why.
 *
 * Append-only. A miscount is corrected by another movement in the other
 * direction, not by editing history — "we had 40 bags on Tuesday" has to stay
 * answerable after somebody argues about an invoice.
 */

import { Schema, Types, model, type InferSchemaType, type Model } from 'mongoose';
import { STOCK_DIRECTIONS, STOCK_KINDS, type StockMovement } from '@suarza-oman/shared';

const stockMovementSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    kind: { type: String, enum: STOCK_KINDS, required: true },
    direction: { type: String, enum: STOCK_DIRECTIONS, required: true },
    /** Whole thousandths of the product's unit, so 12.5 kg is 12500. */
    quantity_milli: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    reference: { type: String, default: '', trim: true, maxlength: 60 },
    movement_date: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    collection: 'stock_movements',
    autoIndex: false,
  },
);

/* Every read is "this product's movements, in date order" — which is also what
   the running total is summed over. */
stockMovementSchema.index({ product_id: 1, movement_date: 1, _id: 1 });

export type StockMovementDoc = InferSchemaType<typeof stockMovementSchema>;

export const StockMovementModel: Model<StockMovementDoc> = model<StockMovementDoc>(
  'StockMovement',
  stockMovementSchema,
);

export function toStockMovement(
  doc: StockMovementDoc & { _id: unknown; created_at?: Date },
  stockAfterMilli = 0,
): StockMovement {
  return {
    id: String(doc._id),
    product_id: String(doc.product_id),
    kind: doc.kind as StockMovement['kind'],
    direction: doc.direction as StockMovement['direction'],
    quantity_milli: doc.quantity_milli,
    reason: doc.reason,
    reference: doc.reference ?? '',
    movement_date: doc.movement_date.toISOString(),
    stock_after_milli: stockAfterMilli,
    created_at: (doc.created_at ?? new Date()).toISOString(),
  };
}

export async function syncStockIndexes(): Promise<void> {
  await StockMovementModel.syncIndexes();
}

export function movementsOf(productId: string | Types.ObjectId) {
  return { product_id: new Types.ObjectId(String(productId)) };
}

/** IN adds, OUT subtracts — as a Mongo expression, used by every total here. */
export const SIGNED_QUANTITY = {
  $cond: [{ $eq: ['$direction', 'IN'] }, '$quantity_milli', { $multiply: ['$quantity_milli', -1] }],
};
