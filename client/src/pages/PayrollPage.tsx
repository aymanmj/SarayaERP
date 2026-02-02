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
      toast.error("فشل تحميل تفاصيل المسير");
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
      toast.success("تم إنشاء مسودة المسير بنجاح");
      loadRuns();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "فشل الإنشاء");
    }
  };

  const handleApprove = async () => {
    if (!selectedRun) return;
    if (!confirm("هل أنت متأكد من اعتماد المسير وترحيل القيد المحاسبي؟"))
      return;
    setApproving(true);
    try {
      await apiClient.post(`/payroll/${selectedRun.id}/approve`);
      toast.success("تم الاعتماد والترحيل للمالية بنجاح");
      loadRuns();
      handleViewDetails(selectedRun.id);
    } catch {
      toast.error("فشل الاعتماد");
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
      toast.error("لا يمكن حذف مسير معتمد");
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
              إجمالي آخر مسير
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
              <CalculatorIcon className="w-5 h-5 text-sky-500" /> مسير جديد
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
              <p>اختر مسير رواتب للمراجعة</p>
            </div>
          ) : (
            <>
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/20">
                <div>
                  <h2 className="text-xl font-black">
                    تفاصيل مسير {selectedRun.month} / {selectedRun.year}
                  </h2>
                  <div className="text-[10px] text-slate-500">
                    الحالة: {selectedRun.status} | إجمالي المسير:{" "}
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

// // src/pages/hr/PayrollPage.tsx

// import { useEffect, useState, useMemo } from "react";
// import { apiClient } from "../api/apiClient";
// import { toast } from "sonner";
// import { formatMoney } from "@/lib/utils";
// import {
//   BanknotesIcon,
//   CheckBadgeIcon,
//   TrashIcon,
//   PresentationChartLineIcon,
//   CalculatorIcon,
// } from "@heroicons/react/24/outline";

// // ... (تكملة الأنواع المذكورة سابقاً)

// export default function PayrollPage() {
//   const [runs, setRuns] = useState<any[]>([]);
//   const [selectedRun, setSelectedRun] = useState<any | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [month, setMonth] = useState(new Date().getMonth() + 1);
//   const [year, setYear] = useState(new Date().getFullYear());
//   const [approving, setApproving] = useState(false);

//   const loadRuns = async () => {
//     setLoading(true);
//     try {
//       const res = await apiClient.get("/payroll");
//       setRuns(res.data);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     loadRuns();
//   }, []);

//   const handleGenerate = async () => {
//     toast.promise(apiClient.post("/payroll/generate", { month, year }), {
//       loading: "جاري تشغيل محرك الرواتب والعمولات...",
//       success: () => {
//         loadRuns();
//         return "تم إنشاء المسير بنجاح";
//       },
//       error: "فشل الإنشاء",
//     });
//   };

//   const handleApprove = async () => {
//     if (!selectedRun) return;

//     const ok = window.confirm(
//       "هل أنت متأكد من اعتماد المسير؟ \nسيتم إنشاء قيد استحقاق رواتب في الأستاذ العام وإقفال المسير نهائياً.",
//     );
//     if (!ok) return;

//     setApproving(true); // تأكد من تعريف const [approving, setApproving] = useState(false);

//     toast.promise(apiClient.post(`/payroll/${selectedRun.id}/approve`), {
//       loading: "جاري معالجة القيود المحاسبية واعتماد الرواتب...",
//       success: (res) => {
//         loadRuns(); // تحديث القائمة الجانبية
//         handleViewDetails(selectedRun.id); // تحديث عرض التفاصيل لرؤية الحالة الجديدة
//         return "تم الاعتماد والترحيل المالي بنجاح ✓";
//       },
//       error: (err) => {
//         return err.response?.data?.message || "فشل عملية الاعتماد";
//       },
//     });

//     setApproving(false);
//   };

//   const handleDelete = async (id: number) => {
//     if (!confirm("هل أنت متأكد من حذف مسودة هذا الشهر؟")) return;
//     try {
//       await apiClient.delete(`/payroll/${id}`);
//       toast.success("تم حذف المسودة");
//       setSelectedRun(null);
//       loadRuns();
//     } catch {
//       toast.error("فشل الحذف");
//     }
//   };

//   return (
//     <div
//       className="p-6 h-full flex flex-col space-y-6 text-slate-100"
//       dir="rtl"
//     >
//       {/* 📊 Executive Summary Row */}
//       <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
//         <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl relative overflow-hidden group">
//           <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
//             <BanknotesIcon className="w-20 h-20 text-white" />
//           </div>
//           <div className="text-xs text-slate-500 font-bold uppercase mb-2">
//             إجمالي الرواتب والعمولات
//           </div>
//           <div className="text-3xl font-black text-emerald-400">
//             {formatMoney(runs[0]?.totalNet || 0)}
//           </div>
//           <div className="text-[10px] text-slate-600 mt-1">لآخر مسير معتمد</div>
//         </div>

//         {/* إضافة كروت أخرى هنا للغياب، عدد الموظفين، إلخ */}
//       </div>

//       <div className="flex-1 flex gap-6 overflow-hidden">
//         {/* 📋 Sidebar: History */}
//         <div className="w-80 flex flex-col gap-4">
//           <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col space-y-4">
//             <h3 className="text-sm font-bold flex items-center gap-2">
//               <CalculatorIcon className="w-5 h-5 text-sky-500" />
//               توليد مسير شهر جديد
//             </h3>
//             <div className="grid grid-cols-2 gap-2">
//               <select
//                 value={month}
//                 onChange={(e) => setMonth(+e.target.value)}
//                 className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs outline-none"
//               >
//                 {Array.from({ length: 12 }).map((_, i) => (
//                   <option key={i} value={i + 1}>
//                     {i + 1}
//                   </option>
//                 ))}
//               </select>
//               <input
//                 type="number"
//                 value={year}
//                 onChange={(e) => setYear(+e.target.value)}
//                 className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-center"
//               />
//             </div>
//             <button
//               onClick={handleGenerate}
//               className="w-full py-3 bg-sky-600 hover:bg-sky-500 rounded-2xl text-xs font-black transition-all"
//             >
//               بدء الاحتساب الذكي
//             </button>
//           </div>

//           <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl p-5 overflow-y-auto custom-scrollbar">
//             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
//               تاريخ المسيرات
//             </h3>
//             <div className="space-y-3">
//               {runs.map((run) => (
//                 <div
//                   key={run.id}
//                   onClick={() => setSelectedRun(run)}
//                   className={`p-4 rounded-2xl border cursor-pointer transition-all ${selectedRun?.id === run.id ? "bg-sky-900/20 border-sky-500" : "bg-slate-950/40 border-slate-800 hover:bg-slate-800/40"}`}
//                 >
//                   <div className="flex justify-between items-center mb-1">
//                     <span className="font-black text-sm">
//                       {run.month} / {run.year}
//                     </span>
//                     <span
//                       className={`text-[9px] px-2 py-0.5 rounded-lg font-bold border ${run.status === "APPROVED" ? "bg-emerald-900/20 text-emerald-400 border-emerald-500/20" : "bg-amber-900/20 text-amber-400 border-amber-500/20"}`}
//                     >
//                       {run.status === "APPROVED" ? "مرحّل للمالية" : "مسودة"}
//                     </span>
//                   </div>
//                   <div className="text-xs text-slate-500 font-mono">
//                     {formatMoney(run.totalNet)} LYD
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* 📄 Main Panel: Details */}
//         <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
//           {!selectedRun ? (
//             <div className="flex-1 flex flex-col items-center justify-center text-slate-600 italic">
//               <PresentationChartLineIcon className="w-16 h-16 opacity-10 mb-4" />
//               <p>اختر مسير رواتب للمراجعة والاعتماد</p>
//             </div>
//           ) : (
//             <>
//               <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/20">
//                 <div>
//                   <h2 className="text-xl font-black">
//                     كشف رواتب شهر {selectedRun.month} / {selectedRun.year}
//                   </h2>
//                   <div className="text-xs text-slate-500 mt-1">
//                     تم التوليد في{" "}
//                     {new Date(selectedRun.createdAt).toLocaleDateString()}
//                   </div>
//                 </div>
//                 <div className="flex gap-2">
//                   {selectedRun.status === "DRAFT" && (
//                     <button
//                       onClick={handleApprove}
//                       disabled={approving}
//                       className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg disabled:opacity-50"
//                     >
//                       {approving
//                         ? "جاري المعالجة..."
//                         : "✔ اعتماد وترحيل للمالية"}
//                     </button>
//                   )}
//                 </div>
//                 <button
//                   onClick={() => handleDelete(selectedRun.id)}
//                   className="p-2 bg-rose-900/20 text-rose-500 hover:bg-rose-900/40 rounded-xl border border-rose-900/30 transition-all"
//                   title="حذف المسودة"
//                 >
//                   <TrashIcon className="w-5 h-5" />
//                 </button>
//               </div>

//               <div className="flex-1 overflow-y-auto custom-scrollbar">
//                 <table className="w-full text-sm text-right">
//                   <thead className="bg-slate-950/50 text-slate-500 sticky top-0 z-10 backdrop-blur">
//                     <tr className="text-[10px] uppercase tracking-widest">
//                       <th className="px-6 py-4">الموظف</th>
//                       <th className="px-6 py-4">الأساسي</th>
//                       <th className="px-6 py-4">البدلات + العمولات</th>
//                       <th className="px-6 py-4 text-rose-400">الخصومات</th>
//                       <th className="px-6 py-4 text-emerald-400 font-black">
//                         الصافي
//                       </th>
//                     </tr>
//                   </thead>
//                   <tbody className="divide-y divide-slate-800/50">
//                     {selectedRun.slips &&
//                       selectedRun.slips.map((slip: any) => (
//                         <tr key={slip.id} className="hover:bg-white/[0.02]">
//                           <td className="px-6 py-4">
//                             <div className="font-bold text-slate-200">
//                               {slip.user.fullName}
//                             </div>
//                             <div className="text-[10px] text-slate-500 font-mono">
//                               @{slip.user.username}
//                             </div>
//                           </td>
//                           <td className="px-6 py-4 text-slate-300 font-mono">
//                             {formatMoney(slip.basicSalary)}
//                           </td>
//                           <td className="px-6 py-4 text-slate-400 font-mono">
//                             {formatMoney(slip.otherAllowance)}
//                           </td>
//                           <td className="px-6 py-4 text-rose-400 font-mono">
//                             {formatMoney(slip.deductions)}
//                           </td>
//                           <td className="px-6 py-4 text-emerald-400 font-black font-mono">
//                             {formatMoney(slip.netSalary)}
//                           </td>
//                         </tr>
//                       ))}
//                   </tbody>
//                 </table>
//               </div>
//             </>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

// // src/pages/PayrollPage.tsx

// import { useEffect, useState, useMemo } from "react";
// import { apiClient } from "../api/apiClient";
// import { toast } from "sonner";
// import { useNavigate } from "react-router-dom";

// type PayrollStatus = "DRAFT" | "APPROVED" | "PAID" | "CANCELLED";

// type PayrollSlip = {
//   id: number;
//   userId: number;
//   basicSalary: string;
//   housingAllowance: string;
//   transportAllowance: string;
//   otherAllowance: string;
//   commissionAmount: string; // ✅ مضاف حديثاً
//   deductions: string;
//   netSalary: string;
//   user: {
//     fullName: string;
//     username: string;
//   };
// };

// type PayrollRun = {
//   id: number;
//   month: number;
//   year: number;
//   status: PayrollStatus;
//   totalBasic: string;
//   totalAllowances: string;
//   totalDeductions: string;
//   totalNet: string;
//   accountingEntryId: number | null; // ✅ لربط المالية
//   createdAt: string;
//   slips?: PayrollSlip[];
// };

// const MONTHS = [
//   "يناير",
//   "فبراير",
//   "مارس",
//   "أبريل",
//   "مايو",
//   "يونيو",
//   "يوليو",
//   "أغسطس",
//   "سبتمبر",
//   "أكتوبر",
//   "نوفمبر",
//   "ديسمبر",
// ];

// function formatMoney(val: string | number) {
//   return Number(val).toLocaleString("en-US", {
//     minimumFractionDigits: 3,
//     maximumFractionDigits: 3,
//   });
// }

// export default function PayrollPage() {
//   const navigate = useNavigate();
//   const [runs, setRuns] = useState<PayrollRun[]>([]);
//   const [loading, setLoading] = useState(false);

//   // New Run Form State
//   const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
//   const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
//   const [generating, setGenerating] = useState(false);

//   // Details View State
//   const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
//   const [loadingDetails, setLoadingDetails] = useState(false);
//   const [approving, setApproving] = useState(false);
//   const [searchTerm, setSearchTerm] = useState("");

//   const loadRuns = async () => {
//     setLoading(true);
//     try {
//       const res = await apiClient.get<PayrollRun[]>("/payroll");
//       setRuns(res.data);
//     } catch (err) {
//       toast.error("فشل تحميل مسيرات الرواتب.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     loadRuns();
//   }, []);

//   const handleGenerate = async () => {
//     setGenerating(true);
//     try {
//       await apiClient.post("/payroll/generate", {
//         month: Number(selectedMonth),
//         year: Number(selectedYear),
//       });
//       toast.success("تم إنشاء مسير الرواتب بنجاح.");
//       loadRuns();
//     } catch (err: any) {
//       toast.error(err?.response?.data?.message || "فشل إنشاء المسير.");
//     } finally {
//       setGenerating(false);
//     }
//   };

//   const handleViewDetails = async (runId: number) => {
//     setLoadingDetails(true);
//     try {
//       const res = await apiClient.get<PayrollRun>(`/payroll/${runId}`);
//       setSelectedRun(res.data);
//       setSearchTerm("");
//     } catch (err) {
//       toast.error("فشل تحميل تفاصيل المسير.");
//     } finally {
//       setLoadingDetails(false);
//     }
//   };

//   const handleApprove = async () => {
//     if (!selectedRun) return;
//     setApproving(true);
//     try {
//       await apiClient.post(`/payroll/${selectedRun.id}/approve`);
//       toast.success("تم اعتماد المسير وترحيل القيد المحاسبي.");
//       await handleViewDetails(selectedRun.id);
//       loadRuns();
//     } catch (err: any) {
//       toast.error(err?.response?.data?.message || "فشل الاعتماد.");
//     } finally {
//       setApproving(false);
//     }
//   };

//   const handleDeleteDraft = async (id: number) => {
//     if (!confirm("هل أنت متأكد من حذف هذه المسودة؟")) return;
//     try {
//       await apiClient.delete(`/payroll/${id}`);
//       toast.success("تم حذف المسير.");
//       setSelectedRun(null);
//       loadRuns();
//     } catch (err) {
//       toast.error("لا يمكن حذف هذا المسير.");
//     }
//   };

//   // فلترة الموظفين داخل المسير
//   const filteredSlips = useMemo(() => {
//     if (!selectedRun?.slips) return [];
//     return selectedRun.slips.filter(
//       (s) =>
//         s.user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         s.user.username.toLowerCase().includes(searchTerm.toLowerCase()),
//     );
//   }, [selectedRun, searchTerm]);

//   return (
//     <div
//       className="flex flex-col h-full text-slate-100 p-6 space-y-6"
//       dir="rtl"
//     >
//       {/* 1. Header */}
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-3xl font-extrabold text-white tracking-tight">
//             إدارة الرواتب والأجور
//           </h1>
//           <p className="text-sm text-slate-400 mt-1">
//             المحرك المالي لاحتساب الرواتب، العمولات، والخصومات الشهرية.
//           </p>
//         </div>
//       </div>

//       <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
//         {/* 2. Sidebar: Creation & List (1/4 space) */}
//         <div className="lg:col-span-1 flex flex-col gap-5">
//           {/* Create Card */}
//           <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
//             <h3 className="text-sm font-bold text-sky-400 mb-4 flex items-center gap-2">
//               <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
//               تجهيز مسير جديد
//             </h3>
//             <div className="space-y-4">
//               <div className="grid grid-cols-2 gap-2">
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 mr-2 uppercase">
//                     الشهر
//                   </label>
//                   <select
//                     value={selectedMonth}
//                     onChange={(e) => setSelectedMonth(Number(e.target.value))}
//                     className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500 transition-all"
//                   >
//                     {MONTHS.map((m, idx) => (
//                       <option key={idx} value={idx + 1}>
//                         {m}
//                       </option>
//                     ))}
//                   </select>
//                 </div>
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 mr-2 uppercase">
//                     السنة
//                   </label>
//                   <input
//                     type="number"
//                     value={selectedYear}
//                     onChange={(e) => setSelectedYear(Number(e.target.value))}
//                     className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-center outline-none focus:border-sky-500"
//                   />
//                 </div>
//               </div>
//               <button
//                 onClick={handleGenerate}
//                 disabled={generating}
//                 className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-sky-900/20 transition-all active:scale-95 disabled:opacity-50"
//               >
//                 {generating
//                   ? "جارِ التحليل والحساب..."
//                   : "توليد كشوفات الرواتب"}
//               </button>
//             </div>
//           </div>

//           {/* Runs History List */}
//           <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl p-5 flex flex-col overflow-hidden">
//             <h3 className="text-sm font-bold text-slate-200 mb-4">
//               سجل المسيرات
//             </h3>
//             <div className="overflow-y-auto flex-1 space-y-3 custom-scrollbar">
//               {loading && (
//                 <div className="text-center py-4 text-slate-500 text-xs">
//                   جارِ تحميل السجل...
//                 </div>
//               )}
//               {runs.map((run) => (
//                 <div
//                   key={run.id}
//                   onClick={() => handleViewDetails(run.id)}
//                   className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
//                     selectedRun?.id === run.id
//                       ? "bg-slate-800 border-sky-500"
//                       : "bg-slate-950/40 border-slate-800 hover:bg-slate-800/40"
//                   }`}
//                 >
//                   <div className="flex justify-between items-start mb-2">
//                     <span className="font-bold text-sm text-slate-100">
//                       {MONTHS[run.month - 1]} {run.year}
//                     </span>
//                     <span
//                       className={`text-[9px] px-2 py-0.5 rounded-lg border font-bold ${
//                         run.status === "APPROVED"
//                           ? "bg-emerald-900/20 text-emerald-400 border-emerald-500/20"
//                           : "bg-amber-900/20 text-amber-400 border-amber-500/20"
//                       }`}
//                     >
//                       {run.status === "APPROVED" ? "معتمد ماليًا" : "مسودة"}
//                     </span>
//                   </div>
//                   <div className="text-xs text-slate-500 font-mono">
//                     الصافي: {formatMoney(run.totalNet)} د.ل
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* 3. Detail View (3/4 space) */}
//         <div className="lg:col-span-3 flex flex-col gap-6">
//           {!selectedRun ? (
//             <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl text-slate-600">
//               <div className="text-5xl mb-4">📊</div>
//               <p>
//                 يرجى اختيار مسير رواتب من القائمة الجانبية للمراجعة والاعتماد.
//               </p>
//             </div>
//           ) : (
//             <div className="flex-1 flex flex-col min-h-0 space-y-6 animate-in fade-in duration-300">
//               {/* Summary Dashboard Cards */}
//               <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
//                 <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl">
//                   <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">
//                     إجمالي الأساسي
//                   </div>
//                   <div className="text-xl font-bold text-slate-200">
//                     {formatMoney(selectedRun.totalBasic)}
//                   </div>
//                 </div>
//                 <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl">
//                   <div className="text-[10px] text-sky-500 uppercase font-bold mb-1">
//                     إجمالي البدلات والعمولات
//                   </div>
//                   <div className="text-xl font-bold text-sky-400">
//                     {formatMoney(selectedRun.totalAllowances)}
//                   </div>
//                 </div>
//                 <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl">
//                   <div className="text-[10px] text-rose-500 uppercase font-bold mb-1">
//                     إجمالي الخصومات
//                   </div>
//                   <div className="text-xl font-bold text-rose-400">
//                     {formatMoney(selectedRun.totalDeductions)}
//                   </div>
//                 </div>
//                 <div className="bg-emerald-600 border border-emerald-500 p-4 rounded-3xl shadow-lg shadow-emerald-900/20">
//                   <div className="text-[10px] text-emerald-100 uppercase font-bold mb-1">
//                     صافي المبلغ المستحق
//                   </div>
//                   <div className="text-xl font-black text-white">
//                     {formatMoney(selectedRun.totalNet)}{" "}
//                     <small className="text-[10px]">LYD</small>
//                   </div>
//                 </div>
//               </div>

