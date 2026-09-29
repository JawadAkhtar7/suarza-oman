/**
 * The customer collection.
 *
 * Mongoose owns storage concerns only — required, indexes, trimming. What a
 * valid customer *is* lives in @suarza-oman/shared, and every write passes
 * through that schema before it reaches this model, so the two cannot drift.
 */

import { Schema, model, type InferSchemaType, type Model } from 'mongoose';
import type { Customer } from '@suarza-oman/shared';

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, default: '', trim: true, maxlength: 120 },
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 32 },
    vat_number: { type: String, default: '', trim: true, maxlength: 32 },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    pay_mode: { type: String, enum: ['CASH', 'CREDIT', 'MULTI', 'VISA'], default: 'CASH' },
    /* Indexed: the vendors page filters on it every time it loads. */
    is_vendor: { type: Boolean, default: false, index: true },
    /* Reference only — the ledger, not this, decides what anyone owes. */
    previous_year_balance_baisa: { type: Number, default: 0, min: 0 },
    previous_year_balance_direction: { type: String, enum: ['DEBIT', 'CREDIT'], default: 'DEBIT' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'customers',
    // Indexes are created by syncIndexes() at boot, not silently per model.
    autoIndex: false,
  },
);

/**
 * One text index over the fields a person searches by name, company, phone or
 * email in a single box, because that is how someone looks for a customer:
 * with one half-remembered string, not a field to put it in.
 */
customerSchema.index({ name: 'text', company: 'text', email: 'text', phone: 'text' });
customerSchema.index({ created_at: -1 });
/* Case-insensitive, so "ahmed" and "Ahmed" sort together rather than in two blocks. */
customerSchema.index({ name: 1 }, { collation: { locale: 'en', strength: 2 } });

export type CustomerDoc = InferSchemaType<typeof customerSchema>;

export const CustomerModel: Model<CustomerDoc> = model<CustomerDoc>('Customer', customerSchema);

/** The wire shape: `_id` becomes `id`, dates become ISO strings. */
export function toCustomer(doc: CustomerDoc & { _id: unknown; created_at?: Date; updated_at?: Date }): Customer {
  return {
    id: String(doc._id),
    name: doc.name,
    company: doc.company ?? '',
    email: doc.email ?? '',
    phone: doc.phone,
    vat_number: doc.vat_number ?? '',
    notes: doc.notes ?? '',
    status: doc.status as Customer['status'],
    pay_mode: (doc.pay_mode ?? 'CASH') as Customer['pay_mode'],
    is_vendor: Boolean(doc.is_vendor),
    previous_year_balance_baisa: doc.previous_year_balance_baisa ?? 0,
    previous_year_balance_direction: (doc.previous_year_balance_direction ??
      'DEBIT') as Customer['previous_year_balance_direction'],
    created_at: (doc.created_at ?? new Date()).toISOString(),
    updated_at: (doc.updated_at ?? new Date()).toISOString(),
  };
}

export async function syncCustomerIndexes(): Promise<void> {
  await CustomerModel.syncIndexes();
}
