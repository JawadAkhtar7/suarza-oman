/**
 * Product and stock data.
 *
 * Every mutation invalidates the whole product tree: a movement changes a
 * quantity, a quantity changes which stock filter a product falls under and the
 * figures on the summary tiles. Working out by hand which of those to touch is
 * how a screen ends up showing two different numbers.
 */

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  CreateProductWithStockInput,
  CreateStockMovementInput,
  Product,
  ProductPage,
  ProductStockFilter,
  ProductSummary,
  StockMovementPage,
  UpdateProductInput,
} from '@suarza-oman/shared';
import { api, queryString } from './api.js';

export interface ProductListParams {
  q: string;
  category: string;
  status: 'ALL' | 'ACTIVE' | 'INACTIVE';
  stock: ProductStockFilter;
  page: number;
  page_size: number;
}

const keys = {
  all: ['products'] as const,
  summary: ['products', 'summary'] as const,
  categories: ['products', 'categories'] as const,
  list: (params: ProductListParams) => ['products', 'list', params] as const,
  one: (id: string) => ['products', 'one', id] as const,
  movements: (id: string, page: number) => ['products', 'movements', id, page] as const,
};

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.get<ProductPage>(`/api/products${queryString({ ...params })}`),
    // Typing in the search box would otherwise blank the table on every letter.
    placeholderData: keepPreviousData,
  });
}

export function useProductSummary() {
  return useQuery({
    queryKey: keys.summary,
    queryFn: () => api.get<ProductSummary>('/api/products/summary'),
  });
}

export function useProductCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: () => api.get<{ categories: string[] }>('/api/products/categories'),
    select: (data) => data.categories,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    queryFn: () => api.get<{ product: Product }>(`/api/products/${id}`),
    select: (data) => data.product,
  });
}

export function useStockMovements(id: string, page: number) {
  return useQuery({
    queryKey: keys.movements(id, page),
    queryFn: () =>
      api.get<StockMovementPage>(
        `/api/products/${id}/movements${queryString({ page, page_size: 50 })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

function useProductMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useCreateProduct() {
  return useProductMutation<CreateProductWithStockInput>((input) =>
    api.post<{ product: Product }>('/api/products', input),
  );
}

export function useUpdateProduct() {
  return useProductMutation<{ id: string; input: UpdateProductInput }>(({ id, input }) =>
    api.patch<{ product: Product }>(`/api/products/${id}`, input),
  );
}

export function useDeleteProduct() {
  return useProductMutation<string>((id) => api.delete<{ product: Product }>(`/api/products/${id}`));
}

export function useAddStockMovement(productId: string) {
  return useProductMutation<CreateStockMovementInput>((input) =>
    api.post(`/api/products/${productId}/movements`, input),
  );
}
