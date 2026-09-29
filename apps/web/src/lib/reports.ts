/** The overview report. */

import { useQuery } from '@tanstack/react-query';
import { api, queryString } from './api.js';

export interface ReportsOverview {
  from: string;
  to: string;
  sales: { count: number; net_baisa: number; vat_baisa: number; total_baisa: number };
  purchases: { count: number; net_baisa: number; vat_baisa: number; total_baisa: number };
  margin_baisa: number;
  receivable_baisa: number;
  payable_baisa: number;
  stock_value_baisa: number;
  series: { date: string; sales: number; purchases: number }[];
  top_products: { name: string; quantity_milli: number; revenue_baisa: number }[];
  top_customers: { name: string; count: number; revenue_baisa: number }[];
  stock_by_category: { category: string; value_baisa: number }[];
}

export function useReportsOverview(from: Date, to: Date) {
  return useQuery({
    queryKey: ['reports', 'overview', from.toISOString(), to.toISOString()],
    queryFn: () =>
      api.get<ReportsOverview>(
        `/api/reports/overview${queryString({ from: from.toISOString(), to: to.toISOString() })}`,
      ),
  });
}
