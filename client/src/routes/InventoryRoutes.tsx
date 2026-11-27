import { lazy } from "react";
import { Route } from "react-router-dom";

const ConsumptionOperationsPage = lazy(() =>
  import("../pages/inventory/ConsumptionOperationsPage").then((m) => ({
    default: m.ConsumptionOperationsPage,
  })),
);
const InventoryDashboardPage = lazy(() =>
  import("../pages/inventory/InventoryDashboardPage").then((m) => ({
    default: m.InventoryDashboardPage,
  })),
);
const InventoryCountListPage = lazy(() =>
  import("../pages/inventory/InventoryCountListPage").then((m) => ({
    default: m.InventoryCountListPage,
  })),
);
const InventoryCountDetailsPage = lazy(() =>
  import("../pages/inventory/InventoryCountDetailsPage").then((m) => ({
    default: m.InventoryCountDetailsPage,
  })),
);
const InventoryCountPrintPage = lazy(
  () => import("../pages/inventory/InventoryCountPrintPage"),
);
const WarehouseManagementPage = lazy(() =>
  import("../pages/inventory/WarehouseManagementPage").then((m) => ({
    default: m.WarehouseManagementPage,
  })),
);
const InventoryAlertsPage = lazy(() =>
  import("../pages/inventory/InventoryAlertsPage").then((m) => ({
    default: m.InventoryAlertsPage,
  })),
);

const MaterialRequestsPage = lazy(() =>
  import("../pages/inventory/MaterialRequestsPage").then((m) => ({
    default: m.MaterialRequestsPage,
  })),
);
const CreateMaterialRequestPage = lazy(() =>
  import("../pages/inventory/CreateMaterialRequestPage").then((m) => ({
    default: m.CreateMaterialRequestPage,
  })),
);
const MaterialRequestDetailsPage = lazy(() =>
  import("../pages/inventory/MaterialRequestDetailsPage").then((m) => ({
    default: m.MaterialRequestDetailsPage,
  })),
);

// Procurement
const CreatePurchaseRequestPage = lazy(() =>
  import("../pages/inventory/procurement/CreatePurchaseRequestPage").then((m) => ({
    default: m.CreatePurchaseRequestPage,
  })),
);
const CreateGoodsReceiptPage = lazy(() =>
  import("../pages/inventory/procurement/CreateGoodsReceiptPage").then((m) => ({
    default: m.CreateGoodsReceiptPage,
  })),
);
const PurchaseOrdersPage = lazy(() =>
  import("../pages/inventory/procurement/PurchaseOrdersPage").then((m) => ({
    default: m.PurchaseOrdersPage,
  })),
);
const CreatePurchaseOrderPage = lazy(() =>
  import("../pages/inventory/procurement/CreatePurchaseOrderPage").then((m) => ({
    default: m.CreatePurchaseOrderPage,
  })),
);
const PurchaseOrderDetailPage = lazy(() =>
  import("../pages/inventory/procurement/PurchaseOrderDetailPage").then((m) => ({
    default: m.PurchaseOrderDetailPage,
  })),
);

// Settings & Master Data
const ProductUOMManagementPage = lazy(() =>
  import("../pages/inventory/ProductUOMManagementPage").then((m) => ({
    default: m.ProductUOMManagementPage,
  })),
);
const ItemCategoriesManagementPage = lazy(() =>
  import("../pages/inventory/master-data/ItemCategoriesManagementPage").then((m) => ({
    default: m.ItemCategoriesManagementPage,
  })),
);
const ProductsMasterDataPage = lazy(() =>
  import("../pages/inventory/master-data/ProductsMasterDataPage").then((m) => ({
    default: m.ProductsMasterDataPage,
  })),
);
const UOMManagementPage = lazy(() =>
  import("../pages/inventory/master-data/UOMManagementPage").then((m) => ({
    default: m.UOMManagementPage,
  })),
);

export const InventoryRoutes = (
  <>
    {/* Supply Chain Dashboard */}
    <Route path="/inventory/dashboard" element={<InventoryDashboardPage />} />
    <Route path="/inventory/alerts" element={<InventoryAlertsPage />} />
    <Route path="/inventory/consumption-operations" element={<ConsumptionOperationsPage />} />

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

