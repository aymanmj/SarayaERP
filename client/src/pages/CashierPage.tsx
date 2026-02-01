// src/pages/CashierPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type InvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "CANCELLED";

type EncounterType = "OPD" | "ER" | "IPD";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "INSURANCE" | "OTHER";

type CashierInvoice = {
  id: number;
  status: InvoiceStatus;
  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  remainingAmount: number;

  patientShare: number;
  insuranceShare: number;

  createdAt: string;
  patient: {
    id: number;
    fullName: string;
    mrn: string;
    insurancePolicy?: {
      name: string;
      provider: { name: string };
    } | null;
  };
  encounter: {
    id: number;
    type: EncounterType;
  } | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(val: number | string | null | undefined) {
  const num = Number(val ?? 0);
  return num.toFixed(3);
}

// ✅ دالة مساعدة لحساب القيم الفعلية
function getInvoiceShares(inv: CashierInvoice) {
  const total = Number(inv.totalAmount);
  const insurance = Number(inv.insuranceShare ?? 0);

  // إذا كان التأمين 0، المريض يتحمل الكل (إصلاح للبيانات القديمة)
  let patient = Number(inv.patientShare ?? 0);
  if (insurance === 0 && patient === 0 && total > 0) {
    patient = total;
  }

  // المدفوع: نفترض أن المدفوعات المسجلة هنا هي من المريض
  const paid = Number(inv.paidAmount);

  // المطلوب الآن = حصة المريض - ما دفعه
  const dueNow = Math.max(0, patient - paid);

  return {
    total,
    insurance,
    patient,
    paid,
    dueNow,
    isInsurance: insurance > 0,
  };
}

export default function CashierPage() {
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<CashierInvoice[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");

  const selectedInvoice = invoices.find((x) => x.id === selectedId) || null;
  const selectedValues = selectedInvoice
    ? getInvoiceShares(selectedInvoice)
    : null;

  const loadWorklist = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<CashierInvoice[]>("/cashier/worklist");
      setInvoices(res.data);
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل قائمة الفواتير للكاشير.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorklist();
  }, []);

  const handleSelect = (id: number) => {
    setSelectedId(id);
    const inv = invoices.find((x) => x.id === id);
    if (inv) {
      const vals = getInvoiceShares(inv);
      // تعبئة الحقل بالمطلوب من المريض فقط
      setAmount(vals.dueNow.toFixed(3));
    }
  };

  const handlePay = async () => {
    if (!selectedInvoice) {
      toast.warning("اختر فاتورة أولاً.");
      return;
    }

    const value = Number(amount);

    if (value < 0) {
      toast.warning("القيمة لا يمكن أن تكون سالبة.");
      return;
    }

    // إذا كان هناك مبلغ مستحق، لا نسمح بـ 0
    // أما إذا كان المستحق 0 (تأمين كامل)، نسمح بـ 0 للتأكيد
    if (value === 0 && selectedValues && selectedValues.dueNow > 0.005) {
      toast.warning("أدخل قيمة دفع صحيحة (المبلغ المستحق أكبر من 0).");
      return;
    }

    try {
      const res = await apiClient.post(
        `/cashier/invoices/${selectedInvoice.id}/payments`,
        {
          amount: value,
          method,
          reference: reference || undefined,
        },
      );

      // ✅ [FIX] قراءة البيانات بشكل صحيح من استجابة الباكيند
      const data: any = res.data;

      // الباكيند يعيد: { id: (InvoiceId), paymentId: number | null, ... }
      const paymentId = data.paymentId;

      if (value === 0) {
        toast.success("تم تأكيد الفاتورة (مغطاة بالتأمين).");
      } else {
        toast.success("تم تسجيل الدفعة بنجاح.");
      }

      // ✅ [FIX] فتح الإيصال فقط إذا كان هناك ID للدفعة
      if (paymentId) {
        window.open(
          `/payments/${paymentId}/receipt`,
          "_blank",
          "noopener,noreferrer",
        );
      }

      setAmount("");
      setReference("");
      setSelectedId(null);
      await loadWorklist();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      toast.error(
        typeof msg === "string" ? msg : "حدث خطأ أثناء تسجيل الدفعة.",
      );
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      {/* الهيدر */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">خزينة / الكاشير</h1>
          <p className="text-sm text-slate-400">
            تحصيل الفواتير والخدمات (كشف، مختبر، أشعة).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadWorklist}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm"
          >
            تحديث
          </button>
          <button
            onClick={() => window.open("/cashier/reports/daily", "_blank")}
            className="px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-sm text-white"
          >
            التقرير اليومي
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* القائمة */}
        <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-slate-200">
              الفواتير المستحقة للدفع
            </h2>
            {loading && (
              <span className="text-[10px] text-slate-500">
                جارِ التحميل...
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto rounded-xl border border-slate-800/50">
            <table className="min-w-full text-xs text-right">
              <thead className="bg-slate-900 text-slate-300 sticky top-0">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">المريض</th>
                  <th className="px-3 py-3 text-center">النوع</th>
                  <th className="px-3 py-3">الإجمالي</th>
                  <th className="px-3 py-3 text-sky-400">حصة التأمين</th>
                  <th className="px-3 py-3 text-emerald-400">حصة المريض</th>
                  <th className="px-3 py-3 text-rose-400">المطلوب الآن</th>
                  <th className="px-3 py-3">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {invoices.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500">
                      لا توجد فواتير معلقة.
                    </td>
                  </tr>
                )}
                {invoices.map((inv) => {
                  const vals = getInvoiceShares(inv);

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => handleSelect(inv.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedId === inv.id
                          ? "bg-slate-800/80"
                          : "hover:bg-slate-900/40"
                      }`}
                    >
                      <td className="px-3 py-3 font-mono">#{inv.id}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-200">
                          {inv.patient?.fullName}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {inv.patient?.mrn}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {vals.isInsurance ? (
                          <span className="px-2 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-500/30 text-[10px]">
                            تأمين
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">
                            نقدي
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">{formatMoney(vals.total)}</td>
                      <td className="px-3 py-3 text-sky-300">
                        {vals.insurance > 0 ? formatMoney(vals.insurance) : "-"}
                      </td>
                      <td className="px-3 py-3 text-emerald-300 font-medium">
                        {formatMoney(vals.patient)}
                      </td>
                      <td className="px-3 py-3 font-bold text-rose-400">
                        {formatMoney(vals.dueNow)}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/invoices/${inv.id}/print`, "_blank");
                          }}
                          className="text-sky-400 hover:text-sky-300 underline"
                        >
                          طباعة
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* نموذج الدفع */}
        <div className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 h-fit">
          <h2 className="text-base font-bold text-slate-100 mb-4 border-b border-slate-800 pb-2">
            تحصيل دفعة
          </h2>

          {!selectedValues ? (
            <div className="text-sm text-slate-500 py-10 text-center">
              اختر فاتورة.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">إجمالي الفاتورة:</span>
                  <span className="text-slate-200 font-mono">
                    {formatMoney(selectedValues.total)}
                  </span>
                </div>
                {selectedValues.isInsurance && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">يغطيه التأمين:</span>
                    <span className="text-sky-400 font-mono">
                      {formatMoney(selectedValues.insurance)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-800 pt-2">
                  <span className="text-slate-400 font-semibold">
                    حصة المريض (المطلوب):
                  </span>
                  <span className="text-emerald-400 font-bold text-sm font-mono">
                    {formatMoney(selectedValues.patient)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">تم دفعه سابقاً:</span>
                  <span className="text-slate-200 font-mono">
                    {formatMoney(selectedValues.paid)}
                  </span>
                </div>
                {/* عرض المتبقي على المريض بوضوح */}
                <div className="flex justify-between font-bold text-rose-400 pt-1">
                  <span>المطلوب الآن:</span>
                  <span>{formatMoney(selectedValues.dueNow)}</span>
                </div>

                {selectedInvoice.patient.insurancePolicy && (
                  <div className="pt-2 mt-2 border-t border-slate-800 text-[10px] text-purple-300 text-center">
                    مؤمن لدى:{" "}
                    {selectedInvoice.patient.insurancePolicy.provider.name}
                    <br />({selectedInvoice.patient.insurancePolicy.name})
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 text-sm">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-300 text-xs">
                    قيمة الدفعة (LYD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-emerald-500 font-bold text-emerald-400 text-center text-lg"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-slate-300 text-xs">طريقة الدفع</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-emerald-500"
                  >
                    <option value="CASH">نقداً</option>
                    <option value="CARD">بطاقة</option>
                    <option value="TRANSFER">تحويل</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-slate-300 text-xs">
                    مرجع / ملاحظات
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <button
                onClick={handlePay}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all mt-2"
              >
                {Number(amount) === 0
                  ? "تأكيد (تغطية كاملة)"
                  : "تأكيد واستلام النقدية"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
