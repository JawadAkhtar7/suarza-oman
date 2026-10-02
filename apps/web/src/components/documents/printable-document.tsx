/**
 * A document, as a piece of paper.
 *
 * Rendered alongside the screen version and hidden until the browser prints,
 * rather than opened in a second window or built as a PDF on the server. That
 * keeps one source of truth for what an invoice says, and it means Print works
 * from a phone, over a remote desktop, and into "Save as PDF" without anything
 * else being installed on the office machine.
 *
 * aria-hidden throughout: it duplicates what the page already shows, and a
 * screen reader that walked both would read every line of the invoice twice.
 */

import {
  formatDate,
  formatOMR,
  formatQuantity,
  type DocumentKind,
  type TradeDocument,
} from '@suarza-oman/shared';
import { Letterhead } from '../print/letterhead.js';
import { DOCUMENT_UI } from './kind.js';
import classes from './printable-document.module.css';

/** What the sheet calls itself, in the heading. */
const PRINT_TITLE: Record<DocumentKind, string> = {
  SALE: 'Sales Invoice',
  PURCHASE: 'Purchase Invoice',
  SALE_RETURN: 'Sales Return Invoice',
  PURCHASE_RETURN: 'Purchase Return Invoice',
};

/** What the number is called on the paper: Bill No., P No., PR No. */
const PRINT_NUMBER_LABEL: Record<DocumentKind, string> = {
  SALE: 'Bill No.',
  PURCHASE: 'P No.',
  SALE_RETURN: 'Bill No.',
  PURCHASE_RETURN: 'PR No.',
};

export interface PrintableDocumentProps {
  document: TradeDocument;
}

export function PrintableDocument({ document }: PrintableDocumentProps) {
  const ui = DOCUMENT_UI[document.kind];
  const voided = document.status === 'VOID';

  /* Only the facts this document actually has — an empty "Ref:" line on a
     printed invoice reads as something having gone missing. */
  const facts: { label: string; value: string }[] = [
    { label: 'Date', value: formatDate(document.document_date) },
    ...(document.reference ? [{ label: 'Ref', value: document.reference }] : []),
    ...(document.against_invoice_number
      ? [{ label: 'Invoice no.', value: document.against_invoice_number }]
      : []),
    ...(document.salesman_name ? [{ label: 'Salesman', value: document.salesman_name }] : []),
    { label: 'Paymode', value: ui.settlementLabels[document.settlement] },
  ];

  return (
    <div className={classes.sheet} data-print="sheet" aria-hidden="true">
      <Letterhead
        aside={
          <>
            <div className={classes.docTitle}>{PRINT_TITLE[document.kind]}</div>
            <div className={classes.docMeta}>
              {PRINT_NUMBER_LABEL[document.kind]} <strong>{document.number}</strong>
            </div>
          </>
        }
      />

      {voided && (
        <div className={classes.void}>
          Cancelled — {document.void_reason}
        </div>
      )}

      <div className={classes.parties}>
        <div>
          <div className={classes.label}>{ui.partyPreposition}</div>
          <div className={classes.party}>{document.party_name}</div>
        </div>
        <div className={classes.facts}>
          {facts.map((fact) => (
            <div key={fact.label} className={classes.fact}>
              <span className={classes.factLabel}>{fact.label}: </span>
              {fact.value}
            </div>
          ))}
        </div>
      </div>

      <table className={classes.lines}>
        <thead>
          <tr>
            <th style={{ width: '8mm' }}>#</th>
            <th>Description</th>
            <th style={{ width: '16mm' }}>Unit</th>
            <th className={classes.num} style={{ width: '20mm' }}>
              Qty
            </th>
            <th className={classes.num} style={{ width: '24mm' }}>
              Price
            </th>
            <th className={classes.num} style={{ width: '22mm' }}>
              VAT
            </th>
            <th className={classes.num} style={{ width: '28mm' }}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((line, index) => (
            <tr key={`${line.description}-${index}`}>
              <td>{index + 1}</td>
              <td>{line.description}</td>
              <td>{line.unit}</td>
              <td className={classes.num}>{formatQuantity(line.quantity_milli)}</td>
              <td className={classes.num}>{formatOMR(line.unit_price_baisa, { symbol: false })}</td>
              <td className={classes.num}>{formatOMR(line.vat_baisa, { symbol: false })}</td>
              <td className={classes.num}>{formatOMR(line.total_baisa, { symbol: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={classes.totals}>
        <div className={classes.totalRow}>
          <span>Net</span>
          <span className={classes.num}>{formatOMR(document.net_baisa, { symbol: false })}</span>
        </div>
        <div className={classes.totalRow}>
          <span>VAT</span>
          <span className={classes.num}>{formatOMR(document.vat_baisa, { symbol: false })}</span>
        </div>
        {document.discount_baisa > 0 && (
          <div className={classes.totalRow}>
            <span>Discount</span>
            <span className={classes.num}>
              −{formatOMR(document.discount_baisa, { symbol: false })}
            </span>
          </div>
        )}
        <div className={classes.grand}>
          <span>{ui.totalLabel}</span>
          <span className={classes.num}>{formatOMR(document.total_baisa)}</span>
        </div>
      </div>

      {document.notes && (
        <div className={classes.remarks}>
          <div className={classes.label}>Remarks</div>
          {document.notes}
        </div>
      )}

      <div className={classes.signatures}>
        <div className={classes.signature}>Prepared by</div>
        <div className={classes.signature}>
          {document.kind === 'SALE_RETURN' || document.kind === 'PURCHASE'
            ? 'Goods received by'
            : 'Received by'}
        </div>
      </div>
    </div>
  );
}
