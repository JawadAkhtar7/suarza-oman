/**
 * The ledger screens, against a stubbed API.
 *
 * What is worth asserting here is the meaning the UI puts on a number: that a
 * balance is never shown without saying whose money it is, that cancelling asks for
 * a reason, and that rials typed in the box leave as baisa.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LedgerCustomerRow, LedgerEntry } from '@suarza-oman/shared';
import { LedgerPage } from '../src/pages/ledger-page.js';
import { LedgerCustomerPage } from '../src/pages/ledger-customer-page.js';
import { customer, renderApp } from './utils.js';

const fetchMock = vi.fn();

function respond(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);
}

function account(overrides: Partial<LedgerCustomerRow> = {}): LedgerCustomerRow {
  return {
    customer_id: '507f1f77bcf86cd799439011',
    name: 'Ahmed Al Balushi',
    company: 'Al Balushi Trading',
    phone: '+968 9123 4567',
    charged_baisa: 150_000,
    paid_baisa: 50_000,
    balance_baisa: 100_000,
    entry_count: 2,
    last_entry_at: '2026-09-20T08:00:00.000Z',
    ...overrides,
  };
}

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: 'entry-1',
    customer_id: '507f1f77bcf86cd799439011',
    kind: 'CHARGE',
    direction: 'DEBIT',
    amount_baisa: 150_000,
    description: 'Invoice 104',
    reference: 'INV-104',
    entry_date: '2026-09-18T00:00:00.000Z',
    balance_after_baisa: 150_000,
    voided_at: null,
    void_reason: null,
    created_at: '2026-09-18T00:00:00.000Z',
    updated_at: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

const calls = () => fetchMock.mock.calls as [string, RequestInit | undefined][];

/**
 * The standing badge, found by being a badge.
 *
 * "Debit" is also a column heading and a filter label on these screens, so the
 * word alone matches three things. What this asserts is that the balance wears
 * the side it falls on, which is the badge's whole job.
 */
const standingBadges = (text: string) =>
  screen.getAllByText(text).filter((node) => node.className.includes('Badge'));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('the ledger list', () => {
  beforeEach(() => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/summary')) {
        return respond({
          receivable_baisa: 100_000,
          advance_baisa: 25_000,
          owing_count: 1,
          advance_count: 1,
          settled_count: 3,
        });
      }
      return respond({ rows: [account()], total: 1, page: 1, page_size: 25 });
    });
  });

  it('leads with the two sides, never netted into one figure', async () => {
    renderApp(<LedgerPage />);

    expect(await screen.findByText('OMR 100.000')).toBeInTheDocument();
    expect(screen.getByText('OMR 25.000')).toBeInTheDocument();
    // The two totals are never netted into one figure.
    expect(screen.getByText('Total debit')).toBeInTheDocument();
    expect(screen.getByText('Total credit')).toBeInTheDocument();
  });

  it('says whose money a balance is, not just how much', async () => {
    renderApp(<LedgerPage />);

    expect(await screen.findByText('Ahmed Al Balushi')).toBeInTheDocument();
    // The badge says which side the figure falls on, not just how much.
    expect(standingBadges('Debit')).not.toHaveLength(0);
  });

  it('asks the server to filter by standing rather than filtering the page', async () => {
    const user = userEvent.setup();
    renderApp(<LedgerPage />);
    await screen.findByText('Ahmed Al Balushi');

    await user.click(screen.getByRole('radio', { name: 'Debit' }));

    await waitFor(() => {
      expect(calls().some(([url]) => url.includes('standing=OWING'))).toBe(true);
    });
  });
});

