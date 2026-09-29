/**
 * Products and stock, against a real mongod.
 *
 * The arithmetic is the point: what counts towards a quantity, what a "low"
 * product is, and what the running total says on the second page of a long
 * stock card.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, startTestDb, stopTestDb } from './helpers.js';
import { ProductModel, syncProductIndexes } from '../src/models/product.model.js';
import { StockMovementModel, syncStockIndexes } from '../src/models/stock-movement.model.js';

beforeAll(async () => {
  await startTestDb();
  await syncProductIndexes();
  await syncStockIndexes();
});
afterAll(stopTestDb);
afterEach(async () => {
  await ProductModel.deleteMany({});
  await StockMovementModel.deleteMany({});
});

const product = (overrides: Record<string, unknown> = {}) => ({
  name: 'Cement 50kg bag',
  code: 'CEM50',
  category: 'Building materials',
  unit: 'BAG',
  cost_price_baisa: 2_100,
  sale_price_baisa: 2_600,
  ...overrides,
});

async function create(overrides: Record<string, unknown> = {}) {
  const response = await request(app).post('/api/products').send(product(overrides));
  expect(response.status).toBe(201);
  return response.body.product as { id: string; name: string; stock_milli: number };
}

const move = (id: string, body: Record<string, unknown>) =>
  request(app)
    .post(`/api/products/${id}/movements`)
    .send({ reason: 'Stock count', movement_date: '2026-09-20', ...body });

describe('defining a product', () => {
  it('needs only a name, and fills in sensible defaults', async () => {
    const response = await request(app).post('/api/products').send({ name: 'Delivery charge' });

    expect(response.status).toBe(201);
    expect(response.body.product).toMatchObject({
      unit: 'PIECE',
      vat_rate_percent: 5,
      track_stock: true,
      status: 'ACTIVE',
      stock_milli: 0,
    });
  });

  it('refuses a second product with the same code', async () => {
    await create();
    const response = await request(app).post('/api/products').send(product({ name: 'Other' }));

    expect(response.status).toBe(422);
    expect(response.body.error.details.code).toMatch(/already uses this code/i);
  });

  it('lets any number of products have no code at all', async () => {
    // '' is not a duplicate of '' — plenty of small traders code nothing.
    await create({ code: '' });
    const second = await request(app).post('/api/products').send(product({ name: 'Sand', code: '' }));
    expect(second.status).toBe(201);
  });

  it('turns opening stock into the first movement', async () => {
    const created = await create({ opening_stock_milli: 40_000 });

    const movements = await request(app).get(`/api/products/${created.id}/movements`);
    expect(movements.body.rows[0]).toMatchObject({
      kind: 'OPENING',
      direction: 'IN',
      quantity_milli: 40_000,
      reason: 'Opening stock',
    });

    const fetched = await request(app).get(`/api/products/${created.id}`);
    expect(fetched.body.product.stock_milli).toBe(40_000);
  });

  it('writes no movement for a product that does not track stock', async () => {
    const created = await create({
      name: 'Labour',
      code: 'LAB',
      track_stock: false,
      opening_stock_milli: 5_000,
    });
    const movements = await request(app).get(`/api/products/${created.id}/movements`);
    expect(movements.body.total).toBe(0);
  });
});

describe('stock', () => {
  it('is what came in minus what went out', async () => {
    const created = await create({ opening_stock_milli: 40_000 });
    await move(created.id, { kind: 'PURCHASE', quantity_milli: 10_000 });
    await move(created.id, { kind: 'SALE', quantity_milli: 12_500 });

    const fetched = await request(app).get(`/api/products/${created.id}`);
    expect(fetched.body.product.stock_milli).toBe(37_500);
  });

  it('keeps decimals exact across many movements', async () => {
    const created = await create({ unit: 'KG' });
    // 0.1 kg ten times is exactly 1 kg, which floats would not guarantee.
    for (let i = 0; i < 10; i++) await move(created.id, { kind: 'PURCHASE', quantity_milli: 100 });

    const fetched = await request(app).get(`/api/products/${created.id}`);
    expect(fetched.body.product.stock_milli).toBe(1_000);
  });

  it('runs the total from the oldest movement and shows the newest first', async () => {
    const created = await create();
    await move(created.id, { kind: 'PURCHASE', quantity_milli: 20_000, movement_date: '2026-09-01', reason: 'One' });
    await move(created.id, { kind: 'SALE', quantity_milli: 5_000, movement_date: '2026-09-05', reason: 'Two' });
    await move(created.id, { kind: 'PURCHASE', quantity_milli: 1_000, movement_date: '2026-09-09', reason: 'Three' });

    const rows = (await request(app).get(`/api/products/${created.id}/movements`)).body.rows as {
      reason: string;
      stock_after_milli: number;
    }[];

    expect(rows.map((r) => r.reason)).toEqual(['Three', 'Two', 'One']);
    expect(rows.map((r) => r.stock_after_milli)).toEqual([16_000, 15_000, 20_000]);
  });

  it('keeps the running total right on the second page', async () => {
    const created = await create();
    for (let day = 1; day <= 10; day++) {
      await move(created.id, {
        kind: 'PURCHASE',
        quantity_milli: 1_000,
        movement_date: `2026-09-0${day > 9 ? 9 : day}`,
        reason: `Day ${day}`,
      });
    }

    const page2 = await request(app).get(`/api/products/${created.id}/movements?page=2&page_size=5`);
    const rows = page2.body.rows as { stock_after_milli: number }[];

    expect(page2.body.total).toBe(10);
    // The oldest five: the total climbs 1000 at a time, which this page could
    // not have worked out on its own.
    expect(rows.map((r) => r.stock_after_milli)).toEqual([5_000, 4_000, 3_000, 2_000, 1_000]);
  });

  it('makes an adjustment say which way it goes, and refuses a contradiction', async () => {
    const created = await create({ opening_stock_milli: 10_000 });

    expect((await move(created.id, { kind: 'ADJUSTMENT', direction: 'OUT', quantity_milli: 2_000, reason: 'Damaged' })).status).toBe(201);
    expect((await request(app).get(`/api/products/${created.id}`)).body.product.stock_milli).toBe(8_000);

    expect((await move(created.id, { kind: 'SALE', direction: 'IN', quantity_milli: 1_000 })).status).toBe(422);
  });

  it('refuses a movement on a product that does not track stock', async () => {
    const created = await create({ name: 'Labour', code: 'LAB2', track_stock: false });
    const response = await move(created.id, { kind: 'PURCHASE', quantity_milli: 1_000 });
    expect(response.status).toBe(409);
  });

  it('insists every movement says why', async () => {
    const created = await create();
    const response = await request(app)
      .post(`/api/products/${created.id}/movements`)
      .send({ kind: 'PURCHASE', quantity_milli: 1_000, movement_date: '2026-09-20' });
    expect(response.status).toBe(422);
  });
});

describe('the product list', () => {
  it('shows products that have never moved, at zero', async () => {
    await create();
    const response = await request(app).get('/api/products');
    expect(response.body.total).toBe(1);
    expect(response.body.rows[0].stock_milli).toBe(0);
  });

  it('filters by how much is left', async () => {
    const stocked = await create({ name: 'Stocked', code: 'A', opening_stock_milli: 40_000, reorder_level_milli: 10_000 });
    const low = await create({ name: 'Low', code: 'B', opening_stock_milli: 5_000, reorder_level_milli: 10_000 });
    const out = await create({ name: 'Out', code: 'C' });

    const names = async (filter: string) => {
      const response = await request(app).get(`/api/products?stock=${filter}`);
      return (response.body.rows as { name: string }[]).map((r) => r.name).sort();
    };

    expect(await names('IN_STOCK')).toEqual(['Low', 'Stocked']);
    expect(await names('LOW')).toEqual(['Low']);
    expect(await names('OUT')).toEqual(['Out']);
    expect(stocked.id && low.id && out.id).toBeTruthy();
  });

  it('never calls a product low when no reorder level is set', async () => {
    await create({ name: 'No level', code: 'D', opening_stock_milli: 1_000 });
    const response = await request(app).get('/api/products?stock=LOW');
    expect(response.body.total).toBe(0);
  });

  it('searches name, code and category together', async () => {
    await create({ name: 'Cement 50kg bag', code: 'CEM50', category: 'Building materials' });
    await create({ name: 'Sugar 1kg', code: 'SUG1', category: 'Foodstuff' });

    for (const [term, expected] of [
      ['cem', 'Cement 50kg bag'],
      ['SUG', 'Sugar 1kg'],
      ['foodstuff', 'Sugar 1kg'],
    ] as const) {
      const response = await request(app).get(`/api/products?q=${term}`);
      expect((response.body.rows as { name: string }[]).map((r) => r.name), term).toEqual([expected]);
    }
  });

  it('counts the filtered total, not the page', async () => {
    for (let i = 0; i < 7; i++) await create({ name: `Product ${i}`, code: `P${i}` });
    const response = await request(app).get('/api/products?page_size=3');
    expect(response.body.rows).toHaveLength(3);
    expect(response.body.total).toBe(7);
  });

  it('offers the categories already in use', async () => {
    await create({ code: 'X1', category: 'Building materials' });
    await create({ name: 'Rice', code: 'X2', category: 'Foodstuff' });
    await create({ name: 'Nails', code: 'X3', category: '' });

    const response = await request(app).get('/api/products/categories');
    expect(response.body.categories).toEqual(['Building materials', 'Foodstuff']);
  });
});

describe('the summary', () => {
  it('counts what needs attention and values what is on hand', async () => {
    await create({ name: 'Stocked', code: 'S1', opening_stock_milli: 10_000, cost_price_baisa: 2_000, reorder_level_milli: 1_000 });
    await create({ name: 'Low', code: 'S2', opening_stock_milli: 1_000, cost_price_baisa: 500, reorder_level_milli: 5_000 });
    await create({ name: 'Out', code: 'S3', cost_price_baisa: 900 });
    await create({ name: 'Service', code: 'S4', track_stock: false });

    const response = await request(app).get('/api/products/summary');

    expect(response.body).toMatchObject({
      total_products: 4,
      active_products: 4,
      low_stock: 1,
      out_of_stock: 1,
    });
    // 10 bags at 2.000 + 1 bag at 0.500 = 20.500 OMR, in baisa.
    expect(response.body.stock_value_baisa).toBe(20_500);
  });

  it('answers zeroes for an empty catalogue rather than failing', async () => {
    const response = await request(app).get('/api/products/summary');
    expect(response.status).toBe(200);
    expect(response.body.total_products).toBe(0);
  });
});

describe('deleting', () => {
  it('is refused once a product has stock history, and says what to do', async () => {
    const created = await create({ opening_stock_milli: 10_000 });
    const response = await request(app).delete(`/api/products/${created.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/set it to inactive/i);
  });

  it('is allowed for a product that never moved', async () => {
    const created = await create();
    expect((await request(app).delete(`/api/products/${created.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/products/${created.id}`)).status).toBe(404);
  });
});