//               {/* Action Toolbar */}
//               <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl flex flex-wrap justify-between items-center gap-4 shadow-sm">
//                 <div className="flex items-center gap-4">
//                   <h2 className="text-lg font-bold text-white">
//                     {MONTHS[selectedRun.month - 1]} {selectedRun.year}
//                   </h2>
//                   <input
//                     type="text"
//                     placeholder="بحث باسم الموظف..."
//                     value={searchTerm}
//                     onChange={(e) => setSearchTerm(e.target.value)}
//                     className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-1.5 text-xs outline-none focus:border-sky-500 w-64"
//                   />
//                 </div>

//                 <div className="flex gap-2">
//                   {selectedRun.status === "DRAFT" ? (
//                     <>
//                       <button
//                         onClick={() => handleDeleteDraft(selectedRun.id)}
//                         className="px-4 py-2 bg-rose-900/20 text-rose-400 border border-rose-800 hover:bg-rose-900/40 rounded-xl text-xs transition"
//                       >
//                         حذف المسودة
//                       </button>
//                       <button
//                         onClick={handleApprove}
//                         disabled={approving}
//                         className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg transition disabled:opacity-50"
//                       >
//                         {approving
//                           ? "جارِ الترحيل..."
//                           : "✔ اعتماد وترحيل للمالية"}
//                       </button>
//                     </>
//                   ) : (
//                     <div className="flex gap-2">
//                       {selectedRun.accountingEntryId && (
//                         <button
//                           onClick={() => navigate(`/accounting/journal`)} // يمكن توجيهه لتفاصيل القيد تحديداً لاحقاً
//                           className="px-4 py-2 bg-sky-900/20 text-sky-400 border border-sky-800 rounded-xl text-xs"
//                         >
//                           📄 عرض القيد المحاسبي
//                         </button>
//                       )}
//                       <div className="px-4 py-2 bg-slate-800 text-emerald-400 rounded-xl text-xs font-bold border border-emerald-500/20 flex items-center gap-2">
//                         🔒 تم الاعتماد النهائي
//                       </div>
//                     </div>
//                   )}
//                 </div>
//               </div>

