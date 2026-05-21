import { apiClient } from './apiClient';

// ==========================================
// Types
// ==========================================

export interface MaterialRequestItem {
  id?: number;
  productId: number;
  uomId?: number | null;
  requestedQty: number;
  issuedQty?: number;
  notes?: string | null;
  product?: {
    name: string;
    code: string | null;
    baseUom?: { name: string } | null;
  };
  uom?: {
    name: string;
  } | null;
}

export interface MaterialRequest {
  id: number;
  hospitalId: number;
  requestNumber: string;
  requestingWarehouseId: number;
  fulfillingWarehouseId: number;
  fromDepartmentId?: number | null;
  requestedById: number;
  approvedById?: number | null;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'PARTIALLY_ISSUED' | 'COMPLETED' | 'CANCELLED';
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  items?: MaterialRequestItem[];
  requestingWarehouse?: { name: string };
  fulfillingWarehouse?: { name: string };
  requestedBy?: { fullName: string };
  approvedBy?: { fullName: string };
  stockIssues?: StockIssue[];
  _count?: {
    items: number;
  };
}

export interface StockIssue {
  id: number;
  issueNumber: string;
  materialRequestId: number;
  issuedFromId: number;
  issuedById: number;
  status: 'ISSUED' | 'RECEIVED' | 'CANCELLED';
  notes?: string | null;
  createdAt: string;
  issuedBy?: { fullName: string };
  items?: StockIssueItem[];
}

export interface StockIssueItem {
  id: number;
  stockIssueId: number;
  productId: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  issuedQty: number;
}

export interface CreateMaterialRequestPayload {
  requestingWarehouseId: number;
  fulfillingWarehouseId: number;
  fromDepartmentId?: number;
  notes?: string;
  items: {
    productId: number;
    uomId?: number;
    requestedQty: number;
    notes?: string;
  }[];
}

export interface IssueMaterialRequestPayload {
  notes?: string;
  items?: {
    productId: number;
    quantity: number;
    batchNumber?: string;
  }[];
}

export interface ProductStock {
  id: number;
  hospitalId: number;
  warehouseId: number;
  productId: number;
  quantity: number;
  minStock: number;
  maxStock?: number | null;
  reorderLevel?: number | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  product?: {
    name: string;
    code: string | null;
    baseUomId?: number | null;
  };
}

// ==========================================
// Warehouse Types
// ==========================================

export interface WarehouseBin {
  id: number;
  zoneId: number;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  _count?: { productStocks: number };
}

export interface WarehouseZone {
  id: number;
  warehouseId: number;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  bins: WarehouseBin[];
}

export interface Warehouse {
  id: number;
  hospitalId: number;
  name: string;
  code?: string | null;
  isActive: boolean;
  zones?: WarehouseZone[];
  _count?: {
    zones: number;
    productStocks: number;
  };
}

export interface StockAlert {
  productId: number;
  productName: string;
  productCode: string | null;
  warehouseId: number;
  warehouseName: string;
  currentQty: number;
  minStock: number;
  reorderLevel?: number | null;
  maxStock?: number | null;
  alertType: 'OUT_OF_STOCK' | 'BELOW_MIN' | 'BELOW_REORDER' | 'ABOVE_MAX' | 'EXPIRING_SOON';
}

// ==========================================
// API Methods
// ==========================================

