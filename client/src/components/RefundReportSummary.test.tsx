import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RefundReportSummary } from "./RefundReportSummary";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

describe("RefundReportSummary", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders summary totals and row amounts with exact 3dp Money rounding", () => {
    render(
      <RefundReportSummary
        report={{
          refundsSummary: {
            totalAmount: 10.1245,
            cashAmount: 5.1255,
            totalCount: 1,
          },
          netPaymentsSummary: { totalAmount: 94.875 },
          refunds: [
            {
              id: 7,
              invoiceId: 44,
              paymentId: 88,
              amount: "10.125",
              method: "CASH",
              executedAt: "2026-11-27T10:00:00.000Z",
              executionReference: "CASH-7",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/10\.124 LYD/)).toBeInTheDocument();
    expect(screen.getByText(/5\.126 LYD/)).toBeInTheDocument();
    expect(screen.getByText(/94\.875 LYD/)).toBeInTheDocument();
    expect(screen.getByText("10.125")).toBeInTheDocument();
  });
});
