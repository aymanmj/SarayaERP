
import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";

type Execution = {
  id: number;
  executedAt: string;
  resultValue: string | null;
  note: string | null;
  executedBy: { id: number; fullName: string };
};

type CarePlanItem = {
  id: number;
  type: string;
  instruction: string;
  frequency: string | null;
  status: string;
  createdAt: string;
  createdBy: { id: number; fullName: string };
  executions: Execution[];
};

type Inpatient = {
  id: number;
  patient: { id: number; fullName: string; mrn: string };
  bedAssignments: { bed: { bedNumber: string; ward: { name: string } } }[];
  clinicalNotes: { content: string; createdAt: string }[];
  carePlanItems?: CarePlanItem[];
};

export default function DoctorRoundsPage() {
  const user = useAuthStore((s) => s.user);
  const [patients, setPatients] = useState<Inpatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Inpatient | null>(null);
  const [loading, setLoading] = useState(false);

  // Forms
  const [note, setNote] = useState("");
  const [instruction, setInstruction] = useState("");
  const [carePlan, setCarePlan] = useState<CarePlanItem[]>([]);

  useEffect(() => {
    if (user?.id) loadRotation();
  }, [user]);

  useEffect(() => {
    if (selectedPatient) {
      loadCarePlan(selectedPatient.id);
    }
  }, [selectedPatient]);

  const loadRotation = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Inpatient[]>("/clinical/inpatient/my-rotation");
      setPatients(res.data);
    } catch (e) {
      toast.error("فشل تحميل قائمة المرضى");
    } finally {
      setLoading(false);
    }
  };

  const loadCarePlan = async (encounterId: number) => {
    try {
      const res = await apiClient.get<CarePlanItem[]>(`/clinical/inpatient/encounters/${encounterId}/care-plan`);
      setCarePlan(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddNote = async () => {
    if (!selectedPatient || !note.trim()) return;
    try {
      await apiClient.post(`/clinical/inpatient/encounters/${selectedPatient.id}/notes`, {
        content: note,
        type: "DOCTOR_ROUND",
      });
      toast.success("تم حفظ الملاحظة");
      setNote("");
      loadRotation();
    } catch (e) {
      toast.error("فشل الحفظ");
    }
  };

  const handleAddInstruction = async () => {
    if (!selectedPatient || !instruction.trim()) return;
    try {
      await apiClient.post(`/clinical/inpatient/encounters/${selectedPatient.id}/care-plan`, {
        instruction,
      });
      toast.success("تم إضافة التعليمات");
      setInstruction("");
      loadCarePlan(selectedPatient.id);
    } catch (e) {
      toast.error("فشل الحفظ");
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      MEDICATION: "💊",
      VITALS: "❤️",
      LAB_ORDER: "🧪",
      RADIOLOGY: "📷",
      DIET: "🍽️",
      ACTIVITY: "🏃",
      NURSING_CARE: "🩺",
      OTHER: "📝",
    };
    return labels[type] || "📝";
  };

  return (
    <div className="flex h-full text-slate-100 bg-slate-950" dir="rtl">
      {/* Sidebar: Patient List */}
      <div className="w-1/3 border-l border-slate-800 p-4 overflow-y-auto bg-slate-900/50">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          👨‍⚕️ مروري اليومي (My Rounds)
        </h2>
        {loading && <p className="text-slate-500">جارِ التحميل...</p>}
        <div className="space-y-3">
          {patients.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedPatient(p)}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                selectedPatient?.id === p.id
                  ? "bg-sky-900/30 border-sky-500"
                  : "bg-slate-900 border-slate-800 hover:border-slate-600"
              }`}
            >
              <div className="font-bold text-lg">{p.patient.fullName}</div>
              <div className="text-xs text-slate-400 font-mono mb-2">{p.patient.mrn}</div>
              <div className="text-xs bg-slate-800 inline-block px-2 py-1 rounded border border-slate-700">
                🛏️ {p.bedAssignments[0]?.bed?.ward?.name} -{" "}
                {p.bedAssignments[0]?.bed?.bedNumber}
              </div>
              {p.clinicalNotes?.[0] && (
                <div className="mt-2 text-[10px] text-slate-500 line-clamp-2 italic border-t border-slate-800 pt-1">
                  " {p.clinicalNotes[0].content} "
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content: Round Actions */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedPatient ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            اختر مريضاً للبدء في المرور الطبي
          </div>
        ) : (
          <div className="space-y-6">
            <header className="border-b border-slate-800 pb-4">
              <h1 className="text-3xl font-bold text-white mb-1">
                {selectedPatient.patient.fullName}
              </h1>
              <p className="text-slate-400 text-sm">
                ملف: {selectedPatient.patient.mrn} | دخول رقم #{selectedPatient.id}
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. Progress Note (SOAP) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <h3 className="font-bold text-lg mb-3 text-sky-300">📝 ملاحظات المرور (Progress Note)</h3>
                <textarea
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 min-h-[150px] focus:border-sky-500 outline-none text-sm"
                  placeholder="S: Subjective...&#10;O: Objective...&#10;A: Assessment...&#10;P: Plan..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                ></textarea>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={handleAddNote}
                    className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-lg shadow-sky-900/20"
                  >
                    حفظ الملاحظة
                  </button>
                </div>
              </div>

              {/* 2. Care Plan / Orders with Execution Status */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col">
                <h3 className="font-bold text-lg mb-3 text-emerald-300">📋 الخطة العلاجية والمهام</h3>
                <div className="flex-1 space-y-3 mb-4 overflow-y-auto max-h-[300px] custom-scrollbar">
                  {carePlan.length === 0 && <p className="text-slate-500 text-center py-4">لا توجد مهام نشطة</p>}
                  {carePlan.map((item) => {
                    const lastExecution = item.executions?.[0];
                    const hasExecutions = item.executions && item.executions.length > 0;
                    
                    return (
                      <div 
                        key={item.id} 
                        className={`p-3 rounded-xl border transition-all ${
                          hasExecutions 
                            ? "bg-emerald-500/5 border-emerald-500/20" 
                            : "bg-slate-950 border-slate-700"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-lg">{getTypeLabel(item.type)}</span>
                          <div className="flex-1">
                            <div className={`font-medium ${item.status === 'COMPLETED' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                              {item.instruction}
                            </div>
                            {item.frequency && (
                              <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded mt-1 inline-block">
                                {item.frequency}
                              </span>
                            )}
                            
                            {/* Execution Status - THIS IS THE KEY ADDITION */}
                            {hasExecutions && (
                              <div className="mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-1">
                                  <span>✅</span>
                                  <span>تم التنفيذ بواسطة التمريض</span>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  <span className="text-slate-300">{lastExecution?.executedBy?.fullName}</span>
                                  <span className="mx-2">•</span>
                                  <span>{new Date(lastExecution?.executedAt || "").toLocaleString("ar-SA")}</span>
                                </div>
                                {lastExecution?.resultValue && (
                                  <div className="text-xs text-white mt-1">
                                    النتيجة: <span className="font-mono bg-slate-800 px-2 py-0.5 rounded">{lastExecution.resultValue}</span>
                                  </div>
                                )}
                                {lastExecution?.note && (
                                  <div className="text-[10px] text-slate-500 mt-1 italic">
                                    📝 {lastExecution.note}
                                  </div>
                                )}
                                {item.executions.length > 1 && (
                                  <div className="text-[10px] text-emerald-500 mt-1">
                                    + {item.executions.length - 1} تنفيذات أخرى
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {!hasExecutions && item.status === 'ACTIVE' && (
                              <div className="mt-2 text-[10px] text-amber-400 flex items-center gap-1">
                                <span>⏳</span> في انتظار التنفيذ
                              </div>
                            )}
                          </div>
                          
                          {/* Status Indicator */}
                          <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${
                            hasExecutions ? 'bg-emerald-500' : 
                            item.status === 'COMPLETED' ? 'bg-slate-500' : 'bg-amber-500'
                          }`}></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="flex gap-2 mt-auto pt-4 border-t border-slate-800">
                   <input 
                     className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                     placeholder="أمر جديد (مثال: صيام، تحليل صباحي...)"
                     value={instruction}
                     onChange={(e) => setInstruction(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleAddInstruction()}
                   />
                   <button 
                     onClick={handleAddInstruction}
                     className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-white font-bold"
                   >
                     + أضف
                   </button>
                </div>
              </div>
            </div>
            
             {/* Vitals Summary */}
             <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                <h3 className="font-bold text-slate-300 mb-2">آخر العلامات الحيوية (Vitals)</h3>
                <div className="flex gap-4 text-sm text-slate-400">
                   <div className="bg-slate-950 px-4 py-2 rounded-lg border border-slate-800">
                     BP: <span className="text-white font-mono">120/80</span>
                   </div>
                   <div className="bg-slate-950 px-4 py-2 rounded-lg border border-slate-800">
                     HR: <span className="text-white font-mono">75</span>
                   </div>
                   <div className="bg-slate-950 px-4 py-2 rounded-lg border border-slate-800">
                     Temp: <span className="text-white font-mono">37.0</span>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