export const inventoryApi = {
  // ==========================================
  // Warehouses - Legacy (via /inventory/)
  // ==========================================
  getWarehouses: async () => {
    const { data } = await apiClient.get('/inventory/warehouses');
    return data;
  },

  getWarehouseStock: async (warehouseId: number, search?: string) => {
    const { data } = await apiClient.get(`/inventory/warehouses/${warehouseId}/stock`, {
      params: { q: search },
    });
    return data as ProductStock[];
  },

  // ==========================================
  // Warehouse Management CRUD (via /warehouses/)
  // ==========================================
  createWarehouse: async (payload: { name: string; code?: string; isActive?: boolean }) => {
    const { data } = await apiClient.post('/warehouses', payload);
    return data as Warehouse;
  },

  listWarehousesDetailed: async () => {
    const { data } = await apiClient.get('/warehouses');
    return data as Warehouse[];
  },

  getWarehouseDetails: async (id: number) => {
    const { data } = await apiClient.get(`/warehouses/${id}`);
    return data as Warehouse;
  },

  updateWarehouse: async (id: number, payload: { name?: string; code?: string; isActive?: boolean }) => {
    const { data } = await apiClient.put(`/warehouses/${id}`, payload);
    return data as Warehouse;
  },

  // Zones
  createZone: async (warehouseId: number, payload: { code: string; name: string; description?: string }) => {
    const { data } = await apiClient.post(`/warehouses/${warehouseId}/zones`, payload);
    return data as WarehouseZone;
  },

  updateZone: async (zoneId: number, payload: { name?: string; code?: string; description?: string; isActive?: boolean }) => {
    const { data } = await apiClient.put(`/warehouses/zones/${zoneId}`, payload);
    return data as WarehouseZone;
  },

  deleteZone: async (zoneId: number) => {
    const { data } = await apiClient.delete(`/warehouses/zones/${zoneId}`);
    return data;
  },

  // Bins
  createBin: async (zoneId: number, payload: { code: string; name: string; description?: string }) => {
    const { data } = await apiClient.post(`/warehouses/zones/${zoneId}/bins`, payload);
    return data as WarehouseBin;
  },

  updateBin: async (binId: number, payload: { name?: string; code?: string; description?: string; isActive?: boolean }) => {
    const { data } = await apiClient.put(`/warehouses/bins/${binId}`, payload);
    return data as WarehouseBin;
  },

  deleteBin: async (binId: number) => {
    const { data } = await apiClient.delete(`/warehouses/bins/${binId}`);
    return data;
  },

  // ==========================================
  // Stock Alerts
  // ==========================================
  getStockAlerts: async () => {
    const { data } = await apiClient.get('/inventory/alerts');
    return data;
  },

  // ==========================================
  // Stock Transfers
  // ==========================================
  transferStock: async (payload: {
    fromWarehouseId: number;
    toWarehouseId: number;
    items: { productId: number; quantity: number }[];
    notes?: string;
  }) => {
    const { data } = await apiClient.post('/inventory/transfer', payload);
    return data;
  },

  // ==========================================
  // Material Requests
  // ==========================================
  createMaterialRequest: async (payload: CreateMaterialRequestPayload) => {
    const { data } = await apiClient.post('/inventory/material-requests', payload);
    return data;
  },

  getMaterialRequests: async (filters?: { status?: string; search?: string }) => {
    const { data } = await apiClient.get('/inventory/material-requests', {
      params: {
        status: filters?.status,
        q: filters?.search,
      },
    });
    return data as MaterialRequest[];
  },

  getMaterialRequestById: async (id: number) => {
    const { data } = await apiClient.get(`/inventory/material-requests/${id}`);
    return data as MaterialRequest;
  },

  approveMaterialRequest: async (id: number) => {
    const { data } = await apiClient.post(`/inventory/material-requests/${id}/approve`);
    return data;
  },

  rejectMaterialRequest: async (id: number, notes?: string) => {
    const { data } = await apiClient.post(`/inventory/material-requests/${id}/reject`, { notes });
    return data;
  },

  issueMaterialRequest: async (id: number, payload: IssueMaterialRequestPayload) => {
    const { data } = await apiClient.post(`/inventory/material-requests/${id}/issue`, payload);
    return data;
  },

  // Stock Issues
  receiveStockIssue: async (id: number) => {
    const { data } = await apiClient.post(`/inventory/stock-issues/${id}/receive`);
    return data;
  },
};

