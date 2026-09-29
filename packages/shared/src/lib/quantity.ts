/**
 * Quantities, in thousandths.
 *
 * The same reasoning as money: 12.5 kg and 0.25 tonne are ordinary stock
 * figures, and a float that holds them drifts once you start adding them up. A
 * quantity is therefore an integer count of thousandths of the unit, and only
 * becomes a decimal when it is shown.
 */

export const MILLI_PER_UNIT = 1000;

export function toMilli(quantity: number): number {
  return Math.round(quantity * MILLI_PER_UNIT);
}

export function fromMilli(milli: number): number {
  return milli / MILLI_PER_UNIT;
}

/**
 * Trailing zeroes are dropped: "6 pcs" rather than "6.000 pcs", but "12.5 kg"
 * keeps what it needs. A stock list is read down a column and padding every
 * whole number with decimals makes it harder, not more precise.
 */
export function formatQuantity(milli: number, maximumFractionDigits = 3): string {
  return fromMilli(milli).toLocaleString('en-OM', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}
