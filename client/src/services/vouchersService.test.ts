import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  getVouchers,
  getVoucher,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  postVoucher,
  cancelVoucher,
  VoucherType,
  VoucherStatus,
} from './vouchersService';
import { apiClient } from '../api/apiClient';

describe('vouchersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockVoucher = {
    id: 1,
    code: 'VCH-001',
    type: VoucherType.PAYMENT as any,
    status: VoucherStatus.DRAFT as any,
    date: '2026-04-22',
    amount: 5000,
    accountId: 10,
    cashAccountId: 20,
    notes: 'Supplier payment',
    createdAt: '2026-04-22T10:00:00Z',
  };

  // ─── getVouchers ───────────────────────────────────────────
  describe('getVouchers', () => {
    it('should fetch all vouchers', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [mockVoucher],
      });

      const result = await getVouchers();

      expect(apiClient.get).toHaveBeenCalledWith('/accounting/vouchers', { params: undefined });
      expect(result).toEqual([mockVoucher]);
    });

    it('should pass query params for filtering', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [],
      });

      await getVouchers({ type: 'PAYMENT', status: 'POSTED' });

      expect(apiClient.get).toHaveBeenCalledWith('/accounting/vouchers', {
        params: { type: 'PAYMENT', status: 'POSTED' },
      });
    });
  });

  // ─── getVoucher ────────────────────────────────────────────
  describe('getVoucher', () => {
    it('should fetch a single voucher by ID', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: mockVoucher,
      });

      const result = await getVoucher(1);

      expect(apiClient.get).toHaveBeenCalledWith('/accounting/vouchers/1');
      expect(result).toEqual(mockVoucher);
    });
  });

  // ─── createVoucher ─────────────────────────────────────────
  describe('createVoucher', () => {
    it('should create a new voucher', async () => {
      const newVoucher = { ...mockVoucher, id: 2, code: 'VCH-002' };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: newVoucher,
      });

      const payload = {
        type: VoucherType.RECEIPT as any,
        amount: 3000,
        accountId: 5,
        cashAccountId: 10,
        date: '2026-04-22',
      };

      const result = await createVoucher(payload);

      expect(apiClient.post).toHaveBeenCalledWith('/accounting/vouchers', payload);
      expect(result.id).toBe(2);
    });
  });

  // ─── updateVoucher ─────────────────────────────────────────
  describe('updateVoucher', () => {
    it('should update an existing voucher', async () => {
      const updated = { ...mockVoucher, amount: 7500, notes: 'Updated' };
      (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: updated,
      });

      const result = await updateVoucher(1, { amount: 7500, notes: 'Updated' });

      expect(apiClient.put).toHaveBeenCalledWith('/accounting/vouchers/1', {
        amount: 7500,
        notes: 'Updated',
      });
      expect(result.amount).toBe(7500);
    });
  });

  // ─── deleteVoucher ─────────────────────────────────────────
  describe('deleteVoucher', () => {
    it('should delete a voucher', async () => {
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

      await deleteVoucher(1);

      expect(apiClient.delete).toHaveBeenCalledWith('/accounting/vouchers/1');
    });
  });

  // ─── postVoucher ───────────────────────────────────────────
  describe('postVoucher', () => {
    it('should post (finalize) a voucher', async () => {
      const posted = { ...mockVoucher, status: VoucherStatus.POSTED };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: posted,
      });

      const result = await postVoucher(1);

      expect(apiClient.post).toHaveBeenCalledWith('/accounting/vouchers/1/post');
      expect(result.status).toBe('POSTED');
    });
  });

  // ─── cancelVoucher ─────────────────────────────────────────
  describe('cancelVoucher', () => {
    it('should cancel a voucher', async () => {
      const cancelled = { ...mockVoucher, status: VoucherStatus.CANCELLED };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: cancelled,
      });

      const result = await cancelVoucher(1);

      expect(apiClient.post).toHaveBeenCalledWith('/accounting/vouchers/1/cancel');
      expect(result.status).toBe('CANCELLED');
    });
  });

  // ─── Constants ─────────────────────────────────────────────
  describe('Type Constants', () => {
    it('should have correct VoucherType values', () => {
      expect(VoucherType.PAYMENT).toBe('PAYMENT');
      expect(VoucherType.RECEIPT).toBe('RECEIPT');
    });

    it('should have correct VoucherStatus values', () => {
      expect(VoucherStatus.DRAFT).toBe('DRAFT');
      expect(VoucherStatus.POSTED).toBe('POSTED');
      expect(VoucherStatus.CANCELLED).toBe('CANCELLED');
    });
  });
});
