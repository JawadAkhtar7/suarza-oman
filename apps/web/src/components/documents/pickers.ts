/**
 * The two lists a document form needs to offer: who it is for, and what is on
 * it. Fetched once per form rather than per keystroke — a trading business has
 * hundreds of each, not hundreds of thousands, and a select that waits for the
 * network on every letter feels broken.
 */

import { useQuery } from '@tanstack/react-query';
import type { CustomerPage, ProductPage } from '@suarza-oman/shared';
import { api } from '../../lib/api.js';

export function usePartyOptions(vendorsOnly: boolean) {
  return useQuery({
    queryKey: ['customers', 'options', vendorsOnly],
    queryFn: () =>
      api.get<CustomerPage>(
        `/api/customers?page_size=100&status=ACTIVE${vendorsOnly ? '&vendor=true' : ''}`,
      ),
    select: (page) =>
      page.rows.map((customer) => ({
        value: customer.id,
        label: customer.company ? `${customer.name} — ${customer.company}` : customer.name,
      })),
  });
}

export function useProductOptions() {
  return useQuery({
    queryKey: ['products', 'options'],
    queryFn: () => api.get<ProductPage>('/api/products?page_size=100&status=ACTIVE'),
  });
}
