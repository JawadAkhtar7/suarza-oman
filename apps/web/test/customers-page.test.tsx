/**
 * The customers screen, against a stubbed API.
 *
 * The point of these is the behaviour a user would notice: that the search
 * reaches the server rather than filtering the page in front of them, that a
 * delete asks first, and that a rejected form points at the field.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer } from '@suarza-oman/shared';
import { CustomersPage } from '../src/pages/customers-page.js';
import { customer, renderApp } from './utils.js';

const fetchMock = vi.fn();

function page(rows: Customer[], total = rows.length) {
  return { rows, total, page: 1, page_size: 25 };
}

function respond(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Every request the page makes, as [url, init] pairs. */
const calls = () => fetchMock.mock.calls as [string, RequestInit | undefined][];

describe('the list', () => {
  it('shows a customer with the details that identify them', async () => {
    fetchMock.mockImplementation(() => respond(page([customer()])));

    renderApp(<CustomersPage />);

    expect(await screen.findByText('Ahmed Al Balushi')).toBeInTheDocument();
    expect(screen.getByText('Al Balushi Trading')).toBeInTheDocument();
    expect(screen.getAllByText('+968 9123 4567').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('asks the server for a search rather than filtering what it already has', async () => {
    fetchMock.mockImplementation(() => respond(page([customer()])));
    const user = userEvent.setup();

    renderApp(<CustomersPage />);
    await screen.findByText('Ahmed Al Balushi');

    await user.type(screen.getByPlaceholderText(/search name/i), 'balushi');

    // Debounced, so this is one request with the whole term — not seven.
    await waitFor(() => {
      expect(calls().some(([url]) => url.includes('q=balushi'))).toBe(true);
    });
  });

  it('asks for the page it is on, so a customer beyond page one is reachable', async () => {
    fetchMock.mockImplementation(() => respond(page([customer()], 60)));
    const user = userEvent.setup();

    renderApp(<CustomersPage />);
    await screen.findByText('Ahmed Al Balushi');
    // 60 records at 25 a page: the count comes from the server, not the rows.
    expect(screen.getByText('1–25 of 60')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => {
      expect(calls().some(([url]) => url.includes('page=2'))).toBe(true);
    });
  });

  it('tells an empty system apart from an empty search', async () => {
    fetchMock.mockImplementation(() => respond(page([])));
    const user = userEvent.setup();

    renderApp(<CustomersPage />);
    expect(await screen.findByText('No customers yet')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search name/i), 'nobody');
    expect(await screen.findByText('No customer matches that')).toBeInTheDocument();
    // The way out of an empty search is back to everyone, not a create form.
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('says so when the API cannot be reached, instead of showing an empty list', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    renderApp(<CustomersPage />);

    expect(await screen.findByText('Could not load customers')).toBeInTheDocument();
    expect(screen.getByText(/is the api running/i)).toBeInTheDocument();
  });
});

describe('creating', () => {
  it('sends what was typed and closes', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return respond({ customer: customer() }, 201);
      return respond(page([]));
    });
    const user = userEvent.setup();

    renderApp(<CustomersPage />);
    await user.click(await screen.findByRole('button', { name: /new customer/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Fatma Al Harthy');
    await user.type(within(dialog).getByLabelText(/phone/i), '+968 9333 4444');
    await user.click(within(dialog).getByRole('button', { name: /add customer/i }));

    await waitFor(() => {
      const post = calls().find(([, init]) => init?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post![1]!.body))).toMatchObject({
        name: 'Fatma Al Harthy',
        phone: '+968 9333 4444',
      });
    });
  });

  it('refuses a bad email before it reaches the server', async () => {
    fetchMock.mockImplementation(() => respond(page([])));
    const user = userEvent.setup();

    renderApp(<CustomersPage />);
    await user.click(await screen.findByRole('button', { name: /new customer/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Fatma Al Harthy');
    await user.type(within(dialog).getByLabelText(/phone/i), '+968 9333 4444');
    await user.type(within(dialog).getByLabelText(/email/i), 'fatma@');
    await user.click(within(dialog).getByRole('button', { name: /add customer/i }));

    expect(await screen.findByText(/does not look right/i)).toBeInTheDocument();
    expect(calls().some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it("puts the server's own field errors on the inputs", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return respond(
          { error: { code: 'VALIDATION_FAILED', message: 'Check the fields', details: { phone: 'That number is already used' } } },
          422,
        );
      }
      return respond(page([]));
    });
    const user = userEvent.setup();

    renderApp(<CustomersPage />);
    await user.click(await screen.findByRole('button', { name: /new customer/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Fatma Al Harthy');
    await user.type(within(dialog).getByLabelText(/phone/i), '+968 9333 4444');
    await user.click(within(dialog).getByRole('button', { name: /add customer/i }));

    expect(await screen.findByText('That number is already used')).toBeInTheDocument();
  });
});

describe('deleting', () => {
  it('asks before it deletes, and names who', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return respond({ customer: customer() });
      return respond(page([customer()]));
    });
    const user = userEvent.setup();

    renderApp(<CustomersPage />);
    await user.click(await screen.findByRole('button', { name: /actions for ahmed/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/cannot be undone/i)).toBeInTheDocument();
    // Nothing has been sent yet: the question is the point.
    expect(calls().some(([, init]) => init?.method === 'DELETE')).toBe(false);

    await user.click(within(confirm).getByRole('button', { name: /delete customer/i }));

    await waitFor(() => {
      expect(calls().some(([url, init]) => init?.method === 'DELETE' && url.includes('507f'))).toBe(
        true,
      );
    });
  });

  it('deletes nothing when the question is declined', async () => {
    fetchMock.mockImplementation(() => respond(page([customer()])));
    const user = userEvent.setup();

    renderApp(<CustomersPage />);
    await user.click(await screen.findByRole('button', { name: /actions for ahmed/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await user.click(await screen.findByRole('button', { name: /keep it/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls().some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });
});
