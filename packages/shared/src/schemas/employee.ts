/**
 * Employees.
 *
 * A staff record, not a payroll engine: who works here, how to reach them, what
 * they are paid and whether they are still with us. Payroll runs — advances,
 * deductions, payslips — are their own module and will reference these records
 * rather than duplicating them.
 */

import { z } from 'zod';

export const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'LEFT'] as const;
export const employeeStatusSchema = z.enum(EMPLOYEE_STATUSES);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'Active',
  ON_LEAVE: 'On leave',
  LEFT: 'Left',
};

/** How someone is paid. Oman pays most staff monthly. */
export const PAY_FREQUENCIES = ['MONTHLY', 'DAILY', 'HOURLY'] as const;
export const payFrequencySchema = z.enum(PAY_FREQUENCIES);
export type PayFrequency = z.infer<typeof payFrequencySchema>;

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  MONTHLY: 'Per month',
  DAILY: 'Per day',
  HOURLY: 'Per hour',
};

const optionalText = (max: number) => z.string().trim().max(max).default('');

const phone = z
  .string()
  .trim()
  .min(6, 'A phone number needs at least 6 digits')
  .max(32)
  .regex(/^[+()\-\s\d]+$/, 'Use digits, spaces, + and - only');

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(2, 'Enter the employee name').max(140),
  /** Staff number as written on the file. Optional, unique when given. */
  code: z.string().trim().max(40).default(''),
  /** What they do — driver, storekeeper, accountant. Free text on purpose. */
  designation: optionalText(80),
  department: optionalText(80),

  phone,
  email: z.union([z.literal(''), z.string().trim().email('That email does not look right')]).default(''),
  /** Oman civil number, or a passport number for anyone without one yet. */
  civil_number: optionalText(40),
  nationality: optionalText(60),

  /** Whole baisa, at the frequency below. Zero means "not recorded". */
  salary_baisa: z.number().int().min(0).max(9_000_000_000).default(0),
  pay_frequency: payFrequencySchema.default('MONTHLY'),

  joined_on: z.coerce.date().optional(),
  status: employeeStatusSchema.default('ACTIVE'),
  notes: optionalText(1000),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial();
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export interface Employee {
  id: string;
  name: string;
  code: string;
  designation: string;
  department: string;
  phone: string;
  email: string;
  civil_number: string;
  nationality: string;
  salary_baisa: number;
  pay_frequency: PayFrequency;
  joined_on: string | null;
  status: EmployeeStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const employeeQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  department: z.string().trim().max(80).default(''),
  status: z.union([employeeStatusSchema, z.literal('ALL')]).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['name', 'joined_on', 'created_at']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;

export interface EmployeePage {
  rows: Employee[];
  total: number;
  page: number;
  page_size: number;
}

export interface EmployeeSummary {
  total_employees: number;
  active: number;
  on_leave: number;
  /** What the active staff cost per month, normalised from their frequency. */
  monthly_payroll_baisa: number;
}

/**
 * A daily or hourly rate expressed as a month, so one payroll figure can be
 * added up. Rounded because these are estimates by nature: 26 working days,
 * 8 hours each, is the convention used across the Gulf.
 */
export function monthlyCostBaisa(salaryBaisa: number, frequency: PayFrequency): number {
  if (frequency === 'MONTHLY') return salaryBaisa;
  if (frequency === 'DAILY') return Math.round(salaryBaisa * 26);
  return Math.round(salaryBaisa * 26 * 8);
}

/** Whole years and months since joining; null when the date is unknown. */
export function serviceLength(joinedOn: string | null, now = new Date()): string | null {
  if (!joinedOn) return null;
  const start = new Date(joinedOn);
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return null;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return rest === 1 ? '1 month' : `${rest} months`;
  if (rest === 0) return years === 1 ? '1 year' : `${years} years`;
  return `${years}y ${rest}m`;
}
