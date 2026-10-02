/**
 * Account General Ledger — the statement you hand to, or post to, an account
 * holder.
 *
 * Rendered next to the screen and revealed only when the browser prints, the
 * same way an invoice is. It is aria-hidden throughout: it duplicates what the
 * page already shows, and a screen reader that walked both would read the whole
 * account twice. See the stylesheet for why the whole document is one
 * table: it is what makes the letterhead and the account title repeat on every
 * page of a long statement.
 *
 * Amounts are shown as plain debit and credit columns with a running balance,
 * because that is the one layout every bookkeeper in the world already reads.
 * The balance is the server's, not re-added here — see the statement endpoint.
 */

import {
  formatDate,
  formatDateTime,
  formatOMR,
  type Customer,
  type LedgerStatement,
} from '@suarza-oman/shared';
import { Letterhead } from '../print/letterhead.js';
import classes from './account-statement.module.css';

const COLUMNS = 6;

/** "1,234.560 Dr" — the side is part of the figure on a statement. */
function balance(baisa: number): string {
  if (baisa === 0) return formatOMR(0, { symbol: false });
  return `${formatOMR(Math.abs(baisa), { symbol: false })} ${baisa > 0 ? 'Dr' : 'Cr'}`;
}

export interface AccountStatementProps {
  customer: Customer;
  statement: LedgerStatement;
}

export function AccountStatement({ customer, statement }: AccountStatementProps) {
  const title = customer.company ? `${customer.name} — ${customer.company}` : customer.name;

  return (
    <div className={classes.sheet} data-print="sheet" aria-hidden="true">
      <table className={classes.table}>
        <thead>
          {/* Repeated at the top of every printed page. */}
          <tr>
            <th className={classes.headCell} colSpan={COLUMNS}>
              <Letterhead aside={formatDateTime(statement.generated_at)} />

              <span className={classes.title}>Account General Ledger</span>

              <div className={classes.meta}>
                <div>
                  <div>
                    Title of Account: <span className={classes.account}>{title}</span>
                  </div>
                  {customer.phone && <div>Tel: {customer.phone}</div>}
                  {customer.vat_number && <div>VATIN: {customer.vat_number}</div>}
                </div>
                <div>
                  <div>Date From: {statement.from ? formatDate(statement.from) : 'Beginning'}</div>
                  <div>Date To: {statement.to ? formatDate(statement.to) : 'Today'}</div>
                </div>
              </div>

              <div className={classes.opening}>
                Opening Balance: {balance(statement.opening_balance_baisa)}
              </div>

              {statement.truncated && (
                <div className={classes.truncated}>
                  There are too many entries to print at once. Pick a shorter date range and
                  print it in parts. The totals below do not cover everything.
                </div>
              )}
            </th>
          </tr>

          <tr className={classes.columns}>
            <th style={{ width: '22mm' }}>Reference</th>
            <th style={{ width: '24mm' }}>Date</th>
            <th>Transaction Description</th>
            <th className={classes.num} style={{ width: '26mm' }}>
              Debit
            </th>
            <th className={classes.num} style={{ width: '26mm' }}>
              Credit
            </th>
            <th className={classes.num} style={{ width: '30mm' }}>
              Balance
            </th>
          </tr>
        </thead>

        <tbody>
          {statement.rows.length === 0 ? (
            <tr>
              <td className={classes.empty} colSpan={COLUMNS}>
                Nothing on this account between these dates.
              </td>
            </tr>
          ) : (
            statement.rows.map((entry) => (
              <tr key={entry.id}>
                <td className={classes.ref}>{entry.reference || '—'}</td>
                <td className={classes.ref}>{formatDate(entry.entry_date)}</td>
                <td>{entry.description}</td>
                <td className={classes.num}>
                  {entry.direction === 'DEBIT'
                    ? formatOMR(entry.amount_baisa, { symbol: false })
                    : formatOMR(0, { symbol: false })}
                </td>
                <td className={classes.num}>
                  {entry.direction === 'CREDIT'
                    ? formatOMR(entry.amount_baisa, { symbol: false })
                    : formatOMR(0, { symbol: false })}
                </td>
                <td className={classes.num}>{balance(entry.balance_after_baisa)}</td>
              </tr>
            ))
          )}

          <tr className={classes.closing}>
            <td colSpan={3}>Closing balance</td>
            <td className={classes.num}>
              {formatOMR(statement.debit_total_baisa, { symbol: false })}
            </td>
            <td className={classes.num}>
              {formatOMR(statement.credit_total_baisa, { symbol: false })}
            </td>
            <td className={classes.num}>{balance(statement.closing_balance_baisa)}</td>
          </tr>
        </tbody>

        <tfoot>
          <tr>
            <td className={classes.footCell} colSpan={COLUMNS}>
              Account General Ledger · {title}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
