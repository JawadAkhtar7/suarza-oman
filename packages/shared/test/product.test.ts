import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  createStockMovementSchema,
  marginPercent,
  productQuerySchema,
  stockStanding,
} from '../src/schemas/product.js';
import { formatQuantity, fromMilli, toMilli } from '../src/lib/quantity.js';

describe('createProductSchema', () => {
  it('needs only a name', () => {
    const parsed = createProductSchema.parse({ name: 'Cement 50kg' });
    expect(parsed).toMatchObject({
      code: '',
      category: '',
      unit: 'PIECE',
      cost_price_baisa: 0,
      sale_price_baisa: 0,
      // Oman's standard rate, which most things are on.
      vat_rate_percent: 5,
      track_stock: true,
      status: 'ACTIVE',
    });
  });

  it('refuses a name too short to mean anything', () => {
    expect(createProductSchema.safeParse({ name: 'C' }).success).toBe(false);
  });

  it('keeps prices as whole baisa', () => {
    const parsed = createProductSchema.parse({
      name: 'Steel bar',
      cost_price_baisa: 1_250,
      sale_price_baisa: 1_800,
    });
    expect(parsed.cost_price_baisa).toBe(1_250);
    expect(createProductSchema.safeParse({ name: 'Steel bar', cost_price_baisa: 12.5 }).success).toBe(
      false,
    );
  });
});

describe('createStockMovementSchema', () => {
  const base = { quantity_milli: 5_000, reason: 'Stock count', movement_date: '2026-09-20' };

  it('works out the direction from the kind', () => {
    expect(createStockMovementSchema.parse({ ...base, kind: 'PURCHASE' }).direction).toBe('IN');
    expect(createStockMovementSchema.parse({ ...base, kind: 'SALE' }).direction).toBe('OUT');
  });

  it('makes an adjustment say which way it goes', () => {
    const out = createStockMovementSchema.parse({ ...base, kind: 'ADJUSTMENT', direction: 'OUT' });
    expect(out.direction).toBe('OUT');
  });

  it('refuses a sale that adds stock', () => {
    expect(
      createStockMovementSchema.safeParse({ ...base, kind: 'SALE', direction: 'IN' }).success,
    ).toBe(false);
  });

  it('insists on a reason', () => {
    expect(createStockMovementSchema.safeParse({ ...base, reason: '  ' }).success).toBe(false);
  });

  it('refuses zero and fractions of a thousandth', () => {
    for (const quantity_milli of [0, -1, 2.5]) {
      expect(createStockMovementSchema.safeParse({ ...base, quantity_milli }).success).toBe(false);
    }
  });
});

describe('quantities', () => {
  it('round-trips through the integer unit', () => {
    expect(toMilli(12.5)).toBe(12_500);
    expect(fromMilli(12_500)).toBe(12.5);
  });

  it('rounds a stray float rather than truncating it', () => {
    expect(toMilli(0.1 + 0.2)).toBe(300);
  });

  it('shows whole numbers without padding, and decimals when they matter', () => {
    expect(formatQuantity(6_000)).toBe('6');
    expect(formatQuantity(12_500)).toBe('12.5');
  });
});

describe('stockStanding', () => {
  const product = { track_stock: true, stock_milli: 10_000, reorder_level_milli: 5_000 };

  it('names where a product stands', () => {
    expect(stockStanding(product)).toBe('OK');
    expect(stockStanding({ ...product, stock_milli: 5_000 })).toBe('LOW');
    expect(stockStanding({ ...product, stock_milli: 0 })).toBe('OUT');
    expect(stockStanding({ ...product, track_stock: false })).toBe('UNTRACKED');
  });

  it('never calls a product low when no reorder level is set', () => {
    expect(stockStanding({ ...product, reorder_level_milli: 0, stock_milli: 1 })).toBe('OK');
  });

  it('counts negative stock as out, not as a quantity', () => {
    // Selling more than was recorded can push this below zero; it is still
    // "none left", and showing "-3 bags in stock" would read as an asset.
    expect(stockStanding({ ...product, stock_milli: -3_000 })).toBe('OUT');
  });
});

describe('marginPercent', () => {
  it('is the share of the sale price that is not cost', () => {
    expect(marginPercent(750, 1_000)).toBeCloseTo(25);
  });

  it('gives nothing when either side is missing', () => {
    expect(marginPercent(0, 1_000)).toBeNull();
    expect(marginPercent(750, 0)).toBeNull();
  });
});

describe('productQuerySchema', () => {
  it('lists alphabetically unless told otherwise', () => {
    expect(productQuerySchema.parse({})).toMatchObject({ sort: 'name', dir: 'asc', stock: 'ALL' });
  });
});

describe('employee pay', () => {
  it('normalises a rate to what a month costs', async () => {
    const { monthlyCostBaisa, serviceLength } = await import('../src/schemas/employee.js');

    expect(monthlyCostBaisa(400_000, 'MONTHLY')).toBe(400_000);
    // 26 working days, the Gulf convention.
    expect(monthlyCostBaisa(10_000, 'DAILY')).toBe(260_000);
    expect(monthlyCostBaisa(1_000, 'HOURLY')).toBe(208_000);

    expect(serviceLength(null)).toBeNull();
    expect(serviceLength('2024-09-29T00:00:00.000Z', new Date('2026-09-29T00:00:00.000Z'))).toBe('2 years');
    expect(serviceLength('2026-06-29T00:00:00.000Z', new Date('2026-09-29T00:00:00.000Z'))).toBe('3 months');
  });
});
