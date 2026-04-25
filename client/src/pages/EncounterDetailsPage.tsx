// src/pages/EncounterDetailsPage.tsx

// src/pages/EncounterDetailsPage.tsx
// src/pages/EncounterDetailsPage.tsx

import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Clock, CheckCircle2, Sparkles, X } from "lucide-react";

// Components
import { AllergiesPane } from "../components/encounter/AllergiesPane";

const loadVitalsPane = () =>
  import("../components/encounter/VitalsPane").then((module) => ({
    default: module.VitalsPane,
  }));
const loadDiagnosisPane = () =>
  import("../components/encounter/DiagnosisPane").then((module) => ({
    default: module.DiagnosisPane,
  }));
const loadRadiologyTab = () =>
  import("../components/encounter/RadiologyTab").then((module) => ({
    default: module.RadiologyTab,
  }));
const loadLabsTab = () =>
  import("../components/encounter/LabsTab").then((module) => ({
    default: module.LabsTab,
  }));
const loadPrescriptionsTab = () =>
  import("../components/encounter/PrescriptionsTab").then((module) => ({
    default: module.PrescriptionsTab,
  }));
const loadBillingTab = () =>
  import("../components/encounter/BillingTab").then((module) => ({
    default: module.BillingTab,
  }));
const loadObstetricHistoryCard = () =>
  import("./obgyn/ObstetricHistoryCard").then((module) => ({
    default: module.ObstetricHistoryCard,
  }));
const loadRequestTransferModal = () =>
  import("./clinical/transfers/RequestTransferModal").then((module) => ({
    default: module.RequestTransferModal,
  }));
const loadQuickSummaryCard = () => import("../components/encounter/QuickSummaryCard");
const loadQuickProtocolsWidget = () =>
  import("../components/encounter/QuickProtocolsWidget");

const VitalsPane = lazy(loadVitalsPane);
const DiagnosisPane = lazy(loadDiagnosisPane);
const RadiologyTab = lazy(loadRadiologyTab);
const LabsTab = lazy(loadLabsTab);
const PrescriptionsTab = lazy(loadPrescriptionsTab);
const BillingTab = lazy(loadBillingTab);
const ObstetricHistoryCard = lazy(loadObstetricHistoryCard);
const RequestTransferModal = lazy(loadRequestTransferModal);
const QuickSummaryCard = lazy(loadQuickSummaryCard);
const QuickProtocolsWidget = lazy(loadQuickProtocolsWidget);

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
  admission?: { id: number };
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
  | "OBGYN"
  | "ANDROLOGY";

// ✅ إضافة التبويب للقائمة
const tabs: { key: TabKey; label: string; icon: string; alert?: boolean; gender?: "MALE" | "FEMALE" }[] = [
  { key: "VISITS", label: "التشخيص والزيارة", icon: "🩺" },
  { key: "ALLERGIES", label: "الحساسية والمخاطر", icon: "⚠️", alert: true },
  { key: "OBGYN", label: "النساء والولادة", icon: "🤰", gender: "FEMALE" },
  { key: "ANDROLOGY", label: "أمراض الذكورة", icon: "🧬", gender: "MALE" },
  { key: "LABS", label: "المختبر", icon: "🧪" },
  { key: "RADIOLOGY", label: "الأشعة", icon: "☢️" },
  { key: "PRESCRIPTIONS", label: "الأدوية", icon: "💊" },
  { key: "BILLING", label: "الفوترة", icon: "💰" },
];

const tabPreloaders: Partial<Record<TabKey, () => Promise<unknown>>> = {
  VISITS: () => Promise.all([loadVitalsPane(), loadDiagnosisPane()]),
  LABS: loadLabsTab,
  RADIOLOGY: loadRadiologyTab,
  PRESCRIPTIONS: loadPrescriptionsTab,
  BILLING: loadBillingTab,
  OBGYN: loadObstetricHistoryCard,
};

