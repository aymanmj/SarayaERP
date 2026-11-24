import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { SurgicalSafetyModal } from "./SurgicalSafetyModal";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("SurgicalSafetyModal (CAP05 — WHO Checklist, Surgical Count & Anesthesia)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads safety summary and signs WHO SIGN_IN phase", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        surgeryCaseId: 50,
        surgeryName: "Appendectomy",
        status: "IN_PROGRESS",
        checklists: [],
        countItems: [],
        anesthesiaRecord: null,
        readiness: {
          signInDone: false,
          timeOutDone: false,
          signOutDone: false,
          anesthesiaSigned: false,
          unresolvedCountItems: 0,
          discrepancyCountItems: 0,
          canStartIncision: false,
          canCloseAndComplete: false,
        },
      },
    } as never);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 1 } } as never);

    render(
      <SurgicalSafetyModal
        surgeryCaseId={50}
        users={[{ id: 2, fullName: "Nurse Sara" }]}
        onClose={vi.fn()}
      />,
    );

    const signBtn = await screen.findByText(/توقيع وإقفال مرحلة SIGN_IN/i);
    fireEvent.click(signBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/surgery/safety/cases/50/checklist",
        expect.objectContaining({
          phase: "SIGN_IN",
          siteMarked: true,
          consentConfirmed: true,
        }),
      );
    });
  });

  it("escalates surgical count discrepancy to SENTINEL incident and signs anesthesia record", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        surgeryCaseId: 50,
        surgeryName: "Cesarean Section",
        status: "IN_PROGRESS",
        checklists: [],
        countItems: [
          {
            id: 77,
            category: "SPONGE",
            itemName: "Laparotomy Pads",
            initialCount: 10,
            addedCount: 2,
            finalCount: 11,
            status: "DISCREPANCY",
          },
        ],
        anesthesiaRecord: null,
        readiness: {
          signInDone: true,
          timeOutDone: true,
          signOutDone: false,
          anesthesiaSigned: false,
          unresolvedCountItems: 1,
          discrepancyCountItems: 1,
          canStartIncision: true,
          canCloseAndComplete: false,
        },
      },
    } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} } as never);

    render(
      <SurgicalSafetyModal
        surgeryCaseId={50}
        users={[{ id: 2, fullName: "Nurse Sara" }]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText(/العدّ الجراحي المزدوج/i));
    fireEvent.change(
      screen.getByPlaceholderText(/توثيق نتيجة الأشعة أو الإجراء الفوري/i),
      {
        target: { value: "Portable X-ray ordered; sentinel report filed" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /تصعيد حادثة SENTINEL/i }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/surgery/safety/counts/77/resolve",
        expect.objectContaining({
          resolutionStatus: "ESCALATED_INCIDENT",
        }),
      );
    });

    fireEvent.click(screen.getByText(/سجل التخدير المقفل/i));
    fireEvent.click(screen.getByText(/توقيع وإقفال سجل التخدير/i));

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        "/surgery/safety/cases/50/anesthesia",
        expect.objectContaining({ asaClass: "ASA_2" }),
      );
      expect(apiClient.post).toHaveBeenCalledWith(
        "/surgery/safety/cases/50/anesthesia/sign",
      );
    });
  });
});
