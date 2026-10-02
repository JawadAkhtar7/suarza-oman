/**
 * Sales, purchases and sales returns.
 *
 * One shape for all three, because they are the same document read from
 * different ends: a party, a date, some lines, and totals. What differs is only
 * the direction of its two effects -
 *
 *   SALE         stock goes OUT, the customer owes us  (a debit on their ledger)
 *   PURCHASE     stock comes IN, we owe the supplier   (a credit on theirs)
 *   SALE_RETURN  stock comes IN, the customer owes us less (a credit on theirs)
 *   PURCHASE_RETURN  stock goes OUT, we owe the supplier less (a debit on theirs)
 *
 * Keeping one model means the totals, the VAT rounding and the voiding rules
 * are written once and cannot disagree between the two screens.
 *
 * A posted document is never edited. It is voided — which reverses its stock
 * movements and its ledger entries — and written again. An invoice that can be
 * changed after the fact is an invoice nobody can rely on.
 */

import { z } from 'zod';

export const DOCUMENT_KINDS = ['SALE', 'PURCHASE', 'SALE_RETURN', 'PURCHASE_RETURN'] as const;
export const documentKindSchema = z.enum(DOCUMENT_KINDS);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  SALE: 'Sales invoice',
  PURCHASE: 'Purchase',
  SALE_RETURN: 'Sales return',
  PURCHASE_RETURN: 'Purchase return',
};

export const DOCUMENT_STATUSES = ['POSTED', 'VOID'] as const;
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

/** Settled now, or put on the party's account. */
export const SETTLEMENTS = ['PAID', 'ON_ACCOUNT'] as const;
export const settlementSchema = z.enum(SETTLEMENTS);
export type Settlement = z.infer<typeof settlementSchema>;

export const SETTLEMENT_LABELS: Record<Settlement, string> = {
  PAID: 'Paid now',
  ON_ACCOUNT: 'On account',
};

/**
 * The same two choices as the client's own books name them on a sales invoice.
 * There is no third stored value: "credit" is the invoice going on the
 * customer's account, "debit" is it being settled there and then, which is
 * exactly what ON_ACCOUNT and PAID already mean.
 */
export const PAYMODE_LABELS: Record<Settlement, string> = {
  PAID: 'Debit',
  ON_ACCOUNT: 'Credit',
};

const quantityMilli = z
  .number()
  .int('Quantities go to three decimal places')
  .positive('Enter a quantity greater than zero')
  .max(1_000_000_000);

const priceBaisa = z.number().int().min(0).max(9_000_000_000);

export const documentLineSchema = z.object({
  /** Blank for a one-off line that is not in the catalogue. */
  product_id: z.string().trim().default(''),
  /**
   * The description is copied onto the document rather than looked up later:
   * renaming a product must not rewrite what last year's invoices say.
   */
  description: z.string().trim().min(1, 'Every line needs a description').max(200),
  unit: z.string().trim().max(20).default(''),
  quantity_milli: quantityMilli,
  unit_price_baisa: priceBaisa,
  vat_rate_percent: z.number().min(0).max(100).default(5),
});
export type DocumentLineInput = z.infer<typeof documentLineSchema>;

