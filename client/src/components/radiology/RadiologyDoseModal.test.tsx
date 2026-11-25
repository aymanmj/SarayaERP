import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RadiologyDoseModal } from "./RadiologyDoseModal";
import { apiClient } from "../../api/apiClient";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe("RadiologyDoseModal (CAP13 RDSR)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        patient: { id: 77, fullName: "خالد محمود", mrn: "MRN-770" },
        examCount: 1,
        cumulative12mMsv: "55.0000",
        lifetimeMsv: "55.0000",
        drlExceedances: 1,
        tier: "ELEVATED_50MSV",
        records: [
          {
            id: 501,
            radiologyOrderId: 900,
            modality: "CT",
            bodyRegion: "ABDOMEN",
            dlpMgyCm: "3666.6667",
            ctdiVolMgy: "24.5000",
            effectiveDoseMsv: "55.0000",
            cumulative12mMsv: "55.0000",
            exceedsDrl: true,
            cumulativeWarning: true,
            recordedAt: "2026-11-20T10:00:00.000Z",
          },
        ],
      },
    } as never);

    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        record: { id: 502, radiologyOrderId: 901, effectiveDoseMsv: "7.0000" },
        incidentId: null,
        evaluation: {
          effectiveDoseMsv: "7.0000",
          cumulative12mMsv: "62.0000",
          exceedsDrl: false,
          tier: "ELEVATED_50MSV",
        },
      },
    } as never);
  });

  it("displays 12-month cumulative dose tier and submits RDSR record for current order", async () => {
    const onRecorded = vi.fn();
    render(
      <RadiologyDoseModal
        open={true}
        radiologyOrderId={901}
        patientId={77}
        patientName="خالد محمود"
        patientMrn="MRN-770"
        studyName="CT Chest"
        defaultModality="CT"
        defaultBodyRegion="CHEST"
        onClose={vi.fn()}
        onRecorded={onRecorded}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/تحذير تراكمي/)).toBeInTheDocument();
      expect(screen.getAllByText("55.0000 mSv").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByPlaceholderText("DLP (mGy·cm)"), {
      target: { value: "500" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "تثبيت سجل الجرعة الإشعاعية (RDSR)",
      }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/radiology/dose/orders/901",
        expect.objectContaining({
          modality: "CT",
          bodyRegion: "CHEST",
          dlpMgyCm: 500,
        }),
      );
      expect(onRecorded).toHaveBeenCalled();
    });
  });
});