describe('one account', () => {
  const setup = (entries: LedgerEntry[] = [entry()], acc = account()) => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/void')) return respond({ entry: entries[0] });
      if (init?.method === 'POST') return respond({ entry: entries[0] }, 201);
      if (url.includes('/entries')) {
        return respond({ rows: entries, total: entries.length, page: 1, page_size: 50 });
      }
      if (url.includes('/statement')) {
        return respond({
          customer: customer(),
          statement: {
            from: null,
            to: null,
            opening_balance_baisa: 0,
            rows: entries,
            debit_total_baisa: acc.charged_baisa,
            credit_total_baisa: acc.paid_baisa,
            closing_balance_baisa: acc.balance_baisa,
            truncated: false,
            generated_at: '2026-09-20T08:00:00.000Z',
          },
        });
      }
      return respond({ customer: customer(), account: acc });
    });
  };

  it('shows the balance with the word that explains it', async () => {
    setup();
    renderApp(<LedgerCustomerPage />, { route: '/ledger/507f1f77bcf86cd799439011' });

    expect(await screen.findByText('Ahmed Al Balushi')).toBeInTheDocument();
    expect(screen.getByText('OMR 100.000')).toBeInTheDocument();
    expect(standingBadges('Debit')).not.toHaveLength(0);
  });

  it('puts a debit and a credit in different columns', async () => {
    setup([
      entry({ id: 'a', description: 'Invoice 104', direction: 'DEBIT', amount_baisa: 150_000, balance_after_baisa: 150_000 }),
      entry({ id: 'b', kind: 'PAYMENT', description: 'Cash received', direction: 'CREDIT', amount_baisa: 50_000, balance_after_baisa: 100_000 }),
    ]);
    renderApp(<LedgerCustomerPage />, { route: '/ledger/507f1f77bcf86cd799439011' });

    /* Scoped to the screen: the printable statement renders the same entries
       for paper, so an unscoped query would find each description twice. */
    await screen.findAllByText('Cash received');
    const onScreen = within(document.querySelector('[data-print="hide"]') as HTMLElement);
    const row = onScreen.getByText('Cash received').closest('tr')!;
    // The credit sits in the Credit column; its running balance is beside it.
    expect(within(row).getByText('50.000')).toBeInTheDocument();
    expect(within(row).getByText('100.000')).toBeInTheDocument();
  });

  it('sends rials from the box as whole baisa', async () => {
    setup();
    const user = userEvent.setup();
    renderApp(<LedgerCustomerPage />, { route: '/ledger/507f1f77bcf86cd799439011' });

    await user.click(await screen.findByRole('button', { name: /add credit/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/amount/i), '12.345');
    await user.type(within(dialog).getByLabelText(/details/i), 'Cash received');
    await user.click(within(dialog).getByRole('button', { name: /add entry/i }));

    await waitFor(() => {
      const post = calls().find(([url, init]) => init?.method === 'POST' && url.includes('/entries'));
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post![1]!.body));
      // 12.345 OMR is 12,345 baisa — an integer, never a float.
      expect(body.amount_baisa).toBe(12_345);
      expect(body.direction).toBe('CREDIT');
      expect(body.kind).toBe('PAYMENT');
    });
  });

  it('refuses an entry with no amount before it reaches the server', async () => {
    setup();
    const user = userEvent.setup();
    renderApp(<LedgerCustomerPage />, { route: '/ledger/507f1f77bcf86cd799439011' });

    await user.click(await screen.findByRole('button', { name: /add charge/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/details/i), 'Something');
    await user.click(within(dialog).getByRole('button', { name: /add entry/i }));

    expect(await screen.findByText(/amount greater than zero/i)).toBeInTheDocument();
    expect(calls().some(([url, init]) => init?.method === 'POST' && url.includes('/entries'))).toBe(false);
  });

  it('will not cancel an entry without a reason', async () => {
    setup();
    const user = userEvent.setup();
    renderApp(<LedgerCustomerPage />, { route: '/ledger/507f1f77bcf86cd799439011' });

    await user.click(await screen.findByRole('button', { name: /actions for invoice 104/i }));
    await user.click(await screen.findByRole('menuitem', { name: /cancel entry/i }));

    const confirm = await screen.findByRole('dialog');
    await user.click(within(confirm).getByRole('button', { name: /^cancel it$/i }));

    // Nothing is sent: the reason is the point of cancelling rather than deleting.
    await waitFor(() => expect(screen.getByText(/please give a reason/i)).toBeInTheDocument());
    expect(calls().some(([url]) => url.includes('/void'))).toBe(false);
  });

  it('cancels with the reason once one is given', async () => {
    setup();
    const user = userEvent.setup();
    renderApp(<LedgerCustomerPage />, { route: '/ledger/507f1f77bcf86cd799439011' });

    await user.click(await screen.findByRole('button', { name: /actions for invoice 104/i }));
    await user.click(await screen.findByRole('menuitem', { name: /cancel entry/i }));

    const confirm = await screen.findByRole('dialog');
    await user.type(within(confirm).getByLabelText(/why are you cancelling it/i), 'Entered twice');
    await user.click(within(confirm).getByRole('button', { name: /^cancel it$/i }));

    await waitFor(() => {
      const call = calls().find(([url]) => url.includes('/void'));
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call![1]!.body)).void_reason).toBe('Entered twice');
    });
  });

  it('keeps a voided entry on the statement, marked', async () => {
    setup([entry({ voided_at: '2026-09-21T00:00:00.000Z', void_reason: 'Entered twice' })]);
    renderApp(<LedgerCustomerPage />, { route: '/ledger/507f1f77bcf86cd799439011' });

    expect(await screen.findByText('Invoice 104')).toBeInTheDocument();
    // Awaited: the badge sits inside a Tooltip, which mounts a tick after the
    // row text it belongs to.
    expect(await screen.findByText('Voided')).toBeInTheDocument();
    // No actions on a voided row: there is nothing left to do to it.
    expect(screen.queryByRole('button', { name: /actions for invoice 104/i })).not.toBeInTheDocument();
  });

  it('offers a way in when the account is empty', async () => {
    setup([], account({ charged_baisa: 0, paid_baisa: 0, balance_baisa: 0, entry_count: 0, last_entry_at: null }));
    renderApp(<LedgerCustomerPage />, { route: '/ledger/507f1f77bcf86cd799439011' });

    expect(await screen.findByText('Nothing on this account yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add the first entry/i })).toBeInTheDocument();
  });
});
