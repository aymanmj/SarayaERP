import { Route } from "react-router-dom";
import { InventoryDashboardPage } from "../pages/inventory/InventoryDashboardPage";
import { InventoryCountListPage } from "../pages/inventory/InventoryCountListPage";
import { InventoryCountDetailsPage } from "../pages/inventory/InventoryCountDetailsPage";
import InventoryCountPrintPage from "../pages/inventory/InventoryCountPrintPage";
import { WarehouseManagementPage } from "../pages/inventory/WarehouseManagementPage";
import { InventoryAlertsPage } from "../pages/inventory/InventoryAlertsPage";

import { MaterialRequestsPage } from "../pages/inventory/MaterialRequestsPage";
import { CreateMaterialRequestPage } from "../pages/inventory/CreateMaterialRequestPage";
import { MaterialRequestDetailsPage } from "../pages/inventory/MaterialRequestDetailsPage";

// Procurement
import { CreatePurchaseRequestPage } from "../pages/inventory/procurement/CreatePurchaseRequestPage";
import { CreateGoodsReceiptPage } from "../pages/inventory/procurement/CreateGoodsReceiptPage";
import { PurchaseOrdersPage } from "../pages/inventory/procurement/PurchaseOrdersPage";
import { CreatePurchaseOrderPage } from "../pages/inventory/procurement/CreatePurchaseOrderPage";
import { PurchaseOrderDetailPage } from "../pages/inventory/procurement/PurchaseOrderDetailPage";

// Settings & Master Data
import { ProductUOMManagementPage } from "../pages/inventory/ProductUOMManagementPage";
import { ItemCategoriesManagementPage } from "../pages/inventory/master-data/ItemCategoriesManagementPage";
import { ProductsMasterDataPage } from "../pages/inventory/master-data/ProductsMasterDataPage";
import { UOMManagementPage } from "../pages/inventory/master-data/UOMManagementPage";

export const InventoryRoutes = (
  <>
    {/* Supply Chain Dashboard */}
    <Route path="/inventory/dashboard" element={<InventoryDashboardPage />} />
    <Route path="/inventory/alerts" element={<InventoryAlertsPage />} />

    {/* Warehouse Management */}
    <Route path="/inventory/warehouses" element={<WarehouseManagementPage />} />

    {/* Inventory Counts */}
    <Route path="/inventory/counts" element={<InventoryCountListPage />} />
    <Route path="/inventory/counts/:id" element={<InventoryCountDetailsPage />} />
    <Route path="/inventory/counts/:id/print" element={<InventoryCountPrintPage />} />
    
    {/* Material Requests */}
    <Route path="/inventory/material-requests" element={<MaterialRequestsPage />} />
    <Route path="/inventory/material-requests/new" element={<CreateMaterialRequestPage />} />
    <Route path="/inventory/material-requests/:id" element={<MaterialRequestDetailsPage />} />
    
    {/* Procurement */}
    <Route path="/inventory/procurement/pr/new" element={<CreatePurchaseRequestPage />} />
    <Route path="/inventory/procurement/grn/new" element={<CreateGoodsReceiptPage />} />
    <Route path="/purchases/orders" element={<PurchaseOrdersPage />} />
    <Route path="/purchases/orders/new" element={<CreatePurchaseOrderPage />} />
    <Route path="/purchases/orders/:id" element={<PurchaseOrderDetailPage />} />

    {/* Master Data */}
    <Route path="/inventory/settings/product-uoms" element={<ProductUOMManagementPage />} />
    <Route path="/inventory/master-data/categories" element={<ItemCategoriesManagementPage />} />
    <Route path="/inventory/master-data/products" element={<ProductsMasterDataPage />} />
    <Route path="/inventory/master-data/uoms" element={<UOMManagementPage />} />
  </>
);

