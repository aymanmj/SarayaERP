// src/pages/AccountingJournalPage.tsx

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import type {
  JournalEntrySummary,
  JournalEntryDetail,
  JournalListResponse,
} from "../types/accountingJournal";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiOk<T> | ApiErr;

const PAGE_SIZE = 50;

const AccountingJournalPage = () => {
  const [entries, setEntries] = useState<JournalEntrySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [sourceModule, setSourceModule] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  const [loading, setLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntryDetail | null>(
    null
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  const loadEntries = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ApiResponse<JournalListResponse>>(
        "/accounting/journal",
        {
          params: {
            from: fromDate || undefined,
            to: toDate || undefined,
            sourceModule: sourceModule || undefined,
            userId: userId || undefined,
            page,
            pageSize: PAGE_SIZE,
          },
        }
      );

      if (res.data.success) {
        setEntries(res.data.data.items);
        setTotal(res.data.data.total);
      } else {
        toast.error(res.data.error.message);
      }
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل دفتر اليومية.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleApplyFilter = () => {
    setPage(1);
    loadEntries();
  };

  const openEntryDetail = async (entryId: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setSelectedEntry(null);
    try {
      const res = await apiClient.get<ApiResponse<JournalEntryDetail>>(
        `/accounting/journal/${entryId}`
      );
      if (res.data.success) {
        setSelectedEntry(res.data.data);
      } else {
        toast.error(res.data.error.message);
      }
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل تفاصيل القيد.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!entries.length) {
      toast.info("لا توجد بيانات لتصديرها.");
      return;
    }

    const header = [
      "رقم القيد",
      "التاريخ",
      "الوصف",
      "المصدر",
      "المرجع",
      "إجمالي مدين",
      "إجمالي دائن",
      "المستخدم",
    ];

    const rows = entries.map((e) => [
      e.entryNo,
      formatDate(e.date),
      e.description ?? "",
      e.sourceModule,
      e.reference ?? "",
      e.totalDebit.toFixed(3),
      e.totalCredit.toFixed(3),
      e.createdByName,
    ]);

    const csvContent =
      "\uFEFF" +
      [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-white">
          دفتر اليومية العامة
        </h1>

        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded bg-slate-700 text-sm text-white"
            onClick={handleExportCsv}
          >
            تصدير CSV
          </button>
        </div>
      </div>

      {/* الفلاتر */}
      <div className="bg-slate-900/60 rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs mb-1 text-slate-300">من تاريخ</label>
          <DatePicker
            date={fromDate ? new Date(fromDate) : undefined}
            onChange={(d) => {
              if (d) {
                const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                setFromDate(localDate);
              } else {
                setFromDate("");
              }
            }}
            className="text-slate-100 h-9"
          />
        </div>

        <div>
          <label className="block text-xs mb-1 text-slate-300">إلى تاريخ</label>
          <DatePicker
            date={toDate ? new Date(toDate) : undefined}
            onChange={(d) => {
              if (d) {
                const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                setToDate(localDate);
              } else {
                setToDate("");
              }
            }}
            className="text-slate-100 h-9"
          />
        </div>

        <div>
          <label className="block text-xs mb-1 text-slate-300">المصدر</label>
          <select
            className="bg-slate-800 text-slate-100 rounded px-3 py-2 text-sm min-w-[160px]"
            value={sourceModule}
            onChange={(e) => setSourceModule(e.target.value)}
          >
            <option value="">الكل</option>
            <option value="BILLING">الفوترة</option>
            <option value="PHARMACY">الصيدلية</option>
            <option value="CASHIER">الخزينة</option>
            <option value="INVENTORY">المخزون</option>
            <option value="MANUAL">قيود يدوية</option>
            {/* أضف باقي الـ enums الموجودة عندك */}
          </select>
        </div>

        <div>
          <label className="block text-xs mb-1 text-slate-300">
            المستخدم (اختياري)
          </label>
          <input
            type="number"
            className="bg-slate-800 text-slate-100 rounded px-3 py-2 text-sm w-32"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="UserId"
          />
        </div>

        <button
          className="ml-auto px-4 py-2 rounded bg-emerald-600 text-white text-sm font-semibold"
          onClick={handleApplyFilter}
          disabled={loading}
        >
          {loading ? "جاري التحميل..." : "تطبيق الفلتر"}
        </button>
      </div>

      {/* الجدول */}
      <div className="bg-slate-900/60 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-right text-slate-200">
          <thead className="bg-slate-800 text-xs uppercase">
            <tr>
              <th className="px-3 py-2">رقم القيد</th>
              <th className="px-3 py-2">التاريخ</th>
              <th className="px-3 py-2">الوصف</th>
              <th className="px-3 py-2">المصدر</th>
              <th className="px-3 py-2">المرجع</th>
              <th className="px-3 py-2">إجمالي مدين</th>
              <th className="px-3 py-2">إجمالي دائن</th>
              <th className="px-3 py-2">المستخدم</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center text-slate-400 py-6 text-sm"
                >
                  لا توجد قيود في الفترة المحددة.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={8} className="text-center py-6 text-slate-400">
                  جاري التحميل...
                </td>
              </tr>
            )}

            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-t border-slate-800 hover:bg-slate-800/60 cursor-pointer"
                onClick={() => openEntryDetail(e.id)}
              >
                <td className="px-3 py-2 font-mono text-emerald-300">
                  {e.entryNo}
                </td>
                <td className="px-3 py-2">
                  {formatDate(e.date)}
                </td>
                <td className="px-3 py-2">{e.description}</td>
                <td className="px-3 py-2 text-xs">{e.sourceModule}</td>
                <td className="px-3 py-2">{e.reference}</td>
                <td className="px-3 py-2 text-emerald-300">
                  {e.totalDebit.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-amber-300">
                  {e.totalCredit.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-xs">{e.createdByName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* الباجينغ */}
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>
          الصفحة {page} من {totalPages} (إجمالي {total} قيد)
        </span>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded bg-slate-800 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            السابق
          </button>
          <button
            className="px-3 py-1 rounded bg-slate-800 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            التالي
          </button>
        </div>
      </div>

      {/* مودال تفاصيل القيد */}
      {detailOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-white">تفاصيل القيد</h2>
              <button
                className="text-slate-400 hover:text-white"
                onClick={() => setDetailOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-auto">
              {detailLoading && (
                <div className="text-center text-slate-400 py-4">
                  جاري تحميل تفاصيل القيد...
                </div>
              )}

              {!detailLoading && selectedEntry && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 text-sm text-slate-200">
                    <div>
                      <div className="text-xs text-slate-400">رقم القيد</div>
                      <div className="font-mono text-emerald-300">
                        {selectedEntry.entryNo}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">التاريخ</div>
                      <div>{new Date(selectedEntry.date).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">المصدر</div>
                      <div>{selectedEntry.sourceModule}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">المرجع</div>
                      <div>{selectedEntry.reference}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">المستخدم</div>
                      <div>{selectedEntry.createdByName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">الوصف العام</div>
                      <div>{selectedEntry.description}</div>
                    </div>
                  </div>

                  <table className="w-full text-xs text-right text-slate-200">
                    <thead className="bg-slate-800">
                      <tr>
                        <th className="px-2 py-1">#</th>
                        <th className="px-2 py-1">رقم الحساب</th>
                        <th className="px-2 py-1">اسم الحساب</th>
                        <th className="px-2 py-1">مدين</th>
                        <th className="px-2 py-1">دائن</th>
                        <th className="px-2 py-1">ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntry.lines.map((l) => (
                        <tr
                          key={`${l.lineNo}-${l.accountId}`}
                          className="border-t border-slate-800"
                        >
                          <td className="px-2 py-1">{l.lineNo}</td>
                          <td className="px-2 py-1 font-mono">
                            {l.accountCode}
                          </td>
                          <td className="px-2 py-1">{l.accountName}</td>
                          <td className="px-2 py-1 text-emerald-300">
                            {l.debit.toFixed(3)}
                          </td>
                          <td className="px-2 py-1 text-amber-300">
                            {l.credit.toFixed(3)}
                          </td>
                          <td className="px-2 py-1">{l.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingJournalPage;
