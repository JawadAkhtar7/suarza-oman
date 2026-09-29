/**
 * Employees: the staff list, and what it costs to run.
 */

import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  createEmployeeSchema,
  employeeQuerySchema,
  monthlyCostBaisa,
  updateEmployeeSchema,
  type EmployeePage,
  type EmployeeSummary,
} from '@suarza-oman/shared';
import { EmployeeModel, toEmployee } from '../models/employee.model.js';
import { ApiError } from '../lib/errors.js';
import { handle } from '../lib/async-handler.js';

export const employeesRouter: Router = Router();

function requireId(id: unknown): string {
  if (typeof id !== 'string' || !isValidObjectId(id)) throw ApiError.notFound('Employee');
  return id;
}

function searchFilter(q: string) {
  if (!q) return {};
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const like = { $regex: safe, $options: 'i' };
  return {
    $or: [
      { name: like },
      { code: like },
      { designation: like },
      { department: like },
      { phone: like },
      { civil_number: like },
    ],
  };
}

/** A duplicate staff number is the user's mistake — say which field. */
function rethrowDuplicate(error: unknown): never {
  if ((error as { code?: number }).code === 11000) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Check the highlighted fields', {
      code: 'Another employee already has this staff number',
    });
  }
  throw error;
}

employeesRouter.get(
  '/',
  handle(async (req, res) => {
    const query = employeeQuerySchema.parse(req.query);
    const filter = {
      ...searchFilter(query.q),
      ...(query.department ? { department: query.department } : {}),
      ...(query.status === 'ALL' ? {} : { status: query.status }),
    };

    const [docs, total] = await Promise.all([
      EmployeeModel.find(filter)
        .collation({ locale: 'en', strength: 2 })
        .sort({ [query.sort]: query.dir === 'asc' ? 1 : -1 })
        .skip((query.page - 1) * query.page_size)
        .limit(query.page_size)
        .lean(),
      EmployeeModel.countDocuments(filter),
    ]);

    const page: EmployeePage = {
      rows: docs.map(toEmployee),
      total,
      page: query.page,
      page_size: query.page_size,
    };
    res.json(page);
  }),
);

/** The departments already in use, so the form can offer them. */
employeesRouter.get(
  '/departments',
  handle(async (_req, res) => {
    const departments = await EmployeeModel.distinct('department', { department: { $gt: '' } });
    res.json({ departments: departments.sort() });
  }),
);

employeesRouter.get(
  '/summary',
  handle(async (_req, res) => {
    const docs = await EmployeeModel.find({}, 'status salary_baisa pay_frequency').lean();

    /* Worked out here rather than in an aggregation: normalising a daily or
       hourly rate to a month is a rule about the business, and it lives in one
       function in @suarza-oman/shared so the screens agree with the API. */
    const summary: EmployeeSummary = {
      total_employees: docs.length,
      active: docs.filter((d) => d.status === 'ACTIVE').length,
      on_leave: docs.filter((d) => d.status === 'ON_LEAVE').length,
      monthly_payroll_baisa: docs
        .filter((d) => d.status === 'ACTIVE')
        .reduce(
          (sum, d) =>
            sum + monthlyCostBaisa(d.salary_baisa ?? 0, (d.pay_frequency ?? 'MONTHLY') as 'MONTHLY'),
          0,
        ),
    };
    res.json(summary);
  }),
);

employeesRouter.get(
  '/:id',
  handle(async (req, res) => {
    const doc = await EmployeeModel.findById(requireId(req.params.id)).lean();
    if (!doc) throw ApiError.notFound('Employee');
    res.json({ employee: toEmployee(doc) });
  }),
);

employeesRouter.post(
  '/',
  handle(async (req, res) => {
    const input = createEmployeeSchema.parse(req.body);
    try {
      const doc = await EmployeeModel.create(input);
      res.status(201).json({ employee: toEmployee(doc.toObject()) });
    } catch (error) {
      rethrowDuplicate(error);
    }
  }),
);

employeesRouter.patch(
  '/:id',
  handle(async (req, res) => {
    const input = updateEmployeeSchema.parse(req.body);
    try {
      const doc = await EmployeeModel.findByIdAndUpdate(requireId(req.params.id), input, {
        new: true,
        runValidators: true,
      }).lean();
      if (!doc) throw ApiError.notFound('Employee');
      res.json({ employee: toEmployee(doc) });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      rethrowDuplicate(error);
    }
  }),
);

employeesRouter.delete(
  '/:id',
  handle(async (req, res) => {
    const doc = await EmployeeModel.findByIdAndDelete(requireId(req.params.id)).lean();
    if (!doc) throw ApiError.notFound('Employee');
    res.json({ employee: toEmployee(doc) });
  }),
);
