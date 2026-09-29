/**
 * Sales and purchases.
 *
 * Posting a document has three effects, and they are the whole point of the
 * module: the document itself, the stock it moves, and the entry it puts on the
 * party's ledger. Voiding reverses all three — by writing opposite movements
 * and voiding the ledger entries, never by deleting anything.
 */

import { Router } from 'express';
import { Types, isValidObjectId } from 'mongoose';
import {
  createDocumentSchema,
  documentQuerySchema,
  documentTotals,
  priceLine,
  voidDocumentSchema,
  type DocumentPage,
  type DocumentSummary,
} from '@suarza-oman/shared';
import {
  TradeDocumentModel,
  nextDocumentNumber,
  toTradeDocument,
} from '../models/trade-document.model.js';
import { CustomerModel } from '../models/customer.model.js';
import { ProductModel } from '../models/product.model.js';
import { StockMovementModel } from '../models/stock-movement.model.js';
import { LedgerEntryModel } from '../models/ledger-entry.model.js';
import { ApiError } from '../lib/errors.js';
import { handle } from '../lib/async-handler.js';

export const documentsRouter: Router = Router();

function requireId(id: unknown, what = 'Document'): string {
  if (typeof id !== 'string' || !isValidObjectId(id)) throw ApiError.notFound(what);
  return id;
}

/** SALE takes stock out and puts the party in debit; PURCHASE does the reverse. */
const EFFECTS = {
  SALE: {
    stockDirection: 'OUT' as const,
    stockKind: 'SALE' as const,
    ledgerKind: 'CHARGE' as const,
    settledKind: 'PAYMENT' as const,
    noun: 'Invoice',
  },
  PURCHASE: {
    stockDirection: 'IN' as const,
    stockKind: 'PURCHASE' as const,
    ledgerKind: 'BILL' as const,
    settledKind: 'PAYMENT_MADE' as const,
    noun: 'Purchase',
  },
};

function searchFilter(q: string) {
  if (!q) return {};
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const like = { $regex: safe, $options: 'i' };
  return { $or: [{ number: like }, { party_name: like }, { reference: like }] };
}

documentsRouter.get(
  '/',
  handle(async (req, res) => {
    const query = documentQuerySchema.parse(req.query);
    const filter = {
      kind: query.kind,
      ...searchFilter(query.q),
      ...(query.status === 'ALL' ? {} : { status: query.status }),
      ...(query.settlement === 'ALL' ? {} : { settlement: query.settlement }),
    };

    const [docs, total] = await Promise.all([
      TradeDocumentModel.find(filter)
        .sort({ document_date: -1, _id: -1 })
        .skip((query.page - 1) * query.page_size)
        .limit(query.page_size)
        .lean(),
      TradeDocumentModel.countDocuments(filter),
    ]);

    const page: DocumentPage = {
      rows: docs.map(toTradeDocument),
      total,
      page: query.page,
      page_size: query.page_size,
    };
    res.json(page);
  }),
);

documentsRouter.get(
  '/summary',
  handle(async (req, res) => {
    const kind = String(req.query['kind'] ?? 'SALE');
    const from = req.query['from'] ? new Date(String(req.query['from'])) : null;
    const to = req.query['to'] ? new Date(String(req.query['to'])) : null;

    const [totals] = await TradeDocumentModel.aggregate([
      {
        $match: {
          kind,
          // Voided documents are history, not business: they count nowhere.
          status: 'POSTED',
          ...(from || to
            ? {
                document_date: {
                  ...(from ? { $gte: from } : {}),
                  ...(to ? { $lte: to } : {}),
                },
              }
            : {}),
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          net_baisa: { $sum: '$net_baisa' },
          vat_baisa: { $sum: '$vat_baisa' },
          total_baisa: { $sum: '$total_baisa' },
          on_account_baisa: {
            $sum: { $cond: [{ $eq: ['$settlement', 'ON_ACCOUNT'] }, '$total_baisa', 0] },
          },
        },
      },
    ]);

    const summary: DocumentSummary = {
      count: totals?.count ?? 0,
      net_baisa: totals?.net_baisa ?? 0,
      vat_baisa: totals?.vat_baisa ?? 0,
      total_baisa: totals?.total_baisa ?? 0,
      on_account_baisa: totals?.on_account_baisa ?? 0,
    };
    res.json(summary);
  }),
);

documentsRouter.get(
  '/:id',
  handle(async (req, res) => {
    const doc = await TradeDocumentModel.findById(requireId(req.params.id)).lean();
    if (!doc) throw ApiError.notFound('Document');
    res.json({ document: toTradeDocument(doc) });
  }),
);

