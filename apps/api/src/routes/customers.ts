/**
 * Customers: list, read, create, update, delete.
 *
 * The first entity in the system, and the shape every later one should copy —
 * validate with the shared schema, page on the server, and answer with the same
 * envelope whether there are two customers or twenty thousand.
 */

import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  createCustomerSchema,
  customerQuerySchema,
  updateCustomerSchema,
  type CustomerPage,
} from '@suarza-oman/shared';
import { CustomerModel, toCustomer } from '../models/customer.model.js';
import { LedgerEntryModel } from '../models/ledger-entry.model.js';
import { ApiError } from '../lib/errors.js';
import { handle } from '../lib/async-handler.js';

export const customersRouter: Router = Router();

/**
 * A bad id is a 404, not a 500: it is the same mistake as a missing record.
 *
 * Express 5 types a route param as `string | string[]`, since a pattern can
 * repeat one — so the array case is rejected here rather than coerced.
 */
function requireId(id: unknown): string {
  if (typeof id !== 'string' || !isValidObjectId(id)) throw ApiError.notFound('Customer');
  return id;
}

/**
 * Regex rather than the text index, so a partial word matches: an ERP user
 * types "bal" for "Al Balushi" and expects a hit. Escaped, because a customer
 * search box is not a place to let a user write a pattern.
 */
function searchFilter(q: string) {
  if (!q) return {};
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const like = { $regex: safe, $options: 'i' };
  return { $or: [{ name: like }, { company: like }, { phone: like }, { email: like }] };
}

customersRouter.get(
  '/',
  handle(async (req, res) => {
    const query = customerQuerySchema.parse(req.query);

    const filter = {
      ...searchFilter(query.q),
      ...(query.status === 'ALL' ? {} : { status: query.status }),
    };

    // Counted alongside the page, not derived from it: the table shows "1–25 of
    // 413", and a total inferred from the rows would just say 25.
    const [docs, total] = await Promise.all([
      CustomerModel.find(filter)
        .sort({ [query.sort]: query.dir === 'asc' ? 1 : -1 })
        .skip((query.page - 1) * query.page_size)
        .limit(query.page_size)
        .lean(),
      CustomerModel.countDocuments(filter),
    ]);

    const page: CustomerPage = {
      rows: docs.map(toCustomer),
      total,
      page: query.page,
      page_size: query.page_size,
    };
    res.json(page);
  }),
);

customersRouter.get(
  '/:id',
  handle(async (req, res) => {
    const doc = await CustomerModel.findById(requireId(req.params.id)).lean();
    if (!doc) throw ApiError.notFound('Customer');
    res.json({ customer: toCustomer(doc) });
  }),
);

customersRouter.post(
  '/',
  handle(async (req, res) => {
    const input = createCustomerSchema.parse(req.body);
    const doc = await CustomerModel.create(input);
    res.status(201).json({ customer: toCustomer(doc.toObject()) });
  }),
);

customersRouter.patch(
  '/:id',
  handle(async (req, res) => {
    const input = updateCustomerSchema.parse(req.body);
    const doc = await CustomerModel.findByIdAndUpdate(requireId(req.params.id), input, {
      new: true,
      runValidators: true,
    }).lean();
    if (!doc) throw ApiError.notFound('Customer');
    res.json({ customer: toCustomer(doc) });
  }),
);

customersRouter.delete(
  '/:id',
  handle(async (req, res) => {
    const id = requireId(req.params.id);

    /* A customer with a ledger history is not free to delete: the entries would
       be left pointing at nobody, and a balance somebody is owed would vanish
       without a trace. Void the entries first — that leaves a record of why. */
    const entries = await LedgerEntryModel.countDocuments({ customer_id: id, voided_at: null });
    if (entries > 0) {
      throw ApiError.conflict(
        `This customer has ${entries} ledger ${entries === 1 ? 'entry' : 'entries'}. Void them before deleting the customer.`,
      );
    }

    const doc = await CustomerModel.findByIdAndDelete(id).lean();
    if (!doc) throw ApiError.notFound('Customer');
    // The deleted record comes back so the UI can offer an undo later without
    // having had to hold a copy of something it was told to forget.
    res.json({ customer: toCustomer(doc) });
  }),
);
