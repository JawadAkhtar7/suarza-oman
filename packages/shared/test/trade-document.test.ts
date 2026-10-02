/**
 * Invoice arithmetic.
 *
 * The totals are the part of a document that somebody might want to be wrong,
 * so they are worked out in one place and checked here against figures written
 * out by hand.
 */

import { describe, expect, it } from 'vitest';
import {
  PAYMODE_LABELS,
  createDocumentSchema,
  documentTotals,
  priceLine,
} from '../src/schemas/trade-document.js';

const line = (quantity_milli: number, unit_price_baisa: number, vat_rate_percent = 5) =>
  priceLine({ quantity_milli, unit_price_baisa, vat_rate_percent });

describe('documentTotals', () => {
  it('adds the lines up', () => {
    // 10 bags at 2.600 = 26.000, VAT 5% = 1.300.
    const totals = documentTotals([line(10_000, 2_600)]);

    expect(totals).toEqual({
      net_baisa: 26_000,
      vat_baisa: 1_300,
      discount_baisa: 0,
      total_baisa: 27_300,
    });
  });

  it('takes the discount off after VAT, leaving the lines alone', () => {
    const lines = [line(10_000, 2_600)];
    const totals = documentTotals(lines, 2_300);

    expect(totals.net_baisa).toBe(26_000);
    expect(totals.vat_baisa).toBe(1_300);
    expect(totals.total_baisa).toBe(25_000);
    // The line still agrees with its own quantity times its own price.
    expect(lines[0]!.net_baisa).toBe(26_000);
  });

  it('caps the discount at the invoice rather than going negative', () => {
    const totals = documentTotals([line(10_000, 2_600)], 500_000);

    expect(totals.discount_baisa).toBe(27_300);
    expect(totals.total_baisa).toBe(0);
  });

  it('ignores a negative discount', () => {
    const totals = documentTotals([line(10_000, 2_600)], -5_000);

    expect(totals.discount_baisa).toBe(0);
    expect(totals.total_baisa).toBe(27_300);
  });

  it('keeps each line’s VAT rounding, so the printed lines add up', () => {
    // 0.333 at 1.000 rounds to 17 baisa of VAT on each of three lines; VAT on
    // the summed net would be 50, not 51. The lines are what a customer checks.
    const lines = [line(333, 1_000), line(333, 1_000), line(333, 1_000)];
    const totals = documentTotals(lines);

    expect(lines.map((l) => l.vat_baisa)).toEqual([17, 17, 17]);
    expect(totals.vat_baisa).toBe(51);
    expect(totals.total_baisa).toBe(totals.net_baisa + totals.vat_baisa);
  });
});

describe('createDocumentSchema', () => {
  const minimal = {
    kind: 'SALE',
    party_id: '64b7f3d2c1a4e5f6a7b8c9d0',
    document_date: '2026-09-20',
    lines: [{ description: 'Cement 50kg', quantity_milli: 1_000, unit_price_baisa: 2_600 }],
  };

  it('defaults an invoice with no salesman and no discount', () => {
    const parsed = createDocumentSchema.parse(minimal);

    expect(parsed.salesman_id).toBe('');
    expect(parsed.discount_baisa).toBe(0);
    expect(parsed.settlement).toBe('ON_ACCOUNT');
  });

  it('refuses a discount in fractions of a baisa', () => {
    expect(() => createDocumentSchema.parse({ ...minimal, discount_baisa: 12.5 })).toThrow();
  });

  it('refuses a negative discount outright', () => {
    expect(() => createDocumentSchema.parse({ ...minimal, discount_baisa: -1 })).toThrow();
  });
});

describe('paymode wording', () => {
  it('is the client’s own, over the same two stored values', () => {
    expect(PAYMODE_LABELS.ON_ACCOUNT).toBe('Credit');
    expect(PAYMODE_LABELS.PAID).toBe('Debit');
  });
});
