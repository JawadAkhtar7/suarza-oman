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
    created_at: (doc.created_at ?? new Date()).toISOString(),
    updated_at: (doc.updated_at ?? new Date()).toISOString(),
  };
}

export async function syncCustomerIndexes(): Promise<void> {
  await CustomerModel.syncIndexes();
}
