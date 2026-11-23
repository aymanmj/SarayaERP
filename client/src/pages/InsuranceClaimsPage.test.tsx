import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { apiClient } from "../api/apiClient";
import InsuranceClaimsPage from "./InsuranceClaimsPage";

vi.mock("../api/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("@/components/FeatureGuard", () => ({ FeatureGuard: () => null }));
vi.mock("../stores/authStore", () => ({
  useAuthStore: (select: (state: { user: { id: number } }) => unknown) => select({ user: { id: 20 } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { dir: () => "rtl" },
    t: (key: string, fallback?: unknown) => typeof fallback === "string" ? fallback : key,
  }),
}));

function mockDialog() {
  const previous = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  return () => {
    if (previous) Object.defineProperty(HTMLDialogElement.prototype, "showModal", previous);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  };
}

it("records a withdrawal only after the insurer confirmation is checked", async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => ({
    data: path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "SUBMITTED"
      ? [{
          id: 8,
          claimStatus: "SUBMITTED",
          coveragePolicyId: 3,
          prepaidPrescription: { id: 9 },
          claims: [],
          createdAt: "2026-11-16T08:00:00Z",
          insuranceShare: "2.666",
          patientShare: "0.667",
          patient: { fullName: "Synthetic patient" },
          insuranceProvider: { name: "Synthetic insurer" },
        }]
      : [],
  }));
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  render(<InsuranceClaimsPage />);
  fireEvent.change(screen.getByRole("option", { name: /Submitted/ }).parentElement!, {
    target: { value: "SUBMITTED" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "توثيق سحب المطالبة" }));
  fireEvent.change(screen.getByLabelText("مرجع تأكيد شركة التأمين"), {
    target: { value: "PAYER-ACK-08" },
  });
  fireEvent.change(screen.getByLabelText("سبب السحب"), {
    target: { value: "Synthetic withdrawal reason" },
  });
  const save = screen.getByRole("button", { name: "حفظ التأكيد" });
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByLabelText("استلمت تأكيد السحب من شركة التأمين."));
  fireEvent.click(save);
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
    "/insurance/claims/8/withdrawal",
    { payerReference: "PAYER-ACK-08", reason: "Synthetic withdrawal reason", confirmed: true },
  ));
});

it("opens a partial claim refund and requires bank confirmation for independent posting", async () => {
  const invoice = {
    id: 19, claimStatus: "PARTIALLY_PAID", createdAt: "2026-11-16T08:00:00Z",
    insuranceShare: "2.666", patientShare: "0.667", patient: { fullName: "Synthetic patient" },
    insuranceProvider: { name: "Synthetic insurer" },
    claims: [{ status: "PARTIALLY_PAID", batchId: null, paidAmount: "0.666", _count: { receipts: 1 } }],
  };
  const url = "/insurance/claims/19/receipt-refunds";
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => ({
    data: path === url ? {
      grossAmount: "0.666", refundedAmount: "0.000", netAmount: "0.666",
      receipts: [{ id: 5, amount: "0.666", availableAmount: "0.000" }],
      refunds: [
        { id: 10, receiptId: 5, amount: "0.166", status: "PENDING", reason: "Own request", requestedById: 20 },
        { id: 11, receiptId: 5, amount: "0.500", status: "PENDING", reason: "Other request", requestedById: 21 },
      ],
    } : path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "PARTIALLY_PAID"
      ? [invoice] : [],
  }));
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    fireEvent.change(screen.getByRole("option", { name: "insuranceClaims.refund.partial" }).parentElement!, {
      target: { value: "PARTIALLY_PAID" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "insuranceClaims.refund.title" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "insuranceClaims.refund.review" }));
    fireEvent.change(screen.getByLabelText("insuranceClaims.refund.reviewNote"), { target: { value: "Verified external bank transfer" } });
    fireEvent.change(screen.getByLabelText("insuranceClaims.refund.bankReference"), { target: { value: "BANK-0019" } });
    const post = screen.getByRole("button", { name: "insuranceClaims.refund.post" });
    expect(post).toBeDisabled();
    fireEvent.click(screen.getByLabelText("insuranceClaims.refund.confirmed"));
    fireEvent.click(post);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`${url}/11/review`, {
      decision: "POST", confirmed: true, note: "Verified external bank transfer", bankReference: "BANK-0019",
    }));
  } finally {
    restoreDialog();
  }
});

