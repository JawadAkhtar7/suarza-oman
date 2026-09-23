import { describe, expect, it } from 'vitest';
import {
  createLedgerEntrySchema,
  ledgerCustomerQuerySchema,
  signedAmount,
  standingOf,
  updateLedgerEntrySchema,
} from '../src/schemas/ledger.js';

const base = {
  amount_baisa: 15_000,
  description: 'Invoice 104',
  entry_date: '2026-09-20',
};

describe('createLedgerEntrySchema', () => {
  it('works out the direction from the kind', () => {
    expect(createLedgerEntrySchema.parse({ ...base, kind: 'CHARGE' }).direction).toBe('DEBIT');
    expect(createLedgerEntrySchema.parse({ ...base, kind: 'PAYMENT' }).direction).toBe('CREDIT');
  });

  it('makes an adjustment say which way it goes', () => {
    const credit = createLedgerEntrySchema.parse({ ...base, kind: 'ADJUSTMENT', direction: 'CREDIT' });
    expect(credit.direction).toBe('CREDIT');
    const debit = createLedgerEntrySchema.parse({ ...base, kind: 'ADJUSTMENT', direction: 'DEBIT' });
    expect(debit.direction).toBe('DEBIT');
  });

  it('refuses a direction that contradicts the kind', () => {
    // A payment that increases what someone owes is a typo, every time.
    const result = createLedgerEntrySchema.safeParse({ ...base, kind: 'PAYMENT', direction: 'DEBIT' });
    expect(result.success).toBe(false);
  });

  it('refuses zero, negatives and fractions of a baisa', () => {
    for (const amount_baisa of [0, -500, 12.5]) {
      expect(createLedgerEntrySchema.safeParse({ ...base, kind: 'CHARGE', amount_baisa }).success).toBe(
        false,
      );
    }
  });

  it('insists on a description, because a bare number explains nothing later', () => {
    expect(
      createLedgerEntrySchema.safeParse({ ...base, kind: 'CHARGE', description: '  ' }).success,
    ).toBe(false);
  });

  it('takes the date as a date, however it arrives', () => {
    const parsed = createLedgerEntrySchema.parse({ ...base, kind: 'CHARGE' });
    expect(parsed.entry_date).toBeInstanceOf(Date);
    expect(parsed.entry_date.toISOString()).toContain('2026-09-20');
  });

  it('defaults the reference to blank rather than leaving it out', () => {
    expect(createLedgerEntrySchema.parse({ ...base, kind: 'CHARGE' }).reference).toBe('');
  });
});

describe('updateLedgerEntrySchema', () => {
  it('cannot touch the amount or the direction', () => {
    const parsed = updateLedgerEntrySchema.parse({
      description: 'Invoice 104 — corrected wording',
      amount_baisa: 999,
      direction: 'CREDIT',
    } as Record<string, unknown>);

    // Zod strips what the schema does not name; the balance is safe from edits.
    expect(parsed).toEqual({ description: 'Invoice 104 — corrected wording' });
  });
});

describe('balance arithmetic', () => {
  it('debits add and credits subtract', () => {
    expect(signedAmount('DEBIT', 15_000)).toBe(15_000);
    expect(signedAmount('CREDIT', 15_000)).toBe(-15_000);
  });

  it('names where an account stands', () => {
    expect(standingOf(15_000)).toBe('OWING');
    expect(standingOf(0)).toBe('SETTLED');
    expect(standingOf(-15_000)).toBe('ADVANCE');
  });
});

describe('ledgerCustomerQuerySchema', () => {
  it('shows who owes the most first, unasked', () => {
    expect(ledgerCustomerQuerySchema.parse({})).toMatchObject({
      standing: 'ALL',
      sort: 'balance',
      dir: 'desc',
      page: 1,
    });
  });

  it('coerces what a query string carries', () => {
    expect(ledgerCustomerQuerySchema.parse({ page: '4' }).page).toBe(4);
  });
});
