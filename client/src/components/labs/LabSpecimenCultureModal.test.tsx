import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LabSpecimenCultureModal } from "./LabSpecimenCultureModal";
import { apiClient } from "../../api/apiClient";
import { useAuthStore } from "../../stores/authStore";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("LabSpecimenCultureModal (CAP02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 15,
        fullName: "Lab Microbiologist",
        username: "lab-micro",
        hospitalId: 1,
        roles: ["LAB_TECH"],
        permissions: [
          "labs:view",
          "lab:specimens:collect",
          "lab:specimens:receive",
          "lab:results:enter",
          "lab:results:verify",
        ],
      },
      isAuthenticated: true,
    });
  });

  it("collects a barcoded specimen and receives it into the laboratory", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: { specimens: [], cultureReports: [] },
      })
      .mockResolvedValueOnce({
        data: {
          specimens: [
            {
              id: 31,
              barcode: "SPC-H1-LO9-1-ABC123",
              specimenType: "BLOOD_EDTA",
              status: "COLLECTED",
              collectedAt: "2026-11-24T00:40:00.000Z",
            },
          ],
          cultureReports: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          specimens: [
            {
              id: 31,
              barcode: "SPC-H1-LO9-1-ABC123",
              specimenType: "BLOOD_EDTA",
              status: "RECEIVED",
              collectedAt: "2026-11-24T00:40:00.000Z",
            },
          ],
          cultureReports: [],
        },
      });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 31 } });

    render(
      <LabSpecimenCultureModal
        labOrderId={9}
        testName="Blood Culture"
        patientName="Patient Nine"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    const collectBtn = await screen.findByRole("button", {
      name: /سحب العينة وتوليد باركود/,
    });
    fireEvent.click(collectBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/lab/specimens/collect",
        expect.objectContaining({ labOrderId: 9, specimenType: "BLOOD_EDTA" }),
      );
    });

    const receiveBtn = await screen.findByRole("button", {
      name: /استلام العينة/,
    });
    fireEvent.click(receiveBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/lab/specimens/31/receive",
        {},
      );
    });
  });

  it("verifies a preliminary Culture & AST report on the Culture tab", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        specimens: [],
        cultureReports: [
          {
            id: 44,
            status: "PRELIMINARY",
            growthStatus: "SIGNIFICANT_GROWTH",
            organismName: "Escherichia coli",
            sensitivities: [
              { id: 1, antibioticName: "Meropenem", interpretation: "S" },
            ],
          },
        ],
      },
    });
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 44, status: "FINAL_VERIFIED" } });

    render(
      <LabSpecimenCultureModal
        labOrderId={9}
        testName="Urine Culture"
        patientName="Patient Nine"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    await screen.findByText(/دورة العينات والمزارع/);
    fireEvent.click(screen.getByRole("button", { name: /المزارع والحساسية/ }));

    const verifyBtn = await screen.findByRole("button", {
      name: /اعتماد نهائي وقفل التقرير/,
    });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/lab/specimens/cultures/44/verify",
        {},
      );
    });
  });
});