it("posts grouped insurer collections only after the exact received amount is confirmed", async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => ({
    data: path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "SUBMITTED"
      ? [{
          id: 19, claimStatus: "SUBMITTED", createdAt: "2026-11-16T08:00:00Z",
          insuranceShare: "2.666", patientShare: "0.667", patient: { fullName: "Synthetic patient" },
          insuranceProviderId: 7, insuranceProvider: { name: "Synthetic insurer" }, claims: [],
        }]
      : [],
  }));
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    fireEvent.change(screen.getByRole("option", { name: /Submitted/ }).parentElement!, {
      target: { value: "SUBMITTED" },
    });
    fireEvent.click(await screen.findByRole("checkbox", { name: "insuranceClaims.settlement.selectInvoice" }));
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.settlement.title" }));
    const amount = screen.getByLabelText("insuranceClaims.settlement.amount");
    fireEvent.change(amount, { target: { value: "2.665" } });
    fireEvent.change(screen.getByLabelText("insuranceClaims.settlement.reference"), { target: { value: "BANK-TEST-19" } });
    fireEvent.click(screen.getByLabelText("insuranceClaims.settlement.confirmed"));
    const post = screen.getByRole("button", { name: "insuranceClaims.settlement.post" });
    expect(post).toBeDisabled();
    expect(screen.getByText("insuranceClaims.settlement.amountMismatch")).toBeInTheDocument();
    fireEvent.change(amount, { target: { value: "2.666" } });
    fireEvent.click(post);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/insurance/claims/settlements", {
      providerId: 7, invoiceIds: [19], amount: "2.666", bankReference: "BANK-TEST-19", confirmed: true,
    }));
  } finally {
    restoreDialog();
  }
});

it("requests an insurer settlement refund with exact amounts for the selected allocations", async () => {
  const url = "/insurance/claims/settlements/7/refunds";
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => ({
    data: path === url ? {
      bankReference: "BANK-SETTLED", amount: "2.666", refunds: [],
      allocations: [
        { id: 20, invoiceId: 19, amount: "1.666", refunded: "0.000", available: "1.666", remainingAfterReceipt: "0.350" },
        { id: 21, invoiceId: 22, amount: "1.000", refunded: "0.000", available: "1.000" },
      ],
    } : path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "PAID"
      ? [{
          id: 19, claimStatus: "PAID", createdAt: "2026-11-16T08:00:00Z", insuranceShare: "1.666", patientShare: "0.667",
          patient: { fullName: "Synthetic patient" }, insuranceProvider: { name: "Synthetic insurer" }, claims: [],
          insuranceSettlementAllocations: [{ amount: "1.666", settlement: { id: 7, bankReference: "BANK-SETTLED" } }],
        }]
      : [],
  }));
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    const paid = document.querySelector<HTMLOptionElement>("option[value='PAID']")!;
    fireEvent.change(paid.parentElement!, { target: { value: "PAID" } });
    fireEvent.click(await screen.findByRole("button", { name: /insuranceClaims.settlementRefund.title/ }));
    const amount = await screen.findAllByLabelText("insuranceClaims.settlementRefund.invoiceAmount");
    expect(screen.getByText("insuranceClaims.settlement.remaining")).toHaveTextContent("0.350");
    fireEvent.change(amount[0], { target: { value: "1.667" } });
    fireEvent.change(screen.getByLabelText("insuranceClaims.refund.reason"), { target: { value: "Synthetic refund reason" } });
    const submit = screen.getByRole("button", { name: "insuranceClaims.refund.request" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.settlementRefund.allAvailable" }));
    fireEvent.change(amount[1], { target: { value: "0.125" } });
    fireEvent.click(submit);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(url, {
      requestId: expect.any(String), reason: "Synthetic refund reason",
      lines: [{ allocationId: 20, amount: "1.666" }, { allocationId: 21, amount: "0.125" }],
    }));
  } finally {
    restoreDialog();
  }
});

