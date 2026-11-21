import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CashierSessionsPanel } from "./CashierSessionsPanel";
import { apiClient } from "../api/apiClient";
const { user } = vi.hoisted(() => ({
  user: {
    id: 1,
    roles: [] as string[],
    permissions: ["cashier:manage", "cashier:sessions:approve"] as string[],
  },
}));
vi.mock("../api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("../stores/authStore", () => ({
  useAuthStore: (select: (state: { user: typeof user }) => unknown) =>
    select({ user }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));
const row = {
  id: 5,
  cashierId: 1,
  cashier: { fullName: "Synthetic cashier" },
  status: "PENDING",
  openingAmount: "100.000",
  received: "0.000",
  refunded: "30.000",
  handedOver: "50.000",
  expected: "20.000",
  available: "20.000",
  countedAmount: null,
  handovers: [],
};
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  user.id = 1;
  user.roles.splice(0);
  user.permissions.splice(
    0,
    user.permissions.length,
    "cashier:manage",
    "cashier:sessions:approve",
  );
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  vi.mocked(apiClient.get).mockResolvedValue({ data: [row] });
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
      <CashierSessionsPanel />
    </QueryClientProvider>,
  );
describe("Physical cash session", () => {
  it("prevents the cashier from approving their own opening float", async () => {
    open();
    await screen.findByText(/Synthetic cashier/);
    expect(
      screen.queryByRole("button", { name: "اعتماد العهدة وفتح الجلسة" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "طلب فتح جلسة ورصيد افتتاحي" }),
    ).not.toBeInTheDocument();
  });
  it("requires funding evidence from a different reviewer", async () => {
    user.id = 2;
    open();
    const approve = await screen.findByRole("button", {
      name: "اعتماد العهدة وفتح الجلسة",
    });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("السبب أو دليل العد"), {
      target: { value: "Verified treasury float" },
    });
    fireEvent.change(
      screen.getByLabelText("مرجع تمويل العهدة أو استلام الخزينة"),
      { target: { value: "TREASURY-001" } },
    );
    fireEvent.click(approve);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/cashier/cash-control/5/approve",
        { reason: "Verified treasury float", reference: "TREASURY-001" },
      ),
    );
  });
  it("requires confirmation before freezing cash movements for counting", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [{ ...row, status: "OPEN" }],
    });
    open();
    const count = await screen.findByRole("button", {
      name: "تثبيت العد وإيقاف الحركات",
    });
    fireEvent.change(screen.getByLabelText("مبلغ الإجراء أو النقد المعدود"), {
      target: { value: "20.000" },
    });
    fireEvent.change(screen.getByLabelText("السبب أو دليل العد"), {
      target: { value: "Physical count evidence" },
    });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(count);
    expect(apiClient.post).not.toHaveBeenCalled();
    fireEvent.click(count);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/cashier/cash-control/5/count",
        { amount: "20.000", reason: "Physical count evidence" },
      ),
    );
  });
  it("keeps a counted session frozen and requires someone else to approve closing", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [{ ...row, status: "CLOSING", countedAmount: "20.000" }],
    });
    open();
    await screen.findByText(/^النقد المعدود:/);
    expect(
      screen.queryByRole("button", { name: "تثبيت العد وإيقاف الحركات" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "اعتماد العد وإقفال الجلسة" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "سحب طلبي للمراجعة" }),
    ).toBeInTheDocument();
  });
  it("requires a supervisor, a custody record and a physical count attestation for an inactive owner", async () => {
    user.id = 2;
    user.permissions.splice(
      0,
      user.permissions.length,
      "cashier:sessions:approve",
    );
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        {
          ...row,
          status: "OPEN",
          cashier: {
            fullName: "Inactive cashier",
            isActive: false,
            isDeleted: false,
          },
        },
      ],
    });
    open();
    const count = await screen.findByRole("button", {
      name: "تثبيت الجرد الاستثنائي ومحضر التسلم",
    });
    expect(count).toBeDisabled();
    fireEvent.change(screen.getByLabelText("مبلغ الإجراء أو النقد المعدود"), {
      target: { value: "20.000" },
    });
    fireEvent.change(screen.getByLabelText("السبب أو دليل العد"), {
      target: { value: "Physical custody handover evidence" },
    });
    fireEvent.change(screen.getByLabelText("مرجع محضر تسلم العهدة"), {
      target: { value: "CUSTODY-2026-01" },
    });
    expect(count).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText("أؤكد جرد النقد فعليًا وتسلم العهدة وفق المحضر"),
    );
    fireEvent.click(count);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/cashier/cash-control/5/custody-count",
        {
          amount: "20.000",
          reason: "Physical custody handover evidence",
          reference: "CUSTODY-2026-01",
          confirmedCustody: true,
        },
      ),
    );
  });
  it("keeps exceptional counting unavailable for an active owner", async () => {
    user.id = 2;
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        {
          ...row,
          status: "OPEN",
          cashier: {
            fullName: "Active cashier",
            isActive: true,
            isDeleted: false,
          },
        },
      ],
    });
    open();
    await screen.findByText(/Active cashier/);
    expect(
      screen.queryByRole("button", {
        name: "تثبيت الجرد الاستثنائي ومحضر التسلم",
      }),
    ).not.toBeInTheDocument();
  });
  it("prevents the supervisor who counted from closing or independently rejecting their own count", async () => {
    user.id = 2;
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        {
          ...row,
          status: "CLOSING",
          countedAmount: "20.000",
          countedById: 2,
          custodyReference: "CUSTODY-01",
          countedBy: { fullName: "Counting supervisor" },
        },
      ],
    });
    open();
    await screen.findByText(/Counting supervisor/);
    expect(
      screen.queryByRole("button", { name: "اعتماد العد وإقفال الجلسة" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "رفض العد وإعادته للجرد" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "سحب طلبي للمراجعة" }),
    ).toBeInTheDocument();
  });
  it("lets a second supervisor review the recorded counter and custody reference before closing", async () => {
    user.id = 3;
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        {
          ...row,
          status: "CLOSING",
          countedAmount: "20.000",
          countedById: 2,
          custodyReference: "CUSTODY-01",
          countedBy: { fullName: "Counting supervisor" },
        },
      ],
    });
    open();
    const close = await screen.findByRole("button", {
      name: "اعتماد العد وإقفال الجلسة",
    });
    expect(close).toBeDisabled();
    expect(screen.getByText(/CUSTODY-01/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "رفض العد وإعادته للجرد" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("السبب أو دليل العد"), {
      target: { value: "Independently checked custody evidence" },
    });
    fireEvent.click(close);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/cashier/cash-control/5/close",
        { reason: "Independently checked custody evidence", reference: "" },
      ),
    );
  });
});
