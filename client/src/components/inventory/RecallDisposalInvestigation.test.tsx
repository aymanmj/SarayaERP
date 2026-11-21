import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { RecallDisposalInvestigation } from "./RecallDisposalInvestigation";

vi.mock("../../api/apiClient", () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key.split(".").at(-1), i18n: { language: "en" } }),
}));

it("submits the recount against the movement snapshot shown to the investigator", async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: {
    records: [], nextBefore: null, version: 4,
    movements: [{ id: 42, type: "IN", quantity: "10", referenceType: null, createdAt: "2026-01-01T10:00:00Z" }],
  } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  const path = "/inventory/stock/3/recall-disposals/7/investigations";
  render(<QueryClientProvider client={new QueryClient()}>
    <RecallDisposalInvestigation path={path} recallKey={["recall"]} actorId={5}
      canSubmit canReview={false} onClose={() => undefined} />
  </QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "submit" }));
  fireEvent.change(screen.getByLabelText("countedRemaining"), { target: { value: "7.125" } });
  fireEvent.change(screen.getByLabelText("reference"), { target: { value: "RECOUNT-11" } });
  fireEvent.change(screen.getByLabelText("findings"), { target: { value: "Recount and receipts verified" } });
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(path, expect.objectContaining({
    version: 4, movementIds: [42], countedRemaining: "7.125", countReference: "RECOUNT-11",
  })));
});
