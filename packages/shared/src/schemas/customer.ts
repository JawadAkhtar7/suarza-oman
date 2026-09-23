/**
 * A customer, as every part of the system agrees to see one.
 *
 * The API validates writes with these schemas and the web app builds its form
 * from the same ones, so a field cannot mean two things in two places. When a
 * customer grows a credit limit or a delivery address, it grows here first.
 */

import { z } from 'zod';

/** Kept out of the enum literal union so the UI can iterate over it. */
export const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const customerStatusSchema = z.enum(CUSTOMER_STATUSES);
export type CustomerStatus = z.infer<typeof customerStatusSchema>;

/**
 * Omani numbers are +968 followed by eight digits, but suppliers and walk-in
 * customers carry foreign numbers too, so this stays permissive: digits,
 * spaces and the usual punctuation, long enough to be a real number. Rejecting
 * a legitimate number is worse than storing a slightly untidy one.
 */
const phone = z
  .string()
  .trim()
  .min(6, 'A phone number needs at least 6 digits')
  .max(32)
  .regex(/^[+()\-\s\d]+$/, 'Use digits, spaces, + and - only');

/** Blank means "not given" everywhere; nothing distinguishes '' from absent. */
const optionalText = (max: number) => z.string().trim().max(max).default('');

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Enter the customer name').max(120),
  company: optionalText(120),
  /* Optional, but a typo is still a typo — validated when something is there. */
  email: z.union([z.literal(''), z.string().trim().email('That email does not look right')])
    .default(''),
  phone,
  /** Oman VAT registration number (VATIN), shown on every invoice they get. */
  vat_number: optionalText(32),
  notes: optionalText(1000),
  status: customerStatusSchema.default('ACTIVE'),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/** Every field optional: a PATCH changes what it names and nothing else. */
export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerSchema = createCustomerSchema.extend({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

/**
 * What the list endpoint accepts.
 *
 * `q` searches name, company, phone and email at once: someone looking up a
 * customer has one string in their head — a half-remembered name or the last
 * four digits of a number — and should not have to say which field it is.
 */
export const customerQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  status: z.union([customerStatusSchema, z.literal('ALL')]).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['name', 'created_at', 'updated_at']).default('created_at'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type CustomerQuery = z.infer<typeof customerQuerySchema>;

export interface CustomerPage {
  rows: Customer[];
  total: number;
  page: number;
  page_size: number;
}
