// src/pages/EncounterDetailsPage.tsx

// src/pages/EncounterDetailsPage.tsx

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Components
import { VitalsPane } from "../components/encounter/VitalsPane";
import { DiagnosisPane } from "../components/encounter/DiagnosisPane";
import { RadiologyTab } from "../components/encounter/RadiologyTab";
import { LabsTab } from "../components/encounter/LabsTab";
import { PrescriptionsTab } from "../components/encounter/PrescriptionsTab";
import { BillingTab } from "../components/encounter/BillingTab";
// ✅ استيراد المكون الجديد
import { AllergiesPane } from "../components/encounter/AllergiesPane";
import { ObstetricHistoryCard } from "./obgyn/ObstetricHistoryCard";

// --- Types ---
type EncounterStatus = "OPEN" | "CLOSED" | "CANCELLED";
type EncounterType = "OPD" | "ER" | "IPD";

type Patient = {
  id: number;
  fullName: string;
  mrn: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth?: string | null;
};

type Visit = {
  id: number;
  encounterId: number;
  doctorId?: number | null;
  visitDate: string;
  notes?: string | null;
};

type Department = { id: number; name: string };

type EncounterDetail = {
  id: number;
  hospitalId: number;
  patientId: number;
  departmentId?: number | null;
  doctorId?: number | null;
  type: EncounterType;
  status: EncounterStatus;
  chiefComplaint?: string | null;
  admissionDate?: string | null;
  dischargeDate?: string | null;
  createdAt: string;
  patient?: Patient;
  visits?: Visit[];
  doctor?: { fullName: string };
  department?: { name: string };
};

// ✅ إضافة ALLERGIES و OBGYN
type TabKey =
  | "VISITS"
  | "LABS"
  | "RADIOLOGY"
  | "PRESCRIPTIONS"
  | "BILLING"
  | "ALLERGIES"
  | "OBGYN";

