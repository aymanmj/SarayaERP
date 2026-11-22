import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/apiClient";
import RadiologyWorklistPage from "./RadiologyWorklistPage";

vi.mock("../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("../stores/authStore", () => ({
  useAuthStore: (selector: (s: { user: { id: number; hospitalId: number } }) => unknown) =>
    selector({ user: { id: 1, hospitalId: 1 } }),
}));

const renderWorklist = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RadiologyWorklistPage />
    </QueryClientProvider>,
  );
};

describe("RadiologyWorklistPage search (UI06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters case-insensitively across patient, MRN, study code/modality, and order ID", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [
        {
          id: 1,
          status: "PENDING",
          order: { id: 501, status: "NEW", createdAt: "2026-11-22T09:00:00Z", encounterId: 10 },
          patient: { id: 11, fullName: "Ali Mansour", mrn: "MRN-901" },
          study: { id: 21, code: "CT-CHEST", name: "CT Chest", modality: "CT", bodyPart: "CHEST" },
        },
        {
          id: 2,
          status: "SCHEDULED",
          order: { id: 502, status: "NEW", createdAt: "2026-11-22T09:15:00Z", encounterId: 11 },
          patient: { id: 12, fullName: "Sara Omar", mrn: "MRN-902" },
          study: { id: 22, code: "XR-KNEE", name: "X-Ray Knee", modality: "CR", bodyPart: "KNEE" },
        },
      ],
    } as never);

    renderWorklist();

    await waitFor(() => {
      expect(screen.getByText("Ali Mansour")).toBeInTheDocument();
      expect(screen.getByText("Sara Omar")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/بحث/i);

    fireEvent.change(input, { target: { value: "mrn-901" } });
    expect(screen.getByText("Ali Mansour")).toBeInTheDocument();
    expect(screen.queryByText("Sara Omar")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "xr-knee" } });
    expect(screen.queryByText("Ali Mansour")).not.toBeInTheDocument();
    expect(screen.getByText("Sara Omar")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "501" } });
    expect(screen.getByText("Ali Mansour")).toBeInTheDocument();
    expect(screen.queryByText("Sara Omar")).not.toBeInTheDocument();
  });
});
