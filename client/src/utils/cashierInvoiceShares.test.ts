import { describe, expect, it } from 'vitest';
import { getInvoiceShares } from './cashierInvoiceShares';

describe('Cashier liability after approved corrections', () => {
  it('keeps a fully credited invoice at zero instead of restoring the original debt', () => {
    expect(getInvoiceShares({ totalAmount: 100, patientShare: 0, originalPatientShare: 100, adjustmentAmount: -100, insuranceShare: 0, paidAmount: 0 })).toMatchObject({ total: 0, patient: 0, dueNow: 0 });
  });
  it('shows only the additional liability on a paid invoice with an approved debit', () => {
    expect(getInvoiceShares({ totalAmount: 100, patientShare: 150, originalPatientShare: 100, adjustmentAmount: 50, insuranceShare: 0, paidAmount: 100 })).toMatchObject({ total: 150, dueNow: 50 });
  });
  it('preserves legacy cash compatibility only when correction metadata is absent', () => {
    expect(getInvoiceShares({ totalAmount: 100, patientShare: 0, insuranceShare: 0, paidAmount: 20 }).dueNow).toBe(80);
  });
  it('keeps fully insured patient liability at zero without treating insurance as a patient debt', () => {
    expect(getInvoiceShares({ totalAmount: 100, patientShare: 0, insuranceShare: 100, paidAmount: 0 })).toMatchObject({ patient: 0, dueNow: 0, isInsurance: true });
  });
});
