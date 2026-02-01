// src/pages/CashierDailyReportPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { DatePicker } from "@/components/ui/date-picker";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "INSURANCE" | "OTHER";

type CashierDailyReport = {
  dateFrom: string;
  dateTo: string;
  paymentsSummary: {
    totalAmount: number;
    totalCount: number;
  };
  paymentsByMethod: {
    method: PaymentMethod;
    totalAmount: number;
    count: number;
  }[];
  invoicesSummary: {
    invoiceCount: number;
    totalInvoiced: number;
    totalDiscount: number;
    totalPaid: number;
    totalRemaining: number;
  };
};

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatMoney(val: number | string | null | undefined) {
  const num = Number(val ?? 0);
  return num.toFixed(3);
}

function getTodayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CashierDailyReportPage() {
  const [reportDate, setReportDate] = useState<string>(getTodayDateStr());
  const [report, setReport] = useState<CashierDailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async (date: string) => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<CashierDailyReport>(
        "/cashier/reports/daily",
        { params: { date } }
      );
      setReport(res.data);
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      if (typeof msg === "string") setError(msg);
      else setError("حدث خطأ أثناء تحميل تقرير الكاشير.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport(reportDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    if (reportDate) {
      loadReport(reportDate);
    }
  };

  return (
    <div
      id="invoice-print-root"
      className="min-h-screen flex justify-center bg-slate-900 py-6"
    >
      <div
        id="print-root"
        dir="rtl"
        className="print-wrapper w-[800px] bg-slate-950/90 text-slate-100 rounded-2xl shadow-xl px-8 py-6"
      >
        {/* شريط علوي + أزرار */}
        <div className="no-print flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">
              تقرير يومي للكاشير (Daily Cashier Report)
            </h1>
            <p className="text-sm text-slate-400">
              ملخص الدفعات والفواتير لليوم المختار.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-1.5 rounded-full text-sm bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              🖨 طباعة التقرير
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-100"
            >
              تحديث
            </button>
          </div>
        </div>

        {/* فلاتر بسيطة (تاريخ اليوم) */}
        <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <label className="text-slate-300">تاريخ التقرير:</label>
            <DatePicker
              date={reportDate ? new Date(reportDate) : undefined}
              onChange={(d) => setReportDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-950 border-slate-700 h-8 text-xs px-2"
            />
            <button
              type="button"
              onClick={handleRefresh}
              className="px-3 py-1.5 rounded-full text-xs bg-sky-600 hover:bg-sky-500 text-white"
            >
              عرض التقرير
            </button>
          </div>
          <div className="text-[11px] text-slate-400">
            نطاق التقرير:{" "}
            {report ? (
              <>
                <span className="text-sky-300">
                  {formatDateTime(report.dateFrom)}
                </span>{" "}
                -{" "}
                <span className="text-sky-300">
                  {formatDateTime(report.dateTo)}
                </span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        {/* حالة التحميل / الخطأ */}
        {loading && (
          <div className="mb-4 text-center text-xs text-slate-400">
            جارِ تحميل تقرير الكاشير...
          </div>
        )}
        {error && (
          <div className="mb-4 text-center text-xs text-rose-400">{error}</div>
        )}

        {!report && !loading && !error && (
          <div className="text-center text-xs text-slate-500">
            لا توجد بيانات لعرضها بعد. اختر تاريخًا واضغط "عرض التقرير".
          </div>
        )}

        {report && (
          <div className="space-y-4">
            {/* Cards ملخص علوي */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="border border-slate-800 rounded-2xl bg-slate-900/70 p-3">
                <div className="text-slate-400 mb-1">إجمالي عدد الدفعات</div>
                <div className="text-2xl font-bold text-emerald-300">
                  {report.paymentsSummary.totalCount}
                </div>
              </div>
              <div className="border border-slate-800 rounded-2xl bg-slate-900/70 p-3">
                <div className="text-slate-400 mb-1">
                  إجمالي المبالغ المحصلة
                </div>
                <div className="text-2xl font-bold text-emerald-300">
                  {formatMoney(report.paymentsSummary.totalAmount)} LYD
                </div>
              </div>
              <div className="border border-slate-800 rounded-2xl bg-slate-900/70 p-3">
                <div className="text-slate-400 mb-1">عدد الفواتير في اليوم</div>
                <div className="text-2xl font-bold text-sky-300">
                  {report.invoicesSummary.invoiceCount}
                </div>
              </div>
            </div>

            {/* جدول الدفعات حسب طريقة الدفع */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="border border-slate-800 rounded-2xl bg-slate-900/70 p-3">
                <h2 className="text-sm font-semibold mb-2">
                  الدفعات حسب طريقة الدفع
                </h2>
                {report.paymentsByMethod.length === 0 ? (
                  <div className="text-slate-500 text-[11px]">
                    لا توجد دفعات مسجلة في هذا اليوم.
                  </div>
                ) : (
                  <table className="w-full text-[11px] border border-slate-800 border-collapse">
                    <thead className="bg-slate-800/70">
                      <tr>
                        <th className="px-2 py-1 border border-slate-800 text-right">
                          طريقة الدفع
                        </th>
                        <th className="px-2 py-1 border border-slate-800 text-right">
                          عدد الدفعات
                        </th>
                        <th className="px-2 py-1 border border-slate-800 text-right">
                          الإجمالي
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.paymentsByMethod.map((row) => (
                        <tr key={row.method}>
                          <td className="px-2 py-1 border border-slate-800">
                            {row.method === "CASH"
                              ? "نقداً"
                              : row.method === "CARD"
                              ? "بطاقة"
                              : row.method === "TRANSFER"
                              ? "حوالة / تحويل"
                              : row.method === "INSURANCE"
                              ? "تأمين"
                              : "أخرى"}
                          </td>
                          <td className="px-2 py-1 border border-slate-800">
                            {row.count}
                          </td>
                          <td className="px-2 py-1 border border-slate-800">
                            {formatMoney(row.totalAmount)} LYD
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* ملخص الفواتير */}
              <div className="border border-slate-800 rounded-2xl bg-slate-900/70 p-3">
                <h2 className="text-sm font-semibold mb-2">
                  ملخص الفواتير لليوم
                </h2>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">إجمالي الفواتير:</span>
                    <span>
                      {formatMoney(report.invoicesSummary.totalInvoiced)} LYD
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">إجمالي الخصومات:</span>
                    <span>
                      {formatMoney(report.invoicesSummary.totalDiscount)} LYD
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      إجمالي المدفوع على الفواتير:
                    </span>
                    <span className="text-emerald-300 font-semibold">
                      {formatMoney(report.invoicesSummary.totalPaid)} LYD
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">إجمالي المتبقي:</span>
                    <span
                      className={
                        report.invoicesSummary.totalRemaining > 0
                          ? "text-rose-300 font-semibold"
                          : "text-emerald-300 font-semibold"
                      }
                    >
                      {formatMoney(report.invoicesSummary.totalRemaining)} LYD
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
