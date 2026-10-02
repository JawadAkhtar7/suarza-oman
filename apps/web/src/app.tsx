/** Routes. One layout, and the pages that live inside it. */

import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/shell/app-layout.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { CustomersPage } from './pages/customers-page.js';
import { LedgerPage } from './pages/ledger-page.js';
import { ProductsPage } from './pages/products-page.js';
import { ProductPage } from './pages/product-page.js';
import { EmployeesPage } from './pages/employees-page.js';
import { DocumentsPage } from './pages/documents-page.js';
import { DocumentFormPage } from './pages/document-form-page.js';
import { DocumentPage } from './pages/document-page.js';
import { ReportsPage } from './pages/reports-page.js';
import { LedgerCustomerPage } from './pages/ledger-customer-page.js';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        {/* The same screen, filtered — see CustomersPageProps. */}
        <Route path="vendors" element={<CustomersPage vendorsOnly />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:productId" element={<ProductPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        {/* All four kinds share the list, the form and the detail screen; each
            is told which one it is and takes its wording from DOCUMENT_UI. */}
        <Route path="sales" element={<DocumentsPage kind="SALE" />} />
        <Route path="sales/new" element={<DocumentFormPage kind="SALE" />} />
        <Route path="sales/:documentId" element={<DocumentPage kind="SALE" />} />
        <Route path="sales-returns" element={<DocumentsPage kind="SALE_RETURN" />} />
        <Route path="sales-returns/new" element={<DocumentFormPage kind="SALE_RETURN" />} />
        <Route path="sales-returns/:documentId" element={<DocumentPage kind="SALE_RETURN" />} />
        <Route path="purchases" element={<DocumentsPage kind="PURCHASE" />} />
        <Route path="purchases/new" element={<DocumentFormPage kind="PURCHASE" />} />
        <Route path="purchases/:documentId" element={<DocumentPage kind="PURCHASE" />} />
        <Route path="purchase-returns" element={<DocumentsPage kind="PURCHASE_RETURN" />} />
        <Route
          path="purchase-returns/new"
          element={<DocumentFormPage kind="PURCHASE_RETURN" />}
        />
        <Route
          path="purchase-returns/:documentId"
          element={<DocumentPage kind="PURCHASE_RETURN" />}
        />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="ledger/:customerId" element={<LedgerCustomerPage />} />
        {/* Anything not built yet lands on the dashboard rather than a blank
            screen — the menu already says which pages those are. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
