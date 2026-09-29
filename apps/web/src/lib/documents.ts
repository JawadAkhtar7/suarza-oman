/**
 * Sales and purchases.
 *
 * Posting one moves stock and writes a ledger entry, so a success invalidates
 * products and the ledger as well as documents — three screens would otherwise
 * keep showing figures from before the sale.
 */

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  CreateDocumentInput,
  DocumentKind,
  DocumentPage,
  DocumentSummary,
  Settlement,
  TradeDocument,
} from '@suarza-oman/shared';
import { api, queryString } from './api.js';

export interface DocumentListParams {
  kind: DocumentKind;
  q: string;
  status: 'ALL' | 'POSTED' | 'VOID';
  settlement: 'ALL' | Settlement;
  page: number;
  page_size: number;
}

const keys = {
  all: ['documents'] as const,
  list: (params: DocumentListParams) => ['documents', 'list', params] as const,
  summary: (kind: DocumentKind) => ['documents', 'summary', kind] as const,
  one: (id: string) => ['documents', 'one', id] as const,
};

export function useDocuments(params: DocumentListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.get<DocumentPage>(`/api/documents${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

export function useDocumentSummary(kind: DocumentKind) {
  return useQuery({
    queryKey: keys.summary(kind),
    queryFn: () => api.get<DocumentSummary>(`/api/documents/summary${queryString({ kind })}`),
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    queryFn: () => api.get<{ document: TradeDocument }>(`/api/documents/${id}`),
    select: (data) => data.document,
  });
}

/** Everything a posted document touches. */
function useDocumentMutation<TVariables, TResult = unknown>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.all });
      void client.invalidateQueries({ queryKey: ['products'] });
      void client.invalidateQueries({ queryKey: ['ledger'] });
    },
  });
}

export function useCreateDocument() {
  return useDocumentMutation<CreateDocumentInput, { document: TradeDocument }>((input) =>
    api.post<{ document: TradeDocument }>('/api/documents', input),
  );
}

export function useVoidDocument() {
  return useDocumentMutation<{ id: string; void_reason: string }>(({ id, void_reason }) =>
    api.post(`/api/documents/${id}/void`, { void_reason }),
  );
}
