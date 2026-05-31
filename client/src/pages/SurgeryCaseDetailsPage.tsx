// src/pages/SurgeryCaseDetailsPage.tsx

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type SurgeryStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "RECOVERY"
  | "COMPLETED"
  | "CANCELLED";

type SurgeryCaseDetails = {
  id: number;
  surgeryName: string;
  status: SurgeryStatus;
  scheduledStart: string;
  actualStart?: string;
  actualEnd?: string;
  surgeonNotes?: string;
  anesthesiaNotes?: string;
  preOpDiagnosis?: string;
  postOpDiagnosis?: string;
  serviceItem?: { id: number; name: string; code: string; defaultPrice: string };
  encounter: {
    patient: { fullName: string; mrn: string };
    department?: { name: string };
    bedAssignments?: {
      bed: {
        bedNumber: string;
        room: { roomNumber: string };
        ward: { name: string };
      };
    }[];
  };
  theatre: { name: string };
  team: { id: number; role: string; commissionAmount?: string; user: { fullName: string } }[];
  consumables: {
    id: number;
    quantity: string;
    product: { name: string };
    totalPrice: string;
  }[];
};


type UserLite = { id: number; fullName: string };
type ProductLite = { id: number; name: string; stockOnHand: string };

const ROLES = [
  "SURGEON",
  "ASSISTANT_SURGEON",
  "ANESTHETIST",
  "SCRUB_NURSE",
  "CIRCULATING_NURSE",
  "TECHNICIAN",
];

