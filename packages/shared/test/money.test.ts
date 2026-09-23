import { describe, expect, it } from 'vitest';
import { formatOMR, toBaisa, toRials } from '../src/lib/money.js';
import { initials } from '../src/lib/format.js';

describe('money', () => {
  it('keeps three decimals, because that is what a rial has', () => {
    expect(formatOMR(1_234_567)).toBe('OMR 1,234.567');
    expect(formatOMR(500)).toBe('OMR 0.500');
    expect(formatOMR(0)).toBe('OMR 0.000');
  });

  it('round-trips through the integer unit', () => {
    expect(toBaisa(12.345)).toBe(12_345);
    expect(toRials(12_345)).toBe(12.345);
  });

  it('rounds rather than truncating a stray float', () => {
    // 0.1 + 0.2 in a float is 0.30000000000000004; it must still be 300 baisa.
    expect(toBaisa(0.1 + 0.2)).toBe(300);
  });
});

describe('initials', () => {
  it('takes the first and last name', () => {
    expect(initials('Ahmed Al Balushi')).toBe('AB');
    expect(initials('Suarza')).toBe('SU');
    expect(initials('   ')).toBe('?');
  });
});
