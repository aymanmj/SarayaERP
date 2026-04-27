// src/components/encounter/RadiologyTab.tsx

import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
const DicomViewer = lazy(() =>
  import("../clinical/DicomViewer").then((module) => ({
    default: module.DicomViewer,
  })),
);

// Types
type RadiologyStudy = {
  id: number;
  code: string;
  name: string;
  arabicName?: string | null;
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

// Modality icons/styles
const modalityStyle: Record<string, { icon: string; color: string; bg: string; border: string; label: string }> = {
  'X-RAY':       { icon: '📷', color: 'text-amber-400',   bg: 'bg-amber-950/30',   border: 'border-amber-800/30', label: 'X-Ray' },
  'ULTRASOUND':  { icon: '📡', color: 'text-sky-400',     bg: 'bg-sky-950/30',     border: 'border-sky-800/30',   label: 'سونار' },
  'CT':          { icon: '🖥️', color: 'text-violet-400',  bg: 'bg-violet-950/30',  border: 'border-violet-800/30', label: 'CT' },
  'MRI':         { icon: '🧲', color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-800/30', label: 'MRI' },
  'FLUOROSCOPY': { icon: '🎬', color: 'text-orange-400',  bg: 'bg-orange-950/30',  border: 'border-orange-800/30', label: 'فلوروسكوبي' },
  'MAMMOGRAPHY': { icon: '🩻', color: 'text-pink-400',    bg: 'bg-pink-950/30',    border: 'border-pink-800/30',   label: 'ماموغرام' },
  'DEXA':        { icon: '🦴', color: 'text-yellow-400',  bg: 'bg-yellow-950/30',  border: 'border-yellow-800/30', label: 'DEXA' },
};
const defaultModStyle = { icon: '📋', color: 'text-slate-400', bg: 'bg-slate-950/30', border: 'border-slate-800/30', label: 'أخرى' };

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function RadiologyTab({ encounterId, hospitalId, doctorId }: RadiologyTabProps) {
  const [loading, setLoading] = useState(false);
  const [studiesCatalog, setStudiesCatalog] = useState<RadiologyStudy[]>([]);
  const [orders, setOrders] = useState<RadiologyOrderDto[]>([]);
  const [selectedStudyIds, setSelectedStudyIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [activeModality, setActiveModality] = useState<string | null>(null);
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  const canOrder = !!doctorId;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, catalogRes] = await Promise.all([
        apiClient.get<RadiologyOrderDto[]>(`/radiology/encounters/${encounterId}/orders`),
        apiClient.get<RadiologyStudy[]>(`/radiology/catalog`),
      ]);
      setOrders(ordersRes.data);
      setStudiesCatalog(catalogRes.data);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل بيانات الأشعة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (encounterId && hospitalId) fetchData();
  }, [encounterId, hospitalId]);

  // Derived: modalities
  const modalities = useMemo(() => {
    const mods = new Set<string>();
    studiesCatalog.forEach(s => { if (s.modality) mods.add(s.modality); });
    return Array.from(mods);
  }, [studiesCatalog]);

  // Derived: filtered studies
  const filteredStudies = useMemo(() => {
    let result = studiesCatalog;
    if (activeModality) {
      result = result.filter(s => s.modality === activeModality);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.arabicName && s.arabicName.includes(search)) ||
        (s.bodyPart && s.bodyPart.toLowerCase().includes(q))
      );
    }
    return result;
  }, [studiesCatalog, activeModality, search]);

  const toggleStudy = (id: number) => {
    setSelectedStudyIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const submitOrder = async () => {
    if (!canOrder) { toast.error("يجب تعيين طبيب أولاً."); return; }
    if (selectedStudyIds.length === 0) { toast.warning("اختر فحص أشعة واحد على الأقل."); return; }
    try {
      await apiClient.post(`/radiology/encounters/${encounterId}/orders`, {
        doctorId,
        studyIds: selectedStudyIds,
        notes: notes || undefined,
      });
      toast.success("تم إنشاء طلب الأشعة بنجاح");
      setSelectedStudyIds([]);
      setNotes("");
      setSearch("");
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("فشل إنشاء طلب الأشعة");
    }
  };

  return (
    <div className="space-y-6">
      {/* DICOM Viewer */}
      {viewImageUrl && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-sky-400">
              يجري تحميل عارض الأشعة...
            </div>
          }
        >
          <DicomViewer
            imageId={viewImageUrl}
            onClose={() => setViewImageUrl(null)}
          />
        </Suspense>
      )}

      {/* 1. Order Section */}
      <div className={`border border-slate-800 rounded-2xl p-5 bg-slate-900/60 shadow-sm ${!canOrder ? "opacity-70 pointer-events-none grayscale" : ""}`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
            📡 طلب فحوصات أشعة جديدة
          </h3>
          {!canOrder && (
            <span className="text-[10px] text-rose-300 font-bold bg-rose-950/40 border border-rose-800/50 px-2 py-1 rounded">
              ⛔ يجب تعيين طبيب أولاً
            </span>
          )}
          {selectedStudyIds.length > 0 && (
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-800/50 px-2 py-1 rounded">
              ✓ {selectedStudyIds.length} محدد
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-sky-500 placeholder:text-slate-600 pr-10 transition-all"
            placeholder="ابحث عن فحص أشعة... (الاسم، الكود، منطقة الجسم)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="absolute left-3 top-2.5 text-slate-600">🔍</span>
        </div>

        {/* Modality Filters */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setActiveModality(null)}
            className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold transition-all ${
              !activeModality
                ? "bg-sky-600 border-sky-500 text-white"
                : "bg-slate-950 border-slate-700 text-slate-400 hover:bg-slate-800"
            }`}
          >
            الكل ({studiesCatalog.length})
          </button>
          {modalities.map(mod => {
            const s = modalityStyle[mod] || defaultModStyle;
            const count = studiesCatalog.filter(st => st.modality === mod).length;
            return (
              <button
                key={mod}
                onClick={() => setActiveModality(activeModality === mod ? null : mod)}
                className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold transition-all ${
                  activeModality === mod
                    ? `${s.bg} ${s.border} ${s.color}`
                    : "bg-slate-950 border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {s.icon} {s.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Studies Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-1 mb-4 custom-scrollbar">
          {filteredStudies.length === 0 && (
            <div className="col-span-full text-center text-xs text-slate-600 py-4">
              لا توجد نتائج — حاول بكلمات بحث مختلفة
            </div>
          )}
          {filteredStudies.map(s => {
            const isSelected = selectedStudyIds.includes(s.id);
            const ms = modalityStyle[s.modality || ''] || defaultModStyle;
            return (
              <button
                key={s.id}
                onClick={() => toggleStudy(s.id)}
                className={`text-right text-xs px-2.5 py-2 rounded-xl border transition-all leading-tight ${
                  isSelected
                    ? "bg-sky-600/20 border-sky-500/50 text-sky-300 ring-1 ring-sky-500/30"
                    : `${ms.bg} ${ms.border} text-slate-300 hover:bg-slate-800`
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold truncate">{s.arabicName || s.name}</span>
                  {isSelected && <span className="text-sky-400">✓</span>}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] text-slate-500 font-mono">{s.code}</span>
                  {s.bodyPart && (
                    <span className={`text-[8px] ${ms.color} opacity-70`}>• {s.bodyPart}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Notes + Submit */}
        <div className="flex gap-2">
          <input
            className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs flex-1 outline-none focus:border-sky-500 transition-all"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="ملاحظات لقسم الأشعة (مثال: آلام أسفل الظهر، ما قبل العملية)..."
          />
          <button
            onClick={submitOrder}
            disabled={!canOrder || selectedStudyIds.length === 0}
            className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 transition-all active:scale-95"
          >
            إرسال ({selectedStudyIds.length})
          </button>
        </div>
      </div>

      {/* 2. Orders History */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-400 px-1 flex items-center gap-2">
          📊 طلبات الأشعة والتقارير
          {orders.length > 0 && (
            <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{orders.length}</span>
          )}
        </h3>

        {orders.length === 0 && !loading && (
          <div className="text-center text-xs text-slate-500 py-8 border border-dashed border-slate-800 rounded-2xl">
            لا توجد طلبات أشعة سابقة.
          </div>
        )}

        {orders.map(o => {
          const ms = modalityStyle[o.study.modality || ''] || defaultModStyle;
          return (
            <div key={o.id} className="border border-slate-800 rounded-2xl p-4 bg-slate-900/40">
              {/* Header */}
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800/50">
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${ms.color}`}>{ms.icon}</span>
                  <span className="font-bold text-sky-400">{o.study.arabicName || o.study.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-1.5 rounded">
                    {o.study.code}
                  </span>
                  {o.study.modality && (
                    <span className={`text-[9px] ${ms.color} ${ms.bg} ${ms.border} border px-1.5 py-0.5 rounded`}>
                      {ms.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">
                    {formatDateTime(o.order.createdAt)}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                    o.status === "COMPLETED"
                      ? "bg-emerald-900/30 text-emerald-300 border border-emerald-500/20"
                      : "bg-amber-900/30 text-amber-300 border border-amber-500/20"
                  }`}>
                    {o.status === "COMPLETED" ? "✅ مكتمل" : "⏳ قيد الإجراء"}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 text-xs">
                  {o.study.bodyPart && (
                    <div>
                      <span className="text-slate-500">المنطقة: </span>
                      <span className="text-slate-300">{o.study.bodyPart}</span>
                    </div>
                  )}
                  {o.order.notes && (
                    <div className="text-amber-200/60 bg-amber-900/10 p-2 rounded border border-amber-900/20 text-[10px]">
                      📝 {o.order.notes}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {o.reportText && (
                    <div className="bg-black/30 p-3 rounded-xl border border-slate-700/50 text-xs">
                      <div className="text-[10px] text-emerald-400 mb-1 font-bold">
                        📋 تقرير الأشعة:
                      </div>
                      <div className="text-slate-200 whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto pr-1">
                        {o.reportText}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end">
                    {o.pacsUrl && (
                      <button
                        onClick={() => setViewImageUrl(o.pacsUrl!)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all active:scale-95"
                      >
                        📷 معاينة الصورة
                      </button>
                    )}
                    {o.status === "COMPLETED" && (
                      <button
                        onClick={() => window.open(`/radiology/orders/${o.id}/print`, "_blank")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs shadow-md transition-all"
                      >
                        🖨️ طباعة
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