function LazyPanelFallback({ label = "تحميل المحتوى..." }: { label?: string }) {
  return (
    <div className="min-h-[220px] rounded-2xl border border-slate-800 bg-slate-950/40 flex items-center justify-center text-sm text-slate-500">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-sky-500" />
        <span>{label}</span>
      </div>
    </div>
  );
}

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

function LegacyQuickSummaryCard({ encounterId, status }: { encounterId: number; status: EncounterStatus }) {
  const [vitals, setVitals] = useState<any[]>([]);
  const [diagnoses, setDiagnoses] = useState<any[]>([]);

  useEffect(() => {
    apiClient.get(`/vitals/encounter/${encounterId}`).then(r => setVitals(r.data)).catch(() => {});
    apiClient.get(`/diagnosis/encounter/${encounterId}`).then(r => setDiagnoses(r.data)).catch(() => {});
  }, [encounterId]);

  const latestVital = vitals.length > 0 ? vitals[0] : null;
  const primaryDx = diagnoses.find((d: any) => d.type === 'PRIMARY');

  return (
    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
      <h3 className="text-xs font-bold text-slate-300 mb-3 border-b border-slate-800 pb-2">
        ملخص سريع
      </h3>
      <div className="space-y-3 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">العلامات الحيوية:</span>
          {latestVital ? (
            <span className="text-emerald-400 font-mono">
              {latestVital.bpSystolic && `${latestVital.bpSystolic}/${latestVital.bpDiastolic}`}
              {latestVital.pulse && ` | HR ${latestVital.pulse}`}
              {latestVital.temperature && ` | ${latestVital.temperature}°`}
              {latestVital.o2Sat && ` | O₂ ${latestVital.o2Sat}%`}
              {!latestVital.bpSystolic && !latestVital.pulse && !latestVital.temperature && !latestVital.o2Sat && 'مسجلة'}
            </span>
          ) : (
            <span className="text-red-400">لا توجد قراءات</span>
          )}
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">التشخيص المبدئي:</span>
          {primaryDx ? (
            <span className="text-emerald-400 truncate max-w-[180px]" title={primaryDx.diagnosisCode?.nameEn}>
              {primaryDx.diagnosisCode?.code} — {primaryDx.diagnosisCode?.nameAr || primaryDx.diagnosisCode?.nameEn}
            </span>
          ) : (
            <span className="text-red-400">غير متوفر</span>
          )}
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">حالة الملف:</span>
          <span className={status === 'OPEN' ? 'text-emerald-400' : status === 'CLOSED' ? 'text-slate-500' : 'text-red-400'}>
            {status === 'OPEN' ? '🟢 مفتوح' : status === 'CLOSED' ? '🔒 مغلق' : '❌ ملغي'}
          </span>
        </div>
      </div>
    </div>
  );
}

