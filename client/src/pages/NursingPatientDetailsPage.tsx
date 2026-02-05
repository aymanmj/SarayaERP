// src/pages/NursingPatientDetailsPage.tsx

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { VitalsPane } from "../components/encounter/VitalsPane";
import { MedicationAdministrationPane } from "../components/nursing/MedicationAdministrationPane";
import { toast } from "sonner";
import { useNursingWebSocket } from "../hooks/useNursingWebSocket";
import { NursingNotificationCenter } from "../components/nursing/NursingNotificationCenter";

type NursingNote = {
  id: number;
  note: string;
  isShiftHandover: boolean;
  createdAt: string;
  createdBy: { fullName: string };
};

type PatientHeader = {
  id: number;
  patient: { fullName: string; mrn: string; dateOfBirth: string };
  doctor: { fullName: string };
  bedAssignments: { bed: { bedNumber: string; ward: { name: string } } }[];
};

export default function NursingPatientDetailsPage() {
  const { id } = useParams<{ id: string }>(); // encounterId
  const encounterId = Number(id);
  const navigate = useNavigate();

  const [header, setHeader] = useState<PatientHeader | null>(null);
  const [activeTab, setActiveTab] = useState<"VITALS" | "MAR" | "NOTES">("MAR");

  // Notes State
  const [notes, setNotes] = useState<NursingNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [isHandover, setIsHandover] = useState(false);

  // WebSocket integration
  const {
    isConnected,
    alerts,
    medicationUpdates,
    vitalsUpdates,
    reportVitalsUpdated,
  } = useNursingWebSocket();

  const loadHeader = async () => {
    try {
      const res = await apiClient.get<PatientHeader>(
        `/encounters/${encounterId}`
      );
      setHeader(res.data);
    } catch {
      toast.error("فشل تحميل بيانات المريض");
    }
  };

  const loadNotes = async () => {
    try {
      const res = await apiClient.get<NursingNote[]>(
        `/nursing/encounters/${encounterId}/notes`
      );
      setNotes(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (encounterId) {
      loadHeader();
      loadNotes();
    }
  }, [encounterId]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      await apiClient.post(`/nursing/encounters/${encounterId}/notes`, {
        note: newNote,
        isShiftHandover: isHandover,
      });
      toast.success("تم إضافة الملاحظة");
      setNewNote("");
      setIsHandover(false);
      loadNotes();
    } catch {
      toast.error("فشل الحفظ");
    }
  };

  if (!header) return <div className="p-6 text-slate-400">جارِ التحميل...</div>;

  const currentBed = header?.bedAssignments?.[0]?.bed;

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6"
      dir="rtl"
    >
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-slate-400 hover:text-white text-sm"
            >
              🡲 رجوع
            </button>
            <h1 className="text-2xl font-bold text-white">
              {header.patient.fullName}
            </h1>
            <span className="bg-sky-900/30 text-sky-300 px-2 py-0.5 rounded text-xs font-mono">
              {header.patient.mrn}
            </span>
          </div>
          <div className="text-sm text-slate-400 mt-1 flex gap-4">
            {/* ✅ [تعديل] عرض السرير بشكل آمن */}
            <span>
              السرير:{" "}
              <span className="text-slate-200 font-semibold">
                {currentBed
                  ? `${currentBed.bedNumber} (${currentBed.ward.name})`
                  : "غير محدد (بدون سرير)"}
              </span>
            </span>

            <span>
              الطبيب:{" "}
              <span className="text-slate-200">
                {header.doctor?.fullName ?? "غير محدد"}
              </span>
            </span>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-slate-400">
              {isConnected ? 'متصل' : 'غير متصل'}
            </span>
          </div>
          
          {/* Notification Center */}
          <NursingNotificationCenter />
          
          {/* يمكن إضافة أزرار سريعة هنا مثل "طلب استشارة" */}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab("MAR")}
          className={`px-4 py-2 text-sm font-medium rounded-t-xl transition ${
            activeTab === "MAR"
              ? "bg-slate-800 text-sky-300 border-t border-x border-slate-700"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          💊 سجل الأدوية (eMAR)
        </button>
        <button
          onClick={() => setActiveTab("VITALS")}
          className={`px-4 py-2 text-sm font-medium rounded-t-xl transition ${
            activeTab === "VITALS"
              ? "bg-slate-800 text-sky-300 border-t border-x border-slate-700"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📈 العلامات الحيوية
        </button>
        <button
          onClick={() => setActiveTab("NOTES")}
          className={`px-4 py-2 text-sm font-medium rounded-t-xl transition ${
            activeTab === "NOTES"
              ? "bg-slate-800 text-sky-300 border-t border-x border-slate-700"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📝 ملاحظات التمريض
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-b-2xl rounded-tl-2xl p-6 overflow-y-auto">
        {/* TAB: eMAR */}
        {activeTab === "MAR" && (
          <MedicationAdministrationPane encounterId={encounterId} />
        )}

        {/* TAB: Vitals */}
        {activeTab === "VITALS" && <VitalsPane encounterId={encounterId} />}

        {/* TAB: Nursing Notes */}
        {activeTab === "NOTES" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {notes.length === 0 && (
                <div className="text-center text-slate-500 py-10">
                  لا توجد ملاحظات.
                </div>
              )}
              {notes.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 rounded-xl border ${
                    n.isShiftHandover
                      ? "bg-amber-900/10 border-amber-500/30"
                      : "bg-slate-900/80 border-slate-800"
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-200 text-sm">
                      {n.createdBy.fullName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(n.createdAt).toLocaleString("ar-LY")}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">
                    {n.note}
                  </p>
                  {n.isShiftHandover && (
                    <span className="mt-2 inline-block text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                      تسليم شفت 🔄
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="lg:col-span-1">
              <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl sticky top-4">
                <h3 className="text-sm font-bold text-slate-200 mb-3">
                  إضافة ملاحظة جديدة
                </h3>
                <textarea
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-sky-500 outline-none min-h-[120px]"
                  placeholder="اكتب ملاحظاتك هنا..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                ></textarea>
                <div className="flex items-center gap-2 mt-3 mb-3">
                  <input
                    type="checkbox"
                    id="handover"
                    checked={isHandover}
                    onChange={(e) => setIsHandover(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-600"
                  />
                  <label htmlFor="handover" className="text-xs text-slate-300">
                    هذه ملاحظة تسليم شفت (Handover)
                  </label>
                </div>
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  حفظ الملاحظة
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
