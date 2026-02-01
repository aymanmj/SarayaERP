// src/components/encounter/RadiologyTab.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { DicomViewer } from "../clinical/DicomViewer"; // 👈 استيراد جديد

// ... (نفس الـ Types السابقة: RadiologyStudy, RadiologyOrderDto...)
type RadiologyStudy = {
  id: number;
  code: string;
  name: string;
  modality?: string | null;
  bodyPart?: string | null;
};

type RadiologyOrderDto = {
  id: number;
  status: string;
  scheduledAt?: string | null;
  reportedAt?: string | null;
  reportText?: string | null;
  pacsUrl?: string | null;
  study: RadiologyStudy;
  order: {
    id: number;
    status: string;
    createdAt: string;
    notes?: string | null;
  };
};

type RadiologyTabProps = {
  encounterId: number;
  hospitalId: number;
  doctorId?: number | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RadiologyTab({
  encounterId,
  hospitalId,
  doctorId,
}: RadiologyTabProps) {
  const [loading, setLoading] = useState(false);
  const [studiesCatalog, setStudiesCatalog] = useState<RadiologyStudy[]>([]);
  const [orders, setOrders] = useState<RadiologyOrderDto[]>([]);

  // Form State
  const [selectedStudyIds, setSelectedStudyIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");

  // ✅ Viewer State
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  const canOrder = !!doctorId;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, catalogRes] = await Promise.all([
        apiClient.get<RadiologyOrderDto[]>(
          `/radiology/encounters/${encounterId}/orders`,
        ),
        apiClient.get<RadiologyStudy[]>(`/radiology/catalog`),
      ]);

      setOrders(ordersRes.data);
      setStudiesCatalog(catalogRes.data);
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل بيانات الأشعة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (encounterId && hospitalId) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId, hospitalId]);

  const toggleStudy = (id: number) => {
    setSelectedStudyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submitOrder = async () => {
    if (!canOrder) {
      toast.error("لا يمكن إنشاء طلب أشعة لأن الحالة غير مرتبطة بطبيب.");
      return;
    }

    if (selectedStudyIds.length === 0) {
      toast.warning("اختر فحص أشعة واحد على الأقل.");
      return;
    }

    try {
      await apiClient.post(`/radiology/encounters/${encounterId}/orders`, {
        doctorId,
        studyIds: selectedStudyIds,
        notes: notes || undefined,
      });

      toast.success("تم إنشاء طلب الأشعة بنجاح.");
      setSelectedStudyIds([]);
      setNotes("");
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error("حدث خطأ أثناء إنشاء طلب الأشعة.");
    }
  };

  return (
    <div className="space-y-4">
      {/* ✅ عارض الأشعة (يظهر عند وجود رابط) */}
      {viewImageUrl && (
        <DicomViewer
          imageId={viewImageUrl}
          onClose={() => setViewImageUrl(null)}
        />
      )}

      {/* القسم 1: طلب جديد */}
      <div className="border border-slate-800 rounded-2xl p-3 bg-slate-900/60 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-200">
            طلب فحوصات أشعة
          </h2>
          {!canOrder && (
            <span className="text-[11px] text-amber-400">
              لا يمكن إنشاء طلب أشعة لأن الحالة غير مرتبطة بطبيب أساسي.
            </span>
          )}
        </div>

        <div className="text-xs text-slate-400 mb-1">اختر الفحوصات:</div>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-auto border border-slate-800 rounded-2xl p-2 bg-slate-950/50">
          {studiesCatalog.length === 0 && (
            <div className="text-[11px] text-slate-500">
              لا توجد فحوصات أشعة مضافة بعد في كتالوج الأشعة.
            </div>
          )}

          {studiesCatalog.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleStudy(s.id)}
              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                selectedStudyIds.includes(s.id)
                  ? "bg-sky-600 text-white border-sky-500"
                  : "bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800"
              }`}
            >
              {s.name}
              {s.bodyPart ? ` – ${s.bodyPart}` : ""}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-300">
            ملاحظات لقسم الأشعة / سبب الطلب
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-slate-900/70 border border-slate-700 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/60"
            placeholder="مثال: تقييم آلام أسفل الظهر، ما قبل العملية..."
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={submitOrder}
            disabled={!canOrder}
            className="px-4 py-1.5 rounded-full text-xs bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"
          >
            حفظ طلب الأشعة
          </button>
        </div>
      </div>

      {/* القسم 2: الطلبات السابقة والنتائج */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-slate-200">
            طلبات الأشعة السابقة والتقارير
          </h3>
          {loading && (
            <span className="text-[11px] text-slate-500">
              جارِ تحميل البيانات...
            </span>
          )}
        </div>

        {orders.length === 0 ? (
          <div className="py-4 text-xs text-slate-500 text-center">
            لا توجد طلبات أشعة مسجلة لهذه الحالة حتى الآن.
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            {orders.map((o) => (
              <div
                key={o.id}
                className="border border-slate-800 rounded-2xl p-4 bg-slate-900/60 transition hover:bg-slate-900/80"
              >
                <div className="flex justify-between mb-2 pb-2 border-b border-slate-800">
                  <div>
                    <span className="text-slate-400">طلب #{o.order.id}</span>
                    <span className="text-slate-600 mx-2">|</span>
                    <span className="text-sky-300 font-bold">
                      {o.study.name}
                    </span>
                  </div>
                  <div className="text-slate-400">
                    {formatDateTime(o.order.createdAt)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div>
                      <span className="text-slate-500">حالة الطلب: </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${o.status === "COMPLETED" ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300"}`}
                      >
                        {o.status}
                      </span>
                    </div>
                    {o.study.modality && (
                      <div>
                        <span className="text-slate-500">الجهاز: </span>
                        <span className="text-slate-300">
                          {o.study.modality}
                        </span>
                      </div>
                    )}
                    {o.order.notes && (
                      <div className="text-amber-100/70 text-[11px] mt-1">
                        📝 ملاحظة الطبيب: {o.order.notes}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {o.reportText && (
                      <div className="bg-black/30 p-2 rounded border border-slate-700/50">
                        <div className="text-[10px] text-emerald-400 mb-1 font-bold">
                          📋 تقرير الاستشاري (Radiologist Report):
                        </div>
                        <div className="text-slate-200 whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto pr-1">
                          {o.reportText}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 justify-end mt-2">
                      {/* ✅ زر فتح الـ Viewer */}
                      {o.pacsUrl && (
                        <button
                          onClick={() => setViewImageUrl(o.pacsUrl!)}
                          className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-lg transition-all active:scale-95"
                        >
                          <span>📷</span> معاينة الصورة (PACS)
                        </button>
                      )}

                      {o.status === "COMPLETED" && (
                        <button
                          onClick={() =>
                            window.open(
                              `/radiology/orders/${o.id}/print`,
                              "_blank",
                            )
                          }
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs shadow-md transition-all"
                        >
                          <span>🖨️</span> طباعة التقرير
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// // src/components/encounter/RadiologyTab.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../../api/apiClient";
// import { toast } from "sonner";

// // تعريف الأنواع (Types)
// type RadiologyStudy = {
//   id: number;
//   code: string;
//   name: string;
//   modality?: string | null;
//   bodyPart?: string | null;
// };

// type RadiologyOrderDto = {
//   id: number;
//   status: string;
//   scheduledAt?: string | null;
//   reportedAt?: string | null;
//   reportText?: string | null; // ✅ تقرير الاستشاري
//   pacsUrl?: string | null; // ✅ رابط الصورة
//   study: RadiologyStudy;
//   order: {
//     id: number;
//     status: string;
//     createdAt: string;
//     notes?: string | null;
//   };
// };

// type RadiologyTabProps = {
//   encounterId: number;
//   hospitalId: number;
//   doctorId?: number | null;
// };

// function formatDateTime(iso: string) {
//   const d = new Date(iso);
//   return d.toLocaleString("ar-LY", {
//     year: "numeric",
//     month: "2-digit",
//     day: "2-digit",
//     hour: "2-digit",
//     minute: "2-digit",
//   });
// }

// export function RadiologyTab({
//   encounterId,
//   hospitalId,
//   doctorId,
// }: RadiologyTabProps) {
//   const [loading, setLoading] = useState(false);
//   const [studiesCatalog, setStudiesCatalog] = useState<RadiologyStudy[]>([]);
//   const [orders, setOrders] = useState<RadiologyOrderDto[]>([]);

//   // Form State
//   const [selectedStudyIds, setSelectedStudyIds] = useState<number[]>([]);
//   const [notes, setNotes] = useState("");

//   const canOrder = !!doctorId;

//   const fetchData = async () => {
//     setLoading(true);
//     try {
//       const [ordersRes, catalogRes] = await Promise.all([
//         apiClient.get<RadiologyOrderDto[]>(
//           `/radiology/encounters/${encounterId}/orders`,
//         ),
//         apiClient.get<RadiologyStudy[]>(`/radiology/catalog`),
//       ]);

//       setOrders(ordersRes.data);
//       setStudiesCatalog(catalogRes.data);
//     } catch (err) {
//       console.error(err);
//       toast.error("حدث خطأ أثناء تحميل بيانات الأشعة");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     if (encounterId && hospitalId) {
//       fetchData();
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [encounterId, hospitalId]);

//   const toggleStudy = (id: number) => {
//     setSelectedStudyIds((prev) =>
//       prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
//     );
//   };

//   const submitOrder = async () => {
//     if (!canOrder) {
//       toast.error("لا يمكن إنشاء طلب أشعة لأن الحالة غير مرتبطة بطبيب.");
//       return;
//     }

//     if (selectedStudyIds.length === 0) {
//       toast.warning("اختر فحص أشعة واحد على الأقل.");
//       return;
//     }

//     try {
//       await apiClient.post(`/radiology/encounters/${encounterId}/orders`, {
//         doctorId,
//         studyIds: selectedStudyIds,
//         notes: notes || undefined,
//       });

//       toast.success("تم إنشاء طلب الأشعة بنجاح.");
//       setSelectedStudyIds([]);
//       setNotes("");
//       fetchData();
//     } catch (err: any) {
//       console.error(err);
//       toast.error("حدث خطأ أثناء إنشاء طلب الأشعة.");
//     }
//   };

//   return (
//     <div className="space-y-4">
//       {/* القسم 1: طلب جديد */}
//       <div className="border border-slate-800 rounded-2xl p-3 bg-slate-900/60 space-y-3">
//         <div className="flex justify-between items-center">
//           <h2 className="text-sm font-semibold text-slate-200">
//             طلب فحوصات أشعة
//           </h2>
//           {!canOrder && (
//             <span className="text-[11px] text-amber-400">
//               لا يمكن إنشاء طلب أشعة لأن الحالة غير مرتبطة بطبيب أساسي.
//             </span>
//           )}
//         </div>

//         {/* أزرار الكتالوج */}
//         <div className="text-xs text-slate-400 mb-1">اختر الفحوصات:</div>
//         <div className="flex flex-wrap gap-2 max-h-40 overflow-auto border border-slate-800 rounded-2xl p-2 bg-slate-950/50">
//           {studiesCatalog.length === 0 && (
//             <div className="text-[11px] text-slate-500">
//               لا توجد فحوصات أشعة مضافة بعد في كتالوج الأشعة.
//             </div>
//           )}

//           {studiesCatalog.map((s) => (
//             <button
//               key={s.id}
//               type="button"
//               onClick={() => toggleStudy(s.id)}
//               className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
//                 selectedStudyIds.includes(s.id)
//                   ? "bg-sky-600 text-white border-sky-500"
//                   : "bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800"
//               }`}
//             >
//               {s.name}
//               {s.bodyPart ? ` – ${s.bodyPart}` : ""}
//             </button>
//           ))}
//         </div>

//         {/* ملاحظات وزر الحفظ */}
//         <div className="flex flex-col gap-1">
//           <label className="text-xs text-slate-300">
//             ملاحظات لقسم الأشعة / سبب الطلب
//           </label>
//           <input
//             type="text"
//             value={notes}
//             onChange={(e) => setNotes(e.target.value)}
//             className="bg-slate-900/70 border border-slate-700 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/60"
//             placeholder="مثال: تقييم آلام أسفل الظهر، ما قبل العملية..."
//           />
//         </div>

//         <div className="flex justify-end">
//           <button
//             type="button"
//             onClick={submitOrder}
//             disabled={!canOrder}
//             className="px-4 py-1.5 rounded-full text-xs bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"
//           >
//             حفظ طلب الأشعة
//           </button>
//         </div>
//       </div>

//       {/* القسم 2: الطلبات السابقة والنتائج */}
//       <div className="border-t border-slate-800 pt-3">
//         <div className="flex justify-between items-center mb-2">
//           <h3 className="text-sm font-semibold text-slate-200">
//             طلبات الأشعة السابقة والتقارير
//           </h3>
//           {loading && (
//             <span className="text-[11px] text-slate-500">
//               جارِ تحميل البيانات...
//             </span>
//           )}
//         </div>

//         {orders.length === 0 ? (
//           <div className="py-4 text-xs text-slate-500 text-center">
//             لا توجد طلبات أشعة مسجلة لهذه الحالة حتى الآن.
//           </div>
//         ) : (
//           <div className="space-y-3 text-xs">
//             {orders.map((o) => (
//               <div
//                 key={o.id}
//                 className="border border-slate-800 rounded-2xl p-4 bg-slate-900/60 transition hover:bg-slate-900/80"
//               >
//                 {/* Header Info */}
//                 <div className="flex justify-between mb-2 pb-2 border-b border-slate-800">
//                   <div>
//                     <span className="text-slate-400">طلب #{o.order.id}</span>
//                     <span className="text-slate-600 mx-2">|</span>
//                     <span className="text-sky-300 font-bold">
//                       {o.study.name}
//                     </span>
//                   </div>
//                   <div className="text-slate-400">
//                     {formatDateTime(o.order.createdAt)}
//                   </div>
//                 </div>

//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                   {/* بيانات الطلب */}
//                   <div className="space-y-1">
//                     <div>
//                       <span className="text-slate-500">حالة الطلب: </span>
//                       <span
//                         className={`px-2 py-0.5 rounded text-[10px] ${o.status === "COMPLETED" ? "bg-emerald-900 text-emerald-300" : "bg-amber-900 text-amber-300"}`}
//                       >
//                         {o.status}
//                       </span>
//                     </div>
//                     {o.study.modality && (
//                       <div>
//                         <span className="text-slate-500">الجهاز: </span>
//                         <span className="text-slate-300">
//                           {o.study.modality}
//                         </span>
//                       </div>
//                     )}
//                     {o.order.notes && (
//                       <div className="text-amber-100/70 text-[11px] mt-1">
//                         📝 ملاحظة الطبيب: {o.order.notes}
//                       </div>
//                     )}
//                   </div>

//                   {/* بيانات التقرير والصورة */}
//                   <div className="space-y-2">
//                     {/* 📄 عرض نص التقرير */}
//                     {o.reportText && (
//                       <div className="bg-black/30 p-2 rounded border border-slate-700/50">
//                         <div className="text-[10px] text-emerald-400 mb-1 font-bold">
//                           📋 تقرير الاستشاري (Radiologist Report):
//                         </div>
//                         <div className="text-slate-200 whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto pr-1">
//                           {o.reportText}
//                         </div>
//                       </div>
//                     )}

//                     <div className="flex gap-2 justify-end mt-2">
//                       {/* 📷 زر عرض الصورة */}
//                       {o.pacsUrl && (
//                         <div className="mt-2 flex justify-end">
//                           <a
//                             href={o.pacsUrl}
//                             target="_blank"
//                             rel="noopener noreferrer"
//                             className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-lg transition-all"
//                           >
//                             <span>📷</span> مشاهدة صورة الأشعة (PACS)
//                           </a>
//                         </div>
//                       )}

//                       {/* 🖨️ زر طباعة التقرير */}
//                       {o.status === "COMPLETED" && (
//                         <button
//                           onClick={() =>
//                             window.open(
//                               `/radiology/orders/${o.id}/print`,
//                               "_blank",
//                             )
//                           }
//                           className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs shadow-md transition-all"
//                         >
//                           <span>🖨️</span> طباعة التقرير
//                         </button>
//                       )}
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
