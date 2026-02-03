import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// Types
type Admission = {
  id: number;
  patient: { fullName: string; mrn: string };
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
  }, [activeTab, statusFilter, wardFilter, periodFilter]);

  const loadBasicData = async () => {
    try {
      const [patientsRes, doctorsRes, bedsRes] = await Promise.all([
        apiClient.get("/patients?limit=100"),
        apiClient.get("/users/doctors-list"),
        apiClient.get("/beds/tree") // Changed from /beds/available to /beds/tree
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
        const admissionsIndex = activeTab === 'overview' ? 0 : 0;
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
      toast.error("فشل تحميل البيانات");
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
      toast.success("تم تحديث بيانات الإيواء بنجاح");
      setShowEditModal(false);
      setEditingAdmission(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل تحديث بيانات الإيواء");
    }
  };

  const handleDischargePatient = async (admissionId: number) => {
    if (!confirm("هل أنت متأكد من تسريح المريض؟")) return;

    try {
      await apiClient.post(`/admissions/${admissionId}/discharge`, {
        dischargeDisposition: "HOME",
        followUpRequired: false,
        notes: "تسريح عادي",
      });

      toast.success("تم تسريح المريض بنجاح");
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل تسريح المريض");
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
      toast.success("تم إنشاء خطة التسريح بنجاح");
      setShowDischargePlanningModal(false);
      setSelectedAdmission(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل إنشاء خطة التسريح");
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
      toast.success("تم طلب نقل السرير بنجاح");
      setShowBedTransferModal(false);
      setSelectedAdmission(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل طلب نقل السرير");
    }
  };

  const handleCompleteBedTransfer = async (transferId: number) => {
    try {
      await apiClient.post(`/admissions/bed-transfer/${transferId}/complete`);
      toast.success("تم إتمام نقل السرير بنجاح");
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل إتمام نقل السرير");
    }
  };

  const handleQuickAdmission = () => {
    setShowQuickAdmissionModal(true);
    // Reload basic data when opening the modal to ensure fresh data
    loadBasicData();
  };

  const handleEmergencyAdmission = async (admissionData: any) => {
    try {
      await apiClient.post("/admissions/quick-admission", admissionData);
      toast.success("تم الإيواء السريع بنجاح");
      setShowQuickAdmissionModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل الإيواء السريع");
    }
  };

  const handleViewAdmissionDetails = async (admissionId: number) => {
    try {
      const response = await apiClient.get(`/admissions/${admissionId}`);
      // Navigate to details page or show modal
      navigate(`/admissions/${admissionId}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل تحميل تفاصيل الإيواء");
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
      
      toast.success("تم تحديث إعدادات العزل بنجاح");
      setShowIsolationModal(false);
      setSelectedAdmission(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل تحديث إعدادات العزل");
    }
  };

  const getIsolationTypeLabel = (type?: string) => {
    switch (type) {
      case 'NONE': return 'بدون عزل';
      case 'STANDARD': return 'عزل قياسي';
      case 'DROPLET': return 'عزل القطيرات';
      case 'AIRBORNE': return 'عزل الهواء';
      case 'CONTACT': return 'عزل التلامس';
      case 'PROTECTIVE': return 'عزل وقائي';
      case 'NEUTROPENIC': return 'عزل قلة الكريات البيض';
      case 'REVERSE': return 'عزل عكسي';
      default: return 'غير محدد';
    }
  };

  const getIsolationColor = (type?: string) => {
    switch (type) {
      case 'NONE': return 'bg-gray-100 text-gray-800';
      case 'STANDARD': return 'bg-blue-100 text-blue-800';
      case 'DROPLET': return 'bg-yellow-100 text-yellow-800';
      case 'AIRBORNE': return 'bg-red-100 text-red-800';
      case 'CONTACT': return 'bg-orange-100 text-orange-800';
      case 'PROTECTIVE': return 'bg-green-100 text-green-800';
      case 'NEUTROPENIC': return 'bg-purple-100 text-purple-800';
      case 'REVERSE': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // UI Helpers
  const getStatusColor = (status: string) => {
    switch (status) {
      case "ADMITTED":
        return "bg-blue-100 text-blue-800";
      case "IN_PROGRESS":
        return "bg-green-100 text-green-800";
      case "DISCHARGE_PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "DISCHARGED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "CRITICAL":
        return "bg-red-100 text-red-800";
      case "URGENT":
        return "bg-orange-100 text-orange-800";
      case "HIGH":
        return "bg-yellow-100 text-yellow-800";
      case "MEDIUM":
        return "bg-blue-100 text-blue-800";
      case "LOW":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getOccupancyColor = (rate: number) => {
    if (rate >= 90) return "text-red-600";
    if (rate >= 75) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">إدارة الإيواء المتقدمة</h1>
          <p className="text-sm text-slate-400">
            إدارة شاملة للمرضى المنومين والأسرة والإحصائيات
          </p>
        </div>
        <button
          onClick={handleQuickAdmission}
          className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 transition-all"
        >
          إيواء سريع للطوارئ
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 space-x-reverse border-b border-slate-700">
        {[
          { id: 'overview', label: 'نظرة عامة' },
          { id: 'admissions', label: 'الإيواءات' },
          { id: 'beds', label: 'الأسرة' },
          { id: 'statistics', label: 'الإحصائيات' },
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
                <option value="">جميع الحالات</option>
                <option value="ADMITTED">منوم</option>
                <option value="IN_PROGRESS">قيد العلاج</option>
                <option value="DISCHARGE_PENDING">في انتظار التسريح</option>
              </select>

              <select
                value={wardFilter}
                onChange={(e) => setWardFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">جميع العنابر</option>
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
              <option value="today">اليوم</option>
              <option value="week">الأسبوع</option>
              <option value="month">الشهر</option>
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
                  <div className="text-sm text-slate-400 mb-1">إجمالي الإيواءات</div>
                  <div className="text-2xl font-bold">{admissionStats.totalAdmissions}</div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-sm text-slate-400 mb-1">الإيواءات النشطة</div>
                  <div className="text-2xl font-bold text-green-400">
                    {admissionStats.activeAdmissions}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-sm text-slate-400 mb-1">حالات الطوارئ</div>
                  <div className="text-2xl font-bold text-red-400">
                    {admissionStats.emergencyAdmissions}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-sm text-slate-400 mb-1">إعادة الإيواء</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {admissionStats.readmissions}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                  <div className="text-sm text-slate-400 mb-1">متوسط مدة الإقامة</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {admissionStats.averageLengthOfStay.toFixed(1)} يوم
                  </div>
                </div>
              </div>

              {/* Recent Admissions */}
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">آخر الإيواءات</h3>
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
                          {admission.admissionStatus}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(admission.priority)}`}>
                          {admission.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bed Occupancy Summary */}
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">ملخص إشغال الأسرة</h3>
                <div className="space-y-3">
                  {bedOccupancyReport.slice(0, 3).map((ward) => (
                    <div key={ward.wardId} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{ward.wardName}</div>
                        <div className="text-sm text-slate-400">
                          {ward.occupiedBeds} / {ward.totalBeds} أسرة مشغولة
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
                      <th className="px-4 py-3 text-right text-sm font-medium">المريض</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">السرير</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">الطبيب</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">الحالة</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">العزل</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">الأولوية</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">تاريخ الإدخال</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">مدة الإقامة</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">إجراءات</th>
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
                              {admission.ward?.name || '-'}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{admission.admittingDoctor.fullName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(admission.admissionStatus)}`}>
                            {admission.admissionStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`px-2 py-1 rounded-full text-xs ${getIsolationColor(admission.isolationType)}`}>
                              {getIsolationTypeLabel(admission.isolationType)}
                            </span>
                            {admission.isolationRequired && (
                              <span className="text-xs text-slate-400">
                                {admission.isolationReason ? admission.isolationReason.substring(0, 20) + '...' : 'مطلوب'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(admission.priority)}`}>
                            {admission.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {new Date(admission.actualAdmissionDate).toLocaleDateString('ar-SA')}
                        </td>
                        <td className="px-4 py-3">
                          {admission.lengthOfStay ? `${admission.lengthOfStay} يوم` : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => handleViewAdmissionDetails(admission.id)}
                              className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded text-xs transition-colors"
                            >
                              تفاصيل
                            </button>
                            <button
                              onClick={() => handleEditAdmission(admission)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors"
                            >
                              تعديل
                            </button>
                            <button
                              onClick={() => handleManageIsolation(admission)}
                              className="px-3 py-1 bg-orange-600 hover:bg-orange-500 rounded text-xs transition-colors"
                            >
                              العزل
                            </button>
                            {admission.admissionStatus !== 'DISCHARGED' && (
                              <>
                                <button
                                  onClick={() => handleDischargePlanning(admission)}
                                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-xs transition-colors"
                                >
                                  تخطيط التسريح
                                </button>
                                <button
                                  onClick={() => handleBedTransfer(admission)}
                                  className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs transition-colors"
                                >
                                  نقل سرير
                                </button>
                                <button
                                  onClick={() => handleDischargePatient(admission.id)}
                                  className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs transition-colors"
                                >
                                  تسريح
                                </button>
                              </>
                            )}
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
                        الإشغال: <span className={`font-bold ${getOccupancyColor(ward.occupancyRate)}`}>
                          {ward.occupancyRate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-sm text-slate-400">
                        {ward.occupiedBeds} / {ward.totalBeds} مشغول
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {ward.rooms.map((room) => (
                      <div key={room.roomId} className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">غرفة {room.roomNumber}</h4>
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
                                {bed.status === 'OCCUPIED' ? 'مشغول' : 
                                 bed.status === 'AVAILABLE' ? 'متاح' : bed.status}
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
                  <h3 className="text-lg font-semibold mb-2">إجمالي الإيواءات</h3>
                  <div className="text-3xl font-bold text-sky-400">
                    {admissionStats.totalAdmissions}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    خلال {periodFilter === 'today' ? 'اليوم' : periodFilter === 'week' ? 'الأسبوع' : 'الشهر'}
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-2">حالات الطوارئ</h3>
                  <div className="text-3xl font-bold text-red-400">
                    {admissionStats.emergencyAdmissions}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {((admissionStats.emergencyAdmissions / admissionStats.totalAdmissions) * 100).toFixed(1)}% من الإجمالي
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-2">إعادة الإيواء</h3>
                  <div className="text-3xl font-bold text-yellow-400">
                    {admissionStats.readmissions}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    خلال 30 يوم
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-2">متوسط مدة الإقامة</h3>
                  <div className="text-3xl font-bold text-green-400">
                    {admissionStats.averageLengthOfStay.toFixed(1)}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">يوم</div>
                </div>
              </div>

              {/* Additional statistics can be added here */}
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">تحليل الأداء</h3>
                <div className="text-center py-8 text-slate-400">
                  <p>مخططات وتحليلات إضافية قيد التطوير...</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Admission Modal */}
      {showEditModal && editingAdmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">تعديل بيانات الإيواء</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">نوع الإيواء</label>
                <select
                  value={editingAdmission.admissionType}
                  onChange={(e) => setEditingAdmission({...editingAdmission, admissionType: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <option value="ELECTIVE">اختياري</option>
                  <option value="EMERGENCY">طوارئ</option>
                  <option value="URGENT">عاجل</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">الأولوية</label>
                <select
                  value={editingAdmission.priority}
                  onChange={(e) => setEditingAdmission({...editingAdmission, priority: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <option value="LOW">منخفضة</option>
                  <option value="MEDIUM">متوسطة</option>
                  <option value="HIGH">عالية</option>
                  <option value="URGENT">عاجلة</option>
                  <option value="CRITICAL">حرجة</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">تاريخ التسريح المتوقع</label>
                <input
                  type="date"
                  value={editingAdmission.expectedDischargeDate?.split('T')[0] || ''}
                  onChange={(e) => setEditingAdmission({...editingAdmission, expectedDischargeDate: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">التكلفة المقدرة</label>
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
                حفظ التعديلات
              </button>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingAdmission(null);
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discharge Planning Modal */}
      {showDischargePlanningModal && selectedAdmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">تخطيط التسريح</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">تاريخ التسريح المخطط</label>
                <input
                  type="date"
                  onChange={(e) => setSelectedAdmission({...selectedAdmission, expectedDischargeDate: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">ملاحظات التخطيط</label>
                <textarea
                  rows={4}
                  placeholder="أدخل ملاحظات تخطيط التسريح..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleCreateDischargePlanning({
                  plannedDischargeDate: selectedAdmission.expectedDischargeDate,
                  notes: "ملاحظات التخطيط"
                })}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                إنشاء خطة التسريح
              </button>
              <button
                onClick={() => {
                  setShowDischargePlanningModal(false);
                  setSelectedAdmission(null);
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bed Transfer Modal */}
      {showBedTransferModal && selectedAdmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">طلب نقل السرير</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">السرير الحالي</label>
                <div className="bg-slate-700 p-3 rounded-lg">
                  {selectedAdmission.bed?.bedNumber} - {selectedAdmission.ward?.name}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">سبب النقل</label>
                <select className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2">
                  <option value="MEDICAL">أسباب طبية</option>
                  <option value="PATIENT_REQUEST">طلب المريض</option>
                  <option value="INFECTION_CONTROL">مكافحة العدوى</option>
                  <option value="BED_AVAILABILITY">توفر سرير أفضل</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">ملاحظات النقل</label>
                <textarea
                  rows={3}
                  placeholder="أدخل ملاحظات النقل..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleRequestBedTransfer({
                  reason: "MEDICAL",
                  notes: "ملاحظات النقل"
                })}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                طلب النقل
              </button>
              <button
                onClick={() => {
                  setShowBedTransferModal(false);
                  setSelectedAdmission(null);
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Admission Modal */}
      {showQuickAdmissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">إيواء سريع للطوارئ</h3>
            
            {patients.length === 0 || doctors.length === 0 || availableBeds.length === 0 ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                <span className="mr-3 text-slate-400">جاري تحميل البيانات...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">المريض</label>
                  <select
                    id="quickPatientSelect"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  >
                    <option value="">اختر المريض...</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.fullName} - {patient.mrn}
                      </option>
                    ))}
                  </select>
                  {patients.length === 0 && (
                    <p className="text-xs text-red-400 mt-1">لا يوجد مرضى متاحون</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">السرير المتاح</label>
                  <select
                    id="quickBedSelect"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  >
                    <option value="">اختر سريراً متاحاً...</option>
                    {availableBeds.map((bed) => (
                      <option key={bed.id} value={bed.id}>
                        سرير {bed.bedNumber} - {bed.wardName} - غرفة {bed.roomNumber}
                      </option>
                    ))}
                  </select>
                  {availableBeds.length === 0 && (
                    <p className="text-xs text-red-400 mt-1">لا توجد أسرة متاحة حالياً</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">الطبيب المعالج</label>
                  <select
                    id="quickDoctorSelect"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  >
                    <option value="">اختر الطبيب...</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        د. {doctor.fullName} - {doctor.specialization || 'طبيب'}
                      </option>
                    ))}
                  </select>
                  {doctors.length === 0 && (
                    <p className="text-xs text-red-400 mt-1">لا يوجد أطباء متاحون</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">سبب الإدخال الطارئ</label>
                  <textarea
                    id="quickReasonInput"
                    rows={3}
                    placeholder="أدخل سبب الإدخال الطارئ..."
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">التشخيص الأولي</label>
                  <input
                    id="quickDiagnosisInput"
                    type="text"
                    placeholder="التشخيص الأولي..."
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">نوع العزل المطلوب</label>
                  <select
                    id="quickIsolationSelect"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  >
                    <option value="NONE">بدون عزل</option>
                    <option value="STANDARD">عزل قياسي</option>
                    <option value="DROPLET">عزل القطيرات</option>
                    <option value="AIRBORNE">عزل الهواء</option>
                    <option value="CONTACT">عزل التلامس</option>
                    <option value="PROTECTIVE">عزل وقائي</option>
                    <option value="NEUTROPENIC">عزل قلة الكريات البيض</option>
                    <option value="REVERSE">عزل عكسي</option>
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
                    toast.error("يرجى ملء جميع الحقول المطلوبة");
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
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg"
              >
                إيواء طارئ
              </button>
              <button
                onClick={() => setShowQuickAdmissionModal(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Isolation Management Modal */}
      {showIsolationModal && selectedAdmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">إدارة العزل - {selectedAdmission.patient.fullName}</h3>
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
                  <span className="text-sm font-medium">تطلب عزل</span>
                </label>
              </div>

              {selectedAdmission.isolationRequired && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">نوع العزل</label>
                    <select
                      value={selectedAdmission.isolationType || 'NONE'}
                      onChange={(e) => setSelectedAdmission({
                        ...selectedAdmission,
                        isolationType: e.target.value as any
                      })}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                    >
                      <option value="NONE">بدون عزل</option>
                      <option value="STANDARD">عزل قياسي</option>
                      <option value="DROPLET">عزل القطيرات</option>
                      <option value="AIRBORNE">عزل الهواء</option>
                      <option value="CONTACT">عزل التلامس</option>
                      <option value="PROTECTIVE">عزل وقائي</option>
                      <option value="NEUTROPENIC">عزل قلة الكريات البيض</option>
                      <option value="REVERSE">عزل عكسي</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">سبب العزل</label>
                    <textarea
                      rows={3}
                      value={selectedAdmission.isolationReason || ''}
                      onChange={(e) => setSelectedAdmission({
                        ...selectedAdmission,
                        isolationReason: e.target.value
                      })}
                      placeholder="أدخل سبب العزل..."
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">إجراءات الوقاية</label>
                    <div className="space-y-2">
                      {[
                        'غسل اليدين المتكرر',
                        'استخدام القفازات',
                        'استخدام الكمامة',
                        'روب الحماية',
                        'حماية العين',
                        'تطهير المعدات',
                        'التهوية الجيدة'
                      ].map((precaution) => (
                        <label key={precaution} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedAdmission.isolationPrecautions?.includes(precaution) || false}
                            onChange={(e) => {
                              const precautions = selectedAdmission.isolationPrecautions || [];
                              if (e.target.checked) {
                                setSelectedAdmission({
                                  ...selectedAdmission,
                                  isolationPrecautions: [...precautions, precaution]
                                });
                              } else {
                                setSelectedAdmission({
                                  ...selectedAdmission,
                                  isolationPrecautions: precautions.filter(p => p !== precaution)
                                });
                              }
                            }}
                            className="w-4 h-4 text-sky-600 bg-slate-700 border-slate-600 rounded"
                          />
                          <span className="text-sm">{precaution}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-700 rounded-lg p-4">
                    <h4 className="font-medium mb-2">معلومات العزل المحدد:</h4>
                    <div className="text-sm space-y-1">
                      <p><span className="text-slate-400">النوع:</span> {getIsolationTypeLabel(selectedAdmission.isolationType)}</p>
                      <p><span className="text-slate-400">السرير الحالي:</span> {selectedAdmission.bed?.bedNumber} - {selectedAdmission.ward?.name}</p>
                      {selectedAdmission.isolationPrecautions && selectedAdmission.isolationPrecautions.length > 0 && (
                        <p><span className="text-slate-400">إجراءات:</span> {selectedAdmission.isolationPrecautions.join(', ')}</p>
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
                حفظ إعدادات العزل
              </button>
              <button
                onClick={() => {
                  setShowIsolationModal(false);
                  setSelectedAdmission(null);
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
