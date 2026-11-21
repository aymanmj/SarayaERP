import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { RecallSupplierReceipts } from "./RecallSupplierReceipts";

vi.mock("../../api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: "en" } }),
}));

it("checks the outstanding quantity and submits the original movement with receipt evidence", async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: {
    returnId: 3, supplier: "Synthetic supplier", returnedQuantity: "3",
    acknowledgedQuantity: "2.5", outstandingQuantity: "0.5", records: [], nextBefore: null,
  } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  render(<QueryClientProvider client={new QueryClient()}>
    <RecallSupplierReceipts stockId={4} movementId={13} recallKey={["recall"]} onClose={() => undefined} />
  </QueryClientProvider>);
  const prefix = "inventory.recall.supplierReceipt.";
  const quantity = await screen.findByLabelText(prefix + "quantity");
  const time = "2020-01-15T13:00";
  fireEvent.change(quantity, { target: { value: "0.501" } });
  fireEvent.change(screen.getByLabelText(prefix + "evidenceReference"), { target: { value: "PROOF-123" } });
  fireEvent.change(screen.getByLabelText(prefix + "receivedBy"), { target: { value: "Synthetic representative" } });
  fireEvent.change(screen.getByLabelText(new RegExp(prefix + "receivedAt")), { target: { value: time } });
  const save = screen.getByRole("button", { name: prefix + "save" });
  expect(save).toBeDisabled();
  fireEvent.change(quantity, { target: { value: "0.500" } });
  expect(save).toBeEnabled();
  fireEvent.click(save);
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
    "/inventory/stock/4/recall-supplier-receipts/13",
    expect.objectContaining({
      quantity: "0.500", evidenceReference: "PROOF-123", receivedBy: "Synthetic representative",
      receivedAt: new Date(time).toISOString(), requestId: expect.any(String),
    }),
  ));
});
