/**
 * The ledger: one account per customer, and the entries that make it up.
 *
 * Balances are aggregated on every read rather than kept in a column. That is a
 * deliberate trade of a little query time for the one property that matters in
 * an account: the total is always exactly the rows, because it IS the rows.
 */

import { Router } from 'express';
import { Types, isValidObjectId, type PipelineStage } from 'mongoose';
import {
  createLedgerEntrySchema,
  ledgerCustomerQuerySchema,
  ledgerEntryQuerySchema,
  updateLedgerEntrySchema,
  voidLedgerEntrySchema,
  type LedgerCustomerPage,
  type LedgerCustomerRow,
  type LedgerEntryPage,
  type LedgerSummary,
} from '@suarza-oman/shared';
import { CustomerModel, toCustomer } from '../models/customer.model.js';
import { LedgerEntryModel, liveEntriesFilter, toLedgerEntry } from '../models/ledger-entry.model.js';
import { ApiError } from '../lib/errors.js';
import { handle } from '../lib/async-handler.js';

export const ledgerRouter: Router = Router();

function requireId(id: unknown, what = 'Customer'): string {
  if (typeof id !== 'string' || !isValidObjectId(id)) throw ApiError.notFound(what);
  return id;
}

/**
 * Customer totals, as a pipeline fragment.
 *
 * `$lookup` with a sub-pipeline rather than one big `$group` over entries: the
 * list is a list of CUSTOMERS, including the ones who have never been charged
 * anything. Grouping entries would silently drop every empty account.
 */
const TOTALS_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      from: 'ledger_entries',
      let: { customerId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$customer_id', '$$customerId'] }, voided_at: null } },
        {
          $group: {
            _id: null,
            charged: {
              $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount_baisa', 0] },
            },
            paid: {
              $sum: { $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount_baisa', 0] },
            },
            entry_count: { $sum: 1 },
            last_entry_at: { $max: '$entry_date' },
          },
        },
      ],
      as: 'totals',
    },
  },
  {
    $addFields: {
      charged_baisa: { $ifNull: [{ $first: '$totals.charged' }, 0] },
      paid_baisa: { $ifNull: [{ $first: '$totals.paid' }, 0] },
      entry_count: { $ifNull: [{ $first: '$totals.entry_count' }, 0] },
      last_entry_at: { $first: '$totals.last_entry_at' },
    },
  },
  { $addFields: { balance_baisa: { $subtract: ['$charged_baisa', '$paid_baisa'] } } },
];

/** Balance is derived, so a standing filter can only be applied after the sums. */
function standingMatch(standing: string): PipelineStage[] {
  switch (standing) {
    case 'OWING':
      return [{ $match: { balance_baisa: { $gt: 0 } } }];
    case 'ADVANCE':
      return [{ $match: { balance_baisa: { $lt: 0 } } }];
    case 'SETTLED':
      return [{ $match: { balance_baisa: 0 } }];
    default:
      return [];
  }
}

function searchMatch(q: string): PipelineStage[] {
  if (!q) return [];
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const like = { $regex: safe, $options: 'i' };
  return [{ $match: { $or: [{ name: like }, { company: like }, { phone: like }] } }];
}

ledgerRouter.get(
  '/summary',
  handle(async (_req, res) => {
    const [totals] = await CustomerModel.aggregate([
      ...TOTALS_LOOKUP,
      {
        $group: {
          _id: null,
          // Receivable counts only the accounts in debit: netting the advances
          // off would understate what is actually out there to collect.
          receivable_baisa: {
            $sum: { $cond: [{ $gt: ['$balance_baisa', 0] }, '$balance_baisa', 0] },
          },
          advance_baisa: {
            $sum: { $cond: [{ $lt: ['$balance_baisa', 0] }, { $abs: '$balance_baisa' }, 0] },
          },
          owing_count: { $sum: { $cond: [{ $gt: ['$balance_baisa', 0] }, 1, 0] } },
          advance_count: { $sum: { $cond: [{ $lt: ['$balance_baisa', 0] }, 1, 0] } },
          settled_count: { $sum: { $cond: [{ $eq: ['$balance_baisa', 0] }, 1, 0] } },
        },
      },
    ]);

    const summary: LedgerSummary = {
      receivable_baisa: totals?.receivable_baisa ?? 0,
      advance_baisa: totals?.advance_baisa ?? 0,
      owing_count: totals?.owing_count ?? 0,
      advance_count: totals?.advance_count ?? 0,
      settled_count: totals?.settled_count ?? 0,
    };
    res.json(summary);
  }),
);

ledgerRouter.get(
  '/customers',
  handle(async (req, res) => {
    const query = ledgerCustomerQuerySchema.parse(req.query);
    const sortField = query.sort === 'name' ? 'name' : `${query.sort}_baisa`;
    const sortKey = query.sort === 'last_entry_at' ? 'last_entry_at' : sortField;

    // $facet so the filtered count and the page come from one pass; counting
    // separately would mean running the same lookup twice.
    const [result] = await CustomerModel.aggregate([
      ...searchMatch(query.q),
      ...TOTALS_LOOKUP,
      ...standingMatch(query.standing),
      {
        $facet: {
          rows: [
            { $sort: { [sortKey]: query.dir === 'asc' ? 1 : -1, _id: 1 } },
            { $skip: (query.page - 1) * query.page_size },
            { $limit: query.page_size },
          ],
          count: [{ $count: 'total' }],
        },
      },
    ]);

    const rows: LedgerCustomerRow[] = (result?.rows ?? []).map(
      (row: Record<string, unknown>): LedgerCustomerRow => ({
        customer_id: String(row['_id']),
        name: String(row['name'] ?? ''),
        company: String(row['company'] ?? ''),
        phone: String(row['phone'] ?? ''),
        charged_baisa: Number(row['charged_baisa'] ?? 0),
        paid_baisa: Number(row['paid_baisa'] ?? 0),
        balance_baisa: Number(row['balance_baisa'] ?? 0),
        entry_count: Number(row['entry_count'] ?? 0),
        last_entry_at: row['last_entry_at'] ? new Date(row['last_entry_at'] as string).toISOString() : null,
      }),
    );

    const page: LedgerCustomerPage = {
      rows,
      total: result?.count?.[0]?.total ?? 0,
      page: query.page,
      page_size: query.page_size,
    };
    res.json(page);
  }),
);

