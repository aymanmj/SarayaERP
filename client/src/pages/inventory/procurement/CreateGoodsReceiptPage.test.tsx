import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateGoodsReceiptPage } from "./CreateGoodsReceiptPage";
import { apiClient } from "@/api/apiClient";
import { procurementApi } from "@/api/procurementApi";
const auth = vi.hoisted(() => ({
  permissions: ["inventory:view", "inventory:manage"],
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, hospitalId: 1 },
    hasPermission: (p: string) => auth.permissions.includes(p),
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));
vi.mock("@/api/apiClient", () => ({ apiClient: { get: vi.fn() } }));
vi.mock("@/api/procurementApi", () => ({
  procurementApi: { createGRN: vi.fn() },
}));
let client: QueryClient;
const order = {
  id: 7,
  poNumber: "SYNTHETIC-PO",
  status: "SENT",
  items: [
    {
      id: 11,
      productId: 2,
      uomId: 3,
      remainingQuantity: "2.000",
      product: { name: "Synthetic drug" },
      uom: { name: "Ordered box" },
    },
    {
      id: 12,
      productId: 4,
      uomId: 3,
      remainingQuantity: "1.000",
      product: { name: "Undelivered drug" },
      uom: { name: "Ordered box" },
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  auth.permissions = ["inventory:view", "inventory:manage"];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  vi.mocked(apiClient.get).mockImplementation(async (url) => ({
    data: String(url).endsWith("/warehouses")
      ? [{ id: 8, name: "Synthetic warehouse" }]
      : String(url).endsWith("/orders")
        ? [order]
        : order,
  }));
  vi.mocked(procurementApi.createGRN).mockResolvedValue({ id: 1 });
});
afterEach(() => {
  cleanup();
  client.clear();
});
const open = () =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<CreateGoodsReceiptPage />} />
          <Route
            path="/inventory/dashboard"
            element={<p>Receiving finished</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
async function select() {
  await screen.findByRole("option", { name: "SYNTHETIC-PO" });
  fireEvent.change(screen.getByLabelText("Purchase order"), {
    target: { value: "7" },
  });
  await screen.findByLabelText("Quantity 11");
  fireEvent.change(screen.getByLabelText("Receiving warehouse"), {
    target: { value: "8" },
  });
}
async function fill() {
  await select();
  fireEvent.change(screen.getByLabelText("Quantity 11"), {
    target: { value: "1.000" },
  });
  fireEvent.change(screen.getByLabelText("Batch 11"), {
    target: { value: " BATCH " },
  });
  fireEvent.change(screen.getByLabelText("Expiry 11"), {
    target: { value: "2030-01-01" },
  });
}
describe("Receiving only the ordered goods", () => {
  it("does not grant receiving to readers", async () => {
    auth.permissions = ["inventory:view"];
    open();
    await screen.findByText("Inventory management permission is required");
    expect(
      screen.queryByRole("button", { name: "Confirm receipt" }),
    ).not.toBeInTheDocument();
  });
  it("requires explicit delivered quantities rather than copying the whole remaining order", async () => {
    open();
    await select();
    expect(screen.getByLabelText("Quantity 11")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Confirm receipt" }),
    ).toBeDisabled();
    expect(screen.getAllByText("Ordered box")).toHaveLength(2);
  });
  it("sends exact quantities and line identities while omitting undelivered lines", async () => {
    open();
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm receipt" }));
    await screen.findByText("Receiving finished");
    expect(procurementApi.createGRN).toHaveBeenCalledWith({
      poId: 7,
      warehouseId: 8,
      requestId: expect.any(String),
      notes: undefined,
      items: [
        {
          purchaseOrderItemId: 11,
          productId: 2,
          uomId: 3,
          quantity: "1.000",
          batchNumber: "BATCH",
          expiryDate: "2030-01-01T00:00:00.000Z",
        },
      ],
    });
  });
  it("keeps a frozen retry payload even when the order cache changes after a lost response", async () => {
    vi.mocked(procurementApi.createGRN).mockRejectedValueOnce(
      new Error("Synthetic lost response"),
    );
    open();
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm receipt" }));
    await screen.findByText(/Could not confirm receipt/);
    expect(screen.getByLabelText("Quantity 11")).toBeDisabled();
    act(() => {
      client.setQueryData(["receipt-order", 1, 1, "7"], {
        ...order,
        status: "COMPLETED",
      });
    });
    expect(
      screen.getByRole("button", { name: "Confirm receipt" }),
    ).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm receipt" }));
    await screen.findByText("Receiving finished");
    const calls = vi.mocked(procurementApi.createGRN).mock.calls;
    expect(calls[1]?.[0]).toEqual(calls[0]?.[0]);
  });
  it("allows correction after a definitive validation rejection", async () => {
    vi.mocked(procurementApi.createGRN).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "Synthetic remaining quantity exceeded" },
      },
    });
    open();
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm receipt" }));
    await screen.findByText("Synthetic remaining quantity exceeded");
    expect(screen.getByLabelText("Quantity 11")).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Refresh remaining quantities" }),
    ).not.toBeDisabled();
  });
});
