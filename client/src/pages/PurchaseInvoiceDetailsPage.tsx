import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "INSURANCE" | "OTHER";

type PurchaseInvoiceStatus =
  | "DRAFT"
  | "APPROVED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "CANCELLED";

type SupplierLite = {
  id: number;
  name: string;
  code?: string | null;
};

type AccountLite = {
  id: number;
  code: string;
  name: string;
};

type ProductLite = {
  id: number;
  code: string;
  name: string;
};

type PurchaseInvoiceLine = {
  id: number;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  totalAmount: number | string;
  expenseAccountId?: number | null;
  expenseAccount?: AccountLite | null;
  product?: ProductLite | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
};

type SupplierPayment = {
  id: number;
  amount: number | string;
  method: PaymentMethod;
  paidAt: string;
  reference?: string | null;
  notes?: string | null;
};

type PurchaseInvoiceDetails = {
  id: number;
  supplierId: number;
  supplier: SupplierLite;
  invoiceNumber?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  status: PurchaseInvoiceStatus;

  totalAmount: number | string;
  discountAmount: number | string;
  vatAmount: number | string;
  netAmount: number | string;
  paidAmount: number | string;

  currency: string;
  notes?: string | null;

  lines: PurchaseInvoiceLine[];
  payments: SupplierPayment[];
};

type EditLineRow = {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  expenseAccountId?: number | null;
  productId?: number | null;
  batchNumber?: string;
  expiryDate?: string;
};

function toNum(v: any) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(v: any) {
  return toNum(v).toFixed(3);
}

