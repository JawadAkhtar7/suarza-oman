/**
 * How each kind of document talks about itself.
 *
 * The list, detail and form screens are shared by all four kinds — the data is
 * the same shape and the layout is the same shape. Only the words differ, so
 * the words live here rather than as a growing chain of ternaries inside three
 * large components.
 *
 * All four use the client's own vocabulary: a plain number, and "credit" or
 * "debit" rather than the settlement wording the ledger uses.
 */

import { PAYMODE_LABELS, type DocumentKind, type Settlement } from '@suarza-oman/shared';

export interface DocumentKindUi {
  /** Where this kind lives in the URL, with no trailing slash. */
  base: string;
  /** The menu and list heading. */
  listTitle: string;
  listBlurb: string;
  /** The button that opens the form. */
  newLabel: string;
  /** What the detail screen calls one of these, in front of its number. */
  noun: string;
  partyLabel: string;
  /** "Sold to", "Bought from", "Returned by". */
  partyPreposition: string;
  numberColumn: string;
  settlementColumn: string;
  settlementLabels: Record<Settlement, string>;
  totalLabel: string;
  emptyTitle: string;
  emptyBlurb: string;
  emptyAction: string;
  valueTileLabel: string;
  vatTileHint: string;
  onAccountTileHint: string;
  /** What posting it did, for the note on the detail screen. */
  effect: string;
  /** And what voiding it undid. */
  voidedEffect: string;
}

export const DOCUMENT_UI: Record<DocumentKind, DocumentKindUi> = {
  SALE: {
    base: '/sales',
    listTitle: 'Sales invoices',
    listBlurb: 'Every invoice you have made: who it was for, how much, and whether it has been paid.',
    newLabel: 'New invoice',
    noun: 'Invoice',
    partyLabel: 'Customer',
    partyPreposition: 'Sold to',
    numberColumn: 'Bill no.',
    settlementColumn: 'Paymode',
    settlementLabels: PAYMODE_LABELS,
    totalLabel: 'Grand total',
    emptyTitle: 'No invoices yet',
    emptyBlurb: 'When you save an invoice, the stock goes out and the amount is added to the customer’s account.',
    emptyAction: 'Make an invoice',
    valueTileLabel: 'Invoiced',
    vatTileHint: 'Collected on these sales',
    onAccountTileHint: 'Not yet paid by customers',
    effect: 'The stock went out, and the amount was added to the customer’s account.',
    voidedEffect: 'The stock has been put back, and the amount no longer counts.',
  },
  PURCHASE: {
    base: '/purchases',
    listTitle: 'Purchase invoices',
    listBlurb: 'What you bought, who you bought it from, and whether you have paid.',
    newLabel: 'New purchase',
    noun: 'Purchase',
    partyLabel: 'Vendor',
    partyPreposition: 'Bought from',
    numberColumn: 'P no.',
    settlementColumn: 'Paymode',
    settlementLabels: PAYMODE_LABELS,
    totalLabel: 'Grand total',
    emptyTitle: 'No purchases yet',
    emptyBlurb: 'When you save a purchase, the stock comes in and the amount is added to the vendor’s account.',
    emptyAction: 'Record a purchase',
    valueTileLabel: 'Purchase value',
    vatTileHint: 'Paid on these purchases',
    onAccountTileHint: 'Not yet paid to vendors',
    effect: 'The stock came in, and the amount was added to the vendor’s account.',
    voidedEffect: 'The stock has gone back out, and the amount no longer counts.',
  },
  SALE_RETURN: {
    base: '/sales-returns',
    listTitle: 'Sales returns',
    listBlurb: 'What customers sent back, and how much came off their account.',
    newLabel: 'New return',
    noun: 'Return',
    partyLabel: 'Customer',
    partyPreposition: 'Returned by',
    numberColumn: 'Bill no.',
    settlementColumn: 'Paymode',
    settlementLabels: PAYMODE_LABELS,
    totalLabel: 'Grand total',
    emptyTitle: 'No returns yet',
    emptyBlurb: 'When you save a return, the stock comes back in and the amount comes off the customer’s account.',
    emptyAction: 'Record a return',
    valueTileLabel: 'Returned',
    vatTileHint: 'VAT given back on these returns',
    onAccountTileHint: 'Taken off, not yet paid back',
    effect: 'The stock came back in, and the amount came off the customer’s account.',
    voidedEffect: 'The stock has gone back out, and the amount no longer counts.',
  },
  PURCHASE_RETURN: {
    base: '/purchase-returns',
    listTitle: 'Purchase returns',
    listBlurb: 'What you sent back to a vendor, and how much came off their account.',
    newLabel: 'New return',
    noun: 'Purchase return',
    partyLabel: 'Vendor',
    partyPreposition: 'Returned to',
    numberColumn: 'PR no.',
    settlementColumn: 'Paymode',
    settlementLabels: PAYMODE_LABELS,
    totalLabel: 'Grand total',
    emptyTitle: 'No purchase returns yet',
    emptyBlurb: 'When you save a return, the stock goes back out and the amount comes off the vendor’s account.',
    emptyAction: 'Record a return',
    valueTileLabel: 'Returned',
    vatTileHint: 'VAT taken back on these returns',
    onAccountTileHint: 'Taken off, not yet paid back',
    effect: 'The stock went back out, and the amount came off the vendor’s account.',
    voidedEffect: 'The stock has come back in, and the amount no longer counts.',
  },
};
