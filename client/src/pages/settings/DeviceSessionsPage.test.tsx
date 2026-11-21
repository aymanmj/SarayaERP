import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import DeviceSessionsPage from "./DeviceSessionsPage";

vi.mock("../../stores/authStore", () => ({
  useAuthStore: (
    select: (state: {
      user: { id: number };
      currentBranchId: number;
    }) => unknown,
  ) => select({ user: { id: 10 }, currentBranchId: 1 }),
}));
vi.mock("../../api/apiClient", () => ({
  apiClient: { get: vi.fn(), delete: vi.fn() },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "en" },
  }),
}));

const date = "2026-11-17T15:00:00.000Z";
const current = {
  id: "76639fb4-28fd-4193-89d3-6498cfdcbc77",
  current: true,
  branchName: "Home",
  createdAt: date,
  lastRenewedAt: date,
};
const other = {
  ...current,
  id: "8a8a7a61-3d49-4353-bcba-0baf3ff25cfa",
  current: false,
  branchName: "Branch",
};

function open() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DeviceSessionsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("device sessions", () => {
  it("protects the current session and ends another only after confirmation", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: { userId: 10, sessions: [other, current] },
      })
      .mockResolvedValue({ data: { userId: 10, sessions: [current] } });
    vi.mocked(apiClient.delete).mockResolvedValue({ status: 204 });
    open();
    const currentCard = (
      await screen.findByText("deviceSessions.current")
    ).closest("li")!;
    expect(within(currentCard).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "deviceSessions.end" }));
    fireEvent.click(
      screen.getByRole("button", { name: "deviceSessions.cancel" }),
    );
    expect(apiClient.delete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "deviceSessions.end" }));
    fireEvent.click(
      screen.getByRole("button", { name: "deviceSessions.confirm" }),
    );
    expect(await screen.findByText("deviceSessions.ended")).toBeInTheDocument();
    expect(apiClient.delete).toHaveBeenCalledExactlyOnceWith(
      `/auth/sessions/${other.id}`,
    );
    expect(screen.queryByText("deviceSessions.other")).not.toBeInTheDocument();
    expect(screen.getByText("deviceSessions.current")).toBeInTheDocument();
  });

  it("keeps the session visible when ending it fails", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { userId: 10, sessions: [current, other] },
    });
    vi.mocked(apiClient.delete).mockRejectedValue(new Error("Offline"));
    open();
    fireEvent.click(
      await screen.findByRole("button", { name: "deviceSessions.end" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "deviceSessions.confirm" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "deviceSessions.endError",
    );
    expect(screen.getByText("Branch")).toBeInTheDocument();
  });

  it("hides the old list and rejects another account's list after a cookie change", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { userId: 10, sessions: [current, other] } })
      .mockResolvedValue({
        data: { userId: 11, sessions: [{ ...other, branchName: "Other account" }] },
      });
    open();
    expect(await screen.findByText("Branch")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "deviceSessions.refresh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "deviceSessions.loadError",
    );
    expect(screen.queryByText("Branch")).not.toBeInTheDocument();
    expect(screen.queryByText("Other account")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "deviceSessions.end" }),
    ).not.toBeInTheDocument();
  });
});
