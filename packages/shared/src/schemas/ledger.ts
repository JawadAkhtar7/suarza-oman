/**
 * The customer ledger.
 *
 * One account per customer, made of entries that never change once written.
 * Two ideas carry the whole module:
 *
 *   DEBIT  — the customer owes us more (a charge, an opening balance)
 *   CREDIT — the customer owes us less (a payment, a discount)
 *
 *   balance = debits − credits
 *
 * A positive balance means they owe us; a negative one means they have paid
 * ahead and we hold their money. The balance is never stored — it is summed
 * from the entries every time it is asked for, because a stored total is a
 * number that can quietly stop agreeing with the rows that produced it.
 */

import { z } from 'zod';

export const LEDGER_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export const ledgerDirectionSchema = z.enum(LEDGER_DIRECTIONS);
export type LedgerDirection = z.infer<typeof ledgerDirectionSchema>;

/**
 * What the entry is, in the language the office uses. The direction is implied
 * by all of these except an adjustment, which can go either way.
 */
export const LEDGER_KINDS = [
  'OPENING',
  'CHARGE',
  'PAYMENT',
  /** A supplier's bill: we owe them. */
  'BILL',
  /** Money paid out to a supplier, or refunded to a customer. */
  'PAYMENT_MADE',
  /** Goods came back: the customer owes us less than the invoice said. */
  'CREDIT_NOTE',
  /** Goods sent back to a supplier: we owe them less than their bill said. */
  'DEBIT_NOTE',
  'ADJUSTMENT',
] as const;
export const ledgerKindSchema = z.enum(LEDGER_KINDS);
export type LedgerKind = z.infer<typeof ledgerKindSchema>;

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  OPENING: 'Opening balance',
  /* The client's books call these what the accounting calls them. "Charge" and
     "Payment" read more plainly but stop being true the moment the account
     belongs to a vendor, where a charge is money we owe. */
  CHARGE: 'Debit',
  PAYMENT: 'Credit',
  BILL: 'Supplier bill',
  PAYMENT_MADE: 'Paid out',
  CREDIT_NOTE: 'Sales return',
  DEBIT_NOTE: 'Purchase return',
  ADJUSTMENT: 'Adjustment',
};

/** The direction a kind always implies; null means the entry has to say. */
export const KIND_DIRECTION: Record<LedgerKind, LedgerDirection | null> = {
  OPENING: null,
  CHARGE: 'DEBIT',
  PAYMENT: 'CREDIT',
  /* A bill puts the account in credit: from the customer ledger's point of
     view, a negative balance is money we hold — and for a supplier that is
     money we owe them. Same arithmetic, read from the other side. */
  BILL: 'CREDIT',
  PAYMENT_MADE: 'DEBIT',
  CREDIT_NOTE: 'CREDIT',
  DEBIT_NOTE: 'DEBIT',
  ADJUSTMENT: null,
};

/**
 * Amounts are whole baisa — 1 OMR = 1000 baisa. Zero is refused: an entry that
 * moves nothing is a note, and the description field is where notes go.
 */
const amountBaisa = z
  .number()
  .int('Amounts go to three decimal places')
  .positive('Enter an amount greater than zero')
  /* About 9 million rial. Far past any real entry, close enough to catch a
     misplaced decimal or a paste of the wrong field. */
  .max(9_000_000_000, 'That amount looks wrong');

export const createLedgerEntrySchema = z
  .object({
    kind: ledgerKindSchema,
    /** Required for OPENING and ADJUSTMENT; ignored for the rest. */
    direction: ledgerDirectionSchema.optional(),
    amount_baisa: amountBaisa,
    description: z.string().trim().min(1, 'Say what this is for').max(300),
    /** Invoice number, cheque number, transfer reference — whatever ties it to paper. */
    reference: z.string().trim().max(60).default(''),
    /** The day it happened, which is not always the day it was typed in. */
    entry_date: z.coerce.date(),
  })
  .transform((entry) => ({
    ...entry,
    direction: entry.direction ?? KIND_DIRECTION[entry.kind] ?? 'DEBIT',
  }))
  .refine(
    (entry) => KIND_DIRECTION[entry.kind] === null || KIND_DIRECTION[entry.kind] === entry.direction,
    { message: 'That kind of entry cannot go in that direction', path: ['direction'] },
  );
export type CreateLedgerEntryInput = z.infer<typeof createLedgerEntrySchema>;

