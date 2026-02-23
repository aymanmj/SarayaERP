// src/components/encounter/LabsTab.tsx

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

// Types
type LabOrderResult = {
  id: number;
  parameterName: string;
  value: string;
  unit: string | null;
  range: string | null;
  flag: string | null;
};

type LabTest = {
  id: number;
  code: string;
  name: string;
  arabicName?: string | null;
  category?: string | null;
  unit?: string | null;
};

type LabOrderDto = {
  id: number;
  resultStatus: string;
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
  results?: LabOrderResult[];
};

type LabsTabProps = {
  encounterId: number;
  hospitalId: number;
  doctorId?: number | null;
};

// Category icons/colors
const catStyle: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  'Hematology':              { icon: '🩸', color: 'text-rose-400',    bg: 'bg-rose-950/30',    border: 'border-rose-800/30' },
  'Biochemistry':            { icon: '🧪', color: 'text-sky-400',     bg: 'bg-sky-950/30',     border: 'border-sky-800/30' },
  'Hormones':                { icon: '⚗️', color: 'text-violet-400',  bg: 'bg-violet-950/30',  border: 'border-violet-800/30' },
  'OB/GYN & Fertility':      { icon: '🤰', color: 'text-pink-400',    bg: 'bg-pink-950/30',    border: 'border-pink-800/30' },
  'Andrology & Male Fertility': { icon: '♂️', color: 'text-blue-400', bg: 'bg-blue-950/30',    border: 'border-blue-800/30' },
  'Immunology':              { icon: '🛡️', color: 'text-amber-400',   bg: 'bg-amber-950/30',   border: 'border-amber-800/30' },
  'Infectious Disease':      { icon: '🦠', color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-800/30' },
  'Urinalysis':              { icon: '💧', color: 'text-yellow-400',  bg: 'bg-yellow-950/30',  border: 'border-yellow-800/30' },
  'Microbiology':            { icon: '🔬', color: 'text-teal-400',    bg: 'bg-teal-950/30',    border: 'border-teal-800/30' },
  'Tumor Markers':           { icon: '🎯', color: 'text-red-400',     bg: 'bg-red-950/30',     border: 'border-red-800/30' },
};

const defaultCatStyle = { icon: '📋', color: 'text-slate-400', bg: 'bg-slate-950/30', border: 'border-slate-800/30' };

