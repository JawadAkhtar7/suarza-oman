/** Employee data. */

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  CreateEmployeeInput,
  Employee,
  EmployeePage,
  EmployeeSummary,
  UpdateEmployeeInput,
} from '@suarza-oman/shared';
import { api, queryString } from './api.js';

export interface EmployeeListParams {
  q: string;
  status: 'ALL' | 'ACTIVE' | 'ON_LEAVE' | 'LEFT';
  page: number;
  page_size: number;
}

const keys = {
  all: ['employees'] as const,
  summary: ['employees', 'summary'] as const,
  departments: ['employees', 'departments'] as const,
  list: (params: EmployeeListParams) => ['employees', 'list', params] as const,
};

export function useEmployees(params: EmployeeListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => api.get<EmployeePage>(`/api/employees${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });
}

export function useEmployeeSummary() {
  return useQuery({
    queryKey: keys.summary,
    queryFn: () => api.get<EmployeeSummary>('/api/employees/summary'),
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: keys.departments,
    queryFn: () => api.get<{ departments: string[] }>('/api/employees/departments'),
    select: (data) => data.departments,
  });
}

function useEmployeeMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => client.invalidateQueries({ queryKey: keys.all }) });
}

export function useCreateEmployee() {
  return useEmployeeMutation<CreateEmployeeInput>((input) =>
    api.post<{ employee: Employee }>('/api/employees', input),
  );
}

export function useUpdateEmployee() {
  return useEmployeeMutation<{ id: string; input: UpdateEmployeeInput }>(({ id, input }) =>
    api.patch<{ employee: Employee }>(`/api/employees/${id}`, input),
  );
}

export function useDeleteEmployee() {
  return useEmployeeMutation<string>((id) => api.delete(`/api/employees/${id}`));
}
