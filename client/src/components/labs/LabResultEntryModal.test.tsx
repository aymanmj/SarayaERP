import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LabResultEntryModal } from "./LabResultEntryModal";
import { apiClient } from "../../api/apiClient";

vi.mock("../../api/apiClient", () => ({
  apiClient: {
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("LabResultEntryModal (LAB-UPGRADE-P0/P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { id: 1 } } as never);
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 1 } } as never);
  });

  it("submits multi-parameter panel values with immediate SHA-256 verification", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <LabResultEntryModal
        item={{
          id: 42,
          resultStatus: "IN_PROGRESS",
          isVerified: false,
          patient: { id: 1, fullName: "أحمد مصباح", mrn: "MRN-1" },
          test: {
            id: 5,
            code: "CBC",
            name: "Complete Blood Count",
            parameters: [
              { id: 101, code: "HGB", name: "Hemoglobin", unit: "g/dL" },
              { id: 102, code: "WBC", name: "WBC", unit: "10^9/L" },
            ],
          },
        }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const inputs = screen.getAllByPlaceholderText("أدخل القيمة");
    fireEvent.change(inputs[0], { target: { value: "13.9" } });
    fireEvent.change(inputs[1], { target: { value: "6.8" } });

    fireEvent.click(screen.getByRole("button", { name: "حفظ النتائج" }));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/lab/orders/42/complete",
        expect.objectContaining({
          verifyImmediately: true,
          parameters: expect.arrayContaining([
            expect.objectContaining({
              parameterId: 101,
              parameterName: "Hemoglobin",
              value: "13.9",
            }),
          ]),
        }),
      );
    });
  });

  it("supports JCI IPSG.2 critical value read-back documentation and verified result amendment", async () => {
    const onSaved = vi.fn();

    render(
      <LabResultEntryModal
        item={{
          id: 43,
          resultStatus: "COMPLETED",
          isVerified: true,
          resultValue: "6.9",
          patient: { id: 1, fullName: "أحمد مصباح", mrn: "MRN-1" },
          test: { id: 6, code: "K", name: "Potassium", unit: "mmol/L" },
          pendingCriticalNotifications: [
            {
              id: 77,
              parameterName: "Potassium",
              criticalValue: "6.9",
              flag: "HH",
              status: "PENDING",
              slaDeadline: "2026-11-24T06:00:00.000Z",
            },
          ],
        }}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("اسم الطبيب/الممرض المبلَّغ"),
      { target: { value: "د. خالد" } },
    );
    fireEvent.change(screen.getByPlaceholderText("القيمة المعاد قراءتها"), {
      target: { value: "6.9 mmol/L" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "توثيق Read-Back" }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/lab/critical-notifications/77/read-back",
        expect.objectContaining({
          notifiedClinicianName: "د. خالد",
          readBackConfirmed: true,
          readBackValue: "6.9 mmol/L",
        }),
      );
    });
  });
});