//               {/* Slips Table */}
//               <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden flex flex-col">
//                 <div className="overflow-y-auto flex-1 custom-scrollbar">
//                   <table className="w-full text-sm text-right">
//                     <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
//                       <tr className="text-[10px] uppercase tracking-widest">
//                         <th className="px-5 py-4 font-bold">الموظف</th>
//                         <th className="px-5 py-4 font-bold">الأساسي</th>
//                         <th className="px-5 py-4 font-bold">البدلات</th>
//                         <th className="px-5 py-4 font-bold text-sky-400">
//                           العمولة
//                         </th>
//                         <th className="px-5 py-4 font-bold text-rose-400">
//                           الخصم
//                         </th>
//                         <th className="px-5 py-4 font-bold text-emerald-400">
//                           الصافي النهائي
//                         </th>
//                       </tr>
//                     </thead>
//                     <tbody className="divide-y divide-slate-800/50">
//                       {/* {filteredSlips.map((slip) => (
//                         <tr
//                           key={slip.id}
//                           className="hover:bg-white/[0.02] transition-colors group"
//                         >
//                           <td className="px-5 py-4">
//                             <div className="font-bold text-slate-200 group-hover:text-white">
//                               {slip.user.fullName}
//                             </div>
//                             <div className="text-[10px] text-slate-500 font-mono">
//                               @{slip.user.username}
//                             </div>
//                           </td>
//                           <td className="px-5 py-4 font-mono text-slate-300">
//                             {formatMoney(slip.basicSalary)}
//                           </td>
//                           <td className="px-5 py-4 font-mono text-slate-400">
//                             {formatMoney(
//                               Number(slip.housingAllowance) +
//                                 Number(slip.transportAllowance) +
//                                 Number(slip.otherAllowance),
//                             )}
//                           </td>
//                           <td className="px-5 py-4 font-mono text-sky-300 font-bold">
//                             {Number(slip.commissionAmount) > 0
//                               ? formatMoney(slip.commissionAmount)
//                               : "—"}
//                           </td>
//                           <td className="px-5 py-4 font-mono text-rose-400">
//                             {Number(slip.deductions) > 0
//                               ? formatMoney(slip.deductions)
//                               : "—"}
//                           </td>
//                           <td className="px-5 py-4 font-mono text-emerald-400 font-black">
//                             {formatMoney(slip.netSalary)}
//                           </td>
//                         </tr>
//                       ))} */}
//                       {filteredSlips.map((slip) => (
//                         <tr
//                           key={slip.id}
//                           className="hover:bg-white/[0.02] transition-colors group"
//                         >
//                           <td className="px-5 py-4">
//                             <div className="font-bold text-slate-200 group-hover:text-white">
//                               {slip.user.fullName}
//                             </div>
//                             <div className="text-[10px] text-slate-500 font-mono">
//                               @{slip.user.username}
//                             </div>
//                           </td>
//                           <td className="px-5 py-4 font-mono text-slate-300">
//                             {formatMoney(slip.basicSalary)}
//                           </td>
//                           <td className="px-5 py-4 font-mono text-slate-400">
//                             {formatMoney(
//                               Number(slip.housingAllowance) +
//                                 Number(slip.transportAllowance),
//                             )}
//                           </td>
//                           {/* ✅ تحسين: عرض "أخرى" ليشمل العمولة والإضافي */}
//                           <td
//                             className="px-5 py-4 font-mono text-sky-300 font-bold"
//                             title="يشمل العمولة والعمل الإضافي"
//                           >
//                             {formatMoney(slip.otherAllowance)}
//                           </td>
//                           <td
//                             className="px-5 py-4 font-mono text-rose-400"
//                             title="غياب وتأخير"
//                           >
//                             {formatMoney(slip.deductions)}
//                           </td>
//                           <td className="px-5 py-4 font-mono text-emerald-400 font-black text-base">
//                             {formatMoney(slip.netSalary)}
//                           </td>
//                         </tr>
//                       ))}
//                     </tbody>
//                   </table>
//                   {filteredSlips.length === 0 && (
//                     <div className="p-10 text-center text-slate-600">
//                       لا توجد بيانات مطابقة للبحث.
//                     </div>
//                   )}
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }
