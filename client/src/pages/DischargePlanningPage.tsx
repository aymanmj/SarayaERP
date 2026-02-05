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

  // Form state for creating new plan
  const [formData, setFormData] = useState({
    admissionId: '',
    plannedDischargeDate: '',
    dischargeDisposition: 'HOME' as const,
    followUpRequired: false,
    followUpInstructions: '',
    homeHealthServices: false,
    equipmentNeeded: [] as string[],
    notes: ''
  });

  // Load discharge plans
  useEffect(() => {
    loadDischargePlans();
  }, [activeTab, filterDepartment, searchTerm]);

  const loadDischargePlans = async () => {
    setLoading(true);
    try {
      // استخدام endpoint الموجود في admissions controller مع الأسماء الصحيحة للparameters
      const response = await apiClient.get('/admissions', {
        params: {
          status: activeTab === 'pending' ? 'ADMITTED' : activeTab === 'in-progress' ? 'IN_PROGRESS' : 'DISCHARGED',
          // استخدام departmentId بدلاً من department
          departmentId: filterDepartment ? parseInt(filterDepartment) : undefined,
          // إضافة page و limit للـ pagination
          page: 1,
          limit: 50
        }
      });
      
      // تحويل البيانات لتناسب الشكل المتوقع
      const transformedData = response.data.admissions || response.data.items || response.data || [];
      let filteredData = transformedData;
      
      // فلترة محلية بالبحث إذا كان هناك نص بحث
      if (searchTerm) {
        filteredData = transformedData.filter((item: any) => 
          item.patient?.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.patient?.mrn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.ward?.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      setPlans(filteredData.map((item: any) => ({
        id: item.id,
        admissionId: item.id,
        patient: item.patient,
        admission: {
          id: item.id,
          admissionDate: item.actualAdmissionDate || item.scheduledAdmissionDate,
          expectedDischargeDate: item.expectedDischargeDate,
          lengthOfStay: item.lengthOfStay,
          primaryDiagnosis: item.primaryDiagnosis,
          admittingDoctor: item.admittingDoctor?.fullName || 'غير محدد',
          department: item.ward?.name || 'غير محدد',
          bed: {
            bedNumber: item.bed?.bedNumber || 'غير محدد',
            ward: item.ward?.name || 'غير محدد'
          }
        },
        plannedDischargeDate: item.expectedDischargeDate,
        dischargeDisposition: 'HOME',
        followUpRequired: false,
        followUpInstructions: '',
        homeHealthServices: false,
        equipmentNeeded: [],
        instructions: {
          diet: '',
          activity: '',
          woundCare: '',
          medication: '',
          followUp: ''
        },
        status: item.admissionStatus === 'ADMITTED' ? 'PENDING' : 
               item.admissionStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'COMPLETED',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        createdBy: item.createdBy?.fullName || 'نظام',
        reviewedBy: '',
        reviewedAt: '',
        notes: item.notes
      })));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'فشل تحميل خطط التفريغ');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!formData.admissionId || !formData.plannedDischargeDate) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      // استخدام endpoint الموجود في admissions controller
      await apiClient.post(`/admissions/${formData.admissionId}/discharge-planning`, {
        plannedDischargeDate: formData.plannedDischargeDate,
        dischargeDisposition: formData.dischargeDisposition,
        followUpRequired: formData.followUpRequired,
        followUpInstructions: formData.followUpInstructions,
        homeHealthServices: formData.homeHealthServices,
        equipmentNeeded: formData.equipmentNeeded,
        notes: formData.notes
      });
      
      toast.success('تم إنشاء خطة التفريغ بنجاح');
      setShowCreateModal(false);
      setFormData({
        admissionId: '',
        plannedDischargeDate: '',
        dischargeDisposition: 'HOME',
        followUpRequired: false,
        followUpInstructions: '',
        homeHealthServices: false,
        equipmentNeeded: [],
        notes: ''
      });
      loadDischargePlans();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'فشل إنشاء خطة التفريغ');
    }
  };

  const handleUpdatePlanStatus = async (planId: number, newStatus: string) => {
    try {
      // استخدام endpoint الموجود في admissions controller
      if (newStatus === 'COMPLETED') {
        await apiClient.post(`/admissions/${planId}/discharge`, {
          dischargeDate: new Date().toISOString(),
          dischargeType: 'ROUTINE',
          notes: 'تم إكمال خطة التفريغ'
        });
      } else {
        // تحديث حالة الإدخال
        await apiClient.patch(`/admissions/${planId}`, {
          status: newStatus === 'IN_PROGRESS' ? 'ACTIVE' : 'ACTIVE'
        });
      }
      
      toast.success('تم تحديث حالة الخطة بنجاح');
      loadDischargePlans();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'فشل تحديث حالة الخطة');
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
          <h1 className="text-2xl font-bold mb-1">تخطيط التفريغ</h1>
          <p className="text-sm text-slate-400">
            إدارة خطط تفريغ المرضى وضمان انتقال آمن للرعاية
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 transition-all"
        >
          + إنشاء خطة تفريغ
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
                <th className="px-4 py-3 text-right text-sm font-medium">تاريخ التفريغ</th>
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
                    لا توجد خطط تفريغ
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
                          <button
                            onClick={() => handleUpdatePlanStatus(plan.id, 'IN_PROGRESS')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors"
                          >
                            بدء
                          </button>
                        )}
                        {plan.status === 'IN_PROGRESS' && (
                          <button
                            onClick={() => handleUpdatePlanStatus(plan.id, 'COMPLETED')}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">إنشاء خطة تفريغ جديدة</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">رقم الإدخال</label>
                <input
                  type="number"
                  value={formData.admissionId}
                  onChange={(e) => setFormData({...formData, admissionId: e.target.value})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  placeholder="أدخل رقم الإدخال"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">تاريخ التفريغ المخطط</label>
                <input
                  type="date"
                  value={formData.plannedDischargeDate}
                  onChange={(e) => setFormData({...formData, plannedDischargeDate: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:sepia-0 [&::-webkit-calendar-picker-indicator]:saturate-0 [&::-webkit-calendar-picker-indicator]:hue-rotate-180 [&::-webkit-calendar-picker-indicator]:brightness-200 [&::-webkit-calendar-picker-indicator]:contrast-100"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">وجهة التفريغ</label>
                <select
                  value={formData.dischargeDisposition}
                  onChange={(e) => setFormData({...formData, dischargeDisposition: e.target.value as any})}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                >
                  <option value="HOME">العودة للمنزل</option>
                  <option value="TRANSFER">نقل لمستشفى آخر</option>
                  <option value="REHAB">مركز تأهيل</option>
                  <option value="LTC">رعاية طويلة الأمد</option>
                  <option value="AMA">مغادرة برغبة المريض</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.followUpRequired}
                  onChange={(e) => setFormData({...formData, followUpRequired: e.target.checked})}
                  className="w-4 h-4 text-sky-600 bg-slate-700 border-slate-600 rounded"
                />
                <label className="text-sm">يتطلب متابعة</label>
              </div>
              
              {formData.followUpRequired && (
                <div>
                  <label className="block text-sm font-medium mb-2">تعليمات المتابعة</label>
                  <textarea
                    value={formData.followUpInstructions}
                    onChange={(e) => setFormData({...formData, followUpInstructions: e.target.value})}
                    rows={3}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                    placeholder="أدخل تعليمات المتابعة..."
                  />
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.homeHealthServices}
                  onChange={(e) => setFormData({...formData, homeHealthServices: e.target.checked})}
                  className="w-4 h-4 text-sky-600 bg-slate-700 border-slate-600 rounded"
                />
                <label className="text-sm">خدمات الرعاية المنزلية</label>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">ملاحظات إضافية</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                  placeholder="ملاحظات إضافية..."
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreatePlan}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg"
              >
                إنشاء الخطة
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
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
              <h3 className="text-xl font-bold">تفاصيل خطة التفريغ</h3>
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
                <h4 className="font-semibold mb-3">خطة التفريغ</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">تاريخ التفريغ المخطط:</span>
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
                    handleUpdatePlanStatus(selectedPlan.id, 'IN_PROGRESS');
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
                    handleUpdatePlanStatus(selectedPlan.id, 'COMPLETED');
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
