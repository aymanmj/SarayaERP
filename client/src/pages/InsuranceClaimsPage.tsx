import React, { useEffect, useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { ShieldCheck, FileText, CheckCircle2, XCircle, Printer, RefreshCw, AlertCircle, Building2, Upload, Loader2 } from "lucide-react";
import { FeatureGuard } from "@/components/FeatureGuard";
import { Money } from "../utils/money";
import { ClaimReceiptRefundDialog } from "./ClaimReceiptRefundDialog";
import { InsuranceSettlementRefundDialog } from "./InsuranceSettlementRefundDialog";
import { InsuranceWriteOffDialog } from "./InsuranceWriteOffDialog";
import { EraReconciliationDialog } from "./EraReconciliationDialog";
import { PayerBatchClearingDialog } from "./PayerBatchClearingDialog";
import { useIdempotentPost } from "../hooks/useIdempotentPost";

const MONEY_RE = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/;

type UnallocatedSettlement = {
  id: number;
  providerId: number;
  provider: { id: number; name: string; code: string };
  bankReference: string;
  amount: string;
  unallocatedAmount: string;
  appliedUnallocated: string;
  refundedUnallocated: string;
  pendingRefundUnallocated: string;
  availableUnallocated: string;
  createdAt: string;
};

type InsuranceProvider = {
  id: number;
  name: string;
};

type ClaimInvoice = {
  id: number;
  invoiceNumber: string | null;
  createdAt: string;
  totalAmount: number | string;
  insuranceShare: number | string;
  patientShare: number | string;
  insuranceProviderId: number | null;
  claimStatus: string | null;
  coveragePolicyId?: number | null;
  prepaidPrescription?: { id: number } | null;
  claims?: { status: string; batchId: number | null; paidAmount: number | string | null; _count?: { receipts: number } }[];
  claimWithdrawal?: { payerReference: string; reason: string; createdAt: string } | null;
  settlementOutstanding?: string | null;
  settlementEffectiveShare?: string;
  settlementEffectivePatientShare?: string;
  settlementWrittenOff?: string;
  pendingWriteOffCount?: number;
  insuranceSettlementAllocations?: { amount: string; settlement: { id: number; bankReference: string } }[];
  rejectionReason?: string | null;
  patient: {
    fullName: string;
    mrn: string;
    insuranceMemberId: string | null;
  };
  insuranceProvider: {
    name: string;
  };
};

function formatMoney(v: Parameters<typeof Money.toFixed>[0]) {
  return Money.toFixed(v);
}

function effectiveClaimShare(invoice: ClaimInvoice) {
  return invoice.settlementEffectiveShare ?? invoice.insuranceShare;
}

function effectivePatientShare(invoice: ClaimInvoice) {
  return invoice.settlementEffectivePatientShare ?? invoice.patientShare;
}

function collectibleClaimAmount(invoice: ClaimInvoice) {
  return invoice.settlementOutstanding ?? effectiveClaimShare(invoice);
}

function hasRcmPrescriptionClaim(invoice: ClaimInvoice) {
  return !!invoice.prepaidPrescription && !!invoice.claims?.length;
}

function canWithdrawClaim(invoice: ClaimInvoice) {
  if (invoice.claimWithdrawal ||
      ["PAID", "PARTIALLY_PAID", "WITHDRAWN"].includes(invoice.claimStatus ?? "")) return false;
  const claims = invoice.claims ?? [];
  if (invoice.insuranceSettlementAllocations?.length) {
    return !claims.length && invoice.claimStatus === "SUBMITTED" && invoice.settlementOutstanding != null &&
      Money.decimal(invoice.settlementOutstanding).eq(effectiveClaimShare(invoice));
  }
  if (!invoice.prepaidPrescription || !invoice.coveragePolicyId) return false;
  if (!claims.length) return ["SUBMITTED", "REJECTED"].includes(invoice.claimStatus ?? "");
  const [claim] = claims;
  return claims.length === 1 && claim.batchId == null && !Money.decimal(claim.paidAmount).gt(0) &&
    ["SUBMITTED", "ACCEPTED", "REJECTED", "APPEAL_ACCEPTED"].includes(claim.status);
}

function canSettleClaim(invoice: ClaimInvoice) {
  return !invoice.claimWithdrawal && !!invoice.insuranceProviderId && !invoice.claims?.length &&
    ["SUBMITTED", "PARTIALLY_PAID"].includes(invoice.claimStatus ?? "") &&
    Money.decimal(collectibleClaimAmount(invoice)).gt(0);
}

function canManageWriteOff(invoice: ClaimInvoice) {
  return !invoice.claimWithdrawal && !!invoice.insuranceProviderId && !invoice.claims?.length && (
    ["SUBMITTED", "PARTIALLY_PAID", "REJECTED"].includes(invoice.claimStatus ?? "") ||
    Money.decimal(invoice.settlementWrittenOff ?? 0).gt(0) ||
    (invoice.pendingWriteOffCount ?? 0) > 0
  );
}

export default function InsuranceClaimsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);
  const [claims, setClaims] = useState<ClaimInvoice[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");

  // Selection for Batch Action
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Rejection Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [withdrawalInvoice, setWithdrawalInvoice] = useState<number | null>(null);
  const [refundInvoice, setRefundInvoice] = useState<number | null>(null);
  const [payerReference, setPayerReference] = useState("");
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [payerConfirmed, setPayerConfirmed] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [settlement, setSettlement] = useState<{
    invoices: { id: number; due: string }[];
    providerId: number;
    providerName: string;
    expected: string;
  } | null>(null);
  const [allocateSettlement, setAllocateSettlement] = useState(false);
  const [settlementAmounts, setSettlementAmounts] = useState<Record<number, string>>({});
  const [bankReference, setBankReference] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [bankConfirmed, setBankConfirmed] = useState(false);
  const [settling, setSettling] = useState(false);
  const [recordExcessAsUnallocated, setRecordExcessAsUnallocated] = useState(false);
  const [unallocatedSettlements, setUnallocatedSettlements] = useState<UnallocatedSettlement[]>([]);
  const [applyTarget, setApplyTarget] = useState<{
    settlement: UnallocatedSettlement;
    invoices: { id: number; due: string }[];
  } | null>(null);
  const [applyAllocate, setApplyAllocate] = useState(false);
  const [applyAmounts, setApplyAmounts] = useState<Record<number, string>>({});
  const [applying, setApplying] = useState(false);
  const applyDialog = useRef<HTMLDialogElement>(null);
  const applyPost = useIdempotentPost(
    applyTarget ? `/insurance/claims/settlements/${applyTarget.settlement.id}/apply` : "apply",
  );
  const settlementDialog = useRef<HTMLDialogElement>(null);
  const [settlementRefund, setSettlementRefund] = useState<number | null>(null);
  const [writeOffInvoice, setWriteOffInvoice] = useState<number | null>(null);
  const [showEraDialog, setShowEraDialog] = useState(false);
  const [showClearinghouseDialog, setShowClearinghouseDialog] = useState(false);
  const settlementFilter = ["SUBMITTED", "PARTIALLY_PAID"].includes(statusFilter);
  const selectable = claims.filter((claim) => settlementFilter ? canSettleClaim(claim) :
    !claim.claimWithdrawal && !claim.insuranceSettlementAllocations?.length && !hasRcmPrescriptionClaim(claim));
  const selectedHasSettlement = claims.some((claim) => selectedIds.includes(claim.id) && !!claim.insuranceSettlementAllocations?.length);

  // NPHIES State
  const [nphiesLoading, setNphiesLoading] = useState(false);

  // Load Providers
  useEffect(() => {
    apiClient.get<InsuranceProvider[]>("/insurance/providers").then((res) => {
      setProviders(res.data);
    });
  }, []);

  // Load Claims
  const loadClaims = async () => {
    setLoading(true);
    try {
       
      const params: any = { status: statusFilter };
      if (selectedProvider) params.providerId = selectedProvider;

      const settlementParams: Record<string, string> = { onlyUnallocated: "true" };
      if (selectedProvider) settlementParams.providerId = selectedProvider;
      const [res, settlementRes] = await Promise.all([
        apiClient.get<ClaimInvoice[]>("/insurance/claims", { params }),
        apiClient.get<UnallocatedSettlement[]>("/insurance/claims/settlements", { params: settlementParams }),
      ]);
      setUnallocatedSettlements(Array.isArray(settlementRes?.data) ? settlementRes.data : []);
      setClaims(res.data);
      setSelectedIds([]); // Reset selection
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("insuranceClaims.toast.loadFailed", "فشل تحميل المطالبات."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, statusFilter]);

  // Handle Selection
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === selectable.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectable.map((c) => c.id));
    }
  };

  const openWithdrawal = (invoiceId: number) => {
    setWithdrawalInvoice(invoiceId);
    setPayerReference("");
    setWithdrawalReason("");
    setPayerConfirmed(false);
  };

  const saveWithdrawal = async () => {
    if (withdrawalInvoice == null || withdrawing || !payerConfirmed ||
        payerReference.trim().length < 5 || withdrawalReason.trim().length < 5) return;
    setWithdrawing(true);
    try {
      await apiClient.post(`/insurance/claims/${withdrawalInvoice}/withdrawal`, {
        payerReference: payerReference.trim(),
        reason: withdrawalReason.trim(),
        confirmed: payerConfirmed,
      });
      setWithdrawalInvoice(null);
      toast.success(t("insuranceClaims.withdrawal.saved", "تم توثيق سحب المطالبة."));
      await loadClaims();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      toast.error(typeof message === "string" ? message : t("preAuth.toast.updateFailed", "فشل التحديث."));
    } finally {
      setWithdrawing(false);
    }
  };

  const openUnallocatedSettlement = () => {
    const initialProvider = selectedProvider
      ? providers.find((provider) => String(provider.id) === selectedProvider)
      : providers[0];
    setBankReference("");
    setReceivedAmount("");
    setBankConfirmed(false);
    setAllocateSettlement(false);
    setRecordExcessAsUnallocated(false);
    setSettlementAmounts({});
    setSettlement({
      invoices: [],
      providerId: initialProvider?.id ?? 0,
      providerName: initialProvider?.name ?? "",
      expected: "0.000",
    });
  };

  const openSettlement = () => {
    const invoices = claims.filter((invoice) => selectedIds.includes(invoice.id));
    const first = invoices[0];
    if (!first?.insuranceProviderId || invoices.length > 100 || invoices.some((invoice) =>
      invoice.insuranceProviderId !== first.insuranceProviderId || !canSettleClaim(invoice))) {
      toast.error(t("insuranceClaims.settlement.eligible"));
      return;
    }
    setBankReference("");
    setReceivedAmount("");
    setBankConfirmed(false);
    setAllocateSettlement(false);
    setRecordExcessAsUnallocated(false);
    setSettlementAmounts({});
    setSettlement({
      invoices: invoices.map((invoice) => ({ id: invoice.id, due: formatMoney(collectibleClaimAmount(invoice)) })),
      providerId: first.insuranceProviderId,
      providerName: first.insuranceProvider.name,
      expected: formatMoney(Money.sumDecimal(...invoices.map(collectibleClaimAmount))),
    });
  };

  const allocatedInvoices = settlement?.invoices.map((invoice) => ({
    ...invoice, amount: settlementAmounts[invoice.id] ?? "",
  })) ?? [];
  const validAllocations = allocatedInvoices.length > 0 && allocatedInvoices.every(({ amount, due }) =>
    /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(amount) && Money.decimal(amount).gt(0) && Money.decimal(amount).lte(due));
  const isPureUnallocated = settlement?.invoices.length === 0;
  const allocatedTotal = validAllocations ? Money.sumDecimal(...allocatedInvoices.map(({ amount }) => amount)) : null;
  const targetAllocated = settlement ? (allocateSettlement ? allocatedTotal : Money.decimal(settlement.expected)) : null;
  const parsedReceived = MONEY_RE.test(receivedAmount) && Money.decimal(receivedAmount).gt(0) ? Money.decimal(receivedAmount) : null;
  const excessAmount = !isPureUnallocated && parsedReceived != null && targetAllocated != null && parsedReceived.gt(targetAllocated)
    ? parsedReceived.minus(targetAllocated)
    : null;
  const exactAllocatedMatch = !isPureUnallocated && parsedReceived != null && targetAllocated != null && parsedReceived.eq(targetAllocated);
  const matchesExpectedAmount = isPureUnallocated
    ? parsedReceived != null
    : Boolean(exactAllocatedMatch || (recordExcessAsUnallocated && excessAmount != null));

  const validSettlement = Boolean(
    matchesExpectedAmount &&
      (!isPureUnallocated || (settlement?.providerId ?? 0) > 0) &&
      bankConfirmed &&
      bankReference.trim().length >= 5,
  );

  useEffect(() => {
    if (settlement) settlementDialog.current?.showModal();
  }, [settlement]);

  const saveSettlement = async () => {
    if (!settlement || !validSettlement || settling) return;
    setSettling(true);
    try {
      await apiClient.post("/insurance/claims/settlements", {
        providerId: settlement.providerId,
        invoiceIds: settlement.invoices.map(({ id }) => id),
        amount: receivedAmount,
        bankReference: bankReference.trim(),
        confirmed: bankConfirmed,
        ...(!isPureUnallocated && allocateSettlement && { allocations: allocatedInvoices.map(({ id, amount }) => ({ invoiceId: id, amount })) }),
        ...(isPureUnallocated
          ? { unallocatedAmount: receivedAmount }
          : recordExcessAsUnallocated && excessAmount != null
            ? { unallocatedAmount: formatMoney(excessAmount) }
            : {}),
      });
      setSettlement(null);
      toast.success(t("insuranceClaims.settlement.saved"));
      await loadClaims();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      toast.error(typeof message === "string" ? message : t("preAuth.toast.updateFailed"));
    } finally {
      setSettling(false);
    }
  };

  const openApplyCredit = (source: UnallocatedSettlement) => {
    const invoices = claims.filter((invoice) => selectedIds.includes(invoice.id));
    if (
      invoices.length === 0 ||
      invoices.length > 100 ||
      invoices.some((invoice) => invoice.insuranceProviderId !== source.providerId || !canSettleClaim(invoice))
    ) {
      toast.error(t("insuranceClaims.settlement.eligible"));
      return;
    }
    const dues = invoices.map((invoice) => ({
      id: invoice.id,
      due: formatMoney(collectibleClaimAmount(invoice)),
    }));
    const totalDue = Money.sumDecimal(...dues.map((line) => line.due));
    setApplyAllocate(totalDue.gt(source.availableUnallocated));
    setApplyAmounts(Object.fromEntries(dues.map((line) => [line.id, line.due])));
    setApplyTarget({ settlement: source, invoices: dues });
  };

  const applyLines =
    applyTarget?.invoices.map((invoice) => ({
      ...invoice,
      amount: applyAllocate ? (applyAmounts[invoice.id] ?? "") : invoice.due,
    })) ?? [];
  const validApplyLines =
    applyLines.length > 0 &&
    applyLines.every(({ amount, due }) => MONEY_RE.test(amount) && Money.decimal(amount).gt(0) && Money.decimal(amount).lte(due));
  const applyTotal = validApplyLines ? Money.sumDecimal(...applyLines.map(({ amount }) => amount)) : null;
  const applyExceedsAvailable =
    applyTarget != null && applyTotal != null && applyTotal.gt(applyTarget.settlement.availableUnallocated);
  const validApply = Boolean(applyTarget && validApplyLines && applyTotal && applyTotal.gt(0) && !applyExceedsAvailable);

  useEffect(() => {
    if (applyTarget) applyDialog.current?.showModal();
  }, [applyTarget]);

  const submitApplyCredit = async (action: () => Promise<unknown>) => {
    if (applying) return;
    setApplying(true);
    try {
      await action();
      setApplyTarget(null);
      toast.success(t("insuranceClaims.settlement.applySaved"));
      await loadClaims();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      toast.error(typeof message === "string" ? message : t("preAuth.toast.updateFailed"));
    } finally {
      setApplying(false);
    }
  };

  const saveApplyCredit = async () => {
    if (!applyTarget || !validApply || !applyTotal || applyPost.pending) return;
    await submitApplyCredit(() =>
      applyPost.submit(`/insurance/claims/settlements/${applyTarget.settlement.id}/apply`, {
        invoiceIds: applyTarget.invoices.map(({ id }) => id),
        amount: formatMoney(applyTotal),
        ...(applyAllocate && { allocations: applyLines.map(({ id, amount }) => ({ invoiceId: id, amount })) }),
      }),
    );
  };

  // Actions
  const handleUpdateStatus = async (newStatus: "SUBMITTED" | "PENDING") => {
    if (selectedIds.length === 0) return;
    const actionName = newStatus === "SUBMITTED" ? t("insuranceClaims.action.submitBtn", "إرسال المطالبة") : t("insuranceClaims.action.resubmitBtn", "إعادة تقديم المطالبة");
    if (!confirm(t("insuranceClaims.confirmBatchAction", { action: actionName, count: selectedIds.length, defaultValue: `هل أنت متأكد من ${actionName} لعدد ${selectedIds.length} فاتورة؟` }))) return;

    try {
      await apiClient.post("/insurance/claims/update-status", {
        invoiceIds: selectedIds,
        status: newStatus,
      });
      toast.success(t("insuranceClaims.toast.statusUpdated", "تم تحديث الحالة بنجاح."));
      loadClaims();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("preAuth.toast.updateFailed", "فشل التحديث."));
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      toast.warning(t("insuranceClaims.toast.reasonRequired", "يرجى إدخال سبب الرفض"));
      return;
    }
    
    try {
      await apiClient.post("/insurance/claims/update-status", {
        invoiceIds: selectedIds,
        status: "REJECTED",
        rejectionReason: rejectionReason,
      });
      toast.success(t("insuranceClaims.toast.rejectRecorded", "تم تسجيل الرفض بنجاح."));
      setShowRejectModal(false);
      setRejectionReason("");
      loadClaims();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error("فشل التحديث.");
    }
  };

  // === NPHIES: Submit eClaims ===
  const handleNphiesSubmit = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(t("insuranceClaims.confirmNphiesSubmit", { count: selectedIds.length, defaultValue: `هل تريد رفع ${selectedIds.length} مطالبة إلى منصة نفيس (NPHIES)؟` }))) return;

    setNphiesLoading(true);
    let accepted = 0;
    let rejected = 0;

    for (const id of selectedIds) {
      try {
        const res = await apiClient.post(`/integration/nphies/claims/${id}/submit`);
        if (res.data?.accepted) {
          accepted++;
        } else {
          rejected++;
        }
      } catch {
        rejected++;
      }
    }

    setNphiesLoading(false);

    if (accepted > 0 && rejected === 0) {
      toast.success(t("insuranceClaims.toast.nphiesSuccess", { count: accepted, defaultValue: `✅ تم رفع ${accepted} مطالبة بنجاح إلى NPHIES` }));
    } else if (accepted > 0 && rejected > 0) {
      toast.warning(t("insuranceClaims.toast.nphiesPartial", { accepted, rejected, defaultValue: `⚠️ تم قبول ${accepted} ورفض ${rejected} مطالبة` }));
    } else {
      toast.error(t("insuranceClaims.toast.nphiesFailedAll", { count: rejected, defaultValue: `❌ فشل رفع جميع المطالبات (${rejected})` }));
    }

    loadClaims();
  };

  // Print Logic
  const handlePrintClaimSheet = () => {
    const itemsToPrint = selectedIds.length > 0
      ? claims.filter((c) => selectedIds.includes(c.id))
      : claims;

    if (itemsToPrint.length === 0) {
      toast.warning(t("insuranceClaims.toast.noInvoicesToPrint", "لا توجد فواتير للطباعة."));
      return;
    }

    const providerName = itemsToPrint[0]?.insuranceProvider?.name || t("insuranceClaims.filter.provider", "شركة التأمين");
    const totalClaim = Money.sumPosted(...itemsToPrint.map(effectiveClaimShare));

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error(t("insuranceClaims.toast.allowPopups", "يرجى السماح بالنوافذ المنبثقة (Popups) للطباعة."));
      return;
    }

    const htmlContent = `
      <html dir={isRtl ? "rtl" : "ltr"} lang="ar">
        <head>
          <title>كشف مطالبة مالية</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
            h1, h2 { text-align: center; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: right; }
            th { background-color: #f0f0f0; }
            .header { margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .summary { margin-top: 20px; text-align: left; font-size: 14px; font-weight: bold; }
            .footer { margin-top: 50px; display: flex; justify-content: space-between; }
            @media print { 
                @page { size: A4; margin: 10mm; }
                button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>كشف مطالبة مالية</h1>
            <h2>${providerName}</h2>
            <p>تاريخ الطباعة: ${formatDate(new Date().toISOString())}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px">#</th>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>اسم المريض</th>
                <th>رقم العضوية</th>
                <th>إجمالي الفاتورة</th>
                <th>حصة المريض</th>
                <th>المطالبة (حصة الشركة)</th>
              </tr>
            </thead>
            <tbody>
              ${itemsToPrint.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>#${item.id}</td>
                  <td>${formatDate(item.createdAt)}</td>
                  <td>${item.patient.fullName}</td>
                  <td>${item.patient.insuranceMemberId || "-"}</td>
                  <td>${formatMoney(Money.sumDecimal(item.totalAmount, effectiveClaimShare(item), effectivePatientShare(item)).minus(item.insuranceShare).minus(item.patientShare))}</td>
                  <td>${formatMoney(effectivePatientShare(item))}</td>
                  <td style="font-weight: bold">${formatMoney(effectiveClaimShare(item))}</td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
               <tr>
                 <td colspan="7" style="text-align: left; font-weight: bold;">الإجمالي الكلي للمطالبة</td>
                 <td style="font-weight: bold; font-size: 14px;">${formatMoney(totalClaim)} LYD</td>
               </tr>
            </tfoot>
          </table>

          <div class="footer">
            <div>توقيع المحاسب: ....................</div>
            <div>الختم:</div>
            <div>استلام الشركة: ....................</div>
          </div>
          
          <script>
            window.print();
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const totalClaimAmount = useMemo(() => {
    return Money.sumPosted(...claims.map(effectiveClaimShare));
  }, [claims]);

  const selectedTotal = useMemo(() => {
    return Money.sumDecimal(...claims.filter((c) => selectedIds.includes(c.id)).map((c) =>
      settlementFilter ? collectibleClaimAmount(c) : effectiveClaimShare(c)));
  }, [claims, selectedIds, settlementFilter]);

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden" dir={isRtl ? "rtl" : "ltr"} data-testid="insurance-claims-page">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl -mx-20 -my-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            {t("insuranceClaims.title", "إدارة مطالبات التأمين (RCM)")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t("insuranceClaims.subtitle", "متابعة الفواتير المستحقة، إدارة المطالبات المرفوضة، وتجهيز ملفات NPHIES.")}
          </p>
        </div>
      </div>

      {/* Filters & Stats */}
      <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-wrap gap-6 items-end relative overflow-hidden">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
            <Building2 className="w-4 h-4" /> شركة التأمين
          </label>
          <select
            className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm w-56 focus:border-sky-500 outline-none transition-colors"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            <option value="">-- {t("insuranceClaims.filter.allProviders", "عرض كل الشركات")} --</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
            <FileText className="w-4 h-4" /> {t("insuranceClaims.filter.status", "حالة المطالبة")}
          </label>
          <select
            className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm w-56 focus:border-sky-500 outline-none transition-colors"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="PENDING">⏳ {t("insuranceClaims.status.pendingOption", "معلقة (لم ترسل)")}</option>
            <option value="SUBMITTED">📤 {t("insuranceClaims.status.submittedOption", "تم الإرسال (Submitted)")}</option>
            <option value="PAID">💰 {t("insuranceClaims.status.paidOption", "تم السداد (Paid)")}</option>
            <option value="REJECTED">❌ {t("insuranceClaims.status.rejectedOption", "مرفوضة (Rejected)")}</option>
            <option value="WITHDRAWN">{t("insuranceClaims.withdrawal.status", "مسحوبة")}</option>
            <option value="PARTIALLY_PAID">{t("insuranceClaims.refund.partial")}</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openUnallocatedSettlement}
          className="px-4 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-200 text-sm rounded-xl font-bold transition-colors"
        >
          {t("insuranceClaims.settlement.recordUnallocated")}
        </button>

        <button
          type="button"
          onClick={() => setShowEraDialog(true)}
          className="px-4 py-2.5 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-200 text-sm rounded-xl font-bold transition-colors"
        >
          {t("insuranceClaims.era.open")}
        </button>

        <button
          type="button"
          onClick={() => setShowClearinghouseDialog(true)}
          className="px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 text-sm rounded-xl font-bold transition-colors"
        >
          {t("insuranceClaims.clearinghouse.open")}
        </button>

        <div className="mr-auto flex gap-4 items-center bg-slate-950 p-3 rounded-xl border border-slate-800 shadow-inner">
          <div className="p-2 bg-sky-900/20 text-sky-400 rounded-lg">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">
              {t("insuranceClaims.stats.totalClaims", "إجمالي المطالبات الظاهرة")}
            </div>
            <div className="text-xl font-black text-sky-400 tracking-tight">
              {formatMoney(totalClaimAmount)} <span className="text-sm font-bold text-slate-500">LYD</span>
            </div>
          </div>
        </div>
      </div>

      {unallocatedSettlements.length > 0 && (
        <section className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 space-y-3" aria-label={t("insuranceClaims.settlement.unallocatedTitle")}>
          <h2 className="text-sm font-bold text-amber-200">{t("insuranceClaims.settlement.unallocatedTitle")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {unallocatedSettlements.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-slate-950/70 p-3 text-sm">
                <div>
                  <p className="font-bold text-slate-100">{item.provider.name} · <bdi>{item.bankReference}</bdi></p>
                  <p className="text-xs text-slate-400">
                    {t("insuranceClaims.settlement.unallocatedAvailable")}: <bdi className="text-amber-300 font-bold">{item.availableUnallocated}</bdi>
                    {" · "}
                    {t("insuranceClaims.settlement.unallocatedOriginal")}: <bdi>{item.unallocatedAmount}</bdi>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openApplyCredit(item)}
                    className="rounded-lg bg-sky-700 hover:bg-sky-600 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    {t("insuranceClaims.settlement.applyBtn")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettlementRefund(item.id)}
                    className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200"
                  >
                    {t("insuranceClaims.settlement.manageRefundBtn")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actions Bar (When items selected) */}
      <div className={`transition-all duration-300 ease-in-out origin-top overflow-hidden ${selectedIds.length > 0 ? 'opacity-100 max-h-24' : 'opacity-0 max-h-0'}`}>
        <div className="bg-sky-900/20 border border-sky-500/30 p-4 rounded-2xl flex justify-between items-center shadow-[0_0_20px_-5px_rgba(14,165,233,0.15)]">
          <div className="text-sm text-slate-300">
            {t("insuranceClaims.action.selectedPrefix", "تم تحديد")} <span className="font-black text-white text-lg bg-sky-500/20 px-2 py-0.5 rounded-lg mx-1">{selectedIds.length}</span> {t("insuranceClaims.action.selectedClaims", "مطالبة")} 
            {t("insuranceClaims.action.selectedClaimsValue", "بقيمة إجمالية")} <span className="font-black text-emerald-400 text-lg mx-1">{formatMoney(selectedTotal)}</span> LYD
          </div>
          <div className="flex gap-2">
            {statusFilter === "PENDING" && (
              <button
                onClick={() => handleUpdateStatus("SUBMITTED")}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> {t("insuranceClaims.action.submitBtn", "إرسال المطالبة للشركة")}
              </button>
            )}
            {statusFilter === "PENDING" && (
              <FeatureGuard feature="INSURANCE_INTEGRATION">
                <button
                  onClick={handleNphiesSubmit}
                  disabled={nphiesLoading}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2"
                >
                  {nphiesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {t("preAuth.nphies.submitBtn", "رفع إلى نفيس (NPHIES)")}
                </button>
              </FeatureGuard>
            )}
            {settlementFilter && (
              <>
                <button
                  onClick={openSettlement}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> {t("insuranceClaims.settlement.title")}
                </button>
                {statusFilter === "SUBMITTED" && !selectedHasSettlement && <button
                  onClick={() => setShowRejectModal(true)}
                  className="px-4 py-2 bg-rose-900/50 hover:bg-rose-900/80 border border-rose-500/30 text-rose-300 hover:text-white text-sm rounded-xl font-bold transition-colors flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> {t("insuranceClaims.action.rejectBtn", "رفض المطالبات")}
                </button>}
              </>
            )}

            {statusFilter === "REJECTED" && (
              <button
                onClick={() => handleUpdateStatus("PENDING")}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> {t("insuranceClaims.action.resubmitBtn", "إعادة تقديم المطالبة")}
              </button>
            )}

            <button
              onClick={handlePrintClaimSheet}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-500 text-sm rounded-xl font-bold transition-colors flex items-center gap-2"
            >
              <Printer className="w-4 h-4 text-slate-400" /> طباعة كشف التجميع
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col relative">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-sm text-start">
            <thead className="text-slate-400 bg-slate-900/80 sticky top-0 z-10 backdrop-blur-md border-b border-slate-800">
              <tr>
                <th className="w-12 px-4 py-4 text-center">
                  <input
                    type="checkbox"
                    aria-label={t("insuranceClaims.settlement.selectAll")}
                    className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500/20"
                    onChange={toggleSelectAll}
                    disabled={!selectable.length}
                    checked={selectedIds.length > 0 && selectedIds.length === selectable.length}
                  />
                </th>
                <th className="px-4 py-4 font-bold">{t("insuranceClaims.table.invoiceNumber", "رقم الفاتورة")}</th>
                <th className="px-4 py-4 font-bold">{t("common.date", "التاريخ")}</th>
                <th className="px-4 py-4 font-bold">{t("common.patient", "المريض")}</th>
                <th className="px-4 py-4 font-bold">{t("insuranceClaims.table.memberId", "رقم العضوية")}</th>
                <th className="px-4 py-4 font-bold">{t("insuranceClaims.filter.provider", "شركة التأمين")}</th>
                <th className="px-4 py-4 font-bold text-sky-400">{t("insuranceClaims.table.insuranceShare", "المطالبة (حصة الشركة)")}</th>
                <th className="px-4 py-4 font-bold text-slate-500">{t("insuranceClaims.table.patientShare", "حصة المريض")}</th>
                <th className="px-4 py-4 font-bold">{t("insuranceClaims.table.rcmStatus", "حالة RCM")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center py-20 text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-10 h-10 rounded-full border-4 border-sky-500/30 border-t-sky-500 animate-spin mb-3"></div>
                      <span className="animate-pulse">{t("insuranceClaims.loading", "جاري سحب بيانات المطالبات...")}</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && claims.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-20 text-slate-500">
                    <div className="flex flex-col items-center justify-center bg-slate-900/50 w-full rounded-xl border border-dashed border-slate-700 max-w-md mx-auto p-10">
                      <ShieldCheck className="w-16 h-16 text-slate-600 mb-4 opacity-30" />
                      <p>{t("insuranceClaims.empty", "لا توجد مطالبات تأمينية تطابق معايير البحث.")}</p>
                    </div>
                  </td>
                </tr>
              )}

              {claims.map((c) => (
                <tr
                  key={c.id}
                  className={`hover:bg-slate-800/60 transition-colors ${
                    selectedIds.includes(c.id) ? "bg-sky-900/10" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={t("insuranceClaims.settlement.selectInvoice", { id: c.id })}
                      className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500/20"
                      checked={selectedIds.includes(c.id)}
                      disabled={!selectable.includes(c)}
                      onChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300">#{c.id}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 font-bold text-slate-200">
                    {c.patient.fullName}
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs bg-slate-950 rounded-lg inline-block mt-2 mb-2 ml-4">
                    {c.patient.insuranceMemberId || t("insuranceClaims.notRegistered", "غير مسجل")}
                  </td>
                  <td className="px-4 py-3">{c.insuranceProvider?.name}</td>
                  <td className="px-4 py-3 font-black text-sky-400 text-base tracking-tight">
                    {formatMoney(effectiveClaimShare(c))}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-500">
                    {formatMoney(effectivePatientShare(c))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                        c.claimStatus === "SUBMITTED"
                          ? "bg-sky-900/20 text-sky-400 border-sky-500/30"
                          : c.claimStatus === "PAID"
                            ? "bg-emerald-900/20 text-emerald-400 border-emerald-500/30"
                            : c.claimStatus === "REJECTED"
                              ? "bg-rose-900/20 text-rose-400 border-rose-500/30"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {c.claimStatus === "WITHDRAWN" ? t("insuranceClaims.withdrawal.status", "مسحوبة") :
                       c.claimStatus === "SUBMITTED" ? t("preAuth.status.submitted", "تم الإرسال") :
                       c.claimStatus === "PAID" ? t("preAuth.status.paid", "تم السداد") :
                       c.claimStatus === "PARTIALLY_PAID" ? t("insuranceClaims.refund.partial") :
                       c.claimStatus === "REJECTED" ? t("preAuth.status.rejected", "مرفوضة") : t("preAuth.status.pending", "معلقة")}
                    </span>
                    {c.claimStatus === "REJECTED" && c.rejectionReason && (
                      <div className="text-[10px] text-rose-400/80 mt-1 max-w-[150px] truncate" title={c.rejectionReason}>
                        {t("insuranceClaims.rejectionReasonLabel", "السبب:")} {c.rejectionReason}
                      </div>
                    )}
                    {c.claimWithdrawal && (
                      <p className="mt-1 text-xs text-slate-400">{c.claimWithdrawal.payerReference} · {c.claimWithdrawal.reason}</p>
                    )}
                    {c.settlementOutstanding != null && c.claimStatus !== "WITHDRAWN" && (
                      <p className="mt-1 text-xs text-slate-400">{t("insuranceClaims.settlement.outstanding")} <bdi>{formatMoney(c.settlementOutstanding)}</bdi></p>
                    )}
                    {c.settlementWrittenOff && Money.decimal(c.settlementWrittenOff).gt(0) && (
                      <p className="mt-1 text-xs text-amber-300">{t("insuranceClaims.writeOff.writtenOffAmount")}: <bdi>{formatMoney(c.settlementWrittenOff)}</bdi></p>
                    )}
                    {canManageWriteOff(c) && (
                      <button type="button" className="mt-1 block text-xs text-sky-300 underline" onClick={() => setWriteOffInvoice(c.id)}>
                        {t("insuranceClaims.writeOff.open")}
                      </button>
                    )}
                    {Array.from(
                      new Map(
                        (c.insuranceSettlementAllocations ?? []).map(({ settlement }) => [settlement.id, settlement]),
                      ).values(),
                    ).map((settlement) => (
                      <button key={settlement.id} type="button" className="mt-1 block text-xs text-sky-300 underline"
                        onClick={() => setSettlementRefund(settlement.id)}>
                        {t("insuranceClaims.settlementRefund.title")} <bdi>{settlement.bankReference}</bdi>
                      </button>
                    ))}
                    {canWithdrawClaim(c) && (
                      <button className="mt-1 block text-xs text-sky-300 underline" onClick={() => openWithdrawal(c.id)}>
                        {t("insuranceClaims.withdrawal.open", "توثيق سحب المطالبة")}
                      </button>
                    )}
                    {c.claims?.length === 1 && c.claims[0].batchId == null && !!c.claims[0]._count?.receipts && (
                      <button className="mt-1 block text-xs text-sky-300 underline" onClick={() => setRefundInvoice(c.id)}>
                        {t("insuranceClaims.refund.title")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {settlement && (
        <dialog ref={settlementDialog} dir={i18n.dir()} aria-labelledby="insurance-settlement-title"
          className="m-auto max-h-[85vh] w-[min(92vw,28rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 backdrop:bg-slate-950/80"
          onCancel={(event) => { event.preventDefault(); if (!settling) setSettlement(null); }}>
          <form className="space-y-4"
            onSubmit={(event) => { event.preventDefault(); void saveSettlement(); }}>
            <h2 id="insurance-settlement-title" className="text-lg font-bold">{t("insuranceClaims.settlement.title")}</h2>
            {isPureUnallocated ? (
              <label className="block text-sm">
                {t("insuranceClaims.settlement.selectProvider")}
                <select
                  className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2"
                  value={settlement.providerId || ""}
                  onChange={(event) => {
                    const id = Number(event.target.value);
                    const matched = providers.find((p) => p.id === id);
                    setSettlement((prev) =>
                      prev ? { ...prev, providerId: id, providerName: matched?.name ?? "" } : null,
                    );
                  }}
                >
                  <option value="">{t("insuranceClaims.settlement.selectProvider")}</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>{settlement.providerName}</p>
            )}
            {!isPureUnallocated && (
              <p>{t("insuranceClaims.settlement.expected", { count: settlement.invoices.length })} <bdi>{settlement.expected}</bdi></p>
            )}
            <fieldset disabled={settling} className="space-y-3">
              {!isPureUnallocated && (
                <>
              <label className="flex gap-2 text-sm">
                <input type="checkbox" checked={allocateSettlement} onChange={(event) => setAllocateSettlement(event.target.checked)} />
                {t("insuranceClaims.settlement.allocate")}
              </label>
              {allocateSettlement && (
                <div className="space-y-2">
                  {allocatedInvoices.map(({ id, due, amount }) => (
                    <label key={id} className="block text-sm">
                      {t("insuranceClaims.settlement.allocateInvoice", { id })} <bdi>{due}</bdi>
                      <input dir="ltr" inputMode="decimal" required maxLength={19} value={amount}
                        onChange={(event) => setSettlementAmounts((previous) => ({ ...previous, [id]: event.target.value }))}
                        className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2" />
                    </label>
                  ))}
                  {allocatedTotal && (
                    <p className="text-sm">{t("insuranceClaims.settlement.remaining")} <bdi>{formatMoney(Money.decimal(settlement.expected).minus(allocatedTotal))}</bdi></p>
                  )}
                </div>
              )}
                </>
              )}
              <label className="block text-sm">{t("insuranceClaims.settlement.amount")}
                <input dir="ltr" inputMode="decimal" required maxLength={19} value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} aria-describedby={receivedAmount && !matchesExpectedAmount ? "insurance-settlement-amount-error" : undefined} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2" />
              </label>
              {excessAmount != null && (
                <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-sm">
                  <p>{t("insuranceClaims.settlement.excessAmount")}: <bdi>{formatMoney(excessAmount)}</bdi></p>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={recordExcessAsUnallocated}
                      onChange={(event) => setRecordExcessAsUnallocated(event.target.checked)}
                    />
                    {t("insuranceClaims.settlement.recordExcessAsUnallocated")}
                  </label>
                </div>
              )}
              {receivedAmount && !matchesExpectedAmount && (
                <p id="insurance-settlement-amount-error" className="text-sm text-amber-300">
                  {t(allocateSettlement ? "insuranceClaims.settlement.allocationMismatch" : "insuranceClaims.settlement.amountMismatch")}
                </p>
              )}
              <label className="block text-sm">{t("insuranceClaims.settlement.reference")}
                <input dir="ltr" required minLength={5} maxLength={200} value={bankReference} onChange={(event) => setBankReference(event.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2" />
              </label>
              <label className="flex gap-2 text-sm">
                <input type="checkbox" checked={bankConfirmed} onChange={(event) => setBankConfirmed(event.target.checked)} />
                {t("insuranceClaims.settlement.confirmed")}
              </label>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setSettlement(null)}>{t("common.cancel", "إلغاء")}</button>
                <button className="rounded bg-sky-700 p-2 disabled:opacity-50" disabled={!validSettlement}>
                  {t("insuranceClaims.settlement.post")}
                </button>
              </div>
            </fieldset>
          </form>
        </dialog>
      )}
      {applyTarget && (
        <dialog
          ref={applyDialog}
          dir={i18n.dir()}
          aria-labelledby="insurance-apply-credit-title"
          className="m-auto max-h-[85vh] w-[min(92vw,30rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 backdrop:bg-slate-950/80"
          onCancel={(event) => {
            event.preventDefault();
            if (!applying) setApplyTarget(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveApplyCredit();
            }}
          >
            <h2 id="insurance-apply-credit-title" className="text-lg font-bold">
              {t("insuranceClaims.settlement.applyModalTitle")}
            </h2>
            <p className="text-sm">
              {applyTarget.settlement.provider.name} · <bdi>{applyTarget.settlement.bankReference}</bdi>
            </p>
            <p className="text-sm text-amber-300">
              {t("insuranceClaims.settlement.unallocatedAvailable")}: <bdi>{applyTarget.settlement.availableUnallocated}</bdi>
            </p>
            <fieldset disabled={applying || !!applyPost.pending} className="space-y-3">
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={applyAllocate}
                  onChange={(event) => setApplyAllocate(event.target.checked)}
                />
                {t("insuranceClaims.settlement.allocate")}
              </label>
              <div className="space-y-2">
                {applyTarget.invoices.map(({ id, due }) => (
                  <div key={id} className="rounded-lg border border-slate-700 p-2 text-sm">
                    <div className="flex justify-between">
                      <span>#{id}</span>
                      <bdi>{due}</bdi>
                    </div>
                    {applyAllocate && (
                      <label className="mt-1 block text-xs">
                        {t("insuranceClaims.settlement.allocateInvoice", { id })}
                        <input
                          dir="ltr"
                          inputMode="decimal"
                          required
                          maxLength={19}
                          value={applyAmounts[id] ?? ""}
                          onChange={(event) =>
                            setApplyAmounts((previous) => ({ ...previous, [id]: event.target.value }))
                          }
                          className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              {applyTotal && (
                <p className="text-sm">
                  {t("insuranceClaims.settlement.applyAmount")}: <bdi>{formatMoney(applyTotal)}</bdi>
                </p>
              )}
              {applyExceedsAvailable && (
                <p className="text-sm text-amber-300" role="alert">
                  {t("insuranceClaims.settlement.applyExceedsAvailable")}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setApplyTarget(null)} disabled={applying}>
                  {t("common.cancel", "إلغاء")}
                </button>
                <button className="rounded bg-sky-700 p-2 disabled:opacity-50" disabled={!validApply || !!applyPost.pending}>
                  {t("insuranceClaims.settlement.applyBtn")}
                </button>
              </div>
            </fieldset>
            {applyPost.pending && (
              <button
                type="button"
                className="rounded bg-sky-700 p-2 disabled:opacity-50"
                disabled={applying}
                onClick={() => void submitApplyCredit(() => applyPost.retry())}
              >
                {t("insuranceClaims.refund.retry")}
              </button>
            )}
          </form>
        </dialog>
      )}
      {refundInvoice != null && (
        <ClaimReceiptRefundDialog invoiceId={refundInvoice} onClose={() => setRefundInvoice(null)} onChange={loadClaims} />
      )}
      {settlementRefund != null && (
        <InsuranceSettlementRefundDialog settlementId={settlementRefund} onClose={() => setSettlementRefund(null)} onChange={loadClaims} />
      )}
      {writeOffInvoice != null && (
        <InsuranceWriteOffDialog invoiceId={writeOffInvoice} onClose={() => setWriteOffInvoice(null)} onChange={loadClaims} />
      )}
      {showEraDialog && (
        <EraReconciliationDialog
          providerId={selectedProvider ? Number(selectedProvider) : undefined}
          onClose={() => setShowEraDialog(false)}
          onChange={loadClaims}
        />
      )}
      {showClearinghouseDialog && (
        <PayerBatchClearingDialog
          providers={providers}
          initialProviderId={selectedProvider ? Number(selectedProvider) : undefined}
          onClose={() => setShowClearinghouseDialog(false)}
          onChange={loadClaims}
        />
      )}
      {withdrawalInvoice != null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
          <form role="dialog" aria-modal="true" aria-labelledby="claim-withdrawal-title"
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6"
            onSubmit={(event) => { event.preventDefault(); void saveWithdrawal(); }}>
            <h2 id="claim-withdrawal-title" className="text-lg font-bold">
              {t("insuranceClaims.withdrawal.open", "توثيق سحب المطالبة")} <bdi>#{withdrawalInvoice}</bdi>
            </h2>
            <label className="block text-sm">
              {t("insuranceClaims.withdrawal.reference", "مرجع تأكيد شركة التأمين")}
              <input required minLength={5} maxLength={200} value={payerReference} onChange={(event) => setPayerReference(event.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2" />
            </label>
            <label className="block text-sm">
              {t("insuranceClaims.withdrawal.reason", "سبب السحب")}
              <textarea required minLength={5} maxLength={1000} value={withdrawalReason} onChange={(event) => setWithdrawalReason(event.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2" />
            </label>
            <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={payerConfirmed} onChange={(event) => setPayerConfirmed(event.target.checked)} />
              {t("insuranceClaims.withdrawal.confirmed", "استلمت تأكيد السحب من شركة التأمين.")}
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setWithdrawalInvoice(null)} disabled={withdrawing}>{t("common.cancel", "إلغاء")}</button>
              <button className="rounded bg-sky-700 p-2 disabled:opacity-50" disabled={withdrawing || !payerConfirmed || payerReference.trim().length < 5 || withdrawalReason.trim().length < 5}>
                {t("insuranceClaims.withdrawal.save", "حفظ التأكيد")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-0 w-full max-w-md shadow-[0_0_40px_-10px_rgba(225,29,72,0.3)] animate-in zoom-in-95 overflow-hidden">
            <div className="p-5 border-b border-slate-800 bg-slate-900/50 flex items-center gap-3">
              <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl">
                <XCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-rose-400">{t("insuranceClaims.rejectModal.title", "رفض المطالبات التأمينية")}</h3>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                {t("insuranceClaims.rejectModal.warningPrefix", "سيتم تغيير حالة")} <span className="font-bold text-white">{selectedIds.length}</span> {t("insuranceClaims.rejectModal.claimsTo", "مطالبات إلى")} <span className="text-rose-400 font-bold">"{t("preAuth.status.rejected", "مرفوضة")}"</span>. 
                {t("insuranceClaims.rejectModal.warningSuffix", "يرجى تدوين سبب الرفض الوارد من شركة التأمين ليتم مراجعته في قسم دورة الإيرادات (RCM).")}
              </p>
              
              <label className="block text-xs font-bold text-slate-400 mb-2">{t("insuranceClaims.rejectModal.reasonLabel", "سبب الرفض (إلزامي)")}</label>
              <textarea
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none text-slate-100 min-h-[120px] resize-none"
                placeholder={t("insuranceClaims.rejectModal.placeholder", "أدخل الرمز أو التبرير (مثال: الخدمة غير مشمولة بالوثيقة)...")}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-xl transition-colors border border-slate-700 hover:border-slate-600"
              >
                {t("common.cancel", "إلغاء التراجع")}
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectionReason.trim()}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-xl shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" /> {t("preAuth.action.confirmReject", "تأكيد الرفض")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
