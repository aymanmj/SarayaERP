import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { RecallFollowupPanel } from "./RecallFollowupPanel";

vi.mock("../../api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 2, hospitalId: 3, permissions: ["inventory:manage"] }, hasPermission: () => false }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: "en" } }),
}));

it("records the exact quantity against the selected warehouse balance", async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: {
    batchNumber: "LOT-01", reason: "Synthetic recall", recalledAt: "2026-11-17T00:00:00Z",
    canViewPatientIdentity: false, movements: [], nextBefore: null,
    stocks: [{
      id: 15, version: 4, warehouse: { name: "Synthetic receiving warehouse" },
      quantity: "0.5", unverifiedQuantity: "0.5", latestIsolation: null, isolationCurrent: false,
    }],
  } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  render(<QueryClientProvider client={new QueryClient()}>
    <RecallFollowupPanel stockId={12} onClose={() => undefined} />
  </QueryClientProvider>);
  expect(await screen.findByText("inventory.recall.identityRestricted")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "inventory.recall.recordIsolation" }));
  fireEvent.change(screen.getByLabelText("inventory.recall.isolated"), { target: { value: "0.125" } });
  fireEvent.change(screen.getByLabelText("inventory.recall.location"), { target: { value: "Isolation cabinet" } });
  fireEvent.change(screen.getByLabelText("inventory.recall.reason"), { target: { value: "Checked remaining units" } });
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
    "/inventory/stock/15/recall-isolation",
    expect.objectContaining({
      stockVersion: 4, isolatedQuantity: "0.125", location: "Isolation cabinet",
      reason: "Checked remaining units", requestId: expect.any(String),
    }),
  ));
});

it("records a department notification against its original movement", async () => {
  vi.mocked(apiClient.get).mockImplementation(async (url) => ({
    data: String(url).includes("recall-contacts") ? { records: [], nextBefore: null } : {
      batchNumber: "LOT-01", reason: "Synthetic recall", recalledAt: "2026-11-17T00:00:00Z",
      canViewPatientIdentity: false, stocks: [], nextBefore: null,
      movements: [{
        id: 61, referenceId: 42, referenceType: "MATERIAL_ISSUE", createdAt: "2026-11-17T00:00:00Z",
        quantity: "1.000", department: "Central supplies", linked: true,
        canContactPatient: false, canContactDepartment: true, patientOutcome: null, departmentOutcome: null,
      }],
    },
  }));
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  render(<QueryClientProvider client={new QueryClient()}>
    <RecallFollowupPanel stockId={12} onClose={() => undefined} />
  </QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: /inventory.recall.contact.DEPARTMENT/ }));
  fireEvent.change(await screen.findByLabelText("inventory.recall.contact.outcome"), { target: { value: "NOTIFIED" } });
  fireEvent.change(screen.getByLabelText("inventory.recall.contact.channel"), { target: { value: "INTERNAL_HANDOFF" } });
  fireEvent.change(screen.getByLabelText("inventory.recall.contact.note"), { target: { value: "Department acknowledged recall" } });
  fireEvent.click(screen.getByRole("button", { name: "inventory.recall.contact.record" }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
    "/inventory/stock/12/recall-contacts/61",
    expect.objectContaining({
      audience: "DEPARTMENT", outcome: "NOTIFIED", channel: "INTERNAL_HANDOFF",
      note: "Department acknowledged recall", requestId: expect.any(String),
    }),
  ));
  expect(screen.queryByRole("button", { name: /inventory.recall.contact.PATIENT/ })).not.toBeInTheDocument();
});
