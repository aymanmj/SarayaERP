// src/routes/InventoryRoutes.tsx
import { Route } from "react-router-dom";
import { InventoryDashboardPage } from "../pages/inventory/InventoryDashboardPage";
import { InventoryCountListPage } from "../pages/inventory/InventoryCountListPage";
import { InventoryCountDetailsPage } from "../pages/inventory/InventoryCountDetailsPage";
import InventoryCountPrintPage from "../pages/inventory/InventoryCountPrintPage";

export const InventoryRoutes = (
  <>
    <Route path="/inventory/alerts" element={<InventoryDashboardPage />} />
    <Route path="/inventory/counts" element={<InventoryCountListPage />} />
    <Route path="/inventory/counts/:id" element={<InventoryCountDetailsPage />} />
    <Route path="/inventory/counts/:id/print" element={<InventoryCountPrintPage />} />
  </>
);
