import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, clearDb, customerInput, startTestDb, stopTestDb } from './helpers.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearDb);

async function create(overrides: Record<string, unknown> = {}) {
  const response = await request(app).post('/api/customers').send(customerInput(overrides));
  expect(response.status).toBe(201);
  return response.body.customer as { id: string; name: string };
}

describe('POST /api/customers', () => {
  it('creates one and gives back what was stored', async () => {
    const response = await request(app).post('/api/customers').send(customerInput());

    expect(response.status).toBe(201);
    expect(response.body.customer).toMatchObject({
      name: 'Ahmed Al Balushi',
      company: 'Al Balushi Trading',
      status: 'ACTIVE',
    });
    // The id the UI will route by, and the timestamps it sorts on.
    expect(response.body.customer.id).toMatch(/^[a-f0-9]{24}$/);
    expect(response.body.customer.created_at).toBeTruthy();
  });

  it('fills the optional fields with blanks rather than leaving them out', async () => {
    const response = await request(app)
      .post('/api/customers')
      .send({ name: 'Walk-in', phone: '92000000' });

    expect(response.status).toBe(201);
    expect(response.body.customer).toMatchObject({ company: '', email: '', vat_number: '' });
  });

  it('names the field that is wrong, so the form can point at it', async () => {
    const response = await request(app)
      .post('/api/customers')
      .send({ name: 'A', phone: 'call me' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(response.body.error.details)).toEqual(
      expect.arrayContaining(['name', 'phone']),
    );
  });
});

describe('GET /api/customers', () => {
  it('pages, and counts beyond the page', async () => {
    for (let i = 0; i < 7; i++) await create({ name: `Customer ${i}`, email: '' });

    const response = await request(app).get('/api/customers?page=2&page_size=3');

    expect(response.status).toBe(200);
    expect(response.body.rows).toHaveLength(3);
    // The table's "4–6 of 7" comes from here, not from the row count.
    expect(response.body.total).toBe(7);
    expect(response.body.page).toBe(2);
  });

  it('finds a customer by part of any field they might be remembered by', async () => {
    await create({ name: 'Ahmed Al Balushi', company: 'Al Balushi Trading', phone: '+968 9111 2222' });
    await create({ name: 'Fatma Al Harthy', company: 'Harthy Stores', phone: '+968 9333 4444', email: '' });

    for (const [term, expected] of [
      ['bal', 'Ahmed Al Balushi'],
      ['harthy', 'Fatma Al Harthy'],
      ['9333', 'Fatma Al Harthy'],
      ['albalushi.om', 'Ahmed Al Balushi'],
    ] as const) {
      const response = await request(app).get(`/api/customers?q=${encodeURIComponent(term)}`);
      expect(response.body.rows.map((r: { name: string }) => r.name), term).toEqual([expected]);
    }
  });

  it('treats a search term as text, not as a pattern', async () => {
    await create({ name: 'Ahmed Al Balushi' });
    // An unescaped '(' would make this an invalid regex and a 500.
    const response = await request(app).get('/api/customers?q=%28');
    expect(response.status).toBe(200);
    expect(response.body.rows).toHaveLength(0);
  });

  it('filters by status', async () => {
    await create({ name: 'Active one' });
    await create({ name: 'Old one', status: 'INACTIVE', email: '' });

    const active = await request(app).get('/api/customers?status=ACTIVE');
    expect(active.body.rows.map((r: { name: string }) => r.name)).toEqual(['Active one']);

    const all = await request(app).get('/api/customers');
    expect(all.body.total).toBe(2);
  });

  it('refuses a page size that would pull the whole collection', async () => {
    const response = await request(app).get('/api/customers?page_size=100000');
    expect(response.status).toBe(422);
  });
});

describe('PATCH /api/customers/:id', () => {
  it('changes only the fields it names', async () => {
    const created = await create();

    const response = await request(app)
      .patch(`/api/customers/${created.id}`)
      .send({ phone: '+968 9000 0000' });

    expect(response.status).toBe(200);
    expect(response.body.customer.phone).toBe('+968 9000 0000');
    expect(response.body.customer.company).toBe('Al Balushi Trading');
  });

  it('rejects an edit that would make the record invalid', async () => {
    const created = await create();
    const response = await request(app)
      .patch(`/api/customers/${created.id}`)
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(422);
  });

  it('is a 404 for an id that is not a customer, and for one that is not an id', async () => {
    expect((await request(app).patch('/api/customers/507f1f77bcf86cd799439011').send({})).status).toBe(404);
    // A malformed id is the same mistake as a missing one — never a 500.
    expect((await request(app).patch('/api/customers/nonsense').send({})).status).toBe(404);
  });
});

describe('DELETE /api/customers/:id', () => {
  it('removes the customer and says which one went', async () => {
    const created = await create();

    const response = await request(app).delete(`/api/customers/${created.id}`);
    expect(response.status).toBe(200);
    expect(response.body.customer.name).toBe('Ahmed Al Balushi');

    expect((await request(app).get(`/api/customers/${created.id}`)).status).toBe(404);
    expect((await request(app).get('/api/customers')).body.total).toBe(0);
  });

  it('is a 404 the second time', async () => {
    const created = await create();
    await request(app).delete(`/api/customers/${created.id}`);
    expect((await request(app).delete(`/api/customers/${created.id}`)).status).toBe(404);
  });
});

describe('the API envelope', () => {
  it('answers an unknown route in the same shape as any other error', async () => {
    const response = await request(app).get('/api/nothing-here');
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('has a health check that does not need the database', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

describe('the new customer fields', () => {
  it('defaults pay mode to cash and the vendor flag to off', async () => {
    const response = await request(app).post('/api/customers').send(customerInput());
    expect(response.body.customer).toMatchObject({
      pay_mode: 'CASH',
      is_vendor: false,
      previous_year_balance_baisa: 0,
    });
  });

  it("keeps last year's figure as a reference without touching the ledger", async () => {
    const created = await request(app)
      .post('/api/customers')
      .send(
        customerInput({
          previous_year_balance_baisa: 250_000,
          previous_year_balance_direction: 'CREDIT',
        }),
      );

    expect(created.body.customer).toMatchObject({
      previous_year_balance_baisa: 250_000,
      previous_year_balance_direction: 'CREDIT',
    });

    // The ledger is untouched: last year's closing and this year's opening are
    // the same money, and posting both would count it twice.
    const account = await request(app).get(`/api/ledger/customers/${created.body.customer.id}`);
    expect(account.body.account.balance_baisa).toBe(0);
    expect(account.body.account.entry_count).toBe(0);
  });

  it('turns an opening balance into a ledger entry', async () => {
    const created = await request(app)
      .post('/api/customers')
      .send(customerInput({ opening_balance_baisa: 150_000, opening_balance_direction: 'DEBIT' }));

    const id = created.body.customer.id;
    const account = await request(app).get(`/api/ledger/customers/${id}`);
    expect(account.body.account.balance_baisa).toBe(150_000);

    const entries = await request(app).get(`/api/ledger/customers/${id}/entries`);
    expect(entries.body.rows[0]).toMatchObject({
      kind: 'OPENING',
      direction: 'DEBIT',
      amount_baisa: 150_000,
      description: 'Opening balance',
    });
  });

  it('opens on the credit side when the customer paid ahead', async () => {
    const created = await request(app)
      .post('/api/customers')
      .send(customerInput({ opening_balance_baisa: 75_000, opening_balance_direction: 'CREDIT' }));

    const account = await request(app).get(`/api/ledger/customers/${created.body.customer.id}`);
    expect(account.body.account.balance_baisa).toBe(-75_000);
  });

  it('writes no entry when the opening balance is zero', async () => {
    const created = await request(app).post('/api/customers').send(customerInput());
    const entries = await request(app).get(`/api/ledger/customers/${created.body.customer.id}/entries`);
    expect(entries.body.total).toBe(0);
  });
});

describe('vendors', () => {
  it('lists only the customers marked as vendors', async () => {
    await request(app).post('/api/customers').send(customerInput({ name: 'Plain Customer' }));
    await request(app)
      .post('/api/customers')
      .send(customerInput({ name: 'Also A Vendor', email: '', is_vendor: true }));

    const vendors = await request(app).get('/api/customers?vendor=true');
    expect(vendors.body.rows.map((r: { name: string }) => r.name)).toEqual(['Also A Vendor']);

    // The customers page sets no flag and still sees everyone.
    const all = await request(app).get('/api/customers');
    expect(all.body.total).toBe(2);
  });

  it('can be turned on and off after the fact', async () => {
    const created = await request(app).post('/api/customers').send(customerInput());
    await request(app).patch(`/api/customers/${created.body.customer.id}`).send({ is_vendor: true });
    expect((await request(app).get('/api/customers?vendor=true')).body.total).toBe(1);

    await request(app).patch(`/api/customers/${created.body.customer.id}`).send({ is_vendor: false });
    expect((await request(app).get('/api/customers?vendor=true')).body.total).toBe(0);
  });
});

describe('starting up before the database is ready', () => {
  it('answers the health check straight away', async () => {
    // Registered before the wait, so a platform health check never blocks on
    // a database that is still connecting.
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
  });

  it('answers a data request with a 503 rather than hanging forever', async () => {
    const express = (await import('express')).default;
    const { waitForDatabase } = await import('../src/lib/db-ready.js');

    // A stub connection that never connects, and a short timeout standing in
    // for the real 45 seconds. Nothing global is touched, so the suite's own
    // database is unaffected.
    const stuck = { readyState: 0, once: () => undefined, off: () => undefined };
    const probe = express();
    probe.use(waitForDatabase(50, stuck));
    probe.get('/anything', (_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(probe).get('/anything');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('lets requests through once the connection is up', async () => {
    // The suite's own connection is live, so this is the normal path.
    expect((await request(app).get('/api/customers')).status).toBe(200);
  });
});
