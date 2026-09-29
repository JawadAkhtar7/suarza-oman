import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, startTestDb, stopTestDb } from './helpers.js';
import { EmployeeModel, syncEmployeeIndexes } from '../src/models/employee.model.js';

beforeAll(async () => {
  await startTestDb();
  await syncEmployeeIndexes();
});
afterAll(stopTestDb);
afterEach(async () => {
  await EmployeeModel.deleteMany({});
});

const employee = (overrides: Record<string, unknown> = {}) => ({
  name: 'Salim Al Hinai',
  code: 'E001',
  designation: 'Driver',
  department: 'Logistics',
  phone: '+968 9123 4567',
  salary_baisa: 350_000,
  ...overrides,
});

const create = async (overrides: Record<string, unknown> = {}) => {
  const response = await request(app).post('/api/employees').send(employee(overrides));
  expect(response.status).toBe(201);
  return response.body.employee as { id: string; name: string };
};

describe('adding an employee', () => {
  it('needs a name and a phone number, and fills in the rest', async () => {
    const response = await request(app)
      .post('/api/employees')
      .send({ name: 'Ahmed Said', phone: '92000000' });

    expect(response.status).toBe(201);
    expect(response.body.employee).toMatchObject({
      designation: '',
      pay_frequency: 'MONTHLY',
      status: 'ACTIVE',
      salary_baisa: 0,
      joined_on: null,
    });
  });

  it('refuses a record with no way to contact them', async () => {
    const response = await request(app).post('/api/employees').send({ name: 'Ahmed Said' });
    expect(response.status).toBe(422);
    expect(Object.keys(response.body.error.details)).toContain('phone');
  });

  it('refuses a second employee with the same staff number', async () => {
    await create();
    const response = await request(app).post('/api/employees').send(employee({ name: 'Other' }));
    expect(response.status).toBe(422);
    expect(response.body.error.details.code).toMatch(/already has this staff number/i);
  });

  it('lets any number of employees have no staff number', async () => {
    await create({ code: '' });
    expect((await request(app).post('/api/employees').send(employee({ name: 'Two', code: '' }))).status).toBe(201);
  });

  it('keeps the joining date it was given', async () => {
    const created = await request(app)
      .post('/api/employees')
      .send(employee({ joined_on: '2024-03-15' }));
    expect(created.body.employee.joined_on).toContain('2024-03-15');
  });
});

describe('the staff list', () => {
  it('searches name, staff number, role, department and phone together', async () => {
    await create({ name: 'Salim Al Hinai', code: 'E001', designation: 'Driver', department: 'Logistics' });
    await create({ name: 'Maryam Al Balushi', code: 'E002', designation: 'Accountant', department: 'Finance', phone: '+968 9555 1234' });

    for (const [term, expected] of [
      ['salim', 'Salim Al Hinai'],
      ['E002', 'Maryam Al Balushi'],
      ['account', 'Maryam Al Balushi'],
      ['logistics', 'Salim Al Hinai'],
      ['9555', 'Maryam Al Balushi'],
    ] as const) {
      const response = await request(app).get(`/api/employees?q=${encodeURIComponent(term)}`);
      expect((response.body.rows as { name: string }[]).map((r) => r.name), term).toEqual([expected]);
    }
  });

  it('filters by status', async () => {
    await create({ name: 'Working', code: 'A' });
    await create({ name: 'Gone', code: 'B', status: 'LEFT' });

    const active = await request(app).get('/api/employees?status=ACTIVE');
    expect((active.body.rows as { name: string }[]).map((r) => r.name)).toEqual(['Working']);
  });

  it('counts the filtered total, not the page', async () => {
    for (let i = 0; i < 7; i++) await create({ name: `Person ${i}`, code: `P${i}` });
    const response = await request(app).get('/api/employees?page_size=3');
    expect(response.body.rows).toHaveLength(3);
    expect(response.body.total).toBe(7);
  });

  it('offers the departments already in use', async () => {
    await create({ code: 'D1', department: 'Logistics' });
    await create({ name: 'Two', code: 'D2', department: 'Finance' });
    await create({ name: 'Three', code: 'D3', department: '' });

    const response = await request(app).get('/api/employees/departments');
    expect(response.body.departments).toEqual(['Finance', 'Logistics']);
  });
});

describe('the summary', () => {
  it('adds up what the active staff cost each month', async () => {
    await create({ name: 'Monthly', code: 'M', salary_baisa: 400_000, pay_frequency: 'MONTHLY' });
    await create({ name: 'Daily', code: 'D', salary_baisa: 10_000, pay_frequency: 'DAILY' });
    await create({ name: 'Left', code: 'L', salary_baisa: 900_000, status: 'LEFT' });

    const response = await request(app).get('/api/employees/summary');

    // 400.000 + (10.000 x 26 working days) = 660.000 OMR. The one who left is
    // not a cost, however much they used to be paid.
    expect(response.body).toMatchObject({
      total_employees: 3,
      active: 2,
      monthly_payroll_baisa: 660_000,
    });
  });

  it('answers zeroes for an empty staff list', async () => {
    const response = await request(app).get('/api/employees/summary');
    expect(response.body.monthly_payroll_baisa).toBe(0);
  });
});

describe('editing and removing', () => {
  it('changes only what it names', async () => {
    const created = await create();
    const response = await request(app)
      .patch(`/api/employees/${created.id}`)
      .send({ status: 'ON_LEAVE' });

    expect(response.body.employee).toMatchObject({ status: 'ON_LEAVE', designation: 'Driver' });
  });

  it('is a 404 for an id that is not an employee, and for one that is not an id', async () => {
    expect((await request(app).patch('/api/employees/507f1f77bcf86cd799439011').send({})).status).toBe(404);
    expect((await request(app).delete('/api/employees/nonsense')).status).toBe(404);
  });

  it('deletes', async () => {
    const created = await create();
    expect((await request(app).delete(`/api/employees/${created.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/employees/${created.id}`)).status).toBe(404);
  });
});
