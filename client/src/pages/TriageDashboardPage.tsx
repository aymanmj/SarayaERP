// src/pages/TriageDashboardPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// أنواع البيانات
type TriageLevel =
  | "RESUSCITATION" // أحمر
  | "EMERGENT" // برتقالي
  | "URGENT" // أصفر
  | "LESS_URGENT" // أخضر
  | "NON_URGENT"; // أزرق

type ERPatient = {
  id: number; // encounterId
  createdAt: string; // وقت الدخول
  triageLevel: TriageLevel | null;
  chiefComplaint: string | null;
  patient: {
    id: number;
    fullName: string;
    mrn: string;
    dateOfBirth: string | null;
    gender: string;
  };
  _count: { triageAssessments: number };
};

// إعدادات مستويات الفرز (الألوان والنصوص)
const TRIAGE_LEVELS: {
  key: TriageLevel;
  label: string;
  color: string;
  desc: string;
}[] = [
  {
    key: "RESUSCITATION",
    label: "إنعاش (فوري)",
    color: "bg-red-600 border-red-500 text-white",
    desc: "حياة أو موت",
  },
  {
    key: "EMERGENT",
    label: "طارئ جداً (10د)",
    color: "bg-orange-500 border-orange-400 text-white",
    desc: "ألم صدر، ضيق تنفس شديد",
  },
  {
    key: "URGENT",
    label: "عاجل (30د)",
    color: "bg-yellow-500 border-yellow-400 text-black",
    desc: "ألم بطن، كسر",
  },
  {
    key: "LESS_URGENT",
    label: "أقل استعجالاً (60د)",
    color: "bg-emerald-600 border-emerald-500 text-white",
    desc: "جروح بسيطة، حرارة",
  },
  {
    key: "NON_URGENT",
    label: "غير عاجل (120د)",
    color: "bg-blue-600 border-blue-500 text-white",
    desc: "تغيير ضماد، وصفة",
  },
];