function LegacyQuickProtocolsWidget({ encounterId }: { encounterId: number }) {
  const [orderSets, setOrderSets] = useState<any[]>([]);
  const [pathways, setPathways] = useState<any[]>([]);
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [enrollingId, setEnrollingId] = useState<number | null>(null);

  useEffect(() => {
    apiClient.get('/order-sets').then(r => setOrderSets(r.data)).catch(() => {});
    apiClient.get('/clinical-pathways').then(r => setPathways(r.data)).catch(() => {});
  }, []);

  const executeOrderSet = async (setId: number, name: string) => {
    if (!confirm(`تأكيد تنفيذ بروتوكول "${name}" بجميع طلباته السريرية لهذه الحالة؟`)) return;
    setExecutingId(setId);
    try {
      await apiClient.post(`/order-sets/${setId}/execute`, { encounterId });
      toast.success('تم الاعتماد وإرسال الطلبات بنجاح');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر تنفيذ البروتوكول');
    } finally {
      setExecutingId(null);
    }
  };

  const enrollPathway = async (pathwayId: number, name: string) => {
    if (!confirm(`تأكيد إدراج الحالة في المسار العلاجي "${name}"؟`)) return;
    setEnrollingId(pathwayId);
    try {
      await apiClient.post(`/clinical-pathways/${pathwayId}/enroll`, { encounterId });
      toast.success('تم إدراج المريض وبدء المسار العلاجي');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'تعذر الإدراج في المسار');
    } finally {
      setEnrollingId(null);
    }
  };

  if (orderSets.length === 0 && pathways.length === 0) return null;

  return (
    <div className="bg-slate-900/80 border border-sky-900/40 p-4 rounded-2xl shadow-[0_0_30px_-5px_rgba(14,165,233,0.15)] relative overflow-hidden mt-4">
      <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl -mx-10 -my-10 pointer-events-none" />
      
      {orderSets.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-black text-sky-400 mb-3 border-b border-slate-800 pb-2 flex items-center gap-1.5 relative z-10">
            ⚡ أوامر المجموعات (Order Sets)
          </h3>
          <div className="space-y-2 relative z-10 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {orderSets.map(set => (
              <button
                key={set.id}
                onClick={() => executeOrderSet(set.id, set.nameAr || set.name)}
                disabled={executingId !== null || enrollingId !== null}
                className="w-full relative group bg-slate-950 border border-slate-800 hover:border-sky-500/50 p-3 rounded-xl transition-all text-right disabled:opacity-50"
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="text-xs font-bold text-slate-200">{set.nameAr || set.name}</div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-400">{set.category || 'عام'}</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate max-w-[85%]">{set.description || 'تنفيذ الإجراءات المرفقة تلقائياً'}</div>
                
                <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {executingId === set.id ? <span className="animate-pulse">⏳</span> : '🚀'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {pathways.length > 0 && (
        <div>
          <h3 className="text-xs font-black text-pink-400 mb-3 border-b border-slate-800 pb-2 flex items-center gap-1.5 relative z-10">
            🛤️ مسارات العلاج (Pathways)
          </h3>
          <div className="space-y-2 relative z-10 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {pathways.map(pw => (
              <button
                key={pw.id}
                onClick={() => enrollPathway(pw.id, pw.nameAr || pw.name)}
                disabled={executingId !== null || enrollingId !== null}
                className="w-full relative group bg-slate-950 border border-slate-800 hover:border-pink-500/50 p-3 rounded-xl transition-all text-right disabled:opacity-50"
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="text-xs font-bold text-slate-200">{pw.nameAr || pw.name}</div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-400">LOS: {pw.expectedLOSDays || '-'}</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate max-w-[85%]">{pw.targetDiagnosis || 'خطة علاجية مقسمة على الأيام'}</div>
                
                <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {enrollingId === pw.id ? <span className="animate-pulse">⏳</span> : '➕'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-center mt-3 pt-2 border-t border-slate-800 relative z-10 flex flex-col gap-1.5">
         <Link to="/order-sets" className="text-[10px] text-sky-500 hover:text-sky-400 font-bold transition-colors">
           إدارة محتوى البروتوكولات ←
         </Link>
         <Link to="/clinical-pathways" className="text-[10px] text-pink-500 hover:text-pink-400 font-bold transition-colors">
           إدارة المسارات السريرية ←
         </Link>
      </div>
    </div>
  );
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
  const [noteTemplates, setNoteTemplates] = useState<{ id: number; name: string; content: string }[]>([]);
  
  // Admission Modal
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedWardId, setSelectedWardId] = useState("");
  const [selectedBedId, setSelectedBedId] = useState("");
  const [wardTree, setWardTree] = useState<{ id: number; name: string; rooms: { id: number; roomNumber: string; beds: { id: number; bedNumber: string; status: string }[] }[] }[]>([]);

  // Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);

  // AI Coding Modal
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);

  // Load ward tree for bed selection
  useEffect(() => {
    apiClient.get("/beds/tree").then((res) => setWardTree(res.data)).catch(() => {});
    apiClient.get("/note-templates").then((res) => setNoteTemplates(res.data)).catch(() => {});
  }, []);

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

  // 3. Fetch Active Transfers for this Encounter
  const { data: pendingTransfers = [] } = useQuery({
      queryKey: ['transfers', encId],
      queryFn: async () => {
          const res = await apiClient.get<any[]>("/transfers/pending"); 
          return res.data.filter((t: any) => t.encounterId === encId);
      },
      enabled: !!encId
  });

  const activeTransfer = pendingTransfers.length > 0 ? pendingTransfers[0] : null;

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
      mutationFn: async ({ deptId, bedId }: { deptId: number; bedId?: number }) => {
          await apiClient.post(`/admissions`, {
            patientId: encounter?.patientId,
            encounterId: encId,
            departmentId: deptId,
            admissionType: "EMERGENCY", 
            priority: "HIGH",
            admissionReason: "دخول من قسم الطوارئ",
            isEmergency: true,
            admittingDoctorId: encounter?.doctorId || user?.id, 
            primaryPhysicianId: encounter?.doctorId || user?.id,
            bedId: bedId || undefined,
          });
          if (bedId && encId) {
            try {
              await apiClient.post('/beds/assign', { encounterId: encId, bedId });
            } catch {
              // Bed assignment is best-effort, admission already succeeded
            }
          }
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['encounter', encId] });
          toast.success("تم تحويل المريض للإيواء بنجاح وأُضيف لجدول التنويم النشط.");
          setShowAdmitModal(false);
      },
      onError: (err: any) => toast.error(err.response?.data?.message || "فشل الإيواء")
  });

  const aiCodingMutation = useMutation({
    mutationFn: async (note: string) => {
      const { data } = await apiClient.post('/ai-coding/suggest', { clinicalNote: note });
      return data;
    },
    onSuccess: (data) => {
      setAiSuggestions(data);
    },
    onError: () => toast.error("فشل تحليل الملاحظة السريرية بواسطة الذكاء الاصطناعي")
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

  const handleAiCoding = () => {
    if (!visitNotes.trim()) {
      toast.warning("يرجى كتابة ملاحظات سريرية أولاً ليتم تحليلها.");
      return;
    }
    setShowAiModal(true);
    aiCodingMutation.mutate(visitNotes);
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
    admitMutation.mutate({
      deptId: Number(selectedDept),
      bedId: selectedBedId ? Number(selectedBedId) : undefined,
    });
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
      {activeTransfer && (
        <div className="bg-amber-900/20 border border-amber-500/50 rounded-2xl p-4 flex items-center gap-4 shadow-sm animate-pulse">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-full">
               <Clock className="w-6 h-6" />
            </div>
            <div className="flex-1">
               <h3 className="text-amber-400 font-bold text-sm">يوجد طلب نقل قيد المعالجة (Transfer Pending)</h3>
               <p className="text-amber-200/70 text-xs mt-1">
                  {activeTransfer.status === 'REQUESTED' 
                    ? "بانتظار طبيب/تمريض القسم المستقبل لتخصيص سرير للمريض." 
                    : activeTransfer.status === 'BED_ALLOCATED' 
                    ? "تم تخصيص السرير بنجاح! يرجى التواصل مع فريق التمريض لتسليم الحالة (SBAR Handover) قبل نقل المريض فعلياً."
                    : activeTransfer.status === 'HANDOVER_SIGNED'
                    ? "تم تسليم الحالة. بانتظار تأكيد وصول المريض للقسم المستقبل."
                    : "الطلب قيد المعالجة."}
               </p>
            </div>
            <div className="text-left shrink-0">
               <span className="bg-amber-950/50 text-amber-500 border border-amber-500/30 px-3 py-1 rounded-xl text-xs font-bold">
                 الحالة: {activeTransfer.status}
               </span>
            </div>
        </div>
      )}

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
            <Link
              to={`/patients/${encounter.patientId}/chart`}
              className="bg-emerald-900/30 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded text-xs font-bold hover:bg-emerald-800/40 transition-colors flex items-center gap-1"
            >
              📋 السجل الطبي
            </Link>
            
            {encounter.type === "IPD" && encounter.admission?.id && (
              <Link
                to={`/discharge-summary/${encounter.admission.id}`}
                className="bg-amber-900/30 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded text-xs font-bold hover:bg-amber-800/40 transition-colors flex items-center gap-1"
              >
                📝 ملخص الخروج (Discharge Summary)
              </Link>
            )}

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
                onMouseEnter={() => tabPreloaders[tab.key]?.()}
                onFocus={() => tabPreloaders[tab.key]?.()}
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
                  <Suspense fallback={<LazyPanelFallback label="تحميل لوحة العلامات الحيوية..." />}>
                    <VitalsPane encounterId={encounter.id} />
                  </Suspense>
                  <Suspense fallback={<LazyPanelFallback label="تحميل لوحة التشخيص..." />}>
                    <DiagnosisPane encounterId={encounter.id} />
                  </Suspense>
                </div>
              </div>
            )}

            {/* ✅ عرض تبويب النساء والولادة */}
            {activeTab === "OBGYN" && (
               <div className="max-w-3xl space-y-6">
                 <Suspense fallback={<LazyPanelFallback label="تحميل ملف النساء والولادة..." />}>
                   <ObstetricHistoryCard patientId={encounter.patientId} editable={true} />
                 </Suspense>
                 <div className="flex justify-end gap-3 flex-wrap">
                    <button
                      onClick={() => navigate(`/obgyn/anc?patientId=${encounter.patientId}`)}
                      className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
                    >
                      <span>🤰</span> متابعة الحمل (ANC)
                    </button>
                    <button
                      onClick={() => navigate(`/obgyn/fertility?patientId=${encounter.patientId}`)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
                    >
                      <span>🧬</span> الحقن المجهري (IVF)
                    </button>
                    <button
                      onClick={() => navigate(`/obgyn/deliveries/new?encounterId=${encId}`)}
                      className="bg-pink-600 hover:bg-pink-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
                    >
                      <span>👶</span> تسجيل ولادة جديدة
                    </button>
                 </div>
               </div>
            )}

            {/* ✅ عرض تبويب أمراض الذكورة */}
            {activeTab === "ANDROLOGY" && (
               <div className="max-w-3xl space-y-6">
                 <div className="bg-slate-900/80 border border-cyan-900/40 rounded-2xl p-6">
                   <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">🧬 ملف أمراض الذكورة والعقم</h3>
                   <p className="text-slate-400 text-sm mb-6">يمكنك من هنا الوصول لملف المريض في عيادة أمراض الذكورة وتحاليل السائل المنوي وملفات العقم المشتركة.</p>
                   <div className="flex justify-end gap-3 flex-wrap">
                     <button
                       onClick={() => navigate(`/andrology?patientId=${encounter.patientId}`)}
                       className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
                     >
                       <span>🔬</span> تحليل السائل المنوي
                     </button>
                     <button
                       onClick={() => navigate(`/obgyn/fertility?patientId=${encounter.patientId}`)}
                       className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"
                     >
                       <span>💑</span> ملف العقم المشترك (IVF)
                     </button>
                   </div>
                 </div>
               </div>
            )}

            {activeTab === "LABS" && (
              <Suspense fallback={<LazyPanelFallback label="تحميل تبويب المختبر..." />}>
                <LabsTab
                  encounterId={encounter.id}
                  hospitalId={encounter.hospitalId}
                  doctorId={encounter.doctorId}
                />
              </Suspense>
            )}
            {activeTab === "RADIOLOGY" && (
              <Suspense fallback={<LazyPanelFallback label="تحميل تبويب الأشعة..." />}>
                <RadiologyTab
                  encounterId={encounter.id}
                  hospitalId={encounter.hospitalId}
                  doctorId={encounter.doctorId}
                />
              </Suspense>
            )}
            {activeTab === "PRESCRIPTIONS" && (
              <Suspense fallback={<LazyPanelFallback label="تحميل تبويب الأدوية..." />}>
                <PrescriptionsTab
                  encounterId={encounter.id}
                  hospitalId={encounter.hospitalId}
                  doctorId={encounter.doctorId}
                />
              </Suspense>
            )}
            {activeTab === "BILLING" && (
              <Suspense fallback={<LazyPanelFallback label="تحميل تبويب الفوترة..." />}>
                <BillingTab
                  encounterId={encounter.id}
                  hospitalId={encounter.hospitalId}
                />
              </Suspense>
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

          {!isClosed && encounter.type === "IPD" && (
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-lg mt-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                🔄 أوامر النقل
              </h2>
              {activeTransfer ? (
                <div className="w-full py-2.5 bg-slate-700/50 border border-slate-600/50 text-slate-400 rounded-xl text-xs font-bold flex flex-col justify-center items-center gap-2 cursor-not-allowed">
                  <span>⏳ طلب النقل قيد الانتظار</span>
                  <span className="text-[10px] text-slate-500 font-normal">لا يمكنك طلب نقل جديد حالياً</span>
                </div>
              ) : (
                <button
                  onClick={() => setShowTransferModal(true)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow transition flex justify-center items-center gap-2"
                >
                  <span>🚑</span> طلب نقل (عناية/قسم)
                </button>
              )}
            </div>
          )}

          <Suspense fallback={<LazyPanelFallback label="تحميل الملخص السريع..." />}>
            <QuickSummaryCard encounterId={encId} status={encounter.status} />
          </Suspense>
          <Suspense fallback={<LazyPanelFallback label="تحميل البروتوكولات السريعة..." />}>
            <QuickProtocolsWidget encounterId={encId} />
          </Suspense>
        </div>
      </div>

      {/* Admission Modal */}
      {showAdmitModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">
              قرار إيواء المريض
            </h3>
            <div className="space-y-4 mb-6">
              {/* Department Selection */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">إلى أي قسم؟</label>
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
              </div>

              {/* Ward Selection */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">العنبر (اختياري)</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-500"
                  value={selectedWardId}
                  onChange={(e) => {
                    setSelectedWardId(e.target.value);
                    setSelectedBedId("");
                  }}
                >
                  <option value="">-- اختر العنبر --</option>
                  {wardTree.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.rooms.flatMap((r) => r.beds.filter((b) => b.status === "AVAILABLE")).length} سرير متاح)
                    </option>
                  ))}
                </select>
              </div>

              {/* Bed Selection */}
              {selectedWardId && (() => {
                const ward = wardTree.find((w) => w.id === Number(selectedWardId));
                const beds = ward?.rooms.flatMap((room) =>
                  room.beds
                    .filter((b) => b.status === "AVAILABLE")
                    .map((b) => ({ ...b, roomNumber: room.roomNumber }))
                ) || [];
                return (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">السرير</label>
                    {beds.length === 0 ? (
                      <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800/30 rounded-xl p-2">
                        ⚠️ لا توجد أسرّة متاحة في هذا العنبر.
                      </p>
                    ) : (
                      <select
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-500"
                        value={selectedBedId}
                        onChange={(e) => setSelectedBedId(e.target.value)}
                      >
                        <option value="">-- اختر السرير --</option>
                        {beds.map((b) => (
                          <option key={b.id} value={b.id}>
                            غرفة {b.roomNumber} — سرير {b.bedNumber}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })()}

              <p className="text-[10px] text-slate-500">
                * اختيار السرير اختياري. يمكن تعيين السرير لاحقاً من صفحة حالات الإيواء.
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

      {/* Transfer Request Modal */}
      {encounter.patient && (
        <Suspense fallback={null}>
          <RequestTransferModal 
            isOpen={showTransferModal}
            onClose={() => setShowTransferModal(false)}
            encounterId={encId}
            patientName={encounter.patient.fullName}
            fromBedId={null} // Can't easily grab bed from pure encounter query here, backend will figure it out if it exists
            onSuccess={() => {
              // Can show a toast or refresh
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
