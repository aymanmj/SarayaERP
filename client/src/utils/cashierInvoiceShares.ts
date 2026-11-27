import { Money } from "./money";

type CashierBalanceInput = {
  totalAmount: number | string;
  patientShare: number | string;
  insuranceShare: number | string;
  paidAmount: number | string;
  originalPatientShare?: number | string;
  adjustmentAmount?: number | string;
  refundedAmount?: number | string;
};

export function getInvoiceShares(inv: CashierBalanceInput) {
  const totalDec = Money.decimal(inv.totalAmount).plus(
    Money.decimal(inv.adjustmentAmount ?? 0),
  );
  const insuranceDec = Money.decimal(inv.insuranceShare ?? 0);
  let patientDec = Money.decimal(inv.patientShare ?? 0);
  // Preserve the legacy fallback only when no explicit corrected liability was supplied.
  if (
    inv.originalPatientShare === undefined &&
    inv.adjustmentAmount === undefined &&
    insuranceDec.isZero() &&
    patientDec.isZero() &&
    totalDec.gt(0)
  ) {
    patientDec = totalDec;
  }
  const refundedDec = Money.decimal(inv.refundedAmount ?? 0);
  const grossPaidDec = Money.decimal(inv.paidAmount);
  const paidDec = grossPaidDec.minus(refundedDec);
  const rawDue = patientDec.minus(paidDec);
  const dueNowDec = rawDue.gt(0) ? rawDue : Money.decimal(0);

  return {
    total: Number(Money.toDbString(totalDec)),
    insurance: Number(Money.toDbString(insuranceDec)),
    patient: Number(Money.toDbString(patientDec)),
    paid: Number(Money.toDbString(paidDec)),
    dueNow: Number(Money.toDbString(dueNowDec)),
    isInsurance: insuranceDec.gt(0),
  };
}
