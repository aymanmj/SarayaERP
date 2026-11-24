import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { BiometricDevicesModal } from "./BiometricDevicesModal";

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
  },
}));

describe("BiometricDevicesModal (Batch 24 — ZKTeco ADMS & Holidays)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a new ZKTeco ADMS biometric device", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 1 } } as never);

    render(<BiometricDevicesModal onClose={vi.fn()} />);

    fireEvent.change(
      await screen.findByPlaceholderText("اسم الجهاز (مثلاً: بوابة الطوارئ)"),
      { target: { value: "ER Gate ZK" } },
    );
    fireEvent.change(screen.getByPlaceholderText("الرقم التسلسلي (SN)"), {
      target: { value: "ZK-2026-01" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /تسجيل جهاز بصمة ADMS/i }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/attendance/biometric/devices",
        expect.objectContaining({
          name: "ER Gate ZK",
          serialNumber: "ZK-2026-01",
          connectionMode: "ADMS",
        }),
      );
    });
  });

  it("adds an official annual holiday from the holidays tab", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 2 } } as never);

    render(<BiometricDevicesModal onClose={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: /العطلات الرسمية/i }),
    );
    fireEvent.change(screen.getByPlaceholderText("اسم العطلة الرسمية"), {
      target: { value: "عيد الاستقلال" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /إضافة عطلة رسمية/i }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/attendance/biometric/holidays",
        expect.objectContaining({
          name: "عيد الاستقلال",
          isAnnual: true,
        }),
      );
    });
  });
});
