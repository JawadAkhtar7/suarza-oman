/**
 * The staff list. Storage concerns only — what a valid employee is lives in
 * @suarza-oman/shared, and every write passes through that schema first.
 */

import { Schema, model, type InferSchemaType, type Model } from 'mongoose';
import { EMPLOYEE_STATUSES, PAY_FREQUENCIES, type Employee } from '@suarza-oman/shared';

const employeeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    code: { type: String, default: '', trim: true, uppercase: true, maxlength: 40 },
    designation: { type: String, default: '', trim: true, maxlength: 80 },
    department: { type: String, default: '', trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 32 },
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 160 },
    civil_number: { type: String, default: '', trim: true, maxlength: 40 },
    nationality: { type: String, default: '', trim: true, maxlength: 60 },
    salary_baisa: { type: Number, default: 0, min: 0 },
    pay_frequency: { type: String, enum: PAY_FREQUENCIES, default: 'MONTHLY' },
    joined_on: { type: Date, default: null },
    status: { type: String, enum: EMPLOYEE_STATUSES, default: 'ACTIVE', index: true },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'employees',
    autoIndex: false,
  },
);

/* Partial, not sparse: a staff number is optional and everyone without one
   stores '', which a sparse index would happily let collide. */
employeeSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $gt: '' } } });
employeeSchema.index({ name: 1 }, { collation: { locale: 'en', strength: 2 } });
employeeSchema.index({ department: 1 });

export type EmployeeDoc = InferSchemaType<typeof employeeSchema>;

export const EmployeeModel: Model<EmployeeDoc> = model<EmployeeDoc>('Employee', employeeSchema);

export function toEmployee(
  doc: EmployeeDoc & { _id: unknown; created_at?: Date; updated_at?: Date },
): Employee {
  return {
    id: String(doc._id),
    name: doc.name,
    code: doc.code ?? '',
    designation: doc.designation ?? '',
    department: doc.department ?? '',
    phone: doc.phone,
    email: doc.email ?? '',
    civil_number: doc.civil_number ?? '',
    nationality: doc.nationality ?? '',
    salary_baisa: doc.salary_baisa ?? 0,
    pay_frequency: doc.pay_frequency as Employee['pay_frequency'],
    joined_on: doc.joined_on ? doc.joined_on.toISOString() : null,
    status: doc.status as Employee['status'],
    notes: doc.notes ?? '',
    created_at: (doc.created_at ?? new Date()).toISOString(),
    updated_at: (doc.updated_at ?? new Date()).toISOString(),
  };
}

export async function syncEmployeeIndexes(): Promise<void> {
  await EmployeeModel.syncIndexes();
}
