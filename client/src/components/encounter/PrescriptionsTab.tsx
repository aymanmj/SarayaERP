// src/components/encounter/PrescriptionsTab.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

// --- Types ---
type MedicationRoute =
  | "ORAL"
  | "IV"
  | "IM"
  | "SC"
  | "TOPICAL"
  | "INHALATION"
  | "OTHER";
type MedicationFrequency =
  | "ONCE"
  | "BID"
  | "TID"
  | "QID"
  | "QHS"
  | "PRN"
  | "DAILY"
  | "OTHER";

type ProductItemLite = {
  id: number;
  code?: string | null;
  name: string;
  genericName?: string | null;
  strength?: string | null;
  form?: string | null;
  unitPrice: number;
  stockOnHand: number;
};

type PrescriptionDto = {
  id: number;
  createdAt: string;
  doctor?: { fullName: string };
  status: string;
  notes?: string | null;
  items: {
    id: number;
    drugItem: ProductItemLite; // Note: mapped from product in backend
    dose: string;
    route: string;
    frequency: string;
    durationDays: number;
    quantity: number;
    notes?: string | null;
  }[];
};

type DraftItem = {
  tempId: number;
  drugItemId?: number;
  dose: string;
  route: MedicationRoute;
  frequency: MedicationFrequency;
  durationDays: number;
  quantity: number;
  notes?: string;
};

type PrescriptionsTabProps = {
  encounterId: number;
  hospitalId: number;
  doctorId?: number | null;
};

const ROUTE_OPTIONS = [
  { value: "ORAL", label: "فموي" },
  { value: "IV", label: "وريدي" },
  { value: "IM", label: "عضلي" },
  { value: "SC", label: "تحت الجلد" },
  { value: "TOPICAL", label: "موضعي" },
  { value: "INHALATION", label: "استنشاق" },
  { value: "OTHER", label: "أخرى" },
];

const FREQ_OPTIONS = [
  { value: "ONCE", label: "مرة واحدة" },
  { value: "BID", label: "مرتان يومياً" },
  { value: "TID", label: "3 مرات يومياً" },
  { value: "QID", label: "4 مرات يومياً" },
  { value: "DAILY", label: "مرة يومياً" },
  { value: "QHS", label: "قبل النوم" },
  { value: "PRN", label: "عند اللزوم" },
];

