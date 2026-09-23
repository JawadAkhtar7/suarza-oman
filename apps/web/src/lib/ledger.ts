/**
 * Ledger data.
 *
 * Every mutation invalidates the whole ledger tree rather than patching a
 * cached row: an entry changes a balance, a balance changes where the customer
 * sits in the list, and the summary tiles on top of it. Working out which of
 * those to touch by hand is how a screen ends up showing two different totals.
 */

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  Customer,
  CreateLedgerEntryInput,
  LedgerCustomerPage,
  LedgerCustomerRow,
  LedgerEntry,
  LedgerEntryPage,
  LedgerStanding,
  LedgerSummary,
  UpdateLedgerEntryInput,
} from '@suarza-oman/shared';
import { api, queryString } from './api.js';

export interface LedgerListParams {
  q: string;
  standing: LedgerStanding;
  page: number;
  page_size: number;
  sort: 'balance' | 'name' | 'last_entry_at';
  dir: 'asc' | 'desc';
}

const keys = {
  all: ['ledger'] as const,
  summary: ['ledger', 'summary'] as const,
  list: (params: LedgerListParams) => ['ledger', 'list', params] as const,
  account: (id: string) => ['ledger', 'account', id] as const,
  entries: (id: string, page: number) => ['ledger', 'entries', id, page] as const,
};

export function useLedgerSummary() {
  return useQuery({
    queryKey: keys.summary,
    queryFn: () => api.get<LedgerSummary>('/api/ledger/summary'),
  });
}

export function useLedgerCustomers(params: LedgerListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.get<LedgerCustomerPage>(`/api/ledger/customers${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

export interface LedgerAccount {
  customer: Customer;
  account: LedgerCustomerRow;
}

export function useLedgerAccount(customerId: string) {
  return useQuery({
    queryKey: keys.account(customerId),
    queryFn: () => api.get<LedgerAccount>(`/api/ledger/customers/${customerId}`),
  });
}

export function useLedgerEntries(customerId: string, page: number) {
  return useQuery({
    queryKey: keys.entries(customerId, page),
    queryFn: () =>
      api.get<LedgerEntryPage>(
        `/api/ledger/customers/${customerId}/entries${queryString({ page, page_size: 50 })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

function useLedgerMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useAddLedgerEntry(customerId: string) {
  return useLedgerMutation<CreateLedgerEntryInput>((input) =>
    api.post<{ entry: LedgerEntry }>(`/api/ledger/customers/${customerId}/entries`, input),
  );
}

export function useUpdateLedgerEntry() {
  return useLedgerMutation<{ id: string; input: UpdateLedgerEntryInput }>(({ id, input }) =>
    api.patch<{ entry: LedgerEntry }>(`/api/ledger/entries/${id}`, input),
  );
}

export function useVoidLedgerEntry() {
  return useLedgerMutation<{ id: string; void_reason: string }>(({ id, void_reason }) =>
    api.post<{ entry: LedgerEntry }>(`/api/ledger/entries/${id}/void`, { void_reason }),
  );
}
