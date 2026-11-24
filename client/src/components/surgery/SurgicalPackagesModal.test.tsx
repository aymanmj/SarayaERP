import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/apiClient";
import { SurgicalPackagesModal } from "./SurgicalPackagesModal";

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

describe("SurgicalPackagesModal (CAP08 — DRG Bundled Billing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a surgical DRG package and settles an active encounter enrollment", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes("/enrollments")) {
        return {
          data: [
            {
              id: 8,
              encounterId: 401,
              status: "ACTIVE",
              packagePriceSnapshot: "3500.000",
              actualChargesTotal: "3650.000",
              overageAmount: "650.000",
              netBillableTotal: "4150.000",
              surgicalPackage: {
                code: "PKG-01",
                name: "استئصال المرارة بالمنظار",
                drgCode: "DRG-418",
              },
            },
          ],
        } as never;
      }
      return { data: [] } as never;
    });
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: 1 } } as never);

    render(<SurgicalPackagesModal onClose={vi.fn()} />);

    fireEvent.change(await screen.findByPlaceholderText("رمز الحزمة (PKG-01)"), {
      target: { value: "PKG-CHOLE" },
    });
    fireEvent.change(screen.getByPlaceholderText("اسم الحزمة الجراحية"), {
      target: { value: "حزمة منظار" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /حفظ الحزمة الجراحية/i }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/surgery/packages",
        expect.objectContaining({ code: "PKG-CHOLE", packagePrice: 3500 }),
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: /الزيارات المسجّلة والتسوية/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /تسوية وختم الحزمة/i }),
    );

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/surgery/packages/enrollments/8/settle",
        {},
      );
    });
  });
});
