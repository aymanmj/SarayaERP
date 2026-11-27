import { describe, expect, it } from "vitest";
import { buildStatementRows } from "./patientStatementBalance";

describe("buildStatementRows", () => {
  it("computes exact decimal running balances without floating-point drift or -0.000", () => {
    const rows = buildStatementRows({
      formatMethod: (m) => m,
      invoices: [
        {
          id: 1,
          totalAmount: "0.250",
          discountAmount: "0.050",
          createdAt: "2026-11-27T08:00:00.000Z",
          encounter: null,
        },
        {
          id: 2,
          totalAmount: "0.100",
          discountAmount: "0.000",
          createdAt: "2026-11-27T09:00:00.000Z",
          encounter: { id: 10, type: "OPD" },
        },
      ],
      payments: [
        {
          id: 11,
          amount: "0.300",
          method: "CASH",
          paidAt: "2026-11-27T10:00:00.000Z",
          invoice: { id: 1 },
        },
      ],
      refunds: [
        {
          id: 21,
          invoiceId: 1,
          paymentId: 11,
          amount: "0.050",
          method: "CASH",
          executedAt: "2026-11-27T11:00:00.000Z",
          executionReference: "REF-21",
        },
      ],
    });

    expect(rows.map((r) => r.balance)).toEqual([0.2, 0.3, 0, 0.05]);
    expect(Object.is(rows[2].balance, -0)).toBe(false);
  });
});