/** One account: who it belongs to, and where it stands. */
ledgerRouter.get(
  '/customers/:id',
  handle(async (req, res) => {
    const id = requireId(req.params.id);
    const customer = await CustomerModel.findById(id).lean();
    if (!customer) throw ApiError.notFound('Customer');

    const [totals] = await LedgerEntryModel.aggregate([
      { $match: liveEntriesFilter(id) },
      {
        $group: {
          _id: null,
          charged: { $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount_baisa', 0] } },
          paid: { $sum: { $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount_baisa', 0] } },
          entry_count: { $sum: 1 },
          last_entry_at: { $max: '$entry_date' },
        },
      },
    ]);

    const charged = totals?.charged ?? 0;
    const paid = totals?.paid ?? 0;
    const account: LedgerCustomerRow = {
      customer_id: String(customer._id),
      name: customer.name,
      company: customer.company ?? '',
      phone: customer.phone,
      charged_baisa: charged,
      paid_baisa: paid,
      balance_baisa: charged - paid,
      entry_count: totals?.entry_count ?? 0,
      last_entry_at: totals?.last_entry_at ? new Date(totals.last_entry_at).toISOString() : null,
    };

    res.json({ customer: toCustomer(customer), account });
  }),
);

/**
 * The statement.
 *
 * Shown newest first, but the running balance only means anything read the
 * other way — so it is accumulated oldest-to-newest in the database with
 * `$setWindowFields`, then the page is turned around for display. Doing it in
 * the client would make every page after the first one wrong, because page two
 * cannot see what came before it.
 */
ledgerRouter.get(
  '/customers/:id/entries',
  handle(async (req, res) => {
    const id = requireId(req.params.id);
    const query = ledgerEntryQuerySchema.parse(req.query);

    const customerId = new Types.ObjectId(id);
    const [result] = await LedgerEntryModel.aggregate([
      { $match: { customer_id: customerId } },
      { $sort: { entry_date: 1, _id: 1 } },
      {
        $setWindowFields: {
          partitionBy: '$customer_id',
          sortBy: { entry_date: 1, _id: 1 },
          output: {
            balance_after_baisa: {
              $sum: {
                $cond: [
                  // A voided entry contributes nothing, so the running balance
                  // simply carries across it unchanged.
                  { $ne: ['$voided_at', null] },
                  0,
                  { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount_baisa', { $multiply: ['$amount_baisa', -1] }] },
                ],
              },
              window: { documents: ['unbounded', 'current'] },
            },
          },
        },
      },
      {
        $facet: {
          rows: [
            { $sort: { entry_date: -1, _id: -1 } },
            { $skip: (query.page - 1) * query.page_size },
            { $limit: query.page_size },
          ],
          count: [{ $count: 'total' }],
        },
      },
    ]);

    const page: LedgerEntryPage = {
      rows: (result?.rows ?? []).map((row: never) =>
        toLedgerEntry(row, (row as { balance_after_baisa: number }).balance_after_baisa),
      ),
      total: result?.count?.[0]?.total ?? 0,
      page: query.page,
      page_size: query.page_size,
    };
    res.json(page);
  }),
);

ledgerRouter.post(
  '/customers/:id/entries',
  handle(async (req, res) => {
    const id = requireId(req.params.id);
    // The account belongs to a customer; an entry against nobody is a leak.
    const exists = await CustomerModel.exists({ _id: id });
    if (!exists) throw ApiError.notFound('Customer');

    const input = createLedgerEntrySchema.parse(req.body);
    const doc = await LedgerEntryModel.create({ ...input, customer_id: new Types.ObjectId(id) });
    res.status(201).json({ entry: toLedgerEntry(doc.toObject()) });
  }),
);

/** Corrections to the wording, the paperwork reference or the date — not the money. */
ledgerRouter.patch(
  '/entries/:id',
  handle(async (req, res) => {
    const id = requireId(req.params.id, 'Entry');
    const input = updateLedgerEntrySchema.parse(req.body);

    const doc = await LedgerEntryModel.findById(id);
    if (!doc) throw ApiError.notFound('Entry');
    if (doc.voided_at) throw ApiError.conflict('This entry is voided and cannot be edited');

    doc.set(input);
    await doc.save();
    res.json({ entry: toLedgerEntry(doc.toObject()) });
  }),
);

/**
 * Voiding, rather than deleting.
 *
 * The row stays, marked and with a reason, and stops counting towards the
 * balance. An account whose history can be deleted is an account nobody can
 * argue from.
 */
ledgerRouter.post(
  '/entries/:id/void',
  handle(async (req, res) => {
    const id = requireId(req.params.id, 'Entry');
    const { void_reason } = voidLedgerEntrySchema.parse(req.body);

    const doc = await LedgerEntryModel.findById(id);
    if (!doc) throw ApiError.notFound('Entry');
    if (doc.voided_at) throw ApiError.conflict('This entry is already voided');

    doc.voided_at = new Date();
    doc.void_reason = void_reason;
    await doc.save();
    res.json({ entry: toLedgerEntry(doc.toObject()) });
  }),
);
