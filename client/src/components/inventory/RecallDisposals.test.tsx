import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { RecallDisposals } from "./RecallDisposals";

const auth = vi.hoisted(() => ({ permission: "inventory:recall-disposal:post" }));
vi.mock("../../api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 9, roles: [], permissions: [auth.permission] },
    hasPermission: (permission: string) => permission === auth.permission,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key.split(".").at(-1), i18n: { language: "en" } }),
}));

it("blocks posting a disputed quantity and confirms posting the matching evidence as the ledger operator", async () => {
  const report = {
    status: "EXECUTED",
    quantity: "3",
    reason: "Recalled drug",
    requestedById: 4,
    evidenceReference: "REPORT-10",
    performedBy: "Warehouse operator",
    performedAt: "2026-01-01T12:00:00Z",
    isolation: { isolatedQuantity: "7", onHand: "8", location: "Quarantine store" },
  };
  vi.mocked(apiClient.get).mockResolvedValue({ data: {
    records: [
      { ...report, id: 10, performedQuantity: "2.875" },
      { ...report, id: 11, performedQuantity: "3.000" },
    ],
    nextBefore: null,
  } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  render(<QueryClientProvider client={new QueryClient()}>
    <RecallDisposals stockId={20} isolationId={null} recallKey={["recall"]} />
  </QueryClientProvider>);
  await screen.findByText("difference");
  expect(screen.getAllByRole("button", { name: "post" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "post" }));
  expect(apiClient.post).not.toHaveBeenCalled();
  expect(screen.getByText("postEffect")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "post" }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/inventory/stock/20/recall-disposals/11/post"));
});

it("submits the independent count and report reference without offering posting to the reviewer", async () => {
  auth.permission = "inventory:recall-disposal:review";
  vi.mocked(apiClient.post).mockClear();
  vi.mocked(apiClient.get).mockResolvedValue({ data: {
    records: [{
      id: 12, status: "EXECUTED", quantity: "3", performedQuantity: "2.875", requestedById: 4,
      recordedById: 5, reason: "Recalled drug", isolation: { isolatedQuantity: "3", onHand: "10", location: "Quarantine store" },
    }],
    nextBefore: null,
  } });
  render(<QueryClientProvider client={new QueryClient()}>
    <RecallDisposals stockId={20} isolationId={null} recallKey={["review"]} />
  </QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "reconcile" }));
  expect(screen.queryByRole("button", { name: "post" })).toBeNull();
  fireEvent.change(screen.getByLabelText("countedRemaining"), { target: { value: "7.125" } });
  fireEvent.change(screen.getByLabelText("reconciliationReference"), { target: { value: "COUNT-003" } });
  fireEvent.change(screen.getByLabelText("note"), { target: { value: "Count repeated by a separate reviewer" } });
  fireEvent.click(screen.getByRole("button", { name: "reconcile" }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/inventory/stock/20/recall-disposals/12/reconcile", {
    countedRemaining: "7.125", reference: "COUNT-003", note: "Count repeated by a separate reviewer",
  }));
});
