import { useTranslation } from "react-i18next";
// src/pages/TrialBalancePage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { DatePicker } from "@/components/ui/date-picker";

type TrialBalanceRow = {
  accountId: number;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
};

type TrialBalanceResponse = {
  rows: TrialBalanceRow[];
  totals: {
    totalDebit: number;
    totalCredit: number;
  };
};

// نفس DTO المستخدم في شاشات أخرى
type FinancialYearDto = {
  id: number;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED" | "ARCHIVED";
};

function formatMoney(v: number) {
  const num = Number(v ?? 0);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

// 🔗 دالة مساعدة لبناء رابط دفتر الأستاذ
function buildLedgerUrl(accountId: number, fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  params.set("accountId", String(accountId));
  if (fromDate) params.set("from", fromDate);
  if (toDate) params.set("to", toDate);
  return `/accounting/ledger?${params.toString()}`;
}

export default function TrialBalancePage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const navigate = useNavigate();

  const [years, setYears] = useState<FinancialYearDto[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [data, setData] = useState<TrialBalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // تحميل ميزان المراجعة
  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
       
      const params: any = {};
      if (selectedYearId) params.financialYearId = selectedYearId;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;

      const res = await apiClient.get<TrialBalanceResponse>(
        "/accounting/trial-balance",
        { params }
      );
      setData(res.data);
     
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        t("accounting.trialBalance.errorLoadingTrialBalance", "حدث خطأ أثناء تحميل ميزان المراجعة.");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // أول تحميل للميزان (بدون فلاتر أو حسب ما يدعمه الـ backend)
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحميل السنوات المالية وضبط السنة المفتوحة كافتراضي
  useEffect(() => {
    async function loadYears() {
      try {
        const res = await apiClient.get<FinancialYearDto[]>("/financial-years");
        setYears(res.data);

        const openYear = res.data.find((y) => y.status === "OPEN");
        if (openYear) {
          setSelectedYearId(openYear.id);
          setFromDate(openYear.startDate.substring(0, 10));
          setToDate(openYear.endDate.substring(0, 10));
        }
      } catch (err) {
        console.error("error loading financial years", err);
        // ممكن لاحقاً نعرض رسالة لو حبيت
      }
    }

    loadYears();
  }, []);

  const totalsDebit = data?.totals.totalDebit ?? 0;
  const totalsCredit = data?.totals.totalCredit ?? 0;
  const diff = totalsDebit - totalsCredit;

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* الهيدر */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("accounting.trialBalance.trialBalance", "ميزان المراجعة")}</h1>
          <p className="text-sm text-slate-400">
            {t("accounting.trialBalance.desc", "استعراض أرصدة الحسابات حسب الفترة الزمنية، مع إمكانية فتح دفتر الأستاذ لكل حساب.")}
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-xs"
        >
          {t("accounting.trialBalance.refresh", "تحديث")}
        </button>
      </div>

      {/* رسالة خطأ إن وجدت */}
      {error && (
        <div className="mb-4 text-sm text-rose-300 bg-rose-950/40 border border-rose-700/60 rounded-xl px-4 py-2">
          {error}
        </div>
      )}

      {/* فلاتر التاريخ + السنة المالية */}
      <div className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs items-end">
          {/* السنة المالية */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">{t("accounting.trialBalance.fiscalYear", "السنة المالية")}</label>
            <select
              value={selectedYearId ?? ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                setSelectedYearId(val);
                const year = years.find((y) => y.id === val);
                if (year) {
                  setFromDate(year.startDate.substring(0, 10));
                  setToDate(year.endDate.substring(0, 10));
                }
              }}
              className="bg-slate-900/80 border border-slate-700 rounded-2xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
            >
              <option value="">{t("accounting.trialBalance.allYears", "كل السنوات")}</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.code} — {y.name}
                </option>
              ))}
            </select>
          </div>

          {/* من تاريخ */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">{t("accounting.trialBalance.fromHistory", "من تاريخ")}</label>
            <DatePicker
              date={fromDate ? new Date(fromDate) : undefined}
              onChange={(d) => setFromDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-900/80 border-slate-700 h-9 px-2"
            />
          </div>

          {/* إلى تاريخ */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">{t("accounting.trialBalance.toDate", "إلى تاريخ")}</label>
            <DatePicker
              date={toDate ? new Date(toDate) : undefined}
              onChange={(d) => setToDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-900/80 border-slate-700 h-9 px-2"
            />
          </div>

          {/* زر {t("accounting.trialBalance.applyFilter", "تطبيق الفلتر")} */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadData}
              className="mt-auto px-4 py-2 rounded-full text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {t("accounting.trialBalance.applyFilter", "تطبيق الفلتر")}
            </button>
          </div>
        </div>
      </div>

      {/* كروت ملخص الميزان */}
      {data && data.rows.length > 0 && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-3">
            <div className="text-slate-400 mb-1">{t("accounting.trialBalance.totalDebit", "إجمالي المدين")}</div>
            <div className="text-lg font-semibold text-emerald-300">
              LYD {formatMoney(totalsDebit)}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-3">
            <div className="text-slate-400 mb-1">{t("accounting.trialBalance.totalCredit", "إجمالي الدائن")}</div>
            <div className="text-lg font-semibold text-rose-300">
              LYD {formatMoney(totalsCredit)}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-3">
            <div className="text-slate-400 mb-1">
              {t("accounting.trialBalance.difference", "الفرق (يُفضّل أن يكون 0.000)")}
            </div>
            <div
              className={
                "text-lg font-semibold " +
                (Math.abs(diff) < 0.0005 ? "text-sky-300" : "text-amber-300")
              }
            >
              LYD {formatMoney(diff)}
            </div>
          </div>
        </div>
      )}

      {/* الجدول */}
      <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 overflow-auto">
        {loading && (
          <div className="text-xs text-slate-400 mb-3">
            {t("accounting.trialBalance.loading", "جارِ تحميل ميزان المراجعة...")}
          </div>
        )}

        {!loading && (!data || data.rows.length === 0) ? (
          <div className="py-8 text-center text-xs text-slate-500">
            {t("accounting.trialBalance.noTransactions", "لا توجد حركات في الفترة المحددة.")}
          </div>
        ) : (
          data && (
            <table className="w-full text-[11px] text-right border-separate border-spacing-y-1">
              <thead>
                <tr className="text-slate-400">
                  <th className="px-2 py-1 text-right">{t("accounting.trialBalance.code", "الكود")}</th>
                  <th className="px-2 py-1 text-right">{t("accounting.trialBalance.accountName", "اسم الحساب")}</th>
                  <th className="px-2 py-1 text-right">{t("accounting.trialBalance.debtor", "مدين")}</th>
                  <th className="px-2 py-1 text-right">{t("accounting.trialBalance.creditor", "دائن")}</th>
                  <th className="px-2 py-1 text-right">{t("accounting.trialBalance.balanceDebitCredit", "الرصيد (مدين - دائن)")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const goLedger = () =>
                    navigate(
                      buildLedgerUrl(
                        row.accountId,
                        fromDate || undefined,
                        toDate || undefined
                      )
                    );

                  return (
                    <tr
                      key={row.accountId}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl"
                    >
                      <td
                        className="py-2 px-2 text-emerald-300 cursor-pointer hover:underline"
                        onClick={goLedger}
                      >
                        {row.code}
                      </td>
                      <td
                        className="px-2 py-1 cursor-pointer hover:text-emerald-200"
                        onClick={goLedger}
                      >
                        {row.name}
                      </td>
                      <td className="px-2 py-1 text-emerald-300">
                        {formatMoney(row.debit)}
                      </td>
                      <td className="px-2 py-1 text-rose-300">
                        {formatMoney(row.credit)}
                      </td>
                      <td
                        className={
                          "px-2 py-1 " +
                          (row.balance >= 0
                            ? "text-emerald-300"
                            : "text-rose-300")
                        }
                      >
                        {formatMoney(row.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-slate-200 font-semibold">
                  <td className="px-2 py-2" colSpan={2}>
                    {t("accounting.trialBalance.total", "الإجمالي")}
                  </td>
                  <td className="px-2 py-2 text-emerald-300">
                    {formatMoney(totalsDebit)}
                  </td>
                  <td className="px-2 py-2 text-rose-300">
                    {formatMoney(totalsCredit)}
                  </td>
                  <td className="px-2 py-2">{formatMoney(diff)}</td>
                </tr>
              </tfoot>
            </table>
          )
        )}
      </div>
    </div>
  );
}