documentsRouter.post(
  '/',
  handle(async (req, res) => {
    const input = createDocumentSchema.parse(req.body);
    const effects = EFFECTS[input.kind];

    const party = await CustomerModel.findById(
      isValidObjectId(input.party_id) ? input.party_id : undefined,
    ).lean();
    if (!party) throw ApiError.notFound(input.kind === 'SALE' ? 'Customer' : 'Supplier');

    /* Priced here, not trusted from the client: a total is the one thing on a
       document that somebody might want to be wrong. */
    const lines = input.lines.map((line) => ({ ...line, ...priceLine(line) }));
    const totals = documentTotals(lines);
    const number = await nextDocumentNumber(input.kind);

    const doc = await TradeDocumentModel.create({
      kind: input.kind,
      number,
      party_id: party._id,
      party_name: party.name,
      document_date: input.document_date,
      reference: input.reference,
      settlement: input.settlement,
      lines: lines.map((line) => ({
        ...line,
        product_id: line.product_id && isValidObjectId(line.product_id) ? line.product_id : null,
      })),
      ...totals,
      notes: input.notes,
      status: 'POSTED',
    });

    /* --- Stock ---------------------------------------------------------- */
    const productIds = lines
      .map((line) => line.product_id)
      .filter((id): id is string => Boolean(id) && isValidObjectId(id));
    const tracked = await ProductModel.find({ _id: { $in: productIds }, track_stock: true })
      .select('_id')
      .lean();
    const trackedIds = new Set(tracked.map((p) => String(p._id)));

    const movements = lines
      .filter((line) => line.product_id && trackedIds.has(line.product_id))
      .map((line) => ({
        product_id: new Types.ObjectId(line.product_id),
        kind: effects.stockKind,
        direction: effects.stockDirection,
        quantity_milli: line.quantity_milli,
        reason: `${effects.noun} ${number} — ${party.name}`,
        reference: number,
        movement_date: input.document_date,
      }));
    if (movements.length > 0) await StockMovementModel.insertMany(movements);

    /* --- Ledger ----------------------------------------------------------
     *
     * A document worth nothing — a free sample, a replacement, lines not yet
     * priced — moves stock but owes nobody anything. It gets no ledger entry
     * at all: a zero on a statement is noise, and the ledger refuses one
     * anyway, which used to surface as a server error.
     */
    const entries: {
      customer_id: unknown;
      kind: string;
      direction: 'DEBIT' | 'CREDIT';
      amount_baisa: number;
      description: string;
      reference: string;
      entry_date: Date;
    }[] = [
      {
        customer_id: party._id,
        kind: effects.ledgerKind,
        direction: input.kind === 'SALE' ? ('DEBIT' as const) : ('CREDIT' as const),
        amount_baisa: totals.total_baisa,
        description: `${effects.noun} ${number}`,
        reference: input.reference || number,
        entry_date: input.document_date,
      },
    ];
    /* Settled on the spot still goes through the account: the charge and the
       payment both appear, so the statement explains itself. */
    if (input.settlement === 'PAID') {
      entries.push({
        customer_id: party._id,
        kind: effects.settledKind,
        direction: input.kind === 'SALE' ? ('CREDIT' as const) : ('DEBIT' as const),
        amount_baisa: totals.total_baisa,
        description: `${effects.noun} ${number} — settled`,
        reference: input.reference || number,
        entry_date: input.document_date,
      });
    }
    if (totals.total_baisa > 0) await LedgerEntryModel.insertMany(entries);

    res.status(201).json({ document: toTradeDocument(doc.toObject()) });
  }),
);

documentsRouter.post(
  '/:id/void',
  handle(async (req, res) => {
    const id = requireId(req.params.id);
    const { void_reason } = voidDocumentSchema.parse(req.body);

    const doc = await TradeDocumentModel.findById(id);
    if (!doc) throw ApiError.notFound('Document');
    if (doc.status === 'VOID') throw ApiError.conflict('This document is already voided');

    const effects = EFFECTS[doc.kind as 'SALE' | 'PURCHASE'];

    /* Stock is put back by writing the opposite movements, not by deleting the
       originals — "we had 40 bags on Tuesday" has to stay answerable. */
    const reversals = (doc.lines ?? [])
      .filter((line) => line.product_id)
      .map((line) => ({
        product_id: line.product_id,
        kind: 'ADJUSTMENT' as const,
        direction: effects.stockDirection === 'OUT' ? ('IN' as const) : ('OUT' as const),
        quantity_milli: line.quantity_milli,
        reason: `${effects.noun} ${doc.number} voided — ${void_reason}`,
        reference: doc.number,
        movement_date: new Date(),
      }));
    if (reversals.length > 0) await StockMovementModel.insertMany(reversals);

    /* The ledger has its own voiding, which keeps the rows and stops them
       counting — exactly what is wanted here. */
    await LedgerEntryModel.updateMany(
      { customer_id: doc.party_id, reference: { $in: [doc.number, doc.reference || doc.number] }, voided_at: null },
      { $set: { voided_at: new Date(), void_reason: `${effects.noun} ${doc.number} voided — ${void_reason}` } },
    );

    doc.status = 'VOID';
    doc.void_reason = void_reason;
    doc.voided_at = new Date();
    await doc.save();

    res.json({ document: toTradeDocument(doc.toObject()) });
  }),
);
