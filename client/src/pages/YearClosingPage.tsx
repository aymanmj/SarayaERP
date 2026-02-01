// src/pages/YearClosingPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

type FinancialYearLite = {
  id: number;
  code: string;
  name: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  startDate: string;
  endDate: string;
};

type AccountLite = {
  id: number;
  code: string;
  name: string;
};

type CloseYearResult = {
  financialYearId: number;
  financialYearName: string;
  closingEntryId: number;
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
};

// Local formatDate removed, using import from @/lib/utils

export default function YearClosingPage() {
  const [year, setYear] = useState<FinancialYearLite | null>(null);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    null,
  );
  const [description, setDescription] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  async function loadData() {
    try {
      setLoading(true);

      // --- 1) جلب السنة الحالية (قد تكون null بعد الإقفال) ---
      const fyRes = await apiClient.get<FinancialYearLite | null>(
        "/financial-years/current",
      );

      const currentYear = fyRes.data ?? null;
      setYear(currentYear);

      if (!currentYear) {
        // مافيش سنة حالية مفتوحة
        // تقدر تظهر رسالة في أعلى الصفحة أو Toast
        // مثال:
        // toast.info("لا توجد سنة مالية حالية مفتوحة. يرجى إنشاء سنة جديدة وفتحها.");
      }

      // --- 2) حسابات حقوق الملكية (تعمل سواء فيه سنة أو لا) ---
      const accRes = await apiClient.get<{
        success: boolean;
        data: AccountLite[];
      }>("/accounting/equity-accounts");

      const accs = accRes.data.data;
      setAccounts(accs);

      // اختيار افتراضي لحساب الأرباح المحتجزة (لو فيه سنة حالية فقط)
      if (currentYear && accs.length > 0) {
        const preferred =
          accs.find(
            (a) => /p&l|أرباح|الخسائر/i.test(a.name + " " + (a.code ?? "")), // ✅ الأقواس هنا
          ) || accs[0];
        // const preferred =
        //   accs.find((a) =>
        //     /p&l|أرباح|الخسائر/i.test(a.name + " " + (a.code ?? "")),
        //   ) || accs[0];

        setSelectedAccountId(preferred ? preferred.id : null);
      } else {
        setSelectedAccountId(null);
      }
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل بيانات السنة المالية.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCloseYear() {
    if (!year) {
      toast.warning("لا توجد سنة مالية حالية.");
      return;
    }
    if (year.status !== "OPEN") {
      toast.warning("لا يمكن إقفال سنة غير مفتوحة.");
      return;
    }
    if (!selectedAccountId) {
      toast.warning("اختر حساب الأرباح المحتجزة أولاً.");
      return;
    }

    const ok = window.confirm(
      `هل أنت متأكد من إقفال السنة المالية ${year.name}؟\n` +
        "لن يُسمح بتسجيل قيود جديدة في هذه السنة بعد الإقفال.",
    );
    if (!ok) return;

    try {
      setClosing(true);
      const res = await apiClient.post<{
        success: boolean;
        data: CloseYearResult;
      }>(`/accounting/financial-years/${year.id}/close`, {
        retainedEarningsAccountId: selectedAccountId,
        description:
          description || `قيد إقفال السنة المالية ${year.code ?? ""}`.trim(),
      });

      const data = res.data.data;
      toast.success(
        `تم إقفال السنة المالية بنجاح.\n` +
          `إجمالي الإيرادات: ${data.totalRevenue.toFixed(3)} LYD\n` +
          `إجمالي المصروفات: ${data.totalExpense.toFixed(3)} LYD\n` +
          `صافي الربح/الخسارة: ${data.netProfit.toFixed(3)} LYD`,
      );

      // تحديث البيانات بعد الإقفال
      await loadData();
      setDescription("");
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      toast.error(
        typeof msg === "string" ? msg : "حدث خطأ أثناء إقفال السنة المالية.",
      );
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* العنوان */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">إقفال السنة المالية</h1>
          <p className="text-sm text-slate-400">
            إنشاء قيد إقفال لحسابات قائمة الدخل وتحويل صافي الربح/الخسارة إلى
            حساب الأرباح المحتجزة، ثم تغيير حالة السنة إلى (مقفلة).
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-xs"
        >
          تحديث
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
          جارِ تحميل البيانات...
        </div>
      )}

      {!loading && !year && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-2xl">
            📅
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-lg font-semibold text-slate-200 mb-2">
              لا توجد سنة مالية مفعلة حالياً
            </h3>
            <p className="text-sm mb-4">
              لإقفال السنة المالية، يجب أولاً تحديد السنة الحالية من صفحة إدارة
              السنوات المالية.
            </p>
            <a
              href="/financial-years"
              className="px-6 py-2 rounded-full bg-sky-600 hover:bg-sky-500 text-white text-sm inline-block transition"
            >
              الذهاب إلى السنوات المالية
            </a>
          </div>
        </div>
      )}

      {!loading && year && (
        <div className="space-y-4">
          {/* بطاقة السنة الحالية */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-slate-400 text-xs mb-1">
                السنة المالية الحالية
              </div>
              <div className="font-semibold text-slate-100">{year.name}</div>
              <div className="text-slate-500 text-xs">
                الكود: {year.code} • من {formatDate(year.startDate)} إلى{" "}
                {formatDate(year.endDate)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-slate-400 text-xs mb-1">الحالة</div>
              <span
                className={
                  "px-3 py-1 rounded-full text-xs " +
                  (year.status === "OPEN"
                    ? "bg-emerald-900/40 text-emerald-300"
                    : year.status === "CLOSED"
                      ? "bg-slate-800 text-slate-300"
                      : "bg-sky-900/40 text-sky-300")
                }
              >
                {year.status === "OPEN"
                  ? "مفتوحة"
                  : year.status === "CLOSED"
                    ? "مقفلة"
                    : "مسودة"}
              </span>
            </div>
          </div>

          {/* التحقق من المستندات المعلقة */}
          {year.status === "OPEN" && <PendingDocumentsCheck yearId={year.id} />}

          {/* اختيار حساب الأرباح المحتجزة + الوصف */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-slate-300 text-xs">
                  حساب الأرباح المحتجزة / P&L (حقوق ملكية)
                </label>
                <select
                  value={selectedAccountId ?? ""}
                  onChange={(e) =>
                    setSelectedAccountId(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                >
                  <option value="">اختر الحساب...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} – {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-300 text-xs">
                  وصف قيد الإقفال (اختياري)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                  placeholder={`قيد إقفال السنة المالية ${year.code ?? ""}`}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-400">
                قبل الإقفال، يُفضّل مراجعة ميزان المراجعة وقائمة الدخل
                والميزانية العمومية للتأكد من صحة الأرصدة.
              </p>
              <button
                type="button"
                onClick={handleCloseYear}
                disabled={closing || year.status !== "OPEN"}
                className="px-4 py-2 rounded-2xl text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white"
              >
                {closing
                  ? "جارِ إقفال السنة..."
                  : "إقفال السنة المالية الحالية"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingDocumentsCheck({ yearId }: { yearId: number }) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  async function check() {
    setLoading(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: any[] }>(
        `/accounting/financial-years/${yearId}/pending-documents`,
      );
      setDocuments(res.data.data);
      setChecked(true);
    } catch (err) {
      console.error(err);
      toast.error("فشل في التحقق من المستندات المعلقة.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    check();
  }, [yearId]);

  if (loading)
    return (
      <div className="text-xs text-slate-400 p-2">
        جارِ التحقق من جاهزية الإقفال...
      </div>
    );

  if (!checked) return null;

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
          ✓
        </div>
        <div>
          <div className="text-sm font-semibold text-emerald-200">
            السنة جاهزة للإقفال
          </div>
          <div className="text-xs text-emerald-400/70">
            لا توجد مستندات مسودة أو معلقة تمنع الإقفال.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
          !
        </div>
        <div>
          <div className="text-sm font-semibold text-amber-200">
            تنبيه: يوجد {documents.length} مستند معلق
          </div>
          <div className="text-xs text-amber-400/70">
            لا يمكن إقفال السنة حتى يتم ترحيل أو إلغاء هذه المستندات.
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-amber-300/60 uppercase border-b border-amber-500/20">
            <tr>
              <th className="px-2 py-1">النوع</th>
              <th className="px-2 py-1">المرجع</th>
              <th className="px-2 py-1">التاريخ</th>
              <th className="px-2 py-1 text-right">المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-500/10">
            {documents.map((doc, idx) => (
              <tr key={`${doc.type}-${doc.id}-${idx}`}>
                <td className="px-2 py-1.5 text-amber-100">{doc.type}</td>
                <td className="px-2 py-1.5 text-amber-200/80">
                  {doc.reference}
                </td>
                <td className="px-2 py-1.5 text-amber-200/60">
                  {formatDate(doc.date)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-amber-200">
                  {doc.amount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
