/**
 * Sales and purchases, against a real mongod.
 *
 * A document is only interesting for what it does to everything else, so these
 * tests check the three effects together: the document, the stock it moved, and
 * the ledger entry it left behind.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { DocumentKind } from '@suarza-oman/shared';
import { app, startTestDb, stopTestDb } from './helpers.js';
import { CustomerModel } from '../src/models/customer.model.js';
import { EmployeeModel, syncEmployeeIndexes } from '../src/models/employee.model.js';
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
  await syncEmployeeIndexes();
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
    EmployeeModel.deleteMany({}),
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

async function post(kind: DocumentKind, body: Record<string, unknown>) {
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

    // A sale is a plain bill number, which is what the client's books use.
    expect(first.body.document.number).toBe('1');
    expect(second.body.document.number).toBe('2');
    // Purchases have their own run, starting again at one.
    expect(purchase.body.document.number).toBe('1');
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

    for (const term of ['balushi', 'DN-99']) {
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

describe('a sales invoice', () => {
  async function makeSalesman(name = 'Salim Al Hinai') {
    const response = await request(app)
      .post('/api/employees')
      .send({ name, phone: '+968 9555 1234', designation: 'Salesman' });
    return response.body.employee.id as string;
  }

  it('says what the next bill number will be without using it up', async () => {
    const party = await makeParty();

    const before = await request(app).get('/api/documents/next-number?kind=SALE');
    expect(before.body.number).toBe('1');

    // Asking twice must not move the sequence on - it is a peek, not a claim.
    const again = await request(app).get('/api/documents/next-number?kind=SALE');
    expect(again.body.number).toBe('1');

    const saved = await post('SALE', { party_id: party });
    expect(saved.body.document.number).toBe('1');

    const after = await request(app).get('/api/documents/next-number?kind=SALE');
    expect(after.body.number).toBe('2');
  });

  it('copies the salesman name off the employee record', async () => {
    const party = await makeParty();
    const salesman = await makeSalesman('Salim Al Hinai');

    const response = await post('SALE', { party_id: party, salesman_id: salesman });

    expect(response.status).toBe(201);
    expect(response.body.document).toMatchObject({
      salesman_id: salesman,
      salesman_name: 'Salim Al Hinai',
    });

    // Renaming the employee afterwards must not rewrite the invoice.
    await request(app).patch(`/api/employees/${salesman}`).send({ name: 'Salim Hinai' });
    const reread = await request(app).get(`/api/documents/${response.body.document.id}`);
    expect(reread.body.document.salesman_name).toBe('Salim Al Hinai');
  });

  it('leaves the salesman blank when none was chosen', async () => {
    const party = await makeParty();
    const response = await post('SALE', { party_id: party, salesman_id: '' });

    expect(response.status).toBe(201);
    expect(response.body.document.salesman_id).toBeNull();
    expect(response.body.document.salesman_name).toBe('');
  });

  it('refuses a salesman who is not on the staff list', async () => {
    const party = await makeParty();
    const response = await post('SALE', {
      party_id: party,
      salesman_id: '64b7f3d2c1a4e5f6a7b8c9d0',
    });

    expect(response.status).toBe(404);
  });

  it('takes the discount off the total and charges only what is left', async () => {
    const party = await makeParty();

    // 26.000 net + 1.300 VAT = 27.300, less a 2.300 discount = 25.000.
    const response = await post('SALE', { party_id: party, discount_baisa: 2_300 });

    expect(response.body.document).toMatchObject({
      net_baisa: 26_000,
      vat_baisa: 1_300,
      discount_baisa: 2_300,
      total_baisa: 25_000,
    });
    expect(await balanceOf(party)).toBe(25_000);
  });

  it('will not let a discount turn an invoice into money owed the other way', async () => {
    const party = await makeParty();
    const response = await post('SALE', { party_id: party, discount_baisa: 999_000 });

    expect(response.body.document.discount_baisa).toBe(27_300);
    expect(response.body.document.total_baisa).toBe(0);
    // Nothing is owed either way, so the account is left alone entirely.
    expect(await balanceOf(party)).toBe(0);
  });

  it('defaults the discount to nothing', async () => {
    const party = await makeParty();
    const response = await post('SALE', { party_id: party });

    expect(response.body.document.discount_baisa).toBe(0);
    expect(response.body.document.total_baisa).toBe(27_300);
  });

  it('finds an invoice by its salesman', async () => {
    const party = await makeParty();
    const salesman = await makeSalesman('Salim Al Hinai');
    await post('SALE', { party_id: party, salesman_id: salesman });

    const response = await request(app).get('/api/documents?kind=SALE&q=hinai');
    expect(response.body.total).toBe(1);
  });
});

describe('a sales return', () => {
  it('counts on its own run, starting again at one', async () => {
    const party = await makeParty();
    await post('SALE', { party_id: party });
    await post('SALE', { party_id: party });

    const first = await post('SALE_RETURN', { party_id: party });
    const second = await post('SALE_RETURN', { party_id: party });

    expect(first.body.document.number).toBe('1');
    expect(second.body.document.number).toBe('2');
  });

  it('brings the stock back in and takes the money off what is owed', async () => {
    const party = await makeParty();
    const product = await makeProduct({ opening_stock_milli: 40_000 });

    await post('SALE', {
      party_id: party,
      lines: [line({ product_id: product, quantity_milli: 10_000 })],
    });
    expect(await stockOf(product)).toBe(30_000);
    expect(await balanceOf(party)).toBe(27_300);

    // Four of the ten bags come back.
    await post('SALE_RETURN', {
      party_id: party,
      lines: [line({ product_id: product, quantity_milli: 4_000 })],
    });

    expect(await stockOf(product)).toBe(34_000);
    // 4 bags at 2.600 plus VAT = 10.920 off the account.
    expect(await balanceOf(party)).toBe(27_300 - 10_920);
  });

  it('nets to nothing when the money is handed back there and then', async () => {
    const party = await makeParty();
    await post('SALE_RETURN', { party_id: party, settlement: 'PAID' });

    // The credit and the refund both appear, so the statement explains itself.
    expect(await balanceOf(party)).toBe(0);
    const entries = await request(app).get(`/api/ledger/customers/${party}/entries`);
    expect(entries.body.total).toBe(2);
    expect(entries.body.rows.map((row: { kind: string }) => row.kind).sort()).toEqual([
      'CREDIT_NOTE',
      'PAYMENT_MADE',
    ]);
  });

  it('keeps the invoice number it was written against, and finds it by that', async () => {
    const party = await makeParty();
    const response = await post('SALE_RETURN', {
      party_id: party,
      against_invoice_number: '1',
      reference: 'RET-7',
    });

    expect(response.body.document.against_invoice_number).toBe('1');

    const found = await request(app).get('/api/documents?kind=SALE_RETURN&q=RET-7');
    expect(found.body.total).toBe(1);
  });

  it('takes the stock back out again when it is voided', async () => {
    const party = await makeParty();
    const product = await makeProduct({ opening_stock_milli: 10_000 });

    const created = await post('SALE_RETURN', {
      party_id: party,
      lines: [line({ product_id: product, quantity_milli: 5_000 })],
    });
    expect(await stockOf(product)).toBe(15_000);
    expect(await balanceOf(party)).toBe(-13_650);

    await request(app)
      .post(`/api/documents/${created.body.document.id}/void`)
      .send({ void_reason: 'Entered twice' });

    expect(await stockOf(product)).toBe(10_000);
    expect(await balanceOf(party)).toBe(0);
  });

  it('voiding one leaves the invoice that shares its bill number alone', async () => {
    const party = await makeParty();

    // Both are number 1: sales and returns each count on their own run.
    const sale = await post('SALE', { party_id: party });
    const retur = await post('SALE_RETURN', { party_id: party });
    expect(sale.body.document.number).toBe('1');
    expect(retur.body.document.number).toBe('1');
    expect(await balanceOf(party)).toBe(0);

    await request(app)
      .post(`/api/documents/${retur.body.document.id}/void`)
      .send({ void_reason: 'Entered twice' });

    // Only the return stopped counting; the invoice is still owed.
    expect(await balanceOf(party)).toBe(27_300);
    const entries = await request(app).get(`/api/ledger/customers/${party}/entries`);
    const live = entries.body.rows.filter((row: { voided_at: string | null }) => !row.voided_at);
    expect(live).toHaveLength(1);
    expect(live[0].kind).toBe('CHARGE');
  });

  it('is not counted among the sales', async () => {
    const party = await makeParty();
    await post('SALE', { party_id: party });
    await post('SALE_RETURN', { party_id: party });

    const sales = await request(app).get('/api/documents?kind=SALE');
    expect(sales.body.total).toBe(1);

    const returns = await request(app).get('/api/documents?kind=SALE_RETURN');
    expect(returns.body.total).toBe(1);
  });
});

describe('a purchase return', () => {
  it('sends the stock back out and takes it off what we owe', async () => {
    const party = await makeParty();
    const product = await makeProduct({ opening_stock_milli: 0 });

    await post('PURCHASE', {
      party_id: party,
      lines: [line({ product_id: product, quantity_milli: 10_000 })],
    });
    expect(await stockOf(product)).toBe(10_000);
    // A purchase puts the account in credit: a negative balance is money we owe.
    expect(await balanceOf(party)).toBe(-27_300);

    // Four of the ten bags go back to the vendor.
    await post('PURCHASE_RETURN', {
      party_id: party,
      lines: [line({ product_id: product, quantity_milli: 4_000 })],
    });

    expect(await stockOf(product)).toBe(6_000);
    expect(await balanceOf(party)).toBe(-27_300 + 10_920);
  });

  it('nets to nothing when the vendor refunds it there and then', async () => {
    const party = await makeParty();
    await post('PURCHASE_RETURN', { party_id: party, settlement: 'PAID' });

    expect(await balanceOf(party)).toBe(0);
    const entries = await request(app).get(`/api/ledger/customers/${party}/entries`);
    expect(entries.body.rows.map((row: { kind: string }) => row.kind).sort()).toEqual([
      'DEBIT_NOTE',
      'PAYMENT',
    ]);
  });

  it('counts on its own run and keeps the vendor invoice number', async () => {
    const party = await makeParty();
    await post('PURCHASE', { party_id: party });

    const first = await post('PURCHASE_RETURN', {
      party_id: party,
      against_invoice_number: 'SUP-8821',
    });
    const second = await post('PURCHASE_RETURN', { party_id: party });

    expect(first.body.document.number).toBe('1');
    expect(second.body.document.number).toBe('2');
    expect(first.body.document.against_invoice_number).toBe('SUP-8821');

    const found = await request(app).get('/api/documents?kind=PURCHASE_RETURN&q=SUP-8821');
    expect(found.body.total).toBe(1);
  });

  it('brings the stock back in when it is voided', async () => {
    const party = await makeParty();
    const product = await makeProduct({ opening_stock_milli: 10_000 });

    const created = await post('PURCHASE_RETURN', {
      party_id: party,
      lines: [line({ product_id: product, quantity_milli: 4_000 })],
    });
    expect(await stockOf(product)).toBe(6_000);

    await request(app)
      .post(`/api/documents/${created.body.document.id}/void`)
      .send({ void_reason: 'Vendor would not take them' });

    expect(await stockOf(product)).toBe(10_000);
    expect(await balanceOf(party)).toBe(0);
  });

  it('keeps all four kinds apart although they share bill numbers', async () => {
    const party = await makeParty();
    for (const kind of ['SALE', 'PURCHASE', 'SALE_RETURN', 'PURCHASE_RETURN'] as const) {
      const response = await post(kind, { party_id: party });
      expect(response.body.document.number, kind).toBe('1');
    }

    for (const kind of ['SALE', 'PURCHASE', 'SALE_RETURN', 'PURCHASE_RETURN'] as const) {
      const list = await request(app).get(`/api/documents?kind=${kind}`);
      expect(list.body.total, kind).toBe(1);
    }

    // A sale and a purchase return both debit; a purchase and a sales return
    // both credit. Four documents of the same value therefore cancel out.
    expect(await balanceOf(party)).toBe(0);
  });
});
