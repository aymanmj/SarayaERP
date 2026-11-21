import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/authStore";
import { LegacyBedTransfers, type LegacyBedTransfer } from '../components/LegacyBedTransfers';
import { ROOM_DAY_OPTIONS } from '../utils/roomBillingPolicy';
import { VitalsPane } from '../components/encounter/VitalsPane';
import { MedicationAdministrationPane } from '../components/nursing/MedicationAdministrationPane';

type DischargeReadiness = {
  ready: boolean;
  hasDischargePlan: boolean;
  hasDischargeSummary: boolean;
  financialClearance: boolean;
  patientDebt: string;
  uninvoicedChargesCount: number;
  pendingRoomDays: number;
  roomBillingReviewReason?: string | null;
  pendingTransfersCount: number;
  roomBillingPolicy: string;
  roomBillingTimeZone: string;
};

type AdmissionDetails = {
  id: number;
  encounterId?: number | null;
  patient: {
    id: number;
    fullName: string;
    mrn: string;
    dateOfBirth: string;
    gender: string;
    contactNumber: string;
    email?: string;
    address: string;
    emergencyContact: {
      name: string;
      relationship: string;
      phone: string;
    };
  };
  bed?: {
    id: number;
    bedNumber: string;
    room?: {
      id: number;
      roomNumber: string;
      ward?: {
        id: number;
        name: string;
        type: string;
      };
    };
  };
  ward?: {
    id: number;
    name: string;
    type: string;
  };
  department?: {
    id: number;
    name: string;
  };
  admittingDoctor: {
    id: number;
    fullName: string;
    specialization: string;
    contactNumber: string;
  };
  primaryPhysician: {
    id: number;
    fullName: string;
    specialization: string;
  };
  admissionType: string;
  admissionStatus: string;
  priority: string;
  actualAdmissionDate: string;
  expectedDischargeDate?: string;
  dischargeDate?: string;
  lengthOfStay?: number;
  isolationRequired: boolean;
  isEmergency: boolean;
  isReadmission: boolean;
  admissionReason: string;
  primaryDiagnosis?: string;
  secondaryDiagnoses?: string[];
  procedures?: Array<{
    id: number;
    name: string;
    date: string;
    status: string;
  }>;
  medications?: Array<{
    id: number;
    name: string;
    dosage: string;
    frequency: string;
    startDate: string;
    endDate?: string;
  }>;
  vitalSigns?: Array<{
    id: number;
    timestamp: string;
    bloodPressure: string;
    heartRate: number;
    temperature: number;
    oxygenSaturation: number;
    respiratoryRate: number;
  }>;
  notes?: Array<{
    id: number;
    timestamp: string;
    author: string;
    type: string;
    content: string;
  }>;
  estimatedCost?: number;
  actualCost?: number;
  insuranceInfo?: {
    provider: string;
    policyNumber: string;
    coverageType: string;
    authorizationNumber?: string;
  };
  dischargePlanning?: {
    plannedDischargeDate?: string;
    dischargeDisposition?: string;
    followUpRequired: boolean;
    followUpInstructions?: string;
    homeHealthServices?: boolean;
    equipmentNeeded?: string[];
  };
  bedTransfers?: LegacyBedTransfer[];
};

