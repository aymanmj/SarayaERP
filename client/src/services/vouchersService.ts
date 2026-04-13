import { apiClient } from '../api/apiClient';

export const VoucherType = {
  PAYMENT: 'PAYMENT',
  RECEIPT: 'RECEIPT',
} as const;
export type VoucherType = typeof VoucherType[keyof typeof VoucherType];

export const VoucherStatus = {
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  CANCELLED: 'CANCELLED',
} as const;
export type VoucherStatus = typeof VoucherStatus[keyof typeof VoucherStatus];

export interface Voucher {
  id: number;
  code?: string;
  type: VoucherType;
  status: VoucherStatus;
  date: string;
  amount: number;
  accountId: number;
  cashAccountId: number;
  notes?: string;
  payeeOrPayer?: string;
  reference?: string;
  account?: { id: number; code: string; name: string };
  cashAccount?: { id: number; code: string; name: string };
  createdBy?: { id: number; fullName: string };
  createdAt: string;
}

export type CreateVoucherDto = Partial<Voucher>;

export const getVouchers = async (params?: any): Promise<Voucher[]> => {
  const response = await apiClient.get('/accounting/vouchers', { params });
  return response.data;
};

export const getVoucher = async (id: number): Promise<Voucher> => {
  const response = await apiClient.get(`/accounting/vouchers/${id}`);
  return response.data;
};

export const createVoucher = async (data: Partial<Voucher>): Promise<Voucher> => {
  const response = await apiClient.post('/accounting/vouchers', data);
  return response.data;
};

export const updateVoucher = async (id: number, data: Partial<Voucher>): Promise<Voucher> => {
  const response = await apiClient.put(`/accounting/vouchers/${id}`, data);
  return response.data;
};

export const deleteVoucher = async (id: number): Promise<void> => {
  await apiClient.delete(`/accounting/vouchers/${id}`);
};

export const postVoucher = async (id: number): Promise<Voucher> => {
  const response = await apiClient.post(`/accounting/vouchers/${id}/post`);
  return response.data;
};

export const cancelVoucher = async (id: number): Promise<Voucher> => {
  const response = await apiClient.post(`/accounting/vouchers/${id}/cancel`);
  return response.data;
};
