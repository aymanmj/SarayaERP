import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewPurchaseReturnPage from "./NewPurchaseReturnPage";
import { apiClient } from "../api/apiClient";
const { navigate, toast } = vi.hoisted(() => ({
  navigate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams("invoiceId=9")],
  useNavigate: () => navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { dir: () => "rtl" },
  }),
}));
vi.mock("sonner", () => ({ toast }));
const invoice = {
  id: 9,
  invoiceNumber: "SYN-009",
  currency: "LYD",
  status: "APPROVED",
  discountAmount: 0,
  vatAmount: 0,
  supplier: { name: "Synthetic supplier" },
  lines: [
    {
      id: 11,
      productId: 5,
      product: { name: "Synthetic drug", code: "DRUG" },
      quantity: 10,
      remainingReturnQuantity: 7,
      unitPrice: 10,
      batchNumber: "A",
      description: "First batch",
    },
    {
      id: 12,
      productId: 5,
      product: { name: "Synthetic drug", code: "DRUG" },
      quantity: 5,
      remainingReturnQuantity: 5,
      unitPrice: 20,
      batchNumber: "B",
      description: "Second batch",
    },
  ],
};
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  vi.mocked(apiClient.get).mockResolvedValue({ data: invoice });
  vi.mocked(apiClient.post).mockResolvedValue({});
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
const open = () =>
  render(
    <QueryClientProvider client={client}>
      <NewPurchaseReturnPage />
    </QueryClientProvider>,
  );
describe("Supplier purchase return line and retry contract", () => {
  it("selects a distinct original invoice line for repeated products", async () => {
    open();
    fireEvent.change(await screen.findByLabelText("الكمية المرجعة #12"), {
      target: { value: "2.000" },
    });
    fireEvent.change(screen.getByLabelText("سبب الإرجاع ومحضر تسليم البضاعة"), {
      target: { value: "Synthetic supplier handover evidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ وإصدار المرتجع" }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/purchases/returns",
        expect.objectContaining({
          purchaseInvoiceId: 9,
          requestId: expect.any(String),
          items: [
            {
              productId: 5,
              purchaseInvoiceLineId: 12,
              quantity: 2,
              description: "Second batch",
            },
          ],
        }),
      ),
    );
  });
  it("keeps the request UUID stable after a failed response and retry", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("network"));
    open();
    fireEvent.change(await screen.findByLabelText("الكمية المرجعة #11"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("سبب الإرجاع ومحضر تسليم البضاعة"), {
      target: { value: "Synthetic supplier handover evidence" },
    });
    const save = screen.getByRole("button", { name: "حفظ وإصدار المرتجع" });
    fireEvent.click(save);
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    fireEvent.click(save);
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    expect(vi.mocked(apiClient.post).mock.calls[0]).toEqual(
      vi.mocked(apiClient.post).mock.calls[1],
    );
  });
  it("rejects quantities beyond remaining returns and invalid precision including another negative line", async () => {
    open();
    const qty = await screen.findByLabelText("الكمية المرجعة #11");
    fireEvent.change(screen.getByLabelText("سبب الإرجاع ومحضر تسليم البضاعة"), {
      target: { value: "Synthetic supplier handover evidence" },
    });
    const save = screen.getByRole("button", { name: "حفظ وإصدار المرتجع" });
    for (const value of ["8", "1.0001", "-1"]) {
      fireEvent.change(qty, { target: { value } });
      expect(save).toBeDisabled();
    }
    fireEvent.change(qty, { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("الكمية المرجعة #12"), {
      target: { value: "-1" },
    });
    expect(save).toBeDisabled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
  it("keeps discounts and tax outside the supported posting scope", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...invoice, vatAmount: 15 },
    });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("مسار مطابقة");
    expect(
      screen.getByRole("button", { name: "حفظ وإصدار المرتجع" }),
    ).toBeDisabled();
  });
});