export function LabsTab({ encounterId, hospitalId, doctorId }: LabsTabProps) {
  const [labOrders, setLabOrders] = useState<LabOrderDto[]>([]);
  const [testsCatalog, setTestsCatalog] = useState<LabTest[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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

  // Derived: categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    testsCatalog.forEach(t => { if (t.category) cats.add(t.category); });
    return Array.from(cats);
  }, [testsCatalog]);

  // Derived: filtered tests
  const filteredTests = useMemo(() => {
    let result = testsCatalog;
    if (activeCategory) {
      result = result.filter(t => t.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.arabicName && t.arabicName.includes(search))
      );
    }
    return result;
  }, [testsCatalog, activeCategory, search]);

  const toggleTest = (id: number) => {
    setSelectedTestIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const submitOrder = async () => {
    if (!canOrder) { toast.error("يجب تعيين طبيب أولاً."); return; }
    if (selectedTestIds.length === 0) { toast.warning("اختر تحليلاً واحداً على الأقل."); return; }
    try {
      await apiClient.post(`/lab/encounters/${encounterId}/orders`, {
        doctorId,
        testIds: selectedTestIds,
        notes: notes || undefined,
      });
      toast.success("تم إرسال الطلب للمختبر");
      setSelectedTestIds([]);
      setNotes("");
      setSearch("");
      fetchData();
    } catch (e) {
      toast.error("فشل إرسال الطلب");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Order Section */}
      <div className={`border border-slate-800 rounded-2xl p-5 bg-slate-900/60 shadow-sm ${!canOrder ? "opacity-70 pointer-events-none grayscale" : ""}`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
            🧪 طلب تحاليل جديدة
          </h3>
          {!canOrder && (
            <span className="text-[10px] text-rose-300 font-bold bg-rose-950/40 border border-rose-800/50 px-2 py-1 rounded">
              ⛔ يجب تعيين طبيب أولاً
            </span>
          )}
          {selectedTestIds.length > 0 && (
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-800/50 px-2 py-1 rounded">
              ✓ {selectedTestIds.length} محدد
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-sky-500 placeholder:text-slate-600 pr-10 transition-all"
            placeholder="ابحث عن تحليل... (بالعربي أو الإنجليزي أو الكود)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="absolute left-3 top-2.5 text-slate-600">🔍</span>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setActiveCategory(null)}
            className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold transition-all ${
              !activeCategory
                ? "bg-sky-600 border-sky-500 text-white"
                : "bg-slate-950 border-slate-700 text-slate-400 hover:bg-slate-800"
            }`}
          >
            الكل ({testsCatalog.length})
          </button>
          {categories.map(cat => {
            const s = catStyle[cat] || defaultCatStyle;
            const count = testsCatalog.filter(t => t.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold transition-all ${
                  activeCategory === cat
                    ? `${s.bg} ${s.border} ${s.color}`
                    : "bg-slate-950 border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {s.icon} {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Test Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-52 overflow-y-auto pr-1 mb-4 custom-scrollbar">
          {filteredTests.length === 0 && (
            <div className="col-span-full text-center text-xs text-slate-600 py-4">
              لا توجد نتائج — حاول بكلمات بحث مختلفة
            </div>
          )}
          {filteredTests.map(t => {
            const isSelected = selectedTestIds.includes(t.id);
            const s = catStyle[t.category || ''] || defaultCatStyle;
            return (
              <button
                key={t.id}
                onClick={() => toggleTest(t.id)}
                className={`text-right text-xs px-2.5 py-2 rounded-xl border transition-all leading-tight ${
                  isSelected
                    ? "bg-sky-600/20 border-sky-500/50 text-sky-300 ring-1 ring-sky-500/30"
                    : `${s.bg} ${s.border} text-slate-300 hover:bg-slate-800`
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold truncate">{t.arabicName || t.name}</span>
                  {isSelected && <span className="text-sky-400">✓</span>}
                </div>
                <div className="text-[9px] text-slate-500 font-mono mt-0.5">{t.code}</div>
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
            placeholder="ملاحظات للمختبر (مثال: مستعجل، صائم)..."
          />
          <button
            onClick={submitOrder}
            disabled={!canOrder || selectedTestIds.length === 0}
            className="bg-sky-600 hover:bg-sky-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 transition-all active:scale-95"
          >
            إرسال الطلب ({selectedTestIds.length})
          </button>
        </div>
      </div>

      {/* 2. Results History */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-400 px-1 flex items-center gap-2">
          📊 سجل التحاليل السابقة
          {labOrders.length > 0 && (
            <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{labOrders.length}</span>
          )}
        </h3>

        {labOrders.length === 0 && !loading && (
          <div className="text-center text-xs text-slate-500 py-8 border border-dashed border-slate-800 rounded-2xl">
            لا توجد طلبات سابقة.
          </div>
        )}

        {labOrders.map(lo => (
          <div key={lo.id} className="border border-slate-800 rounded-2xl p-4 bg-slate-900/40">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800/50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sky-400">{lo.test.arabicName || lo.test.name}</span>
                <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-1.5 rounded">
                  {lo.test.code}
                </span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                lo.resultStatus === "COMPLETED"
                  ? "bg-emerald-900/30 text-emerald-300 border border-emerald-500/20"
                  : "bg-amber-900/30 text-amber-300 border border-amber-500/20"
              }`}>
                {lo.resultStatus === "COMPLETED" ? "✅ مكتمل" : "⏳ قيد الإجراء"}
              </span>
            </div>

            {lo.results && lo.results.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-950/30">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-800/50 text-slate-400">
                    <tr>
                      <th className="p-2 font-normal">المعيار</th>
                      <th className="p-2 font-normal">النتيجة</th>
                      <th className="p-2 font-normal">الوحدة</th>
                      <th className="p-2 font-normal text-left" dir="ltr">Range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {lo.results.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20">
                        <td className="p-2 text-slate-300 font-medium">{r.parameterName}</td>
                        <td className="p-2 font-bold text-slate-100" dir="ltr">
                          {r.value}
                          {r.flag && (
                            <span className="ml-2 text-[9px] text-rose-400 font-bold bg-rose-950/50 px-1 rounded">
                              {r.flag}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-slate-500">{r.unit}</td>
                        <td className="p-2 text-slate-500 text-left font-mono text-[10px]" dir="ltr">{r.range}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              lo.resultValue && (
                <div className="mt-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-sm flex items-center gap-2">
                  <span className="text-slate-400 text-xs">النتيجة:</span>
                  <span className="text-emerald-400 font-bold font-mono text-lg">{lo.resultValue}</span>
                  <span className="text-slate-500 text-xs">{lo.resultUnit}</span>
                  {lo.referenceRange && (
                    <span className="mr-auto text-[10px] text-slate-600 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      Range: {lo.referenceRange}
                    </span>
                  )}
                </div>
              )
            )}

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
