// src/components/clinical/MedicalHistoryForm.tsx
// =====================================================================
// التاريخ المرضي الشامل — Medical History (EMR Core)
// PMH + Surgical + Family + Social — في تبويبات فرعية
// =====================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type HistorySection = "PMH" | "SURGICAL" | "FAMILY" | "SOCIAL";

const FAMILY_RELATIONS: Record<string, string> = {
  FATHER: "الأب",
  MOTHER: "الأم",
  BROTHER: "الأخ",
  SISTER: "الأخت",
  SON: "الابن",
  DAUGHTER: "الابنة",
  GRANDFATHER: "الجد",
  GRANDMOTHER: "الجدة",
  UNCLE: "العم/الخال",
  AUNT: "العمة/الخالة",
  OTHER: "أخرى",
};

const SMOKING_OPTIONS: Record<string, string> = {
  NEVER: "لم يدخن أبداً",
  FORMER: "مدخن سابق",
  CURRENT: "مدخن حالياً",
  UNKNOWN: "غير معروف",
};

export function MedicalHistoryForm({ patientId }: { patientId: number }) {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<HistorySection>("PMH");

  const { data: history, isLoading } = useQuery({
    queryKey: ["patient-medical-history", patientId],
    queryFn: async () => {
      const res = await apiClient.get(`/patients/${patientId}/medical-history`);
      return res.data;
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-slate-500 text-sm">جارِ التحميل...</div>;
  }

  const sections: { key: HistorySection; label: string; icon: string; count?: number }[] = [
    { key: "PMH", label: "الأمراض السابقة", icon: "🏥", count: history?.pastMedical?.length },
    { key: "SURGICAL", label: "العمليات الجراحية", icon: "🔪", count: history?.pastSurgical?.length },
    { key: "FAMILY", label: "التاريخ العائلي", icon: "👨‍👩‍👧‍👦", count: history?.familyHistory?.length },
    { key: "SOCIAL", label: "التاريخ الاجتماعي", icon: "🏡" },
  ];

  return (
    <div className="max-w-4xl space-y-5">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        📖 التاريخ المرضي الشامل (Medical History)
      </h2>

      {/* Section Tabs */}
      <div className="flex gap-2 flex-wrap">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 ${
              section === s.key
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span>{s.icon}</span>
            {s.label}
            {s.count !== undefined && s.count > 0 && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">{s.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {section === "PMH" && <PMHSection patientId={patientId} entries={history?.pastMedical || []} />}
      {section === "SURGICAL" && <SurgicalSection patientId={patientId} entries={history?.pastSurgical || []} />}
      {section === "FAMILY" && <FamilySection patientId={patientId} entries={history?.familyHistory || []} />}
      {section === "SOCIAL" && <SocialSection patientId={patientId} data={history?.socialHistory} />}
    </div>
  );
}

// ==================== PMH Section ====================

function PMHSection({ patientId, entries }: { patientId: number; entries: any[] }) {
  const queryClient = useQueryClient();
  const [condition, setCondition] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");

  const addMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/patients/${patientId}/pmh-entries`, {
        condition,
        diagnosisYear: year ? parseInt(year) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-medical-history", patientId] });
      toast.success("تمت الإضافة");
      setCondition("");
      setYear("");
      setNotes("");
    },
    onError: () => toast.error("فشل في الإضافة"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/patients/${patientId}/pmh-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-medical-history", patientId] });
      toast.success("تم الحذف");
    },
  });

  return (
    <div className="space-y-4">
      {/* Add Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h4 className="text-xs text-sky-400 font-bold mb-3">➕ إضافة مرض سابق</h4>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-slate-500 block mb-1">المرض / الحالة *</label>
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="مثال: ارتفاع ضغط الدم"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            />
          </div>
          <div className="w-24">
            <label className="text-[10px] text-slate-500 block mb-1">السنة</label>
            <input
              type="number"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="2020"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              min="1900"
              max="2100"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] text-slate-500 block mb-1">ملاحظات</label>
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="ملاحظات اختيارية"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <button
            onClick={() => addMutation.mutate()}
            disabled={!condition.trim() || addMutation.isPending}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
          >
            + أضف
          </button>
        </div>
      </div>

      {/* Entries List */}
      {entries.length === 0 ? (
        <p className="text-slate-500 text-center text-sm py-6">لا توجد أمراض سابقة مسجّلة</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e: any) => (
            <div key={e.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${e.isActive ? "bg-red-500" : "bg-slate-500"}`} />
                <span className="text-sm text-slate-200">{e.condition}</span>
                {e.diagnosisYear && <span className="text-xs text-slate-500">({e.diagnosisYear})</span>}
                {e.notes && <span className="text-[10px] text-slate-500 italic">— {e.notes}</span>}
              </div>
              <button
                onClick={() => deleteMutation.mutate(e.id)}
                className="text-slate-600 hover:text-red-400 text-xs transition-colors"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Surgical Section ====================

function SurgicalSection({ patientId, entries }: { patientId: number; entries: any[] }) {
  const queryClient = useQueryClient();
  const [procedure, setProcedure] = useState("");
  const [year, setYear] = useState("");
  const [hospital, setHospital] = useState("");

  const addMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/patients/${patientId}/surgical-entries`, {
        procedure,
        surgeryYear: year ? parseInt(year) : undefined,
        hospitalName: hospital || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-medical-history", patientId] });
      toast.success("تمت الإضافة");
      setProcedure("");
      setYear("");
      setHospital("");
    },
    onError: () => toast.error("فشل في الإضافة"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/patients/${patientId}/surgical-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-medical-history", patientId] });
      toast.success("تم الحذف");
    },
  });

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h4 className="text-xs text-sky-400 font-bold mb-3">➕ إضافة عملية جراحية</h4>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-slate-500 block mb-1">اسم العملية *</label>
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="مثال: استئصال المرارة"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
            />
          </div>
          <div className="w-24">
            <label className="text-[10px] text-slate-500 block mb-1">السنة</label>
            <input
              type="number"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="2020"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] text-slate-500 block mb-1">المستشفى</label>
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="اسم المؤسسة (إن كانت خارجية)"
              value={hospital}
              onChange={(e) => setHospital(e.target.value)}
            />
          </div>
          <button
            onClick={() => addMutation.mutate()}
            disabled={!procedure.trim() || addMutation.isPending}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
          >
            + أضف
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-slate-500 text-center text-sm py-6">لا توجد عمليات جراحية مسجّلة</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e: any) => (
            <div key={e.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base">🔪</span>
                <span className="text-sm text-slate-200">{e.procedure}</span>
                {e.surgeryYear && <span className="text-xs text-slate-500">({e.surgeryYear})</span>}
                {e.hospitalName && <span className="text-[10px] text-slate-500">— {e.hospitalName}</span>}
              </div>
              <button onClick={() => deleteMutation.mutate(e.id)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Family Section ====================

function FamilySection({ patientId, entries }: { patientId: number; entries: any[] }) {
  const queryClient = useQueryClient();
  const [relation, setRelation] = useState("FATHER");
  const [condition, setCondition] = useState("");
  const [ageOfOnset, setAgeOfOnset] = useState("");
  const [isDeceased, setIsDeceased] = useState(false);

  const addMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/patients/${patientId}/family-history`, {
        relation,
        condition,
        ageOfOnset: ageOfOnset ? parseInt(ageOfOnset) : undefined,
        isDeceased,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-medical-history", patientId] });
      toast.success("تمت الإضافة");
      setCondition("");
      setAgeOfOnset("");
      setIsDeceased(false);
    },
    onError: () => toast.error("فشل في الإضافة"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/patients/${patientId}/family-history/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-medical-history", patientId] });
      toast.success("تم الحذف");
    },
  });

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h4 className="text-xs text-sky-400 font-bold mb-3">➕ إضافة تاريخ عائلي</h4>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="w-36">
            <label className="text-[10px] text-slate-500 block mb-1">صلة القرابة *</label>
            <select
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
            >
              {Object.entries(FAMILY_RELATIONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-slate-500 block mb-1">المرض / الحالة *</label>
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="مثال: سكري، ضغط، سرطان..."
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            />
          </div>
          <div className="w-20">
            <label className="text-[10px] text-slate-500 block mb-1">عمر الظهور</label>
            <input
              type="number"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="45"
              value={ageOfOnset}
              onChange={(e) => setAgeOfOnset(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <input type="checkbox" id="deceased" checked={isDeceased} onChange={(e) => setIsDeceased(e.target.checked)} />
            <label htmlFor="deceased" className="text-[10px] text-slate-400">متوفى</label>
          </div>
          <button
            onClick={() => addMutation.mutate()}
            disabled={!condition.trim() || addMutation.isPending}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
          >
            + أضف
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-slate-500 text-center text-sm py-6">لا يوجد تاريخ عائلي مسجّل</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e: any) => (
            <div key={e.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs bg-slate-800 px-2 py-1 rounded font-bold text-slate-300">{FAMILY_RELATIONS[e.relation] || e.relation}</span>
                <span className="text-sm text-slate-200">{e.condition}</span>
                {e.ageOfOnset && <span className="text-xs text-slate-500">(ظهر في عمر {e.ageOfOnset})</span>}
                {e.isDeceased && <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">متوفى</span>}
              </div>
              <button onClick={() => deleteMutation.mutate(e.id)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Social Section ====================

function SocialSection({ patientId, data }: { patientId: number; data: any }) {
  const queryClient = useQueryClient();
  const [smokingStatus, setSmokingStatus] = useState(data?.smokingStatus || "");
  const [occupation, setOccupation] = useState(data?.occupation || "");
  const [exerciseLevel, setExerciseLevel] = useState(data?.exerciseLevel || "");
  const [dietNotes, setDietNotes] = useState(data?.dietNotes || "");
  const [socialNotes, setSocialNotes] = useState(data?.socialNotes || "");
  const [mobilityStatus, setMobilityStatus] = useState(data?.mobilityStatus || "");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put(`/patients/${patientId}/medical-history`, {
        smokingStatus: smokingStatus || undefined,
        occupation: occupation || undefined,
        exerciseLevel: exerciseLevel || undefined,
        dietNotes: dietNotes || undefined,
        socialNotes: socialNotes || undefined,
        mobilityStatus: mobilityStatus || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-medical-history", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patient-chart", patientId] });
      toast.success("تم حفظ التاريخ الاجتماعي");
    },
    onError: () => toast.error("فشل في الحفظ"),
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-2xl space-y-5">
      <h4 className="text-sm text-sky-400 font-bold">🏡 التاريخ الاجتماعي والوظيفي</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1">حالة التدخين</label>
          <select
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
            value={smokingStatus}
            onChange={(e) => setSmokingStatus(e.target.value)}
          >
            <option value="">— غير محدد —</option>
            {Object.entries(SMOKING_OPTIONS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">المهنة</label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
            placeholder="الوظيفة / المهنة"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">مستوى النشاط البدني</label>
          <select
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
            value={exerciseLevel}
            onChange={(e) => setExerciseLevel(e.target.value)}
          >
            <option value="">— غير محدد —</option>
            <option value="SEDENTARY">خامل (لا يمارس رياضة)</option>
            <option value="LIGHT">خفيف (1-2 مرات/أسبوع)</option>
            <option value="MODERATE">معتدل (3-4 مرات/أسبوع)</option>
            <option value="ACTIVE">نشط (5+ مرات/أسبوع)</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">الحالة الحركية</label>
          <select
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
            value={mobilityStatus}
            onChange={(e) => setMobilityStatus(e.target.value)}
          >
            <option value="">— غير محدد —</option>
            <option value="INDEPENDENT">مستقل تماماً</option>
            <option value="ASSISTED">يحتاج مساعدة جزئية</option>
            <option value="WHEELCHAIR">كرسي متحرك</option>
            <option value="BEDRIDDEN">طريح الفراش</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-400 block mb-1">ملاحظات غذائية</label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
            placeholder="حمية خاصة، قيود غذائية..."
            value={dietNotes}
            onChange={(e) => setDietNotes(e.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-400 block mb-1">ملاحظات اجتماعية أخرى</label>
          <textarea
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500 min-h-[60px]"
            placeholder="أي ملاحظات اجتماعية إضافية..."
            value={socialNotes}
            onChange={(e) => setSocialNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? "جارِ الحفظ..." : "💾 حفظ التغييرات"}
        </button>
      </div>
    </div>
  );
}
