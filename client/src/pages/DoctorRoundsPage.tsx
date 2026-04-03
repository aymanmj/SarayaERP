import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { StructuredSOAPNote } from "../components/clinical/StructuredSOAPNote";

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
  vitalSigns?: {
    temperature?: number;
    bpSystolic?: number;
    bpDiastolic?: number;
    pulse?: number;
    respRate?: number;
    o2Sat?: number;
    weight?: number;
    height?: number;
    createdAt: string;
  }[];
};

export default function DoctorRoundsPage() {
  const user = useAuthStore((s) => s.user);
  const [patients, setPatients] = useState<Inpatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Inpatient | null>(null);
  const [loading, setLoading] = useState(false);

  // Forms
  const [instruction, setInstruction] = useState("");
  const [formKey, setFormKey] = useState(Date.now()); // For resetting SOAP note
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
      const res = await apiClient.get<any>("/clinical/inpatient/my-rotation");
      const patientsList: Inpatient[] = Array.isArray(res.data) ? res.data : (res.data.data || []);
      setPatients(patientsList);
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

  const handleSaveNote = async (data: any) => {
    if (!selectedPatient) return;
    try {
      await apiClient.post(`/clinical-notes`, {
        ...data,
        encounterId: selectedPatient.id,
        type: "DOCTOR_ROUND",
      });
      toast.success("تم حفظ الملاحظة السريرية");
      setFormKey(Date.now());
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
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-white">
                  {selectedPatient.patient.fullName}
                </h1>
                <Link
                  to={`/patients/${selectedPatient.patient.id}/chart`}
                  className="bg-emerald-900/30 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-xl text-[10px] font-bold hover:bg-emerald-800/40 transition-colors"
                >
                  📋 السجل الطبي
                </Link>
              </div>
              <p className="text-slate-400 text-sm">
                ملف: {selectedPatient.patient.mrn} | دخول رقم #{selectedPatient.id}
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. Progress Note (SOAP) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <StructuredSOAPNote
                  key={`soap-${selectedPatient.id}-${formKey}`}
                  note={{}}
                  onSave={handleSaveNote}
                  onSign={async () => {}} // Disabled for new notes directly
                  onCoSign={async () => {}}
                />
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
                
                {selectedPatient.vitalSigns && selectedPatient.vitalSigns.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                     <div className="bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 flex flex-col items-center">
                       <span className="text-slate-500 text-xs mb-1">Blood Pressure</span>
                       <span className="text-white font-bold text-lg">
                         {selectedPatient.vitalSigns[0].bpSystolic}/{selectedPatient.vitalSigns[0].bpDiastolic}
                       </span>
                       <span className="text-xs text-slate-600">mmHg</span>
                     </div>
                     
                     <div className="bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 flex flex-col items-center">
                       <span className="text-slate-500 text-xs mb-1">Heart Rate</span>
                       <div className="text-white font-bold text-lg flex items-baseline gap-1">
                          {selectedPatient.vitalSigns[0].pulse || '-'} 
                          <span className="text-xs text-slate-500 font-normal">bpm</span>
                       </div>
                     </div>

                     <div className="bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 flex flex-col items-center">
                       <span className="text-slate-500 text-xs mb-1">Temperature</span>
                       <div className="text-white font-bold text-lg flex items-baseline gap-1">
                         {selectedPatient.vitalSigns[0].temperature || '-'}
                         <span className="text-xs text-slate-500 font-normal">°C</span>
                       </div>
                     </div>

                     <div className="bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 flex flex-col items-center">
                       <span className="text-slate-500 text-xs mb-1">O2 Saturation</span>
                       <div className="text-white font-bold text-lg flex items-baseline gap-1">
                         {selectedPatient.vitalSigns[0].o2Sat || '-'}
                         <span className="text-xs text-slate-500 font-normal">%</span>
                       </div>
                     </div>

                     {selectedPatient.vitalSigns[0].respRate && (
                       <div className="bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 flex flex-col items-center">
                         <span className="text-slate-500 text-xs mb-1">Resp. Rate</span>
                         <div className="text-white font-bold text-lg flex items-baseline gap-1">
                           {selectedPatient.vitalSigns[0].respRate}
                           <span className="text-xs text-slate-500 font-normal">/min</span>
                         </div>
                       </div>
                     )}
                     
                     <div className="col-span-2 md:col-span-4 text-center mt-2">
                        <span className="text-xs text-slate-500 flex items-center justify-center gap-1">
                          🕒 recorded at {new Date(selectedPatient.vitalSigns[0].createdAt).toLocaleString('ar-SA')}
                        </span>
                     </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm italic">
                    لا توجد علامات حيوية مسجلة حديثاً
                  </div>
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