// ✅ إضافة التبويب للقائمة
const tabs: { key: TabKey; label: string; icon: string; alert?: boolean; gender?: "MALE" | "FEMALE" }[] = [
  { key: "VISITS", label: "التشخيص والزيارة", icon: "🩺" },
  { key: "ALLERGIES", label: "الحساسية والمخاطر", icon: "⚠️", alert: true }, // مميز
  { key: "OBGYN", label: "النساء والولادة", icon: "🤰", gender: "FEMALE" },  // ✅ خاص بالنساء
  { key: "LABS", label: "المختبر", icon: "🧪" },
  { key: "RADIOLOGY", label: "الأشعة", icon: "☢️" },
  { key: "PRESCRIPTIONS", label: "الأدوية", icon: "💊" },
  { key: "BILLING", label: "الفوترة", icon: "💰" },
];

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calculateAge(dob: string | null | undefined) {
  if (!dob) return "";
  const diff = Date.now() - new Date(dob).getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

export default function EncounterDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const encId = Number(id);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // UI State
  const [visitNotes, setVisitNotes] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("VISITS");
  
  // Admission Modal
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [selectedDept, setSelectedDept] = useState("");

  // 1. Fetch Encounter Details
  const { data: encounter, isLoading: loading, error } = useQuery({
      queryKey: ['encounter', encId],
      queryFn: async () => {
          const res = await apiClient.get<EncounterDetail>(`/encounters/${encId}`);
          return res.data;
      },
      enabled: !!encId
  });

  // 2. Fetch Departments
  const { data: departments = [] } = useQuery({
      queryKey: ['departments'],
      queryFn: async () => {
          const res = await apiClient.get<Department[]>("/departments");
          return res.data;
      },
      staleTime: Infinity, // Departments rarely change
  });

  // --- Mutations ---

  const assignDoctorMutation = useMutation({
      mutationFn: async () => {
          await apiClient.patch(`/encounters/${encId}/assign-doctor`, {
             doctorId: user?.id,
          });
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['encounter', encId] });
          toast.success("تم تعيينك طبيباً للحالة.");
      },
      onError: () => toast.error("فشل التعيين.")
  });

  const addVisitNoteMutation = useMutation({
      mutationFn: async (notes: string) => {
          const res = await apiClient.post<Visit>("/visits", {
             encounterId: encId,
             notes: notes,
          });
          return res.data;
      },
      onSuccess: (newVisit) => {
          queryClient.setQueryData(['encounter', encId], (old: EncounterDetail | undefined) => {
              if (!old) return old;
              return {
                  ...old,
                  visits: old.visits ? [newVisit, ...old.visits] : [newVisit]
              };
          });
          setVisitNotes("");
          toast.success("تم حفظ الملاحظة.");
      },
      onError: () => toast.error("فشل الحفظ.")
  });

  const dischargeMutation = useMutation({
      mutationFn: async () => {
          await apiClient.patch(`/encounters/${encId}/discharge`);
      },
      onSuccess: () => {
          toast.success("تم تسجيل خروج المريض وإغلاق الملف.");
          navigate("/triage");
      },
      onError: (err: any) => toast.error(err.response?.data?.message || "فشل تسجيل الخروج")
  });

  const admitMutation = useMutation({
      mutationFn: async (deptId: number) => {
          await apiClient.patch(`/encounters/${encId}/admit`, {
            departmentId: deptId,
          });
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['encounter', encId] });
          toast.success("تم تحويل المريض للتنويم (Inpatient). يرجى مراجعة مكتب الدخول لتخصيص سرير.");
          setShowAdmitModal(false);
      },
      onError: (err: any) => toast.error(err.response?.data?.message || "فشل التنويم")
  });


  // --- Handlers ---

  const handleAssignToMe = () => {
    if (!user) return;
    assignDoctorMutation.mutate();
  };

  const handleAddVisitNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!encounter || !visitNotes.trim()) return;
    addVisitNoteMutation.mutate(visitNotes);
  };

  const handleDischarge = () => {
    if (!confirm("هل أنت متأكد من قرار خروج المريض (Discharge) وإغلاق الملف؟")) return;
    dischargeMutation.mutate();
  };

  const handleAdmit = () => {
    if (!selectedDept) {
      toast.warning("يرجى اختيار القسم المحول إليه");
      return;
    }
    admitMutation.mutate(Number(selectedDept));
  };

  // Loading States aliases for UI
  const assigning = assignDoctorMutation.isPending;
  const savingVisit = addVisitNoteMutation.isPending;
  const processingDecision = dischargeMutation.isPending || admitMutation.isPending;

  if (loading)
    return (
      <div className="p-8 text-center text-slate-400">
        جارِ تحميل الملف الطبي...
      </div>
    );
  if (error || !encounter)
    return (
      <div className="p-8 text-center text-rose-400">الملف غير موجود.</div>
    );

  const isClosed = encounter.status !== "OPEN";

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden">
      {/* 1. Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => navigate(-1)}
              className="text-slate-400 hover:text-white text-xs bg-slate-800 px-2 py-1 rounded"
            >
              ➜ رجوع
            </button>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {encounter.patient?.fullName}
            </h1>
            <span className="bg-sky-900/30 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded text-xs font-mono">
              {encounter.patient?.mrn}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${encounter.type === "ER" ? "bg-rose-900/20 text-rose-300 border-rose-500/30" : "bg-purple-900/20 text-purple-300 border-purple-500/30"}`}
            >
              {encounter.type === "ER"
                ? "طوارئ"
                : encounter.type === "IPD"
                  ? "دخول / إيواء"
                  : "عيادة"}
            </span>
          </div>
          <div className="text-xs text-slate-400 flex gap-4 mt-2">
            <span>{encounter.patient?.gender === "MALE" ? "ذكر" : "أنثى"}</span>
            <span className="text-slate-600">|</span>
            <span>{calculateAge(encounter.patient?.dateOfBirth)} سنة</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-300">
              دخول: {formatDateTime(encounter.createdAt)}
            </span>
            {encounter.chiefComplaint && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-amber-200/80">
                  الشكوى: {encounter.chiefComplaint}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right mr-2 hidden lg:block">
            <div className="text-[10px] text-slate-500">الطبيب المعالج</div>
            <div className="text-sm font-semibold text-emerald-400">
              {encounter.doctor?.fullName ?? "---"}
            </div>
          </div>

          {!encounter.doctorId && !isClosed && (
            <button
              onClick={handleAssignToMe}
              disabled={assigning}
              className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg animate-pulse"
            >
              {assigning ? "..." : "✋ تولي الحالة"}
            </button>
          )}

          {isClosed && (
            <div className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold border border-slate-600">
              🔒 ملف مغلق
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Layout */}
      <div className="flex flex-col xl:flex-row gap-6 flex-1 overflow-hidden">
        {/* Left Side: Tabs */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Custom Tab Navigation */}
          <div className="flex gap-2 border-b border-slate-800 pb-1 overflow-x-auto">
            {tabs
              .filter(tab => !tab.gender || tab.gender === encounter.patient?.gender) // ✅ فلترة حسب الجنس
              .map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 rounded-t-xl text-xs font-medium transition-all flex items-center gap-2
                            ${
                              activeTab === tab.key
                                ? "bg-slate-800 text-sky-400 border-t border-x border-slate-700 shadow-sm"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                            }
                            ${tab.alert ? "text-amber-400 hover:text-amber-200" : ""}
                            ${tab.key === "OBGYN" ? "text-pink-400 hover:text-pink-200" : ""} 
                            `}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-b-xl rounded-tr-xl p-5 overflow-y-auto custom-scrollbar">
            {activeTab === "VISITS" && (
              <div className="grid grid-cols-1 gap-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <VitalsPane encounterId={encounter.id} />
                  <DiagnosisPane encounterId={encounter.id} />
                </div>

                <div className="border-t border-slate-800 pt-6">
                  <h3 className="text-sm font-bold text-amber-400 mb-3">
                    ملاحظات الطبيب (Progress Notes)
                  </h3>

                  {!isClosed && (
                    <form
                      onSubmit={handleAddVisitNote}
                      className="mb-6 flex gap-3 items-start"
                    >
                      <textarea
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-sky-500 outline-none min-h-[80px]"
                        placeholder="اكتب ملاحظاتك وتوصياتك هنا..."
                        value={visitNotes}
                        onChange={(e) => setVisitNotes(e.target.value)}
                      ></textarea>
                      <button
                        type="submit"
                        disabled={!encounter.doctorId || savingVisit}
                        className="h-[80px] px-6 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg disabled:opacity-50"
                      >
                        حفظ
                      </button>
                    </form>
                  )}

                  <div className="space-y-4">
                    {encounter.visits?.map((v) => (
                      <div
                        key={v.id}
                        className="relative pl-4 border-l-2 border-slate-700 ml-2"
                      >
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-800 border-2 border-sky-500"></div>
                        <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-sm text-slate-200">
                          <div className="text-[10px] text-slate-500 mb-1 font-mono">
                            {formatDateTime(v.visitDate)}
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {v.notes}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ✅ عرض تبويب الحساسية */}
            {activeTab === "ALLERGIES" && (
              <div className="max-w-3xl">
                <AllergiesPane patientId={encounter.patientId} />
              </div>
            )}

            {/* ✅ عرض تبويب النساء والولادة */}
            {activeTab === "OBGYN" && (
               <div className="max-w-3xl space-y-6">
                 <ObstetricHistoryCard patientId={encounter.patientId} editable={true} />
                 <div className="flex justify-end">
                    <button
                      onClick={() => navigate(`/obgyn/deliveries/new?encounterId=${encId}`)}
                      className="bg-pink-600 hover:bg-pink-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
                    >
                      <span>👶</span> تسجيل ولادة جديدة
                    </button>
                 </div>
               </div>
            )}

            {activeTab === "LABS" && (
              <LabsTab
                encounterId={encounter.id}
                hospitalId={encounter.hospitalId}
                doctorId={encounter.doctorId}
              />
            )}
            {activeTab === "RADIOLOGY" && (
              <RadiologyTab
                encounterId={encounter.id}
                hospitalId={encounter.hospitalId}
                doctorId={encounter.doctorId}
              />
            )}
            {activeTab === "PRESCRIPTIONS" && (
              <PrescriptionsTab
                encounterId={encounter.id}
                hospitalId={encounter.hospitalId}
                doctorId={encounter.doctorId}
              />
            )}
            {activeTab === "BILLING" && (
              <BillingTab
                encounterId={encounter.id}
                hospitalId={encounter.hospitalId}
              />
            )}
          </div>
        </div>

        {/* Right Side: Actions */}
        <div className="xl:w-80 flex flex-col gap-4 flex-shrink-0">
          {!isClosed && encounter.type === "ER" && (
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-lg">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                ⚖️ القرار الطبي
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                بناءً على التقييم، يرجى اتخاذ القرار المناسب للحالة:
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleDischarge}
                  disabled={processingDecision}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition flex justify-center items-center gap-2"
                >
                  <span>🏠</span> خروج (Discharge)
                </button>

                <button
                  onClick={() => setShowAdmitModal(true)}
                  disabled={processingDecision}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow transition flex justify-center items-center gap-2"
                >
                  <span>🛏️</span> دخول (Admission)
                </button>

                {encounter.patient?.gender === 'FEMALE' && (
                  <button
                    onClick={() => navigate(`/obgyn/deliveries/new?encounterId=${encId}`)}
                    className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold shadow transition flex justify-center items-center gap-2"
                  >
                    <span>👶</span> تسجيل ولادة (Delivery)
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <h3 className="text-xs font-bold text-slate-300 mb-3 border-b border-slate-800 pb-2">
              ملخص سريع
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">العلامات الحيوية:</span>
                <span className="text-slate-200">مسجلة</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">التشخيص المبدئي:</span>
                <span className="text-slate-200">متوفر</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admission Modal */}
      {showAdmitModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">
              قرار تنويم المريض
            </h3>
            <div className="space-y-3 mb-6">
              <label className="text-xs text-slate-400">إلى أي قسم؟</label>
              <select
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-500"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
              >
                <option value="">-- اختر القسم --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500">
                * سيتحول نوع الحالة إلى IPD وسيتمكن مكتب الدخول من تخصيص سرير.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAdmitModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleAdmit}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-xs text-white font-bold"
              >
                تأكيد الدخول
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
