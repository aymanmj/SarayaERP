import { apiClient } from './apiClient';

export interface PurchaseRequestItem {
  productId: number;
  uomId: number;
  quantity: number;
}

export interface PurchaseRequestData {
  items: PurchaseRequestItem[];
  notes?: string;
  departmentId?: number;
}

export interface GoodsReceiptItem {
  productId: number;
  uomId: number;
  quantity: number;
  batchNumber: string;
  expiryDate: string;
}

export interface GoodsReceiptData {
  poId: number;
  warehouseId: number;
  items: GoodsReceiptItem[];
  notes?: string;
}

export const procurementApi = {
  createPurchaseRequest: async (data: PurchaseRequestData) => {
    const response = await apiClient.post('/purchases/pr', data);
    return response.data;
  },

  convertToPO: async (prId: number, supplierId: number) => {
    const response = await apiClient.post(`/purchases/pr/${prId}/convert-to-po`, {
      supplierId,
    });
    return response.data;
  },

  createGRN: async (data: GoodsReceiptData) => {
    const response = await apiClient.post('/purchases/grn', data);
    return response.data;
  },

  getPOs: async () => {
    const response = await apiClient.get('/procurement/orders');
    return response.data;
  },

  getPOById: async (id: number) => {
    const response = await apiClient.get(`/procurement/orders/${id}`);
    return response.data;
  },
};
