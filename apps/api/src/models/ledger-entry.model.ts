/**
 * Ledger entries.
 *
 * Append-mostly: an entry's amount and direction are fixed once written, and a
 * mistake is corrected by voiding the entry and writing another. A voided entry
 * keeps its row — it simply stops counting — because "where did that 200 rial
 * go" is a question somebody asks three months later.
 */

import { Schema, Types, model, type InferSchemaType, type Model } from 'mongoose';
import { LEDGER_DIRECTIONS, LEDGER_KINDS, type LedgerEntry } from '@suarza-oman/shared';

const ledgerEntrySchema = new Schema(
  {
    customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    kind: { type: String, enum: LEDGER_KINDS, required: true },
    direction: { type: String, enum: LEDGER_DIRECTIONS, required: true },
    /** Whole baisa. Never a float — see the money helpers in @suarza-oman/shared. */
    amount_baisa: { type: Number, required: true, min: 1 },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    reference: { type: String, default: '', trim: true, maxlength: 60 },
    entry_date: { type: Date, required: true },
    voided_at: { type: Date, default: null },
    void_reason: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'ledger_entries',
    autoIndex: false,
  },
);

/* Every read is "this customer's entries, in date order" — one compound index
   serves the statement, the balance and the totals on the list. */
ledgerEntrySchema.index({ customer_id: 1, entry_date: 1, _id: 1 });
ledgerEntrySchema.index({ customer_id: 1, voided_at: 1 });

export type LedgerEntryDoc = InferSchemaType<typeof ledgerEntrySchema>;

export const LedgerEntryModel: Model<LedgerEntryDoc> = model<LedgerEntryDoc>(
  'LedgerEntry',
  ledgerEntrySchema,
);

export function toLedgerEntry(
  doc: LedgerEntryDoc & { _id: unknown; created_at?: Date; updated_at?: Date },
  balanceAfterBaisa = 0,
): LedgerEntry {
  return {
    id: String(doc._id),
    customer_id: String(doc.customer_id),
    kind: doc.kind as LedgerEntry['kind'],
    direction: doc.direction as LedgerEntry['direction'],
    amount_baisa: doc.amount_baisa,
    description: doc.description,
    reference: doc.reference ?? '',
    entry_date: doc.entry_date.toISOString(),
    balance_after_baisa: balanceAfterBaisa,
    voided_at: doc.voided_at ? doc.voided_at.toISOString() : null,
    void_reason: doc.void_reason ?? null,
    created_at: (doc.created_at ?? new Date()).toISOString(),
    updated_at: (doc.updated_at ?? new Date()).toISOString(),
  };
}

export async function syncLedgerIndexes(): Promise<void> {
  await LedgerEntryModel.syncIndexes();
}

/** Live entries only — voided ones exist to be read, not to be counted. */
export function liveEntriesFilter(customerId: string | Types.ObjectId) {
  return { customer_id: new Types.ObjectId(String(customerId)), voided_at: null };
}
