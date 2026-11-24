import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import {
  RadiologyReportModal,
  type RadiologyOrderModalItem,
} from "./RadiologyReportModal";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("RadiologyReportModal (Batch 20 — Structured Report, Signature, Addenda & Read-Back)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads modality templates, applies template text, and signs structured report with critical finding", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [
        {
          id: 1,
          code: "CT_CHEST",
          title: "قالب أشعة صدر مقطعية",
          modality: "CT",
          techniqueTemplate: "Helical chest CT with IV contrast",
          findingsTemplate: "Saddle pulmonary embolism noted.",
          impressionTemplate: "Acute saddle PE.",
        },
      ],
    } as never);
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { id: 10, reportStatus: "FINAL" },
    } as never);

    const onSaved = vi.fn();
    const onClose = vi.fn();
    const draftItem: RadiologyOrderModalItem = {
      id: 10,
      status: "IN_PROGRESS",
      reportStatus: "DRAFT",
      patient: { id: 1, fullName: "Ali Omar", mrn: "MRN-10" },
      study: { id: 5, code: "CT-CHEST", name: "CT Chest", modality: "CT" },
    };

    render(
      <RadiologyReportModal
        item={draftItem}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const tplBtn = await screen.findByText("قالب أشعة صدر مقطعية");
    fireEvent.click(tplBtn);

    expect(screen.getByLabelText(/الموجودات الإشعاعية/i)).toHaveValue(
      "Saddle pulmonary embolism noted.",
    );

    fireEvent.click(screen.getByLabelText(/نتيجة حرجة طارئة/i));
    fireEvent.click(screen.getByText(/توقيع واعتماد نهائي/i));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/radiology/orders/10/sign",
        expect.objectContaining({
          findingsText: "Saddle pulmonary embolism noted.",
          impressionText: "Acute saddle PE.",
          isCriticalFinding: true,
        }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("locks signed report fields and supports signed addendum and JCI IPSG.2 Read-Back", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: [] } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);

    const onSaved = vi.fn();
    const onClose = vi.fn();
    const signedItem: RadiologyOrderModalItem = {
      id: 11,
      status: "COMPLETED",
      reportStatus: "FINAL",
      findingsText: "Original signed findings",
      impressionText: "Acute intracranial hemorrhage",
      isCriticalFinding: true,
      signedAt: "2026-11-24T10:00:00Z",
      signatureHash: "a".repeat(64),
      signedBy: { id: 2, fullName: "Dr. Radiologist" },
      criticalNotifications: [
        {
          id: 99,
          findingSummary: "Acute intracranial hemorrhage",
          severity: "CRITICAL",
          readBackConfirmed: false,
          slaDeadlineAt: "2026-11-24T10:30:00Z",
          slaBreached: false,
        },
      ],
      patient: { id: 2, fullName: "Mona Saleh", mrn: "MRN-20" },
      study: { id: 6, code: "CT-HEAD", name: "CT Head", modality: "CT" },
    };

    render(
      <RadiologyReportModal
        item={signedItem}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByLabelText(/الموجودات الإشعاعية/i)).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("اسم الطبيب المبلَّغ"), {
      target: { value: "Dr. ER Attending" },
    });
    fireEvent.click(screen.getByText("تأكيد Read-Back"));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/radiology/critical-notifications/99/read-back",
        expect.objectContaining({
          notifiedToName: "Dr. ER Attending",
          communicationChannel: "PHONE",
        }),
      );
    });

    fireEvent.change(screen.getByPlaceholderText("سبب الملحق (إلزامي)"), {
      target: { value: "Midline shift measurement" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("نص الملحق الإضافي الموقّع..."),
      {
        target: { value: "Midline shift measures 6 mm to the right." },
      },
    );
    fireEvent.click(screen.getByText("إضافة ملحق موقّع"));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/radiology/orders/11/addenda",
        expect.objectContaining({
          reason: "Midline shift measurement",
          addendumText: "Midline shift measures 6 mm to the right.",
        }),
      );
    });
  });
});
