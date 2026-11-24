import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { BudgetsCashFlowModal } from "./BudgetsCashFlowModal";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("BudgetsCashFlowModal (Batch 25 — Cash Flow & Tafqeet)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays reconciled cash flow statement with Arabic Tafqeet", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        startDate: "2026-01-01",
        endDate: "2026-11-30",
        openingCashBalance: "1000.000",
        netCashChange: "3800.000",
        closingCashBalance: "4800.000",
        reconciliationDifference: "0.000",
        closingCashTafqeet: "أربعة آلاف وثمانمائة دينار ليبي فقط لا غير",
        operatingActivities: [],
        investingActivities: [],
        financingActivities: [],
      },
    } as never);

    render(<BudgetsCashFlowModal onClose={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: /عرض قائمة التدفقات النقدية/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/4800\.000 LYD/)).toBeTruthy();
      expect(
        screen.getByText(/أربعة آلاف وثمانمائة دينار ليبي فقط لا غير/),
      ).toBeTruthy();
    });
  });
});