/**
 * What can be corrected after the fact: the words, the paperwork it points at,
 * and the date. Never the amount or the direction — those are what the balance
 * is made of, and changing one silently rewrites history. Get one wrong and you
 * void it and write a new one, which is what the void reason is for.
 */
export const updateLedgerEntrySchema = z.object({
  description: z.string().trim().min(1, 'Say what this is for').max(300).optional(),
  reference: z.string().trim().max(60).optional(),
  entry_date: z.coerce.date().optional(),
});
export type UpdateLedgerEntryInput = z.infer<typeof updateLedgerEntrySchema>;

export const voidLedgerEntrySchema = z.object({
  void_reason: z.string().trim().min(1, 'Say why this is being voided').max(200),
});
export type VoidLedgerEntryInput = z.infer<typeof voidLedgerEntrySchema>;

export interface LedgerEntry {
  id: string;
  customer_id: string;
  kind: LedgerKind;
  direction: LedgerDirection;
  amount_baisa: number;
  description: string;
  reference: string;
  entry_date: string;
  /** Balance after this entry, oldest to newest. Voided entries do not move it. */
  balance_after_baisa: number;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** One row of the ledger table: a customer, and where they stand. */
export interface LedgerCustomerRow {
  customer_id: string;
  name: string;
  company: string;
  phone: string;
  charged_baisa: number;
  paid_baisa: number;
  balance_baisa: number;
  entry_count: number;
  last_entry_at: string | null;
}

export interface LedgerSummary {
  /** Owed to us, across every account in debit. */
  receivable_baisa: number;
  /** Held on account, across every customer who has paid ahead. */
  advance_baisa: number;
  owing_count: number;
  advance_count: number;
  settled_count: number;
}

export const LEDGER_STANDINGS = ['ALL', 'OWING', 'SETTLED', 'ADVANCE'] as const;
export const ledgerStandingSchema = z.enum(LEDGER_STANDINGS);
export type LedgerStanding = z.infer<typeof ledgerStandingSchema>;

export const ledgerCustomerQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  standing: ledgerStandingSchema.default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  /* Most owed first by default: that is the list somebody opens this page to
     read, and alphabetical would bury it. */
  sort: z.enum(['balance', 'name', 'last_entry_at']).default('balance'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type LedgerCustomerQuery = z.infer<typeof ledgerCustomerQuerySchema>;

export const ledgerEntryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});
export type LedgerEntryQuery = z.infer<typeof ledgerEntryQuerySchema>;

export interface LedgerCustomerPage {
  rows: LedgerCustomerRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface LedgerEntryPage {
  rows: LedgerEntry[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * A statement of account, for a date range, in the order it is read on paper.
 *
 * Separate from the paged entry list because it answers a different question.
 * The list is "what has happened on this account lately", newest first, a page
 * at a time. A statement is a closed thing you hand to somebody: it opens with
 * what they owed before the period, runs oldest to newest so the balance column
 * accumulates the way the eye expects, and closes with what they owe now.
 */
export const ledgerStatementQuerySchema = z.object({
  /** Blank means "from the beginning", and then the opening balance is zero. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /* A guard, not a page: a statement is printed whole. Beyond this the printed
     document would say so rather than quietly stopping short. */
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
});
export type LedgerStatementQuery = z.infer<typeof ledgerStatementQuerySchema>;

export interface LedgerStatement {
  from: string | null;
  to: string | null;
  /** Where the account stood the moment before `from`. Zero when open-ended. */
  opening_balance_baisa: number;
  /** Oldest first. The running balance includes the opening balance. */
  rows: LedgerEntry[];
  debit_total_baisa: number;
  credit_total_baisa: number;
  closing_balance_baisa: number;
  /** True when there were more entries in range than `limit` would return. */
  truncated: boolean;
  /** When it was drawn up, which is printed on it. */
  generated_at: string;
}

/** Where an account stands, in the one word the UI puts on a badge. */
export function standingOf(balanceBaisa: number): Exclude<LedgerStanding, 'ALL'> {
  if (balanceBaisa > 0) return 'OWING';
  if (balanceBaisa < 0) return 'ADVANCE';
  return 'SETTLED';
}

/** The sign an entry contributes to a balance. */
export function signedAmount(direction: LedgerDirection, amountBaisa: number): number {
  return direction === 'DEBIT' ? amountBaisa : -amountBaisa;
}
