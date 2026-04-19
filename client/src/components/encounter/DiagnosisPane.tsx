// src/components/encounter/DiagnosisPane.tsx

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { SmartCombobox } from "../ui/SmartCombobox"; // ✅ التأكد من الاستيراد

type DiagnosisCode = {
  id: number;
  code: string;
  nameEn: string;
  nameAr?: string;
  display?: string;
  displayAr?: string;
};

type EncounterDiagnosis = {
  id: number;
  type: "PRIMARY" | "SECONDARY" | "RULE_OUT";
  note?: string;
  diagnosisCode: DiagnosisCode;
  createdAt: string;
};

export function DiagnosisPane({ encounterId }: { encounterId: number }) {
  const [diagnoses, setDiagnoses] = useState<EncounterDiagnosis[]>([]);
  const [selectedCode, setSelectedCode] = useState<DiagnosisCode | null>(null);

  // Form State
  const [type, setType] = useState<"PRIMARY" | "SECONDARY" | "RULE_OUT">(
    "PRIMARY",
  );
  const [note, setNote] = useState("");

  const loadDiagnoses = useCallback(async () => {
    try {
      const res = await apiClient.get<EncounterDiagnosis[]>(
        `/diagnosis/encounter/${encounterId}`,
      );
      setDiagnoses(res.data);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل التشخيصات");
    }
  }, [encounterId]);

  useEffect(() => {
    if (encounterId) loadDiagnoses();
  }, [encounterId, loadDiagnoses]);

  // ✅ دالة البحث الجديدة المتوافقة مع SmartCombobox
  const searchDiagnosis = async (query: string) => {
    // استخدم محرك الـ Terminology العالمي للبحث عن أمراض بناءً على نظام ICD10
    const res = await apiClient.get<any[]>(
      `/terminology/ICD10/search?q=${query}`,
    );
    return res.data.map((d) => ({
      id: d.id, // terminologyConceptId
      label: d.display,
      subLabel: d.displayAr,
      code: d.code,
      original: d, // الاحتفاظ بالكائن الأصلي
    }));
  };

  // ✅ دالة الاختيار
  const handleSelect = (option: any) => {
    setSelectedCode(option.original);
  };

  const handleAdd = async () => {
    if (!selectedCode) return;
    try {
      await apiClient.post(`/diagnosis/encounter/${encounterId}`, {
        terminologySystem: "ICD10",
        terminologyCode: selectedCode.code,
        type,
        note: note || undefined,
      });
      toast.success("تم إضافة التشخيص");

      // Reset Form
      setSelectedCode(null);
      setNote("");
      loadDiagnoses();
    } catch (err) {
      console.error(err);
      toast.error("فشل الإضافة");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا التشخيص؟")) return;
    try {
      await apiClient.delete(`/diagnosis/${id}`);
      toast.success("تم الحذف");
      loadDiagnoses();
    } catch (err) {
      toast.error("فشل الحذف");
    }
  };

  return (
    <div className="space-y-4">
      {/* منطقة البحث والإضافة */}
      <div className="bg-slate-900/60 border border-slate-700 p-5 rounded-2xl relative shadow-sm transition-all hover:border-slate-600">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          🔎 إضافة تشخيص (ICD-10)
        </h3>

        {!selectedCode ? (
          <div className="w-full">
            {/* ✅ استخدام المكون الذكي */}
            <SmartCombobox
              placeholder="ابحث عن المرض (الاسم أو الكود)... مثال: Diabetes, E11"
              onSearch={searchDiagnosis}
              onSelect={handleSelect}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
            {/* عرض الكود المختار */}
            <div className="flex justify-between items-center bg-emerald-900/20 border border-emerald-500/30 p-3 rounded-xl">
              <div className="text-sm text-emerald-100">
                <span className="font-mono font-bold text-emerald-400 mr-2 text-lg">
                  {selectedCode.code}
                </span>
                <span className="font-semibold">{selectedCode.display || selectedCode.nameEn}</span>
                {(selectedCode.displayAr || selectedCode.nameAr) && (
                  <div className="text-slate-400 text-xs mt-1 mr-8">
                    {selectedCode.displayAr || selectedCode.nameAr}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedCode(null)}
                className="text-xs text-slate-400 hover:text-white px-3 py-1.5 hover:bg-slate-800 rounded-lg transition"
              >
                تغيير
              </button>
            </div>

            {/* تفاصيل التشخيص والإضافة */}
            <div className="flex gap-2 items-center">
              <select
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-emerald-500 w-32"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
              >
                <option value="PRIMARY">رئيسي</option>
                <option value="SECONDARY">ثانوي</option>
                <option value="RULE_OUT">اشتباه</option>
              </select>

              <input
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-emerald-500"
                placeholder="ملاحظات إضافية (اختياري)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />

              <button
                onClick={handleAdd}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition transform active:scale-95"
              >
                تأكيد الإضافة
              </button>
            </div>
          </div>
        )}
      </div>

      {/* قائمة التشخيصات */}
      <div className="space-y-2">
        {diagnoses.length === 0 && (
          <div className="text-center text-xs text-slate-500 py-6 border border-dashed border-slate-800 rounded-2xl">
            لا توجد تشخيصات مسجلة بعد. ابدأ بالبحث أعلاه.
          </div>
        )}

        {diagnoses.map((d) => (
          <div
            key={d.id}
            className="bg-slate-900/40 border border-slate-800 p-3 rounded-xl flex justify-between items-center group hover:bg-slate-900/60 transition"
          >
            <div>
              <div className="flex flex-wrap gap-2 items-center mb-1">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                    d.type === "PRIMARY"
                      ? "bg-emerald-900/30 border-emerald-500/30 text-emerald-300"
                      : d.type === "SECONDARY"
                        ? "bg-sky-900/30 border-sky-500/30 text-sky-300"
                        : "bg-amber-900/30 border-amber-500/30 text-amber-300"
                  }`}
                >
                  {d.type === "PRIMARY"
                    ? "رئيسي"
                    : d.type === "SECONDARY"
                      ? "ثانوي"
                      : "اشتباه"}
                </span>
                <span className="font-mono text-sm font-bold text-slate-200 bg-slate-950 px-1.5 rounded text-opacity-80 border border-slate-800">
                  {d.diagnosisCode.code}
                </span>
                <span className="text-sm text-slate-200 font-medium">
                  {d.diagnosisCode.nameEn}
                </span>
              </div>
              {/* عرض الاسم العربي إن وجد */}
              {d.diagnosisCode.nameAr && (
                <div className="text-xs text-slate-500 mr-20 mb-1">
                  {d.diagnosisCode.nameAr}
                </div>
              )}
              {d.note && (
                <div className="text-xs text-slate-400 mr-2 flex items-center gap-1 bg-slate-950/50 px-2 py-1 rounded w-fit">
                  <span className="text-amber-500/60">📝</span> {d.note}
                </div>
              )}
            </div>
            <button
              onClick={() => handleDelete(d.id)}
              className="text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-rose-900/20 rounded-lg"
              title="حذف التشخيص"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// // src/components/encounter/DiagnosisPane.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../../api/apiClient";
// import { toast } from "sonner";
// import { SmartCombobox } from "../ui/SmartCombobox";

// type DiagnosisCode = {
//   id: number;
//   code: string;
//   nameEn: string;
//   nameAr?: string;
// };

// type EncounterDiagnosis = {
//   id: number;
//   type: "PRIMARY" | "SECONDARY" | "RULE_OUT";
//   note?: string;
//   diagnosisCode: DiagnosisCode;
//   createdAt: string;
// };

// export function DiagnosisPane({ encounterId }: { encounterId: number }) {
//   const [diagnoses, setDiagnoses] = useState<EncounterDiagnosis[]>([]);

//   // Search State
//   const [query, setQuery] = useState("");
//   const [results, setResults] = useState<DiagnosisCode[]>([]);
//   const [searching, setSearching] = useState(false);
//   const [selectedCode, setSelectedCode] = useState<DiagnosisCode | null>(null);

//   // Form State
//   const [type, setType] = useState<"PRIMARY" | "SECONDARY" | "RULE_OUT">(
//     "PRIMARY",
//   );
//   const [note, setNote] = useState("");

//   const loadDiagnoses = async () => {
//     try {
//       const res = await apiClient.get<EncounterDiagnosis[]>(
//         `/diagnosis/encounter/${encounterId}`,
//       );
//       setDiagnoses(res.data);
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   useEffect(() => {
//     if (encounterId) loadDiagnoses();
//   }, [encounterId]);

//   // البحث عند الكتابة (Debounce)
//   useEffect(() => {
//     if (query.length < 2) {
//       setResults([]);
//       return;
//     }
//     const timer = setTimeout(async () => {
//       setSearching(true);
//       try {
//         const res = await apiClient.get<DiagnosisCode[]>(
//           `/diagnosis/search?q=${query}`,
//         );
//         setResults(res.data);
//       } finally {
//         setSearching(false);
//       }
//     }, 400);

//     return () => clearTimeout(timer);
//   }, [query]);

//   const handleAdd = async () => {
//     if (!selectedCode) return;
//     try {
//       await apiClient.post(`/diagnosis/encounter/${encounterId}`, {
//         codeId: selectedCode.id,
//         type,
//         note: note || undefined,
//       });
//       toast.success("تم إضافة التشخيص");
//       // Reset
//       setQuery("");
//       setResults([]);
//       setSelectedCode(null);
//       setNote("");
//       loadDiagnoses();
//     } catch (err) {
//       console.error(err);
//       toast.error("فشل الإضافة");
//     }
//   };

//   const handleDelete = async (id: number) => {
//     if (!confirm("هل أنت متأكد من حذف هذا التشخيص؟")) return;
//     try {
//       await apiClient.delete(`/diagnosis/${id}`);
//       toast.success("تم الحذف");
//       loadDiagnoses();
//     } catch (err) {
//       console.error(err);
//       toast.error("فشل الحذف");
//     }
//   };

//   return (
//     <div className="space-y-4">
//       {/* منطقة البحث والإضافة */}
//       <div className="bg-slate-900/60 border border-slate-700 p-4 rounded-2xl relative shadow-sm">
//         <h3 className="text-sm font-semibold text-slate-200 mb-3">
//           إضافة تشخيص (ICD-10)
//         </h3>

//         {!selectedCode ? (
//           <div className="relative">
//             <input
//               type="text"
//               className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 outline-none transition"
//               placeholder="ابحث عن اسم المرض أو الكود (مثال: Diabetes, E11, صداع)..."
//               value={query}
//               onChange={(e) => setQuery(e.target.value)}
//             />
//             {searching && (
//               <div className="absolute left-3 top-3 text-xs text-slate-500">
//                 جاري البحث...
//               </div>
//             )}

//             {/* نتائج البحث */}
//             {results.length > 0 && (
//               <div className="absolute z-10 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
//                 {results.map((code) => (
//                   <button
//                     key={code.id}
//                     onClick={() => {
//                       setSelectedCode(code);
//                       setQuery("");
//                       setResults([]);
//                     }}
//                     className="w-full text-right px-4 py-2 hover:bg-slate-800 text-xs border-b border-slate-800 last:border-0 flex items-center justify-between group"
//                   >
//                     <span>
//                       {code.nameEn}
//                       {code.nameAr && (
//                         <span className="text-slate-400 mr-2">
//                           ({code.nameAr})
//                         </span>
//                       )}
//                     </span>
//                     <span className="font-mono font-bold text-emerald-400 bg-emerald-900/20 px-2 py-0.5 rounded border border-emerald-900/50 group-hover:bg-emerald-900/40">
//                       {code.code}
//                     </span>
//                   </button>
//                 ))}
//               </div>
//             )}
//           </div>
//         ) : (
//           <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
//             <div className="flex justify-between items-center bg-emerald-900/20 border border-emerald-500/30 p-3 rounded-xl">
//               <div className="text-sm text-emerald-100">
//                 <span className="font-mono font-bold text-emerald-400 mr-2">
//                   {selectedCode.code}
//                 </span>
//                 {selectedCode.nameEn}
//                 {selectedCode.nameAr && (
//                   <span className="text-slate-400 text-xs mr-2">
//                     ({selectedCode.nameAr})
//                   </span>
//                 )}
//               </div>
//               <button
//                 onClick={() => setSelectedCode(null)}
//                 className="text-xs text-slate-400 hover:text-white px-2 py-1 hover:bg-slate-800 rounded"
//               >
//                 تغيير
//               </button>
//             </div>

//             <div className="flex gap-2">
//               <select
//                 className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-500"
//                 value={type}
//                 onChange={(e) => setType(e.target.value as any)}
//               >
//                 <option value="PRIMARY">تشخيص رئيسي</option>
//                 <option value="SECONDARY">تشخيص ثانوي</option>
//                 <option value="RULE_OUT">اشتباه (Rule Out)</option>
//               </select>
//               <input
//                 className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-500"
//                 placeholder="ملاحظات إضافية (اختياري)"
//                 value={note}
//                 onChange={(e) => setNote(e.target.value)}
//               />
//               <button
//                 onClick={handleAdd}
//                 className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg"
//               >
//                 إضافة
//               </button>
//             </div>
//           </div>
//         )}
//       </div>

//       {/* قائمة التشخيصات */}
//       <div className="space-y-2">
//         {diagnoses.length === 0 && (
//           <div className="text-center text-xs text-slate-500 py-6 border border-dashed border-slate-800 rounded-2xl">
//             لا توجد تشخيصات مسجلة بعد.
//           </div>
//         )}

//         {diagnoses.map((d) => (
//           <div
//             key={d.id}
//             className="bg-slate-900/40 border border-slate-800 p-3 rounded-xl flex justify-between items-center group hover:bg-slate-900/60 transition"
//           >
//             <div>
//               <div className="flex flex-wrap gap-2 items-center mb-1">
//                 <span
//                   className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
//                     d.type === "PRIMARY"
//                       ? "bg-emerald-900/30 border-emerald-500/30 text-emerald-300"
//                       : d.type === "SECONDARY"
//                         ? "bg-sky-900/30 border-sky-500/30 text-sky-300"
//                         : "bg-amber-900/30 border-amber-500/30 text-amber-300"
//                   }`}
//                 >
//                   {d.type === "PRIMARY"
//                     ? "رئيسي"
//                     : d.type === "SECONDARY"
//                       ? "ثانوي"
//                       : "اشتباه"}
//                 </span>
//                 <span className="font-mono text-sm font-bold text-slate-200 bg-slate-950 px-1.5 rounded text-opacity-80">
//                   {d.diagnosisCode.code}
//                 </span>
//                 <span className="text-sm text-slate-200">
//                   {d.diagnosisCode.nameEn}
//                 </span>
//                 {d.diagnosisCode.nameAr && (
//                   <span className="text-xs text-slate-500">
//                     - {d.diagnosisCode.nameAr}
//                   </span>
//                 )}
//               </div>
//               {d.note && (
//                 <div className="text-xs text-slate-400 mr-2 flex items-center gap-1">
//                   <span className="text-amber-500/60">📝</span> {d.note}
//                 </div>
//               )}
//             </div>
//             <button
//               onClick={() => handleDelete(d.id)}
//               className="text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-rose-900/20 rounded-lg"
//               title="حذف التشخيص"
//             >
//               🗑️
//             </button>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// // src/components/encounter/DiagnosisPane.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../../api/apiClient";
// import { toast } from "sonner";
// import { SmartCombobox } from "../ui/SmartCombobox";

// type DiagnosisCode = {
//   id: number;
//   code: string;
//   nameEn: string;
//   nameAr?: string;
// };

// type EncounterDiagnosis = {
//   id: number;
//   type: "PRIMARY" | "SECONDARY" | "RULE_OUT";
//   note?: string;
//   diagnosisCode: DiagnosisCode;
//   createdAt: string;
// };

// export function DiagnosisPane({ encounterId }: { encounterId: number }) {
//   const [diagnoses, setDiagnoses] = useState<EncounterDiagnosis[]>([]);

//   // Search State
//   const [query, setQuery] = useState("");
//   const [results, setResults] = useState<DiagnosisCode[]>([]);
//   const [searching, setSearching] = useState(false);
//   const [selectedCode, setSelectedCode] = useState<DiagnosisCode | null>(null);

//   // Form State
//   const [type, setType] = useState<"PRIMARY" | "SECONDARY" | "RULE_OUT">(
//     "PRIMARY",
//   );
//   const [note, setNote] = useState("");

//   const loadDiagnoses = async () => {
//     try {
//       const res = await apiClient.get<EncounterDiagnosis[]>(
//         `/diagnosis/encounter/${encounterId}`,
//       );
//       setDiagnoses(res.data);
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   useEffect(() => {
//     if (encounterId) loadDiagnoses();
//   }, [encounterId]);

//   // البحث عند الكتابة (Debounce)
//   useEffect(() => {
//     if (query.length < 2) {
//       setResults([]);
//       return;
//     }
//     const timer = setTimeout(async () => {
//       setSearching(true);
//       try {
//         const res = await apiClient.get<DiagnosisCode[]>(
//           `/diagnosis/search?q=${query}`,
//         );
//         setResults(res.data);
//       } finally {
//         setSearching(false);
//       }
//     }, 400);

//     return () => clearTimeout(timer);
//   }, [query]);

//   const handleAdd = async () => {
//     if (!selectedCode) return;
//     try {
//       await apiClient.post(`/diagnosis/encounter/${encounterId}`, {
//         codeId: selectedCode.id,
//         type,
//         note: note || undefined,
//       });
//       toast.success("تم إضافة التشخيص");
//       // Reset
//       setQuery("");
//       setResults([]);
//       setSelectedCode(null);
//       setNote("");
//       loadDiagnoses();
//     } catch (err) {
//       console.error(err);
//       toast.error("فشل الإضافة");
//     }
//   };

//   const handleDelete = async (id: number) => {
//     if (!confirm("هل أنت متأكد من حذف هذا التشخيص؟")) return;
//     try {
//       await apiClient.delete(`/diagnosis/${id}`);
//       toast.success("تم الحذف");
//       loadDiagnoses();
//     } catch (err) {
//       console.error(err);
//       toast.error("فشل الحذف");
//     }
//   };

//   return (
//     <div className="space-y-4">
//       {/* منطقة البحث والإضافة */}
//       <div className="bg-slate-900/60 border border-slate-700 p-4 rounded-2xl relative shadow-sm">
//         <h3 className="text-sm font-semibold text-slate-200 mb-3">
//           إضافة تشخيص (ICD-10)
//         </h3>

//         {!selectedCode ? (
//           <div className="relative">
//             <input
//               type="text"
//               className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 outline-none transition"
//               placeholder="ابحث عن اسم المرض أو الكود (مثال: Diabetes, E11, صداع)..."
//               value={query}
//               onChange={(e) => setQuery(e.target.value)}
//             />
//             {searching && (
//               <div className="absolute left-3 top-3 text-xs text-slate-500">
//                 جاري البحث...
//               </div>
//             )}

//             {/* نتائج البحث */}
//             {results.length > 0 && (
//               <div className="absolute z-10 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
//                 {results.map((code) => (
//                   <button
//                     key={code.id}
//                     onClick={() => {
//                       setSelectedCode(code);
//                       setQuery("");
//                       setResults([]);
//                     }}
//                     className="w-full text-right px-4 py-2 hover:bg-slate-800 text-xs border-b border-slate-800 last:border-0 flex items-center justify-between group"
//                   >
//                     <span>
//                       {code.nameEn}
//                       {code.nameAr && (
//                         <span className="text-slate-400 mr-2">
//                           ({code.nameAr})
//                         </span>
//                       )}
//                     </span>
//                     <span className="font-mono font-bold text-emerald-400 bg-emerald-900/20 px-2 py-0.5 rounded border border-emerald-900/50 group-hover:bg-emerald-900/40">
//                       {code.code}
//                     </span>
//                   </button>
//                 ))}
//               </div>
//             )}
//           </div>
//         ) : (
//           <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
//             <div className="flex justify-between items-center bg-emerald-900/20 border border-emerald-500/30 p-3 rounded-xl">
//               <div className="text-sm text-emerald-100">
//                 <span className="font-mono font-bold text-emerald-400 mr-2">
//                   {selectedCode.code}
//                 </span>
//                 {selectedCode.nameEn}
//                 {selectedCode.nameAr && (
//                   <span className="text-slate-400 text-xs mr-2">
//                     ({selectedCode.nameAr})
//                   </span>
//                 )}
//               </div>
//               <button
//                 onClick={() => setSelectedCode(null)}
//                 className="text-xs text-slate-400 hover:text-white px-2 py-1 hover:bg-slate-800 rounded"
//               >
//                 تغيير
//               </button>
//             </div>

//             <div className="flex gap-2">
//               <select
//                 className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-500"
//                 value={type}
//                 onChange={(e) => setType(e.target.value as any)}
//               >
//                 <option value="PRIMARY">تشخيص رئيسي</option>
//                 <option value="SECONDARY">تشخيص ثانوي</option>
//                 <option value="RULE_OUT">اشتباه (Rule Out)</option>
//               </select>
//               <input
//                 className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-500"
//                 placeholder="ملاحظات إضافية (اختياري)"
//                 value={note}
//                 onChange={(e) => setNote(e.target.value)}
//               />
//               <button
//                 onClick={handleAdd}
//                 className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg"
//               >
//                 إضافة
//               </button>
//             </div>
//           </div>
//         )}
//       </div>

//       {/* قائمة التشخيصات */}
//       <div className="space-y-2">
//         {diagnoses.length === 0 && (
//           <div className="text-center text-xs text-slate-500 py-6 border border-dashed border-slate-800 rounded-2xl">
//             لا توجد تشخيصات مسجلة بعد.
//           </div>
//         )}

//         {diagnoses.map((d) => (
//           <div
//             key={d.id}
//             className="bg-slate-900/40 border border-slate-800 p-3 rounded-xl flex justify-between items-center group hover:bg-slate-900/60 transition"
//           >
//             <div>
//               <div className="flex flex-wrap gap-2 items-center mb-1">
//                 <span
//                   className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
//                     d.type === "PRIMARY"
//                       ? "bg-emerald-900/30 border-emerald-500/30 text-emerald-300"
//                       : d.type === "SECONDARY"
//                         ? "bg-sky-900/30 border-sky-500/30 text-sky-300"
//                         : "bg-amber-900/30 border-amber-500/30 text-amber-300"
//                   }`}
//                 >
//                   {d.type === "PRIMARY"
//                     ? "رئيسي"
//                     : d.type === "SECONDARY"
//                       ? "ثانوي"
//                       : "اشتباه"}
//                 </span>
//                 <span className="font-mono text-sm font-bold text-slate-200 bg-slate-950 px-1.5 rounded text-opacity-80">
//                   {d.diagnosisCode.code}
//                 </span>
//                 <span className="text-sm text-slate-200">
//                   {d.diagnosisCode.nameEn}
//                 </span>
//                 {d.diagnosisCode.nameAr && (
//                   <span className="text-xs text-slate-500">
//                     - {d.diagnosisCode.nameAr}
//                   </span>
//                 )}
//               </div>
//               {d.note && (
//                 <div className="text-xs text-slate-400 mr-2 flex items-center gap-1">
//                   <span className="text-amber-500/60">📝</span> {d.note}
//                 </div>
//               )}
//             </div>
//             <button
//               onClick={() => handleDelete(d.id)}
//               className="text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-rose-900/20 rounded-lg"
//               title="حذف التشخيص"
//             >
//               🗑️
//             </button>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }
