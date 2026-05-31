import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Types
type Admission = {
  id: number;
  encounterId?: number;
  patient: { id?: number; fullName: string; mrn: string };
  bed?: { bedNumber: string; room?: { roomNumber: string; ward?: { name: string } } };
  ward?: { name: string };
  department?: { name: string };
  admittingDoctor: { fullName: string };
  primaryPhysician: { fullName: string };
  admissionType: string;
  admissionStatus: string;
  priority: string;
  actualAdmissionDate: string;
  dischargeDate?: string;
  expectedDischargeDate?: string;
  lengthOfStay?: number;
  isolationRequired: boolean;
  isolationType?: 'NONE' | 'STANDARD' | 'DROPLET' | 'AIRBORNE' | 'CONTACT' | 'PROTECTIVE' | 'NEUTROPENIC' | 'REVERSE';
  isolationReason?: string;
  isolationPrecautions?: string[];
  isEmergency: boolean;
  isReadmission: boolean;
  estimatedCost?: number;
  actualCost?: number;
};

type BedOccupancyReport = {
  wardId: number;
  wardName: string;
  wardType: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  cleaningBeds: number;
  maintenanceBeds: number;
  occupancyRate: number;
  rooms: Array<{
    roomId: number;
    roomNumber: string;
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    beds: Array<{
      bedId: number;
      bedNumber: string;
      status: string;
      patient?: {
        admissionId: number;
        patientName: string;
        patientMrn: string;
      };
    }>;
  }>;
};

type AdmissionStats = {
  totalAdmissions: number;
  activeAdmissions: number;
  emergencyAdmissions: number;
  readmissions: number;
  averageLengthOfStay: number;
};

