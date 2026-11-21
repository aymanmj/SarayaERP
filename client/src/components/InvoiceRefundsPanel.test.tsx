import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvoiceRefundsPanel } from "./InvoiceRefundsPanel";
import { apiClient } from "../api/apiClient";
const { user, toast } = vi.hoisted(() => ({
  user: {
    id: 1,
    roles: [] as string[],
    permissions: ["cashier:refunds:request"] as string[],
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("../stores/authStore", () => ({
  useAuthStore: (select: (state: { user: typeof user }) => unknown) =>
    select({ user }),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));
const row = {
  id: 5,
  paymentId: 7,
  adjustmentId: 8,
  amount: "30.000",
  method: "CASH",
  status: "PENDING",
  requestedById: 1,
  reviewedById: 2,
  assignedExecutorId: 3,
  reason: "Synthetic evidence",
  executionReference: null,
  executionEvidence: null,
  postingEntryId: null,
};
const response = {
  items: [row],
  payments: [{ id: 7, amount: "100.000", method: "CASH" }],
  credits: [{ id: 8, delta: "-40.000" }],
  patientCredit: "40.000",
  reservedAmount: "30.000",
  availableAmount: "10.000",
  refundedAmount: "0.000",
};
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  user.id = 1;
  user.roles.splice(0);
  user.permissions.splice(
    0,
    user.permissions.length,
    "cashier:refunds:request",
  );
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  vi.mocked(apiClient.get).mockResolvedValue({ data: response });
  vi.mocked(apiClient.post).mockResolvedValue({});
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
const open = () =>
  render(
    <QueryClientProvider client={client}>
      <InvoiceRefundsPanel invoiceId={9} />
    </QueryClientProvider>,
  );
describe("Refund custody panel", () => {
  it("preserves request identity on a failed network retry", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(
      new Error("Synthetic network failure"),
    );
    open();
    fireEvent.change(await screen.findByLabelText("الإشعار الدائن"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText("إيصال التحصيل الأصلي"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("مبلغ الاسترداد"), {
      target: { value: "30.000" },
    });
    fireEvent.change(screen.getByLabelText("سبب الاسترداد"), {
      target: { value: "Synthetic evidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب استرداد" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب استرداد" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    expect(vi.mocked(apiClient.post).mock.calls[0]).toEqual(
      vi.mocked(apiClient.post).mock.calls[1],
    );
  });
  it("prevents requester approval even with the permission", async () => {
    user.permissions.push("cashier:refunds:approve");
    open();
    await screen.findByText("Synthetic evidence");
    expect(
      screen.queryByRole("button", { name: "اعتماد الطلب" }),
    ).not.toBeInTheDocument();
  });
  it("requires reservation before completed payout can be recorded", async () => {
    user.id = 3;
    user.permissions.splice(
      0,
      user.permissions.length,
      "cashier:refunds:execute",
    );
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...response, items: [{ ...row, status: "APPROVED" }] },
    });
    open();
    const prepare = await screen.findByRole("button", {
      name: "حجز النقد وبدء الصرف",
    });
    expect(
      screen.queryByRole("button", { name: "تسجيل استرداد منفذ" }),
    ).not.toBeInTheDocument();
    fireEvent.click(prepare);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/billing/invoices/9/refunds/5/prepare",
        expect.objectContaining({ requestId: expect.any(String) }),
      ),
    );
  });
  it("requires evidence and confirmation and preserves completion identity on retry", async () => {
    user.id = 3;
    user.permissions.splice(
      0,
      user.permissions.length,
      "cashier:refunds:execute",
    );
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...response, items: [{ ...row, status: "DISBURSING" }] },
    });
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error("network"));
    open();
    const execute = await screen.findByRole("button", {
      name: "تسجيل استرداد منفذ",
    });
    expect(execute).toBeDisabled();
    fireEvent.change(screen.getByLabelText("مرجع الصرف أو تأكيد البنك"), {
      target: { value: "Synthetic receipt" },
    });
    fireEvent.change(
      screen.getByLabelText("دليل استلام المستفيد أو تأكيد العملية"),
      { target: { value: "Synthetic beneficiary receipt" } },
    );
    expect(execute).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText("أؤكد دفع المبلغ والتحقق من استلام المستفيد"),
    );
    fireEvent.click(execute);
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    fireEvent.click(execute);
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
    expect(vi.mocked(apiClient.post).mock.calls[0]).toEqual(
      vi.mocked(apiClient.post).mock.calls[1],
    );
  });
  it("requires independent no-payment attestation before releasing a payout hold", async () => {
    user.id = 2;
    user.permissions.splice(
      0,
      user.permissions.length,
      "cashier:refunds:approve",
    );
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...response, items: [{ ...row, status: "DISBURSING" }] },
    });
    open();
    const release = await screen.findByRole("button", {
      name: "تحرير الحجز بعد التحقق من عدم الصرف",
    });
    expect(release).toBeDisabled();
    fireEvent.change(
      screen.getByLabelText("سبب الموافقة أو الرفض أو الإلغاء"),
      { target: { value: "Verified no money was paid" } },
    );
    fireEvent.click(
      screen.getByLabelText("تحققت من عدم صرف المبلغ؛ يمكن تحرير الحجز بأمان"),
    );
    fireEvent.click(release);
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/billing/invoices/9/refunds/5/release",
        { reason: "Verified no money was paid", confirmedNotPaid: true },
      ),
    );
  });
  it("keeps read-only users and other executors from mutating a payout", async () => {
    user.id = 4;
    user.permissions.splice(0, user.permissions.length, "cashier:view");
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...response, items: [{ ...row, status: "DISBURSING" }] },
    });
    open();
    await screen.findByText("Synthetic evidence");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
