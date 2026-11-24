import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { ControlledConsignmentModal } from "./ControlledConsignmentModal";

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

describe("ControlledConsignmentModal (CAP10 — Narcotics, Consignment & Ward Returns)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits double-signed controlled substance transaction with witness", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { id: 1 } } as never);

    render(<ControlledConsignmentModal onClose={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText("معرّف الدواء المقيّد"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByPlaceholderText("رقم التشغيلة"), {
      target: { value: "MOR-B1" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("معرّف الشاهد المستقل (4 عيون)"),
      { target: { value: "4" } },
    );
    fireEvent.change(screen.getByPlaceholderText("معرّف المريض (للصرف)"), {
      target: { value: "55" },
    });
    fireEvent.change(screen.getByPlaceholderText("السبب والتبرير السريري..."), {
      target: { value: "Post-op pain dose with witness" },
    });

    fireEvent.click(screen.getByRole("button", { name: /تسجيل بتوقيع ثنائي/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/inventory/governance/controlled-logs",
        expect.objectContaining({
          productId: 10,
          batchNumber: "MOR-B1",
          witnessedById: 4,
          patientId: 55,
        }),
      );
    });
  });

  it("consumes consignment stock and approves ward return restock", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes("/consignments")) {
        return {
          data: [
            {
              id: 7,
              batchNumber: "STENT-01",
              quantityReceived: "5.000",
              quantityConsumed: "1.000",
              quantityReturned: "0.000",
              quantityRemaining: "4.000",
              agreedUnitPrice: "1250.0000",
              status: "PARTIALLY_CONSUMED",
              supplier: { id: 1, name: "Ortho Supplier" },
              product: { id: 2, code: "STENT", name: "Coronary Stent" },
            },
          ],
        } as never;
      }
      if (url.includes("/ward-returns")) {
        return {
          data: [
            {
              id: 19,
              quantity: "6.000",
              reason: "Switched to oral therapy",
              sealIntact: true,
              coldChainMaintained: true,
              status: "PENDING_PHARMACIST",
              product: { id: 3, code: "CEF", name: "Ceftriaxone 1g" },
              requestedBy: { id: 8, fullName: "Nurse Nadia" },
            },
          ],
        } as never;
      }
      return { data: [] } as never;
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as never);

    render(<ControlledConsignmentModal onClose={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", { name: /مستلزمات الأمانة/i }),
    );
    fireEvent.change(screen.getByPlaceholderText("رقم الزيارة (Encounter ID)"), {
      target: { value: "301" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /تسجيل استهلاك لمريض/i }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/inventory/governance/consignments/7/consume",
        expect.objectContaining({ encounterId: 301, quantity: 1 }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /مرتجع العنابر/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /اعتماد وإعادة للمخزون/i }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/inventory/governance/ward-returns/19/review",
        expect.objectContaining({ decision: "APPROVE_RESTOCK" }),
      );
    });
  });
});
