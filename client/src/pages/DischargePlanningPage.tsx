import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { format, addDays, differenceInDays, startOfDay } from 'date-fns';
import { ar } from 'date-fns/locale';

// Types
type DischargePlan = {
  id: number;
  admissionId: number;
  patient: {
    id: number;
    fullName: string;
    mrn: string;
    age: number;
    gender: string;
  };
  admission: {
    id: number;
    admissionDate: string;
    expectedDischargeDate?: string;
    lengthOfStay?: number;
    primaryDiagnosis?: string;
    admittingDoctor: string;
    department: string;
    bed: {
      bedNumber: string;
      ward: string;
    };
  };
  plannedDischargeDate?: string;
  dischargeDisposition: 'HOME' | 'TRANSFER' | 'REHAB' | 'LTC' | 'AMA' | 'EXPIRED';
  followUpRequired: boolean;
  followUpInstructions?: string;
  homeHealthServices: boolean;
  equipmentNeeded?: string[];
  medications?: Array<{
    id: number;
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
  }>;
  instructions?: {
    diet: string;
    activity: string;
    woundCare: string;
    medication: string;
    followUp: string;
  };
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
};

type DischargeChecklist = {
  id: number;
  category: string;
  items: Array<{
    id: number;
    description: string;
    completed: boolean;
    completedBy?: string;
    completedAt?: string;
    notes?: string;
  }>;
};

