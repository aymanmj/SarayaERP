import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type SupplierAgingRow = {
  supplierId: number;
  supplierName: string;
  supplierCode: string | null;
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b91_120: number;
  b121_plus: number;
  total: number;
  unallocatedCredit?: number; // ✅ جديد من السيرفر
};

type AgingTotals = {
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b91_120: number;
  b121_plus: number;
  total: number;
  unallocatedCredit?: number; // ✅ جديد من السيرفر
};

type SuppliersAgingResponse = {
  asOf: string;
  suppliers: SupplierAgingRow[];
  grandTotals: AgingTotals;
};

function formatMoney(v: number) {
  return (v ?? 0).toFixed(3);
}

function buildSuppliersAgingCsv(data: SuppliersAgingResponse): string {
  const lines: string[] = [];

  lines.push("تقرير أعمار ذمم الموردين");
  const asOfDate = new Date(data.asOf);
  const asOfStr = asOfDate.toISOString().slice(0, 10);
  lines.push(`حتى تاريخ,${asOfStr}`);
  lines.push("");

  // رأس الجدول
  lines.push(
    [
      "كود المورد",
      "اسم المورد",
      "0-30 يوم",
      "31-60 يوم",
      "61-90 يوم",
      "91-120 يوم",
      "+120 يوم",
      "الإجمالي",
      "دفعات غير مربوطة",
    ].join(",")
  );

  for (const s of data.suppliers) {
    const row = [
      s.supplierCode ?? "",
      s.supplierName ?? "",
      formatMoney(s.b0_30),
      formatMoney(s.b31_60),
      formatMoney(s.b61_90),
      formatMoney(s.b91_120),
      formatMoney(s.b121_plus),
      formatMoney(s.total),
      formatMoney(Number(s.unallocatedCredit ?? 0)),
    ];

    const esc = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const line = row.map((v, idx) => (idx <= 1 ? esc(v) : v)).join(",");

    lines.push(line);
  }

  lines.push("");
  lines.push(
    [
      "",
      "الإجمالي",
      formatMoney(data.grandTotals.b0_30),
      formatMoney(data.grandTotals.b31_60),
      formatMoney(data.grandTotals.b61_90),
      formatMoney(data.grandTotals.b91_120),
      formatMoney(data.grandTotals.b121_plus),
      formatMoney(data.grandTotals.total),
      formatMoney(Number(data.grandTotals.unallocatedCredit ?? 0)),
    ].join(",")
  );

  return "\uFEFF" + lines.join("\r\n");
}

