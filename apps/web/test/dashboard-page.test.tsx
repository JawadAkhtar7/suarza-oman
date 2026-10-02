/**
 * The dashboard, against a stubbed API.
 *
 * What is worth asserting is the meaning, not the layout: that the headline
 * figure is net of returns rather than the gross one, that a period with no
 * trade says so instead of drawing an empty chart, and that "needs attention"
 * stays quiet when there is genuinely nothing wrong — a panel that cries wolf
 * on a clean day is a panel people stop reading.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { DashboardPage } from '../src/pages/dashboard-page.js';
import { renderApp } from './utils.js';

const fetchMock = vi.fn();

function respond(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const totals = (count: number, total: number) => ({
  count,
  net_baisa: total,
  vat_baisa: 0,
  total_baisa: total,
});

function overview(overrides: Record<string, unknown> = {}) {
  return {
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-30T00:00:00.000Z',
    sales: totals(4, 40_000),
    purchases: totals(2, 10_000),
    sale_returns: totals(1, 9_000),
    purchase_returns: totals(0, 0),
    net_sales_baisa: 31_000,
    net_purchases_baisa: 10_000,
    margin_baisa: 6_000,
    receivable_baisa: 0,
    payable_baisa: 0,
    stock_value_baisa: 50_000,
    series: [{ date: '2026-09-01', sales: 40_000, purchases: 10_000 }],
    top_products: [{ name: 'Cement 50kg', quantity_milli: 10_000, revenue_baisa: 26_000 }],
    top_customers: [{ name: 'Mujahid Pak', count: 2, revenue_baisa: 20_000 }],
    stock_by_category: [],
    ...overrides,
  };
}

const products = { total_products: 3, active_products: 3, low_stock: 0, out_of_stock: 0, stock_value_baisa: 50_000 };
const staff = { total_employees: 2, active: 2, on_leave: 0, monthly_payroll_baisa: 800_000 };

function setup(report = overview(), productSummary = products) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/reports/overview')) return respond(report);
    if (url.includes('/products/summary')) return respond(productSummary);
    if (url.includes('/employees/summary')) return respond(staff);
    if (url.includes('/ledger/customers')) {
      return respond({ rows: [], total: 0, page: 1, page_size: 5 });
    }
    return respond({ rows: [], total: 0, page: 1, page_size: 25 });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('the dashboard', () => {
  it('headlines sales after returns, not the gross figure', async () => {
    setup();
    renderApp(<DashboardPage />);

    // 40.000 sold less 9.000 returned is 31.000 of business.
    expect(await screen.findByText('OMR 31.000')).toBeInTheDocument();
    expect(screen.queryByText('OMR 40.000')).not.toBeInTheDocument();
    // And it says where the difference went, rather than leaving it a mystery.
    expect(screen.getByText(/4 invoices, less OMR 9\.000 returned/)).toBeInTheDocument();
  });

  it('says all clear rather than showing an empty warnings panel', async () => {
    setup();
    renderApp(<DashboardPage />);

    expect(await screen.findByText(/All clear/)).toBeInTheDocument();
  });

  it('raises what is out of stock and what is in debit', async () => {
    setup(overview({ receivable_baisa: 125_000 }), { ...products, out_of_stock: 2, low_stock: 1 });
    renderApp(<DashboardPage />);

    expect(await screen.findByText(/2 products are out of stock/)).toBeInTheDocument();
    expect(screen.getByText(/1 product is running low/)).toBeInTheDocument();
    expect(screen.getByText(/OMR 125\.000 still to collect/)).toBeInTheDocument();
    expect(screen.queryByText(/All clear/)).not.toBeInTheDocument();
  });

  it('says nothing traded instead of drawing an empty chart', async () => {
    setup(
      overview({
        sales: totals(0, 0),
        purchases: totals(0, 0),
        sale_returns: totals(0, 0),
        net_sales_baisa: 0,
        net_purchases_baisa: 0,
        series: [],
        top_customers: [],
        top_products: [],
      }),
    );
    renderApp(<DashboardPage />);

    expect(await screen.findByText('Nothing traded in this period')).toBeInTheDocument();
  });

  it('asks for the period before this one, so the change is a real comparison', async () => {
    setup();
    renderApp(<DashboardPage />);
    await screen.findByText('OMR 31.000');

    const ranges = (fetchMock.mock.calls as [string][])
      .map(([url]) => url)
      .filter((url) => url.includes('/reports/overview'));

    // Two distinct windows, not the same one twice.
    expect(new Set(ranges).size).toBe(2);
  });
});