function calculateAge(dob: string | null) {
  if (!dob) return "";
  const diff = Date.now() - new Date(dob).getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function getWaitTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} ساعة و ${mins % 60} دقيقة`;
}

export default function TriageDashboardPage() {
  const [patients, setPatients] = useState<ERPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Modal & Form State
  const [selectedEncounter, setSelectedEncounter] = useState<ERPatient | null>(
    null,
  );
  const [form, setForm] = useState({
    level: "" as TriageLevel | "",
    chiefComplaint: "",
    temperature: "",
    heartRate: "",
    respRate: "",
    bpSystolic: "",
    bpDiastolic: "",
    o2Sat: "",
    painScore: "",
    notes: "",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ERPatient[]>("/triage/waiting");
      setPatients(res.data);
    } catch (err) {
      toast.error("فشل تحميل قائمة الانتظار");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // تحديث كل 30 ثانية
    return () => clearInterval(interval);
  }, []);

  const openAssessment = (p: ERPatient) => {
    setSelectedEncounter(p);
    setForm({
      level: p.triageLevel || "",
      chiefComplaint: p.chiefComplaint || "",
      temperature: "",
      heartRate: "",
      respRate: "",
      bpSystolic: "",
      bpDiastolic: "",
      o2Sat: "",
      painScore: "",
      notes: "",
    });
  };

  // CDSS Check
  const checkVitals = async () => {
    if (!selectedEncounter) return true;

    // Prepare payload
    const payload = {
      patientId: selectedEncounter.patient.id,
      encounterId: selectedEncounter.id,
      bpSystolic: Number(form.bpSystolic) || undefined,
      bpDiastolic: Number(form.bpDiastolic) || undefined,
      pulse: Number(form.heartRate) || undefined,
      temperature: Number(form.temperature) || undefined,
      o2Sat: Number(form.o2Sat) || undefined,
    };

    // If no vitals entered, skip check
    if (!payload.bpSystolic && !payload.bpDiastolic && !payload.pulse && !payload.temperature && !payload.o2Sat) {
      return true;
    }

    try {
      // Dynamic import or use the one we just created
      const { cdssApi } = await import("../api/cdss");
      const alerts = await cdssApi.checkVitals(payload);

      if (alerts && alerts.length > 0) {
        // Show alerts
        const critical = alerts.filter((a: any) => a.severity === 'CRITICAL');
        const warning = alerts.filter((a: any) => a.severity === 'WARNING');

        let message = "⚠️ تنبيهات نظام دعم القرار:\n";
        alerts.forEach((a: any) => message += `- ${a.message}\n`);
        
        if (critical.length > 0) {
           message += "\n🚫 يوجد مؤشرات حرجة! هل أنت متأكد من المتابعة؟";
           if (!window.confirm(message)) return false;
        } else if (warning.length > 0) {
           toast.warning(message);
        }
      }
    } catch (e) {
      console.error("CDSS Check Failed", e);
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!selectedEncounter || !form.level || !form.chiefComplaint) {
      toast.warning("يجب تحديد مستوى الخطورة والشكوى الرئيسية.");
      return;
    }

    // ✅ Run CDSS Check
    const proceed = await checkVitals();
    if (!proceed) return;

    try {
      await apiClient.post("/triage/assess", {
        encounterId: selectedEncounter.id,
        level: form.level,
        chiefComplaint: form.chiefComplaint,
        vitals: {
          temperature: Number(form.temperature) || undefined,
          heartRate: Number(form.heartRate) || undefined,
          respRate: Number(form.respRate) || undefined,
          bpSystolic: Number(form.bpSystolic) || undefined,
          bpDiastolic: Number(form.bpDiastolic) || undefined,
          o2Sat: Number(form.o2Sat) || undefined,
          painScore: Number(form.painScore) || undefined,
        },
        notes: form.notes,
      });

      toast.success("تم حفظ الفرز بنجاح");
      setSelectedEncounter(null);
      loadData();
    } catch (err) {
      toast.error("فشل الحفظ");
    }
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir="rtl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            🚨 لوحة فرز الطوارئ (Triage)
          </h1>
          <p className="text-sm text-slate-400">
            تقييم وترتيب أولويات المرضى في قسم الطوارئ.
          </p>
        </div>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm"
        >
          تحديث القائمة 🔄
        </button>
      </div>

      {/* Patient Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-4 flex-1">
        {loading && patients.length === 0 && (
          <div className="col-span-full text-center py-10 text-slate-500">
            جاري التحميل...
          </div>
        )}

        {!loading && patients.length === 0 && (
          <div className="col-span-full text-center py-10 text-emerald-400 bg-slate-900/50 rounded-2xl border border-slate-800">
            ✅ لا يوجد مرضى في الانتظار حالياً.
          </div>
        )}

        {patients.map((p) => {
          const levelConfig = p.triageLevel
            ? TRIAGE_LEVELS.find((l) => l.key === p.triageLevel)
            : null;

          return (
            <div
              key={p.id}
              className={`relative rounded-2xl border p-4 flex flex-col justify-between transition-all duration-200
                        ${
                          levelConfig
                            ? `bg-slate-900/80 border-l-4 ${levelConfig.color.replace("bg-", "border-l-")}`
                            : "bg-slate-900/40 border-slate-700 border-l-4 border-l-slate-500 hover:bg-slate-800"
                        }
                    `}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-slate-100">
                    {p.patient.fullName}
                  </h3>
                  <span className="text-[10px] font-mono bg-slate-950 px-2 py-0.5 rounded text-slate-400">
                    {getWaitTime(p.createdAt)}
                  </span>
                </div>

                <div className="text-xs text-slate-400 mb-3 flex gap-2">
                  <span>{p.patient.gender === "MALE" ? "ذكر" : "أنثى"}</span>
                  <span>•</span>
                  <span>{calculateAge(p.patient.dateOfBirth)} سنة</span>
                  <span>•</span>
                  <span>{p.patient.mrn}</span>
                </div>

                {p.chiefComplaint ? (
                  <div className="text-sm text-slate-200 bg-slate-950/50 p-2 rounded mb-3 border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">
                      الشكوى:
                    </span>
                    {p.chiefComplaint}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 italic mb-3">
                    لم يتم تسجيل شكوى
                  </div>
                )}

                {levelConfig && (
                  <div
                    className={`text-xs text-center py-1 rounded font-bold mb-3 ${levelConfig.color} bg-opacity-20 text-opacity-100`}
                  >
                    {levelConfig.label}
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => openAssessment(p)}
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-lg"
                >
                  {p.triageLevel ? "إعادة تقييم" : "بدء الفرز 🩺"}
                </button>
                <button
                  onClick={() => navigate(`/encounters/${p.id}`)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  الملف
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Assessment Modal */}
      {selectedEncounter && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900">
              <div>
                <h2 className="text-lg font-bold text-white">
                  تقييم الفرز (Triage Assessment)
                </h2>
                <p className="text-xs text-slate-400">
                  {selectedEncounter.patient.fullName}
                </p>
              </div>
              <button
                onClick={() => setSelectedEncounter(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 1. Vital Signs */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-emerald-400 border-b border-slate-800 pb-1">
                  1. العلامات الحيوية (Vitals)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      الضغط (Sys/Dia)
                    </label>
                    <div className="flex gap-1">
                      <input
                        placeholder="Sys"
                        type="number"
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs"
                        value={form.bpSystolic}
                        onChange={(e) =>
                          setForm({ ...form, bpSystolic: e.target.value })
                        }
                      />
                      <input
                        placeholder="Dia"
                        type="number"
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs"
                        value={form.bpDiastolic}
                        onChange={(e) =>
                          setForm({ ...form, bpDiastolic: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      النبض (HR)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs"
                      value={form.heartRate}
                      onChange={(e) =>
                        setForm({ ...form, heartRate: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      الحرارة (Temp)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs"
                      value={form.temperature}
                      onChange={(e) =>
                        setForm({ ...form, temperature: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      الأكسجين (SpO2)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs"
                      value={form.o2Sat}
                      onChange={(e) =>
                        setForm({ ...form, o2Sat: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* 2. Chief Complaint */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-sky-400 border-b border-slate-800 pb-1">
                  2. الشكوى الرئيسية
                </h3>
                <textarea
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:border-sky-500 outline-none"
                  placeholder="ما الذي يشكو منه المريض؟"
                  value={form.chiefComplaint}
                  onChange={(e) =>
                    setForm({ ...form, chiefComplaint: e.target.value })
                  }
                />
              </div>

              {/* 3. Triage Level */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-amber-400 border-b border-slate-800 pb-1">
                  3. قرار الفرز (Priority)
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {TRIAGE_LEVELS.map((lvl) => (
                    <button
                      key={lvl.key}
                      onClick={() => setForm({ ...form, level: lvl.key })}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        form.level === lvl.key
                          ? `${lvl.color} border-white ring-2 ring-white/20`
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      <span className="font-bold text-sm">{lvl.label}</span>
                      <span className="text-[10px] opacity-80">{lvl.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900 rounded-b-2xl">
              <button
                onClick={() => setSelectedEncounter(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleSubmit}
                className="px-8 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-500/20"
              >
                حفظ الفرز ✅
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
