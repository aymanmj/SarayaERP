// src/components/encounter/LabsTab.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

// ✅ Types
type LabOrderResult = {
  id: number;
  parameterName: string;
  value: string;
  unit: string | null;
  range: string | null;
  flag: string | null;
};

type LabTest = { id: number; code: string; name: string; unit?: string | null };

type LabOrderDto = {
  id: number;
  resultStatus: string;
  // Legacy single result fields
  resultValue?: string | null;
  resultUnit?: string | null;
  referenceRange?: string | null;

  test: LabTest;
  order: {
    id: number;
    status: string;
    createdAt: string;
    notes?: string | null;
  };
  results?: LabOrderResult[]; // ✅ النتائج التفصيلية
};

type LabsTabProps = {
  encounterId: number;
  hospitalId: number;
  doctorId?: number | null; // ✅ قد يكون null
};

export function LabsTab({ encounterId, hospitalId, doctorId }: LabsTabProps) {
  const [labOrders, setLabOrders] = useState<LabOrderDto[]>([]);
  const [testsCatalog, setTestsCatalog] = useState<LabTest[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const canOrder = !!doctorId;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, catalogRes] = await Promise.all([
        apiClient.get<LabOrderDto[]>(`/lab/encounters/${encounterId}/orders`),
        apiClient.get<LabTest[]>(`/lab/catalog`),
      ]);
      setLabOrders(ordersRes.data);
      setTestsCatalog(catalogRes.data);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل بيانات المختبر");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (encounterId) fetchData();
  }, [encounterId]);

  const toggleTest = (id: number) => {
    setSelectedTestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submitOrder = async () => {
    if (!canOrder) {
      toast.error("لا يمكن الطلب. يرجى تعيين طبيب للحالة أولاً.");
      return;
    }
    if (selectedTestIds.length === 0) {
      toast.warning("يجب اختيار تحليل واحد على الأقل.");
      return;
    }

    try {
      await apiClient.post(`/lab/encounters/${encounterId}/orders`, {
        doctorId,
        testIds: selectedTestIds,
        notes: notes || undefined,
      });
      toast.success("تم إرسال الطلب للمختبر");
      setSelectedTestIds([]);
      setNotes("");
      fetchData();
    } catch (e) {
      toast.error("فشل إرسال الطلب");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. منطقة الطلب */}
      <div
        className={`border border-slate-800 rounded-2xl p-4 bg-slate-900/60 shadow-sm ${!canOrder ? "opacity-70 pointer-events-none grayscale" : ""}`}
      >
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-sm text-slate-200">
            طلب تحاليل جديدة
          </h3>
          {!canOrder && (
            <span className="text-[10px] text-rose-300 font-bold bg-rose-950/40 border border-rose-800/50 px-2 py-1 rounded">
              ⛔ يجب تعيين طبيب أولاً
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4 max-h-40 overflow-y-auto pr-1">
          {testsCatalog.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleTest(t.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                selectedTestIds.includes(t.id)
                  ? "bg-sky-600 border-sky-500 text-white font-semibold shadow-md"
                  : "bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs flex-1 outline-none focus:border-sky-500"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات للمختبر (مثال: مستعجل، صائم)..."
          />
          <button
            onClick={submitOrder}
            disabled={!canOrder}
            className="bg-sky-600 hover:bg-sky-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 transition"
          >
            إرسال الطلب
          </button>
        </div>
      </div>

      {/* 2. سجل الطلبات والنتائج */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-400 px-1">
          سجل التحاليل السابقة
        </h3>

        {labOrders.length === 0 && !loading && (
          <div className="text-center text-xs text-slate-500 py-6 border border-dashed border-slate-800 rounded-2xl">
            لا توجد طلبات سابقة.
          </div>
        )}

        {labOrders.map((lo) => (
          <div
            key={lo.id}
            className="border border-slate-800 rounded-2xl p-4 bg-slate-900/40"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800/50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sky-400">{lo.test.name}</span>
                <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-1.5 rounded">
                  #{lo.order.id}
                </span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-medium ${lo.resultStatus === "COMPLETED" ? "bg-emerald-900/30 text-emerald-300 border border-emerald-500/20" : "bg-amber-900/30 text-amber-300 border border-amber-500/20"}`}
              >
                {lo.resultStatus === "COMPLETED" ? "مكتمل" : "قيد الإجراء"}
              </span>
            </div>

            {/* Content (Results) */}
            {lo.results && lo.results.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-950/30">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-800/50 text-slate-400">
                    <tr>
                      <th className="p-2 font-normal">المعيار</th>
                      <th className="p-2 font-normal">النتيجة</th>
                      <th className="p-2 font-normal">الوحدة</th>
                      <th className="p-2 font-normal text-left" dir="ltr">
                        Range
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {lo.results.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="p-2 text-slate-300 font-medium">
                          {r.parameterName}
                        </td>
                        <td className="p-2 font-bold text-slate-100" dir="ltr">
                          {r.value}
                          {r.flag && (
                            <span className="ml-2 text-[9px] text-rose-400 font-bold bg-rose-950/50 px-1 rounded">
                              {r.flag}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-slate-500">{r.unit}</td>
                        <td
                          className="p-2 text-slate-500 text-left font-mono text-[10px]"
                          dir="ltr"
                        >
                          {r.range}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Simple Result View (Legacy compatibility) */
              lo.resultValue && (
                <div className="mt-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-sm flex items-center gap-2">
                  <span className="text-slate-400 text-xs">النتيجة:</span>
                  <span className="text-emerald-400 font-bold font-mono text-lg">
                    {lo.resultValue}
                  </span>
                  <span className="text-slate-500 text-xs">
                    {lo.resultUnit}
                  </span>
                  {lo.referenceRange && (
                    <span className="mr-auto text-[10px] text-slate-600 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      Range: {lo.referenceRange}
                    </span>
                  )}
                </div>
              )
            )}

            {/* Notes if any */}
            {lo.order.notes && (
              <div className="mt-2 text-[10px] text-amber-200/60 bg-amber-900/10 p-2 rounded border border-amber-900/20">
                ملاحظة: {lo.order.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// // src/components/encounter/LabsTab.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../../api/apiClient";
// import { toast } from "sonner";

// // ... (Types تبقى كما هي) ...
// type LabTest = { id: number; code: string; name: string; unit?: string | null };
// type LabOrderDto = {
//   id: number;
//   resultStatus: string;
//   resultValue?: string | null;
//   resultUnit?: string | null;
//   referenceRange?: string | null;
//   test: LabTest;
//   order: {
//     id: number;
//     status: string;
//     createdAt: string;
//     notes?: string | null;
//   };
//   results?: any[];
// };

// type LabsTabProps = {
//   encounterId: number;
//   hospitalId: number;
//   doctorId?: number | null; // ✅ قد يكون null
// };

// export function LabsTab({ encounterId, hospitalId, doctorId }: LabsTabProps) {
//   const [loading, setLoading] = useState(false);
//   const [labOrders, setLabOrders] = useState<LabOrderDto[]>([]);
//   const [testsCatalog, setTestsCatalog] = useState<LabTest[]>([]);
//   const [selectedTestIds, setSelectedTestIds] = useState<number[]>([]);
//   const [notes, setNotes] = useState("");

//   const canOrder = !!doctorId; // ✅ متغير التحكم

//   const fetchData = async () => {
//     try {
//       const [ordersRes, catalogRes] = await Promise.all([
//         apiClient.get<LabOrderDto[]>(`/lab/encounters/${encounterId}/orders`),
//         apiClient.get<LabTest[]>(`/lab/catalog`),
//       ]);
//       setLabOrders(ordersRes.data);
//       setTestsCatalog(catalogRes.data);
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   useEffect(() => {
//     if (encounterId) fetchData();
//   }, [encounterId]);

//   const toggleTest = (id: number) => {
//     setSelectedTestIds((prev) =>
//       prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
//     );
//   };

//   const submitOrder = async () => {
//     if (!canOrder) {
//       toast.error("لا يمكن الطلب. يرجى تعيين طبيب للحالة أولاً.");
//       return;
//     }
//     if (selectedTestIds.length === 0) return;

//     try {
//       await apiClient.post(`/lab/encounters/${encounterId}/orders`, {
//         doctorId,
//         testIds: selectedTestIds,
//         notes: notes || undefined,
//       });
//       toast.success("تم الطلب");
//       setSelectedTestIds([]);
//       setNotes("");
//       fetchData();
//     } catch (e) {
//       toast.error("فشل الطلب");
//     }
//   };

//   return (
//     <div className="space-y-4">
//       {/* منطقة الطلب */}
//       <div
//         className={`border border-slate-800 rounded-2xl p-4 bg-slate-900/60 ${!canOrder ? "opacity-70 pointer-events-none grayscale" : ""}`}
//       >
//         <div className="flex justify-between items-center mb-3">
//           <h3 className="font-semibold text-sm">طلب تحاليل جديدة</h3>
//           {!canOrder && (
//             <span className="text-xs text-rose-400 font-bold bg-rose-950/30 px-2 py-1 rounded">
//               ⛔ يجب تعيين طبيب أولاً
//             </span>
//           )}
//         </div>

//         <div className="flex flex-wrap gap-2 mb-3 max-h-40 overflow-y-auto">
//           {testsCatalog.map((t) => (
//             <button
//               key={t.id}
//               onClick={() => toggleTest(t.id)}
//               className={`text-xs px-3 py-1.5 rounded-lg border transition ${
//                 selectedTestIds.includes(t.id)
//                   ? "bg-sky-600 border-sky-500 text-white"
//                   : "bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800"
//               }`}
//             >
//               {t.name}
//             </button>
//           ))}
//         </div>
//         <div className="flex gap-2">
//           <input
//             className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs flex-1 outline-none focus:border-sky-500"
//             value={notes}
//             onChange={(e) => setNotes(e.target.value)}
//             placeholder="ملاحظات للمختبر..."
//           />
//           <button
//             onClick={submitOrder}
//             disabled={!canOrder}
//             className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg disabled:opacity-50"
//           >
//             إرسال الطلب
//           </button>
//         </div>
//       </div>

//       {/* القائمة السابقة */}
//       <div className="space-y-3">
//         {labOrders.map((lo) => (
//           <div
//             key={lo.id}
//             className="border border-slate-800 rounded-2xl p-4 bg-slate-900/40"
//           >
//             <div className="flex justify-between items-center mb-2">
//               <span className="font-bold text-sky-400">{lo.test.name}</span>
//               <span
//                 className={`text-[10px] px-2 py-0.5 rounded ${lo.resultStatus === "COMPLETED" ? "bg-emerald-900/30 text-emerald-300" : "bg-amber-900/30 text-amber-300"}`}
//               >
//                 {lo.resultStatus}
//               </span>
//             </div>
//             {/* عرض النتائج كما في الكود السابق */}
//             {lo.results && lo.results.length > 0 ? (
//               <div className="mt-2 text-xs">
//                 {lo.results.map((r, idx) => (
//                   <div
//                     key={idx}
//                     className="flex justify-between border-b border-slate-800/50 py-1 last:border-0"
//                   >
//                     <span className="text-slate-400">{r.parameterName}</span>
//                     <span className="text-slate-100 font-bold" dir="ltr">
//                       {r.value}{" "}
//                       <span className="text-[10px] text-slate-500">
//                         {r.unit}
//                       </span>
//                     </span>
//                   </div>
//                 ))}
//               </div>
//             ) : (
//               lo.resultValue && (
//                 <div className="mt-1 text-xs text-slate-300">
//                   النتيجة:{" "}
//                   <span className="font-bold text-white">{lo.resultValue}</span>{" "}
//                   {lo.resultUnit}
//                 </div>
//               )
//             )}
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }
