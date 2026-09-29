/**
 * The product screens, against a stubbed API.
 *
 * What matters here is the meaning the UI puts on numbers: that a quantity is
 * never shown without its unit, that prices typed in rials leave as baisa and
 * quantities as thousandths, and that "low" is a warning the user set.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Product, StockMovement } from '@suarza-oman/shared';
import { ProductsPage } from '../src/pages/products-page.js';
import { ProductPage } from '../src/pages/product-page.js';
import { renderApp } from './utils.js';

const fetchMock = vi.fn();

const respond = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: '507f1f77bcf86cd799439011',
    name: 'Cement 50kg bag',
    code: 'CEM50',
    category: 'Building materials',
    unit: 'BAG',
    cost_price_baisa: 2_100,
    sale_price_baisa: 2_600,
    vat_rate_percent: 5,
    track_stock: true,
    reorder_level_milli: 10_000,
    status: 'ACTIVE',
    notes: '',
    stock_milli: 40_000,
    created_at: '2026-09-01T08:00:00.000Z',
    updated_at: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'movement-1',
    product_id: '507f1f77bcf86cd799439011',
    kind: 'PURCHASE',
    direction: 'IN',
    quantity_milli: 40_000,
    reason: 'Delivery from supplier',
    reference: 'DN-101',
    movement_date: '2026-09-02T00:00:00.000Z',
    stock_after_milli: 40_000,
    created_at: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

const summary = {
  total_products: 3,
  active_products: 3,
  low_stock: 1,
  out_of_stock: 2,
  stock_value_baisa: 84_000,
};

const calls = () => fetchMock.mock.calls as [string, RequestInit | undefined][];
const postBody = (match: string) => {
  const call = calls().find(([url, init]) => init?.method === 'POST' && url.includes(match));
  expect(call).toBeTruthy();
  return JSON.parse(String(call![1]!.body));
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function listApi(rows: Product[]) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return respond({ product: product() }, 201);
    if (url.includes('/summary')) return respond(summary);
    if (url.includes('/categories')) return respond({ categories: ['Building materials'] });
    return respond({ rows, total: rows.length, page: 1, page_size: 25 });
  });
}

describe('the catalogue', () => {
  it('leads with what needs attention', async () => {
    listApi([product()]);
    renderApp(<ProductsPage />);

    expect(await screen.findByText('OMR 84.000')).toBeInTheDocument();
    expect(screen.getByText('Running low')).toBeInTheDocument();
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });

  it('never shows a quantity without its unit', async () => {
    listApi([product()]);
    renderApp(<ProductsPage />);

    const row = (await screen.findByText('Cement 50kg bag')).closest('tr')!;
    // 40 bags — "40" alone would be meaningless in a catalogue of bags,
    // tonnes and metres.
    expect(within(row).getByText('40')).toBeInTheDocument();
    expect(within(row).getByText('bag')).toBeInTheDocument();
  });

  it('marks a product at its warning level as low', async () => {
    listApi([product({ stock_milli: 10_000, reorder_level_milli: 10_000 })]);
    renderApp(<ProductsPage />);
    expect(await screen.findByText('Low')).toBeInTheDocument();
  });

  it('asks the server to filter by stock rather than filtering the page', async () => {
    listApi([product()]);
    const user = userEvent.setup();
    renderApp(<ProductsPage />);
    await screen.findByText('Cement 50kg bag');

    await user.click(screen.getByRole('radio', { name: 'Low' }));

    await waitFor(() => expect(calls().some(([url]) => url.includes('stock=LOW'))).toBe(true));
  });

  it('offers a way in when the catalogue is empty', async () => {
    listApi([]);
    renderApp(<ProductsPage />);

    expect(await screen.findByText('No products yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /define the first product/i })).toBeInTheDocument();
  });
});

describe('defining a product', () => {
  it('sends prices as baisa and quantities as thousandths', async () => {
    listApi([]);
    const user = userEvent.setup();
    renderApp(<ProductsPage />);

    await user.click(await screen.findByRole('button', { name: /new product/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/product name/i), 'Sand (per tonne)');
    await user.type(within(dialog).getByLabelText(/cost price/i), '4.250');
    await user.type(within(dialog).getByLabelText(/sale price/i), '6');
    await user.type(within(dialog).getByLabelText(/opening stock/i), '12.5');
    await user.click(within(dialog).getByRole('button', { name: /add product/i }));

    await waitFor(() => {
      expect(postBody('/api/products')).toMatchObject({
        name: 'Sand (per tonne)',
        cost_price_baisa: 4_250,
        sale_price_baisa: 6_000,
        // 12.5 units is 12500 thousandths — an integer, never a float.
        opening_stock_milli: 12_500,
      });
    });
  });

  it('refuses a product with no name before it reaches the server', async () => {
    listApi([]);
    const user = userEvent.setup();
    renderApp(<ProductsPage />);

    await user.click(await screen.findByRole('button', { name: /new product/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /add product/i }));

    expect(await screen.findByText(/enter the product name/i)).toBeInTheDocument();
    expect(calls().some(([url, init]) => init?.method === 'POST' && url.endsWith('/api/products'))).toBe(
      false,
    );
  });

  it('puts the server’s duplicate-code message on the field', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return respond(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Check the highlighted fields',
              details: { code: 'Another product already uses this code' },
            },
          },
          422,
        );
      }
      if (url.includes('/summary')) return respond(summary);
      if (url.includes('/categories')) return respond({ categories: [] });
      return respond({ rows: [], total: 0, page: 1, page_size: 25 });
    });

    const user = userEvent.setup();
    renderApp(<ProductsPage />);
    await user.click(await screen.findByRole('button', { name: /new product/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/product name/i), 'Cement');
    await user.type(within(dialog).getByLabelText(/^code/i), 'CEM50');
    await user.click(within(dialog).getByRole('button', { name: /add product/i }));

    expect(await screen.findByText(/already uses this code/i)).toBeInTheDocument();
  });
});

describe('one product', () => {
  const detailApi = (item: Product, movements: StockMovement[]) =>
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return respond({ movement: movements[0] }, 201);
      if (url.includes('/movements')) {
        return respond({ rows: movements, total: movements.length, page: 1, page_size: 50 });
      }
      if (url.includes('/categories')) return respond({ categories: [] });
      return respond({ product: item });
    });

  it('shows the stock card with a running quantity', async () => {
    detailApi(product(), [
      movement({ id: 'a', reason: 'Delivery from supplier', quantity_milli: 50_000, stock_after_milli: 50_000 }),
      movement({ id: 'b', kind: 'SALE', direction: 'OUT', reason: 'Sold to site', quantity_milli: 10_000, stock_after_milli: 40_000 }),
    ]);
    renderApp(<ProductPage />, { route: '/products/507f1f77bcf86cd799439011' });

    const row = (await screen.findByText('Sold to site')).closest('tr')!;
    expect(within(row).getByText('10')).toBeInTheDocument();
    expect(within(row).getByText('40')).toBeInTheDocument();
  });

  it('records a movement in thousandths, on the side that was chosen', async () => {
    detailApi(product(), [movement()]);
    const user = userEvent.setup();
    renderApp(<ProductPage />, { route: '/products/507f1f77bcf86cd799439011' });

    await user.click(await screen.findByRole('button', { name: /stock movement/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('radio', { name: 'Sold' }));
    await user.type(within(dialog).getByLabelText(/quantity/i), '2.5');
    await user.type(within(dialog).getByLabelText(/reason/i), 'Sold to site');
    await user.click(within(dialog).getByRole('button', { name: /record movement/i }));

    await waitFor(() => {
      expect(postBody('/movements')).toMatchObject({
        kind: 'SALE',
        direction: 'OUT',
        quantity_milli: 2_500,
        reason: 'Sold to site',
      });
    });
  });

  it('will not record a movement without a reason', async () => {
    detailApi(product(), [movement()]);
    const user = userEvent.setup();
    renderApp(<ProductPage />, { route: '/products/507f1f77bcf86cd799439011' });

    await user.click(await screen.findByRole('button', { name: /stock movement/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/quantity/i), '5');
    await user.click(within(dialog).getByRole('button', { name: /record movement/i }));

    expect(await screen.findByText(/say why the stock changed/i)).toBeInTheDocument();
    // Nothing was sent: the form stopped it.
    expect(calls().some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('says plainly when the count has gone negative', async () => {
    detailApi(product({ stock_milli: -3_000 }), []);
    renderApp(<ProductPage />, { route: '/products/507f1f77bcf86cd799439011' });

    expect(await screen.findByText('Nothing left')).toBeInTheDocument();
    expect(screen.getByText(/more has gone out than was recorded/i)).toBeInTheDocument();
  });

  it('hides the stock card for something that is not stocked', async () => {
    detailApi(product({ name: 'Delivery charge', track_stock: false, stock_milli: 0 }), []);
    renderApp(<ProductPage />, { route: '/products/507f1f77bcf86cd799439011' });

    expect(await screen.findByText('Delivery charge')).toBeInTheDocument();
    expect(screen.queryByText('Stock card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /stock movement/i })).not.toBeInTheDocument();
  });
});