it("recollects only the reopened insurer balance from a partially paid claim", async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => ({
    data: path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "PARTIALLY_PAID"
      ? [{
          id: 19, claimStatus: "PARTIALLY_PAID", createdAt: "2026-11-16T08:00:00Z",
          insuranceShare: "2.666", patientShare: "0.667", settlementOutstanding: "0.125", settlementEffectiveShare: "2.000",
          patient: { fullName: "Synthetic patient" }, insuranceProviderId: 7,
          insuranceProvider: { name: "Synthetic insurer" }, claims: [],
          insuranceSettlementAllocations: [
            { amount: "2.666", settlement: { id: 8, bankReference: "BANK-ORIGINAL" } },
          ],
        }]
      : [],
  }));
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    fireEvent.change(screen.getByRole("option", { name: "insuranceClaims.refund.partial" }).parentElement!, {
      target: { value: "PARTIALLY_PAID" },
    });
    fireEvent.click(await screen.findByRole("checkbox", { name: "insuranceClaims.settlement.selectInvoice" }));
    expect(screen.getAllByText("2.000").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.settlement.title" }));
    const amount = screen.getByLabelText("insuranceClaims.settlement.amount");
    fireEvent.change(amount, { target: { value: "2.666" } });
    fireEvent.change(screen.getByLabelText("insuranceClaims.settlement.reference"), { target: { value: "BANK-RECOLLECT-19" } });
    fireEvent.click(screen.getByLabelText("insuranceClaims.settlement.confirmed"));
    const post = screen.getByRole("button", { name: "insuranceClaims.settlement.post" });
    expect(post).toBeDisabled();
    fireEvent.change(amount, { target: { value: "0.125" } });
    fireEvent.click(post);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/insurance/claims/settlements", {
      providerId: 7, invoiceIds: [19], amount: "0.125", bankReference: "BANK-RECOLLECT-19", confirmed: true,
    }));
  } finally {
    restoreDialog();
  }
});

it("allocates a short transfer explicitly and keeps its remainder visible", async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => ({
    data: path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "SUBMITTED"
      ? ["1.000", "0.450"].map((insuranceShare, index) => ({
          id: 19 + index, claimStatus: "SUBMITTED", createdAt: "2026-11-16T08:00:00Z",
          insuranceShare, patientShare: "0.000", patient: { fullName: "Synthetic patient" },
          insuranceProviderId: 7, insuranceProvider: { name: "Synthetic insurer" }, claims: [],
        }))
      : [],
  }));
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    fireEvent.change(screen.getByRole("option", { name: /Submitted/ }).parentElement!, {
      target: { value: "SUBMITTED" },
    });
    const selectAll = screen.getByRole("checkbox", { name: "insuranceClaims.settlement.selectAll" });
    await waitFor(() => expect(selectAll).toBeEnabled());
    fireEvent.click(selectAll);
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.settlement.title" }));
    fireEvent.click(screen.getByLabelText("insuranceClaims.settlement.allocate"));
    const fields = screen.getAllByLabelText(/insuranceClaims.settlement.allocateInvoice/);
    fireEvent.change(fields[0], { target: { value: "0.649" } });
    fireEvent.change(fields[1], { target: { value: "0.451" } });
    fireEvent.change(screen.getByLabelText("insuranceClaims.settlement.amount"), { target: { value: "1.100" } });
    fireEvent.change(screen.getByLabelText("insuranceClaims.settlement.reference"), { target: { value: "BANK-PARTIAL-19" } });
    fireEvent.click(screen.getByLabelText("insuranceClaims.settlement.confirmed"));
    const post = screen.getByRole("button", { name: "insuranceClaims.settlement.post" });
    expect(post).toBeDisabled();
    fireEvent.change(fields[0], { target: { value: "0.650" } });
    fireEvent.change(fields[1], { target: { value: "0.450" } });
    expect(screen.getByText("insuranceClaims.settlement.remaining")).toHaveTextContent("0.350");
    fireEvent.click(post);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/insurance/claims/settlements", {
      providerId: 7, invoiceIds: [19, 20], amount: "1.100", bankReference: "BANK-PARTIAL-19", confirmed: true,
      allocations: [{ invoiceId: 19, amount: "0.650" }, { invoiceId: 20, amount: "0.450" }],
    }));
  } finally {
    restoreDialog();
  }
});

