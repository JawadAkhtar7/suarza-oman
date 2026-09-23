import { describe, expect, it } from 'vitest';
import {
  createCustomerSchema,
  customerQuerySchema,
  updateCustomerSchema,
} from '../src/schemas/customer.js';

describe('createCustomerSchema', () => {
  const valid = { name: 'Ahmed Al Balushi', phone: '+968 9123 4567' };

  it('needs only a name and a phone number', () => {
    const parsed = createCustomerSchema.parse(valid);
    // Everything optional lands as '', not undefined: one empty value, so no
    // screen has to decide what a missing company looks like.
    expect(parsed).toMatchObject({ company: '', email: '', vat_number: '', status: 'ACTIVE' });
  });

  it('trims what people paste in', () => {
    const parsed = createCustomerSchema.parse({ ...valid, name: '  Ahmed  ', company: ' Suarza ' });
    expect(parsed.name).toBe('Ahmed');
    expect(parsed.company).toBe('Suarza');
  });

  it('rejects a name too short to be one', () => {
    expect(createCustomerSchema.safeParse({ ...valid, name: 'A' }).success).toBe(false);
  });

  it('accepts a blank email but not a broken one', () => {
    expect(createCustomerSchema.parse({ ...valid, email: '' }).email).toBe('');
    expect(createCustomerSchema.safeParse({ ...valid, email: 'ahmed@' }).success).toBe(false);
    expect(createCustomerSchema.parse({ ...valid, email: 'a@b.om' }).email).toBe('a@b.om');
  });

  it('takes foreign numbers, not just Omani ones', () => {
    for (const number of ['+968 9123 4567', '92123 4567', '+91 (22) 1234-5678']) {
      expect(createCustomerSchema.safeParse({ ...valid, phone: number }).success).toBe(true);
    }
    expect(createCustomerSchema.safeParse({ ...valid, phone: 'call me' }).success).toBe(false);
  });
});

describe('updateCustomerSchema', () => {
  it('changes only what it names', () => {
    const parsed = updateCustomerSchema.parse({ phone: '+968 9000 0000' });
    expect(parsed).toEqual({ phone: '+968 9000 0000' });
  });
});

describe('customerQuerySchema', () => {
  it('fills in a sensible page for a bare request', () => {
    expect(customerQuerySchema.parse({})).toEqual({
      q: '',
      status: 'ALL',
      page: 1,
      page_size: 25,
      sort: 'created_at',
      dir: 'desc',
    });
  });

  it('coerces the numbers a query string arrives as', () => {
    const parsed = customerQuerySchema.parse({ page: '3', page_size: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.page_size).toBe(50);
  });

  it('refuses a page size that would pull the whole table', () => {
    expect(customerQuerySchema.safeParse({ page_size: '5000' }).success).toBe(false);
  });
});
