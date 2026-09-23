/**
 * Customer data, as the screens consume it.
 *
 * Every mutation invalidates the list rather than patching a cached copy: an
 * ERP list is filtered, paged and sorted on the server, so the client cannot
 * know where an edited row belongs any more — and a row that silently sits in
 * the wrong place is worse than a refetch.
 */

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  CreateCustomerInput,
  Customer,
  CustomerPage,
  UpdateCustomerInput,
} from '@suarza-oman/shared';
import { api, queryString } from './api.js';

export interface CustomerListParams {
  q: string;
  status: 'ALL' | 'ACTIVE' | 'INACTIVE';
  page: number;
  page_size: number;
}

const keys = {
  all: ['customers'] as const,
  list: (params: CustomerListParams) => ['customers', 'list', params] as const,
};

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.get<CustomerPage>(`/api/customers${queryString({ ...params })}`),
    // Typing in the search box would otherwise blank the table on every
    // keystroke; the previous page stays put until the new one arrives.
    placeholderData: keepPreviousData,
  });
}

export function useCreateCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      api.post<{ customer: Customer }>('/api/customers', input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) =>
      api.patch<{ customer: Customer }>(`/api/customers/${id}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ customer: Customer }>(`/api/customers/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}
