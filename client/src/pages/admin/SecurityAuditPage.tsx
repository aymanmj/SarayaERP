import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import {
  ShieldCheckIcon,
  EyeIcon,
  PencilSquareIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

export default function SecurityAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/audit/logs", {
        params: { actionType: filter },
      });
      setLogs(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [filter]);

  return (
    <div className="p-6 space-y-6 text-slate-100" dir="rtl">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-rose-500/20 rounded-2xl border border-rose-500/40">
            <ShieldCheckIcon className="w-8 h-8 text-rose-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black">مركز الرقابة الأمنية</h1>
            <p className="text-slate-400 text-xs mt-1">
              سجل الوصول والاطلاع على البيانات الحساسة ممتثل لـ HIPAA
            </p>
          </div>
        </div>

        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          {[
            { id: "ALL", label: "الكل" },
            { id: "VIEW", label: "إطلاع (Access)" },
            { id: "WRITE", label: "تعديل (Changes)" },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setFilter(btn.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === btn.id ? "bg-slate-700 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </header>

      <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-900/50 text-slate-400">
            <tr>
              <th className="p-4 font-bold uppercase tracking-wider">
                التوقيت
              </th>
              <th className="p-4 font-bold uppercase tracking-wider">
                الموظف المسؤول
              </th>
              <th className="p-4 font-bold uppercase tracking-wider">
                نوع العملية
              </th>
              <th className="p-4 font-bold uppercase tracking-wider">
                المريض المستهدف
              </th>
              <th className="p-4 font-bold uppercase tracking-wider">
                عنوان IP
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900">
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="p-10 text-center text-slate-500 animate-pulse"
                >
                  جاري جلب سجلات التدقيق...
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  <td className="p-4 text-slate-400 font-mono text-xs">
                    {new Date(log.createdAt).toLocaleString("ar-LY")}
                  </td>
                  <td className="p-4 font-bold text-sky-400">
                    {log.user?.fullName}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {log.action.includes("VIEW") ? (
                        <EyeIcon className="w-4 h-4 text-blue-400" />
                      ) : (
                        <PencilSquareIcon className="w-4 h-4 text-rose-400" />
                      )}
                      <span
                        className={
                          log.action.includes("VIEW")
                            ? "text-blue-300"
                            : "text-rose-300"
                        }
                      >
                        {log.action}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="bg-slate-800 px-3 py-1 rounded-full text-xs text-slate-100 border border-slate-700">
                      {log.details?.patientName || `ID: ${log.entityId}`}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-500">
                    {log.ipAddress}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// // src/pages/admin/SecurityAuditPage.tsx
// import { useEffect, useState } from "react";
// import { apiClient } from "../../api/apiClient";
// import {
//   ShieldCheckIcon,
//   EyeIcon,
//   PencilSquareIcon,
// } from "@heroicons/react/24/outline";

// export default function SecurityAuditPage() {
//   const [logs, setLogs] = useState<any[]>([]);
//   const [filter, setFilter] = useState("ALL"); // ALL, VIEW, WRITE

//   const loadLogs = async () => {
//     const res = await apiClient.get("/audit/logs", {
//       params: { actionType: filter },
//     });
//     setLogs(res.data);
//   };

//   useEffect(() => {
//     loadLogs();
//   }, [filter]);

//   return (
//     <div className="p-6 space-y-6 text-slate-100" dir="rtl">
//       <div className="flex justify-between items-center">
//         <div className="flex items-center gap-3">
//           <ShieldCheckIcon className="w-10 h-10 text-rose-500" />
//           <div>
//             <h1 className="text-2xl font-bold">
//               مركز الرقابة الأمنية (HIPAA Compliance)
//             </h1>
//             <p className="text-slate-400 text-sm">
//               تتبع سجلات الاطلاع والوصول للملفات الطبية الحساسة.
//             </p>
//           </div>
//         </div>

//         <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
//           <button
//             onClick={() => setFilter("ALL")}
//             className={`px-4 py-2 rounded-lg text-xs ${filter === "ALL" ? "bg-slate-700 text-white" : "text-slate-500"}`}
//           >
//             الكل
//           </button>
//           <button
//             onClick={() => setFilter("VIEW")}
//             className={`px-4 py-2 rounded-lg text-xs ${filter === "VIEW" ? "bg-blue-600 text-white" : "text-slate-500"}`}
//           >
//             إطلاع فقط (Views)
//           </button>
//           <button
//             onClick={() => setFilter("WRITE")}
//             className={`px-4 py-2 rounded-lg text-xs ${filter === "WRITE" ? "bg-rose-600 text-white" : "text-slate-500"}`}
//           >
//             تعديلات (Modifications)
//           </button>
//         </div>
//       </div>

//       <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
//         <table className="w-full text-right text-sm">
//           <thead className="bg-slate-900 text-slate-400">
//             <tr>
//               <th className="p-4">الوقت</th>
//               <th className="p-4">الموظف</th>
//               <th className="p-4">العملية</th>
//               <th className="p-4">المريض المستهدف</th>
//               <th className="p-4">عنوان IP</th>
//               <th className="p-4">التفاصيل</th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-slate-900">
//             {logs.map((log) => (
//               <tr key={log.id} className="hover:bg-slate-900/50 transition">
//                 <td className="p-4 text-slate-400 text-xs">
//                   {new Date(log.createdAt).toLocaleString("ar-LY")}
//                 </td>
//                 <td className="p-4 font-bold text-sky-400">
//                   {log.user?.fullName}
//                 </td>
//                 <td className="p-4">
//                   <div className="flex items-center gap-2">
//                     {log.action.includes("VIEW") ? (
//                       <EyeIcon className="w-4 h-4 text-blue-400" />
//                     ) : (
//                       <PencilSquareIcon className="w-4 h-4 text-rose-400" />
//                     )}
//                     <span
//                       className={
//                         log.action.includes("VIEW")
//                           ? "text-blue-300"
//                           : "text-rose-300"
//                       }
//                     >
//                       {log.action}
//                     </span>
//                   </div>
//                 </td>
//                 <td className="p-4">
//                   <span className="bg-slate-800 px-2 py-1 rounded text-xs text-slate-200">
//                     {log.details?.patientName || `ID: ${log.entityId}`}
//                   </span>
//                 </td>
//                 <td className="p-4 font-mono text-xs text-slate-500">
//                   {log.ipAddress}
//                 </td>
//                 <td className="p-4">
//                   <button className="text-[10px] text-slate-500 underline">
//                     مشاهدة الـ Payload
//                   </button>
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// }
