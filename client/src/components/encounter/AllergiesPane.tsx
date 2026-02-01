// src/components/encounter/AllergiesPane.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type Severity = "MILD" | "MODERATE" | "SEVERE";

type Allergy = {
  id: number;
  allergen: string;
  severity: Severity;
  reaction: string | null;
  createdAt: string;
};

const SEVERITY_LABELS: Record<Severity, string> = {
  MILD: "خفيفة",
  MODERATE: "متوسطة",
  SEVERE: "شديدة/خطيرة",
};

const SEVERITY_COLORS: Record<Severity, string> = {
  MILD: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  MODERATE: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  SEVERE: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

export function AllergiesPane({ patientId }: { patientId: number }) {
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [allergen, setAllergen] = useState("");
  const [severity, setSeverity] = useState<Severity>("MODERATE");
  const [reaction, setReaction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAllergies = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Allergy[]>(
        `/patients/${patientId}/allergies`,
      );
      setAllergies(res.data);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل سجل الحساسية.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) loadAllergies();
  }, [patientId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allergen.trim()) return;

    setSubmitting(true);
    try {
      await apiClient.post(`/patients/${patientId}/allergies`, {
        allergen,
        severity,
        reaction: reaction || undefined,
      });
      toast.success("تم إضافة الحساسية بنجاح.");
      setAllergen("");
      setReaction("");
      setSeverity("MODERATE");
      loadAllergies();
    } catch (err: any) {
      toast.error("فشل الحفظ.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
    try {
      await apiClient.delete(`/patients/allergies/${id}`);
      toast.success("تم الحذف.");
      loadAllergies();
    } catch (err) {
      toast.error("فشل الحذف.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="bg-rose-950/20 border border-rose-900/30 p-4 rounded-2xl">
        <h3 className="text-sm font-bold text-rose-300 mb-3 flex items-center gap-2">
          <span>⚠️</span> تسجيل حساسية جديدة
        </h3>

        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                مادة التحسس (الدواء/الطعام)
              </label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-rose-500 outline-none"
                placeholder="مثال: Penicillin, Eggs..."
                value={allergen}
                onChange={(e) => setAllergen(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                شدة الحساسية
              </label>
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-rose-500 outline-none"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
              >
                <option value="MILD">خفيفة (Mild)</option>
                <option value="MODERATE">متوسطة (Moderate)</option>
                <option value="SEVERE">خطيرة (Severe)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">
              الأعراض / رد الفعل (اختياري)
            </label>
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-rose-500 outline-none"
              placeholder="مثال: طفح جلدي، ضيق تنفس..."
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="self-end px-6 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-bold shadow-lg disabled:opacity-50"
          >
            {submitting ? "جاري الحفظ..." : "إضافة للتحذيرات"}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 px-1">
          سجل الحساسيات المسجلة
        </h3>

        {loading && (
          <div className="text-center text-xs text-slate-500">
            جارِ التحميل...
          </div>
        )}

        {!loading && allergies.length === 0 && (
          <div className="text-center py-6 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
            لا توجد حساسيات مسجلة لهذا المريض.
          </div>
        )}

        {allergies.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition"
          >
            <div className="flex items-center gap-3">
              <span
                className={`text-[10px] px-2 py-1 rounded border font-bold ${SEVERITY_COLORS[a.severity]}`}
              >
                {SEVERITY_LABELS[a.severity]}
              </span>
              <div>
                <div className="font-bold text-slate-200 text-sm">
                  {a.allergen}
                </div>
                {a.reaction && (
                  <div className="text-xs text-slate-500">{a.reaction}</div>
                )}
              </div>
            </div>
            <button
              onClick={() => handleDelete(a.id)}
              className="text-slate-600 hover:text-rose-400 px-2"
              title="حذف"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
