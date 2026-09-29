/**
 * Sales and purchases, against a real mongod.
 *
 * A document is only interesting for what it does to everything else, so these
 * tests check the three effects together: the document, the stock it moved, and
 * the ledger entry it left behind.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, startTestDb, stopTestDb } from './helpers.js';
import { CustomerModel } from '../src/models/customer.model.js';
import { ProductModel, syncProductIndexes } from '../src/models/product.model.js';
import { StockMovementModel, syncStockIndexes } from '../src/models/stock-movement.model.js';
import { LedgerEntryModel, syncLedgerIndexes } from '../src/models/ledger-entry.model.js';
import {
  CounterModel,
  TradeDocumentModel,
  syncDocumentIndexes,
} from '../src/models/trade-document.model.js';

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

async function makeParty(name = 'Ahmed Al Balushi') {
  const response = await request(app)
    .post('/api/customers')
    .send({ name, phone: '+968 9123 4567' });
  return response.body.customer.id as string;
}

async function makeProduct(overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/api/products')
    .send({ name: 'Cement 50kg', code: `C${Math.random().toString(36).slice(2, 7)}`, unit: 'BAG', ...overrides });
  return response.body.product.id as string;
}

const line = (overrides: Record<string, unknown> = {}) => ({
  description: 'Cement 50kg',
  quantity_milli: 10_000,
  unit_price_baisa: 2_600,
  vat_rate_percent: 5,
  ...overrides,
});

async function post(kind: 'SALE' | 'PURCHASE', body: Record<string, unknown>) {
  return request(app)
    .post('/api/documents')
    .send({ kind, document_date: '2026-09-20', lines: [line()], ...body });
}

const stockOf = async (productId: string) => {
  const response = await request(app).get(`/api/products/${productId}`);
  return response.body.product.stock_milli as number;
};

const balanceOf = async (partyId: string) => {
  const response = await request(app).get(`/api/ledger/customers/${partyId}`);
  return response.body.account.balance_baisa as number;
};

describe('posting a sale', () => {
  it('prices the lines itself rather than trusting the total sent', async () => {
    const party = await makeParty();
    const response = await post('SALE', {
      party_id: party,
      lines: [line({ quantity_milli: 10_000, unit_price_baisa: 2_600, vat_rate_percent: 5 })],
      net_baisa: 1,
      total_baisa: 1,
    });

    expect(response.status).toBe(201);
    // 10 bags at 2.600 = 26.000, VAT 5% = 1.300, total 27.300.
    expect(response.body.document).toMatchObject({
      net_baisa: 26_000,
      vat_baisa: 1_300,
      total_baisa: 27_300,
    });
  });

  it('numbers documents in sequence, per kind', async () => {
    const party = await makeParty();
    const first = await post('SALE', { party_id: party });
    const second = await post('SALE', { party_id: party });
    const purchase = await post('PURCHASE', { party_id: party });

    expect(first.body.document.number).toBe('INV-000001');
    expect(second.body.document.number).toBe('INV-000002');
    // Purchases have their own run, starting again at one.
    expect(purchase.body.document.number).toBe('PO-000001');
  });

  it('takes the stock out and puts the customer in debit', async () => {
    const party = await makeParty();
    const product = await makeProduct({ opening_stock_milli: 40_000 });

    await post('SALE', {
      party_id: party,
      lines: [line({ product_id: product, quantity_milli: 10_000 })],
    });

    expect(await stockOf(product)).toBe(30_000);
    expect(await balanceOf(party)).toBe(27_300);
  });

  it('records the charge and the payment when it is settled on the spot', async () => {
    const party = await makeParty();
    await post('SALE', { party_id: party, settlement: 'PAID' });

    // Nothing is owed, but the account still explains itself.
    expect(await balanceOf(party)).toBe(0);
    const entries = await request(app).get(`/api/ledger/customers/${party}/entries`);
    expect(entries.body.total).toBe(2);
    expect((entries.body.rows as { kind: string }[]).map((r) => r.kind).sort()).toEqual([
      'CHARGE',
      'PAYMENT',
    ]);
  });

  it('copies the description onto the document', async () => {
    const party = await makeParty();
    const product = await makeProduct({ name: 'Cement 50kg' });
    const response = await post('SALE', {
      party_id: party,
      lines: [line({ product_id: product, description: 'Cement 50kg bag' })],
    });

    await request(app).patch(`/api/products/${product}`).send({ name: 'Renamed entirely' });

    // Renaming the product must not rewrite what the invoice says.
    const fetched = await request(app).get(`/api/documents/${response.body.document.id}`);
    expect(fetched.body.document.lines[0].description).toBe('Cement 50kg bag');
  });

  it('refuses a document with no lines, and one for nobody', async () => {
    const party = await makeParty();
    expect((await post('SALE', { party_id: party, lines: [] })).status).toBe(422);
    expect((await post('SALE', { party_id: '507f1f77bcf86cd799439011' })).status).toBe(404);
  });

  it('leaves untracked products out of stock entirely', async () => {
    const party = await makeParty();
    const service = await makeProduct({ name: 'Delivery', track_stock: false });

    await post('SALE', { party_id: party, lines: [line({ product_id: service })] });

    const movements = await request(app).get(`/api/products/${service}/movements`);
    expect(movements.body.total).toBe(0);
  });
});

describe('posting a purchase', () => {
  it('brings the stock in and puts us in debt to the supplier', async () => {
    const supplier = await makeParty('Gulf Cement Co');
    const product = await makeProduct();

    await post('PURCHASE', {
      party_id: supplier,
      lines: [line({ product_id: product, quantity_milli: 50_000, unit_price_baisa: 2_100 })],
    });

    expect(await stockOf(product)).toBe(50_000);
    // 50 bags at 2.100 + 5% = 110.250 OMR, and we owe it — a credit balance.
    expect(await balanceOf(supplier)).toBe(-110_250);
  });

  it('settles to nothing when it is paid on collection', async () => {
    const supplier = await makeParty('Gulf Cement Co');
    await post('PURCHASE', { party_id: supplier, settlement: 'PAID' });
    expect(await balanceOf(supplier)).toBe(0);
  });
});

describe('voiding', () => {
  it('puts the stock back and stops the ledger entry counting', async () => {
    const party = await makeParty();
    const product = await makeProduct({ opening_stock_milli: 40_000 });
    const sale = await post('SALE', {
      party_id: party,
      lines: [line({ product_id: product, quantity_milli: 10_000 })],
    });

    const response = await request(app)
      .post(`/api/documents/${sale.body.document.id}/void`)
      .send({ void_reason: 'Customer returned everything' });

    expect(response.status).toBe(200);
    expect(response.body.document.status).toBe('VOID');
    expect(await stockOf(product)).toBe(40_000);
    expect(await balanceOf(party)).toBe(0);
  });

  it('keeps the history rather than deleting it', async () => {
    const party = await makeParty();
    const product = await makeProduct({ opening_stock_milli: 40_000 });
    const sale = await post('SALE', {
      party_id: party,
      lines: [line({ product_id: product, quantity_milli: 10_000 })],
    });
    await request(app).post(`/api/documents/${sale.body.document.id}/void`).send({ void_reason: 'Mistake' });

    // Two stock movements remain — the sale and its reversal — plus the opening.
    const movements = await request(app).get(`/api/products/${product}/movements`);
    expect(movements.body.total).toBe(3);

    const entries = await request(app).get(`/api/ledger/customers/${party}/entries`);
    expect(entries.body.total).toBe(1);
    expect(entries.body.rows[0].voided_at).toBeTruthy();
  });

  it('will not void twice, and insists on a reason', async () => {
    const party = await makeParty();
    const sale = await post('SALE', { party_id: party });
    const url = `/api/documents/${sale.body.document.id}/void`;

    expect((await request(app).post(url).send({})).status).toBe(422);
    expect((await request(app).post(url).send({ void_reason: 'Mistake' })).status).toBe(200);
    expect((await request(app).post(url).send({ void_reason: 'Again' })).status).toBe(409);
  });
});

describe('the list and summary', () => {
  it('keeps sales and purchases apart', async () => {
    const party = await makeParty();
    await post('SALE', { party_id: party });
    await post('PURCHASE', { party_id: party });

    expect((await request(app).get('/api/documents?kind=SALE')).body.total).toBe(1);
    expect((await request(app).get('/api/documents?kind=PURCHASE')).body.total).toBe(1);
  });

  it('adds up posted documents and ignores voided ones', async () => {
    const party = await makeParty();
    await post('SALE', { party_id: party });
    const voided = await post('SALE', { party_id: party });
    await request(app).post(`/api/documents/${voided.body.document.id}/void`).send({ void_reason: 'x' });

    const summary = await request(app).get('/api/documents/summary?kind=SALE');
    expect(summary.body).toMatchObject({ count: 1, net_baisa: 26_000, total_baisa: 27_300 });
  });

  it('counts what is still on account separately', async () => {
    const party = await makeParty();
    await post('SALE', { party_id: party, settlement: 'ON_ACCOUNT' });
    await post('SALE', { party_id: party, settlement: 'PAID' });

    const summary = await request(app).get('/api/documents/summary?kind=SALE');
    expect(summary.body.total_baisa).toBe(54_600);
    expect(summary.body.on_account_baisa).toBe(27_300);
  });

  it('searches by number, party and reference', async () => {
    const party = await makeParty('Ahmed Al Balushi');
    await post('SALE', { party_id: party, reference: 'DN-99' });

    for (const term of ['INV-000001', 'balushi', 'DN-99']) {
      const response = await request(app).get(`/api/documents?kind=SALE&q=${encodeURIComponent(term)}`);
      expect(response.body.total, term).toBe(1);
    }
  });
});

describe('a document worth nothing', () => {
  it('still moves the stock but leaves the account alone', async () => {
    const party = await makeParty();
    const product = await makeProduct({ opening_stock_milli: 10_000 });

    const response = await post('SALE', {
      party_id: party,
      lines: [
        {
          product_id: product,
          description: 'Free sample',
          quantity_milli: 1_000,
          unit_price_baisa: 0,
          vat_rate_percent: 0,
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body.document.total_baisa).toBe(0);
    // The sample left the shelf...
    expect(await stockOf(product)).toBe(9_000);
    // ...and nobody owes anything for it.
    expect(await balanceOf(party)).toBe(0);
    const entries = await request(app).get(`/api/ledger/customers/${party}/entries`);
    expect(entries.body.total).toBe(0);
  });

  it('can still be voided, putting the stock back', async () => {
    const party = await makeParty();
    const product = await makeProduct({ opening_stock_milli: 10_000 });
    const sale = await post('SALE', {
      party_id: party,
      lines: [{ product_id: product, description: 'Free sample', quantity_milli: 1_000, unit_price_baisa: 0 }],
    });

    await request(app).post(`/api/documents/${sale.body.document.id}/void`).send({ void_reason: 'Returned' });
    expect(await stockOf(product)).toBe(10_000);
  });
});
