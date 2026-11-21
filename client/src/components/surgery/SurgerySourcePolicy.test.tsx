import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SurgerySourcePolicy } from "./SurgerySourcePolicy";
import { apiClient } from "@/api/apiClient";

const state = vi.hoisted(() => ({
  permissions: ["surgery:view"],
  hospitalId: 1,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, hospitalId: state.hospitalId },
    hasPermission: (permission: string) =>
      state.permissions.includes(permission),
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));
vi.mock("@/api/apiClient", () => ({
  apiClient: { get: vi.fn(), put: vi.fn() },
}));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = ["surgery:view"];
  state.hospitalId = 1;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  vi.mocked(apiClient.get).mockImplementation(async (url) => ({
    data: String(url).endsWith("/warehouses")
      ? [{ id: 2, name: "Synthetic source" }]
      : { warehouseId: null, warehouse: null },
  }));
  vi.mocked(apiClient.put).mockResolvedValue({ data: { warehouseId: 2 } });
});
afterEach(() => {
  cleanup();
  client.clear();
});
const view = () => (
  <QueryClientProvider client={client}>
    <SurgerySourcePolicy />
  </QueryClientProvider>
);
describe("Surgery source settings", () => {
  it("shows an unconfigured source while keeping surgery operators read only", async () => {
    state.permissions.push("surgery:manage");
    render(view());
    await screen.findByText(/Surgery source is not configured/);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });
  it("requires the dedicated permission and a reason to save a selected source", async () => {
    state.permissions = ["surgery:source:manage"];
    render(view());
    await screen.findByRole("option", { name: "Synthetic source" });
    const save = screen.getByRole("button", { name: "Save surgery source" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New source warehouse"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Reason for changing source"), {
      target: { value: "  Approved dedicated surgery source  " },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith("/surgery/source-policy", {
        warehouseId: 2,
        reason: "Approved dedicated surgery source",
      }),
    );
    await screen.findByText("Surgery source saved for subsequent movements.");
  });
  it("shows an inactive configured source as blocked", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        warehouseId: 2,
        warehouse: { id: 2, name: "Synthetic source", isActive: false },
      },
    });
    render(view());
    await screen.findByText(
      /Warehouse inactive; dispensing and movements require an active source/,
    );
  });
  it("does not fetch configuration without read or configuration permission", () => {
    state.permissions = [];
    render(view());
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(screen.queryByText("Surgery stock source")).not.toBeInTheDocument();
  });
  it("prevents configuration when the source cannot be read", async () => {
    state.permissions = ["surgery:source:manage"];
    vi.mocked(apiClient.get).mockRejectedValue(
      new Error("Synthetic unavailable source"),
    );
    render(view());
    await screen.findByText("Could not load surgery source");
    expect(
      screen.getByRole("button", { name: "Save surgery source" }),
    ).toBeDisabled();
  });
  it("does not reuse another hospital policy from the query cache", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: {
          warehouseId: 2,
          warehouse: { id: 2, name: "First hospital source", isActive: true },
        },
      })
      .mockResolvedValue({ data: { warehouseId: null, warehouse: null } });
    const page = render(view());
    await screen.findByText(/First hospital source/);
    state.hospitalId = 2;
    page.rerender(view());
    await screen.findByText(/Surgery source is not configured/);
    expect(screen.queryByText(/First hospital source/)).not.toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
});