export const createDocumentSchema = z.object({
  kind: documentKindSchema,
  /** The customer, or the supplier. Both live in the customer list. */
  party_id: z.string().trim().min(1, 'Choose who this is for'),
  document_date: z.coerce.date(),
  /** Their invoice or delivery-note number, for a purchase. */
  reference: z.string().trim().max(60).default(''),
  /**
   * The invoice this document is written against: the sale the goods are coming
   * back from, or the supplier's own invoice number on a purchase. Typed rather
   * than picked, because the piece of paper on the counter may predate this
   * system entirely, and a supplier's numbering was never ours to choose.
   */
  against_invoice_number: z.string().trim().max(60).default(''),
  settlement: settlementSchema.default('ON_ACCOUNT'),
  /**
   * Who sold it. Blank is a real answer — the client has no salesman list yet,
   * so the form offers "Unavailable" and that is what most invoices will say.
   * Only the id travels: the name is copied from the employee record by the
   * server, the same way the party's is.
   */
  salesman_id: z.string().trim().default(''),
  lines: z.array(documentLineSchema).min(1, 'Add at least one line'),
  /** Taken off the invoice total. See documentTotals for where it lands. */
  discount_baisa: z.number().int().min(0).max(9_000_000_000).default(0),
  notes: z.string().trim().max(1000).default(''),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const voidDocumentSchema = z.object({
  void_reason: z.string().trim().min(1, 'Say why this is being voided').max(200),
});

export interface DocumentLine {
  product_id: string | null;
  description: string;
  unit: string;
  quantity_milli: number;
  unit_price_baisa: number;
  vat_rate_percent: number;
  /** Before VAT. */
  net_baisa: number;
  vat_baisa: number;
  total_baisa: number;
}

export interface TradeDocument {
  id: string;
  kind: DocumentKind;
  number: string;
  party_id: string;
  party_name: string;
  document_date: string;
  reference: string;
  against_invoice_number: string;
  settlement: Settlement;
  salesman_id: string | null;
  salesman_name: string;
  lines: DocumentLine[];
  net_baisa: number;
  vat_baisa: number;
  discount_baisa: number;
  total_baisa: number;
  notes: string;
  status: DocumentStatus;
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
}

/**
 * Line and document totals.
 *
 * VAT is worked out per line and rounded there, then summed — the same order
 * the tax authority's own guidance uses, and the reason a document total can
 * differ by a baisa from VAT taken on the grand total. Doing it the other way
 * makes each line's printed VAT fail to add up to the total, which is the
 * version a customer queries.
 */
export function priceLine(line: {
  quantity_milli: number;
  unit_price_baisa: number;
  vat_rate_percent: number;
}): { net_baisa: number; vat_baisa: number; total_baisa: number } {
  const net = Math.round((line.quantity_milli * line.unit_price_baisa) / 1000);
  const vat = Math.round((net * line.vat_rate_percent) / 100);
  return { net_baisa: net, vat_baisa: vat, total_baisa: net + vat };
}

/**
 * Document totals, and where the discount lands.
 *
 * The discount comes off AFTER VAT, so every line keeps the VAT it was priced
 * with and the printed lines still add up to the printed VAT. Spreading it
 * back across the lines instead would make each line's net disagree with its
 * own quantity times its own price, which is the first thing a customer checks.
 */
export function documentTotals(
  lines: { net_baisa: number; vat_baisa: number }[],
  discountBaisa = 0,
): {
  net_baisa: number;
  vat_baisa: number;
  discount_baisa: number;
  total_baisa: number;
} {
  const net = lines.reduce((sum, line) => sum + line.net_baisa, 0);
  const vat = lines.reduce((sum, line) => sum + line.vat_baisa, 0);
  const gross = net + vat;
  /* A discount can take an invoice down to nothing but never past it: money
     owed the other way is a credit note, a different document with the
     opposite effect on stock and on the ledger. */
  const discount = Math.min(Math.max(Math.round(discountBaisa), 0), gross);
  return { net_baisa: net, vat_baisa: vat, discount_baisa: discount, total_baisa: gross - discount };
}

export const documentQuerySchema = z.object({
  kind: documentKindSchema,
  q: z.string().trim().max(120).default(''),
  status: z.union([documentStatusSchema, z.literal('ALL')]).default('ALL'),
  settlement: z.union([settlementSchema, z.literal('ALL')]).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});
export type DocumentQuery = z.infer<typeof documentQuerySchema>;

export interface DocumentPage {
  rows: TradeDocument[];
  total: number;
  page: number;
  page_size: number;
}

export interface DocumentSummary {
  /** Posted documents only — voided ones are history, not business. */
  count: number;
  net_baisa: number;
  vat_baisa: number;
  total_baisa: number;
  on_account_baisa: number;
}
