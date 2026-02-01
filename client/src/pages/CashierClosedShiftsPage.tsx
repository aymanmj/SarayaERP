// src/pages/CashierClosedShiftsPage.tsx

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type CashierInfo = {
  id: number;
  fullName: string;
  username: string;
};

type CashierShiftRow = {
  id: number;
  rangeStart: string;
  rangeEnd: string;
  systemCashTotal: number;
  actualCashTotal: number;
  difference: number;
  note: string | null;
  cashierId: number;
  cashier?: CashierInfo | null;
};

export default function CashierClosedShiftsPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CashierShiftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadShifts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<CashierShiftRow[]>("/cashier/shifts", {
        params: {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        },
      });
      setRows(res.data);
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message || "حدث خطأ أثناء جلب الشفتات المقفولة.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // تحميل مبدئي (آخر 7 أيام من الـ backend)
    loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    let totalSystem = 0;
    let totalActual = 0;
    let totalDiff = 0;

    for (const r of rows) {
      totalSystem += Number(r.systemCashTotal ?? 0);
      totalActual += Number(r.actualCashTotal ?? 0);
      totalDiff += Number(r.difference ?? 0);
    }

    return { totalSystem, totalActual, totalDiff };
  }, [rows]);

// Local formatDate removed

  // ✅ وقت بصيغة HH:mm (مفيد للـ URL والفلاتر)
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const goToCashierReport = (row: CashierShiftRow) => {
    const d = new Date(row.rangeStart);
    if (Number.isNaN(d.getTime())) return;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const from = formatTime(row.rangeStart); // HH:mm
    const to = formatTime(row.rangeEnd); // HH:mm

    navigate(
      `/cashier/reports/by-cashier?date=${dateStr}&from=${from}&to=${to}&cashierId=${row.cashierId}`
    );
  };

  return (
    <div
      className="flex flex-col gap-6 px-6 py-6 lg:px-10 lg:py-8 text-slate-100"
      dir="rtl"
    >
      {/* العنوان + الوصف */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">الشفتات المقفولة للكاشير</h1>
          <p className="text-sm text-slate-400">
            استعراض الشفتات التي تم إقفالها، مع الفروق بين الرصيد الفعلي ورصيد
            النظام لكل شفت.
          </p>
        </div>
      </div>

      {/* فلاتر التاريخ */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">من تاريخ</label>
            <DatePicker
              date={fromDate ? new Date(fromDate) : undefined}
              onChange={(d) => setFromDate(d ? d.toISOString().slice(0, 10) : "")}
              className="w-full bg-slate-950/60 border-slate-700 h-9 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1 md:ml-3">
            <label className="text-xs text-slate-400">إلى تاريخ</label>
            <DatePicker
              date={toDate ? new Date(toDate) : undefined}
              onChange={(d) => setToDate(d ? d.toISOString().slice(0, 10) : "")}
              className="w-full bg-slate-950/60 border-slate-700 h-9 text-sm"
            />
          </div>
        </div>

        <button
          onClick={loadShifts}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "جاري التحديث..." : "تحديث الفترة"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {/* كروت الملخص */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 shadow">
          <div className="text-xs text-slate-400">إجمالي النقد حسب النظام</div>
          <div className="mt-1 text-lg font-semibold text-emerald-400">
            LYD {summary.totalSystem.toFixed(3)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 shadow">
          <div className="text-xs text-slate-400">إجمالي النقد الفعلي</div>
          <div className="mt-1 text-lg font-semibold text-yellow-300">
            LYD {summary.totalActual.toFixed(3)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 shadow">
          <div className="text-xs text-slate-400">إجمالي الفروق</div>
          <div
            className={
              "mt-1 text-lg font-semibold " +
              (summary.totalDiff === 0
                ? "text-slate-100"
                : summary.totalDiff > 0
                ? "text-emerald-400"
                : "text-red-400")
            }
          >
            LYD {summary.totalDiff.toFixed(3)}
          </div>
        </div>
      </div>

      {/* جدول الشفتات */}
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 shadow">
        <div className="mb-3 text-sm font-medium text-slate-200">
          الشفتات المقفولة في الفترة المحددة
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 text-xs text-slate-400">
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  التاريخ
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right">من</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">إلى</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  الكاشير
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  إجمالي النظام
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  النقد الفعلي
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  الفرق
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  ملاحظات
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-xs text-slate-400"
                  >
                    لا توجد شفتات مقفولة في الفترة المحددة.
                  </td>
                </tr>
              )}

              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => goToCashierReport(r)}
                  className="border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer"
                >
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatDate(r.rangeStart)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatTime(r.rangeStart)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatTime(r.rangeEnd)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.cashier?.fullName || r.cashier?.username || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {Number(r.systemCashTotal).toFixed(3)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {Number(r.actualCashTotal).toFixed(3)}
                  </td>
                  <td
                    className={
                      "whitespace-nowrap px-3 py-2 " +
                      (Number(r.difference) === 0
                        ? "text-slate-100"
                        : Number(r.difference) > 0
                        ? "text-emerald-400"
                        : "text-red-400")
                    }
                  >
                    {Number(r.difference).toFixed(3)}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-300">
                    {r.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
