import { describe, expect, it } from "vitest";
import { getInvoiceShares } from "./cashierInvoiceShares";

describe("getInvoiceShares (LYD 3dp Money Precision)", () => {
  it("avoids IEEE-754 floating-point drift on 3dp LYD values", () => {
    const result = getInvoiceShares({
      totalAmount: 0.3,
      patientShare: 0.2,
      insuranceShare: 0.1,
      paidAmount: 0.1,
      adjustmentAmount: 0,
      refundedAmount: 0,
    });

    expect(result.dueNow).toBe(0.1);
    expect(result.total).toBe(0.3);
    expect(result.isInsurance).toBe(true);
  });

  it("handles large 3dp insurance invoices and refunds accurately", () => {
    const result = getInvoiceShares({
      totalAmount: "1500.668",
      patientShare: "300.134",
      insuranceShare: "1200.534",
      paidAmount: "200.100",
      refundedAmount: "50.050",
    });

    expect(result.paid).toBe(150.05);
    expect(result.dueNow).toBe(150.084);
  });
});