function toDateInputValue(iso: string) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export default function PurchaseInvoiceDetailsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<PurchaseInvoiceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<
    null | "approve" | "cancel" | "pay" | "saveEdit"
  >(null);
  const [error, setError] = useState<string | null>(null);

  // نموذج الدفع
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [payReference, setPayReference] = useState<string>("");
  const [payNotes, setPayNotes] = useState<string>("");

  // Edit Mode
  const [editMode, setEditMode] = useState(false);
  const [editInvoiceNumber, setEditInvoiceNumber] = useState("");
  const [editInvoiceDate, setEditInvoiceDate] = useState("");
  const [editDueDate, setEditDueDate] = useState<string>("");
  const [editCurrency, setEditCurrency] = useState("LYD");
  const [editDiscount, setEditDiscount] = useState<string>("0.000");
  const [editVat, setEditVat] = useState<string>("0.000");
  const [editNotes, setEditNotes] = useState<string>("");

  const [editLines, setEditLines] = useState<EditLineRow[]>([
    {
      description: "",
      quantity: 1,
      unitPrice: 0,
      batchNumber: "",
      expiryDate: "",
    },
  ]);

  function methodLabel(m: PaymentMethod) {
    switch (m) {
      case "CASH":
        return t("inventory.purchaseInvoiceDetails.paymentMethods.cash", "نقدي");
      case "CARD":
        return t("inventory.purchaseInvoiceDetails.paymentMethods.card", "بطاقة");
      case "TRANSFER":
        return t("inventory.purchaseInvoiceDetails.paymentMethods.transfer", "تحويل");
      case "INSURANCE":
        return t("inventory.purchaseInvoiceDetails.paymentMethods.insurance", "تأمين");
      default:
        return t("inventory.purchaseInvoiceDetails.paymentMethods.other", "أخرى");
    }
  }

  function statusLabel(s: PurchaseInvoiceStatus) {
    switch (s) {
      case "DRAFT":
        return t("inventory.purchaseInvoiceDetails.statusLabels.draft", "مسودة");
      case "APPROVED":
        return t("inventory.purchaseInvoiceDetails.statusLabels.approved", "معتمدة");
      case "PARTIALLY_PAID":
        return t("inventory.purchaseInvoiceDetails.statusLabels.partiallyPaid", "مدفوعة جزئياً");
      case "PAID":
        return t("inventory.purchaseInvoiceDetails.statusLabels.paid", "مدفوعة");
      case "CANCELLED":
        return t("inventory.purchaseInvoiceDetails.statusLabels.cancelled", "ملغاة");
      default:
        return s;
    }
  }

  function StatusPill({ status }: { status: PurchaseInvoiceStatus }) {
    const cls =
      status === "PAID"
        ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
        : status === "PARTIALLY_PAID"
          ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
          : status === "APPROVED"
            ? "bg-sky-500/15 text-sky-200 border-sky-500/30"
            : status === "CANCELLED"
              ? "bg-red-500/15 text-red-200 border-red-500/30"
              : "bg-slate-500/15 text-slate-200 border-slate-500/30";

    return (
      <span
        className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] ${cls}`}
      >
        {statusLabel(status)}
      </span>
    );
  }

  function getErrMsg(err: any, fallback: string) {
    const msg = err?.response?.data?.message;
    if (!msg) return fallback;
    if (typeof msg === "string") return msg;
    if (Array.isArray(msg)) return msg.join(" | ");
    return fallback;
  }

  const fetchInvoice = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PurchaseInvoiceDetails>(
        `/purchases/invoices/${id}`,
      );
      setData(res.data);

      const rem = Math.max(
        0,
        toNum(res.data.netAmount) - toNum(res.data.paidAmount),
      );
      setPayAmount(rem > 0 ? rem.toFixed(3) : "0.000");
    } catch (err: any) {
      console.error(err);
      setError(getErrMsg(err, t("inventory.purchaseInvoiceDetails.errorDefault", "حدث خطأ أثناء تحميل تفاصيل الفاتورة.")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const remaining = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, toNum(data.netAmount) - toNum(data.paidAmount));
  }, [data]);

  const canApprove = data?.status === "DRAFT";
  const canPay =
    !!data &&
    (data.status === "APPROVED" || data.status === "PARTIALLY_PAID") &&
    remaining > 0.0001;

  const hasAnyPayments = (data?.payments?.length ?? 0) > 0;
  const paidAmountNum = toNum(data?.paidAmount);

  const canEdit =
    !!data &&
    (data.status === "DRAFT" || data.status === "APPROVED") &&
    paidAmountNum <= 0.0001 &&
    !hasAnyPayments;

  const canCancel =
    !!data &&
    data.status !== "CANCELLED" &&
    paidAmountNum <= 0.0001 &&
    !hasAnyPayments;

  // ===== Edit helpers =====
  const initEditFromData = (inv: PurchaseInvoiceDetails) => {
    setEditInvoiceNumber(inv.invoiceNumber ?? "");
    setEditInvoiceDate(toDateInputValue(inv.invoiceDate));
    setEditDueDate(inv.dueDate ? toDateInputValue(inv.dueDate) : "");
    setEditCurrency(inv.currency ?? "LYD");
    setEditDiscount(formatMoney(inv.discountAmount));
    setEditVat(formatMoney(inv.vatAmount));
    setEditNotes(inv.notes ?? "");
    setEditLines(
      (inv.lines ?? []).length
        ? inv.lines.map((l) => ({
            id: l.id,
            description: l.description ?? "",
            quantity: toNum(l.quantity) || 0,
            unitPrice: toNum(l.unitPrice) || 0,
            expenseAccountId: l.expenseAccountId ?? null,
            productId: l.product?.id ?? null,
            batchNumber: l.batchNumber ?? "",
            expiryDate: l.expiryDate ? toDateInputValue(l.expiryDate) : "",
          }))
        : [
            {
              description: "",
              quantity: 1,
              unitPrice: 0,
              batchNumber: "",
              expiryDate: "",
            },
          ],
    );
  };

  const editTotal = useMemo(() => {
    return editLines.reduce(
      (s, l) => s + toNum(l.quantity) * toNum(l.unitPrice),
      0,
    );
  }, [editLines]);

  const updateEditLine = (
    idx: number,
    field: keyof EditLineRow,
    value: any,
  ) => {
    setEditLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              [field]:
                field === "quantity" || field === "unitPrice"
                  ? Number(value)
                  : value,
            }
          : l,
      ),
    );
  };

  const addEditLine = () => {
    setEditLines((prev) => [
      ...prev,
      {
        description: "",
        quantity: 1,
        unitPrice: 0,
        batchNumber: "",
        expiryDate: "",
      },
    ]);
  };

  const removeEditLine = (idx: number) => {
    setEditLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  };

  // ===== Actions =====
  const approve = async () => {
    if (!data) return;
    setBusyAction("approve");
    setError(null);
    try {
      await apiClient.post(`/purchases/invoices/${data.id}/approve`);
      toast.success(t("inventory.purchaseInvoiceDetails.toast.approveSuccess", "تم اعتماد الفاتورة بنجاح."));
      await fetchInvoice();
    } catch (err: any) {
      console.error(err);
      const msg = getErrMsg(err, t("inventory.purchaseInvoiceDetails.toast.approveError", "تعذر اعتماد الفاتورة."));
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const cancelInvoice = async () => {
    if (!data) return;
    const ok = window.confirm(t("inventory.purchaseInvoiceDetails.toast.confirmCancel", "هل أنت متأكد من إلغاء الفاتورة؟"));
    if (!ok) return;

    const reason = window.prompt(t("inventory.purchaseInvoiceDetails.toast.cancelReason", "سبب الإلغاء (اختياري):")) ?? "";
    setBusyAction("cancel");
    setError(null);
    try {
      await apiClient.post(`/purchases/invoices/${data.id}/cancel`, {
        reason: reason.trim() ? reason.trim() : undefined,
      });
      toast.success(t("inventory.purchaseInvoiceDetails.toast.cancelSuccess", "تم إلغاء الفاتورة بنجاح."));
      setEditMode(false);
      await fetchInvoice();
    } catch (err: any) {
      console.error(err);
      const msg = getErrMsg(err, t("inventory.purchaseInvoiceDetails.toast.cancelError", "تعذر إلغاء الفاتورة."));
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const saveEdits = async () => {
    if (!data) return;
    if (!canEdit) {
      toast.error(t("inventory.purchaseInvoiceDetails.toast.editDisabled", "لا يمكن تعديل هذه الفاتورة حالياً."));
      return;
    }
    if (!editInvoiceDate) {
      toast.error(t("inventory.purchaseInvoiceDetails.toast.dateRequired", "تاريخ الفاتورة مطلوب."));
      return;
    }

    const cleanedLines = editLines
      .map((l) => ({
        description: (l.description ?? "").trim(),
        quantity: toNum(l.quantity),
        unitPrice: toNum(l.unitPrice),
        expenseAccountId: l.expenseAccountId ?? undefined,
        drugItemId: l.productId ? Number(l.productId) : undefined,
        batchNumber: l.batchNumber?.trim() || undefined,
        expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined,
      }))
      .filter((l) => (l.description || l.drugItemId) && l.quantity > 0);

    if (!cleanedLines.length) {
      toast.error(t("inventory.purchaseInvoiceDetails.toast.oneLineRequired", "يجب إدخال بند واحد على الأقل."));
      return;
    }

    setBusyAction("saveEdit");
    setError(null);
    try {
      await apiClient.patch(`/purchases/invoices/${data.id}`, {
        invoiceNumber: editInvoiceNumber.trim() || undefined,
        invoiceDate: editInvoiceDate,
        dueDate: editDueDate || undefined,
        currency: editCurrency?.trim() || "LYD",
        discountAmount: toNum(editDiscount),
        vatAmount: toNum(editVat),
        notes: editNotes.trim() || undefined,
        lines: cleanedLines,
      });

      toast.success(t("inventory.purchaseInvoiceDetails.toast.editSuccess", "تم حفظ التعديلات بنجاح."));
      setEditMode(false);
      await fetchInvoice();
    } catch (err: any) {
      console.error(err);
      const msg = getErrMsg(err, t("inventory.purchaseInvoiceDetails.toast.editError", "تعذر حفظ التعديلات."));
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const recordPayment = async () => {
    if (!data) return;

    const amount = Number(payAmount || "0");
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("inventory.purchaseInvoiceDetails.toast.payAmountPositive", "قيمة الدفعة يجب أن تكون أكبر من الصفر."));
      return;
    }
    if (amount > remaining + 0.0001) {
      toast.error(t("inventory.purchaseInvoiceDetails.toast.payAmountExceeded", "قيمة الدفعة أكبر من الرصيد المتبقي على الفاتورة."));
      return;
    }

    setBusyAction("pay");
    setError(null);
    try {
      await apiClient.post(`/purchases/invoices/${data.id}/payments`, {
        supplierId: data.supplierId,
        amount,
        method: payMethod,
        reference: payReference || undefined,
        notes: payNotes || undefined,
      });

      toast.success(t("inventory.purchaseInvoiceDetails.toast.paySuccess", "تم تسجيل الدفعة بنجاح."));
      setPayReference("");
      setPayNotes("");
      await fetchInvoice();
    } catch (err: any) {
      console.error(err);
      const msg = getErrMsg(err, t("inventory.purchaseInvoiceDetails.toast.payError", "تعذر تسجيل الدفعة."));
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  if (!id) {
    return <div className="text-slate-200 p-6">{t("inventory.purchaseInvoiceDetails.notSpecified", "الفاتورة غير محددة.")}</div>;
  }

  const headerBusy =
    busyAction === "approve" ||
    busyAction === "cancel" ||
    busyAction === "saveEdit";

  const supplierName = data?.supplier.name ?? "";

  return (
    <div
      className="flex flex-col h-full px-6 py-6 lg:px-10 lg:py-8 text-slate-100"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("inventory.purchaseInvoiceDetails.title", "تفاصيل فاتورة شراء")}</h1>
          <div className="text-sm text-slate-400 flex items-center gap-2">
            <span>
              #{data?.invoiceNumber ?? (data ? `INV-${data.id}` : id)}
            </span>
            {data?.status && <StatusPill status={data.status} />}
            {editMode && (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200">
                {t("inventory.purchaseInvoiceDetails.draftModePill", "وضع التعديل")}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!editMode && canApprove && (
            <button
              type="button"
              onClick={approve}
              disabled={headerBusy}
              className="px-3 py-1.5 rounded-xl text-xs bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:opacity-60 font-bold"
            >
              {busyAction === "approve"
                ? t("inventory.purchaseInvoiceDetails.btn.approving", "جاري الاعتماد...")
                : t("inventory.purchaseInvoiceDetails.btn.approve", "اعتماد الفاتورة")}
            </button>
          )}

          {!editMode && canEdit && (
            <button
              type="button"
              onClick={() => {
                if (!data) return;
                initEditFromData(data);
                setEditMode(true);
                setError(null);
              }}
              disabled={headerBusy}
              className="px-3 py-1.5 rounded-xl text-xs bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-60 font-bold"
            >
              {t("inventory.purchaseInvoiceDetails.btn.edit", "تعديل")}
            </button>
          )}

          {editMode && (
            <>
              <button
                type="button"
                onClick={saveEdits}
                disabled={headerBusy}
                className="px-3 py-1.5 rounded-xl text-xs bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-60 font-bold"
              >
                {busyAction === "saveEdit" ? t("inventory.purchaseInvoiceDetails.btn.saving", "جاري الحفظ...") : t("inventory.purchaseInvoiceDetails.btn.save", "حفظ التعديل")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditMode(false);
                  setError(null);
                }}
                disabled={headerBusy}
                className="px-3 py-1.5 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-60"
              >
                {t("inventory.purchaseInvoiceDetails.btn.cancelEdit", "إلغاء التعديل")}
              </button>
            </>
          )}

          {!editMode && canCancel && (
            <button
              type="button"
              onClick={cancelInvoice}
              disabled={headerBusy}
              className="px-3 py-1.5 rounded-xl text-xs bg-red-500 text-slate-950 hover:bg-red-400 disabled:opacity-60 font-bold"
            >
              {busyAction === "cancel" ? t("inventory.purchaseInvoiceDetails.btn.cancelling", "جاري الإلغاء...") : t("inventory.purchaseInvoiceDetails.btn.cancel", "إلغاء الفاتورة")}
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 rounded-xl text-xs bg-slate-800 hover:bg-slate-700"
          >
            {t("inventory.purchaseInvoiceDetails.btn.back", "رجوع")}
          </button>
          
          {!editMode && data && (data.status === 'APPROVED' || data.status === 'PAID' || data.status === 'PARTIALLY_PAID') && (
            <button
               type="button"
               onClick={() => navigate(`/purchases/returns/new?invoiceId=${data?.id}`)}
               className="px-3 py-1.5 rounded-xl text-xs bg-rose-600 hover:bg-rose-500 text-slate-100 font-bold"
            >
              {t("inventory.purchaseInvoiceDetails.btn.return", "مرتجع")}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-slate-400 text-xs mb-3">{t("inventory.purchaseInvoiceDetails.loading", "جارِ تحميل التفاصيل...")}</div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-100">
          {error}
        </div>
      )}

      {!loading && data && (
        <>
          {/* ======== ملخص الفاتورة ======== */}
          {!editMode ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-xs">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                <div className="text-slate-400 mb-1">{t("inventory.purchaseInvoiceDetails.summary.supplier", "المورد")}</div>
                <div className="text-slate-100 font-semibold text-sm">
                  {data.supplier?.name}
                </div>
                <div className="text-slate-500 mt-1">
                  {t("inventory.purchaseInvoices.list.table.supplier", "المورد")} كود: {data.supplier?.code ?? "—"}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                <div className="text-slate-400 mb-1">{t("inventory.purchaseInvoiceDetails.summary.dates", "التواريخ")}</div>
                <div className="text-slate-100">
                  {t("inventory.purchaseInvoiceDetails.summary.dateInv", "تاريخ الفاتورة")}:{" "}
                  <span className="font-semibold">
                    {formatDate(data.invoiceDate)}
                  </span>
                </div>
                <div className="text-slate-100 mt-1">
                  {t("inventory.purchaseInvoiceDetails.summary.dateDue", "تاريخ الاستحقاق")}:{" "}
                  <span className="font-semibold">
                    {data.dueDate ? formatDate(data.dueDate) : "—"}
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                <div className="text-slate-400 mb-1">{t("inventory.purchaseInvoiceDetails.summary.financials", "الملخص المالي")}</div>
                <div className="text-slate-100 mt-0.5">
                  {t("inventory.purchaseInvoiceDetails.summary.total", "إجمالي")}:{" "}
                  <span className="font-semibold font-mono">
                    {data.currency} {formatMoney(data.totalAmount)}
                  </span>
                </div>
                <div className="text-slate-100 mt-0.5">
                  {t("inventory.purchaseInvoiceDetails.summary.discount", "خصم")}:{" "}
                  <span className="font-semibold font-mono">
                    {data.currency} {formatMoney(data.discountAmount)}
                  </span>
                </div>
                <div className="text-slate-100 mt-0.5">
                  {t("inventory.purchaseInvoiceDetails.summary.vat", "ضريبة")}:{" "}
                  <span className="font-semibold font-mono">
                    {data.currency} {formatMoney(data.vatAmount)}
                  </span>
                </div>
                <div className="text-slate-100 mt-0.5">
                  {t("inventory.purchaseInvoiceDetails.summary.net", "صافي")}:{" "}
                  <span className="font-semibold text-emerald-300 font-mono">
                    {data.currency} {formatMoney(data.netAmount)}
                  </span>
                </div>
                <div className="text-slate-100 mt-0.5">
                  {t("inventory.purchaseInvoiceDetails.summary.paid", "مدفوع")}:{" "}
                  <span className="font-semibold text-amber-300 font-mono">
                    {data.currency} {formatMoney(data.paidAmount)}
                  </span>
                </div>
                <div className="text-slate-100 mt-0.5">
                  {t("inventory.purchaseInvoiceDetails.summary.remaining", "المتبقي")}:{" "}
                  <span className="font-semibold text-sky-300 font-mono">
                    {data.currency} {remaining.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs mb-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-amber-100">{t("inventory.purchaseInvoiceDetails.edit.invNumber", "رقم الفاتورة")}</label>
                  <input
                    value={editInvoiceNumber}
                    onChange={(e) => setEditInvoiceNumber(e.target.value)}
                    className={`bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-slate-100 ${isRtl ? 'text-right' : 'text-left'}`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-amber-100">{t("inventory.purchaseInvoiceDetails.edit.invDate", "تاريخ الفاتورة")}</label>
                  <DatePicker
                    date={editInvoiceDate ? new Date(editInvoiceDate) : undefined}
                    onChange={(d) => setEditInvoiceDate(d ? d.toISOString().slice(0, 10) : "")}
                    className="bg-slate-900/80 border-slate-700 text-slate-100 h-8 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-amber-100">{t("inventory.purchaseInvoiceDetails.edit.discount", "الخصم")}</label>
                  <input
                    type="number"
                    step="0.001"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(e.target.value)}
                    className={`bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-slate-100 ${isRtl ? 'text-right' : 'text-left'}`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-amber-100">{t("inventory.purchaseInvoiceDetails.edit.vat", "الضريبة")}</label>
                  <input
                    type="number"
                    step="0.001"
                    value={editVat}
                    onChange={(e) => setEditVat(e.target.value)}
                    className={`bg-slate-900/80 border border-slate-700 rounded px-2 py-1 text-slate-100 ${isRtl ? 'text-right' : 'text-left'}`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ======== البنود ======== */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs mb-4 overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-slate-200 font-semibold">
                {editMode ? t("inventory.purchaseInvoiceDetails.lines.titleEdit", "بنود الفاتورة (تعديل)") : t("inventory.purchaseInvoiceDetails.lines.title", "بنود الفاتورة")}
              </div>
              <div className="text-slate-500">
                {t("inventory.purchaseInvoiceDetails.lines.count", "عدد البنود: ")}
                {editMode ? editLines.length : (data.lines?.length ?? 0)}
              </div>
            </div>

            {!editMode ? (
              data.lines.length === 0 ? (
                <div className="text-slate-500">{t("inventory.purchaseInvoiceDetails.lines.empty", "لا توجد بنود.")}</div>
              ) : (
                <table className={`w-full text-[11px] border-separate border-spacing-y-1 min-w-[900px] ${isRtl ? 'text-right' : 'text-left'}`}>
                  <thead className="text-slate-400">
                    <tr>
                      <th className="px-2 py-1 w-64">{t("inventory.purchaseInvoiceDetails.lines.table.product", "المنتج (للمخزون)")}</th>
                      <th className="px-2 py-1">{t("inventory.purchaseInvoiceDetails.lines.table.description", "الوصف")}</th>
                      <th className="px-2 py-1 w-24">{t("inventory.purchaseInvoiceDetails.lines.table.batch", "رقم التشغيلة")}</th>
                      <th className="px-2 py-1 w-28">{t("inventory.purchaseInvoiceDetails.lines.table.expiry", "ت. الصلاحية")}</th>
                      <th className="px-2 py-1 w-20 text-center">{t("inventory.purchaseInvoiceDetails.lines.table.qty", "الكمية")}</th>
                      <th className="px-2 py-1 w-24 text-center">{t("inventory.purchaseInvoiceDetails.lines.table.price", "سعر الوحدة")}</th>
                      <th className="px-2 py-1 w-24 text-center">{t("inventory.purchaseInvoiceDetails.lines.table.total", "الإجمالي")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr
                        key={l.id}
                        className="bg-slate-950/70 border border-slate-800 rounded-xl"
                      >
                        <td className="px-2 py-1 align-top text-sky-300">
                          {l.product ? (
                            <span>
                              {l.product.name}{" "}
                              {l.product.code ? `[${l.product.code}]` : ""}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1 align-top text-slate-100">
                          {l.description}
                        </td>
                        <td className="px-2 py-1 align-top text-amber-200 font-mono">
                          {l.batchNumber ?? "-"}
                        </td>
                        <td className="px-2 py-1 align-top text-slate-300">
                          {l.expiryDate
                            ? formatDate(l.expiryDate)
                            : "-"}
                        </td>
                        <td className="px-2 py-1 align-top text-slate-300 text-center font-mono">
                          {formatMoney(l.quantity)}
                        </td>
                        <td className="px-2 py-1 align-top text-slate-300 text-center font-mono">
                          {formatMoney(l.unitPrice)}
                        </td>
                        <td className="px-2 py-1 align-top text-emerald-300 text-center font-mono">
                          {formatMoney(l.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <div>
                <table className={`w-full text-[11px] border-separate border-spacing-y-1 ${isRtl ? 'text-right' : 'text-left'}`}>
                  <thead className="text-slate-400">
                    <tr>
                      <th>{t("inventory.purchaseInvoiceDetails.editLines.table.description", "الوصف")}</th>
                      <th>{t("inventory.purchaseInvoiceDetails.editLines.table.batch", "تشغيلة")}</th>
                      <th>{t("inventory.purchaseInvoiceDetails.editLines.table.expiry", "صلاحية")}</th>
                      <th className="text-center">{t("inventory.purchaseInvoiceDetails.editLines.table.qty", "كمية")}</th>
                      <th className="text-center">{t("inventory.purchaseInvoiceDetails.editLines.table.price", "سعر")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editLines.map((line, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            className={`w-full bg-slate-900 border border-slate-700 rounded px-1 ${isRtl ? 'text-right' : 'text-left'}`}
                            value={line.description}
                            onChange={(e) =>
                              updateEditLine(idx, "description", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            className={`w-full bg-slate-900 border border-slate-700 rounded px-1 ${isRtl ? 'text-right' : 'text-left'}`}
                            value={line.batchNumber}
                            onChange={(e) =>
                              updateEditLine(idx, "batchNumber", e.target.value)
                            }
                            placeholder={t("inventory.purchaseInvoiceDetails.editLines.table.batch", "تشغيلة")}
                          />
                        </td>
                        <td>
                          <DatePicker
                            date={line.expiryDate ? new Date(line.expiryDate) : undefined}
                            onChange={(d) =>
                              updateEditLine(idx, "expiryDate", d ? d.toISOString().slice(0, 10) : "")
                            }
                            className="bg-slate-900 border-slate-700 h-8 px-1 text-xs"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 text-center font-mono"
                            value={line.quantity}
                            onChange={(e) =>
                              updateEditLine(idx, "quantity", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 text-center font-mono"
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateEditLine(idx, "unitPrice", e.target.value)
                            }
                          />
                        </td>
                        <td className="text-center">
                          <button
                            onClick={() => removeEditLine(idx)}
                            className="text-red-400 font-bold px-1"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  onClick={addEditLine}
                  className="mt-2 text-xs text-sky-400 font-bold"
                >
                  {t("inventory.purchaseInvoiceDetails.editLines.addBtn", "+ سطر جديد")}
                </button>
              </div>
            )}
          </div>

          {/* ======== الدفعات ======== */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs mb-4 overflow-auto">
            <div className="text-slate-200 font-semibold mb-2">{t("inventory.purchaseInvoiceDetails.payments.title", "الدفعات")}</div>
            {data.payments.length === 0 ? (
              <div className="text-slate-500">{t("inventory.purchaseInvoiceDetails.payments.empty", "لا توجد دفعات.")}</div>
            ) : (
              <ul className="space-y-1 list-disc list-inside">
                {data.payments.map((p) => (
                  <li key={p.id} className="text-slate-300">
                    {formatDate(p.paidAt)} - <span className="font-semibold text-amber-300 font-mono">{formatMoney(p.amount)}</span>{" "}
                    {data.currency}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ======== تسجيل دفعة ======== */}
          {canPay && (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
              <div className="text-slate-200 font-semibold mb-3">
                {t("inventory.purchaseInvoiceDetails.pay.title", "تسجيل دفعة")}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">{t("inventory.purchaseInvoiceDetails.pay.amount", "المبلغ")}</label>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className={`rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs outline-none focus:border-emerald-400 ${isRtl ? 'text-right' : 'text-left'}`}
                  />
                </div>
                {/* ... باقي حقول الدفع (طريقة، مرجع، ملاحظات) ... */}
                <div className="flex flex-col gap-1 pt-4">
                  <button
                    onClick={recordPayment}
                    disabled={busyAction === "pay"}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500 disabled:opacity-50 font-bold"
                  >
                    {t("inventory.purchaseInvoiceDetails.pay.saveBtn", "حفظ الدفعة")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