export default function DischargePlanningPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<DischargePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<DischargePlan | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'in-progress' | 'completed'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');

  // Active inpatients for selector
  const [activeInpatients, setActiveInpatients] = useState<any[]>([]);
  const [loadingInpatients, setLoadingInpatients] = useState(false);

  // Form state for creating new plan
  const [formData, setFormData] = useState({
    admissionId: '',
    plannedDischargeDate: '',
    dischargeDisposition: 'HOME' as string,
    followUpRequired: false,
    followUpInstructions: '',
    homeHealthServices: false,
    equipmentNeeded: [] as string[],
    notes: '',
    // Medical readiness
    medicalStability: false,
    vitalsStable: false,
    painControlled: false,
    medicationsReady: false,
    educationCompleted: false,
  });

  // Load discharge plans
  useEffect(() => {
    loadDischargePlans();
  }, [activeTab, filterDepartment, searchTerm]);

  const loadDischargePlans = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admissions/discharge-planning/list', {
        params: {
          status: activeTab === 'pending' ? 'PLANNING' : activeTab === 'in-progress' ? 'IN_PROGRESS' : 'COMPLETED',
          departmentId: filterDepartment ? parseInt(filterDepartment) : undefined,
          page: 1,
          limit: 50
        }
      });
      
      const transformedData = response.data.items || [];
      let filteredData = transformedData;
      
      if (searchTerm) {
        filteredData = transformedData.filter((item: any) => 
          item.admission?.patient?.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.admission?.patient?.mrn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.admission?.ward?.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      setPlans(filteredData.map((item: any) => ({
        id: item.id,
        admissionId: item.admissionId,
        patient: item.admission?.patient,
        admission: {
          id: item.admission?.id,
          admissionDate: item.admission?.actualAdmissionDate || item.admission?.scheduledAdmissionDate,
          expectedDischargeDate: item.admission?.expectedDischargeDate,
          lengthOfStay: item.admission?.lengthOfStay,
          primaryDiagnosis: item.admission?.primaryDiagnosis,
          admittingDoctor: item.admission?.admittingDoctor?.fullName || 'غير محدد',
          department: item.admission?.department?.name || 'غير محدد',
          bed: {
            bedNumber: item.admission?.bed?.bedNumber || 'غير محدد',
            ward: item.admission?.ward?.name || 'غير محدد'
          }
        },
        plannedDischargeDate: item.plannedDischargeDate,
        dischargeDisposition: item.dischargeDisposition,
        followUpRequired: item.admission?.followUpRequired || false,
        followUpInstructions: item.followUpInstructions || '',
        homeHealthServices: item.homeHealthRequired || false,
        equipmentNeeded: item.equipmentNeeded || [],
        notes: item.notes || '',
        status: item.status === 'PLANNING' ? 'PENDING' : item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        createdBy: item.creator?.fullName || 'نظام',
        reviewedBy: item.caseManager?.fullName || '',
        reviewedAt: item.completedDate || '',
      })));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'فشل تحميل خطط الخروج');
    } finally {
      setLoading(false);
    }
  };

  // Load active inpatients for the selector
  const loadActiveInpatients = async () => {
    setLoadingInpatients(true);
    try {
      const res = await apiClient.get('/encounters/list/active-inpatients');
      setActiveInpatients(res.data || []);
    } catch {
      toast.error('فشل تحميل قائمة المنومين');
    } finally {
      setLoadingInpatients(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!formData.admissionId || !formData.plannedDischargeDate) {
      toast.error('يرجى اختيار المريض وتحديد تاريخ الخروج المخطط');
      return;
    }

    try {
      // Convert date to ISO 8601 string
      const isoDate = new Date(formData.plannedDischargeDate).toISOString();

      await apiClient.post(`/admissions/${formData.admissionId}/discharge-planning`, {
        plannedDischargeDate: isoDate,
        dischargeDisposition: formData.dischargeDisposition,
        followUpRequired: formData.followUpRequired,
        followUpInstructions: formData.followUpInstructions,
        homeHealthServices: formData.homeHealthServices,
        equipmentNeeded: formData.equipmentNeeded,
        notes: formData.notes,
        medicalStability: formData.medicalStability,
        vitalsStable: formData.vitalsStable,
        painControlled: formData.painControlled,
        medicationsReady: formData.medicationsReady,
        educationCompleted: formData.educationCompleted,
        status: 'PLANNING',
      });
      
      toast.success('تم إنشاء خطة الخروج بنجاح');
      setShowCreateModal(false);
      setFormData({
        admissionId: '',
        plannedDischargeDate: '',
        dischargeDisposition: 'HOME',
        followUpRequired: false,
        followUpInstructions: '',
        homeHealthServices: false,
        equipmentNeeded: [],
        notes: '',
        medicalStability: false,
        vitalsStable: false,
        painControlled: false,
        medicationsReady: false,
        educationCompleted: false,
      });
      loadDischargePlans();
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      if (Array.isArray(msg)) {
        toast.error(msg.map((m: any) => m.constraints ? Object.values(m.constraints).join(', ') : m).join(' | '));
      } else {
        toast.error(msg || 'فشل إنشاء خطة الخروج');
      }
    }
  };

  const handleUpdatePlanStatus = async (planId: number, admissionId: number, newStatus: string) => {
    try {
      if (newStatus === 'COMPLETED') {
        const confirmMsg = "هل أنت متأكد من إنهاء خطة التخريج وإخلاء المريض نهائياً؟\nتأكد من توقيع ملخص الخروج السريري وتصفية الحساب المالي.";
        if (!confirm(confirmMsg)) return;

        await apiClient.patch(`/admissions/discharge-planning/${planId}/status`, {
          status: 'COMPLETED'
        });
        
        await apiClient.post(`/admissions/${admissionId}/discharge`, {});
        toast.success('تم إكمال الخطة وإجراء الخروج بنجاح. السرير الآن متاح للتنظيف.', { duration: 8000 });
      } else {
        await apiClient.patch(`/admissions/discharge-planning/${planId}/status`, {
          status: newStatus
        });
        toast.success('تم تحديث حالة الخطة بنجاح');
      }
      
      loadDischargePlans();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'فشل النظام في إجراء التخريج الفعلي. تأكد من استكمال ملخص الخروج (Medical Summary) والتسوية المالية.', { duration: 10000 });
    }
  };

  const handleDeletePlan = async (admissionId: number, patientName: string) => {
    if (!confirm(`هل أنت متأكد من حذف خطة الخروج للمريض: ${patientName}؟`)) return;
    try {
      await apiClient.delete(`/admissions/${admissionId}/discharge-planning`);
      toast.success('تم حذف خطة الخروج بنجاح.');
      loadDischargePlans();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'فشل حذف الخطة.');
    }
  };

  const getDispositionLabel = (disposition: string) => {
    const labels = {
      'HOME': 'العودة للمنزل',
      'TRANSFER': 'نقل لمستشفى آخر',
      'REHAB': 'مركز تأهيل',
      'LTC': 'رعاية طويلة الأمد',
      'AMA': 'مغادرة برغبة المريض',
      'EXPIRED': 'وفاة'
    };
    return labels[disposition as keyof typeof labels] || disposition;
  };

  const getDispositionColor = (disposition: string) => {
    const colors = {
      'HOME': 'bg-green-100 text-green-800',
      'TRANSFER': 'bg-blue-100 text-blue-800',
      'REHAB': 'bg-purple-100 text-purple-800',
      'LTC': 'bg-orange-100 text-orange-800',
      'AMA': 'bg-yellow-100 text-yellow-800',
      'EXPIRED': 'bg-gray-100 text-gray-800'
    };
    return colors[disposition as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    const colors = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'IN_PROGRESS': 'bg-blue-100 text-blue-800',
      'COMPLETED': 'bg-green-100 text-green-800',
      'CANCELLED': 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      'PENDING': 'في الانتظار',
      'IN_PROGRESS': 'قيد التنفيذ',
      'COMPLETED': 'مكتمل',
      'CANCELLED': 'ملغي'
    };
    return labels[status as keyof typeof labels] || status;
  };

  const calculateDaysUntilDischarge = (plannedDate?: string) => {
    if (!plannedDate) return '-';
    const days = differenceInDays(new Date(plannedDate), new Date());
    if (days < 0) return `متأخر ${Math.abs(days)} يوم`;
    if (days === 0) return 'اليوم';
    return `${days} يوم`;
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">تخطيط الخروج</h1>
          <p className="text-sm text-slate-400">
            إدارة خطط خروج المرضى وضمان انتقال آمن للرعاية
          </p>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); loadActiveInpatients(); }}
          className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 transition-all"
        >
          + إنشاء خطة خروج
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">خطط في الانتظار</div>
          <div className="text-2xl font-bold text-yellow-400">
            {plans.filter(p => p.status === 'PENDING').length}
          </div>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">خطط قيد التنفيذ</div>
          <div className="text-2xl font-bold text-blue-400">
            {plans.filter(p => p.status === 'IN_PROGRESS').length}
          </div>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">خطط مكتملة</div>
          <div className="text-2xl font-bold text-green-400">
            {plans.filter(p => p.status === 'COMPLETED').length}
          </div>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">معدل الإنجاز</div>
          <div className="text-2xl font-bold text-purple-400">
            {plans.length > 0 
              ? Math.round((plans.filter(p => p.status === 'COMPLETED').length / plans.length) * 100)
              : 0}%
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex space-x-1 space-x-reverse border-b border-slate-700">
          {[
            { id: 'pending', label: 'في الانتظار' },
            { id: 'in-progress', label: 'قيد التنفيذ' },
            { id: 'completed', label: 'مكتمل' },
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
        
        <input
          type="text"
          placeholder="البحث عن مريض..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm"
        />
        
        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">جميع الأقسام</option>
          <option value="Internal Medicine">الباطنية</option>
          <option value="Surgery">الجراحة</option>
          <option value="Pediatrics">الأطفال</option>
          <option value="ICU">العناية المركزة</option>
        </select>
      </div>

      {/* Plans Table */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium">المريض</th>
                <th className="px-4 py-3 text-right text-sm font-medium">القسم</th>
                <th className="px-4 py-3 text-right text-sm font-medium">تاريخ الخروج</th>
                <th className="px-4 py-3 text-right text-sm font-medium">الوجهة</th>
                <th className="px-4 py-3 text-right text-sm font-medium">الحالة</th>
                <th className="px-4 py-3 text-right text-sm font-medium">المتبقي</th>
                <th className="px-4 py-3 text-right text-sm font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    جاري التحميل...
                  </td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    لا توجد خطط خروج
                  </td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium">{plan.patient.fullName}</div>
                        <div className="text-sm text-slate-400">{plan.patient.mrn}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{plan.admission.department}</div>
                      <div className="text-xs text-slate-400">{plan.admission.bed.ward}</div>
                    </td>
                    <td className="px-4 py-3">
                      {plan.plannedDischargeDate 
                        ? format(new Date(plan.plannedDischargeDate), 'dd/MM/yyyy', { locale: ar })
                        : '-'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getDispositionColor(plan.dischargeDisposition)}`}>
                        {getDispositionLabel(plan.dischargeDisposition)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(plan.status)}`}>
                        {getStatusLabel(plan.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">
                        {calculateDaysUntilDischarge(plan.plannedDischargeDate)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedPlan(plan);
                            setShowDetailsModal(true);
                          }}
                          className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded text-xs transition-colors"
                        >
                          تفاصيل
                        </button>
                        {plan.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleUpdatePlanStatus(plan.id, plan.admissionId, 'IN_PROGRESS')}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors"
                            >
                              بدء
                            </button>
                            <button
                              onClick={() => handleDeletePlan(plan.admissionId, plan.patient?.fullName || '')}
                              className="px-3 py-1 bg-rose-700 hover:bg-rose-600 rounded text-xs transition-colors"
                            >
                              حذف
                            </button>
                          </>
                        )}
                        {plan.status === 'IN_PROGRESS' && (
                          <button
                            onClick={() => handleUpdatePlanStatus(plan.id, plan.admissionId, 'COMPLETED')}
                            className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs transition-colors"
                          >
                            إكمال
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-600/20 flex items-center justify-center text-sky-400 text-lg">📋</div>
                <div>
                  <h3 className="text-lg font-bold">إنشاء خطة خروج جديدة</h3>
                  <p className="text-xs text-slate-400">اختر المريض وحدد تفاصيل الخروج</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white transition-colors text-xl">✕</button>
            </div>

            <div className="space-y-5">
              {/* Patient Selector */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300">🏥 اختر المريض المنوّم <span className="text-rose-400">*</span></label>
                {loadingInpatients ? (
                  <div className="text-center py-4 text-slate-500 text-sm">جارِ تحميل قائمة المنومين...</div>
                ) : activeInpatients.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 text-sm">لا يوجد مرضى منومين حالياً.</div>
                ) : (
                  <select
                    value={formData.admissionId}
                    onChange={(e) => setFormData({...formData, admissionId: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                  >
                    <option value="">— اختر مريضاً —</option>
                    {activeInpatients.map((inp: any) => {
                      const bed = inp.bedAssignments?.[0]?.bed;
                      const ward = bed?.ward?.name || '';
                      const admId = inp.admission?.id;
                      if (!admId) return null;
                      return (
                        <option key={inp.id} value={admId}>
                          {inp.patient?.fullName} — {inp.patient?.mrn}{ward ? ` — ${ward}` : ''}{bed ? ` / سرير ${bed.bedNumber}` : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {/* Date + Disposition Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-300">📅 تاريخ الخروج المخطط <span className="text-rose-400">*</span></label>
                  <input
                    type="date"
                    value={formData.plannedDischargeDate}
                    onChange={(e) => setFormData({...formData, plannedDischargeDate: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-600 text-slate-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-sky-500 [&::-webkit-calendar-picker-indicator]:invert"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-300">🏠 وجهة الخروج</label>
                  <select
                    value={formData.dischargeDisposition}
                    onChange={(e) => setFormData({...formData, dischargeDisposition: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="HOME">العودة للمنزل</option>
                    <option value="TRANSFER_TO_ANOTHER_FACILITY">نقل لمستشفى آخر</option>
                    <option value="REHABILITATION">مركز تأهيل</option>
                    <option value="LONG_TERM_CARE">رعاية طويلة الأمد</option>
                    <option value="HOME_HEALTH_CARE">رعاية منزلية</option>
                    <option value="HOSPICE">رعاية ملطفة</option>
                    <option value="LEFT_AGAINST_MEDICAL_ADVICE">مغادرة ضد الرأي الطبي</option>
                    <option value="EXPIRED">وفاة</option>
                  </select>
                </div>
              </div>

              {/* Medical Readiness */}
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
                <h4 className="text-sm font-semibold text-emerald-400 mb-3">✅ الجاهزية الطبية</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'medicalStability', label: 'الاستقرار الطبي' },
                    { key: 'vitalsStable', label: 'استقرار العلامات الحيوية' },
                    { key: 'painControlled', label: 'السيطرة على الألم' },
                    { key: 'medicationsReady', label: 'الأدوية جاهزة' },
                    { key: 'educationCompleted', label: 'إكمال تثقيف المريض' },
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={(formData as any)[item.key]}
                        onChange={(e) => setFormData({...formData, [item.key]: e.target.checked})}
                        className="w-4 h-4 text-emerald-500 bg-slate-700 border-slate-600 rounded focus:ring-emerald-500"
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Follow-up */}
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={formData.followUpRequired}
                    onChange={(e) => setFormData({...formData, followUpRequired: e.target.checked})}
                    className="w-4 h-4 text-sky-500 bg-slate-700 border-slate-600 rounded"
                  />
                  <span className="text-sm font-semibold text-sky-400">🔄 يتطلب متابعة بعد الخروج</span>
                </label>
                {formData.followUpRequired && (
                  <textarea
                    value={formData.followUpInstructions}
                    onChange={(e) => setFormData({...formData, followUpInstructions: e.target.value})}
                    rows={2}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                    placeholder="تعليمات المتابعة (مثل: مراجعة العيادة بعد أسبوع...)"
                  />
                )}
              </div>

              {/* Home Health */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.homeHealthServices}
                  onChange={(e) => setFormData({...formData, homeHealthServices: e.target.checked})}
                  className="w-4 h-4 text-sky-600 bg-slate-700 border-slate-600 rounded"
                />
                <span className="text-sm text-slate-300">🏡 يحتاج خدمات رعاية منزلية</span>
              </label>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-slate-300">📝 ملاحظات إضافية</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-sm"
                  placeholder="ملاحظات للفريق الطبي..."
                />
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-700">
              <button
                onClick={handleCreatePlan}
                disabled={!formData.admissionId || !formData.plannedDischargeDate}
                className="flex-1 px-4 py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-sm transition-colors"
              >
                ✅ إنشاء الخطة
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold">تفاصيل خطة الخروج</h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Patient Info */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h4 className="font-semibold mb-3">معلومات المريض</h4>
                <div className="space-y-2 text-sm">
                  <div><span className="text-slate-400">الاسم:</span> {selectedPlan.patient.fullName}</div>
                  <div><span className="text-slate-400">الرقم الطبي:</span> {selectedPlan.patient.mrn}</div>
                  <div><span className="text-slate-400">العمر:</span> {selectedPlan.patient.age} سنة</div>
                  <div><span className="text-slate-400">الجنس:</span> {selectedPlan.patient.gender}</div>
                </div>
              </div>
              
              {/* Admission Info */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h4 className="font-semibold mb-3">معلومات الإدخال</h4>
                <div className="space-y-2 text-sm">
                  <div><span className="text-slate-400">رقم الإدخال:</span> {selectedPlan.admission.id}</div>
                  <div><span className="text-slate-400">تاريخ الإدخال:</span> {format(new Date(selectedPlan.admission.admissionDate), 'dd/MM/yyyy', { locale: ar })}</div>
                  <div><span className="text-slate-400">القسم:</span> {selectedPlan.admission.department}</div>
                  <div><span className="text-slate-400">السرير:</span> {selectedPlan.admission.bed.bedNumber} - {selectedPlan.admission.bed.ward}</div>
                  <div><span className="text-slate-400">الطبيب المعالج:</span> {selectedPlan.admission.admittingDoctor}</div>
                </div>
              </div>
              
              {/* Discharge Plan */}
              <div className="bg-slate-700/50 rounded-lg p-4 md:col-span-2">
                <h4 className="font-semibold mb-3">خطة الخروج</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">تاريخ الخروج المخطط:</span>
                    <div className="font-medium">
                      {selectedPlan.plannedDischargeDate 
                        ? format(new Date(selectedPlan.plannedDischargeDate), 'dd/MM/yyyy', { locale: ar })
                        : '-'
                      }
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">الوجهة:</span>
                    <div className="font-medium">{getDispositionLabel(selectedPlan.dischargeDisposition)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">المتابعة المطلوبة:</span>
                    <div className="font-medium">{selectedPlan.followUpRequired ? 'نعم' : 'لا'}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">الرعاية المنزلية:</span>
                    <div className="font-medium">{selectedPlan.homeHealthServices ? 'نعم' : 'لا'}</div>
                  </div>
                </div>
                
                {selectedPlan.followUpInstructions && (
                  <div className="mt-4">
                    <span className="text-slate-400">تعليمات المتابعة:</span>
                    <div className="mt-1 p-2 bg-slate-600/50 rounded text-sm">
                      {selectedPlan.followUpInstructions}
                    </div>
                  </div>
                )}
                
                {selectedPlan.notes && (
                  <div className="mt-4">
                    <span className="text-slate-400">ملاحظات:</span>
                    <div className="mt-1 p-2 bg-slate-600/50 rounded text-sm">
                      {selectedPlan.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              {selectedPlan.status === 'PENDING' && (
                <button
                  onClick={() => {
                    handleUpdatePlanStatus(selectedPlan.id, selectedPlan.admissionId, 'IN_PROGRESS');
                    setShowDetailsModal(false);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg"
                >
                  بدء التنفيذ
                </button>
              )}
              {selectedPlan.status === 'IN_PROGRESS' && (
                <button
                  onClick={() => {
                    handleUpdatePlanStatus(selectedPlan.id, selectedPlan.admissionId, 'COMPLETED');
                    setShowDetailsModal(false);
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg"
                >
                  إكمال الخطة
                </button>
              )}
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
