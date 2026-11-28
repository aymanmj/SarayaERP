import { useTranslation } from "react-i18next";
// src/pages/AccountingEntriesPage.tsx

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/apiClient";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { useNavigate } from "react-router-dom";
import { TreasuryReconciliationModal } from "@/components/accounting/TreasuryReconciliationModal";
import { BookOpen, Landmark, Plus, RefreshCw } from "lucide-react";
import { formatMoney as formatLydMoney } from "../utils/money";
import {
  SarayaFilterSelect,
  SarayaLtrBadge,
  SarayaPageHeader,
} from "@/components/ui/SarayaPrimitives";

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
  const [treasuryModalOpen, setTreasuryModalOpen] = useState(false);

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
      errorMessage: t(
        "accounting.entries.failedToLoadJournal",
        "فشل تحميل دفتر اليومية",
      ),
    },
  });

  const entries: AccountingEntry[] = data?.items || [];
  const meta: PaginationMeta | null = data?.meta || null;

  const formatMoney = (val: string | number | null | undefined) =>
    formatLydMoney(val, false);

  return (
    <div
      className="flex flex-col h-full text-slate-100 space-y-4"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <SarayaPageHeader
        title={t("accounting.entries.title", "سجل القيود المحاسبية (دفتر اليومية)")}
        subtitle={t(
          "accounting.entries.subtitle",
          "مراجعة وتدقيق القيود المحاسبية من جميع الأقسام.",
        )}
        icon={<BookOpen className="w-6 h-6" />}
        actions={
          <>
            <button
              type="button"
              onClick={() => setTreasuryModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Landmark className="w-4 h-4" />
              {t(
                "accounting.entries.treasuryAndBankRecon",
                "العملات والتسوية البنكية",
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate("/accounting/manual-entry")}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-extrabold rounded-xl text-xs shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t("accounting.entries.newManualEntry", "قيد يدوي جديد")}
            </button>
          </>
        }
      />

      {/* Filters Bar */}
      <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl flex flex-wrap gap-3 items-end shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-400 font-bold">
            {t("accounting.entries.fromDate", "من تاريخ")}
          </label>
          <DatePicker
            date={fromDate ? new Date(fromDate) : undefined}
            onChange={(d) => {
              setFromDate(d ? d.toISOString().slice(0, 10) : "");
              setPage(1);
            }}
            className="bg-slate-950 border-slate-700 h-9 px-2 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-400 font-bold">
            {t("accounting.entries.toDate", "إلى تاريخ")}
          </label>
          <DatePicker
            date={toDate ? new Date(toDate) : undefined}
            onChange={(d) => {
              setToDate(d ? d.toISOString().slice(0, 10) : "");
              setPage(1);
            }}
            className="bg-slate-950 border-slate-700 h-9 px-2 text-xs"
          />
        </div>
        <div className="w-52 flex flex-col gap-1">
          <label className="text-[11px] text-slate-400 font-bold">
            {t("accounting.entries.processSource", "مصدر العملية")}
          </label>
          <SarayaFilterSelect
            value={sourceModule}
            onChange={(val) => {
              setSourceModule(val);
              setPage(1);
            }}
            options={[
              {
                value: "BILLING",
                label: t(
                  "accounting.entries.billingAndClinics",
                  "الفوترة والعيادات",
                ),
              },
              {
                value: "CASHIER",
                label: t(
                  "accounting.entries.treasuryAndCollection",
                  "الخزينة والتحصيل",
                ),
              },
              {
                value: "INVENTORY",
                label: t(
                  "accounting.entries.inventoryAndPurchases",
                  "المخزون والمشتريات",
                ),
              },
              {
                value: "PAYROLL",
                label: t(
                  "accounting.entries.salariesAndWages",
                  "الرواتب والأجور",
                ),
              },
              {
                value: "MANUAL",
                label: t(
                  "accounting.entries.manualRestrictions",
                  "القيود اليدوية",
                ),
              },
            ]}
            placeholder={t("accounting.entries.allSources", "كل المصادر")}
            allLabel={t("accounting.entries.allSources", "كل المصادر")}
            ariaLabel={t("accounting.entries.processSource", "مصدر العملية")}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            loadEntries();
          }}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-xs font-bold border border-slate-700 transition-colors flex items-center gap-1.5 mr-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {t("accounting.entries.refreshResults", "تحديث النتائج")}
        </button>
      </div>

      {/* Entries Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
        {loading ? (
          <div className="text-center py-20 text-slate-500 animate-pulse">
            {t(
              "accounting.entries.fetchingFinancialData",
              "جارِ جلب البيانات المالية...",
            )}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-slate-500 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-sm">
            {t("accounting.entries.noMatchingEntries", "لا توجد قيود مطابقة.")}
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 gap-2">
                <div className="flex items-center gap-2.5">
                  <SarayaLtrBadge className="bg-sky-500/10 text-sky-400 px-2.5 py-0.5 rounded-lg text-xs font-black border border-sky-500/25">
                    #{entry.id.toString().padStart(6, "0")}
                  </SarayaLtrBadge>
                  <div
                    dir="ltr"
                    className="text-xs font-bold font-mono text-slate-200 tabular-nums"
                  >
                    {formatDate(entry.entryDate)}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase ${sourceColors[entry.sourceModule] || sourceColors.MANUAL}`}
                  >
                    {entry.sourceModule}
                  </span>
                </div>
                <div className="text-xs text-slate-400 text-left md:text-right">
                  {entry.description ||
                    t(
                      "accounting.entries.noAdditionalDescription",
                      "بدون وصف إضافي",
                    )}
                </div>
              </div>

              {/* Table inside Card */}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-950/70 text-slate-400 font-bold border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">
                        {t("accounting.entries.theAccount", "الحساب")}
                      </th>
                      <th className="px-4 py-2.5 text-center">
                        {t("accounting.entries.debit", "مدين (Debit)")}
                      </th>
                      <th className="px-4 py-2.5 text-center">
                        {t("accounting.entries.credit", "دائن (Credit)")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {entry.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-2.5">
                          <div className="text-slate-100 font-semibold">
                            {line.account.name}
                          </div>
                          <SarayaLtrBadge className="text-[10px] text-slate-400 mt-0.5">
                            [{line.account.code}]
                          </SarayaLtrBadge>
                        </td>
                        <td className="px-4 py-2.5 text-center text-emerald-400 font-bold">
                          <span dir="ltr" className="font-mono tabular-nums">
                            {Number(line.debit) > 0
                              ? formatMoney(line.debit)
                              : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-rose-400 font-bold">
                          <span dir="ltr" className="font-mono tabular-nums">
                            {Number(line.credit) > 0
                              ? formatMoney(line.credit)
                              : "—"}
                          </span>
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
      <div className="bg-slate-900/80 border border-slate-800 px-5 py-3 rounded-xl flex justify-between items-center shadow-sm">
        <div className="text-xs text-slate-400">
          {t("accounting.entries.totalEntries", "إجمالي القيود:")}{" "}
          <span className="text-slate-100 font-black tabular-nums">
            {meta?.totalCount ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2 text-xs">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className="px-3.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl disabled:opacity-30 hover:text-sky-400 transition-colors cursor-pointer"
            >
              {t("accounting.entries.previous", "السابق")}
            </button>

            <div className="flex items-center px-3 text-slate-400 tabular-nums">
              {t("accounting.entries.pageLabel", "صفحة")}{" "}
              <span className="text-sky-400 font-bold mx-1.5">{page}</span>{" "}
              {t("accounting.entries.ofLabel", "من")}{" "}
              <span className="text-slate-100 font-bold mx-1.5">
                {meta?.totalPages || 1}
              </span>
            </div>

            <button
              disabled={page >= (meta?.totalPages || 1) || loading}
              onClick={() => setPage((p) => p + 1)}
              className="px-3.5 py-1.5 bg-slate-950 border border-slate-700 rounded-xl disabled:opacity-30 hover:text-sky-400 transition-colors cursor-pointer"
            >
              {t("accounting.entries.next", "التالي")}
            </button>
          </div>
        </div>
      </div>

      <TreasuryReconciliationModal
        open={treasuryModalOpen}
        onClose={() => setTreasuryModalOpen(false)}
      />
    </div>
  );
}