it("records an overpaid insurer transfer only after opting into unallocated balance recording", async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => ({
    data: path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "SUBMITTED"
      ? [{
          id: 19, claimStatus: "SUBMITTED", createdAt: "2026-11-16T08:00:00Z",
          insuranceShare: "2.000", patientShare: "0.000", patient: { fullName: "Synthetic patient" },
          insuranceProviderId: 7, insuranceProvider: { name: "Synthetic insurer" }, claims: [],
        }]
      : [],
  }));
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    fireEvent.change(screen.getByRole("option", { name: /Submitted/ }).parentElement!, {
      target: { value: "SUBMITTED" },
    });
    fireEvent.click(await screen.findByRole("checkbox", { name: "insuranceClaims.settlement.selectInvoice" }));
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.settlement.title" }));
    fireEvent.change(screen.getByLabelText("insuranceClaims.settlement.amount"), { target: { value: "2.500" } });
    fireEvent.change(screen.getByLabelText("insuranceClaims.settlement.reference"), { target: { value: "BANK-OVERPAY-19" } });
    fireEvent.click(screen.getByLabelText("insuranceClaims.settlement.confirmed"));
    const post = screen.getByRole("button", { name: "insuranceClaims.settlement.post" });
    expect(post).toBeDisabled();
    fireEvent.click(screen.getByLabelText("insuranceClaims.settlement.recordExcessAsUnallocated"));
    expect(post).toBeEnabled();
    fireEvent.click(post);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/insurance/claims/settlements", {
      providerId: 7, invoiceIds: [19], amount: "2.500", bankReference: "BANK-OVERPAY-19", confirmed: true, unallocatedAmount: "0.500",
    }));
  } finally {
    restoreDialog();
  }
});

it("records a standalone pure unallocated insurer transfer", async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path) => ({
    data: path === "/insurance/providers" ? [{ id: 7, name: "Synthetic insurer" }] : [],
  }));
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    await screen.findByRole("option", { name: "Synthetic insurer" });
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.settlement.recordUnallocated" }));
    fireEvent.change(screen.getByLabelText("insuranceClaims.settlement.amount"), { target: { value: "10.000" } });
    fireEvent.change(screen.getByLabelText("insuranceClaims.settlement.reference"), { target: { value: "BANK-PURE-7" } });
    fireEvent.click(screen.getByLabelText("insuranceClaims.settlement.confirmed"));
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.settlement.post" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/insurance/claims/settlements", {
      providerId: 7, invoiceIds: [], amount: "10.000", bankReference: "BANK-PURE-7", confirmed: true, unallocatedAmount: "10.000",
    }));
  } finally {
    restoreDialog();
  }
});

it("applies an available unallocated settlement credit to selected claims with partial allocation", async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => {
    if (path === "/insurance/claims/settlements") {
      return {
        data: [{
          id: 41, providerId: 7, provider: { id: 7, name: "Synthetic insurer", code: "INS-7" },
          bankReference: "BANK-UNALLOC-41", amount: "2.000", unallocatedAmount: "2.000",
          appliedUnallocated: "0.000", refundedUnallocated: "0.000", pendingRefundUnallocated: "0.000",
          availableUnallocated: "1.200", createdAt: "2026-11-22T10:00:00Z",
        }],
      };
    }
    if (path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "SUBMITTED") {
      return {
        data: [{
          id: 30, claimStatus: "SUBMITTED", createdAt: "2026-11-22T09:00:00Z",
          insuranceShare: "1.500", patientShare: "0.000", patient: { fullName: "Synthetic patient" },
          insuranceProviderId: 7, insuranceProvider: { name: "Synthetic insurer" }, claims: [],
        }],
      };
    }
    return { data: [] };
  });
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    fireEvent.change(screen.getByRole("option", { name: /Submitted/ }).parentElement!, {
      target: { value: "SUBMITTED" },
    });
    fireEvent.click(await screen.findByRole("checkbox", { name: "insuranceClaims.settlement.selectInvoice" }));
    const applyButtons = await screen.findAllByRole("button", { name: "insuranceClaims.settlement.applyBtn" });
    fireEvent.click(applyButtons[0]);
    expect(screen.getByText("insuranceClaims.settlement.applyExceedsAvailable")).toBeInTheDocument();
    const allocInput = screen.getByLabelText("insuranceClaims.settlement.allocateInvoice");
    fireEvent.change(allocInput, { target: { value: "1.200" } });
    const dialogButtons = screen.getAllByRole("button", { name: "insuranceClaims.settlement.applyBtn" });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/insurance/claims/settlements/41/apply", {
      requestId: expect.any(String),
      invoiceIds: [30],
      amount: "1.200",
      allocations: [{ invoiceId: 30, amount: "1.200" }],
    }));
  } finally {
    restoreDialog();
  }
});

