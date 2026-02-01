// src/pages/ManualEntryPage.tsx

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";

type AccountLite = {
  id: number;
  code: string;
  name: string;
};

type CostCenterLite = {
  id: number;
  code: string;
  name: string;
};

type ManualLine = {
  tempId: number;
  accountId: number | "";
  costCenterId?: number | ""; // ✅ حقل جديد
  debit: string;
  credit: string;
  description: string;
};

type ApiResult = {
  success: boolean;
  entryId: number;
  totalDebit: number;
  totalCredit: number;
  linesCount: number;
};

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function ManualEntryPage() {
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterLite[]>([]); // ✅ قائمة مراكز التكلفة

  const [lines, setLines] = useState<ManualLine[]>([
    {
      tempId: 1,
      accountId: "",
      costCenterId: "",
      debit: "0",
      credit: "0",
      description: "",
    },
  ]);
  const [entryDate, setEntryDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [loadingResources, setLoadingResources] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // تحميل الحسابات ومراكز التكلفة
  useEffect(() => {
    async function loadResources() {
      try {
        setLoadingResources(true);
        setError(null);
        const [accRes, ccRes] = await Promise.all([
          apiClient.get<AccountLite[]>("/accounting/accounts-lite"),
          apiClient.get<CostCenterLite[]>("/accounting/cost-centers"),
        ]);
        setAccounts(accRes.data);
        setCostCenters(ccRes.data);
      } catch (err: any) {
        console.error(err);
        const msg =
          err?.response?.data?.message || "حدث خطأ أثناء تحميل البيانات.";
        setError(msg);
      } finally {
        setLoadingResources(false);
      }
    }

    loadResources();
  }, []);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        tempId: prev.length ? prev[prev.length - 1].tempId + 1 : 1,
        accountId: "",
        costCenterId: "",
        debit: "0",
        credit: "0",
        description: "",
      },
    ]);
  };

  const removeLine = (tempId: number) => {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((l) => l.tempId !== tempId),
    );
  };

  const updateLine = (tempId: number, patch: Partial<ManualLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.tempId === tempId ? { ...l, ...patch } : l)),
    );
  };

  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;

    for (const l of lines) {
      const d = parseFloat(l.debit || "0") || 0;
      const c = parseFloat(l.credit || "0") || 0;
      totalDebit += d;
      totalCredit += c;
    }

    return {
      totalDebit,
      totalCredit,
      diff: totalDebit - totalCredit,
    };
  }, [lines]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!entryDate) {
      setError("يرجى اختيار تاريخ القيد.");
      return;
    }

    const payloadLines = [];

    for (const l of lines) {
      if (!l.accountId) {
        setError("يرجى اختيار الحساب لكل سطر.");
        return;
      }
      const debit = parseFloat(l.debit || "0") || 0;
      const credit = parseFloat(l.credit || "0") || 0;

      if (debit === 0 && credit === 0) continue;

      if (debit < 0 || credit < 0) {
        setError("لا يمكن إدخال مبالغ سالبة.");
        return;
      }

      payloadLines.push({
        accountId: Number(l.accountId),
        costCenterId: l.costCenterId ? Number(l.costCenterId) : undefined, // ✅ إرسال مركز التكلفة
        debit,
        credit,
        description: l.description || undefined,
      });
    }

    if (payloadLines.length === 0) {
      setError("يجب إدخال سطر واحد على الأقل بمبلغ مدين أو دائن.");
      return;
    }

    if (Math.abs(totals.diff) > 0.0001) {
      setError("إجمالي المدين يجب أن يساوي إجمالي الدائن قبل الحفظ.");
      return;
    }

    const payload = {
      entryDate,
      description: description || undefined,
      lines: payloadLines,
    };

    try {
      setSaving(true);
      const res = await apiClient.post<ApiResult>(
        "/accounting/manual-entry",
        payload,
      );
      if (res.data?.success) {
        setSuccessMsg(
          `تم حفظ القيد اليدوي بنجاح (رقم القيد ${res.data.entryId}).`,
        );
        toast.success("تم ترحيل القيد بنجاح");
        // تصفير النموذج
        setLines([
          {
            tempId: 1,
            accountId: "",
            costCenterId: "",
            debit: "0",
            credit: "0",
            description: "",
          },
        ]);
        setDescription("");
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message || "حدث خطأ أثناء حفظ القيد.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-6" dir="rtl">
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
            <h1 className="text-2xl font-bold mb-1">قيد يومية يدوي</h1>
            <p className="text-sm text-slate-400">
              تسجيل العمليات المحاسبية (تسويات، مصاريف، عهد) مع توجيه مراكز
              التكلفة.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-rose-300 bg-rose-950/40 border border-rose-700/60 rounded-xl px-4 py-2">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-700/60 rounded-xl px-4 py-2">
          {successMsg}
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 flex flex-col gap-5 shadow-xl"
      >
        {/* الصف العلوي: تاريخ + وصف مختصر */}
        <div className="flex flex-wrap gap-4 items-end text-sm border-b border-slate-800 pb-4">
          <div className="flex flex-col gap-1 w-48">
            <label className="text-xs text-slate-400">تاريخ القيد</label>
            <DatePicker
              date={entryDate ? new Date(entryDate) : undefined}
              onChange={(d) => setEntryDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-900/70 border-slate-700/60 h-8 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs text-slate-400">
              وصف القيد (شرح عام)
            </label>
            <input
              className="bg-slate-900/70 border border-slate-700/60 rounded-xl px-3 py-2 text-xs focus:border-sky-500 outline-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثال: تسوية عهدة نقدية للموظف..."
            />
          </div>

          <button
            type="submit"
            disabled={saving || loadingResources}
            className="ml-auto px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white disabled:opacity-50 shadow-lg shadow-emerald-900/20"
          >
            {saving ? "جارِ الترحيل..." : "حفظ وترحيل القيد"}
          </button>
        </div>

        {/* جدول الأسطر */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-1 overflow-x-auto">
          <table className="min-w-full text-right border-collapse">
            <thead className="text-[11px] text-slate-400 bg-slate-900/80">
              <tr>
                <th className="py-2 px-2 w-10 text-center">#</th>
                <th className="py-2 px-2 w-64">الحساب (GL Account)</th>
                <th className="py-2 px-2 w-48">مركز التكلفة (Cost Center)</th>
                <th className="py-2 px-2 w-32">مدين (Debit)</th>
                <th className="py-2 px-2 w-32">دائن (Credit)</th>
                <th className="py-2 px-2">البيان / الشرح</th>
                <th className="py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr
                  key={l.tempId}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-2 px-2 text-center text-slate-500 text-xs">
                    {idx + 1}
                  </td>

                  {/* الحساب */}
                  <td className="py-2 px-2">
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] focus:border-sky-500 outline-none"
                      value={l.accountId}
                      onChange={(e) =>
                        updateLine(l.tempId, {
                          accountId:
                            e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">-- اختر الحساب --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} — {acc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* مركز التكلفة */}
                  <td className="py-2 px-2">
                    <select
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] focus:border-sky-500 outline-none"
                      value={l.costCenterId ?? ""}
                      onChange={(e) =>
                        updateLine(l.tempId, {
                          costCenterId:
                            e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">(عام / بدون مركز)</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} — {cc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* مدين */}
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      step="0.001"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-emerald-400 font-mono focus:border-emerald-500 outline-none"
                      value={l.debit}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        updateLine(l.tempId, { debit: e.target.value })
                      }
                    />
                  </td>

                  {/* دائن */}
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      step="0.001"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-rose-400 font-mono focus:border-rose-500 outline-none"
                      value={l.credit}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        updateLine(l.tempId, { credit: e.target.value })
                      }
                    />
                  </td>

                  {/* البيان */}
                  <td className="py-2 px-2">
                    <input
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] focus:border-sky-500 outline-none"
                      value={l.description}
                      placeholder="شرح البند..."
                      onChange={(e) =>
                        updateLine(l.tempId, { description: e.target.value })
                      }
                    />
                  </td>

                  <td className="py-2 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(l.tempId)}
                      className="text-rose-500 hover:text-rose-400 transition"
                      tabIndex={-1}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            onClick={addLine}
            className="mt-2 mx-2 mb-2 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-sky-400 transition"
          >
            + إضافة سطر جديد
          </button>
        </div>

        {/* الملخص السفلي */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm pt-2">
          <div className="rounded-2xl bg-emerald-900/10 border border-emerald-500/20 p-3 flex justify-between items-center">
            <span className="text-slate-400 text-xs">إجمالي المدين</span>
            <span className="text-lg font-mono font-bold text-emerald-400">
              {totals.totalDebit.toFixed(3)}
            </span>
          </div>
          <div className="rounded-2xl bg-rose-900/10 border border-rose-500/20 p-3 flex justify-between items-center">
            <span className="text-slate-400 text-xs">إجمالي الدائن</span>
            <span className="text-lg font-mono font-bold text-rose-400">
              {totals.totalCredit.toFixed(3)}
            </span>
          </div>
          <div
            className={`rounded-2xl border p-3 flex justify-between items-center transition-colors ${Math.abs(totals.diff) < 0.0001 ? "bg-sky-900/10 border-sky-500/20" : "bg-amber-900/10 border-amber-500/40"}`}
          >
            <span className="text-slate-400 text-xs">الفرق (الموازنة)</span>
            <span
              className={`text-lg font-mono font-bold ${Math.abs(totals.diff) < 0.0001 ? "text-sky-400" : "text-amber-400"}`}
            >
              {totals.diff.toFixed(3)}
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}
