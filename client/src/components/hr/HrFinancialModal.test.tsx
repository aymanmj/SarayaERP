import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { HrFinancialModal } from "./HrFinancialModal";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("HrFinancialModal (CAP11 — PayBasis, Advances, Deductions & EOS)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates employee pay basis classification to HOURLY", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: { id: 5 } } as never);

    render(<HrFinancialModal onClose={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText("معرّف الموظف (User ID)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByDisplayValue("مرتب شهري (MONTHLY)"), {
      target: { value: "HOURLY" },
    });
    fireEvent.click(screen.getByRole("button", { name: /حفظ تصنيف الصرف للموظف/i }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/hr/financial/employees/5/compensation",
        expect.objectContaining({ payBasis: "HOURLY" }),
      );
    });
  });

  it("approves pending employee advance and previews end-of-service indemnity", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes("/advances")) {
        return {
          data: [
            {
              id: 14,
              advanceNumber: "ADV-2026-0001",
              amount: "1500.000",
              installments: 3,
              monthlyDeduction: "500.000",
              remainingAmount: "1500.000",
              status: "PENDING",
              user: { id: 9, fullName: "Nurse Sara" },
            },
          ],
        } as never;
      }
      return { data: [] } as never;
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        calculation: {
          serviceYears: "6.000",
          lastMonthAmount: "100.000",
          leaveCompensationAmount: "1000.000",
          gratuityAmount: "10500.000",
          advancesDeduction: "1500.000",
          totalEarnings: "11600.000",
          totalDeductions: "1500.000",
          netAmount: "10100.000",
        },
      },
    } as never);

    render(<HrFinancialModal onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /السلف والقروض/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /اعتماد وصرف السلفة/i }),
    );
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/hr/financial/advances/14/approve",
        expect.objectContaining({ postAccounting: true }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /تصفية نهاية الخدمة/i }));
    fireEvent.change(screen.getByPlaceholderText("معرّف الموظف (نهاية الخدمة)"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /معاينة الحساب/i }));

    await waitFor(() => {
      expect(screen.getByText(/10100\.000 LYD/)).toBeTruthy();
    });
  });
});
