// src/pages/hr/PayrollPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils";
import {
  BanknotesIcon,
  CheckBadgeIcon,
  TrashIcon,
  CalculatorIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

export default function PayrollPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const loadRuns = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/payroll");
      setRuns(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (id: number) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/payroll/${id}`);
      setSelectedRun(res.data);
    } catch {
      toast.error("فشل تحميل تفاصيل كشف المرتبات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleGenerate = async () => {
    try {
      await apiClient.post("/payroll/generate", { month, year });
      toast.success("تم إنشاء مسودة كشف المرتبات بنجاح");
      loadRuns();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "فشل الإنشاء");
    }
  };

  const handleApprove = async () => {
    if (!selectedRun) return;
    if (!confirm("هل أنت متأكد من اعتماد كشف المرتبات وترحيل القيد المحاسبي؟"))
      return;
    setApproving(true);
    try {
      await apiClient.post(`/payroll/${selectedRun.id}/approve`);
      toast.success("تم اعتماد كشف المرتبات والترحيل للمالية بنجاح");
      loadRuns();
      handleViewDetails(selectedRun.id);
    } catch {
      toast.error("فشل اعتماد كشف المرتبات");
    } finally {
      setApproving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("حذف المسودة نهائياً؟")) return;
    try {
      await apiClient.delete(`/payroll/${id}`);
      toast.success("تم الحذف");
      setSelectedRun(null);
      loadRuns();
    } catch {
      toast.error("لا يمكن حذف كشف مرتبات معتمد");
    }
  };

  return (
    <div
      className="p-6 h-full flex flex-col space-y-6 text-slate-100"
      dir="rtl"
    >
      {/* 📊 Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase mb-1">
              إجمالي آخر كشف مرتبات
            </div>
            <div className="text-2xl font-black text-emerald-400">
              {formatMoney(runs[0]?.totalNet || 0)}{" "}
              <span className="text-xs">LYD</span>
            </div>
          </div>
          <BanknotesIcon className="w-10 h-10 text-slate-700 opacity-50" />
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <CalculatorIcon className="w-5 h-5 text-sky-500" /> كشف مرتبات جديد
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(+e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(+e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-center"
              />
            </div>
            <button
              onClick={handleGenerate}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 rounded-2xl text-xs font-black shadow-lg shadow-sky-900/20 transition-all active:scale-95"
            >
              بدء التوليد
            </button>
          </div>

          <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl p-5 overflow-y-auto custom-scrollbar">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">
              السجل التاريخي
            </h3>
            <div className="space-y-3">
              {runs.map((run) => (
                <div
                  key={run.id}
                  onClick={() => handleViewDetails(run.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${selectedRun?.id === run.id ? "bg-sky-900/20 border-sky-500" : "bg-slate-950/40 border-slate-800 hover:bg-slate-800/40"}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold">
                      {run.month} / {run.year}
                    </span>
                    <span
                      className={`text-[8px] px-2 py-0.5 rounded-full border ${run.status === "APPROVED" ? "bg-emerald-900 text-emerald-400" : "bg-amber-900 text-amber-400"}`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatMoney(run.totalNet)} LYD
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Details */}
        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
          {!selectedRun ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
              <DocumentTextIcon className="w-16 h-16 opacity-10 mb-4" />
              <p>اختر كشف مرتبات للمراجعة</p>
            </div>
          ) : (
            <>
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/20">
                <div>
                  <h2 className="text-xl font-black">
                    تفاصيل كشف المرتبات {selectedRun.month} / {selectedRun.year}
                  </h2>
                  <div className="text-[10px] text-slate-500">
                    الحالة: {selectedRun.status} | إجمالي كشف المرتبات:{" "}
                    {formatMoney(selectedRun.totalNet)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedRun.status === "DRAFT" && (
                    <>
                      <button
                        onClick={() => handleDelete(selectedRun.id)}
                        className="p-2 bg-rose-900/20 text-rose-500 rounded-xl hover:bg-rose-900/40"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={approving}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg"
                      >
                        ✔ اعتماد وترحيل مالي
                      </button>
                    </>
                  )}
                  {selectedRun.status === "APPROVED" && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-900/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold">
                      <CheckBadgeIcon className="w-5 h-5" /> تم الترحيل للمالية
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
                    <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                      <th className="px-6 py-4">الموظف</th>
                      <th className="px-6 py-4">الأساسي</th>
                      <th className="px-6 py-4">علاوات/عمولات</th>
                      <th className="px-6 py-4 text-rose-400">خصومات</th>
                      <th className="px-6 py-4 text-emerald-400 font-black">
                        الصافي
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {selectedRun.slips &&
                      selectedRun.slips.map((slip: any) => (
                        <tr
                          key={slip.id}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-100">
                              {slip.user?.fullName}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              @{slip.user?.username}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-300">
                            {formatMoney(slip.basicSalary)}
                          </td>
                          <td className="px-6 py-4 font-mono text-sky-400">
                            {formatMoney(slip.otherAllowance)}
                          </td>
                          <td className="px-6 py-4 font-mono text-rose-400">
                            {formatMoney(slip.deductions)}
                          </td>
                          <td className="px-6 py-4 font-mono text-emerald-400 font-black">
                            {formatMoney(slip.netSalary)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

