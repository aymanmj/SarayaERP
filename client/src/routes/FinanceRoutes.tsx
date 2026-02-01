import { lazy } from "react";
import { Route } from "react-router-dom";

// --- Revenue Cycle (Cashier & Insurance) ---
const CashierPage = lazy(() => import("../pages/CashierPage"));
const CashierDailyReportPage = lazy(
  () => import("../pages/CashierDailyReportPage"),
);
const CashierUserReportPage = lazy(
  () => import("../pages/CashierUserReportPage"),
);
const CashierClosedShiftsPage = lazy(
  () => import("../pages/CashierClosedShiftsPage"),
);
const PaymentReceiptPage = lazy(() => import("../pages/PaymentReceiptPage"));
const PatientStatementPage = lazy(() => import("../pages/PatientStatementPage"));
const InvoicePrintPage = lazy(() => import("../pages/InvoicePrintPage"));
const InvoicesListPage = lazy(() => import("../pages/InvoicesListPage"));
const InvoiceDetailsPage = lazy(() => import("../pages/InvoiceDetailsPage"));
const InsuranceProvidersPage = lazy(
  () => import("../pages/InsuranceProvidersPage"),
);
const InsuranceProviderDetailsPage = lazy(
  () => import("../pages/InsuranceProviderDetailsPage"),
);
const PlanRulesPage = lazy(() => import("../pages/PlanRulesPage"));
const PreAuthPage = lazy(() => import("../pages/PreAuthPage"));
const InsuranceClaimsPage = lazy(() => import("../pages/InsuranceClaimsPage"));

// --- Procurement & Inventory ---
const SuppliersPage = lazy(() => import("../pages/SuppliersPage"));
const SupplierStatementPage = lazy(
  () => import("../pages/SupplierStatementPage"),
);
const SuppliersAgingPage = lazy(() => import("../pages/SuppliersAgingPage"));
const PurchaseInvoicesPage = lazy(() => import("../pages/PurchaseInvoicesPage"));
const PurchaseInvoiceDetailsPage = lazy(
  () => import("../pages/PurchaseInvoiceDetailsPage"),
);
const NewPurchaseReturnPage = lazy(
  () => import("../pages/NewPurchaseReturnPage"), // ✅ [NEW]
);
const InventoryTransfersPage = lazy(
  () => import("../pages/InventoryTransfersPage"),
);

// --- Assets ---
const AssetsPage = lazy(() => import("../pages/AssetsPage"));
const MaintenancePage = lazy(() => import("../pages/MaintenancePage"));
const DepreciationPage = lazy(() => import("../pages/DepreciationPage"));

// --- Accounting & Finance ---
const FinancialYearsPage = lazy(() => import("../pages/FinancialYearsPage"));
const ChartOfAccountsPage = lazy(() => import("../pages/ChartOfAccountsPage"));
const CostCentersPage = lazy(
  () => import("../pages/accounting/CostCentersPage"),
);
const OpeningBalancesPage = lazy(() => import("../pages/OpeningBalancesPage"));
const ManualEntryPage = lazy(() => import("../pages/ManualEntryPage"));
const AccountingJournalPage = lazy(
  () => import("../pages/AccountingJournalPage"),
);
const AccountingEntriesPage = lazy(
  () => import("../pages/AccountingEntriesPage"),
);
const GeneralLedgerPage = lazy(() => import("../pages/GeneralLedgerPage"));
const TrialBalancePage = lazy(() => import("../pages/TrialBalancePage"));
const IncomeStatementPage = lazy(() => import("../pages/IncomeStatementPage"));
const BalanceSheetPage = lazy(() => import("../pages/BalanceSheetPage"));
const PatientsAgingPage = lazy(() => import("../pages/PatientsAgingPage"));
const YearClosingPage = lazy(() => import("../pages/YearClosingPage"));

const ReportsDashboardPage = lazy(() => import("../pages/ReportsDashboardPage"));

export const FinanceRoutes = (
  <>
    {/* Cashier */}
    <Route path="/cashier" element={<CashierPage />} />
    <Route
      path="/cashier/reports/daily"
      element={<CashierDailyReportPage />}
    />
    <Route
      path="/cashier/reports/by-cashier"
      element={<CashierUserReportPage />}
    />
    <Route
      path="/cashier/shifts"
      element={<CashierClosedShiftsPage />}
    />
    <Route path="/invoices" element={<InvoicesListPage />} />
    <Route
      path="/billing/invoices/:id"
      element={<InvoiceDetailsPage />}
    />
    <Route
      path="/invoices/:id/print"
      element={<InvoicePrintPage />}
    />
    <Route
      path="/payments/:id/receipt"
      element={<PaymentReceiptPage />}
    />
    <Route
      path="/patients/:id/statement"
      element={<PatientStatementPage />}
    />

    {/* Insurance */}
    <Route
      path="/insurance/providers"
      element={<InsuranceProvidersPage />}
    />
    <Route
      path="/insurance/providers/:id"
      element={<InsuranceProviderDetailsPage />}
    />
    <Route path="/insurance/plans/:id" element={<PlanRulesPage />} />
    <Route path="/insurance/pre-auth" element={<PreAuthPage />} />
    <Route
      path="/insurance/claims"
      element={<InsuranceClaimsPage />}
    />

    {/* Procurement */}
    <Route path="/suppliers" element={<SuppliersPage />} />
    <Route
      path="/suppliers/:id/statement"
      element={<SupplierStatementPage />}
    />
    <Route path="/suppliers/aging" element={<SuppliersAgingPage />} />
    <Route path="/purchases/invoices" element={<PurchaseInvoicesPage />} />
    <Route
      path="/purchases/invoices/:id"
      element={<PurchaseInvoiceDetailsPage />}
    />
    <Route
      path="/purchases/returns/new"
      element={<NewPurchaseReturnPage />} // ✅ [NEW]
    />
    <Route
      path="/inventory/transfers"
      element={<InventoryTransfersPage />}
    />

    {/* Assets */}
    <Route path="/assets" element={<AssetsPage />} />
    <Route path="/assets/maintenance" element={<MaintenancePage />} />
    <Route
      path="/assets/depreciation"
      element={<DepreciationPage />}
    />

    {/* Accounting */}
    <Route path="/financial-years" element={<FinancialYearsPage />} />
    <Route
      path="/accounting/chart-of-accounts"
      element={<ChartOfAccountsPage />}
    />
    <Route
      path="/accounting/cost-centers"
      element={<CostCentersPage />}
    />
    <Route
      path="/accounting/opening-balances"
      element={<OpeningBalancesPage />}
    />
    <Route
      path="/accounting/manual-entry"
      element={<ManualEntryPage />}
    />
    <Route
      path="/accounting/journal"
      element={<AccountingJournalPage />}
    />
    <Route
      path="/accounting/entries"
      element={<AccountingEntriesPage />}
    />
    <Route
      path="/accounting/ledger"
      element={<GeneralLedgerPage />}
    />
    <Route
      path="/accounting/trial-balance"
      element={<TrialBalancePage />}
    />
    <Route
      path="/accounting/income-statement"
      element={<IncomeStatementPage />}
    />
    <Route
      path="/accounting/balance-sheet"
      element={<BalanceSheetPage />}
    />
    <Route
      path="/accounting/patients-aging"
      element={<PatientsAgingPage />}
    />
    <Route
      path="/accounting/year-closing"
      element={<YearClosingPage />}
    />

    {/* Reporting */}
    <Route path="/reports" element={<ReportsDashboardPage />} />
  </>
);
