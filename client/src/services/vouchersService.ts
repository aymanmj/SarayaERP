import api from './api';

export enum VoucherType {
  PAYMENT = 'PAYMENT',
  RECEIPT = 'RECEIPT',
}

export enum VoucherStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

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

export const getVouchers = async (params?: any): Promise<Voucher[]> => {
  const response = await api.get('/vouchers', { params });
  return response.data;
};

export const getVoucher = async (id: number): Promise<Voucher> => {
  const response = await api.get(`/vouchers/${id}`);
  return response.data;
};

export const createVoucher = async (data: Partial<Voucher>): Promise<Voucher> => {
  const response = await api.post('/vouchers', data);
  return response.data;
};

export const updateVoucher = async (id: number, data: Partial<Voucher>): Promise<Voucher> => {
  const response = await api.put(`/vouchers/${id}`, data);
  return response.data;
};

export const deleteVoucher = async (id: number): Promise<void> => {
  await api.delete(`/vouchers/${id}`);
};

export const postVoucher = async (id: number): Promise<Voucher> => {
  const response = await api.post(`/vouchers/${id}/post`);
  return response.data;
};

export const cancelVoucher = async (id: number): Promise<Voucher> => {
  const response = await api.post(`/vouchers/${id}/cancel`);
  return response.data;
};