export default function AdvancedAdmissionManagement() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const navigate = useNavigate();

  // State Management
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [bedOccupancyReport, setBedOccupancyReport] = useState<BedOccupancyReport[]>([]);
  const [admissionStats, setAdmissionStats] = useState<AdmissionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'admissions' | 'beds' | 'statistics'>('overview');
  const [editingAdmission, setEditingAdmission] = useState<Admission | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDischargePlanningModal, setShowDischargePlanningModal] = useState(false);
  const [showBedTransferModal, setShowBedTransferModal] = useState(false);
  const [showQuickAdmissionModal, setShowQuickAdmissionModal] = useState(false);
  const [showIsolationModal, setShowIsolationModal] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<Admission | null>(null);
  
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [availableBeds, setAvailableBeds] = useState<any[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [wardFilter, setWardFilter] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<string>('today');

  // Load data
  useEffect(() => {
    loadData();
    loadBasicData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, statusFilter, wardFilter, periodFilter]);

  const loadBasicData = async () => {
    try {
      const [patientsRes, doctorsRes, bedsRes] = await Promise.all([
        apiClient.get("/patients?limit=100"),
        apiClient.get("/users/doctors-list"),
        apiClient.get("/beds/tree")
      ]);
      setPatients(patientsRes.data.items || []);
      setDoctors(doctorsRes.data);
      
      // Extract available beds from the tree structure
      const allBeds: any[] = [];
      bedsRes.data.forEach((ward: any) => {
        ward.rooms.forEach((room: any) => {
          room.beds.forEach((bed: any) => {
            if (bed.status === 'AVAILABLE') {
              allBeds.push({
                id: bed.id,
                bedNumber: bed.bedNumber,
                wardName: ward.name,
                roomNumber: room.roomNumber,
                wardId: ward.id,
                roomId: room.id
              });
            }
          });
        });
      });
      setAvailableBeds(allBeds);
    } catch (err) {
      console.error("Failed to load basic data:", err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [];

      if (activeTab === 'overview' || activeTab === 'admissions') {
        promises.push(
          apiClient.get("/admissions", {
            params: {
              ...(statusFilter && { status: statusFilter }),
              ...(wardFilter && { wardId: wardFilter }),
              limit: 100,
            },
          })
        );
      }

      if (activeTab === 'overview' || activeTab === 'beds') {
        promises.push(apiClient.get("/admissions/reports/bed-occupancy"));
      }

      if (activeTab === 'overview' || activeTab === 'statistics') {
        promises.push(
          apiClient.get("/admissions/statistics/overview", {
            params: { period: periodFilter },
          })
        );
      }

      const results = await Promise.all(promises);

      if (activeTab === 'overview' || activeTab === 'admissions') {
        const admissionsIndex = 0;
        setAdmissions(results[admissionsIndex].data.admissions || []);
      }

      if (activeTab === 'overview' || activeTab === 'beds') {
        const bedsIndex = activeTab === 'overview' ? 1 : 0;
        setBedOccupancyReport(results[bedsIndex].data || []);
      }

      if (activeTab === 'overview' || activeTab === 'statistics') {
        const statsIndex = activeTab === 'overview' ? 2 : 0;
        setAdmissionStats(results[statsIndex].data);
      }
    } catch (err) {
      console.error(err);
      toast.error(t("admissions.modals.loadFailed", "فشل تحميل البيانات"));
    } finally {
      setLoading(false);
    }
  };

  // Action handlers
  const handleEditAdmission = async (admission: Admission) => {
    setEditingAdmission(admission);
    setShowEditModal(true);
  };

  const handleUpdateAdmission = async (updatedData: Partial<Admission>) => {
    if (!editingAdmission) return;

    try {
      await apiClient.put(`/admissions/${editingAdmission.id}`, updatedData);
      toast.success(t("admissions.modals.editSuccess", "تم تحديث بيانات الإيواء بنجاح"));
      setShowEditModal(false);
      setEditingAdmission(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("admissions.modals.editFailed", "فشل تحديث بيانات الإيواء"));
    }
  };

  const handleDischargePatient = async (admission: Admission) => {
    if (!confirm(t("admissions.modals.confirmDischarge", "هل أنت متأكد من تسريح المريض عملياً وإخلاء السرير؟\n\nتأكد انه تم توثيق 'ملخص الخروج' طبياً وتخليص الفواتير مالياً."))) return;

    try {
      await apiClient.post(`/admissions/${admission.id}/discharge`, {
        dischargeDisposition: "HOME",
        followUpRequired: false,
        notes: t("admissions.modals.defaultDischargeNotes", "تسريح عادي"),
      });

      toast.success(t("admissions.modals.dischargeSuccess", "تم تسريح المريض بنجاح، السرير الآن متاح للتنظيف."), {
        action: {
          label: t("admissions.modals.printInvoice", "طباعة الفاتورة الشاملة والنتائج"),
          onClick: () => navigate(`/encounters/${admission.encounterId}`)
        },
        duration: 10000
      });
      loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.message || t("admissions.modals.dischargeFailed", "فشل تسريح المريض");
      toast.error(msg, { duration: 10000 });
    }
  };

  const handleDischargePlanning = (admission: Admission) => {
    setSelectedAdmission(admission);
    setShowDischargePlanningModal(true);
  };

  const handleCreateDischargePlanning = async (planningData: any) => {
    if (!selectedAdmission) return;

    try {
      await apiClient.post(`/admissions/${selectedAdmission.id}/discharge-planning`, planningData);
      toast.success(t("admissions.modals.planningSuccess", "تم إنشاء خطة التسريح بنجاح"));
      setShowDischargePlanningModal(false);
      setSelectedAdmission(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("admissions.modals.planningFailed", "فشل إنشاء خطة التسريح"));
    }
  };

  const handleBedTransfer = (admission: Admission) => {
    setSelectedAdmission(admission);
    setShowBedTransferModal(true);
  };

  const handleRequestBedTransfer = async (transferData: any) => {
    if (!selectedAdmission) return;

    try {
      await apiClient.post(`/admissions/${selectedAdmission.id}/bed-transfer/request`, transferData);
      toast.success(t("admissions.modals.transferRequestSuccess", "تم طلب نقل السرير بنجاح"));
      setShowBedTransferModal(false);
      setSelectedAdmission(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("admissions.modals.transferRequestFailed", "فشل طلب نقل السرير"));
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCompleteBedTransfer = async (transferId: number) => {
    try {
      await apiClient.post(`/admissions/bed-transfer/${transferId}/complete`);
      toast.success(t("admissions.modals.transferCompleteSuccess", "تم إتمام نقل السرير بنجاح"));
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("admissions.modals.transferCompleteFailed", "فشل إتمام نقل السرير"));
    }
  };

  const handleQuickAdmission = () => {
    setShowQuickAdmissionModal(true);
    loadBasicData();
  };

  const handleEmergencyAdmission = async (admissionData: any) => {
    try {
      await apiClient.post("/admissions/quick-admission", admissionData);
      toast.success(t("admissions.modals.quick.success", "تم الإيواء السريع بنجاح"));
      setShowQuickAdmissionModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("admissions.modals.quick.failed", "فشل الإيواء السريع"));
    }
  };

  const handleViewAdmissionDetails = async (admissionId: number) => {
    try {
      navigate(`/admissions/${admissionId}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("admissions.modals.loadFailed", "فشل تحميل التفاصيل"));
    }
  };

  const handleManageIsolation = (admission: Admission) => {
    setSelectedAdmission(admission);
    setShowIsolationModal(true);
  };

  const handleUpdateIsolation = async (isolationData: any) => {
    if (!selectedAdmission) return;

    try {
      await apiClient.put(`/admissions/${selectedAdmission.id}`, {
        isolationRequired: isolationData.isolationRequired,
        isolationType: isolationData.isolationType,
        isolationReason: isolationData.isolationReason,
        isolationPrecautions: isolationData.isolationPrecautions
      });
      
      toast.success(t("admissions.modals.isolationSuccess", "تم تحديث إعدادات العزل بنجاح"));
      setShowIsolationModal(false);
      setSelectedAdmission(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("admissions.modals.isolationFailed", "فشل تحديث إعدادات العزل"));
    }
  };

  const getIsolationTypeLabel = (type?: string) => {
    switch (type) {
      case 'NONE': return t("admissions.isolationTypes.NONE", 'بدون عزل');
      case 'STANDARD': return t("admissions.isolationTypes.STANDARD", 'عزل قياسي');
      case 'DROPLET': return t("admissions.isolationTypes.DROPLET", 'عزل القطيرات');
      case 'AIRBORNE': return t("admissions.isolationTypes.AIRBORNE", 'عزل الهواء');
      case 'CONTACT': return t("admissions.isolationTypes.CONTACT", 'عزل التلامس');
      case 'PROTECTIVE': return t("admissions.isolationTypes.PROTECTIVE", 'عزل وقائي');
      case 'NEUTROPENIC': return t("admissions.isolationTypes.NEUTROPENIC", 'عزل قلة الكريات البيض');
      case 'REVERSE': return t("admissions.isolationTypes.REVERSE", 'عزل عكسي');
      default: return t("admissions.isolationTypes.UNKNOWN", 'غير محدد');
    }
  };

  const getIsolationColor = (type?: string) => {
    switch (type) {
      case 'NONE': return 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300';
      case 'STANDARD': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
      case 'DROPLET': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
      case 'AIRBORNE': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      case 'CONTACT': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
      case 'PROTECTIVE': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
      case 'NEUTROPENIC': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
      case 'REVERSE': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // UI Helpers
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ADMITTED": return t("admissions.admissionStatus.ADMITTED", "منوم");
      case "IN_PROGRESS": return t("admissions.admissionStatus.IN_PROGRESS", "قيد العلاج");
      case "DISCHARGE_PENDING": return t("admissions.admissionStatus.DISCHARGE_PENDING", "انتظار الخروج");
      case "DISCHARGED": return t("admissions.admissionStatus.DISCHARGED", "مُسرح");
      default: return status;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "CRITICAL": return t("admissions.priorityLabels.CRITICAL", "حرجة");
      case "URGENT": return t("admissions.priorityLabels.URGENT", "عاجلة");
      case "HIGH": return t("admissions.priorityLabels.HIGH", "عالية");
      case "MEDIUM": return t("admissions.priorityLabels.MEDIUM", "متوسطة");
      case "LOW": return t("admissions.priorityLabels.LOW", "منخفضة");
      default: return priority;
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

  const getOccupancyColor = (rate: number) => {
    if (rate >= 90) return "text-rose-500";
    if (rate >= 75) return "text-amber-500";
    return "text-emerald-500";
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("admissions.advancedTitle", "إدارة الإيواء المتقدمة")}</h1>
          <p className="text-sm text-slate-400">
            {t("admissions.advancedSubtitle", "إدارة شاملة للمرضى المنومين والأسرة والإحصائيات")}
          </p>
        </div>
        <button
          onClick={handleQuickAdmission}
          className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 transition-all"
        >
          {t("admissions.quickEmergencyAdmit", "إيواء سريع للطوارئ")}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 space-x-reverse border-b border-slate-700">
        {[
          { id: 'overview', label: t("admissions.tabs.overview", 'نظرة عامة') },
          { id: 'admissions', label: t("admissions.tabs.admissions", 'الإيواءات') },
          { id: 'beds', label: t("admissions.tabs.beds", 'الأسرة') },
          { id: 'statistics', label: t("admissions.tabs.statistics", 'الإحصائيات') },
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
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {(activeTab === 'admissions' || activeTab === 'statistics') && (
        <div className="flex gap-4 items-center">
          {activeTab === 'admissions' && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">{t("admissions.filters.allStatuses", "جميع الحالات")}</option>
                <option value="ADMITTED">{t("admissions.admissionStatus.ADMITTED", "منوم")}</option>
                <option value="IN_PROGRESS">{t("admissions.admissionStatus.IN_PROGRESS", "قيد العلاج")}</option>
                <option value="DISCHARGE_PENDING">{t("admissions.admissionStatus.DISCHARGE_PENDING", "في انتظار التسريح")}</option>
              </select>

              <select
                value={wardFilter}
                onChange={(e) => setWardFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">{t("admissions.filters.allWards", "جميع العنابر")}</option>
                {bedOccupancyReport.map((ward) => (
                  <option key={ward.wardId} value={ward.wardId}>
                    {ward.wardName}
                  </option>
                ))}
              </select>
            </>
          )}

          {activeTab === 'statistics' && (
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="today">{t("admissions.filters.today", "اليوم")}</option>
              <option value="week">{t("admissions.filters.week", "الأسبوع")}</option>
              <option value="month">{t("admissions.filters.month", "الشهر")}</option>
            </select>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
        </div>
      )}

      {/* Content */}
      {!loading && (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && admissionStats && (
            <div className="space-y-6">
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-sm text-slate-400 mb-1">{t("admissions.stats.totalAdmissions", "إجمالي الإيواءات")}</div>
                  <div className="text-2xl font-bold">{admissionStats.totalAdmissions}</div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-sm text-slate-400 mb-1">{t("admissions.stats.activeAdmissions", "الإيواءات النشطة")}</div>
                  <div className="text-2xl font-bold text-green-400">
                    {admissionStats.activeAdmissions}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-sm text-slate-400 mb-1">{t("admissions.stats.emergencyAdmissions", "حالات الطوارئ")}</div>
                  <div className="text-2xl font-bold text-red-400">
                    {admissionStats.emergencyAdmissions}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-sm text-slate-400 mb-1">{t("admissions.stats.readmissions", "إعادة الإيواء")}</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {admissionStats.readmissions}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-sm text-slate-400 mb-1">{t("admissions.stats.averageLengthOfStay", "متوسط مدة الإقامة")}</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {t("admissions.stats.averageDays", { defaultValue: "{{count}} يوم", count: parseFloat(admissionStats.averageLengthOfStay.toFixed(1)) })}
                  </div>
                </div>
              </div>

              {/* Recent Admissions */}
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">{t("admissions.recentAdmissions", "آخر الإيواءات")}</h3>
                <div className="space-y-3">
                  {admissions.slice(0, 5).map((admission) => (
                    <div
                      key={admission.id}
                      className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="font-medium">{admission.patient.fullName}</div>
                          <div className="text-sm text-slate-400">
                            {admission.patient.mrn} • {admission.bed?.bedNumber}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(admission.admissionStatus)}`}>
                          {getStatusLabel(admission.admissionStatus)}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(admission.priority)}`}>
                          {getPriorityLabel(admission.priority)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bed Occupancy Summary */}
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">{t("admissions.bedOccupancySummary", "ملخص إشغال الأسرة")}</h3>
                <div className="space-y-3">
                  {bedOccupancyReport.slice(0, 3).map((ward) => (
                    <div key={ward.wardId} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{ward.wardName}</div>
                        <div className="text-sm text-slate-400">
                          {t("admissions.occupiedBedsCount", { defaultValue: "{{occupied}} / {{total}} أسرة مشغولة", occupied: ward.occupiedBeds, total: ward.totalBeds })}
                        </div>
                      </div>
                      <div className={`font-bold ${getOccupancyColor(ward.occupancyRate)}`}>
                        {ward.occupancyRate.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Admissions Tab */}
          {activeTab === 'admissions' && (
            <div className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t("admissions.table.patient", "المريض")}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t("admissions.table.bed", "السرير")}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t("admissions.table.doctor", "الطبيب")}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t("admissions.table.status", "الحالة")}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t("admissions.table.isolation", "العزل")}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t("admissions.table.priority", "الأولوية")}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t("admissions.table.admissionDate", "تاريخ الإدخال")}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t("admissions.table.lengthOfStay", "مدة الإقامة")}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t("admissions.table.actions", "إجراءات")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {admissions.map((admission) => (
                      <tr key={admission.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium">{admission.patient.fullName}</div>
                            <div className="text-sm text-slate-400">{admission.patient.mrn}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium">{admission.bed?.bedNumber || '-'}</div>
                            <div className="text-sm text-slate-400">
                              {admission.ward?.name || admission.department?.name || '-'}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{admission.admittingDoctor.fullName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(admission.admissionStatus)}`}>
                            {getStatusLabel(admission.admissionStatus)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap text-center ${getIsolationColor(admission.isolationType)}`}>
                              {getIsolationTypeLabel(admission.isolationType)}
                            </span>
                            {admission.isolationRequired && (
                              <span className="text-xs text-slate-400">
                                {admission.isolationReason ? admission.isolationReason.substring(0, 20) + '...' : t("common.required", "مطلوب")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(admission.priority)}`}>
                            {getPriorityLabel(admission.priority)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {new Date(admission.actualAdmissionDate).toLocaleDateString(isRtl ? 'ar-LY' : 'en-US')}
                        </td>
                        <td className="px-4 py-3">
                          {admission.lengthOfStay ? `${admission.lengthOfStay} ${t("admissions.stats.days", "يوم")}` : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            {/* Primary Actions (Clinical & Operational) */}
                            <div className="flex gap-2">
                              {admission.admissionStatus !== 'DISCHARGED' && (
                                <>
                                  <button
                                    onClick={() => navigate(`/discharge-summary/${admission.id}`)}
                                    className="flex-1 px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs transition-colors shadow-sm font-semibold flex justify-center items-center gap-1"
                                    title={t("admissions.actions.dischargeClinicalTitle", "تعبئة ملخص الخروج الطبي")}
                                  >
                                    {t("admissions.actions.dischargeClinical", "📝 التخريج الطبي")}
                                  </button>
                                  <button
                                    onClick={() => handleDischargePatient(admission)}
                                    className="flex-1 px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs transition-colors shadow-lg font-bold flex justify-center items-center gap-1"
                                    title={t("admissions.actions.dischargeAndVacateTitle", "إخلاء السرير وإنهاء الإيواء وتسوية الرصيد")}
                                  >
                                    {t("admissions.actions.dischargeAndVacate", "🚪 تسريح وإخلاء")}
                                  </button>
                                </>
                              )}
                            </div>
                            {/* Secondary Actions (Administrative) */}
                            <div className="flex gap-2 flex-wrap justify-start">
                              <button
                                onClick={() => handleViewAdmissionDetails(admission.id)}
                                className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded text-xs transition-colors"
                              >
                                {t("admissions.actions.details", "تفاصيل")}
                              </button>
                              <button
                                onClick={() => handleEditAdmission(admission)}
                                className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs transition-colors"
                              >
                                {t("admissions.actions.edit", "تعديل")}
                              </button>
                              <button
                                onClick={() => handleManageIsolation(admission)}
                                className="px-3 py-1 bg-orange-600 hover:bg-orange-500 rounded text-xs transition-colors"
                              >
                                {t("admissions.actions.isolation", "العزل")}
                              </button>
                              {admission.admissionStatus !== 'DISCHARGED' && (
                                <>
                                  <button
                                    onClick={() => handleDischargePlanning(admission)}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors"
                                  >
                                    {t("admissions.actions.dischargePlanning", "تخطيط خروج")}
                                  </button>
                                  <button
                                    onClick={() => handleBedTransfer(admission)}
                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs transition-colors"
                                  >
                                    {t("admissions.actions.bedTransfer", "نقل سرير")}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Beds Tab */}
          {activeTab === 'beds' && (
            <div className="space-y-6">
              {bedOccupancyReport.map((ward) => (
                <div key={ward.wardId} className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">{ward.wardName}</h3>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-slate-400">
                        {t("admissions.occupancyRate", "الإشغال: ")} <span className={`font-bold ${getOccupancyColor(ward.occupancyRate)}`}>
                          {ward.occupancyRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-sm text-slate-400">
                        {t("admissions.occupiedBedsCount", { defaultValue: "{{occupied}} / {{total}} مشغول", occupied: ward.occupiedBeds, total: ward.totalBeds })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {ward.rooms.map((room) => (
                      <div key={room.roomId} className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">{t("admissions.room", "غرفة")} {room.roomNumber}</h4>
                          <span className="text-sm text-slate-400">
                            {room.occupiedBeds}/{room.totalBeds}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {room.beds.map((bed) => (
                            <div
                              key={bed.bedId}
                              className={`p-2 rounded text-center text-xs ${
                                bed.status === 'OCCUPIED'
                                  ? 'bg-red-900/30 border border-red-700'
                                  : bed.status === 'AVAILABLE'
                                  ? 'bg-green-900/30 border border-green-700'
                                  : 'bg-gray-900/30 border border-gray-700'
                              }`}
                            >
                              <div className="font-medium">{bed.bedNumber}</div>
                              <div className="text-slate-400">
                                {bed.status === 'OCCUPIED' ? t("admissions.status.occupied", 'مشغول') : 
                                 bed.status === 'AVAILABLE' ? t("admissions.status.available", 'متاح') : bed.status}
                              </div>
                              {bed.patient && (
                                <div className="text-xs mt-1 truncate">
                                  {bed.patient.patientName}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Statistics Tab */}
          {activeTab === 'statistics' && admissionStats && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-2">{t("admissions.stats.totalAdmissions", "إجمالي الإيواءات")}</h3>
                  <div className="text-3xl font-bold text-sky-400">
                    {admissionStats.totalAdmissions}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {t("admissions.filters." + periodFilter)}
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-2">{t("admissions.stats.emergencyAdmissions", "حالات الطوارئ")}</h3>
                  <div className="text-3xl font-bold text-red-400">
                    {admissionStats.emergencyAdmissions}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {((admissionStats.emergencyAdmissions / admissionStats.totalAdmissions) * 100).toFixed(1)}% {t("admissions.stats.ofTotal", "من الإجمالي")}
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-2">{t("admissions.stats.readmissions", "إعادة الإيواء")}</h3>
                  <div className="text-3xl font-bold text-yellow-400">
                    {admissionStats.readmissions}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {t("admissions.stats.within30Days", "خلال 30 يوم")}
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-2">{t("admissions.stats.averageLengthOfStay", "متوسط مدة الإقامة")}</h3>
                  <div className="text-3xl font-bold text-green-400">
                    {admissionStats.averageLengthOfStay.toFixed(1)}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">{t("admissions.stats.days", "يوم")}</div>
                </div>
              </div>

              {/* Performance Analysis */}
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">{t("admissions.performanceAnalysis", "تحليل الأداء")}</h3>
                <div className="text-center py-8 text-slate-400">
                  <p>{t("admissions.performanceAnalysisPlaceholder", "البيانات الحالية ممتازة، سيتم دمج المزيد من المؤشرات التحليلية لاحقاً لدعم اتخاذ القرار.")}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Admission Modal */}
      {showEditModal && editingAdmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
            <h3 className="text-xl font-bold mb-4">{t("admissions.modals.edit.title", "تعديل بيانات الإيواء")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.edit.type", "نوع الإيواء")}</label>
                <select
                  value={editingAdmission.admissionType}
                  onChange={(e) => setEditingAdmission({...editingAdmission, admissionType: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <option value="ELECTIVE">{t("admissions.modals.edit.elective", "اختياري")}</option>
                  <option value="EMERGENCY">{t("admissions.modals.edit.emergency", "طوارئ")}</option>
                  <option value="URGENT">{t("admissions.modals.edit.urgent", "عاجل")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.edit.priority", "الأولوية")}</label>
                <select
                  value={editingAdmission.priority}
                  onChange={(e) => setEditingAdmission({...editingAdmission, priority: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <option value="LOW">{t("admissions.priorityLabels.LOW", "منخفضة")}</option>
                  <option value="MEDIUM">{t("admissions.priorityLabels.MEDIUM", "متوسطة")}</option>
                  <option value="HIGH">{t("admissions.priorityLabels.HIGH", "عالية")}</option>
                  <option value="URGENT">{t("admissions.priorityLabels.URGENT", "عاجلة")}</option>
                  <option value="CRITICAL">{t("admissions.priorityLabels.CRITICAL", "حرجة")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.edit.expectedDischarge", "تاريخ التسريح المتوقع")}</label>
                <input
                  type="date"
                  value={editingAdmission.expectedDischargeDate?.split('T')[0] || ''}
                  onChange={(e) => setEditingAdmission({...editingAdmission, expectedDischargeDate: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:sepia-0 [&::-webkit-calendar-picker-indicator]:saturate-0 [&::-webkit-calendar-picker-indicator]:hue-rotate-180 [&::-webkit-calendar-picker-indicator]:brightness-200 [&::-webkit-calendar-picker-indicator]:contrast-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.edit.estimatedCost", "التكلفة المقدرة")}</label>
                <input
                  type="number"
                  value={editingAdmission.estimatedCost || ''}
                  onChange={(e) => setEditingAdmission({...editingAdmission, estimatedCost: Number(e.target.value)})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleUpdateAdmission(editingAdmission)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                {t("admissions.modals.edit.save", "حفظ التعديلات")}
              </button>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingAdmission(null);
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                {t("admissions.modals.edit.cancel", "إلغاء")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discharge Planning Modal */}
      {showDischargePlanningModal && selectedAdmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
            <h3 className="text-xl font-bold mb-4">{t("admissions.modals.dischargePlanning.title", "تخطيط التسريح")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.dischargePlanning.plannedDate", "تاريخ التسريح المخطط")}</label>
                <input
                  type="date"
                  onChange={(e) => setSelectedAdmission({...selectedAdmission, expectedDischargeDate: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:sepia-0 [&::-webkit-calendar-picker-indicator]:saturate-0 [&::-webkit-calendar-picker-indicator]:hue-rotate-180 [&::-webkit-calendar-picker-indicator]:brightness-200 [&::-webkit-calendar-picker-indicator]:contrast-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.dischargePlanning.disposition", "وجهة التخريج")}</label>
                <select
                  id="dischargeDispositionSelect"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  defaultValue="HOME"
                >
                  <option value="HOME">{t("admissions.modals.dischargePlanning.home", "المنزل")}</option>
                  <option value="TRANSFER">{t("admissions.modals.dischargePlanning.transfer", "نقل مستشفى آخر")}</option>
                  <option value="REHAB">{t("admissions.modals.dischargePlanning.rehab", "تأهيل طبي")}</option>
                  <option value="LTC">{t("admissions.modals.dischargePlanning.ltc", "رعاية طويلة الأمد")}</option>
                  <option value="AMA">{t("admissions.modals.dischargePlanning.ama", "خروج على غير مشورة")}</option>
                  <option value="EXPIRED">{t("admissions.modals.dischargePlanning.expired", "وفاة")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.dischargePlanning.notes", "ملاحظات التخطيط")}</label>
                <textarea
                  id="dischargeNotesInput"
                  rows={4}
                  placeholder={t("admissions.modals.dischargePlanning.notesPlaceholder", "أدخل ملاحظات تخطيط التسريح...")}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  const dispositionSelect = document.getElementById('dischargeDispositionSelect') as HTMLSelectElement;
                  const notesInput = document.getElementById('dischargeNotesInput') as HTMLTextAreaElement;
                  handleCreateDischargePlanning({
                    plannedDischargeDate: selectedAdmission.expectedDischargeDate,
                    dischargeDisposition: dispositionSelect?.value || 'HOME',
                    notes: notesInput?.value || t("admissions.modals.dischargePlanning.defaultNotes", "ملاحظات التخطيط")
                  });
                }}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                {t("admissions.modals.dischargePlanning.create", "إنشاء خطة التسريح")}
              </button>
              <button
                onClick={() => {
                  setShowDischargePlanningModal(false);
                  setSelectedAdmission(null);
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                {t("admissions.modals.edit.cancel", "إلغاء")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bed Transfer Modal */}
      {showBedTransferModal && selectedAdmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
            <h3 className="text-xl font-bold mb-4">{t("admissions.modals.bedTransfer.title", "طلب نقل السرير")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.bedTransfer.currentBed", "السرير الحالي")}</label>
                <div className="bg-slate-700 p-3 rounded-lg">
                  {selectedAdmission.bed?.bedNumber} - {selectedAdmission.ward?.name}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.bedTransfer.reason", "سبب النقل")}</label>
                <select id="transferReasonSelect" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2">
                  <option value="MEDICAL">{t("admissions.modals.bedTransfer.medical", "أسباب طبية")}</option>
                  <option value="PATIENT_REQUEST">{t("admissions.modals.bedTransfer.patientRequest", "طلب المريض")}</option>
                  <option value="INFECTION_CONTROL">{t("admissions.modals.bedTransfer.infectionControl", "مكافحة العدوى")}</option>
                  <option value="BED_AVAILABILITY">{t("admissions.modals.bedTransfer.bedAvailability", "توفر سرير أفضل")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t("admissions.modals.bedTransfer.notes", "ملاحظات النقل")}</label>
                <textarea
                  id="transferNotesInput"
                  rows={3}
                  placeholder={t("admissions.modals.bedTransfer.notesPlaceholder", "أدخل ملاحظات النقل...")}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  const reasonSelect = document.getElementById('transferReasonSelect') as HTMLSelectElement;
                  const notesInput = document.getElementById('transferNotesInput') as HTMLTextAreaElement;
                  handleRequestBedTransfer({
                    reason: reasonSelect?.value || "MEDICAL",
                    notes: notesInput?.value || t("admissions.modals.bedTransfer.defaultNotes", "ملاحظات النقل")
                  });
                }}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                {t("admissions.modals.bedTransfer.submit", "طلب النقل")}
              </button>
              <button
                onClick={() => {
                  setShowBedTransferModal(false);
                  setSelectedAdmission(null);
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                {t("admissions.modals.edit.cancel", "إلغاء")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Admission Modal */}
      {showQuickAdmissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
            <h3 className="text-xl font-bold mb-4">{t("admissions.modals.quick.title", "إيواء سريع للطوارئ")}</h3>
            
            {patients.length === 0 || doctors.length === 0 || availableBeds.length === 0 ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                <span className="mr-3 text-slate-400">{t("admissions.modals.quick.loading", "جاري تحميل البيانات...")}</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t("admissions.modals.quick.patient", "المريض")}</label>
                  <select
                    id="quickPatientSelect"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  >
                    <option value="">{t("admissions.modals.quick.selectPatient", "اختر المريض...")}</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.fullName} - {patient.mrn}
                      </option>
                    ))}
                  </select>
                  {patients.length === 0 && (
                    <p className="text-xs text-red-400 mt-1">{t("admissions.modals.quick.noPatients", "لا يوجد مرضى متاحون")}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">{t("admissions.modals.quick.bed", "السرير المتاح")}</label>
                  <select
                    id="quickBedSelect"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  >
                    <option value="">{t("admissions.modals.quick.selectBed", "اختر سريراً متاحاً...")}</option>
                    {availableBeds.map((bed) => (
                      <option key={bed.id} value={bed.id}>
                        {t("admissions.room", "غرفة")} {bed.roomNumber} - {bed.wardName} - {t("admissions.table.bed", "السرير")} {bed.bedNumber}
                      </option>
                    ))}
                  </select>
                  {availableBeds.length === 0 && (
                    <p className="text-xs text-red-400 mt-1">{t("admissions.modals.quick.noBeds", "لا توجد أسرة متاحة حالياً")}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">{t("admissions.modals.quick.doctor", "الطبيب المعالج")}</label>
                  <select
                    id="quickDoctorSelect"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  >
                    <option value="">{t("admissions.modals.quick.selectDoctor", "اختر الطبيب...")}</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.fullName} - {doctor.specialization || t("admissions.table.doctor", "طبيب")}
                      </option>
                    ))}
                  </select>
                  {doctors.length === 0 && (
                    <p className="text-xs text-red-400 mt-1">{t("admissions.modals.quick.noDoctors", "لا يوجد أطباء متاحون")}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">{t("admissions.modals.quick.reason", "سبب الإدخال الطارئ")}</label>
                  <textarea
                    id="quickReasonInput"
                    rows={3}
                    placeholder={t("admissions.modals.quick.reasonPlaceholder", "أدخل سبب الإدخال الطارئ...")}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">{t("admissions.modals.quick.diagnosis", "التشخيص الأولي")}</label>
                  <input
                    id="quickDiagnosisInput"
                    type="text"
                    placeholder={t("admissions.modals.quick.diagnosisPlaceholder", "التشخيص الأولي...")}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">{t("admissions.modals.quick.isolation", "نوع العزل المطلوب")}</label>
                  <select
                    id="quickIsolationSelect"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  >
                    <option value="NONE">{t("admissions.isolationTypes.NONE", "بدون عزل")}</option>
                    <option value="STANDARD">{t("admissions.isolationTypes.STANDARD", "عزل قياسي")}</option>
                    <option value="DROPLET">{t("admissions.isolationTypes.DROPLET", "عزل القطيرات")}</option>
                    <option value="AIRBORNE">{t("admissions.isolationTypes.AIRBORNE", "عزل الهواء")}</option>
                    <option value="CONTACT">{t("admissions.isolationTypes.CONTACT", "عزل التلامس")}</option>
                    <option value="PROTECTIVE">{t("admissions.isolationTypes.PROTECTIVE", "عزل وقائي")}</option>
                    <option value="NEUTROPENIC">{t("admissions.isolationTypes.NEUTROPENIC", "عزل قلة الكريات البيض")}</option>
                    <option value="REVERSE">{t("admissions.isolationTypes.REVERSE", "عزل عكسي")}</option>
                  </select>
                </div>
              </div>
            )}
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  const patientSelect = document.getElementById('quickPatientSelect') as HTMLSelectElement;
                  const bedSelect = document.getElementById('quickBedSelect') as HTMLSelectElement;
                  const doctorSelect = document.getElementById('quickDoctorSelect') as HTMLSelectElement;
                  const reasonInput = document.getElementById('quickReasonInput') as HTMLTextAreaElement;
                  const diagnosisInput = document.getElementById('quickDiagnosisInput') as HTMLInputElement;
                  const isolationSelect = document.getElementById('quickIsolationSelect') as HTMLSelectElement;

                  const patientId = patientSelect.value;
                  const bedId = bedSelect.value;
                  const doctorId = doctorSelect.value;
                  const admissionReason = reasonInput.value.trim();
                  const primaryDiagnosis = diagnosisInput.value.trim();
                  const isolationType = isolationSelect.value;

                  if (!patientId || !bedId || !doctorId || !admissionReason) {
                    toast.error(t("admissions.modals.quick.fillRequired", "يرجى ملء جميع الحقول المطلوبة"));
                    return;
                  }

                  const admissionData = {
                    patientId: parseInt(patientId),
                    bedId: parseInt(bedId),
                    admittingDoctorId: parseInt(doctorId),
                    admissionReason,
                    primaryDiagnosis: primaryDiagnosis || undefined,
                    isolationType: isolationType !== 'NONE' ? isolationType : undefined,
                  };

                  handleEmergencyAdmission(admissionData);
                }}
                disabled={patients.length === 0 || doctors.length === 0 || availableBeds.length === 0}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg font-bold"
              >
                {t("admissions.modals.quick.submit", "إيواء طارئ")}
              </button>
              <button
                onClick={() => setShowQuickAdmissionModal(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                {t("admissions.modals.edit.cancel", "إلغاء")}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Isolation Management Modal */}
      {showIsolationModal && selectedAdmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
            <h3 className="text-xl font-bold mb-4">{t("admissions.modals.isolation.title", { defaultValue: "إدارة العزل - {{name}}", name: selectedAdmission.patient.fullName })}</h3>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedAdmission.isolationRequired}
                    onChange={(e) => setSelectedAdmission({
                      ...selectedAdmission,
                      isolationRequired: e.target.checked
                    })}
                    className="w-4 h-4 text-sky-600 bg-slate-700 border-slate-600 rounded"
                  />
                  <span className="text-sm font-medium">{t("admissions.modals.isolation.required", "تطلب عزل")}</span>
                </label>
              </div>

              {selectedAdmission.isolationRequired && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t("admissions.modals.isolation.type", "نوع العزل")}</label>
                    <select
                      value={selectedAdmission.isolationType || 'NONE'}
                      onChange={(e) => setSelectedAdmission({
                        ...selectedAdmission,
                        isolationType: e.target.value as any
                      })}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                    >
                      <option value="NONE">{t("admissions.isolationTypes.NONE", "بدون عزل")}</option>
                      <option value="STANDARD">{t("admissions.isolationTypes.STANDARD", "عزل قياسي")}</option>
                      <option value="DROPLET">{t("admissions.isolationTypes.DROPLET", "عزل القطيرات")}</option>
                      <option value="AIRBORNE">{t("admissions.isolationTypes.AIRBORNE", "عزل الهواء")}</option>
                      <option value="CONTACT">{t("admissions.isolationTypes.CONTACT", "عزل التلامس")}</option>
                      <option value="PROTECTIVE">{t("admissions.isolationTypes.PROTECTIVE", "عزل وقائي")}</option>
                      <option value="NEUTROPENIC">{t("admissions.isolationTypes.NEUTROPENIC", "عزل قلة الكريات البيض")}</option>
                      <option value="REVERSE">{t("admissions.isolationTypes.REVERSE", "عزل عكسي")}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t("admissions.modals.isolation.reason", "سبب العزل")}</label>
                    <textarea
                      rows={3}
                      value={selectedAdmission.isolationReason || ''}
                      onChange={(e) => setSelectedAdmission({
                        ...selectedAdmission,
                        isolationReason: e.target.value
                      })}
                      placeholder={t("admissions.modals.isolation.reasonPlaceholder", "أدخل سبب العزل...")}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t("admissions.modals.isolation.precautions", "إجراءات الوقاية")}</label>
                    <div className="space-y-2">
                      {[
                        { label: t("admissions.precautions.handwashing", 'غسل اليدين المتكرر'), value: 'غسل اليدين المتكرر' },
                        { label: t("admissions.precautions.gloves", 'استخدام القفازات'), value: 'استخدام القفازات' },
                        { label: t("admissions.precautions.mask", 'استخدام الكمامة'), value: 'استخدام الكمامة' },
                        { label: t("admissions.precautions.gown", 'روب الحماية'), value: 'روب الحماية' },
                        { label: t("admissions.precautions.eyewear", 'حماية العين'), value: 'حماية العين' },
                        { label: t("admissions.precautions.disinfection", 'تطهير المعدات'), value: 'تطهير المعدات' },
                        { label: t("admissions.precautions.ventilation", 'التهوية الجيدة'), value: 'التهوية الجيدة' }
                      ].map((precaution) => (
                        <label key={precaution.value} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedAdmission.isolationPrecautions?.includes(precaution.value) || false}
                            onChange={(e) => {
                              const precautions = selectedAdmission.isolationPrecautions || [];
                              if (e.target.checked) {
                                setSelectedAdmission({
                                  ...selectedAdmission,
                                  isolationPrecautions: [...precautions, precaution.value]
                                });
                              } else {
                                setSelectedAdmission({
                                  ...selectedAdmission,
                                  isolationPrecautions: precautions.filter(p => p !== precaution.value)
                                });
                              }
                            }}
                            className="w-4 h-4 text-sky-600 bg-slate-700 border-slate-600 rounded"
                          />
                          <span className="text-sm">{precaution.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-700 rounded-lg p-4">
                    <h4 className="font-medium mb-2">{t("admissions.modals.isolation.selectedInfo", "معلومات العزل المحدد:")}</h4>
                    <div className="text-sm space-y-1">
                      <p><span className="text-slate-400">{t("admissions.modals.isolation.selectedType", "النوع:")}</span> {getIsolationTypeLabel(selectedAdmission.isolationType)}</p>
                      <p><span className="text-slate-400">{t("admissions.modals.isolation.selectedBed", "السرير الحالي:")}</span> {selectedAdmission.bed?.bedNumber} - {selectedAdmission.ward?.name}</p>
                      {selectedAdmission.isolationPrecautions && selectedAdmission.isolationPrecautions.length > 0 && (
                        <p><span className="text-slate-400">{t("admissions.modals.isolation.selectedPrecautions", "إجراءات:")}</span> {selectedAdmission.isolationPrecautions.join(', ')}</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleUpdateIsolation({
                  isolationRequired: selectedAdmission.isolationRequired,
                  isolationType: selectedAdmission.isolationType,
                  isolationReason: selectedAdmission.isolationReason,
                  isolationPrecautions: selectedAdmission.isolationPrecautions
                })}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                {t("admissions.modals.isolation.save", "حفظ إعدادات العزل")}
              </button>
              <button
                onClick={() => {
                  setShowIsolationModal(false);
                  setSelectedAdmission(null);
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                {t("admissions.modals.edit.cancel", "إلغاء")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
