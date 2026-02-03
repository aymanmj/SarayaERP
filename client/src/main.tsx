// src/main.tsx

import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles.css";
import { Toaster } from "sonner";
import { useAuthStore } from "./stores/authStore";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { MainLayout } from "./layout/MainLayout";

// 1. Static Imports
import { LoginPage } from "./pages/LoginPage";
import ActivationPage from "./pages/ActivationPage";

// 2. Modular Routes
import { ClinicalRoutes } from "./routes/ClinicalRoutes";
import { FinanceRoutes } from "./routes/FinanceRoutes";
import { AdminRoutes } from "./routes/AdminRoutes";
import { InventoryRoutes } from "./routes/InventoryRoutes";

// 3. Core Dashboard
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);

// Print Pages (outside MainLayout)
const InvoicePrintCleanPage = lazy(() => import("./pages/InvoicePrintCleanPage"));
const InvoicePrintPDFPage = lazy(() => import("./pages/InvoicePrintPDFPage"));
const PaymentReceiptPrintPage = lazy(() => import("./pages/PaymentReceiptPrintPage"));

// --- Component Loader ---
const PageLoader = () => (
  <div className="h-full w-full flex flex-col items-center justify-center text-slate-500 min-h-[60vh]">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500 mb-4"></div>
    <div className="text-sm animate-pulse">جارِ تحميل النظام...</div>
  </div>
);

// Hydrate Session
if (typeof window !== "undefined") {
  useAuthStore.getState().hydrateFromStorage();
}

// React Query
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Optional: customize defaults
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster richColors position="top-center" closeButton />

        {/* Suspense Wraps the App for Lazy Loading */}
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/activation" element={<ActivationPage />} />

            {/* Print Routes - Outside MainLayout */}
            <Route path="/invoices/:id/print" element={<InvoicePrintCleanPage />} />
            <Route path="/invoices/:id/pdf" element={<InvoicePrintPDFPage />} />
            <Route path="/payments/:id/receipt/print" element={<PaymentReceiptPrintPage />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<MainLayout />}>
                {/* Dashboard */}
                <Route path="/" element={<DashboardPage />} />

                {/* Module Routes */}
                {ClinicalRoutes}
                {FinanceRoutes}
                {AdminRoutes}
                {InventoryRoutes}
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
