import { useTranslation } from "react-i18next";
// src/pages/AccountingEntriesPage.tsx

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { useNavigate } from "react-router-dom";

// --- Types ---
interface EntryLine {
  id: number;
  debit: string;
  credit: string;
  description: string | null;
  account: { code: string; name: string };
}

interface AccountingEntry {
  id: number;
  entryDate: string;
  description: string | null;
  sourceModule: string;
  sourceId: number | null;
  lines: EntryLine[];
}

interface PaginationMeta {
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

const sourceColors: Record<string, string> = {
  BILLING: "bg-emerald-900/20 text-emerald-400 border-emerald-500/30",
  CASHIER: "bg-sky-900/20 text-sky-400 border-sky-500/30",
  INVENTORY: "bg-amber-900/20 text-amber-400 border-amber-500/30",
  MANUAL: "bg-slate-800 text-slate-300 border-slate-700",
};

export default function AccountingEntriesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const navigate = useNavigate();

  // Filters
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sourceModule, setSourceModule] = useState("");

  const {
    data,
    isLoading: loading,
    refetch: loadEntries,
  } = useQuery({
    queryKey: ["accounting-entries", page, fromDate, toDate, sourceModule],
    queryFn: async () => {
      const res = await apiClient.get("/accounting/entries", {
        params: {
          page,
          from: fromDate || undefined,
          to: toDate || undefined,
          sourceModule: sourceModule || undefined,
        },
      });
      return res.data;
    },
    meta: {
      errorMessage: t("accounting.entries.failedToLoadJournal", "فشل تحميل دفتر اليومية"),
    }
  });

  const entries: AccountingEntry[] = data?.items || [];
  const meta: PaginationMeta | null = data?.meta || null;

  const formatMoney = (val: any) =>
    Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 3 });

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-white">
            {t("accounting.entries.title", "سجل القيود المحاسبية (دفتر اليومية)")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t("accounting.entries.subtitle", "مراجعة وتدقيق القيود المحاسبية من جميع الأقسام.")}
          </p>
        </div>
        <button
          onClick={() => navigate("/accounting/manual-entry")}
          className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-2xl text-sm shadow-lg transition-all"
        >
          {t("accounting.entries.newManualEntry", "+ قيد يدوي جديد")}
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-3xl flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-500 font-bold mr-2">
            {t("accounting.entries.fromDate", "من تاريخ")}
          </label>
          <DatePicker
            date={fromDate ? new Date(fromDate) : undefined}
            onChange={(d) => {
              setFromDate(d ? d.toISOString().slice(0, 10) : "");
              setPage(1);
            }}
            className="bg-slate-950 border-slate-800 h-9 px-2 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-500 font-bold mr-2">
            {t("accounting.entries.toDate", "إلى تاريخ")}
          </label>
          <DatePicker
            date={toDate ? new Date(toDate) : undefined}
            onChange={(d) => {
              setToDate(d ? d.toISOString().slice(0, 10) : "");
              setPage(1);
            }}
            className="bg-slate-950 border-slate-800 h-9 px-2 text-xs"
          />
        </div>
        <div className="w-48 flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-500 font-bold mr-2">
            {t("accounting.entries.processSource", "مصدر العملية")}
          </label>
          <select
            className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs focus:border-sky-500 outline-none"
            value={sourceModule}
            onChange={(e) => {
              setSourceModule(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("accounting.entries.allSources", "كل المصادر")}</option>
            <option value="BILLING">{t("accounting.entries.billingAndClinics", "الفوترة والعيادات")}</option>
            <option value="CASHIER">{t("accounting.entries.treasuryAndCollection", "الخزينة والتحصيل")}</option>
            <option value="INVENTORY">{t("accounting.entries.inventoryAndPurchases", "المخزون والمشتريات")}</option>
            <option value="PAYROLL">{t("accounting.entries.salariesAndWages", "الرواتب والأجور")}</option>
            <option value="MANUAL">{t("accounting.entries.manualRestrictions", "القيود اليدوية")}</option>
          </select>
        </div>
        <button
          onClick={() => {
            setPage(1);
            loadEntries();
          }}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 transition-all mr-auto"
        >
          {t("accounting.entries.refreshResults", "تحديث النتائج")}
        </button>
      </div>

      {/* Entries Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
        {loading ? (
          <div className="text-center py-20 text-slate-500 animate-pulse">
            {t("accounting.entries.fetchingFinancialData", "جارِ جلب البيانات المالية...")}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20 text-slate-600 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
            {t("accounting.entries.noMatchingEntries", "لا توجد قيود مطابقة.")}
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 shadow-lg hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-sky-500/10 text-sky-400 px-3 py-1 rounded-xl text-xs font-black font-mono border border-sky-500/20">
                    #{entry.id.toString().padStart(6, "0")}
                  </div>
                  <div className="text-sm font-bold text-slate-200">
                    {formatDate(entry.entryDate)}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase ${sourceColors[entry.sourceModule] || sourceColors.MANUAL}`}
                  >
                    {entry.sourceModule}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 italic text-left md:text-right">
                  {entry.description || t("accounting.entries.noAdditionalDescription", "بدون وصف إضافي")}
                </div>
              </div>

              {/* Table inside Card */}
              <div className="overflow-hidden rounded-2xl border border-slate-800/50 bg-slate-950/30">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-900/80 text-slate-500 font-bold">
                    <tr>
                      <th className="px-4 py-2">{t("accounting.entries.theAccount", "الحساب")}</th>
                      <th className="px-4 py-2 text-center">{t("accounting.entries.debit", "مدين (Debit)")}</th>
                      <th className="px-4 py-2 text-center">{t("accounting.entries.credit", "دائن (Credit)")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {entry.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3">
                          <div className="text-slate-200 font-medium">
                            {line.account.name}
                          </div>
                          <div className="text-[10px] text-slate-600 font-mono">
                            [{line.account.code}]
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-emerald-400 font-bold">
                          {Number(line.debit) > 0
                            ? formatMoney(line.debit)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-rose-400 font-bold">
                          {Number(line.credit) > 0
                            ? formatMoney(line.credit)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      <div className="bg-slate-950/80 border-t border-slate-800 px-6 py-4 rounded-3xl flex justify-between items-center shadow-2xl">
        <div className="text-xs text-slate-500">
          {t("accounting.entries.totalEntries", "إجمالي القيود:")}{" "}
          <span className="text-white font-black">{meta?.totalCount ?? 0}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2 text-xs">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className="px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl disabled:opacity-20 hover:text-sky-400 transition-colors"
            >
              {t("accounting.entries.previous", "السابق")}
            </button>

            <div className="flex items-center px-4 text-slate-400">
              {t("accounting.entries.pageLabel", "صفحة")} <span className="text-sky-400 font-bold mx-2">{page}</span>{" "}
              {t("accounting.entries.ofLabel", "من")}{" "}
              <span className="text-white font-bold mx-2">
                {meta?.totalPages || 1}
              </span>
            </div>

            <button
              disabled={page >= (meta?.totalPages || 1) || loading}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl disabled:opacity-20 hover:text-sky-400 transition-colors"
            >
              {t("accounting.entries.next", "التالي")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