it("requests a refund from unallocated settlement balance inside InsuranceSettlementRefundDialog", async () => {
  const url = "/insurance/claims/settlements/42/refunds";
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => {
    if (path === url) {
      return {
        data: {
          bankReference: "BANK-UNALLOC-42", amount: "2.000",
          unallocatedAmount: "2.000", appliedUnallocated: "0.000", refundedUnallocated: "0.000", availableUnallocated: "2.000",
          allocations: [], refunds: [],
        },
      };
    }
    if (path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "PAID") {
      return {
        data: [{
          id: 31, claimStatus: "PAID", createdAt: "2026-11-22T09:00:00Z", insuranceShare: "1.000", patientShare: "0.000",
          patient: { fullName: "Synthetic patient" }, insuranceProvider: { name: "Synthetic insurer" }, claims: [],
          insuranceSettlementAllocations: [{ amount: "1.000", settlement: { id: 42, bankReference: "BANK-UNALLOC-42" } }],
        }],
      };
    }
    return { data: [] };
  });
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    const paid = document.querySelector<HTMLOptionElement>("option[value='PAID']")!;
    fireEvent.change(paid.parentElement!, { target: { value: "PAID" } });
    fireEvent.click(await screen.findByRole("button", { name: /insuranceClaims.settlementRefund.title/ }));
    const unallocInput = await screen.findByLabelText(/insuranceClaims.refund.unallocatedInput/);
    fireEvent.change(unallocInput, { target: { value: "0.750" } });
    fireEvent.change(screen.getByLabelText("insuranceClaims.refund.reason"), { target: { value: "Return excess transfer" } });
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.refund.request" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(url, {
      requestId: expect.any(String),
      reason: "Return excess transfer",
      unallocatedAmount: "0.750",
    }));
  } finally {
    restoreDialog();
  }
});

it("submits a contractual claim write-off request via InsuranceWriteOffDialog", async () => {
  const url = "/insurance/claims/55/write-offs";
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => {
    if (path === url) {
      return {
        data: {
          invoiceId: 55,
          claimStatus: "PARTIALLY_PAID",
          effectiveShare: "1.000",
          settledNet: "0.700",
          postedWriteOff: "0.000",
          pendingWriteOff: "0.000",
          available: "0.300",
          writeOffs: [],
        },
      };
    }
    if (path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "PARTIALLY_PAID") {
      return {
        data: [{
          id: 55, claimStatus: "PARTIALLY_PAID", createdAt: "2026-11-22T09:00:00Z", insuranceShare: "1.000", patientShare: "0.000",
          settlementOutstanding: "0.300", insuranceProviderId: 7, patient: { fullName: "Synthetic patient" }, insuranceProvider: { name: "Synthetic insurer" }, claims: [],
        }],
      };
    }
    return { data: [] };
  });
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    const partialOpt = document.querySelector<HTMLOptionElement>("option[value='PARTIALLY_PAID']")!;
    fireEvent.change(partialOpt.parentElement!, { target: { value: "PARTIALLY_PAID" } });
    fireEvent.click(await screen.findByRole("button", { name: "insuranceClaims.writeOff.open" }));
    fireEvent.click(await screen.findByRole("button", { name: "insuranceClaims.writeOff.fillRemaining" }));
    fireEvent.change(screen.getByLabelText("insuranceClaims.writeOff.reason"), { target: { value: "Contractual fee cap difference" } });
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.writeOff.request" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(url, {
      requestId: expect.any(String),
      category: "CONTRACTUAL_ALLOWANCE",
      amount: "0.300",
      reason: "Contractual fee cap difference",
    }));
  } finally {
    restoreDialog();
  }
});