export default function AdmissionDetailsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [admission, setAdmission] = useState<AdmissionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<DischargeReadiness | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [discharging, setDischarging] = useState(false);
  const canDischarge = useAuthStore((state) => state.user?.permissions.includes("admission:manage") ?? false);
  const user = useAuthStore((state) => state.user);
  const fullAccess = !!user?.roles.includes('ADMIN') || !!user?.permissions.includes('ADMIN_FULL_ACCESS');
  const canApproveTransfer = fullAccess || !!user?.permissions.includes('inpatient:transfers:approve');
  const canCancelTransfer = canApproveTransfer || !!user?.permissions.includes('admission:manage');
  const [activeTab, setActiveTab] = useState<'overview' | 'vitals' | 'medications' | 'procedures' | 'notes' | 'transfers'>('overview');

  useEffect(() => {
    if (id) {
      loadAdmissionDetails(parseInt(id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadAdmissionDetails = async (admissionId: number) => {
    try {
      const response = await apiClient.get(`/admissions/${admissionId}`);
      setAdmission(response.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("admissions.detailsPage.loadFailed", "فشل تحميل تفاصيل الإيواء"));
      navigate('/admissions/advanced');
    } finally {
      setLoading(false);
    }
  };

  const checkReadiness = async () => {
    if (!admission) return;
    setCheckingReadiness(true);
    try {
      const response = await apiClient.get<DischargeReadiness>(`/admissions/${admission.id}/discharge-readiness`);
      setReadiness(response.data);
    } catch {
      setReadiness(null);
      toast.error(t("admissions.readinessFailed", "تعذر التحقق من جاهزية الخروج. حاول مجددًا."));
    } finally {
      setCheckingReadiness(false);
    }
  };

  const handleDischargePatient = async () => {
    if (!admission || !confirm(t("admissions.detailsPage.confirmDischarge", "هل أنت متأكد من تسريح المريض؟"))) return;

    setDischarging(true);
    try {
      await apiClient.post(`/admissions/${admission.id}/discharge`, {
        dischargeDisposition: "HOME",
        followUpRequired: false,
        notes: t("admissions.detailsPage.dischargeReason", "تسريح من صفحة التفاصيل"),
      });

      toast.success(t("admissions.detailsPage.dischargeSuccess", "تم تسريح المريض بنجاح"));
      setReadiness(null);
      loadAdmissionDetails(admission.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("admissions.detailsPage.dischargeFailed", "فشل تسريح المريض"));
    } finally {
      setDischarging(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ADMITTED":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
      case "IN_PROGRESS":
        return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
      case "DISCHARGE_PENDING":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
      case "DISCHARGED":
        return "bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-400";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "CRITICAL":
        return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
      case "URGENT":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
      case "HIGH":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
      case "MEDIUM":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
      case "LOW":
        return "bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-400";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTabLabel = (tabId: string) => {
    switch (tabId) {
      case 'overview': return t("admissions.detailsPage.tabs.overview", 'نظرة عامة');
      case 'vitals': return t("admissions.detailsPage.tabs.vitals", 'العلامات الحيوية');
      case 'medications': return t("admissions.detailsPage.tabs.medications", 'الأدوية');
      case 'procedures': return t("admissions.detailsPage.tabs.procedures", 'الإجراءات');
      case 'notes': return t("admissions.detailsPage.tabs.notes", 'الملاحظات');
      case 'transfers': return t("admissions.detailsPage.tabs.transfers", 'نقلات السرير');
      default: return tabId;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
        </div>
      </div>
    );
  }

  if (!admission) {
    return (
      <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">{t("admissions.detailsPage.notFound", "لم يتم العثور على بيانات الإيواء")}</h2>
          <button
            onClick={() => navigate('/admissions/advanced')}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg"
          >
            {t("admissions.detailsPage.backToList", "العودة إلى قائمة الإيواءات")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admissions/advanced')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all"
          >
            {t("admissions.detailsPage.backBtn", "← العودة")}
          </button>
          <div>
            <h1 className="text-2xl font-bold mb-1">{t("admissions.detailsPage.title", "تفاصيل الإيواء #")}{admission.id}</h1>
            <p className="text-sm text-slate-400">
              {admission.patient.fullName} - {admission.patient.mrn}
            </p>
          </div>
        </div>
        {admission.admissionStatus !== 'DISCHARGED' && (
          <div className="flex items-center gap-3">
          <button onClick={checkReadiness} disabled={checkingReadiness || discharging}
            className="px-4 py-2 rounded-lg bg-slate-700 disabled:opacity-50">
            {t("admissions.checkReadiness", "فحص جاهزية الخروج")}
          </button>
          {canDischarge && (
          <button
            onClick={handleDischargePatient}
            disabled={discharging || checkingReadiness}
            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-all"
          >
            {t("admissions.detailsPage.dischargePatient", "تسريح المريض")}
          </button>
          )}
          </div>
        )}
      </div>

      {readiness && (
        <div role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-2 text-sm">
          <p className="font-bold">{readiness.ready ? t("admissions.ready", "متطلبات الخروج مكتملة وفق آخر فحص") : t("admissions.notReady", "توجد متطلبات لم تكتمل قبل الخروج")}</p>
          <p>{t("admissions.dischargePlan", "خطة الخروج")}: {readiness.hasDischargePlan ? t("common.complete", "مكتمل") : t("common.incomplete", "غير مكتمل")}</p>
          <p>{t("admissions.dischargeSummary", "ملخص الخروج المعتمد")}: {readiness.hasDischargeSummary ? t("common.complete", "مكتمل") : t("common.incomplete", "غير مكتمل")}</p>
          <p>{t("admissions.patientDebt", "الرصيد المستحق على المريض")}: {readiness.patientDebt} LYD</p>
          <p>{t('admissions.savedRoomPolicy', 'طريقة احتساب الإقامة المثبتة عند الدخول')}: {(() => { const option = ROOM_DAY_OPTIONS.find((item) => item.value === readiness.roomBillingPolicy); return option ? t(option.labelKey, option.label) : readiness.roomBillingPolicy; })()} ({readiness.roomBillingTimeZone})</p>
          <p>{t("admissions.uninvoiced", "الخدمات غير المفوترة")}: {readiness.uninvoicedChargesCount} — {t("admissions.pendingRoomDays", "أيام الإقامة التي تحتاج فوترة")}: {readiness.pendingRoomDays}</p>
          <p>{t("admissions.pendingTransfers", "طلبات النقل النشطة")}: {readiness.pendingTransfersCount}</p>
          {readiness.roomBillingReviewReason && <p role="alert" className="text-amber-300">{t('admissions.roomBillingReview', 'تحتاج رسوم الإقامة مراجعة')}: {readiness.roomBillingReviewReason}</p>}
          {!readiness.financialClearance && <p>{t("admissions.settleBeforeDischarge", "راجع الحسابات لإصدار فاتورة الخدمات والإقامة وتسوية الرصيد ثم أعد الفحص.")}</p>}
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">{t("admissions.table.status", "الحالة")}</div>
          <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(admission.admissionStatus)}`}>
            {t("admissions.admissionStatus." + admission.admissionStatus, admission.admissionStatus)}
          </span>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">{t("admissions.table.priority", "الأولوية")}</div>
          <span className={`px-3 py-1 rounded-full text-sm ${getPriorityColor(admission.priority)}`}>
            {t("admissions.priorityLabels." + admission.priority, admission.priority)}
          </span>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">{t("admissions.detailsPage.stayDuration", "مدة الإقامة")}</div>
          <div className="text-lg font-bold">
            {admission.lengthOfStay ? `${admission.lengthOfStay} ${t("admissions.stats.days", "يوم")}` : '-'}
          </div>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">{t("admissions.detailsPage.bed", "السرير")}</div>
          <div className="text-lg font-bold">
            {admission.bed?.bedNumber || '-'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 space-x-reverse border-b border-slate-700">
        {[
          { id: 'overview' },
          { id: 'vitals' },
          { id: 'medications' },
          { id: 'procedures' },
          { id: 'notes' },
          { id: 'transfers' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-sky-400 border-b-2 border-sky-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {getTabLabel(tab.id)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Patient Information */}
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-4">{t("admissions.detailsPage.patientInfo", "معلومات المريض")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.fullName", "الاسم الكامل:")}</span>
                  <div className="font-medium">{admission.patient.fullName}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.mrn", "الرقم الطبي:")}</span>
                  <div className="font-medium">{admission.patient.mrn}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.dob", "تاريخ الميلاد:")}</span>
                  <div className="font-medium">{new Date(admission.patient.dateOfBirth).toLocaleDateString(isRtl ? 'ar-LY' : 'en-US')}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.gender", "الجنس:")}</span>
                  <div className="font-medium">{admission.patient.gender}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.phone", "رقم الهاتف:")}</span>
                  <div className="font-medium">{admission.patient.contactNumber}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.address", "العنوان:")}</span>
                  <div className="font-medium">{admission.patient.address}</div>
                </div>
              </div>
            </div>

            {/* Admission Information */}
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-4">{t("admissions.detailsPage.admissionInfo", "معلومات الإيواء")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.admissionDate", "تاريخ الإدخال:")}</span>
                  <div className="font-medium">{new Date(admission.actualAdmissionDate).toLocaleDateString(isRtl ? 'ar-LY' : 'en-US')}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.expectedDischarge", "تاريخ التسريح المتوقع:")}</span>
                  <div className="font-medium">
                    {admission.expectedDischargeDate 
                      ? new Date(admission.expectedDischargeDate).toLocaleDateString(isRtl ? 'ar-LY' : 'en-US')
                      : '-'
                    }
                  </div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.reason", "سبب الإدخال:")}</span>
                  <div className="font-medium">{admission.admissionReason}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.diagnosis", "التشخيص الرئيسي:")}</span>
                  <div className="font-medium">{admission.primaryDiagnosis || '-'}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.doctor", "الطبيب المعالج:")}</span>
                  <div className="font-medium">{admission.admittingDoctor.fullName}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.department", "القسم:")}</span>
                  <div className="font-medium">{admission.department?.name || '-'}</div>
                </div>
              </div>
            </div>

            {/* Cost Information */}
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-4">{t("admissions.detailsPage.costInfo", "معلومات التكلفة")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.estimatedCost", "التكلفة المقدرة:")}</span>
                  <div className="font-medium">{admission.estimatedCost ? `${admission.estimatedCost.toLocaleString(isRtl ? 'ar-LY' : 'en-US')} ${t("billing.currencyLYD", "د.ل")}` : '-'}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">{t("admissions.detailsPage.actualCost", "التكلفة الفعلية:")}</span>
                  <div className="font-medium">{admission.actualCost ? `${admission.actualCost.toLocaleString(isRtl ? 'ar-LY' : 'en-US')} ${t("billing.currencyLYD", "د.ل")}` : '-'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transfers' && <LegacyBedTransfers transfers={admission.bedTransfers ?? []} canApprove={canApproveTransfer} canCancel={canCancelTransfer} activeAdmission={['ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING'].includes(admission.admissionStatus)} onChanged={async () => { setReadiness(null); await loadAdmissionDetails(admission.id); }} />}

        {/* Vitals Tab */}
        {activeTab === 'vitals' && (
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 space-y-4">
            {admission.encounterId ? (
              <VitalsPane encounterId={admission.encounterId} />
            ) : admission.vitalSigns && admission.vitalSigns.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="py-2 px-3">{t("common.date", "الوقت")}</th>
                      <th className="py-2 px-3">{t("vitals.bp", "الضغط")}</th>
                      <th className="py-2 px-3">{t("vitals.pulse", "النبض")}</th>
                      <th className="py-2 px-3">{t("vitals.temp", "الحرارة")}</th>
                      <th className="py-2 px-3">{t("vitals.o2", "الأكسجين")}</th>
                      <th className="py-2 px-3">{t("vitals.resp", "التنفس")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {admission.vitalSigns.map((v) => (
                      <tr key={v.id} className="text-slate-200">
                        <td className="py-2 px-3">{new Date(v.timestamp).toLocaleString(isRtl ? 'ar-LY' : 'en-US')}</td>
                        <td className="py-2 px-3 font-mono">{v.bloodPressure}</td>
                        <td className="py-2 px-3 font-mono">{v.heartRate}</td>
                        <td className="py-2 px-3 font-mono">{v.temperature}°C</td>
                        <td className="py-2 px-3 font-mono">{v.oxygenSaturation}%</td>
                        <td className="py-2 px-3 font-mono">{v.respiratoryRate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                {t("admissions.detailsPage.noVitals", "لا توجد علامات حيوية مسجلة لهذا الإيواء.")}
              </div>
            )}
          </div>
        )}

        {/* Medications Tab */}
        {activeTab === 'medications' && (
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 space-y-4">
            {admission.encounterId ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-sm text-slate-400">
                    {t("admissions.detailsPage.medicationsEncounterHint", "سجل إعطاء الأدوية المرتبط بالزيارة")}
                  </span>
                  <button
                    onClick={() => navigate(`/encounters/${admission.encounterId}`)}
                    className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    {t("admissions.detailsPage.openPrescriptions", "فتح وصفات الزيارة")}
                  </button>
                </div>
                <MedicationAdministrationPane encounterId={admission.encounterId} />
              </>
            ) : admission.medications && admission.medications.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {admission.medications.map((m) => (
                  <div key={m.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                    <div className="font-semibold text-white">{m.name}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {m.dosage} • {m.frequency}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                {t("admissions.detailsPage.noMedications", "لا توجد أدوية مسجلة لهذا الإيواء.")}
              </div>
            )}
          </div>
        )}

        {/* Procedures Tab */}
        {activeTab === 'procedures' && (
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white">
                {t("admissions.detailsPage.tabs.procedures", "الإجراءات")}
              </h3>
              {admission.encounterId && (
                <button
                  onClick={() => navigate(`/encounters/${admission.encounterId}`)}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  {t("admissions.detailsPage.openEncounterChart", "فتح ملف الزيارة الكامل")}
                </button>
              )}
            </div>
            {admission.procedures && admission.procedures.length > 0 ? (
              <div className="space-y-2">
                {admission.procedures.map((proc) => (
                  <div key={proc.id} className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <div>
                      <div className="font-medium text-white">{proc.name}</div>
                      <div className="text-xs text-slate-400">{new Date(proc.date).toLocaleDateString(isRtl ? 'ar-LY' : 'en-US')}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 text-slate-300 border border-slate-700">
                      {proc.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                {t("admissions.detailsPage.noProcedures", "لا توجد إجراءات مسجلة بعد.")}
              </div>
            )}
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white">
                {t("admissions.detailsPage.tabs.notes", "الملاحظات")}
              </h3>
              {admission.encounterId && (
                <button
                  onClick={() => navigate(`/encounters/${admission.encounterId}`)}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  {t("admissions.detailsPage.openEncounterChart", "فتح ملف الزيارة الكامل")}
                </button>
              )}
            </div>
            {admission.notes && admission.notes.length > 0 ? (
              <div className="space-y-3">
                {admission.notes.map((note) => (
                  <div key={note.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">{note.author} ({note.type})</span>
                      <span>{new Date(note.timestamp).toLocaleString(isRtl ? 'ar-LY' : 'en-US')}</span>
                    </div>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                {t("admissions.detailsPage.noNotes", "لا توجد ملاحظات سريرية مسجلة بعد.")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
