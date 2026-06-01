import { useTranslation } from "react-i18next";
// src/pages/IncomeStatementPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { toast } from "sonner";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

// --- Types ---
type IncomeStatementRowDto = {
  accountId: number;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  net: number;
};

type IncomeStatementDto = {
  financialYearId?: number | null;
  fromDate: string;
  toDate: string;
  revenues: IncomeStatementRowDto[];
  expenses: IncomeStatementRowDto[];
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
};

type FinancialYearLite = {
  id: number;
  code: string;
  name: string;
  status: "OPEN" | "CLOSED" | "DRAFT";
  isCurrent: boolean;
  startDate: string;
  endDate: string;
};

type CostCenterLite = { id: number; name: string; code: string };

// Local formatDate removed

export default function IncomeStatementPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState<FinancialYearLite | null>(null);
  const [data, setData] = useState<IncomeStatementDto | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenterLite[]>([]);

  // Filters
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>(""); // ✅ الفلتر الجديد

  const navigate = useNavigate();

  // تحميل البيانات الأولية
  useEffect(() => {
    apiClient
      .get<CostCenterLite[]>("/accounting/cost-centers")
      .then((res) => setCostCenters(res.data))
      .catch(console.error);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      // 1️⃣ جلب السنوات المالية
      const yearsRes =
        await apiClient.get<FinancialYearLite[]>("/financial-years");
      const allYears = yearsRes.data || [];

      // تحديد السنة المستهدفة
      let targetYear = allYears.find((y) => y.isCurrent && y.status === "OPEN");
      if (!targetYear) targetYear = allYears.find((y) => y.status === "OPEN");
      if (!targetYear && allYears.length > 0) targetYear = allYears[0];

      if (!targetYear) {
        setYear(null);
        setError(t("accounting.incomeStatement.noFiscalYearsDefined", "لا توجد سنوات مالية معرفة."));
        setLoading(false);
        return;
      }

      setYear(targetYear);

      // 2️⃣ إعداد الباراميترات
       
      const params: any = {
        financialYearId: targetYear.id,
      };

      if (fromFilter) params.from = fromFilter;
      if (toFilter) params.to = toFilter;
      if (selectedCostCenter) params.costCenterId = selectedCostCenter; // ✅ إرسال الفلتر

      // 3️⃣ جلب التقرير
      const incRes = await apiClient.get<IncomeStatementDto>(
        "/accounting/income-statement",
        { params },
      );

      setData(incRes.data);
     
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message || t("accounting.incomeStatement.errorLoadingData", "حدث خطأ أثناء تحميل القائمة.");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function openLedgerFor(row: IncomeStatementRowDto) {
    if (!data) return;
    const params = new URLSearchParams();
    params.set("accountId", String(row.accountId));
    if (data.fromDate) params.set("from", data.fromDate.slice(0, 10));
    if (data.toDate) params.set("to", data.toDate.slice(0, 10));
    // لا نمرر مركز التكلفة لدفتر الأستاذ حالياً، إلا إذا قمت بتحديث صفحة دفتر الأستاذ لدعمه
    navigate(`/accounting/ledger?${params.toString()}`);
  }

  const fmtMoney = (val: number) =>
    val.toLocaleString("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("accounting.incomeStatement.incomeAndProfitabilityStatement", "قائمة الدخل والربحية")}</h1>
          <p className="text-sm text-slate-400">
            {t("accounting.incomeStatement.description", "تحليل الإيرادات والمصروفات وصافي الربح (P&L) على مستوى المستشفى أو الأقسام.")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {year && (
            <div className="text-right text-sm bg-slate-900 px-3 py-1 rounded-xl border border-slate-800">
              <div className="text-slate-300 font-semibold">{year.name}</div>
              <div className="text-slate-500 text-[10px]">
                {year.status === "OPEN" ? t("accounting.incomeStatement.open", "🟢 مفتوحة") : t("accounting.incomeStatement.closed", "🔴 مغلقة")} •{" "}
                {year.code}
              </div>
            </div>
          )}
          <button
            onClick={load}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold transition"
          >
            {t("accounting.incomeStatement.refresh", "تحديث")}
          </button>
          {data && (
            <button
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg"
            >
              {t("accounting.incomeStatement.printReport", "طباعة التقرير")}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-bold">{t("accounting.incomeStatement.fromHistory", "من تاريخ")}</label>
          <DatePicker
            date={fromFilter ? new Date(fromFilter) : undefined}
            onChange={(d) => setFromFilter(d ? d.toISOString().slice(0, 10) : "")}
            className="bg-slate-950 border-slate-700 h-9 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-bold">{t("accounting.incomeStatement.toDate", "إلى تاريخ")}</label>
          <DatePicker
            date={toFilter ? new Date(toFilter) : undefined}
            onChange={(d) => setToFilter(d ? d.toISOString().slice(0, 10) : "")}
            className="bg-slate-950 border-slate-700 h-9 text-sm"
          />
        </div>

        {/* ✅ فلتر مركز التكلفة */}
        <div className="flex flex-col gap-1 w-56">
          <label className="text-xs text-slate-400 font-bold">
            {t("accounting.incomeStatement.costCenterOrDepartment", "مركز التكلفة / القسم")}
          </label>
          <select
            value={selectedCostCenter}
            onChange={(e) => setSelectedCostCenter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-sky-500 outline-none"
          >
            <option value="">{t("accounting.incomeStatement.theEntireOrganizationAll", "-- المؤسسة بالكامل (All) --")}</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.name} ({cc.code})
              </option>
            ))}
          </select>
        </div>

        <div className="mr-auto flex gap-2">
          <button
            onClick={load}
            className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition"
            disabled={loading}
          >
            {t("accounting.incomeStatement.viewReport", "عرض التقرير")}
          </button>
          {(fromFilter || toFilter || selectedCostCenter) && (
            <button
              onClick={() => {
                setFromFilter("");
                setToFilter("");
                setSelectedCostCenter("");
                setTimeout(load, 50);
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs transition"
            >
              {t("accounting.incomeStatement.clear", "مسح")}
            </button>
          )}
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-300 flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={() => navigate("/financial-years")}
            className="underline hover:text-white"
          >
            {t("accounting.incomeStatement.configureYears", "إعداد السنوات")}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center text-slate-500 animate-pulse">
          {t("accounting.incomeStatement.analyzingFinancialData", "جاري تحليل البيانات المالية...")}
        </div>
      )}

      {!loading && data && (
        <div className="flex flex-col lg:flex-row gap-6 pb-6 overflow-hidden flex-1 min-h-0">
          {/* الجداول (يسار) */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
            {/* الإيرادات */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-emerald-400 mb-3 border-b border-slate-800 pb-2">
                {t("accounting.incomeStatement.revenues", "الإيرادات (Revenues)")}
              </h3>
              {data.revenues.length === 0 ? (
                <p className="text-center text-slate-500 text-xs py-4">
                  {t("accounting.incomeStatement.noRevenuesInPeriod", "لا توجد إيرادات في هذه الفترة.")}
                </p>
              ) : (
                <table className="w-full text-xs text-right">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-2">{t("accounting.incomeStatement.code", "الكود")}</th>
                      <th className="pb-2">{t("accounting.incomeStatement.theAccount", "الحساب")}</th>
                      <th className="pb-2">{t("accounting.incomeStatement.net", "الصافي")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenues.map((r) => (
                      <tr
                        key={r.accountId}
                        onClick={() => openLedgerFor(r)}
                        className="cursor-pointer hover:bg-slate-800/50 border-b border-slate-800/50 last:border-0"
                      >
                        <td className="py-2 text-slate-400 font-mono">
                          {r.code}
                        </td>
                        <td className="py-2 text-slate-200">{r.name}</td>
                        <td className="py-2 text-emerald-300 font-bold">
                          {fmtMoney(r.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* المصروفات */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-rose-400 mb-3 border-b border-slate-800 pb-2">
                {t("accounting.incomeStatement.expenses", "المصروفات (Expenses)")}
              </h3>
              {data.expenses.length === 0 ? (
                <p className="text-center text-slate-500 text-xs py-4">
                  {t("accounting.incomeStatement.noExpensesInPeriod", "لا توجد مصروفات في هذه الفترة.")}
                </p>
              ) : (
                <table className="w-full text-xs text-right">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-2">{t("accounting.incomeStatement.code", "الكود")}</th>
                      <th className="pb-2">{t("accounting.incomeStatement.theAccount", "الحساب")}</th>
                      <th className="pb-2">{t("accounting.incomeStatement.net", "الصافي")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.map((r) => (
                      <tr
                        key={r.accountId}
                        onClick={() => openLedgerFor(r)}
                        className="cursor-pointer hover:bg-slate-800/50 border-b border-slate-800/50 last:border-0"
                      >
                        <td className="py-2 text-slate-400 font-mono">
                          {r.code}
                        </td>
                        <td className="py-2 text-slate-200">{r.name}</td>
                        <td className="py-2 text-rose-300 font-bold">
                          {fmtMoney(r.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* الملخص (يمين - ثابت) */}
          <div className="lg:w-80 flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-lg">
              <h2 className="text-lg font-bold text-white mb-6 text-center">
                {t("accounting.incomeStatement.resultsSummary", "ملخص النتائج")}
              </h2>

              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-slate-400 text-xs">
                    {t("accounting.incomeStatement.totalRevenues", "إجمالي الإيرادات")}
                  </span>
                  <span className="text-emerald-400 font-bold text-lg">
                    {fmtMoney(data.totalRevenue)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-slate-400 text-xs">
                    {t("accounting.incomeStatement.totalExpenses", "إجمالي المصروفات")}
                  </span>
                  <span className="text-rose-400 font-bold text-lg">
                    ({fmtMoney(data.totalExpense)})
                  </span>
                </div>

                <div className="pt-2">
                  <div className="text-slate-300 text-sm mb-1 text-center font-bold">
                    {t("accounting.incomeStatement.netProfitLoss", "صافي الربح / الخسارة")}
                  </div>
                  <div
                    className={`text-3xl font-black text-center ${data.netProfit >= 0 ? "text-sky-400" : "text-rose-500"}`}
                  >
                    {fmtMoney(data.netProfit)}{" "}
                    <span className="text-sm font-normal text-slate-500">
                      LYD
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 leading-relaxed">
              ℹ️ <strong>{t("accounting.incomeStatement.note", "ملاحظة:")}</strong>
              <br />
              {t("accounting.incomeStatement.accrualNote", "هذا التقرير يعكس الأداء المالي بناءً على الاستحقاق (Accrual Basis). للاطلاع على التدفق النقدي الفعلي، يرجى مراجعة تقرير الخزينة.")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
