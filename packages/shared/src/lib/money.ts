/**
 * Money, in baisa.
 *
 * The Omani rial has THREE decimal places: 1 OMR = 1000 baisa. Every amount in
 * this system is an integer count of baisa, because a price that lives in a
 * float eventually disagrees with itself — and in an ERP that disagreement
 * turns up in a customer's ledger months later, not in a test.
 */

export const BAISA_PER_RIAL = 1000;

export function toBaisa(rials: number): number {
  return Math.round(rials * BAISA_PER_RIAL);
}

export function toRials(baisa: number): number {
  return baisa / BAISA_PER_RIAL;
}

/** e.g. 1234567 -> "OMR 1,234.567". Always three decimals: that is the unit. */
export function formatOMR(baisa: number, options: { symbol?: boolean } = {}): string {
  const { symbol = true } = options;
  const text = toRials(baisa).toLocaleString('en-OM', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return symbol ? `OMR ${text}` : text;
}
