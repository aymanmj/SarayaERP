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
  batchNumber?: string | null;
  expiryDate?: string | null;
  product?: {
    name: string;
    code: string | null;
    baseUomId?: number | null;
  };
}

// ==========================================
// API Methods
// ==========================================

export const inventoryApi = {
  // Warehouses
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

  // Material Requests
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
