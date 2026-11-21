import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { apiClient } from "../api/apiClient";
import PharmacyWorklistPage from "./PharmacyWorklistPage";

vi.mock("../api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("../stores/authStore", () => ({
  useAuthStore: (select: (state: object) => unknown) =>
    select({ user: { id: 1, hospitalId: 2, roles: ["PHARMACIST"], permissions: ["pharmacy:manage"] } }),
}));
vi.mock("../components/pharmacy/PharmacySourcePolicy", () => ({
  PharmacySourcePolicy: () => null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: "ar" } }),
}));

it("uses the settled prescription's frozen price and dispenses without a second collection", async () => {
  const drug = { id: 7, name: "Synthetic drug", genericName: "Synthetic", unitPrice: "3.333", stockOnHand: 8 };
  vi.mocked(apiClient.get).mockImplementation(async (url) => ({
    data: url === "/pharmacy/worklist" ? {
      data: [{
        id: 12, prepaidInvoiceId: 81, status: "ACTIVE", pharmacistVerificationStatus: "VERIFIED",
        createdAt: "2026-11-15T00:00:00Z", encounter: { type: "OPD" },
        patient: { fullName: "Synthetic patient", mrn: "TEST" },
        doctor: { fullName: "Synthetic doctor" },
        items: [{ id: 13, quantity: 1, drugItem: drug }],
      }],
    } : [{ ...drug, unitPrice: "9.999" }],
  }));
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><PharmacyWorklistPage /></QueryClientProvider>);
  fireEvent.click(await screen.findByTestId("dispense-prescription-12"));
  expect(screen.queryByTestId("pharmacy-payment-method")).not.toBeInTheDocument();
  expect(screen.getByText("#81")).toBeInTheDocument();
  expect(screen.getAllByText(/3\.333/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/9\.999/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("pharmacy-confirm-dispense"));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
    "/pharmacy/prescriptions/12/dispense",
    expect.objectContaining({ items: [{ prescriptionItemId: 13, quantity: 1, dispensedDrugItemId: 7 }] }),
  ));
  expect(apiClient.post).toHaveBeenCalledTimes(1);
});

it("requires an explicit final closure and sends the quantities actually delivered", async () => {
  const drug = { id: 7, name: "Synthetic drug", unitPrice: "3.333", stockOnHand: 8 };
  vi.mocked(apiClient.get).mockImplementation(async (url) => ({
    data: url === "/pharmacy/worklist" ? { data: [{
      id: 22, prepaidInvoiceId: 82, partialClosureEligible: true, status: "ACTIVE",
      pharmacistVerificationStatus: "VERIFIED", createdAt: "2026-11-17T00:00:00Z",
      encounter: { type: "OPD" }, patient: { fullName: "Synthetic patient", mrn: "TEST" },
      doctor: { fullName: "Synthetic doctor" }, items: [{ id: 23, quantity: 3, drugItem: drug }],
    }] } : [drug],
  }));
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(<QueryClientProvider client={new QueryClient()}><PharmacyWorklistPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("dispense-prescription-22"));
    const qty = screen.getByTestId("dispense-qty-23");
    expect(qty).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("checkbox", { name: "pharmacy.finalPartial" }));
    const submit = screen.getByTestId("pharmacy-confirm-dispense");
    expect(submit).toBeDisabled();
    fireEvent.change(qty, { target: { value: "1" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("pharmacy.partialClosureReason"), { target: { value: "Patient declined the remainder" } });
    fireEvent.click(submit);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      "/pharmacy/prescriptions/22/dispense",
      expect.objectContaining({
        items: [{ prescriptionItemId: 23, quantity: 1, dispensedDrugItemId: 7 }],
        partialClosureReason: "Patient declined the remainder",
      }),
    ));
    expect(confirm).toHaveBeenCalledOnce();
  } finally {
    confirm.mockRestore();
  }
});
