import { Route } from "react-router-dom";
import { InventoryDashboardPage } from "../pages/inventory/InventoryDashboardPage";
import { InventoryCountListPage } from "../pages/inventory/InventoryCountListPage";
import { InventoryCountDetailsPage } from "../pages/inventory/InventoryCountDetailsPage";
import InventoryCountPrintPage from "../pages/inventory/InventoryCountPrintPage";

// Material Requests
import { MaterialRequestsPage } from "../pages/inventory/MaterialRequestsPage";
import { CreateMaterialRequestPage } from "../pages/inventory/CreateMaterialRequestPage";
import { MaterialRequestDetailsPage } from "../pages/inventory/MaterialRequestDetailsPage";

export const InventoryRoutes = (
  <>
    <Route path="/inventory/alerts" element={<InventoryDashboardPage />} />
    <Route path="/inventory/counts" element={<InventoryCountListPage />} />
    <Route path="/inventory/counts/:id" element={<InventoryCountDetailsPage />} />
    <Route path="/inventory/counts/:id/print" element={<InventoryCountPrintPage />} />
    
    <Route path="/inventory/material-requests" element={<MaterialRequestsPage />} />
    <Route path="/inventory/material-requests/new" element={<CreateMaterialRequestPage />} />
    <Route path="/inventory/material-requests/:id" element={<MaterialRequestDetailsPage />} />
  </>
);
