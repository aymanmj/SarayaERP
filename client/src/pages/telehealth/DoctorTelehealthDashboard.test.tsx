import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { clinicalServices } from "../../api/clinicalServices";
import DoctorTelehealthDashboard from "./DoctorTelehealthDashboard";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

vi.mock("../../api/clinicalServices", () => ({
  clinicalServices: {
    initSession: vi.fn(),
    startSession: vi.fn(),
  },
}));

vi.mock("../../stores/authStore", () => ({
  useAuthStore: () => ({ user: { id: 12, hospitalId: 1 } }),
}));

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DoctorTelehealthDashboard />
    </QueryClientProvider>,
  );
};

describe("DoctorTelehealthDashboard (UI13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders ONLINE appointments using scheduledStart without Invalid Date", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [
        {
          id: 101,
          scheduledStart: "2026-11-22T10:30:00Z",
          type: "ONLINE",
          status: "CONFIRMED",
          patient: { id: 5, fullName: "أحمد سالم", gender: "MALE" },
        },
        {
          id: 102,
          scheduledStart: "2026-11-22T11:00:00Z",
          type: "IN_PERSON",
          status: "CONFIRMED",
          patient: { id: 6, fullName: "موعد حضوري", gender: "FEMALE" },
        },
      ],
    } as never);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("أحمد سالم")).toBeInTheDocument();
    });

    expect(screen.queryByText("موعد حضوري")).not.toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();

    vi.mocked(clinicalServices.initSession).mockResolvedValueOnce({} as never);
    vi.mocked(clinicalServices.startSession).mockResolvedValueOnce({
      roomUrl: "https://meet.example.com/room-101",
    } as never);

    fireEvent.click(screen.getByRole("button", { name: /بدء الاتصال/i }));

    await waitFor(() => {
      expect(clinicalServices.initSession).toHaveBeenCalledWith(101);
      expect(clinicalServices.startSession).toHaveBeenCalledWith(101);
    });
  });
});
