/**
 * Sales and purchases, and the counter that numbers them.
 *
 * Lines are embedded rather than a separate collection: a document is read and
 * written whole, always, and its lines have no life of their own.
 */

import { Schema, model, type InferSchemaType, type Model } from 'mongoose';
import {
  DOCUMENT_KINDS,
  DOCUMENT_STATUSES,
  SETTLEMENTS,
  type DocumentKind,
  type TradeDocument,
} from '@suarza-oman/shared';

const lineSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    description: { type: String, required: true, trim: true, maxlength: 200 },
    unit: { type: String, default: '', trim: true, maxlength: 20 },
    quantity_milli: { type: Number, required: true, min: 1 },
    unit_price_baisa: { type: Number, required: true, min: 0 },
    vat_rate_percent: { type: Number, default: 5, min: 0, max: 100 },
    net_baisa: { type: Number, required: true, min: 0 },
    vat_baisa: { type: Number, required: true, min: 0 },
    total_baisa: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const documentSchema = new Schema(
  {
    kind: { type: String, enum: DOCUMENT_KINDS, required: true, index: true },
    number: { type: String, required: true },
    party_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    /** Copied at the time: renaming a customer must not rewrite old invoices. */
    party_name: { type: String, required: true, trim: true },
    document_date: { type: Date, required: true },
    reference: { type: String, default: '', trim: true, maxlength: 60 },
    /** The sales invoice a return is written against. Free text - see schema. */
    against_invoice_number: { type: String, default: '', trim: true, maxlength: 60 },
    settlement: { type: String, enum: SETTLEMENTS, default: 'ON_ACCOUNT' },
    salesman_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    /** Copied at the time, like party_name, and for the same reason. */
    salesman_name: { type: String, default: '', trim: true, maxlength: 140 },
    lines: { type: [lineSchema], required: true },
    net_baisa: { type: Number, required: true },
    vat_baisa: { type: Number, required: true },
    discount_baisa: { type: Number, default: 0, min: 0 },
    total_baisa: { type: Number, required: true },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    status: { type: String, enum: DOCUMENT_STATUSES, default: 'POSTED', index: true },
    void_reason: { type: String, default: null },
    voided_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'trade_documents',
    autoIndex: false,
  },
);

documentSchema.index({ kind: 1, number: 1 }, { unique: true });
documentSchema.index({ kind: 1, document_date: -1, _id: -1 });
documentSchema.index({ party_id: 1, document_date: -1 });

export type TradeDocumentDoc = InferSchemaType<typeof documentSchema>;

export const TradeDocumentModel: Model<TradeDocumentDoc> = model<TradeDocumentDoc>(
  'TradeDocument',
  documentSchema,
);

/**
 * Document numbers.
 *
 * One atomic increment per document — `findOneAndUpdate` with `$inc` and
 * `upsert` is a single operation in the database, so two people saving at the
 * same moment cannot be handed the same number. Counting existing documents
 * instead would give duplicates under exactly the load that matters.
 */
interface Counter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<Counter>(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { collection: 'counters', versionKey: false, _id: false },
);
export const CounterModel: Model<Counter> = model<Counter>('Counter', counterSchema);

/**
 * Every kind is numbered 1, 2, 3 - plain numbers, which is what the client's
 * books already use and what the office reads out on the phone. Each kind
 * counts on its own run, so a purchase return is "PR 4" and not number 4 of
 * some shared sequence. Two documents of different kinds can therefore share a
 * number, which is why nothing in this system identifies one by its number
 * alone - see the document_id on a ledger entry.
 */
function formatNumber(_kind: DocumentKind, seq: number): string {
  return String(seq);
}

export async function nextDocumentNumber(kind: DocumentKind): Promise<string> {
  const counter = await CounterModel.findByIdAndUpdate(
    `document:${kind}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean();
  return formatNumber(kind, counter?.seq ?? 1);
}

/**
 * What the next number will probably be, for showing on an unsaved form.
 *
 * Deliberately does not reserve it: a number handed out and then abandoned
 * leaves a hole in the sequence, and a bill book with a missing number is a
 * question somebody has to answer later. Two people drafting at once will both
 * see the same figure and the second will be told a different one on save.
 */
export async function peekDocumentNumber(kind: DocumentKind): Promise<string> {
  const counter = await CounterModel.findById(`document:${kind}`).lean();
  return formatNumber(kind, (counter?.seq ?? 0) + 1);
}

export function toTradeDocument(
  doc: TradeDocumentDoc & { _id: unknown; created_at?: Date },
): TradeDocument {
  return {
    id: String(doc._id),
    kind: doc.kind as TradeDocument['kind'],
    number: doc.number,
    party_id: String(doc.party_id),
    party_name: doc.party_name,
    document_date: doc.document_date.toISOString(),
    reference: doc.reference ?? '',
    against_invoice_number: doc.against_invoice_number ?? '',
    settlement: doc.settlement as TradeDocument['settlement'],
    salesman_id: doc.salesman_id ? String(doc.salesman_id) : null,
    salesman_name: doc.salesman_name ?? '',
    lines: (doc.lines ?? []).map((line) => ({
      product_id: line.product_id ? String(line.product_id) : null,
      description: line.description,
      unit: line.unit ?? '',
      quantity_milli: line.quantity_milli,
      unit_price_baisa: line.unit_price_baisa,
      vat_rate_percent: line.vat_rate_percent ?? 0,
      net_baisa: line.net_baisa,
      vat_baisa: line.vat_baisa,
      total_baisa: line.total_baisa,
    })),
    net_baisa: doc.net_baisa,
    vat_baisa: doc.vat_baisa,
    discount_baisa: doc.discount_baisa ?? 0,
    total_baisa: doc.total_baisa,
    notes: doc.notes ?? '',
    status: doc.status as TradeDocument['status'],
    void_reason: doc.void_reason ?? null,
    voided_at: doc.voided_at ? doc.voided_at.toISOString() : null,
    created_at: (doc.created_at ?? new Date()).toISOString(),
  };
}

export async function syncDocumentIndexes(): Promise<void> {
  await TradeDocumentModel.syncIndexes();
}
