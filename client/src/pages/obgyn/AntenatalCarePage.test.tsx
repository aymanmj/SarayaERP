import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AntenatalCarePage from "./AntenatalCarePage";
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

describe("AntenatalCarePage sidebar entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads active pregnancies when opened from sidebar without patientId/careId and allows picking a patient", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [
        {
          id: 12,
          patientId: 77,
          lmpDate: "2026-06-01T00:00:00.000Z",
          eddDate: "2027-03-08T00:00:00.000Z",
          gravida: 2,
          para: 1,
          rhFactor: "Positive",
          riskLevel: "LOW",
          status: "ACTIVE",
          patient: { fullName: "فاطمة سالم", mrn: "H1-MRN-0077" },
          visits: [],
          _count: { visits: 3 },
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/obgyn/anc"]}>
        <AntenatalCarePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith("/obgyn/anc");
    });

    expect(await screen.findByText("فاطمة سالم")).toBeInTheDocument();
    expect(screen.getByText("(H1-MRN-0077)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("+ تسجيل حمل جديد"));
    expect(
      screen.getByPlaceholderText("ابحث عن المريضة بالاسم أو رقم الملف أو الهاتف..."),
    ).toBeInTheDocument();
  });
});