it("allows an independent reviewer to approve and post a pending write-off in InsuranceWriteOffDialog", async () => {
  const url = "/insurance/claims/56/write-offs";
  vi.mocked(apiClient.get).mockImplementation(async (path, config) => {
    if (path === url) {
      return {
        data: {
          invoiceId: 56,
          claimStatus: "REJECTED",
          effectiveShare: "1.000",
          settledNet: "0.000",
          postedWriteOff: "0.000",
          pendingWriteOff: "0.400",
          available: "0.600",
          writeOffs: [{
            id: 91,
            category: "BAD_DEBT",
            amount: "0.400",
            reason: "Final insurer denial of line item",
            status: "PENDING",
            requestedById: 99,
            reviewNote: null,
            postingEntryId: null,
          }],
        },
      };
    }
    if (path === "/insurance/claims" && (config?.params as { status?: string } | undefined)?.status === "REJECTED") {
      return {
        data: [{
          id: 56, claimStatus: "REJECTED", createdAt: "2026-11-22T09:00:00Z", insuranceShare: "1.000", patientShare: "0.000",
          pendingWriteOffCount: 1, insuranceProviderId: 7, patient: { fullName: "Synthetic patient" }, insuranceProvider: { name: "Synthetic insurer" }, claims: [],
        }],
      };
    }
    return { data: [] };
  });
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: {} });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    const rejectedOpt = document.querySelector<HTMLOptionElement>("option[value='REJECTED']")!;
    fireEvent.change(rejectedOpt.parentElement!, { target: { value: "REJECTED" } });
    fireEvent.click(await screen.findByRole("button", { name: "insuranceClaims.writeOff.open" }));
    fireEvent.click(await screen.findByRole("button", { name: "insuranceClaims.writeOff.review" }));
    fireEvent.change(screen.getByLabelText("insuranceClaims.writeOff.reviewNote"), { target: { value: "Approved by finance reviewer" } });
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.writeOff.post" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`${url}/91/review`, {
      decision: "POST",
      note: "Approved by finance reviewer",
    }));
  } finally {
    restoreDialog();
  }
});

it("posts an ERA file financially via EraReconciliationDialog", async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path) => {
    if (path === "/rcm/claims/era") {
      return {
        data: [{
          id: 77,
          eraNumber: "ERA-2026-077",
          insuranceProvider: { id: 7, name: "Synthetic insurer", code: "INS-7" },
          totalPaid: "75.000",
          totalClaims: 2,
          bankReference: null,
          status: "PROCESSING",
          lineItems: [
            { id: 1, claimId: 101, receiptId: null, claimNumber: "CLM-101", billedAmount: "100.000", paidAmount: "75.000", adjustmentCode: "CO-45", status: "UNDERPAID" },
            { id: 2, claimId: 102, receiptId: null, claimNumber: "CLM-102", billedAmount: "80.000", paidAmount: "0.000", denialCode: "CO-197", status: "DENIED" },
          ],
        }],
      };
    }
    return { data: [] };
  });
  vi.mocked(apiClient.post).mockClear().mockResolvedValue({ data: { success: true } });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.era.open" }));
    const bankInput = await screen.findByLabelText("insuranceClaims.era.bankReference");
    fireEvent.change(bankInput, { target: { value: "BANK-ERA-77" } });
    fireEvent.click(screen.getByLabelText("insuranceClaims.era.confirmed"));
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.era.postBtn" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/rcm/claims/era/77/post", {
      requestId: expect.any(String),
      bankReference: "BANK-ERA-77",
      confirmed: true,
    }));
  } finally {
    restoreDialog();
  }
});

