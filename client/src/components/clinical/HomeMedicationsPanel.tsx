// src/components/clinical/HomeMedicationsPanel.tsx
// =====================================================================
// الأدوية المنزلية — Home Medications / Medication Reconciliation
// =====================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type HomeMed = {
  id: number;
  medicationName: string;
  dose: string | null;
  frequency: string | null;
  route: string | null;
  prescribedBy: string | null;
  reason: string | null;
  startDate: string | null;
  isActive: boolean;
  source: "PATIENT_REPORTED" | "PHARMACY_RECORD" | "REFERRAL_LETTER" | "PREVIOUS_ADMISSION";
  verifiedById: number | null;
  verifiedAt: string | null;
  notes: string | null;
  createdBy: { id: number; fullName: string };
  verifiedBy: { id: number; fullName: string } | null;
};

const SOURCE_LABELS: Record<string, { label: string; icon: string }> = {
  PATIENT_REPORTED: { label: "إفادة المريض", icon: "🗣️" },
  PHARMACY_RECORD: { label: "سجل الصيدلية", icon: "🏪" },
  REFERRAL_LETTER: { label: "خطاب إحالة", icon: "📄" },
  PREVIOUS_ADMISSION: { label: "إيواء سابق", icon: "🏥" },
};

export function HomeMedicationsPanel({ patientId, onUpdate }: { patientId: number; onUpdate?: () => void }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [medicationName, setMedicationName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [route, setRoute] = useState("");
  const [prescribedBy, setPrescribedBy] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("PATIENT_REPORTED");
  const [notes, setNotes] = useState("");

  const { data: medications = [], isLoading } = useQuery<HomeMed[]>({
    queryKey: ["home-medications", patientId],
    queryFn: async () => {
      const res = await apiClient.get(`/patients/${patientId}/home-medications`);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post(`/patients/${patientId}/home-medications`, {
        medicationName,
        dose: dose || undefined,
        frequency: frequency || undefined,
        route: route || undefined,
        prescribedBy: prescribedBy || undefined,
        reason: reason || undefined,
        source,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-medications", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-chart", patientId] });
      toast.success("تمت الإضافة");
      resetForm();
      onUpdate?.();
    },
    onError: () => toast.error("فشل في الإضافة"),
  });

  const verifyMutation = useMutation({
    mutationFn: async (medId: number) => {
      return apiClient.post(`/patients/${patientId}/home-medications/${medId}/verify`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-medications", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-chart", patientId] });
      toast.success("تم التحقق من الدواء");
      onUpdate?.();
    },
    onError: () => toast.error("فشل في التحقق"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (medId: number) => {
      return apiClient.delete(`/patients/${patientId}/home-medications/${medId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-medications", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-chart", patientId] });
      toast.success("تم الحذف");
      onUpdate?.();
    },
    onError: () => toast.error("فشل في الحذف"),
  });

  const resetForm = () => {
    setMedicationName("");
    setDose("");
    setFrequency("");
    setRoute("");
    setPrescribedBy("");
    setReason("");
    setSource("PATIENT_REPORTED");
    setNotes("");
    setShowForm(false);
  };

  const activeMeds = medications.filter((m) => m.isActive);
  const inactiveMeds = medications.filter((m) => !m.isActive);
  const unverifiedCount = activeMeds.filter((m) => !m.verifiedById).length;

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            💊 الأدوية المنزلية (Medication Reconciliation)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            الأدوية التي يتناولها المريض حالياً من مصادر خارجية
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
        >
          {showForm ? "✕ إلغاء" : "+ إضافة دواء"}
        </button>
      </div>

      {/* Unverified Warning */}
      {unverifiedCount > 0 && (
        <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3 text-xs text-amber-300">
          <span className="text-lg">⚡</span>
          <span>
            يوجد <strong>{unverifiedCount}</strong> دواء غير محقّق — يجب أن يتحقق الطبيب من صحة المعلومات
          </span>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <div className="bg-slate-900 border border-sky-800/30 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-sky-400">➕ إضافة دواء منزلي</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] text-slate-500 block mb-1">اسم الدواء *</label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="مثال: Metformin 500mg"
                value={medicationName}
                onChange={(e) => setMedicationName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">المصدر</label>
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 block mb-1">الجرعة</label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="500mg"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">التكرار</label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="مرتين يومياً"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">طريقة الإعطاء</label>
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
              >
                <option value="">— غير محدد —</option>
                <option value="PO">فموي (PO)</option>
                <option value="IV">وريدي (IV)</option>
                <option value="IM">عضلي (IM)</option>
                <option value="SC">تحت الجلد (SC)</option>
                <option value="TOPICAL">موضعي</option>
                <option value="INHALED">استنشاق</option>
                <option value="RECTAL">شرجي</option>
                <option value="SUBLINGUAL">تحت اللسان</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 block mb-1">الطبيب الواصف</label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="اسم الطبيب أو المصدر"
                value={prescribedBy}
                onChange={(e) => setPrescribedBy(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-slate-500 block mb-1">السبب / التشخيص</label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="مثال: ارتفاع ضغط الدم"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-[10px] text-slate-500 block mb-1">ملاحظات</label>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="ملاحظات إضافية..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={resetForm} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">إلغاء</button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!medicationName.trim() || createMutation.isPending}
              className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? "جارِ الحفظ..." : "حفظ"}
            </button>
          </div>
        </div>
      )}

      {/* Medications List */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-500 text-sm">جارِ التحميل...</div>
      ) : medications.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <p className="text-slate-500 text-sm">لا توجد أدوية منزلية مسجّلة</p>
          <p className="text-slate-600 text-xs mt-1">اضغط "+ إضافة دواء" لتوثيق الأدوية المنزلية</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active Medications */}
          {activeMeds.length > 0 && (
            <div>
              <h3 className="text-xs text-emerald-400 font-bold mb-2">
                الأدوية النشطة ({activeMeds.length})
              </h3>
              <div className="space-y-2">
                {activeMeds.map((med) => (
                  <MedicationCard
                    key={med.id}
                    med={med}
                    onVerify={() => verifyMutation.mutate(med.id)}
                    onDelete={() => {
                      if (confirm("هل أنت متأكد من حذف هذا الدواء؟")) {
                        deleteMutation.mutate(med.id);
                      }
                    }}
                    isVerifying={verifyMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Inactive Medications */}
          {inactiveMeds.length > 0 && (
            <div>
              <h3 className="text-xs text-slate-500 font-bold mb-2 mt-4">
                أدوية متوقفة ({inactiveMeds.length})
              </h3>
              <div className="space-y-2 opacity-60">
                {inactiveMeds.map((med) => (
                  <MedicationCard
                    key={med.id}
                    med={med}
                    onVerify={() => {}}
                    onDelete={() => {
                      if (confirm("هل أنت متأكد من حذف هذا الدواء؟")) {
                        deleteMutation.mutate(med.id);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== Medication Card ====================

function MedicationCard({
  med,
  onVerify,
  onDelete,
  isVerifying,
}: {
  med: HomeMed;
  onVerify: () => void;
  onDelete: () => void;
  isVerifying?: boolean;
}) {
  const sourceInfo = SOURCE_LABELS[med.source] || SOURCE_LABELS.PATIENT_REPORTED;
  const isVerified = !!med.verifiedById;

  return (
    <div
      className={`bg-slate-900/60 border rounded-2xl p-4 transition-all ${
        isVerified
          ? "border-slate-800"
          : "border-amber-800/40 shadow-[0_0_10px_rgba(245,158,11,0.05)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-white">{med.medicationName}</span>
            {med.dose && <span className="text-sky-400 text-xs">{med.dose}</span>}
            {med.frequency && (
              <span className="text-slate-400 text-xs bg-slate-800 px-1.5 py-0.5 rounded">
                {med.frequency}
              </span>
            )}
            {med.route && (
              <span className="text-slate-400 text-xs bg-slate-800 px-1.5 py-0.5 rounded">
                {med.route}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1 flex-wrap">
            <span>
              {sourceInfo.icon} {sourceInfo.label}
            </span>
            {med.prescribedBy && <span>👨‍⚕️ {med.prescribedBy}</span>}
            {med.reason && <span>📋 {med.reason}</span>}
            <span>أُضيف بواسطة: {med.createdBy.fullName}</span>
          </div>

          {med.notes && (
            <p className="text-[10px] text-slate-400 mt-1 italic">{med.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Verification Status */}
          {isVerified ? (
            <div className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1">
              ✅ محقّق
              <span className="text-slate-500">({med.verifiedBy?.fullName})</span>
            </div>
          ) : (
            <button
              onClick={onVerify}
              disabled={isVerifying}
              className="text-[10px] text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg transition-colors"
            >
              ✓ تحقّق
            </button>
          )}

          <button
            onClick={onDelete}
            className="text-slate-600 hover:text-red-400 text-xs bg-slate-800/50 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-colors"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}