export function PrescriptionsTab({
  encounterId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hospitalId,
  doctorId,
}: PrescriptionsTabProps) {
  const [catalog, setCatalog] = useState<ProductItemLite[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionDto[]>([]);

  // Initial Draft State
  const [items, setItems] = useState<DraftItem[]>([
    {
      tempId: 1,
      drugItemId: undefined,
      dose: "",
      route: "ORAL",
      frequency: "BID",
      durationDays: 3,
      quantity: 1,
      notes: "",
    },
  ]);
  const [nextTempId, setNextTempId] = useState(2);
  const [globalNotes, setGlobalNotes] = useState("");

  const canOrder = !!doctorId;

  useEffect(() => {
    const load = async () => {
      try {
        const [resP, resC] = await Promise.all([
          apiClient.get<PrescriptionDto[]>(
            `/pharmacy/encounters/${encounterId}/prescriptions`,
          ),
          apiClient.get<ProductItemLite[]>(`/pharmacy/catalog`),
        ]);
        setPrescriptions(resP.data);
        setCatalog(resC.data);
      } catch (e) {
        console.error(e);
      }
    };
    if (encounterId) load();
  }, [encounterId]);

  // Form Handlers
  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        tempId: nextTempId,
        drugItemId: undefined,
        dose: "",
        route: "ORAL",
        frequency: "BID",
        durationDays: 3,
        quantity: 1,
        notes: "",
      },
    ]);
    setNextTempId((n) => n + 1);
  };

  const removeRow = (id: number) => {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((i) => i.tempId !== id) : prev,
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateItem = (id: number, field: keyof DraftItem, val: any) => {
    setItems((prev) =>
      prev.map((i) => (i.tempId === id ? { ...i, [field]: val } : i)),
    );
  };

  const submitPrescription = async () => {
    if (!canOrder) {
      toast.error("لا يمكن إنشاء وصفة. يرجى تعيين طبيب للحالة أولاً.");
      return;
    }

    // Validation
    const validItems = items.filter((i) => i.drugItemId);
    if (validItems.length === 0) {
      toast.warning("أضف دواء واحداً على الأقل.");
      return;
    }

    try {
      await apiClient.post(
        `/pharmacy/encounters/${encounterId}/prescriptions`,
        {
          doctorId,
          notes: globalNotes || undefined,
          items: validItems.map((it) => ({
            drugItemId: it.drugItemId,
            dose: it.dose || "As directed",
            route: it.route,
            frequency: it.frequency,
            durationDays: Number(it.durationDays),
            quantity: Number(it.quantity),
            notes: it.notes,
          })),
        },
      );
      toast.success("تم حفظ الوصفة");
      // Reset
      setItems([
        {
          tempId: 1,
          drugItemId: undefined,
          dose: "",
          route: "ORAL",
          frequency: "BID",
          durationDays: 3,
          quantity: 1,
          notes: "",
        },
      ]);
      setGlobalNotes("");

      // Reload list
      const res = await apiClient.get<PrescriptionDto[]>(
        `/pharmacy/encounters/${encounterId}/prescriptions`,
      );
      setPrescriptions(res.data);
      setPrescriptions(res.data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      // ✅ معالجة تحذيرات السلامة
      if (e.response?.data?.code === "SAFETY_WARNING") {
        const warnings = e.response.data.interactions
          .map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (w: any) =>
              `- ${w.drugs.join(" + ")}: ${w.description} (${w.severity})`,
          )
          .join("\n");

        if (
          confirm(
            `⚠️ تحذير للتداخلات الدوائية:\n${warnings}\n\nهل تريد تجاوز التحذير ومتابعة الوصفة؟`,
          )
        ) {
          // إعادة المحاولة مع override
          try {
            await apiClient.post(
              `/pharmacy/encounters/${encounterId}/prescriptions`,
              {
                doctorId,
                notes: globalNotes || undefined,
                overrideSafety: true, // 👈 إرسال طلب التجاوز
                items: validItems.map((it) => ({
                  drugItemId: it.drugItemId,
                  dose: it.dose || "As directed",
                  route: it.route,
                  frequency: it.frequency,
                  durationDays: Number(it.durationDays),
                  quantity: Number(it.quantity),
                  notes: it.notes,
                })),
              },
            );
            toast.success("تم حفظ الوصفة (مع تجاوز التحذيرات)");
            // Reset & Reload
            setItems([
              {
                tempId: 1,
                drugItemId: undefined,
                dose: "",
                route: "ORAL",
                frequency: "BID",
                durationDays: 3,
                quantity: 1,
                notes: "",
              },
            ]);
            setGlobalNotes("");
            const res = await apiClient.get<PrescriptionDto[]>(
              `/pharmacy/encounters/${encounterId}/prescriptions`,
            );
            setPrescriptions(res.data);
            return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (retryErr: any) {
             toast.error(retryErr.response?.data?.message || "فشل الحفظ بعد التجاوز");
             return;
          }
        }
      }
      toast.error(e.response?.data?.message || "فشل الحفظ");
    }
  };

  const renderDrugName = (d: ProductItemLite) => {
    return `${d.name} ${d.strength ? d.strength : ""} ${d.form ? `(${d.form})` : ""}`;
  };

  return (
    <div className="space-y-6">
      {/* Form Area */}
      <div
        className={`border border-slate-800 rounded-2xl p-4 bg-slate-900/60 shadow-sm ${!canOrder ? "opacity-60 pointer-events-none grayscale" : ""}`}
      >
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800/50">
          <h3 className="font-semibold text-sm text-slate-200">
            وصفة طبية جديدة
          </h3>
          {!canOrder && (
            <span className="text-[10px] text-rose-300 font-bold bg-rose-950/40 px-2 py-1 rounded">
              ⛔ يجب تعيين طبيب أولاً
            </span>
          )}
        </div>

        {/* Dynamic Rows */}
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.tempId}
              className="flex flex-col md:flex-row gap-2 items-start bg-slate-950/50 p-2 rounded-xl border border-slate-800/50"
            >
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] text-slate-500 mb-1 block">
                  الدواء
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
                  value={item.drugItemId ?? ""}
                  onChange={(e) =>
                    updateItem(
                      item.tempId,
                      "drugItemId",
                      Number(e.target.value),
                    )
                  }
                >
                  <option value="">-- اختر الدواء --</option>
                  {catalog.map((d) => (
                    <option key={d.id} value={d.id}>
                      {renderDrugName(d)} (رصيد: {d.stockOnHand})
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-24">
                <label className="text-[10px] text-slate-500 mb-1 block">
                  الجرعة
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
                  placeholder="500mg"
                  value={item.dose}
                  onChange={(e) =>
                    updateItem(item.tempId, "dose", e.target.value)
                  }
                />
              </div>

              <div className="w-28">
                <label className="text-[10px] text-slate-500 mb-1 block">
                  الطريق
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
                  value={item.route}
                  onChange={(e) =>
                    updateItem(item.tempId, "route", e.target.value)
                  }
                >
                  {ROUTE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-28">
                <label className="text-[10px] text-slate-500 mb-1 block">
                  التكرار
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
                  value={item.frequency}
                  onChange={(e) =>
                    updateItem(item.tempId, "frequency", e.target.value)
                  }
                >
                  {FREQ_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-16">
                <label className="text-[10px] text-slate-500 mb-1 block">
                  المدة (يوم)
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-center outline-none focus:border-emerald-500"
                  value={item.durationDays}
                  onChange={(e) =>
                    updateItem(item.tempId, "durationDays", e.target.value)
                  }
                />
              </div>

              <div className="w-16">
                <label className="text-[10px] text-slate-500 mb-1 block">
                  الكمية
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-center font-bold text-emerald-400 outline-none focus:border-emerald-500"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(item.tempId, "quantity", e.target.value)
                  }
                />
              </div>

              <button
                onClick={() => removeRow(item.tempId)}
                className="mt-6 p-1.5 text-slate-500 hover:text-rose-400 transition"
                title="حذف السطر"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addRow}
          className="mt-2 text-xs text-sky-400 hover:text-sky-300 font-medium px-2 py-1 hover:bg-sky-950/30 rounded transition"
        >
          + إضافة دواء آخر
        </button>

        <div className="mt-4 pt-3 border-t border-slate-800/50 flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="text-[10px] text-slate-500 mb-1 block">
              ملاحظات عامة للصيدلي (اختياري)
            </label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald-500"
              placeholder="مثال: يصرف البديل في حال عدم التوفر..."
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
            />
          </div>
          <button
            onClick={submitPrescription}
            disabled={!canOrder}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition"
          >
            حفظ وإرسال الوصفة
          </button>
        </div>
      </div>

      {/* List Area */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-400 px-1">
          سجل الوصفات السابقة
        </h3>
        {prescriptions.length === 0 && (
          <div className="text-center text-xs text-slate-500 py-6 border border-dashed border-slate-800 rounded-2xl">
            لا توجد وصفات مسجلة لهذه الحالة.
          </div>
        )}

        {prescriptions.map((pres) => (
          <div
            key={pres.id}
            className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4"
          >
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800/50">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-mono text-sm font-bold">
                  وصفة #{pres.id}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(pres.createdAt).toLocaleString("ar-LY")}
                </span>
              </div>
              <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-slate-300 border border-slate-800">
                {pres.doctor?.fullName ?? "Unknown Doctor"}
              </span>
            </div>

            <div className="space-y-2">
              {pres.items.map((it) => (
                <div
                  key={it.id}
                  className="flex justify-between items-center text-xs bg-slate-950/30 p-2 rounded-lg border border-slate-800/30"
                >
                  <div className="font-medium text-slate-200">
                    {renderDrugName(it.drugItem)}
                  </div>
                  <div className="text-slate-400 flex gap-3">
                    <span>{it.dose}</span>
                    <span className="text-slate-600">|</span>
                    <span>{it.frequency}</span>
                    <span className="text-slate-600">|</span>
                    <span>{it.durationDays} يوم</span>
                  </div>
                  <div className="font-mono text-emerald-400 font-bold bg-emerald-950/30 px-2 py-0.5 rounded">
                    {it.quantity}
                  </div>
                </div>
              ))}
            </div>
            {pres.notes && (
              <div className="mt-3 text-[11px] text-amber-200/70 bg-amber-900/10 p-2 rounded border border-amber-900/20">
                ملاحظات: {pres.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// // src/components/encounter/PrescriptionsTab.tsx

// import { useEffect, useState } from "react";
// import { apiClient } from "../../api/apiClient";
// import { toast } from "sonner";

// // ... (Types Definitions) ...
// // (انسخ الأنواع من الكود القديم أو الملف السابق لتوفير المساحة هنا، الهيكلية نفسها)
// // ProductItemLite, PrescriptionItemDto, PrescriptionDto, DraftItem...

// type PrescriptionsTabProps = {
//   encounterId: number;
//   hospitalId: number;
//   doctorId?: number | null;
// };

// export function PrescriptionsTab({
//   encounterId,
//   hospitalId,
//   doctorId,
// }: PrescriptionsTabProps) {
//   // ... (State Definitions: catalog, prescriptions, items...) ...
//   // (نفس الـ State والمنطق السابق)
//   const [catalog, setCatalog] = useState<any[]>([]);
//   const [items, setItems] = useState<any[]>([
//     {
//       tempId: 1,
//       quantity: 1,
//       dose: "",
//       route: "ORAL",
//       frequency: "BID",
//       durationDays: 1,
//     },
//   ]);
//   const [prescriptions, setPrescriptions] = useState<any[]>([]);

//   const canOrder = !!doctorId;

//   useEffect(() => {
//     // Fetch Data logic...
//     const load = async () => {
//       const [resP, resC] = await Promise.all([
//         apiClient.get(`/pharmacy/encounters/${encounterId}/prescriptions`),
//         apiClient.get(`/pharmacy/catalog`),
//       ]);
//       setPrescriptions(resP.data);
//       setCatalog(resC.data);
//     };
//     if (encounterId) load();
//   }, [encounterId]);

//   const submitPrescription = async () => {
//     if (!canOrder) {
//       toast.error("لا يمكن إنشاء وصفة. يرجى تعيين طبيب للحالة أولاً.");
//       return;
//     }
//     // ... logic to submit ...
//     try {
//       await apiClient.post(
//         `/pharmacy/encounters/${encounterId}/prescriptions`,
//         {
//           doctorId,
//           items: items.map((it) => ({ ...it, drugItemId: it.drugItemId })), // Format correctly
//         },
//       );
//       toast.success("تم الحفظ");
//       // Reload...
//     } catch (e) {
//       toast.error("فشل الحفظ");
//     }
//   };

//   // ... (Helper functions: addRow, removeRow, updateItem) ...

//   return (
//     <div className="space-y-4">
//       {/* Form Area */}
//       <div
//         className={`border border-slate-800 rounded-2xl p-4 bg-slate-900/60 ${!canOrder ? "opacity-60 pointer-events-none grayscale" : ""}`}
//       >
//         <div className="flex justify-between items-center mb-3">
//           <h3 className="font-semibold text-sm">وصفة طبية جديدة</h3>
//           {!canOrder && (
//             <span className="text-xs text-rose-400 font-bold bg-rose-950/30 px-2 py-1 rounded">
//               ⛔ يجب تعيين طبيب أولاً
//             </span>
//           )}
//         </div>

//         {/* ... (جدول إدخال الأدوية كما هو في الكود السابق) ... */}

//         <div className="flex justify-end mt-3">
//           <button
//             onClick={submitPrescription}
//             disabled={!canOrder}
//             className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg"
//           >
//             حفظ الوصفة
//           </button>
//         </div>
//       </div>

//       {/* List Area */}
//       {/* ... (عرض الوصفات السابقة) ... */}
//     </div>
//   );
// }