it("submits and adjudicates a claim batch via PayerBatchClearingDialog", async () => {
  let batchState: "OPEN" | "SUBMITTED" = "OPEN";
  vi.mocked(apiClient.get).mockImplementation(async (path) => {
    if (path === "/rcm/claims/batches") {
      return {
        data: [{
          id: 88,
          batchNumber: "BATCH-1-7-88",
          clearingChannel: "LOCAL_CLEARINGHOUSE",
          status: batchState,
          totalClaims: 1,
          totalAmount: "100.000",
          provider: { id: 7, name: "Synthetic insurer", code: "INS-7" },
          eraTransaction: null,
          claims: [
            { id: 881, claimNumber: "CLM-881", status: batchState === "OPEN" ? "SCRUBBED" : "SUBMITTED", claimedAmount: "100.000" },
          ],
        }],
      };
    }
    return { data: [] };
  });
  vi.mocked(apiClient.post).mockClear().mockImplementation(async () => {
    batchState = "SUBMITTED";
    return { data: { success: true } };
  });
  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.clearinghouse.open" }));
    fireEvent.click(await screen.findByRole("button", { name: "insuranceClaims.clearinghouse.submitBtn" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/rcm/claims/batches/88/submit", {
      requestId: expect.any(String),
      channel: "LOCAL_CLEARINGHOUSE",
    }));
    const approveInput = await screen.findByLabelText("insuranceClaims.clearinghouse.approvedAmount CLM-881");
    fireEvent.change(approveInput, { target: { value: "85.000" } });
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.clearinghouse.adjudicateBtn" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/rcm/claims/batches/88/adjudicate", {
      requestId: expect.any(String),
      decisions: [{ claimId: 881, approvedAmount: "85.000" }],
    }));
  } finally {
    restoreDialog();
  }
});

it("accrues and settles a B2B gateway clearing fee on a closed batch via PayerBatchClearingDialog", async () => {
  let feeEntry: {
    id: number;
    b2bInvoiceNumber: string;
    totalFeeAmount: string;
    flatFeeTotal: string;
    percentageFeeTotal: string;
    status: "ACCRUED" | "SETTLED";
    settlementBankReference: string | null;
  } | null = null;

  vi.mocked(apiClient.get).mockImplementation(async (path) => {
    if (path === "/rcm/claims/batches") {
      return {
        data: [{
          id: 99,
          batchNumber: "BATCH-1-7-99",
          clearingChannel: "LOCAL_CLEARINGHOUSE",
          status: "CLOSED",
          totalClaims: 2,
          totalAmount: "200.000",
          approvedAmount: "200.000",
          provider: { id: 7, name: "Synthetic insurer", code: "INS-7" },
          eraTransaction: { id: 199, eraNumber: "ERA-CLH-99", status: "PROCESSING", totalPaid: "200.000" },
          gatewayFeeEntry: feeEntry,
          claims: [],
        }],
      };
    }
    return { data: [] };
  });

  vi.mocked(apiClient.post).mockClear().mockImplementation(async (path) => {
    if (path === "/rcm/claims/batches/99/gateway-fee") {
      feeEntry = {
        id: 301,
        b2bInvoiceNumber: "SARAYA-B2B-1-99",
        totalFeeAmount: "5.000",
        flatFeeTotal: "4.000",
        percentageFeeTotal: "1.000",
        status: "ACCRUED",
        settlementBankReference: null,
      };
    } else if (path === "/rcm/claims/gateway-fees/301/settle") {
      feeEntry = {
        ...feeEntry!,
        status: "SETTLED",
        settlementBankReference: "BANK-B2B-99",
      };
    }
    return { data: { success: true } };
  });

  const restoreDialog = mockDialog();
  try {
    render(<InsuranceClaimsPage />);
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.clearinghouse.open" }));
    fireEvent.click(await screen.findByLabelText("insuranceClaims.clearinghouse.feeConfirmed"));
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.clearinghouse.accrueFeeBtn" }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/rcm/claims/batches/99/gateway-fee", {
      requestId: expect.any(String),
      flatFeePerClaim: "2.000",
      feeRate: "0.0050",
      confirmed: true,
    }));

    const bankRefInput = await screen.findByLabelText("insuranceClaims.clearinghouse.feeBankReference");
    fireEvent.change(bankRefInput, { target: { value: "BANK-B2B-99" } });
    fireEvent.click(screen.getByLabelText("insuranceClaims.clearinghouse.feeSettleConfirmed"));
    fireEvent.click(screen.getByRole("button", { name: "insuranceClaims.clearinghouse.settleFeeBtn" }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/rcm/claims/gateway-fees/301/settle", {
      requestId: expect.any(String),
      bankReference: "BANK-B2B-99",
      confirmed: true,
    }));
  } finally {
    restoreDialog();
  }
});
