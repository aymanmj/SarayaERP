// src/pages/OpeningBalancesPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type FinancialYearDto = {
  id: number;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED" | "ARCHIVED";
};

type AccountLite = {
  id: number;
  code: string;
  name: string;
};

type OpeningBalanceLine = {
  tempId: string;
  accountId: number | null;
  debit: number;
  credit: number;
};

// ✅ ما يرجع من الـ API عند جلب الأرصدة الافتتاحية
type OpeningBalancesResponse = {
  entryDate: string;
  lines: {
    accountId: number;
    debit: number;
    credit: number;
  }[];
};

// Local formatDate removed

function formatNumber(n: number) {
  if (!n || Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

export default function OpeningBalancesPage() {
  const navigate = useNavigate();

  const [years, setYears] = useState<FinancialYearDto[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [entryDate, setEntryDate] = useState<string>("");
  const [lines, setLines] = useState<OpeningBalanceLine[]>([]);
  const [loading, setLoading] = useState(false); // تحميل السنوات + الحسابات
  const [balancesLoading, setBalancesLoading] = useState(false); // تحميل أرصدة سنة معينة
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 🧮 إجمالي المدين/الدائن والفرق
  const totalDebit = lines.reduce((acc, l) => acc + (l.debit || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (l.credit || 0), 0);
  const diff = totalDebit - totalCredit;
  const isBalanced = Math.abs(diff) < 0.0001;

  const selectedYear = selectedYearId
    ? years.find((y) => y.id === selectedYearId) ?? null
    : null;

  // ✅ تحميل أرصدة افتتاحية لسنة معيّنة
  const loadBalancesForYear = async (yearId: number) => {
    if (!yearId) return;

    try {
      setBalancesLoading(true);
      setError(null);
      setMessage(null);
      setLines([]);

      const res = await apiClient.get<OpeningBalancesResponse>(
        "/accounting/opening-balances",
        {
          params: { financialYearId: yearId },
        }
      );

      const ob = res.data;

      if (ob.entryDate) {
        setEntryDate(ob.entryDate.substring(0, 10));
      } else if (selectedYear) {
        setEntryDate(selectedYear.startDate.substring(0, 10));
      }

      if (ob.lines && ob.lines.length > 0) {
        setLines(
          ob.lines.map((l) => ({
            tempId: crypto.randomUUID(),
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
          }))
        );
      } else {
        setLines([]);
      }
     
    } catch (err: any) {
      // 404 أو لا توجد بيانات = لا نعرض خطأ، بل نعتبرها فارغة
      const status = err?.response?.status;
      if (status === 404) {
        if (selectedYear) {
          setEntryDate(selectedYear.startDate.substring(0, 10));
        }
        setLines([]);
      } else {
        console.error(err);
        setError("حدث خطأ أثناء تحميل الأرصدة الافتتاحية لهذه السنة.");
      }
    } finally {
      setBalancesLoading(false);
    }
  };

  // تحميل السنوات المالية والحسابات
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [yearsRes, accountsRes] = await Promise.all([
          apiClient.get<FinancialYearDto[]>("/financial-years"),
          apiClient.get<AccountLite[]>("/accounting/accounts-lite"),
        ]);

        setYears(yearsRes.data);
        setAccounts(accountsRes.data);

        const openYear =
          yearsRes.data.find((y) => y.status === "OPEN") ?? yearsRes.data[0];

        if (openYear) {
          setSelectedYearId(openYear.id);
          setEntryDate(openYear.startDate.substring(0, 10));
        }
       
      } catch (err: any) {
        console.error(err);
        setError("حدث خطأ أثناء تحميل البيانات.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // عند تغيير السنة المختارة → تحميل أرصدتها الافتتاحية (إن وجدت)
  useEffect(() => {
    if (selectedYearId) {
      loadBalancesForYear(selectedYearId);
    } else {
      setLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId]);

  // إضافة سطر جديد
  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        accountId: null,
        debit: 0,
        credit: 0,
      },
    ]);
  };

  const removeLine = (tempId: string) => {
    setLines((prev) => prev.filter((l) => l.tempId !== tempId));
  };

  const updateLine = (
    tempId: string,
    field: "accountId" | "debit" | "credit",
     
    value: any
  ) => {
    setLines((prev) =>
      prev.map((l) =>
        l.tempId === tempId
          ? {
              ...l,
              [field]:
                field === "accountId"
                  ? value
                    ? Number(value)
                    : null
                  : Number(value) || 0,
            }
          : l
      )
    );
  };

  const handleSave = async () => {
    if (!selectedYearId) {
      setError("يرجى اختيار السنة المالية أولاً.");
      return;
    }

    if (!entryDate) {
      setError("يرجى تحديد تاريخ القيد.");
      return;
    }

    if (!lines.length) {
      setError("يجب إضافة سطر واحد على الأقل.");
      return;
    }

    if (selectedYear && selectedYear.status !== "OPEN") {
      setError("لا يمكن تعديل الأرصدة الافتتاحية إلا لسنة مالية مفتوحة.");
      return;
    }

    const hasMissingAccount = lines.some((l) => !l.accountId);
    if (hasMissingAccount) {
      setError("يرجى اختيار حساب لكل سطر قبل الحفظ.");
      return;
    }

    if (Math.abs(diff) > 0.0001) {
      setError("إجمالي المدين يجب أن يساوي إجمالي الدائن.");
      return;
    }

    const payload = {
      financialYearId: selectedYearId,
      entryDate,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      })),
    };

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      await apiClient.post("/accounting/opening-balances", payload);

      setMessage("تم حفظ الأرصدة الافتتاحية بنجاح.");

      // إعادة تحميل الأرصدة من الـ backend بعد الحفظ
      await loadBalancesForYear(selectedYearId);
     
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        "حدث خطأ أثناء حفظ الأرصدة الافتتاحية.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-100 text-xs"
          >
            ← رجوع
          </button>
          <div>
            <h1 className="text-2xl font-bold mb-1">الأرصدة الافتتاحية</h1>
            <p className="text-sm text-slate-400">
              إعداد رصيد أول المدة للحسابات حسب السنة المالية.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          جارِ تحميل البيانات...
        </div>
      ) : (
        <>
          {/* تنبيهات */}
          {error && (
            <div className="mb-4 text-sm text-rose-300 bg-rose-950/40 border border-rose-700/60 rounded-xl px-4 py-2">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-700/60 rounded-xl px-4 py-2">
              {message}
            </div>
          )}

          {/* اختيارات السنة والتاريخ + حالة الميزان */}
          <div className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 flex flex-wrap items-end gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">السنة المالية</label>
              <select
                className="bg-slate-900/70 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs"
                value={selectedYearId ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setSelectedYearId(val);
                  const year = years.find((y) => y.id === val);
                  if (year) {
                    setEntryDate(year.startDate.substring(0, 10));
                  }
                }}
              >
                <option value="">— اختر السنة —</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.code} — {y.name} ({formatDate(y.startDate)} إلى{" "}
                    {formatDate(y.endDate)}){" "}
                    {y.status === "OPEN"
                      ? " (مفتوحة)"
                      : y.status === "CLOSED"
                      ? " (مقفلة)"
                      : " (مؤرشفة)"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">تاريخ القيد</label>
              <DatePicker
                date={entryDate ? new Date(entryDate) : undefined}
                onChange={(d) => setEntryDate(d ? d.toISOString().slice(0, 10) : "")}
                className="bg-slate-900/70 border-slate-700/60 h-8 text-xs"
              />
            </div>

            {/* حالة الميزان */}
            <div className="flex flex-col gap-1 mr-auto">
              <span className="text-xs text-slate-400">حالة الميزان</span>
              <div
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex flex-wrap gap-2 items-center
                  ${
                    isBalanced
                      ? "bg-emerald-900/40 border-emerald-500/60 text-emerald-300"
                      : "bg-amber-900/40 border-amber-500/60 text-amber-200"
                  }`}
              >
                <span>
                  {isBalanced ? "✅ الميزان متزن" : "⚠️ الميزان غير متزن"}
                </span>
                <span className="text-[11px]">
                  مـدين: {formatNumber(totalDebit)} | دائـن:{" "}
                  {formatNumber(totalCredit)}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={addLine}
                className="px-4 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 text-xs text-white"
              >
                + إضافة سطر
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs text-white disabled:opacity-50"
              >
                {saving ? "جارِ الحفظ..." : "حفظ الأرصدة الافتتاحية"}
              </button>
            </div>
          </div>

          {/* جدول الأرصدة الافتتاحية */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">
                سطور الأرصدة الافتتاحية
              </h2>
              {balancesLoading && (
                <span className="text-[11px] text-slate-500">
                  جارِ تحميل الأرصدة لهذه السنة...
                </span>
              )}
            </div>

            <div className="overflow-x-auto text-xs flex-1">
              <table className="min-w-full text-right">
                <thead className="text-[11px] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-2 w-64">الحساب</th>
                    <th className="py-2 px-2 w-32">مدين</th>
                    <th className="py-2 px-2 w-32">دائن</th>
                    <th className="py-2 px-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && !balancesLoading && (
                    <tr>
                      <td
                        className="py-4 px-2 text-center text-slate-500"
                        colSpan={4}
                      >
                        لا توجد سطور بعد. اضغط على &quot;إضافة سطر&quot; أو حمّل
                        الأرصدة الافتتاحية لسنة أخرى.
                      </td>
                    </tr>
                  )}

                  {lines.map((line) => (
                    <tr
                      key={line.tempId}
                      className="border-b border-slate-900/80 hover:bg-slate-900/60"
                    >
                      <td className="py-2 px-2">
                        <select
                          className="w-full bg-slate-900/70 border border-slate-700/60 rounded-xl px-2 py-1 text-xs"
                          value={line.accountId ?? ""}
                          onChange={(e) =>
                            updateLine(line.tempId, "accountId", e.target.value)
                          }
                        >
                          <option value="">— اختر الحساب —</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.001"
                          className="w-full bg-slate-900/70 border border-slate-700/60 rounded-xl px-2 py-1 text-xs"
                          value={line.debit}
                          onChange={(e) =>
                            updateLine(line.tempId, "debit", e.target.value)
                          }
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.001"
                          className="w-full bg-slate-900/70 border border-slate-700/60 rounded-xl px-2 py-1 text-xs"
                          value={line.credit}
                          onChange={(e) =>
                            updateLine(line.tempId, "credit", e.target.value)
                          }
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.tempId)}
                          className="px-2 py-1 rounded-full bg-rose-600/80 hover:bg-rose-500 text-[11px]"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ملخص تحت الجدول (إجمالي مدين/دائن/فرق) */}
            <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
              <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-3">
                <div className="text-slate-400 mb-1">إجمالي المدين</div>
                <div className="text-emerald-300 font-semibold">
                  LYD {formatNumber(totalDebit)}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-3">
                <div className="text-slate-400 mb-1">إجمالي الدائن</div>
                <div className="text-rose-300 font-semibold">
                  LYD {formatNumber(totalCredit)}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-3">
                <div className="text-slate-400 mb-1">الفرق (مدين - دائن)</div>
                <div
                  className={
                    isBalanced
                      ? "text-sky-300 font-semibold"
                      : "text-amber-300 font-semibold"
                  }
                >
                  LYD {formatNumber(diff)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
