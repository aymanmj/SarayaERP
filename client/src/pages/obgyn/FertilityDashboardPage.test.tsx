import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FertilityDashboardPage from "./FertilityDashboardPage";
import { apiClient } from "../../api/apiClient";

vi.mock("../../api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
    i18n: { language: "ar" },
  }),
}));

describe("FertilityDashboardPage sidebar entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads active fertility cases and enables opening a new case with female patient search", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [
        {
          id: 5,
          femalePatientId: 88,
          infertilityType: "UNEXPLAINED",
          status: "ACTIVE",
          createdAt: "2026-11-20T00:00:00.000Z",
          femalePatient: { id: 88, fullName: "سعاد علي", mrn: "H1-MRN-0088" },
          cycles: [],
          _count: { cycles: 1 },
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/obgyn/fertility"]}>
        <FertilityDashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith("/obgyn/fertility/cases");
    });

    expect(await screen.findByText(/سعاد علي/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("+ فتح ملف جديد"));
    expect(
      screen.getByPlaceholderText("ابحث عن الزوجة بالاسم أو رقم الملف أو الهاتف..."),
    ).toBeInTheDocument();
  });
});
