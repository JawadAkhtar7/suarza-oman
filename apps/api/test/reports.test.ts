/**
 * The overview report.
 *
 * Every figure here is aggregated from documents that already exist, so the
 * tests post real sales and purchases and then check the report agrees with
 * them — the failure worth catching is a report that quietly disagrees with the
 * screen the number came from.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, startTestDb, stopTestDb } from './helpers.js';
import { CustomerModel } from '../src/models/customer.model.js';
import { ProductModel, syncProductIndexes } from '../src/models/product.model.js';
import { StockMovementModel, syncStockIndexes } from '../src/models/stock-movement.model.js';
import { LedgerEntryModel, syncLedgerIndexes } from '../src/models/ledger-entry.model.js';
import { CounterModel, TradeDocumentModel, syncDocumentIndexes } from '../src/models/trade-document.model.js';

beforeAll(async () => {
  await startTestDb();
  await syncProductIndexes();
  await syncStockIndexes();
  await syncLedgerIndexes();
  await syncDocumentIndexes();
});
afterAll(stopTestDb);
afterEach(async () => {
  await Promise.all([
    CustomerModel.deleteMany({}),
    ProductModel.deleteMany({}),
    StockMovementModel.deleteMany({}),
    LedgerEntryModel.deleteMany({}),
    TradeDocumentModel.deleteMany({}),
    CounterModel.deleteMany({}),
  ]);
});

const RANGE = '?from=2026-09-01&to=2026-09-30';

async function party(name: string) {
  const response = await request(app).post('/api/customers').send({ name, phone: '92000000' });
  return response.body.customer.id as string;
}

async function product(name: string, cost: number, overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/api/products')
    .send({ name, cost_price_baisa: cost, ...overrides });
  return response.body.product.id as string;
}

const post = (kind: 'SALE' | 'PURCHASE', body: Record<string, unknown>) =>
  request(app)
    .post('/api/documents')
    .send({ kind, document_date: '2026-09-10', ...body });

const overview = async () => (await request(app).get(`/api/reports/overview${RANGE}`)).body;

describe('the overview', () => {
  it('answers zeroes for a business with no history rather than failing', async () => {
    const report = await overview();
    expect(report.sales).toMatchObject({ count: 0, total_baisa: 0 });
    expect(report.top_products).toEqual([]);
    // Every day in the range is still a point, so the chart has no gaps.
    expect(report.series).toHaveLength(30);
    expect(report.series.every((p: { sales: number }) => p.sales === 0)).toBe(true);
  });

  it('adds up sales and purchases separately', async () => {
    const customer = await party('Ahmed');
    await post('SALE', {
      party_id: customer,
      lines: [{ description: 'Cement', quantity_milli: 10_000, unit_price_baisa: 2_600, vat_rate_percent: 5 }],
    });
    await post('PURCHASE', {
      party_id: customer,
      lines: [{ description: 'Cement', quantity_milli: 10_000, unit_price_baisa: 2_100, vat_rate_percent: 5 }],
    });

    const report = await overview();
    expect(report.sales).toMatchObject({ count: 1, net_baisa: 26_000, total_baisa: 27_300 });
    expect(report.purchases).toMatchObject({ count: 1, net_baisa: 21_000 });
  });

  it('leaves voided documents out of every figure', async () => {
    const customer = await party('Ahmed');
    const sale = await post('SALE', {
      party_id: customer,
      lines: [{ description: 'Cement', quantity_milli: 10_000, unit_price_baisa: 2_600 }],
    });
    await request(app).post(`/api/documents/${sale.body.document.id}/void`).send({ void_reason: 'x' });

    const report = await overview();
    expect(report.sales.count).toBe(0);
    expect(report.top_products).toEqual([]);
    expect(report.series.every((p: { sales: number }) => p.sales === 0)).toBe(true);
  });

  it('ignores documents outside the range', async () => {
    const customer = await party('Ahmed');
    await post('SALE', {
      party_id: customer,
      document_date: '2026-07-04',
      lines: [{ description: 'Old sale', quantity_milli: 1_000, unit_price_baisa: 1_000 }],
    });

    expect((await overview()).sales.count).toBe(0);
  });

  it('puts each day on its own point', async () => {
    const customer = await party('Ahmed');
    await post('SALE', {
      party_id: customer,
      document_date: '2026-09-10',
      lines: [{ description: 'A', quantity_milli: 1_000, unit_price_baisa: 10_000, vat_rate_percent: 0 }],
    });
    await post('SALE', {
      party_id: customer,
      document_date: '2026-09-12',
      lines: [{ description: 'B', quantity_milli: 1_000, unit_price_baisa: 5_000, vat_rate_percent: 0 }],
    });

    const report = await overview();
    const byDay = Object.fromEntries(
      (report.series as { date: string; sales: number }[]).map((p) => [p.date, p.sales]),
    );
    expect(byDay['2026-09-10']).toBe(10_000);
    expect(byDay['2026-09-11']).toBe(0);
    expect(byDay['2026-09-12']).toBe(5_000);
  });

  it('estimates the margin against what the goods cost', async () => {
    const customer = await party('Ahmed');
    const cement = await product('Cement', 2_000);
    await post('SALE', {
      party_id: customer,
      lines: [
        {
          product_id: cement,
          description: 'Cement',
          quantity_milli: 10_000,
          unit_price_baisa: 3_000,
          vat_rate_percent: 0,
        },
      ],
    });

    // Sold 10 at 3.000 = 30.000; they cost 2.000 each = 20.000. Margin 10.000.
    expect((await overview()).margin_baisa).toBe(10_000);
  });

  it('ranks what sold and who bought it', async () => {
    const one = await party('Big Buyer');
    const two = await party('Small Buyer');
    await post('SALE', {
      party_id: one,
      lines: [{ description: 'Steel', quantity_milli: 5_000, unit_price_baisa: 20_000, vat_rate_percent: 0 }],
    });
    await post('SALE', {
      party_id: two,
      lines: [{ description: 'Sand', quantity_milli: 1_000, unit_price_baisa: 1_000, vat_rate_percent: 0 }],
    });

    const report = await overview();
    expect(report.top_products[0]).toMatchObject({ name: 'Steel', revenue_baisa: 100_000 });
    expect(report.top_customers[0]).toMatchObject({ name: 'Big Buyer', revenue_baisa: 100_000 });
  });

  it('separates what we are owed from what we owe', async () => {
    const customer = await party('Owes Us');
    const supplier = await party('We Owe Them');
    await post('SALE', {
      party_id: customer,
      settlement: 'ON_ACCOUNT',
      lines: [{ description: 'Goods', quantity_milli: 1_000, unit_price_baisa: 50_000, vat_rate_percent: 0 }],
    });
    await post('PURCHASE', {
      party_id: supplier,
      settlement: 'ON_ACCOUNT',
      lines: [{ description: 'Goods', quantity_milli: 1_000, unit_price_baisa: 30_000, vat_rate_percent: 0 }],
    });

    const report = await overview();
    // Never netted: 50 out there to collect, 30 to pay.
    expect(report.receivable_baisa).toBe(50_000);
    expect(report.payable_baisa).toBe(30_000);
  });

  it('values the stock on hand by category', async () => {
    await product('Cement', 2_000, { category: 'Building', opening_stock_milli: 10_000 });
    await product('Rice', 1_000, { category: 'Food', opening_stock_milli: 4_000 });
    await product('Nothing left', 9_000, { category: 'Building' });

    const report = await overview();
    expect(report.stock_by_category).toEqual([
      { category: 'Building', value_baisa: 20_000 },
      { category: 'Food', value_baisa: 4_000 },
    ]);
    expect(report.stock_value_baisa).toBe(24_000);
  });
});