export default function SurgeryCaseDetailsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const getRoleLabel = (role: string) => {
    const keys: Record<string, { key: string; defaultValue: string }> = {
      SURGEON: { key: "surgery.role.surgeon", defaultValue: "جراح رئيسي" },
      ASSISTANT_SURGEON: { key: "surgery.role.assistantSurgeon", defaultValue: "مساعد جراح" },
      ANESTHETIST: { key: "surgery.role.anesthetist", defaultValue: "طبيب تخدير" },
      TECHNICIAN: { key: "surgery.role.anesthetistTech", defaultValue: "فني تخدير / عمليات" },
      SCRUB_NURSE: { key: "surgery.role.scrubNurse", defaultValue: "ممرضة تعقيم" },
      CIRCULATING_NURSE: { key: "surgery.role.circulatingNurse", defaultValue: "ممرضة متجولة" },
    };
    const item = keys[role];
    return item ? t(item.key, item.defaultValue) : role;
  };

  const [surgery, setSurgery] = useState<SurgeryCaseDetails | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);

  // Lists for dropdowns
  const [users, setUsers] = useState<UserLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);

  // Team form
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState(ROLES[0]);

  // Consumables form
  const [selectedProduct, setSelectedProduct] = useState("");
  const [consumableQty, setConsumableQty] = useState(1);
  const [addingConsumable, setAddingConsumable] = useState(false);

  // Surgical Notes form
  const [surgeonNotes, setSurgeonNotes] = useState("");
  const [anesthesiaNotes, setAnesthesiaNotes] = useState("");
  const [preOpDiagnosis, setPreOpDiagnosis] = useState("");
  const [postOpDiagnosis, setPostOpDiagnosis] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Tab & workflow states
  const [activeTab, setActiveTab] = useState<"operative" | "preop" | "intraop" | "pacu">("operative");

  // Pre-Op states
  const [preopIdentity, setPreopIdentity] = useState(false);
  const [preopSite, setPreopSite] = useState(false);
  const [preopConsent, setPreopConsent] = useState(false);
  const [preopAnesthesia, setPreopAnesthesia] = useState(false);
  const [preopPulseOx, setPreopPulseOx] = useState(false);
  const [preopAllergies, setPreopAllergies] = useState(false);
  const [preopAllergyDetails, setPreopAllergyDetails] = useState("");
  const [preopAirway, setPreopAirway] = useState(false);
  const [preopBloodLoss, setPreopBloodLoss] = useState(false);
  const [preopNotes, setPreopNotes] = useState("");
  const [savingPreop, setSavingPreop] = useState(false);

  // Intra-Op states
  const [intraTimeOut, setIntraTimeOut] = useState(false);
  const [intraTeamIntro, setIntraTeamIntro] = useState(false);
  const [intraCriticalEvents, setIntraCriticalEvents] = useState(false);
  const [intraAntibiotics, setIntraAntibiotics] = useState(false);
  const [intraAntibioticDetails, setIntraAntibioticDetails] = useState("");
  const [intraSterility, setIntraSterility] = useState(false);
  const [intraCountsCorrect, setIntraCountsCorrect] = useState(false);
  const [intraSpecimenLabeled, setIntraSpecimenLabeled] = useState(false);
  const [intraNotes, setIntraNotes] = useState("");
  const [savingIntra, setSavingIntra] = useState(false);

  // PACU Recovery states
  const [pacuActivity, setPacuActivity] = useState(2);
  const [pacuRespiration, setPacuRespiration] = useState(2);
  const [pacuCirculation, setPacuCirculation] = useState(2);
  const [pacuConsciousness, setPacuConsciousness] = useState(2);
  const [pacuOxygen, setPacuOxygen] = useState(2);
  const [pacuExtubated, setPacuExtubated] = useState(true);
  const [pacuNotes, setPacuNotes] = useState("");
  const [savingPacu, setSavingPacu] = useState(false);

  const parsePreOpNotes = (notes?: string) => {
    if (!notes) return null;
    const match = notes.match(/--- PRE-OP CHECKLIST \(By User \d+\) ---\n([\s\S]+)/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parseIntraOpNotes = (notes?: string) => {
    if (!notes) return null;
    const match = notes.match(/--- INTRA-OP LOG \(By User \d+\) ---\n([\s\S]+)/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const parsePacuNotes = (notes?: string) => {
    if (!notes) return null;
    const match = notes.match(/--- PACU RECOVERY LOG \(By User \d+\) ---\n([\s\S]+)/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  };

  const loadCase = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<SurgeryCaseDetails>(
        `/surgery/cases/${id}`
      );
      setSurgery(res.data);
      // Populate notes from server
      setSurgeonNotes(res.data.surgeonNotes || "");
      setAnesthesiaNotes(res.data.anesthesiaNotes || "");
      setPreOpDiagnosis(res.data.preOpDiagnosis || "");
      setPostOpDiagnosis(res.data.postOpDiagnosis || "");

      // Parse JSON parts if exist
      const preop = parsePreOpNotes(res.data.anesthesiaNotes);
      if (preop) {
        setPreopIdentity(!!preop.identityVerified);
        setPreopSite(!!preop.siteMarked);
        setPreopConsent(!!preop.consentSigned);
        setPreopAnesthesia(!!preop.anesthesiaSafetyCheck);
        setPreopPulseOx(!!preop.pulseOximeterActive);
        setPreopAllergies(!!preop.allergiesKnown);
        setPreopAllergyDetails(preop.allergyDetails || "");
        setPreopAirway(!!preop.airwayRisk);
        setPreopBloodLoss(!!preop.bloodLossRisk);
        setPreopNotes(preop.notes || "");
      }

      const intra = parseIntraOpNotes(res.data.surgeonNotes);
      if (intra) {
        setIntraTimeOut(!!intra.timeOutCompleted);
        setIntraTeamIntro(!!intra.teamIntroduced);
        setIntraCriticalEvents(!!intra.criticalEventsDiscussed);
        setIntraAntibiotics(!!intra.antibioticProphylaxis);
        setIntraAntibioticDetails(intra.antibioticDetails || "");
        setIntraSterility(!!intra.sterilityVerified);
        setIntraCountsCorrect(!!intra.instrumentCountsCorrect);
        setIntraSpecimenLabeled(!!intra.specimenLabeled);
        setIntraNotes(intra.notes || "");
      }

      const pacu = parsePacuNotes(res.data.postOpDiagnosis);
      if (pacu) {
        setPacuActivity(Number(pacu.activity ?? 2));
        setPacuRespiration(Number(pacu.respiration ?? 2));
        setPacuCirculation(Number(pacu.circulation ?? 2));
        setPacuConsciousness(Number(pacu.consciousness ?? 2));
        setPacuOxygen(Number(pacu.oxygenSaturation ?? 2));
        setPacuExtubated(!!pacu.extubated);
        setPacuNotes(pacu.notes || "");
      }
    } catch {
      toast.error(t("surgery.details.loadFailed", "فشل تحميل البيانات"));
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async () => {
    try {
      const res = await apiClient.get("/users/staff-list");
      setUsers(res.data);
    } catch (e) {
      console.error("Failed to load users", e);
    }
    try {
      const res = await apiClient.get("/pharmacy/catalog");
      setProducts(res.data);
    } catch (e) {
      console.error("Failed to load products", e);
    }
  };

  useEffect(() => {
    loadCase();
    loadLists();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Actions
  const updateStatus = async (status: SurgeryStatus) => {
    if (!confirm(t("surgery.details.confirmStatusChange", "هل أنت متأكد من تغيير الحالة إلى {{status}}؟", { status }))) return;
    try {
      await apiClient.post(`/surgery/cases/${id}/status`, { status });
      toast.success(t("surgery.details.statusUpdated", "تم تحديث الحالة"));
      loadCase();
    } catch {
      toast.error(t("surgery.details.updateFailed", "فشل التحديث"));
    }
  };

  const addTeamMember = async () => {
    if (!selectedUser) return;
    try {
      await apiClient.post(`/surgery/cases/${id}/team`, {
        userId: selectedUser,
        role: selectedRole,
      });
      toast.success(t("surgery.details.memberAdded", "تم إضافة العضو"));
      loadCase();
    } catch {
      toast.error(t("surgery.details.addFailed", "فشل الإضافة"));
    }
  };

  const addConsumable = async () => {
    if (!selectedProduct || consumableQty <= 0) return;
    setAddingConsumable(true);
    try {
      await apiClient.post(`/surgery/cases/${id}/consumables`, {
        productId: selectedProduct,
        quantity: consumableQty,
      });
      toast.success(t("surgery.details.consumableAdded", "تم صرف المستهلك وإضافته للفاتورة"));
      loadCase();
      setConsumableQty(1);
     
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || t("surgery.details.consumableAddFailed", "فشل الصرف (تحقق من رصيد مخزن العمليات)")
      );
    } finally {
      setAddingConsumable(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await apiClient.post(`/surgery/cases/${id}/notes`, {
        surgeonNotes,
        anesthesiaNotes,
        preOpDiagnosis,
        postOpDiagnosis,
      });
      toast.success(t("surgery.details.reportSaved", "تم حفظ التقرير بنجاح"));
      loadCase();
    } catch {
      toast.error(t("surgery.details.reportSaveFailed", "فشل حفظ التقرير"));
    } finally {
      setSavingNotes(false);
    }
  };

  const savePreopChecklist = async () => {
    setSavingPreop(true);
    try {
      const checklist = {
        identityVerified: preopIdentity,
        siteMarked: preopSite,
        consentSigned: preopConsent,
        anesthesiaSafetyCheck: preopAnesthesia,
        pulseOximeterActive: preopPulseOx,
        allergiesKnown: preopAllergies,
        allergyDetails: preopAllergyDetails,
        airwayRisk: preopAirway,
        bloodLossRisk: preopBloodLoss,
        notes: preopNotes,
      };
      await apiClient.post(`/surgery/cases/${id}/preop-checklist`, checklist);
      toast.success(t("surgery.details.preopSaved", "تم حفظ قائمة التحقق قبل الجراحة"));
      loadCase();
    } catch {
      toast.error(t("surgery.details.preopSaveFailed", "فشل حفظ قائمة التحقق"));
    } finally {
      setSavingPreop(false);
    }
  };

  const saveIntraopLog = async () => {
    setSavingIntra(true);
    try {
      const log = {
        timeOutCompleted: intraTimeOut,
        teamIntroduced: intraTeamIntro,
        criticalEventsDiscussed: intraCriticalEvents,
        antibioticProphylaxis: intraAntibiotics,
        antibioticDetails: intraAntibioticDetails,
        sterilityVerified: intraSterility,
        instrumentCountsCorrect: intraCountsCorrect,
        specimenLabeled: intraSpecimenLabeled,
        notes: intraNotes,
      };
      await apiClient.post(`/surgery/cases/${id}/intraop-log`, log);
      toast.success(t("surgery.details.intraopSaved", "تم حفظ السجل أثناء العملية"));
      loadCase();
    } catch {
      toast.error(t("surgery.details.intraopSaveFailed", "فشل حفظ السجل"));
    } finally {
      setSavingIntra(false);
    }
  };

  const savePacuLog = async () => {
    setSavingPacu(true);
    try {
      const pacuLog = {
        activity: pacuActivity,
        respiration: pacuRespiration,
        circulation: pacuCirculation,
        consciousness: pacuConsciousness,
        oxygenSaturation: pacuOxygen,
        extubated: pacuExtubated,
        notes: pacuNotes,
        aldreteScore: pacuActivity + pacuRespiration + pacuCirculation + pacuConsciousness + pacuOxygen,
      };
      await apiClient.post(`/surgery/cases/${id}/postop-pacu`, pacuLog);
      toast.success(t("surgery.details.pacuSaved", "تم حفظ تقييم الإفاقة"));
      loadCase();
    } catch {
      toast.error(t("surgery.details.pacuSaveFailed", "فشل حفظ التقييم"));
    } finally {
      setSavingPacu(false);
    }
  };

  if (!surgery)
    return <div className="p-6 text-slate-400">{t("common.loading", "جارِ التحميل...")}</div>;

  const isCompleted =
    surgery.status === "COMPLETED" || surgery.status === "CANCELLED";

  const formatDate = (iso?: string) => {
    if (!iso) return "--";
    return new Date(iso).toLocaleString(i18n.language === "ar" ? "ar-LY" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6 overflow-auto"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button
            onClick={() => navigate("/surgery")}
            className="text-xs text-slate-400 hover:text-white mb-2"
          >
            {t("surgery.details.backToSchedule", "➜ العودة للجدول")}
          </button>
          <h1 className="text-2xl font-bold text-white">
            {surgery.surgeryName}
          </h1>
          <div className="text-sm text-slate-400 mt-1">
            {t("surgery.details.patientLabel", "المريض:")}{" "}
            <span className="text-slate-200 font-semibold">
              {surgery.encounter.patient.fullName}
            </span>{" "}
            | {t("surgery.details.theatreLabel", "غرفة العمليات:")}{" "}
            <span className="text-sky-400">{surgery.theatre.name}</span>
          </div>
          {/* Patient Location Card */}
          {(surgery.encounter.department || surgery.encounter.bedAssignments?.length) && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {surgery.encounter.department && (
                <span className="text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                  🏥 {surgery.encounter.department.name}
                </span>
              )}
              {surgery.encounter.bedAssignments?.[0]?.bed && (
                <span className="text-xs text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded border border-emerald-800/40">
                  {t("surgery.details.bedAssigned", "🛏️ {{wardName}} — غرفة {{roomNumber}} — سرير {{bedNumber}}", {
                    wardName: surgery.encounter.bedAssignments[0].bed.ward.name,
                    roomNumber: surgery.encounter.bedAssignments[0].bed.room.roomNumber,
                    bedNumber: surgery.encounter.bedAssignments[0].bed.bedNumber
                  })}
                </span>
              )}
              {!surgery.encounter.bedAssignments?.length && (
                <span className="text-xs text-rose-400 bg-rose-950/30 px-2 py-1 rounded border border-rose-800/40 animate-pulse">
                  {t("surgery.details.noBedAssigned", "⚠️ بدون سرير معيّن")}
                </span>
              )}
            </div>
          )}
          {/* Timestamps */}
          {surgery.actualStart && (
            <div className="text-xs text-slate-500 mt-2 space-y-1">
              <div>{t("surgery.details.actualStartLabel", "⏱️ بداية العملية:")} <span className="text-emerald-400 font-mono">{formatDate(surgery.actualStart)}</span></div>
              {surgery.actualEnd && (
                <div>{t("surgery.details.actualEndLabel", "⏱️ نهاية العملية:")} <span className="text-rose-400 font-mono">{formatDate(surgery.actualEnd)}</span></div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm font-mono text-slate-500 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
            {surgery.status === "SCHEDULED" && t("surgery.status.scheduled", "مجدولة")}
            {surgery.status === "IN_PROGRESS" && t("surgery.status.inProgress", "جارية الآن")}
            {surgery.status === "COMPLETED" && t("surgery.status.completedChecked", "مكتملة ✅")}
            {surgery.status === "CANCELLED" && t("surgery.status.cancelled", "ملغاة")}
            {surgery.status === "RECOVERY" && t("surgery.status.recovery", "في الإفاقة")}
          </span>

          {surgery.status === "SCHEDULED" && (
            <button
              onClick={() => updateStatus("IN_PROGRESS")}
              className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20"
            >
              {t("surgery.details.startBtn", "بدء العملية ▶")}
            </button>
          )}
          {surgery.status === "IN_PROGRESS" && (
            <button
              onClick={() => updateStatus("COMPLETED")}
              className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg shadow-rose-500/20 animate-pulse"
            >
              {t("surgery.details.endBtn", "إنهاء العملية ■")}
            </button>
          )}
        </div>
      </div>

      {/* Post-Op Hint */}
      {isCompleted && surgery.status === "COMPLETED" && (
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div className="flex-1">
            <p className="text-emerald-300 font-bold text-sm">{t("surgery.details.successMessageTitle", "تم إنهاء العملية بنجاح")}</p>
            <p className="text-emerald-400/80 text-xs mt-1">
              {t("surgery.details.successMessageDesc", "يُرجى كتابة التقرير الجراحي أدناه ثم نقل المريض إلى غرفة الإفاقة أو قسم الإيواء المناسب.")}
            </p>
          </div>
          <button
            onClick={() => navigate("/active-inpatients")}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm"
          >
            {t("surgery.details.manageInpatientBtn", "إدارة الإيواء")}
          </button>
        </div>
      )}

      {/* 💰 ملخص مالي */}
      {surgery.serviceItem && (
        <div className="bg-gradient-to-l from-slate-900 to-sky-950/20 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-sky-400 mb-3 flex items-center gap-2">
            {t("surgery.details.financialSummaryTitle", "💰 الملخص المالي للعملية")}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* رسوم العملية */}
            <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800">
              <div className="text-[10px] text-slate-500 mb-1">{t("surgery.details.surgeryFeeLabel", "رسوم العملية")}</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {Number(surgery.serviceItem.defaultPrice).toLocaleString()} {t("common.lyd", "د.ل")}
              </div>
              <div className="text-[10px] text-slate-600">
                {surgery.serviceItem.code} — {surgery.serviceItem.name}
              </div>
            </div>
            {/* إجمالي المستهلكات */}
            <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800">
              <div className="text-[10px] text-slate-500 mb-1">{t("surgery.details.consumablesLabel", "المستهلكات")}</div>
              <div className="text-lg font-bold text-amber-400 font-mono">
                {surgery.consumables
                  .reduce((sum, c) => sum + Number(c.totalPrice), 0)
                  .toLocaleString()} {t("common.lyd", "د.ل")}
              </div>
              <div className="text-[10px] text-slate-600">{t("surgery.details.itemCount", "{{count}} صنف", { count: surgery.consumables.length })}</div>
            </div>
            {/* الإجمالي */}
            <div className="bg-slate-950/50 rounded-xl p-3 border border-sky-900/30">
              <div className="text-[10px] text-slate-500 mb-1">{t("surgery.details.totalLabel", "الإجمالي")}</div>
              <div className="text-lg font-bold text-white font-mono">
                {(
                  Number(surgery.serviceItem.defaultPrice) +
                  surgery.consumables.reduce((sum, c) => sum + Number(c.totalPrice), 0)
                ).toLocaleString()} {t("common.lyd", "د.ل")}
              </div>
            </div>
            {/* عمولة الجراح */}
            {surgery.team.some((t) => t.commissionAmount && Number(t.commissionAmount) > 0) && (
              <div className="bg-slate-950/50 rounded-xl p-3 border border-violet-900/30">
                <div className="text-[10px] text-slate-500 mb-1">{t("surgery.details.surgeonCommissionLabel", "عمولة الجراح")}</div>
                <div className="text-lg font-bold text-violet-400 font-mono">
                  {surgery.team
                    .filter((t) => t.commissionAmount)
                    .reduce((sum, t) => sum + Number(t.commissionAmount), 0)
                    .toLocaleString()} {t("common.lyd", "د.ل")}
                </div>
              </div>
            )}
          </div>
          {isCompleted && (
            <div className="mt-2 text-[10px] text-emerald-500 flex items-center gap-1">
              {t("surgery.details.autoBilledMsg", "✅ تم تسجيل الرسوم في فاتورة المريض تلقائياً")}
            </div>
          )}
          {!isCompleted && (
            <div className="mt-2 text-[10px] text-amber-500 flex items-center gap-1">
              {t("surgery.details.pendingBillMsg", "⏳ سيتم تسجيل رسوم العملية عند اكتمالها")}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Section */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            {t("surgery.details.medicalStaffTitle", "👨‍⚕️ الطاقم الطبي")}
          </h2>

          <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1">
            {/* Surgical Team */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider bg-sky-950/30 p-2 rounded border border-sky-900/50">
                {t("surgery.details.surgeryTeamHeader", "فريق الجراحة - Surgical Team")}
              </h3>
              {surgery.team
                .filter((t) =>
                  ["SURGEON", "ASSISTANT_SURGEON"].includes(t.role)
                )
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800"
                  >
                    <span className="font-semibold text-slate-200">
                      {t.user.fullName}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      {getRoleLabel(t.role)}
                    </span>
                  </div>
                ))}
              {surgery.team.filter((t) =>
                ["SURGEON", "ASSISTANT_SURGEON"].includes(t.role)
              ).length === 0 && (
                <div className="text-xs text-slate-600 italic px-2">
                  {t("common.none", "-- لا يوجد --")}
                </div>
              )}
            </div>

            {/* Anesthesia Team */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider bg-amber-950/30 p-2 rounded border border-amber-900/50">
                {t("surgery.details.anesthesiaTeamHeader", "فريق التخدير - Anesthesia Team")}
              </h3>
              {surgery.team
                .filter((t) => ["ANESTHETIST", "TECHNICIAN"].includes(t.role))
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800"
                  >
                    <span className="font-semibold text-slate-200">
                      {t.user.fullName}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      {getRoleLabel(t.role)}
                    </span>
                  </div>
                ))}
            </div>

            {/* Nursing Team */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider bg-emerald-950/30 p-2 rounded border border-emerald-900/50">
                {t("surgery.details.nursingTeamHeader", "فريق التمريض - Nursing Team")}
              </h3>
              {surgery.team
                .filter((t) =>
                  ["SCRUB_NURSE", "CIRCULATING_NURSE"].includes(t.role)
                )
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800"
                  >
                    <span className="font-semibold text-slate-200">
                      {t.user.fullName}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      {getRoleLabel(t.role)}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Add Team Member — with clear label */}
          {!isCompleted && (
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <h3 className="text-xs font-bold text-slate-400 mb-2">{t("surgery.details.addTeamMemberTitle", "➕ إضافة عضو للطاقم الطبي")}</h3>
              <div className="flex flex-col gap-2">
                <select
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  <option value="">{t("surgery.details.selectStaffPlaceholder", "اختر الطبيب / الممرض...")}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {getRoleLabel(r)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addTeamMember}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm"
                  >
                    {t("common.add", "إضافة")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Consumables Section */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            {t("surgery.details.consumablesTitle", "💉 المستهلكات والأدوية")}
          </h2>

          <div className="flex-1 overflow-y-auto mb-4">
            <table className="w-full text-sm text-right">
              <thead className="text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="pb-2">{t("surgery.details.productHeader", "الصنف")}</th>
                  <th className="pb-2">{t("surgery.details.qtyHeader", "الكمية")}</th>
                  <th className="pb-2">{t("surgery.details.totalHeader", "الإجمالي")}</th>
                </tr>
              </thead>
              <tbody>
                {surgery.consumables.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/50">
                    <td className="py-2 text-slate-200">{c.product.name}</td>
                    <td className="py-2 font-mono text-sky-400">
                      {Number(c.quantity).toFixed(2)}
                    </td>
                    <td className="py-2 font-mono text-emerald-400">
                      {Number(c.totalPrice).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isCompleted && (
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
              <div className="flex flex-col gap-2">
                <select
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                >
                  <option value="">{t("surgery.details.selectProductPlaceholder", "اختر المستهلك / الدواء...")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-center"
                    value={consumableQty}
                    onChange={(e) => setConsumableQty(Number(e.target.value))}
                  />
                  <button
                    onClick={addConsumable}
                    disabled={addingConsumable}
                    className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    {addingConsumable ? t("surgery.details.dispensingBtn", "جارِ الصرف...") : t("surgery.details.dispenseBtn", "صرف واستهلاك")}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {t("surgery.details.dispenseNote", "* سيتم خصم الكمية من مخزون العمليات وإضافتها لفاتورة المريض فوراً.")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────── */}
      {/* Surgical Workflows & Clinical Records Section     */}
      {/* ──────────────────────────────────────────────── */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-5">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 gap-4 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab("operative")}
            className={`pb-3 text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === "operative"
                ? "border-b-2 border-sky-500 text-sky-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t("surgery.details.tabOperativeReport", "📋 التقرير الجراحي (Operative Report)")}
          </button>
          <button
            onClick={() => setActiveTab("preop")}
            className={`pb-3 text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === "preop"
                ? "border-b-2 border-sky-500 text-sky-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t("surgery.details.tabPreopChecklist", "🛡️ التحقق قبل العملية (Pre-op Checklist)")}
          </button>
          <button
            onClick={() => setActiveTab("intraop")}
            className={`pb-3 text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === "intraop"
                ? "border-b-2 border-sky-500 text-sky-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t("surgery.details.tabIntraopLog", "⏱️ سجل الجراحة (Intra-op Log)")}
          </button>
          <button
            onClick={() => setActiveTab("pacu")}
            className={`pb-3 text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === "pacu"
                ? "border-b-2 border-sky-500 text-sky-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t("surgery.details.tabPacuRecovery", "🛌 تقييم الإفاقة (Aldrete Score / PACU)")}
          </button>
        </div>

        {/* Tab 1: Operative Report */}
        {activeTab === "operative" && (
          <div className="space-y-5 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pre-Op Diagnosis */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">{t("surgery.details.preOpDiagnosisLabel", "التشخيص قبل العملية (Pre-Op Diagnosis)")}</label>
                <textarea
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm min-h-[80px] resize-y"
                  placeholder={t("surgery.details.preOpDiagnosisPh", "مثال: التهاب الزائدة الدودية الحاد...")}
                  value={preOpDiagnosis}
                  onChange={(e) => setPreOpDiagnosis(e.target.value)}
                  readOnly={isCompleted && !!surgery.preOpDiagnosis}
                />
              </div>
              {/* Post-Op Diagnosis */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">{t("surgery.details.postOpDiagnosisLabel", "التشخيص بعد العملية (Post-Op Diagnosis)")}</label>
                <textarea
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm min-h-[80px] resize-y"
                  placeholder={t("surgery.details.postOpDiagnosisPh", "مثال: استئصال الزائدة الدودية — بدون مضاعفات...")}
                  value={postOpDiagnosis}
                  onChange={(e) => setPostOpDiagnosis(e.target.value)}
                />
              </div>
            </div>

            {/* Surgeon Notes */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t("surgery.details.surgeonNotesLabel", "ملاحظات الجراح (Surgeon Notes)")}</label>
              <textarea
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm min-h-[120px] resize-y"
                placeholder={t("surgery.details.surgeonNotesPh", "وصف تفصيلي لمجريات العملية، الإجراءات المتخذة، والملاحظات...")}
                value={surgeonNotes}
                onChange={(e) => setSurgeonNotes(e.target.value)}
              />
            </div>

            {/* Anesthesia Notes */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t("surgery.details.anesthesiaNotesLabel", "ملاحظات التخدير (Anesthesia Notes)")}</label>
              <textarea
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm min-h-[80px] resize-y"
                placeholder={t("surgery.details.anesthesiaNotesPh", "نوع التخدير، الجرعة، ملاحظات خاصة...")}
                value={anesthesiaNotes}
                onChange={(e) => setAnesthesiaNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 transition-colors"
              >
                {savingNotes ? t("surgery.details.savingReportBtn", "جارِ الحفظ...") : t("surgery.details.saveReportBtn", "💾 حفظ التقرير")}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Pre-Op Checklist */}
        {activeTab === "preop" && (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-sm font-bold text-sky-400">🛡️ {t("surgery.details.preopChecklistTitle", "قائمة التحقق قبل الجراحة - WHO Surgical Safety Checklist (Sign In)")}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={preopIdentity}
                    onChange={(e) => setPreopIdentity(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.identityVerified", "تأكيد هوية المريض وموقع الجراحة ونموذج الموافقة")}</span>
                </label>

                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={preopSite}
                    onChange={(e) => setPreopSite(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.siteMarked", "تم تحديد موقع الشق الجراحي بوضوح (Surgical Site Marked)")}</span>
                </label>

                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={preopConsent}
                    onChange={(e) => setPreopConsent(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.consentSigned", "توقيع الموافقة المستنيرة للعملية والتخدير")}</span>
                </label>

                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={preopAnesthesia}
                    onChange={(e) => setPreopAnesthesia(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.anesthesiaSafetyCheck", "اكتمال فحص أمان أجهزة وأدوية التخدير")}</span>
                </label>
              </div>

              <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={preopPulseOx}
                    onChange={(e) => setPreopPulseOx(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.pulseOximeterActive", "جهاز قياس الأكسجين (Pulse Oximeter) موصول ويعمل")}</span>
                </label>

                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={preopAirway}
                    onChange={(e) => setPreopAirway(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.airwayRisk", "تقييم مخاطر صعوبة مجرى الهواء أو الاستنشاق (Airway/Aspiration Risk)")}</span>
                </label>

                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={preopBloodLoss}
                    onChange={(e) => setPreopBloodLoss(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.bloodLossRisk", "خطر فقدان كمية كبيرة من الدم (>500 مل للبالغين) متوقع وجاهز")}</span>
                </label>

                <div className="pt-1">
                  <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={preopAllergies}
                      onChange={(e) => setPreopAllergies(e.target.checked)}
                      className="w-4 h-4 accent-sky-500 rounded"
                    />
                    <span className="text-sm text-slate-200 font-bold text-rose-400">{t("surgery.details.checklist.allergiesKnown", "هل لدى المريض حساسية معروفة؟")}</span>
                  </label>
                  {preopAllergies && (
                    <input
                      type="text"
                      value={preopAllergyDetails}
                      onChange={(e) => setPreopAllergyDetails(e.target.value)}
                      placeholder={t("surgery.details.checklist.allergyDetailsPh", "اكتب مسببات وتفاصيل الحساسية...")}
                      className="w-full mt-2 bg-slate-950 border border-rose-950 text-rose-200 placeholder-rose-900 rounded-lg px-3 py-2 text-xs"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Checklist general notes */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t("surgery.details.preopNotesLabel", "ملاحظات إضافية قبل الجراحة (Pre-Op Notes)")}</label>
              <textarea
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm min-h-[60px] resize-y"
                placeholder={t("surgery.details.preopNotesPh", "ملاحظات سريرية، تجهيزات خاصة...")}
                value={preopNotes}
                onChange={(e) => setPreopNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={savePreopChecklist}
                disabled={savingPreop}
                className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 transition-colors"
              >
                {savingPreop ? t("common.saving", "جارِ الحفظ...") : t("surgery.details.savePreopBtn", "💾 حفظ قائمة ما قبل الجراحة")}
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Intra-Op Log */}
        {activeTab === "intraop" && (
          <div className="space-y-5 animate-fadeIn">
            <h3 className="text-sm font-bold text-amber-400">⏱️ {t("surgery.details.intraopTitle", "سجل الجراحة أثناء العملية - WHO Surgical Safety Checklist (Time Out)")}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={intraTimeOut}
                    onChange={(e) => setIntraTimeOut(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.timeOutCompleted", "إجراء الوقفة الزمنية (Time Out) والتأكد من بيانات المريض الشفوية")}</span>
                </label>

                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={intraTeamIntro}
                    onChange={(e) => setIntraTeamIntro(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.teamIntroduced", "تأكيد تعريف جميع أعضاء الفريق بالاسم والصفة لوظائفهم")}</span>
                </label>

                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={intraCriticalEvents}
                    onChange={(e) => setIntraCriticalEvents(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.criticalEvents", "مناقشة الجراح والتخدير للأحداث والمخاطر الحرجة المتوقعة")}</span>
                </label>
              </div>

              <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={intraSterility}
                    onChange={(e) => setIntraSterility(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.sterilityVerified", "تم التحقق من تعقيم كافة الأدوات والمعدات ومؤشرات العقم")}</span>
                </label>

                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={intraCountsCorrect}
                    onChange={(e) => setIntraCountsCorrect(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.instrumentCountsCorrect", "تطابق عد الإبر والشاش والأدوات الجراحية قبل الإغلاق")}</span>
                </label>

                <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={intraSpecimenLabeled}
                    onChange={(e) => setIntraSpecimenLabeled(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                  <span className="text-sm text-slate-200">{t("surgery.details.checklist.specimenLabeled", "تعريف وتثبيت لصاقة العينات الجراحية بالاسم ورمز المريض بدقة")}</span>
                </label>

                <div className="pt-1">
                  <label className="flex items-center gap-3 p-2 hover:bg-slate-900/50 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={intraAntibiotics}
                      onChange={(e) => setIntraAntibiotics(e.target.checked)}
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span className="text-sm text-slate-200 font-bold text-amber-400">{t("surgery.details.checklist.antibiotics", "المضادات الحيوية الوقائية (Prophylaxis)")}</span>
                  </label>
                  {intraAntibiotics && (
                    <input
                      type="text"
                      value={intraAntibioticDetails}
                      onChange={(e) => setIntraAntibioticDetails(e.target.value)}
                      placeholder={t("surgery.details.checklist.antibioticsPh", "اسم المضاد، الجرعة، وتوقيت الإعطاء...")}
                      className="w-full mt-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* General notes during surgery */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t("surgery.details.intraNotesLabel", "سجل الأحداث الجراحية والتخديرية (Intra-Op Notes)")}</label>
              <textarea
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm min-h-[60px] resize-y"
                placeholder={t("surgery.details.intraNotesPh", "ملاحظات حول مجرى العملية، السوائل، والنزيف...")}
                value={intraNotes}
                onChange={(e) => setIntraNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={saveIntraopLog}
                disabled={savingIntra}
                className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 transition-colors"
              >
                {savingIntra ? t("common.saving", "جارِ الحفظ...") : t("surgery.details.saveIntraopBtn", "💾 حفظ سجل العملية")}
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: PACU Recovery / Aldrete Score */}
        {activeTab === "pacu" && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <h3 className="text-sm font-bold text-emerald-400">🛌 {t("surgery.details.pacuTitle", "تقييم الإنعاش واستعادة الوعي بعد التخدير (PACU Aldrete Score)")}</h3>
                <p className="text-xs text-slate-500 mt-1">{t("surgery.details.pacuDesc", "يساعد مقياس الدريد (Aldrete) في تحديد سلامة نقل المريض من وحدة الإفاقة إلى الجناح الطبي.")}</p>
              </div>
              
              {/* Dynamic Score Indicator */}
              <div className={`px-5 py-3 rounded-2xl border flex flex-col items-center justify-center font-bold text-center transition-all shadow-lg ${
                (pacuActivity + pacuRespiration + pacuCirculation + pacuConsciousness + pacuOxygen) >= 8
                  ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-emerald-500/10 animate-pulse"
                  : "bg-amber-950/60 border-amber-500/50 text-amber-300 shadow-amber-500/10"
              }`}>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest">{t("surgery.details.aldreteScoreTitle", "مجموع نقاط الدريد")}</div>
                <div className="text-3xl font-mono mt-1">{(pacuActivity + pacuRespiration + pacuCirculation + pacuConsciousness + pacuOxygen)} / 10</div>
                <div className="text-[10px] mt-1">
                  {(pacuActivity + pacuRespiration + pacuCirculation + pacuConsciousness + pacuOxygen) >= 8 
                    ? t("surgery.details.aldreteReady", "🟢 جاهز للنقل للجناح (Ready)")
                    : t("surgery.details.aldreteStay", "🔴 غير جاهز - استمر في الملاحظة")}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 bg-slate-950/30 p-5 rounded-2xl border border-slate-800/80">
              {/* 1. Activity */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                <div className="md:w-1/3">
                  <span className="text-sm font-bold text-slate-200 block">1. {t("surgery.details.aldrete.activityName", "النشاط الحركي (Activity)")}</span>
                  <span className="text-xs text-slate-500">{t("surgery.details.aldrete.activityDesc", "القدرة على تحريك الأطراف الأربعة")}</span>
                </div>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  {[2, 1, 0].map((score) => (
                    <button
                      key={score}
                      onClick={() => setPacuActivity(score)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold text-center border transition-all ${
                        pacuActivity === score
                          ? "bg-sky-600 border-sky-500 text-white shadow-md shadow-sky-500/10"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-mono text-sm">{score}</div>
                      <div className="mt-1 text-[10px] truncate">
                        {score === 2 && t("surgery.details.aldrete.activity2", "يتحرك 4 أطراف")}
                        {score === 1 && t("surgery.details.aldrete.activity1", "يتحرك طرفين")}
                        {score === 0 && t("surgery.details.aldrete.activity0", "لا يتحرك")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Respiration */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                <div className="md:w-1/3">
                  <span className="text-sm font-bold text-slate-200 block">2. {t("surgery.details.aldrete.respName", "التنفس (Respiration)")}</span>
                  <span className="text-xs text-slate-500">{t("surgery.details.aldrete.respDesc", "القدرة على التنفس بعمق وحرية")}</span>
                </div>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  {[2, 1, 0].map((score) => (
                    <button
                      key={score}
                      onClick={() => setPacuRespiration(score)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold text-center border transition-all ${
                        pacuRespiration === score
                          ? "bg-sky-600 border-sky-500 text-white shadow-md shadow-sky-500/10"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-mono text-sm">{score}</div>
                      <div className="mt-1 text-[10px] truncate">
                        {score === 2 && t("surgery.details.aldrete.resp2", "نفس عميق وسعال")}
                        {score === 1 && t("surgery.details.aldrete.resp1", "نفس سطحي وضيق")}
                        {score === 0 && t("surgery.details.aldrete.resp0", "انقطاع التنفس")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Circulation */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                <div className="md:w-1/3">
                  <span className="text-sm font-bold text-slate-200 block">3. {t("surgery.details.aldrete.circName", "الدورة الدموية (Circulation)")}</span>
                  <span className="text-xs text-slate-500">{t("surgery.details.aldrete.circDesc", "ضغط الدم مقارنة بالمستوى الأساسي")}</span>
                </div>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  {[2, 1, 0].map((score) => (
                    <button
                      key={score}
                      onClick={() => setPacuCirculation(score)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold text-center border transition-all ${
                        pacuCirculation === score
                          ? "bg-sky-600 border-sky-500 text-white shadow-md shadow-sky-500/10"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-mono text-sm">{score}</div>
                      <div className="mt-1 text-[10px] truncate">
                        {score === 2 && t("surgery.details.aldrete.circ2", "تغير ±20% فقط")}
                        {score === 1 && t("surgery.details.aldrete.circ1", "تغير ±20-50%")}
                        {score === 0 && t("surgery.details.aldrete.circ0", "تغير >50%")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Consciousness */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                <div className="md:w-1/3">
                  <span className="text-sm font-bold text-slate-200 block">4. {t("surgery.details.aldrete.consName", "مستوى الوعي (Consciousness)")}</span>
                  <span className="text-xs text-slate-500">{t("surgery.details.aldrete.consDesc", "مدى استجابة ووعي المريض")}</span>
                </div>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  {[2, 1, 0].map((score) => (
                    <button
                      key={score}
                      onClick={() => setPacuConsciousness(score)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold text-center border transition-all ${
                        pacuConsciousness === score
                          ? "bg-sky-600 border-sky-500 text-white shadow-md shadow-sky-500/10"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-mono text-sm">{score}</div>
                      <div className="mt-1 text-[10px] truncate">
                        {score === 2 && t("surgery.details.aldrete.cons2", "مستيقظ بالكامل")}
                        {score === 1 && t("surgery.details.aldrete.cons1", "يستجيب عند النداء")}
                        {score === 0 && t("surgery.details.aldrete.cons0", "غير مستجيب")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Oxygen Saturation */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                <div className="md:w-1/3">
                  <span className="text-sm font-bold text-slate-200 block">5. {t("surgery.details.aldrete.o2Name", "تشبع الأكسجين (O2 Saturation)")}</span>
                  <span className="text-xs text-slate-500">{t("surgery.details.aldrete.o2Desc", "نسبة تركيز الأكسجين بالدم")}</span>
                </div>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  {[2, 1, 0].map((score) => (
                    <button
                      key={score}
                      onClick={() => setPacuOxygen(score)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold text-center border transition-all ${
                        pacuOxygen === score
                          ? "bg-sky-600 border-sky-500 text-white shadow-md shadow-sky-500/10"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-mono text-sm">{score}</div>
                      <div className="mt-1 text-[10px] truncate">
                        {score === 2 && t("surgery.details.aldrete.o2_2", "SpO2 >92% هواء")}
                        {score === 1 && t("surgery.details.aldrete.o2_1", "يحتاج أكسجين SpO2>90%")}
                        {score === 0 && t("surgery.details.aldrete.o2_0", "SpO2 <90%")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Extubation & Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-200 block">{t("surgery.details.pacu.extubatedLabel", "تم إزالة أنبوب التنفس الصناعي (Extubated)")}</span>
                  <span className="text-xs text-slate-500">{t("surgery.details.pacu.extubatedDesc", "إذا كان المريض تحت التخدير العام بمجرى تنفس اصطناعي")}</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pacuExtubated}
                    onChange={(e) => setPacuExtubated(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white"></div>
                </label>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">{t("surgery.details.pacuNotesLabel", "ملاحظات سريرية لوحدة الإفاقة (PACU Notes)")}</label>
                <textarea
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm min-h-[60px] resize-y"
                  placeholder={t("surgery.details.pacuNotesPh", "ملاحظات إضافية، مستوى الألم، الغثيان، إلخ...")}
                  value={pacuNotes}
                  onChange={(e) => setPacuNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={savePacuLog}
                disabled={savingPacu}
                className="px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 transition-colors"
              >
                {savingPacu ? t("common.saving", "جارِ الحفظ...") : t("surgery.details.savePacuBtn", "💾 حفظ تقييم الإفاقة والدريد")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
