/** Routes. One layout, and the pages that live inside it. */

import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/shell/app-layout.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { CustomersPage } from './pages/customers-page.js';
import { LedgerPage } from './pages/ledger-page.js';
import { LedgerCustomerPage } from './pages/ledger-customer-page.js';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="ledger/:customerId" element={<LedgerCustomerPage />} />
        {/* Anything not built yet lands on the dashboard rather than a blank
            screen — the menu already says which pages those are. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