export default function SuppliersAgingPage() {
  const navigate = useNavigate();

  const [data, setData] = useState<SuppliersAgingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [asOfDate, setAsOfDate] = useState<string>("");
  const [q, setQ] = useState<string>(""); // ✅ بحث
  const [error, setError] = useState<string | null>(null);

  const load = async (overrideDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      const dateToUse = overrideDate || asOfDate;
      if (dateToUse) params.asOf = dateToUse;

      const res = await apiClient.get<SuppliersAgingResponse>(
        "/suppliers/aging",
        {
          params,
        }
      );

      setData(res.data);

      // أول مرة: لو asOfDate فاضي، نأخذ التاريخ من السيرفر
      if (!asOfDate) {
        const d = new Date(res.data.asOf);
        if (!Number.isNaN(d.getTime())) {
          setAsOfDate(d.toISOString().slice(0, 10));
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "حدث خطأ أثناء جلب تقرير أعمار ذمم الموردين."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suppliers = data?.suppliers ?? [];
  const grand = data?.grandTotals;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return suppliers;

    return suppliers.filter((s) => {
      const name = (s.supplierName ?? "").toLowerCase();
      const code = (s.supplierCode ?? "").toLowerCase();
      return name.includes(needle) || code.includes(needle);
    });
  }, [suppliers, q]);

  const asOfLabel =
    data?.asOf &&
    data?.asOf &&
    formatDate(data.asOf);

  const handleRefresh = () => load(asOfDate);

  const handleExportCsv = () => {
    if (!data) return;
    if (typeof window === "undefined") return;

    const csv = buildSuppliersAgingCsv(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const today = new Date().toISOString().slice(0, 10);
    a.download = `suppliers-aging-${today}.csv`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openStatement = (supplierId: number) => {
    // ✅ نفتح كشف الحساب حتى تاريخ asOf تلقائيًا
    const to = asOfDate ? `?to=${encodeURIComponent(asOfDate)}` : "";
    navigate(`/suppliers/${supplierId}/statement${to}`);
  };

  return (
    <div
      className="flex flex-col h-full px-6 py-6 lg:px-10 lg:py-8 text-slate-100"
      dir="rtl"
    >
      {/* العنوان والأزرار */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">تقرير أعمار ذمم الموردين</h1>
          <p className="text-sm text-slate-400">
            توزيع أرصدة الموردين حسب فترات الاستحقاق (0-30، 31-60، ...).
          </p>
          {asOfLabel && (
            <p className="text-xs text-slate-500 mt-1">
              البيانات حتى تاريخ: <span>{asOfLabel}</span>
            </p>
          )}
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col text-xs">
            <label className="mb-1 text-slate-400">حتى تاريخ</label>
            <DatePicker
              date={asOfDate ? new Date(asOfDate) : undefined}
              onChange={(d) => setAsOfDate(d ? d.toISOString().slice(0, 10) : "")}
              className="border-slate-700 bg-slate-950/70 h-8 text-xs px-2"
            />
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl text-xs bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? "جاري التحديث..." : "تحديث"}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data}
            className="px-3 py-1.5 rounded-xl text-xs bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:opacity-60"
          >
            تصدير إلى Excel (CSV)
          </button>
        </div>
      </div>

      {/* بحث */}
      <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1 w-full md:max-w-[420px]">
            <label className="text-[11px] text-slate-400">
              بحث (اسم/كود المورد)
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="مثال: المتحدة أو SUP-01"
              className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs outline-none focus:border-emerald-400"
            />
          </div>

          <div className="text-[11px] text-slate-500">
            النتائج: <span className="text-slate-200">{filtered.length}</span>
          </div>
        </div>
      </div>

      {/* رسائل الخطأ */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-100">
          {error}
        </div>
      )}

      {/* كروت الملخص */}
      {grand && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-4 text-xs">
          <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3">
            <div className="text-slate-400 mb-1">0 - 30 يوم</div>
            <div className="text-emerald-300 font-semibold">
              LYD {formatMoney(grand.b0_30)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3">
            <div className="text-slate-400 mb-1">31 - 60 يوم</div>
            <div className="text-emerald-300 font-semibold">
              LYD {formatMoney(grand.b31_60)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3">
            <div className="text-slate-400 mb-1">61 - 90 يوم</div>
            <div className="text-emerald-300 font-semibold">
              LYD {formatMoney(grand.b61_90)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3">
            <div className="text-slate-400 mb-1">91 - 120 يوم</div>
            <div className="text-emerald-300 font-semibold">
              LYD {formatMoney(grand.b91_120)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3">
            <div className="text-slate-400 mb-1">أكثر من 120 يوم</div>
            <div className="text-emerald-300 font-semibold">
              LYD {formatMoney(grand.b121_plus)}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-500/60 bg-slate-900/70 p-3">
            <div className="text-amber-300 mb-1">إجمالي الرصيد</div>
            <div className="text-amber-300 font-semibold">
              LYD {formatMoney(grand.total)}
            </div>
          </div>
          <div className="rounded-2xl border border-sky-500/50 bg-slate-900/70 p-3">
            <div className="text-sky-300 mb-1">دفعات غير مربوطة</div>
            <div className="text-sky-300 font-semibold">
              LYD {formatMoney(Number(grand.unallocatedCredit ?? 0))}
            </div>
          </div>
        </div>
      )}

      {/* جدول الأعمار */}
      <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs overflow-auto">
        {loading && filtered.length === 0 ? (
          <div className="text-slate-400 text-xs">جارِ تحميل البيانات...</div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-500 text-xs">
            لا توجد أرصدة مستحقة على الموردين في التاريخ المحدد.
          </div>
        ) : (
          <table className="w-full text-[11px] text-right border-separate border-spacing-y-1 min-w-[1100px]">
            <thead className="text-slate-400">
              <tr>
                <th className="px-2 py-1">كود المورد</th>
                <th className="px-2 py-1">اسم المورد</th>
                <th className="px-2 py-1">0-30</th>
                <th className="px-2 py-1">31-60</th>
                <th className="px-2 py-1">61-90</th>
                <th className="px-2 py-1">91-120</th>
                <th className="px-2 py-1">+120</th>
                <th className="px-2 py-1">الإجمالي</th>
                <th className="px-2 py-1">غير مربوطة</th>
                <th className="px-2 py-1">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.supplierId}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl"
                >
                  <td className="px-2 py-1 align-top text-slate-300">
                    {s.supplierCode ?? "—"}
                  </td>
                  <td className="px-2 py-1 align-top text-slate-100">
                    {s.supplierName}
                  </td>
                  <td className="px-2 py-1 align-top text-emerald-300">
                    {formatMoney(s.b0_30)}
                  </td>
                  <td className="px-2 py-1 align-top text-emerald-300">
                    {formatMoney(s.b31_60)}
                  </td>
                  <td className="px-2 py-1 align-top text-emerald-300">
                    {formatMoney(s.b61_90)}
                  </td>
                  <td className="px-2 py-1 align-top text-emerald-300">
                    {formatMoney(s.b91_120)}
                  </td>
                  <td className="px-2 py-1 align-top text-emerald-300">
                    {formatMoney(s.b121_plus)}
                  </td>
                  <td className="px-2 py-1 align-top font-semibold text-amber-300">
                    {formatMoney(s.total)}
                  </td>
                  <td className="px-2 py-1 align-top text-sky-300">
                    {formatMoney(Number(s.unallocatedCredit ?? 0))}
                  </td>
                  <td className="px-2 py-1 align-top">
                    <button
                      type="button"
                      onClick={() => openStatement(s.supplierId)}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px]"
                    >
                      كشف الحساب
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
