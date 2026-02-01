// src/components/encounter/BillingTab.tsx

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

// --- Types Definitions ---

type BillingPayment = {
  id: number;
  amount: string;
  method: string;
  paidAt: string;
  reference?: string | null;
};

type BillingInvoice = {
  id: number;
  status: string;
  totalAmount: string;
  discountAmount: string;
  paidAmount: string;
  currency: string;
  createdAt: string;
  payments: BillingPayment[];
};

type BillingCharge = {
  id: number;
  sourceType: string;
  sourceId?: number | null;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  createdAt: string;
  invoiceId?: number | null;
  serviceItem: {
    id: number;
    name: string;
    code?: string | null;
    type: string;
    defaultPrice: string;
  };
};

type BillingSummary = {
  encounter: {
    id: number;
    status: string;
    type: string;
  };
  charges: BillingCharge[];
  invoices: BillingInvoice[];
};

type BillingTabProps = {
  encounterId: number;
  hospitalId: number;
};

// --- Helper Functions ---

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
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

export function BillingTab({ encounterId, hospitalId }: BillingTabProps) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<BillingSummary>(
        `/billing/encounters/${encounterId}`,
      );
      setSummary(res.data);
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل بيانات الفوترة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (encounterId && hospitalId) {
      fetchSummary();
    }
  }, [encounterId, hospitalId]);

  // ⚠️ إنشاء الفاتورة منقول للخزينة (Cashier Page)

  // 🔹 ملخص سريع محسوب من البنود + الفواتير لهذه الحالة فقط
  const quickTotals = useMemo(() => {
    if (!summary) {
      return {
        totalCharges: 0,
        totalInvoiced: 0,
        totalPaid: 0,
        outstanding: 0,
      };
    }

    // إجمالي البنود (الخدمات المسجلة)
    const totalCharges = summary.charges.reduce((sum, ch) => {
      return sum + Number(ch.totalAmount ?? 0);
    }, 0);

    // إجمالي المفوتر (بعد الخصم)
    const totalInvoiced = summary.invoices.reduce((sum, inv) => {
      const total = Number(inv.totalAmount ?? 0);
      const discount = Number(inv.discountAmount ?? 0);
      return sum + (total - discount);
    }, 0);

    // إجمالي المدفوع (نجمع paidAmount لكل فاتورة)
    const totalPaid = summary.invoices.reduce((sum, inv) => {
      return sum + Number(inv.paidAmount ?? 0);
    }, 0);

    // الرصيد المستحق على هذه الحالة (الخدمات - المدفوعات)
    const outstanding = totalCharges - totalPaid;

    return { totalCharges, totalInvoiced, totalPaid, outstanding };
  }, [summary]);

  const hasUninvoiced = summary?.charges?.some((c) => !c.invoiceId) ?? false;

  return (
    <div className="space-y-4 text-xs">
      {/* 🔹 الملخص المالي السريع للحالة */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <div className="text-[11px] text-slate-400 mb-1">
            إجمالي البنود (Charges)
          </div>
          <div className="text-sm font-semibold text-sky-300">
            {formatMoney(quickTotals.totalCharges)}{" "}
            <span className="text-[10px] text-slate-500">LYD</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <div className="text-[11px] text-slate-400 mb-1">
            المبلغ المفوتر (Invoices)
          </div>
          <div className="text-sm font-semibold text-emerald-300">
            {formatMoney(quickTotals.totalInvoiced)}{" "}
            <span className="text-[10px] text-slate-500">LYD</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <div className="text-[11px] text-slate-400 mb-1">
            المبلغ المدفوع (Payments)
          </div>
          <div className="text-sm font-semibold text-emerald-200">
            {formatMoney(quickTotals.totalPaid)}{" "}
            <span className="text-[10px] text-slate-500">LYD</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
          <div className="text-[11px] text-slate-400 mb-1">
            الرصيد على هذه الحالة
          </div>
          <div
            className={
              "text-sm font-semibold " +
              (quickTotals.outstanding > 0.001
                ? "text-rose-300"
                : "text-emerald-300")
            }
          >
            {formatMoney(quickTotals.outstanding)}{" "}
            <span className="text-[10px] text-slate-500">LYD</span>
          </div>
        </div>
      </div>

      {/* إشعار + رابط للخزينة */}
      <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700">
        <div className="text-[11px] text-slate-400">
          ℹ️ هذا الملخص للقراءة فقط. لإتمام الدفع أو إنشاء فاتورة، يرجى التوجه للخزينة.
        </div>
        <a
          href="/cashier"
          className="px-4 py-2 rounded-full text-[11px] font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-900/20 flex items-center gap-2"
        >
          💳 الذهاب للخزينة
        </a>
      </div>

      {/* جدول البنود */}
      <div className="border border-slate-800 rounded-2xl bg-slate-900/60 p-3">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-slate-200">
            تفاصيل البنود (Charges)
          </h3>
          {loading && (
            <span className="text-[11px] text-slate-500">
              جارِ تحميل البيانات...
            </span>
          )}
        </div>

        {(!summary || summary.charges.length === 0) && (
          <div className="py-4 text-center text-[11px] text-slate-500">
            لا توجد بنود فوترة مسجلة لهذه الحالة حتى الآن.
          </div>
        )}

        {summary && summary.charges.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-right border-separate border-spacing-y-1">
              <thead>
                <tr className="text-slate-400">
                  <th className="px-2 py-1 text-right">التاريخ</th>
                  <th className="px-2 py-1 text-right">الخدمة</th>
                  <th className="px-2 py-1 text-right">الكمية</th>
                  <th className="px-2 py-1 text-right">السعر</th>
                  <th className="px-2 py-1 text-right">الإجمالي</th>
                  <th className="px-2 py-1 text-right">المصدر</th>
                  <th className="px-2 py-1 text-right">الفاتورة</th>
                </tr>
              </thead>
              <tbody>
                {summary.charges.map((c) => (
                  <tr
                    key={c.id}
                    className="bg-slate-950/70 border border-slate-800 rounded-xl hover:bg-slate-900 transition-colors"
                  >
                    <td className="px-2 py-1 align-top text-slate-300">
                      {formatDateTime(c.createdAt)}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <div className="text-slate-100 font-medium">
                        {c.serviceItem.name}
                      </div>
                      {c.serviceItem.code && (
                        <div className="text-slate-500 text-[9px] font-mono">
                          {c.serviceItem.code}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 align-top text-slate-200">
                      {c.quantity}
                    </td>
                    <td className="px-2 py-1 align-top text-slate-300">
                      {formatMoney(c.unitPrice)}
                    </td>
                    <td className="px-2 py-1 align-top text-emerald-300 font-bold">
                      {formatMoney(c.totalAmount)}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <span className="uppercase text-[9px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        {c.sourceType}
                      </span>
                    </td>
                    <td className="px-2 py-1 align-top">
                      {c.invoiceId ? (
                        <a
                          href={`/invoices/${c.invoiceId}/print`} // رابط سريع للطباعة
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 underline decoration-dotted"
                        >
                          #{c.invoiceId}
                        </a>
                      ) : (
                        <span className="text-amber-500 text-[10px]">
                          غير مفوتر
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* الفواتير والمدفوعات */}
      <div className="border border-slate-800 rounded-2xl bg-slate-900/60 p-3">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">
          سجل الفواتير والمدفوعات
        </h3>

        {(!summary || summary.invoices.length === 0) && (
          <div className="py-3 text-center text-[11px] text-slate-500">
            لم يتم إنشاء أي فاتورة بعد لهذه الحالة.
          </div>
        )}

        {summary && summary.invoices.length > 0 && (
          <div className="space-y-3 text-[11px]">
            {summary.invoices.map((inv) => (
              <div
                key={inv.id}
                className="border border-slate-800 rounded-2xl p-3 bg-slate-900/70"
              >
                {/* رأس الفاتورة */}
                <div className="flex flex-wrap justify-between gap-2 mb-2 pb-2 border-b border-slate-800/50">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">فاتورة: </span>
                    <span className="text-emerald-300 font-mono text-sm">
                      #{inv.id}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">التاريخ: </span>
                    <span className="text-slate-100">
                      {formatDateTime(inv.createdAt)}
                    </span>
                  </div>
                  <div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        inv.status === "PAID"
                          ? "bg-emerald-900/30 text-emerald-400"
                          : inv.status === "PARTIALLY_PAID"
                            ? "bg-amber-900/30 text-amber-400"
                            : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                </div>

                {/* أرقام الفاتورة */}
                <div className="flex flex-wrap gap-4 text-[11px] text-slate-300 mb-2">
                  <div>
                    الإجمالي:{" "}
                    <span className="text-sky-300 font-mono">
                      {formatMoney(inv.totalAmount)} {inv.currency}
                    </span>
                  </div>
                  <div>
                    المدفوع:{" "}
                    <span className="text-emerald-300 font-mono">
                      {formatMoney(inv.paidAmount)} {inv.currency}
                    </span>
                  </div>
                  <div>
                    المتبقي:{" "}
                    <span className="text-rose-300 font-mono">
                      {formatMoney(
                        Number(inv.totalAmount) -
                          Number(inv.paidAmount) -
                          Number(inv.discountAmount),
                      )}{" "}
                      {inv.currency}
                    </span>
                  </div>
                </div>

                {/* المدفوعات المرتبطة */}
                {inv.payments.length > 0 ? (
                  <div className="mt-2 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                    <div className="text-[10px] text-slate-500 mb-1 font-semibold">
                      سجل الدفعات:
                    </div>
                    <ul className="space-y-1">
                      {inv.payments.map((p) => (
                        <li
                          key={p.id}
                          className="flex justify-between text-[10px] text-slate-300 border-b border-slate-800/30 last:border-0 pb-1 last:pb-0"
                        >
                          <span>{formatDateTime(p.paidAt)}</span>
                          <span>{p.method}</span>
                          <span className="text-emerald-400 font-mono">
                            {formatMoney(p.amount)} {inv.currency}
                          </span>
                          {p.reference && (
                            <span className="text-slate-500 truncate max-w-[100px]">
                              ({p.reference})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500 italic mt-1">
                    لا توجد مدفوعات مسجلة.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
