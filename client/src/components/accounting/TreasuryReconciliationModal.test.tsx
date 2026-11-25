import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TreasuryReconciliationModal } from "./TreasuryReconciliationModal";
import { apiClient } from "../../api/apiClient";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("TreasuryReconciliationModal (CAP09)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/accounting/treasury/currencies") {
        return {
          data: [
            {
              id: 1,
              code: "LYD",
              nameAr: "دينار ليبي",
              nameEn: "Libyan Dinar",
              symbol: "د.ل",
              decimalPlaces: 3,
              isBase: true,
            },
            {
              id: 2,
              code: "USD",
              nameAr: "دولار أمريكي",
              nameEn: "US Dollar",
              symbol: "$",
              decimalPlaces: 2,
              isBase: false,
            },
          ],
        } as never;
      }
      if (url === "/accounting/treasury/exchange-rates") {
        return {
          data: [
            {
              id: 10,
              rate: "4.825500",
              inverseRate: "0.207232",
              effectiveDate: "2026-11-24T00:00:00.000Z",
              source: "CBL_OFFICIAL",
              referenceNote: null,
              isVerified: false,
              fromCurrency: {
                id: 2,
                code: "USD",
                nameAr: "دولار أمريكي",
                nameEn: "US Dollar",
                symbol: "$",
                decimalPlaces: 2,
                isBase: false,
              },
              toCurrency: {
                id: 1,
                code: "LYD",
                nameAr: "دينار ليبي",
                nameEn: "Libyan Dinar",
                symbol: "د.ل",
                decimalPlaces: 3,
                isBase: true,
              },
            },
          ],
        } as never;
      }
      if (url === "/accounting/treasury/bank-accounts") {
        return {
          data: [
            {
              id: 5,
              bankName: "مصرف الجمهورية",
              branchName: "طرابلس",
              accountNumber: "011-00445566",
              account: { id: 101, code: "101100", name: "البنك الرئيسي" },
              currency: { id: 1, code: "LYD", symbol: "د.ل" },
            },
          ],
        } as never;
      }
      if (url === "/accounting/treasury/reconciliations") {
        return {
          data: [
            {
              id: 30,
              statementNumber: "STMT-2026-11",
              periodStart: "2026-11-01T00:00:00.000Z",
              periodEnd: "2026-11-30T00:00:00.000Z",
              openingBalanceBank: "0.000",
              closingBalanceBank: "1991.375",
              bookBalanceAsOfEnd: "1991.375",
              reconciledBalance: "1991.375",
              differenceAmount: "0.000",
              status: "PENDING_APPROVAL",
              bankAccount: {
                id: 5,
                bankName: "مصرف الجمهورية",
                branchName: "طرابلس",
                accountNumber: "011-00445566",
                account: { id: 101, code: "101100", name: "البنك الرئيسي" },
                currency: { id: 1, code: "LYD", symbol: "د.ل" },
              },
            },
          ],
        } as never;
      }
      if (url === "/accounting/treasury/fx-revaluations") {
        return {
          data: [
            {
              id: 71,
              asOfDate: "2026-11-30T00:00:00.000Z",
              currencyCode: "USD",
              foreignBalance: "1000.000",
              bookBalanceBase: "4800.000",
              closingRate: "4.950000",
              revaluedBalanceBase: "4950.000",
              unrealizedGainLoss: "150.000",
              accountingEntryId: 999,
              bankAccount: {
                id: 5,
                bankName: "مصرف الجمهورية",
                accountNumber: "011-00445566",
              },
            },
          ],
        } as never;
      }
      return { data: [] } as never;
    });

    vi.mocked(apiClient.post).mockResolvedValue({ data: { ok: true } } as never);
  });

  it("displays 6-decimal FX rates and supports 4-eyes rate verification", async () => {
    render(<TreasuryReconciliationModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("USD / LYD")).toBeInTheDocument();
      expect(screen.getByText("4.825500")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "اعتماد السعر" }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/accounting/treasury/exchange-rates/10/verify",
      );
    });
  });

  it("switches to bank reconciliation tab and triggers 4-eyes approval close", async () => {
    render(<TreasuryReconciliationModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/التسوية البنكية \(1\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /التسوية البنكية \(1\)/ }));

    await waitFor(() => {
      expect(screen.getByText("STMT-2026-11")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "اعتماد وإغلاق (4 عيون)" }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/accounting/treasury/reconciliations/30/approve-close",
      );
    });
  });

  it("switches to FX revaluation tab, displays history, and submits new revaluation run", async () => {
    render(<TreasuryReconciliationModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/إعادة التقييم \(1\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /إعادة التقييم \(1\)/ }));

    await waitFor(() => {
      expect(screen.getByText("GL #999")).toBeInTheDocument();
      expect(screen.getByText("4.950000")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("الحساب البنكي الأجنبي"), {
      target: { value: "5" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/الرصيد بالعملة الأجنبية/),
      { target: { value: "2500.000" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "تشغيل إعادة التقييم وترحيل القيد" }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/accounting/treasury/fx-revaluations",
        expect.objectContaining({
          bankAccountId: 5,
          foreignBalance: "2500.000",
        }),
      );
    });
  });
});
