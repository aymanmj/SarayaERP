// src/pages/NursingStationPage.tsx
// صفحة محطة التمريض - تنفيذ أوامر الأطباء

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { useNursingWebSocket } from "../hooks/useNursingWebSocket";
import { NursingNotificationCenter } from "../components/nursing/NursingNotificationCenter";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

type CarePlanExecution = {
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
  executions: CarePlanExecution[];
};

type Patient = {
  id: number;
  fullName: string;
  mrn: string;
};

type Bed = {
  number: string;
  ward: { name: string };
};

type BedAssignment = {
  bed: Bed;
};

type InpatientEncounter = {
  id: number;
  patient: Patient;
  bedAssignments: BedAssignment[];
  carePlanItems: CarePlanItem[];
};

export default function NursingStationPage() {
  const [encounters, setEncounters] = useState<InpatientEncounter[]>([]);
  const [selectedEncounter, setSelectedEncounter] = useState<InpatientEncounter | null>(null);
  const [loading, setLoading] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CarePlanItem | null>(null);
  const [executeForm, setExecuteForm] = useState({ resultValue: "", note: "" });
  const [saving, setSaving] = useState(false);

  // WebSocket integration
  const {
    isConnected,
    alerts,
    medicationUpdates,
    vitalsUpdates,
    joinWard,
    reportMedicationAdministered,
    reportVitalsUpdated,
  } = useNursingWebSocket();

  const loadData = async () => {
    setLoading(true);
    try {
      // Get all inpatients for nursing view
      const res = await apiClient.get<InpatientEncounter[]>("/clinical/inpatient/all-patients");
      setEncounters(res.data);
    } catch (err) {
      // Fallback: try getting via my-rotation (for testing)
      try {
        const res = await apiClient.get<InpatientEncounter[]>("/clinical/inpatient/my-rotation?doctorId=1");
        setEncounters(res.data);
      } catch {
        toast.error("فشل تحميل قائمة مرضى الإيواء");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectPatient = async (enc: InpatientEncounter) => {
    // Reload care plan for this encounter
    try {
      const res = await apiClient.get<CarePlanItem[]>(`/clinical/inpatient/encounters/${enc.id}/care-plan?t=${Date.now()}`);
      setSelectedEncounter({ ...enc, carePlanItems: res.data });
    } catch {
      setSelectedEncounter(enc);
    }
  };

  const openExecuteModal = (item: CarePlanItem) => {
    setSelectedItem(item);
    setExecuteForm({ resultValue: "", note: "" });
    setShowExecuteModal(true);
  };

  const handleExecute = async () => {
    if (!selectedItem || !selectedEncounter) return;
    setSaving(true);
    try {
      await apiClient.post(`/clinical/inpatient/care-plan/${selectedItem.id}/execute`, {
        resultValue: executeForm.resultValue || null,
        note: executeForm.note || null,
      });
      
      // Report to WebSocket for real-time updates
      reportMedicationAdministered({
        encounterId: selectedEncounter.id,
        medicationName: selectedItem.instruction,
        administeredBy: "Current User", // Should come from auth context
        status: "ADMINISTERED",
      });
      
      toast.success("تم تسجيل التنفيذ بنجاح");
      setShowExecuteModal(false);
      handleSelectPatient(selectedEncounter); // Refresh
    } catch (err: any) {
      toast.error(err.response?.data?.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      MEDICATION: "💊 دواء",
      VITALS: "❤️ علامات حيوية",
      LAB_ORDER: "🧪 مختبر",
      RADIOLOGY: "📷 أشعة",
      DIET: "🍽️ نظام غذائي",
      ACTIVITY: "🏃 نشاط",
      NURSING_CARE: "🩺 رعاية تمريضية",
      OTHER: "📝 أخرى",
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      COMPLETED: "bg-slate-500/10 text-slate-400 border-slate-500/20",
      DISCONTINUED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      HELD: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    };
    return styles[status] || styles.ACTIVE;
  };

  return (
    <div className="p-6 h-full flex flex-col text-slate-100" dir="rtl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">🏥</span>
              محطة التمريض
            </h1>
            <p className="text-sm text-slate-400">
              عرض وتنفيذ الأوامر الطبية للمرضى المنومين
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
              <span className="text-xs text-slate-400">
                {isConnected ? 'متصل' : 'غير متصل'}
              </span>
            </div>
            
            {/* Notification Center */}
            <NursingNotificationCenter />
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Patients List */}
        <div className="w-72 flex-shrink-0 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 overflow-y-auto custom-scrollbar">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>المرضى المنومين</span>
            <span className="bg-sky-600 text-white px-2 py-0.5 rounded-full text-[10px]">
              {encounters.length}
            </span>
          </div>
          <div className="space-y-2">
            {encounters.map((enc) => {
              const bed = enc.bedAssignments?.[0]?.bed;
              return (
                <button
                  key={enc.id}
                  onClick={() => handleSelectPatient(enc)}
                  className={`w-full text-right p-3 rounded-xl border transition-all ${
                    selectedEncounter?.id === enc.id
                      ? "bg-sky-600 border-sky-500 text-white"
                      : "bg-slate-950 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  <div className="font-bold text-sm">{enc.patient.fullName}</div>
                  <div className="text-[10px] opacity-70 font-mono">
                    MRN: {enc.patient.mrn}
                  </div>
                  {bed && (
                    <div className="text-[10px] mt-1 flex items-center gap-1">
                      <span>🛏️</span>
                      <span>{bed.ward?.name} - سرير {bed.number}</span>
                    </div>
                  )}
                  <div className="text-[10px] mt-1 opacity-50">
                    {enc.carePlanItems?.filter(i => i.status === "ACTIVE").length || 0} أوامر نشطة
                  </div>
                  
                  {/* Real-time Alerts */}
                  {alerts.filter(alert => alert.encounterId === enc.id).length > 0 && (
                    <div className="mt-2 flex items-center gap-1">
                      <ExclamationTriangleIcon className="w-3 h-3 text-red-500" />
                      <span className="text-[10px] text-red-400">
                        {alerts.filter(alert => alert.encounterId === enc.id).length} تنبيه
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
            {encounters.length === 0 && !loading && (
              <div className="text-center text-slate-500 py-8">
                <div className="text-3xl mb-2">🛏️</div>
                <div>لا يوجد مرضى منومين</div>
              </div>
            )}
          </div>
        </div>

        {/* Care Plan Panel */}
        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col overflow-hidden">
          {!selectedEncounter ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <div className="text-5xl mb-3">📋</div>
                <div className="text-lg">اختر مريضاً لعرض الخطة العلاجية</div>
              </div>
            </div>
          ) : (
            <>
              {/* Patient Header */}
              <div className="border-b border-slate-800 pb-4 mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {selectedEncounter.patient.fullName}
                    </h2>
                    <p className="text-sm text-slate-400 font-mono">
                      MRN: {selectedEncounter.patient.mrn}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSelectPatient(selectedEncounter)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg"
                  >
                    🔄 تحديث
                  </button>
                </div>
              </div>

              {/* Care Plan Items */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                {selectedEncounter.carePlanItems?.filter(i => i.status === "ACTIVE").length === 0 ? (
                  <div className="text-center text-slate-500 py-12">
                    <div className="text-4xl mb-2">✅</div>
                    <div>لا توجد أوامر نشطة حالياً</div>
                  </div>
                ) : (
                  selectedEncounter.carePlanItems
                    ?.filter(i => i.status === "ACTIVE")
                    .map((item) => (
                      <div
                        key={item.id}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm">{getTypeLabel(item.type)}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded border ${getStatusBadge(item.status)}`}>
                                {item.status}
                              </span>
                              {item.frequency && (
                                <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded">
                                  {item.frequency}
                                </span>
                              )}
                            </div>
                            <div className="text-white font-medium mb-2">
                              {item.instruction}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-3">
                              <span>✍️ {item.createdBy?.fullName}</span>
                              <span>📅 {formatDate(item.createdAt)}</span>
                            </div>
                            
                            {/* Last Execution */}
                            {item.executions?.[0] && (
                              <div className="mt-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2 text-[11px]">
                                <div className="text-emerald-400 font-bold mb-1">آخر تنفيذ:</div>
                                <div className="text-slate-400">
                                  {new Date(item.executions[0].executedAt).toLocaleString("ar-SA")} - 
                                  {item.executions[0].executedBy?.fullName}
                                  {item.executions[0].resultValue && (
                                    <span className="text-white mr-2">النتيجة: {item.executions[0].resultValue}</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Execute Button */}
                          <button
                            onClick={() => openExecuteModal(item)}
                            className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all"
                          >
                            ✓ تنفيذ
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Execute Modal */}
      {showExecuteModal && selectedItem && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-3xl p-6 w-full max-w-lg space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-white">تسجيل تنفيذ الأمر</h3>
              <button
                onClick={() => setShowExecuteModal(false)}
                className="text-slate-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Order Summary */}
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <div className="text-sm text-sky-400 mb-1">
                {getTypeLabel(selectedItem.type)}
              </div>
              <div className="text-white font-medium">
                {selectedItem.instruction}
              </div>
              {selectedItem.frequency && (
                <div className="text-xs text-purple-400 mt-2">
                  التكرار: {selectedItem.frequency}
                </div>
              )}
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs block mb-2">
                  النتيجة / القيمة (اختياري)
                </label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition"
                  placeholder="مثال: 120/80 mmHg, تم الإعطاء, ..."
                  value={executeForm.resultValue}
                  onChange={(e) =>
                    setExecuteForm({ ...executeForm, resultValue: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-slate-400 text-xs block mb-2">
                  ملاحظات (اختياري)
                </label>
                <textarea
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 transition resize-none"
                  rows={3}
                  placeholder="أي ملاحظات إضافية..."
                  value={executeForm.note}
                  onChange={(e) =>
                    setExecuteForm({ ...executeForm, note: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowExecuteModal(false)}
                className="px-6 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleExecute}
                disabled={saving}
                className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-slate-700 text-sm font-bold shadow-lg transition"
              >
                {saving ? "جاري الحفظ..." : "✓ تأكيد التنفيذ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
