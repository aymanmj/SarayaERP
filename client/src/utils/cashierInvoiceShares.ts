type CashierBalanceInput = {
  totalAmount: number;
  patientShare: number;
  insuranceShare: number;
  paidAmount: number;
  originalPatientShare?: number;
  adjustmentAmount?: number;
  refundedAmount?: number;
};

export function getInvoiceShares(inv: CashierBalanceInput) {
  const total = Number(inv.totalAmount) + Number(inv.adjustmentAmount ?? 0);
  const insurance = Number(inv.insuranceShare ?? 0);
  let patient = Number(inv.patientShare ?? 0);
  // Preserve the legacy fallback only when no explicit corrected liability was supplied.
  if (inv.originalPatientShare === undefined && inv.adjustmentAmount === undefined && insurance === 0 && patient === 0 && total > 0) patient = total;
  const refunded = Number(inv.refundedAmount ?? 0);
  const grossPaid = Number(inv.paidAmount);
  const paid = grossPaid - refunded;
  return { total, insurance, patient, paid, dueNow: Math.max(0, patient - paid), isInsurance: insurance > 0 };
}
