import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LabQcModal } from "./LabQcModal";
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

describe("LabQcModal (CAP02 Westgard QC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/lab/qc/lots") {
        return {
          data: [
            {
              id: 10,
              testId: 1,
              analyzerName: "Cobas c311",
              lotNumber: "LOT-GLU-2026",
              level: "LEVEL_2_NORMAL",
              targetMean: "100.0000",
              targetSd: "5.0000",
              unit: "mg/dL",
              test: { id: 1, code: "GLU", name: "Fasting Glucose" },
            },
          ],
        } as never;
      }
      if (url === "/lab/catalog") {
        return {
          data: [{ id: 1, code: "GLU", name: "Fasting Glucose", unit: "mg/dL" }],
        } as never;
      }
      if (url === "/lab/qc/lots/10/levey-jennings") {
        return {
          data: {
            lot: {
              id: 10,
              testId: 1,
              analyzerName: "Cobas c311",
              lotNumber: "LOT-GLU-2026",
              level: "LEVEL_2_NORMAL",
              targetMean: "100.0000",
              targetSd: "5.0000",
              test: { id: 1, code: "GLU", name: "Fasting Glucose" },
            },
            bands: {
              mean: "100.0000",
              sd: "5.0000",
              plus1Sd: "105.0000",
              minus1Sd: "95.0000",
              plus2Sd: "110.0000",
              minus2Sd: "90.0000",
              plus3Sd: "115.0000",
              minus3Sd: "85.0000",
            },
            summary: {
              totalRuns: 2,
              passCount: 1,
              warningCount: 0,
              rejectCount: 1,
            },
            runs: [
              {
                id: 101,
                qcLotId: 10,
                measuredValue: "101.0000",
                zScore: "0.2000",
                status: "PASS",
                violatedRules: [],
                measuredAt: "2026-11-25T08:00:00.000Z",
              },
              {
                id: 102,
                qcLotId: 10,
                measuredValue: "118.0000",
                zScore: "3.6000",
                status: "REJECT",
                violatedRules: ["1-3s"],
                measuredAt: "2026-11-25T09:00:00.000Z",
              },
            ],
          },
        } as never;
      }
      return { data: [] } as never;
    });

    vi.mocked(apiClient.post).mockResolvedValue({
      data: { id: 103, status: "PASS", violatedRules: [] },
    } as never);
  });

  it("renders Levey-Jennings chart, Westgard rule violations, and submits QC run + 4-eyes review", async () => {
    render(<LabQcModal open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Levey-Jennings QC Chart" })).toBeInTheDocument();
      expect(screen.getByText("1-3s")).toBeInTheDocument();
    });

    // Record a new run
    fireEvent.change(screen.getByPlaceholderText(/القيمة المقاسة/), {
      target: { value: "102.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل وتقييم Westgard" }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/lab/qc/runs",
        expect.objectContaining({
          qcLotId: 10,
          measuredValue: 102.5,
        }),
      );
    });

    // Trigger 4-Eyes review on rejected run 102
    fireEvent.click(screen.getByRole("button", { name: "مراجعة 4 عيون" }));
    fireEvent.change(screen.getByPlaceholderText("وصف الإجراء التصحيحي..."), {
      target: { value: "تمت إعادة المعايرة واستبدال الكاشف بنجاح" },
    });
    fireEvent.click(screen.getByRole("button", { name: "اعتماد" }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/lab/qc/runs/102/review", {
        correctiveAction: "تمت إعادة المعايرة واستبدال الكاشف بنجاح",
      });
    });
  });
});
