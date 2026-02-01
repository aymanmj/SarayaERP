import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type CashierUser = {
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
  note?: string | null;
  cashier: CashierUser;
};

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

// Local formatDateOnly removed

function formatMoney(val: number | string | null | undefined) {
  const num = Number(val ?? 0);
  return num.toFixed(3);
}

export default function CashierShiftsPage() {
  // 🗓️ إعداد التاريخ الافتراضي: آخر 7 أيام
  const todayStr = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

  const [fromDate, setFromDate] = useState<string>(sevenDaysAgo);
  const [toDate, setToDate] = useState<string>(todayStr);
  const [cashierId, setCashierId] = useState<string>(""); // فارغ = الكل (أو حسب صلاحية المستخدم)

  const [shifts, setShifts] = useState<CashierShiftRow[]>([]);
  const [cashiers, setCashiers] = useState<CashierUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCashiers = async () => {
    try {
      const res = await apiClient.get<CashierUser[]>("/cashier/users");
      setCashiers(res.data);
    } catch (err) {
      console.error(err);
      // ما نعتبرهاش fatal، بس نسكت
    }
  };

  const loadShifts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", fromDate);
      if (toDate) params.append("toDate", toDate);
      if (cashierId) params.append("cashierId", cashierId);

      const res = await apiClient.get<CashierShiftRow[]>(
        `/cashier/shifts?${params.toString()}`
      );
      setShifts(res.data);
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      if (typeof msg === "string") {
        setError(msg);
        toast.error(msg);
      } else {
        setError("حدث خطأ أثناء تحميل الشفتات المقفولة.");
        toast.error("حدث خطأ أثناء تحميل الشفتات المقفولة.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCashiers();
    loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 📊 ملخص
  const summary = useMemo(() => {
    const totalShifts = shifts.length;
    const totalSystem = shifts.reduce(
      (sum, s) => sum + Number(s.systemCashTotal ?? 0),
      0
    );
    const totalActual = shifts.reduce(
      (sum, s) => sum + Number(s.actualCashTotal ?? 0),
      0
    );
    const totalDiff = shifts.reduce(
      (sum, s) => sum + Number(s.difference ?? 0),
      0
    );

    return { totalShifts, totalSystem, totalActual, totalDiff };
  }, [shifts]);

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* العنوان */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">الشفتات المقفولة للكاشير</h1>
          <p className="text-sm text-slate-400">
            استعراض جميع شفتات الكاشير المقفولة مع إمكانية الفلترة حسب التاريخ
            والكاشير.
          </p>
        </div>
        <button
          type="button"
          onClick={loadShifts}
          className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-100"
        >
          تحديث القائمة
        </button>
      </div>

      {/* فلاتر أعلى الصفحة */}
      <div className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          {/* من تاريخ */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">من تاريخ</label>
            <DatePicker
              date={fromDate ? new Date(fromDate) : undefined}
              onChange={(d) => setFromDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-900 border-slate-700 h-9 text-xs"
            />
          </div>

          {/* إلى تاريخ */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">إلى تاريخ</label>
            <DatePicker
              date={toDate ? new Date(toDate) : undefined}
              onChange={(d) => setToDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-900 border-slate-700 h-9 text-xs"
            />
          </div>

          {/* الكاشير */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">الكاشير</label>
            <select
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              <option value="">الكل (حسب الصلاحيات)</option>
              {cashiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.username})
                </option>
              ))}
            </select>
          </div>

          {/* زر تطبيق */}
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={loadShifts}
              className="w-full px-3 py-2 rounded-2xl text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              تطبيق الفلترة
            </button>
            {loading && (
              <span className="mt-1 text-[11px] text-slate-500">
                جارِ تحميل الشفتات...
              </span>
            )}
            {error && (
              <span className="mt-1 text-[11px] text-rose-400">{error}</span>
            )}
          </div>
        </div>
      </div>

      {/* ملخص الأرقام */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="text-slate-400 mb-1">عدد الشفتات</div>
          <div className="text-2xl font-bold text-slate-100">
            {summary.totalShifts}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="text-slate-400 mb-1">إجمالي النقدية (حسب النظام)</div>
          <div className="text-2xl font-bold text-amber-300">
            {formatMoney(summary.totalSystem)} LYD
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="text-slate-400 mb-1">
            إجمالي النقدية الفعلية (المسلمة)
          </div>
          <div className="text-2xl font-bold text-emerald-300">
            {formatMoney(summary.totalActual)} LYD
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="text-slate-400 mb-1">إجمالي الفارق</div>
          <div
            className={
              summary.totalDiff > 0
                ? "text-2xl font-bold text-emerald-300"
                : summary.totalDiff < 0
                ? "text-2xl font-bold text-rose-300"
                : "text-2xl font-bold text-slate-100"
            }
          >
            {formatMoney(summary.totalDiff)} LYD
          </div>
        </div>
      </div>

      {/* جدول الشفتات */}
      <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs overflow-auto">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">
          قائمة الشفتات المقفولة
        </h2>

        {shifts.length === 0 ? (
          <div className="text-slate-500 text-xs">
            لا توجد شفتات مقفولة في هذه الفترة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-right border-separate border-spacing-y-1">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-right">رقم الشفت</th>
                  <th className="px-2 py-1 text-right">التاريخ</th>
                  <th className="px-2 py-1 text-right">من - إلى</th>
                  <th className="px-2 py-1 text-right">الكاشير</th>
                  <th className="px-2 py-1 text-right">النظام (نقداً)</th>
                  <th className="px-2 py-1 text-right">الفعلي (المسلم)</th>
                  <th className="px-2 py-1 text-right">الفرق</th>
                  <th className="px-2 py-1 text-right">ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => {
                  const isPositive = s.difference > 0;
                  const isNegative = s.difference < 0;

                  return (
                    <tr
                      key={s.id}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl"
                    >
                      <td className="px-2 py-1 align-top">#{s.id}</td>
                      <td className="px-2 py-1 align-top">
                        {formatDate(s.rangeStart)}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {formatDateTime(s.rangeStart)}{" "}
                        <span className="text-slate-500">→</span>{" "}
                        {formatDateTime(s.rangeEnd)}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {s.cashier?.fullName ?? "—"}{" "}
                        {s.cashier && (
                          <span className="text-[10px] text-slate-400">
                            ({s.cashier.username})
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 align-top text-amber-300">
                        {formatMoney(s.systemCashTotal)} LYD
                      </td>
                      <td className="px-2 py-1 align-top text-emerald-300">
                        {formatMoney(s.actualCashTotal)} LYD
                      </td>
                      <td className="px-2 py-1 align-top">
                        <span
                          className={
                            isPositive
                              ? "text-emerald-300 font-semibold"
                              : isNegative
                              ? "text-rose-300 font-semibold"
                              : "text-slate-100 font-semibold"
                          }
                        >
                          {formatMoney(s.difference)} LYD
                        </span>
                      </td>
                      <td className="px-2 py-1 align-top max-w-[220px]">
                        <span className="line-clamp-2">{s.note ?? "—"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
