/**
 * The ledger, against a real mongod.
 *
 * The balance arithmetic is the whole product here, so these tests spend their
 * time on it: what counts, what stops counting, and what the running balance
 * says on the second page of a long statement.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, clearDb, customerInput, startTestDb, stopTestDb } from './helpers.js';
import { LedgerEntryModel, syncLedgerIndexes } from '../src/models/ledger-entry.model.js';

beforeAll(async () => {
  await startTestDb();
  await syncLedgerIndexes();
});
afterAll(stopTestDb);
afterEach(async () => {
  await clearDb();
  await LedgerEntryModel.deleteMany({});
});

async function makeCustomer(overrides: Record<string, unknown> = {}) {
  const response = await request(app).post('/api/customers').send(customerInput(overrides));
  return response.body.customer.id as string;
}

async function addEntry(customerId: string, body: Record<string, unknown>) {
  const response = await request(app)
    .post(`/api/ledger/customers/${customerId}/entries`)
    .send({ description: 'Invoice', entry_date: '2026-09-20', ...body });
  return response;
}

const charge = (amount: number, extra: Record<string, unknown> = {}) => ({
  kind: 'CHARGE',
  amount_baisa: amount,
  ...extra,
});
const payment = (amount: number, extra: Record<string, unknown> = {}) => ({
  kind: 'PAYMENT',
  amount_baisa: amount,
  ...extra,
});

describe('writing entries', () => {
  it('records a charge against the customer', async () => {
    const id = await makeCustomer();
    const response = await addEntry(id, charge(15_000, { reference: 'INV-104' }));

    expect(response.status).toBe(201);
    expect(response.body.entry).toMatchObject({
      kind: 'CHARGE',
      direction: 'DEBIT',
      amount_baisa: 15_000,
      reference: 'INV-104',
      voided_at: null,
    });
  });

  it('refuses an entry against a customer who does not exist', async () => {
    const response = await addEntry('507f1f77bcf86cd799439011', charge(1000));
    expect(response.status).toBe(404);
  });

  it('refuses an amount of nothing', async () => {
    const id = await makeCustomer();
    expect((await addEntry(id, charge(0))).status).toBe(422);
  });

  it('makes an adjustment declare its direction', async () => {
    const id = await makeCustomer();
    const response = await addEntry(id, {
      kind: 'ADJUSTMENT',
      amount_baisa: 500,
      direction: 'CREDIT',
      description: 'Rounding off',
    });
    expect(response.status).toBe(201);
    expect(response.body.entry.direction).toBe('CREDIT');
  });
});

describe('the balance', () => {
  it('is debits minus credits', async () => {
    const id = await makeCustomer();
    await addEntry(id, charge(15_000));
    await addEntry(id, charge(5_000));
    await addEntry(id, payment(12_000));

    const response = await request(app).get(`/api/ledger/customers/${id}`);

    expect(response.body.account).toMatchObject({
      charged_baisa: 20_000,
      paid_baisa: 12_000,
      balance_baisa: 8_000,
      entry_count: 3,
    });
  });

  it('goes negative when a customer has paid ahead', async () => {
    const id = await makeCustomer();
    await addEntry(id, charge(5_000));
    await addEntry(id, payment(8_000));

    const response = await request(app).get(`/api/ledger/customers/${id}`);
    expect(response.body.account.balance_baisa).toBe(-3_000);
  });

  it('stops counting an entry once it is voided, but keeps the row', async () => {
    const id = await makeCustomer();
    const kept = await addEntry(id, charge(15_000));
    const mistake = await addEntry(id, charge(150_000));

    const voided = await request(app)
      .post(`/api/ledger/entries/${mistake.body.entry.id}/void`)
      .send({ void_reason: 'Typed a zero too many' });
    expect(voided.status).toBe(200);

    const account = await request(app).get(`/api/ledger/customers/${id}`);
    expect(account.body.account.balance_baisa).toBe(15_000);
    expect(account.body.account.entry_count).toBe(1);

    // The row is still there, marked, with the reason it stopped counting.
    const entries = await request(app).get(`/api/ledger/customers/${id}/entries`);
    expect(entries.body.total).toBe(2);
    const rows = entries.body.rows as { id: string; voided_at: string | null; void_reason: string | null }[];
    expect(rows.find((r) => r.id === kept.body.entry.id)!.voided_at).toBeNull();
    expect(rows.find((r) => r.id === mistake.body.entry.id)!.void_reason).toBe('Typed a zero too many');
  });

  it('will not void the same entry twice', async () => {
    const id = await makeCustomer();
    const entry = await addEntry(id, charge(1_000));
    const url = `/api/ledger/entries/${entry.body.entry.id}/void`;

    expect((await request(app).post(url).send({ void_reason: 'wrong' })).status).toBe(200);
    expect((await request(app).post(url).send({ void_reason: 'again' })).status).toBe(409);
  });

  it('makes a void say why', async () => {
    const id = await makeCustomer();
    const entry = await addEntry(id, charge(1_000));
    const response = await request(app)
      .post(`/api/ledger/entries/${entry.body.entry.id}/void`)
      .send({});
    expect(response.status).toBe(422);
  });
});

describe('editing an entry', () => {
  it('corrects the wording without touching the money', async () => {
    const id = await makeCustomer();
    const entry = await addEntry(id, charge(15_000));

    const response = await request(app)
      .patch(`/api/ledger/entries/${entry.body.entry.id}`)
      .send({ description: 'Invoice 104 — cement', reference: 'INV-104', amount_baisa: 1 });

    expect(response.status).toBe(200);
    expect(response.body.entry.description).toBe('Invoice 104 — cement');
    // The amount in the request body is ignored, not applied.
    expect(response.body.entry.amount_baisa).toBe(15_000);
  });

  it('refuses to edit a voided entry', async () => {
    const id = await makeCustomer();
    const entry = await addEntry(id, charge(15_000));
    await request(app).post(`/api/ledger/entries/${entry.body.entry.id}/void`).send({ void_reason: 'x' });

    const response = await request(app)
      .patch(`/api/ledger/entries/${entry.body.entry.id}`)
      .send({ description: 'changed' });
    expect(response.status).toBe(409);
  });
});

describe('the statement', () => {
  it('runs the balance from the oldest entry, and shows the newest first', async () => {
    const id = await makeCustomer();
    await addEntry(id, charge(10_000, { entry_date: '2026-09-01', description: 'One' }));
    await addEntry(id, payment(4_000, { entry_date: '2026-09-05', description: 'Two' }));
    await addEntry(id, charge(1_000, { entry_date: '2026-09-09', description: 'Three' }));

    const response = await request(app).get(`/api/ledger/customers/${id}/entries`);
    const rows = response.body.rows as { description: string; balance_after_baisa: number }[];

    expect(rows.map((r) => r.description)).toEqual(['Three', 'Two', 'One']);
    expect(rows.map((r) => r.balance_after_baisa)).toEqual([7_000, 6_000, 10_000]);
  });

  it('carries the running balance across a voided entry unchanged', async () => {
    const id = await makeCustomer();
    await addEntry(id, charge(10_000, { entry_date: '2026-09-01', description: 'One' }));
    const bad = await addEntry(id, charge(99_000, { entry_date: '2026-09-02', description: 'Bad' }));
    await addEntry(id, charge(2_000, { entry_date: '2026-09-03', description: 'Three' }));
    await request(app).post(`/api/ledger/entries/${bad.body.entry.id}/void`).send({ void_reason: 'error' });

    const response = await request(app).get(`/api/ledger/customers/${id}/entries`);
    const rows = response.body.rows as { description: string; balance_after_baisa: number }[];
    const balanceOf = (description: string) => rows.find((r) => r.description === description)!.balance_after_baisa;

    expect(balanceOf('One')).toBe(10_000);
    expect(balanceOf('Bad')).toBe(10_000);
    expect(balanceOf('Three')).toBe(12_000);
  });

  it('keeps the running balance right on the second page', async () => {
    const id = await makeCustomer();
    // Ten charges of 1000, oldest first.
    for (let day = 1; day <= 10; day++) {
      await addEntry(id, charge(1_000, { entry_date: `2026-09-0${day > 9 ? 9 : day}`, description: `Day ${day}` }));
    }

    const page2 = await request(app).get(`/api/ledger/customers/${id}/entries?page=2&page_size=5`);
    const rows = page2.body.rows as { balance_after_baisa: number }[];

    expect(page2.body.total).toBe(10);
    // Page two holds the OLDEST five, so the balance climbs 1000 to 5000 —
    // a figure the client could not have worked out from this page alone.
    expect(rows.map((r) => r.balance_after_baisa)).toEqual([5_000, 4_000, 3_000, 2_000, 1_000]);
  });
});

describe('the ledger list', () => {
  it('shows every customer, including one who has never been charged', async () => {
    const owing = await makeCustomer({ name: 'Owing Customer' });
    await makeCustomer({ name: 'Untouched Customer', email: '' });
    await addEntry(owing, charge(15_000));

    const response = await request(app).get('/api/ledger/customers');
    const rows = response.body.rows as { name: string; balance_baisa: number; entry_count: number }[];

    expect(response.body.total).toBe(2);
    expect(rows.find((r) => r.name === 'Untouched Customer')).toMatchObject({
      balance_baisa: 0,
      entry_count: 0,
    });
  });

  it('puts whoever owes the most at the top', async () => {
    const small = await makeCustomer({ name: 'Small Debt' });
    const big = await makeCustomer({ name: 'Big Debt', email: '' });
    await addEntry(small, charge(5_000));
    await addEntry(big, charge(50_000));

    const response = await request(app).get('/api/ledger/customers');
    expect((response.body.rows as { name: string }[])[0]!.name).toBe('Big Debt');
  });

  it('filters by where the account stands', async () => {
    const owing = await makeCustomer({ name: 'Owes Us' });
    const advance = await makeCustomer({ name: 'Paid Ahead', email: '' });
    const settled = await makeCustomer({ name: 'All Square', email: '' });
    await addEntry(owing, charge(5_000));
    await addEntry(advance, payment(5_000));
    await addEntry(settled, charge(5_000));
    await addEntry(settled, payment(5_000));

    const names = async (standing: string) => {
      const response = await request(app).get(`/api/ledger/customers?standing=${standing}`);
      return (response.body.rows as { name: string }[]).map((r) => r.name);
    };

    expect(await names('OWING')).toEqual(['Owes Us']);
    expect(await names('ADVANCE')).toEqual(['Paid Ahead']);
    expect(await names('SETTLED')).toEqual(['All Square']);
  });

  it('counts the filtered total, not the page', async () => {
    for (let i = 0; i < 7; i++) {
      const id = await makeCustomer({ name: `Customer ${i}`, email: '' });
      await addEntry(id, charge(1_000));
    }

    const response = await request(app).get('/api/ledger/customers?standing=OWING&page_size=3');
    expect(response.body.rows).toHaveLength(3);
    expect(response.body.total).toBe(7);
  });

  it('searches the customer, not the entries', async () => {
    const id = await makeCustomer({ name: 'Ahmed Al Balushi', company: 'Balushi Trading' });
    // A different company too — the default fixture's is "Al Balushi Trading",
    // which would match the search term on its own.
    await makeCustomer({ name: 'Fatma Al Harthy', company: 'Harthy Stores', email: '' });
    await addEntry(id, charge(1_000));

    const response = await request(app).get('/api/ledger/customers?q=balushi');
    expect((response.body.rows as { name: string }[]).map((r) => r.name)).toEqual(['Ahmed Al Balushi']);
  });
});

describe('the summary', () => {
  it('adds up what is owed without netting the advances against it', async () => {
    const owing = await makeCustomer({ name: 'Owes Us' });
    const other = await makeCustomer({ name: 'Also Owes', email: '' });
    const advance = await makeCustomer({ name: 'Paid Ahead', email: '' });
    await addEntry(owing, charge(15_000));
    await addEntry(other, charge(5_000));
    await addEntry(advance, payment(9_000));

    const response = await request(app).get('/api/ledger/summary');

    // 20,000 is collectable; the 9,000 held on account is somebody else's money
    // and hiding it inside a net figure would overstate the position.
    expect(response.body).toMatchObject({
      receivable_baisa: 20_000,
      advance_baisa: 9_000,
      owing_count: 2,
      advance_count: 1,
      settled_count: 0,
    });
  });

  it('answers zeroes for an empty system rather than failing', async () => {
    const response = await request(app).get('/api/ledger/summary');
    expect(response.status).toBe(200);
    expect(response.body.receivable_baisa).toBe(0);
  });
});

describe('deleting a customer who has a ledger', () => {
  it('is refused, and says what to do instead', async () => {
    const id = await makeCustomer();
    await addEntry(id, charge(15_000));

    const response = await request(app).delete(`/api/customers/${id}`);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/void them before deleting/i);
  });

  it('is allowed once the entries are voided', async () => {
    const id = await makeCustomer();
    const entry = await addEntry(id, charge(15_000));
    await request(app).post(`/api/ledger/entries/${entry.body.entry.id}/void`).send({ void_reason: 'closing account' });

    expect((await request(app).delete(`/api/customers/${id}`)).status).toBe(200);
  });
});
