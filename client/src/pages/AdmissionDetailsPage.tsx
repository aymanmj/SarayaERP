import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

type AdmissionDetails = {
  id: number;
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
  bedTransfers?: Array<{
    id: number;
    requestedAt: string;
    requestedBy: string;
    fromBed: string;
    toBed?: string;
    reason: string;
    status: string;
    completedAt?: string;
  }>;
};

export default function AdmissionDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [admission, setAdmission] = useState<AdmissionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'vitals' | 'medications' | 'procedures' | 'notes' | 'transfers'>('overview');

  useEffect(() => {
    if (id) {
      loadAdmissionDetails(parseInt(id));
    }
  }, [id]);

  const loadAdmissionDetails = async (admissionId: number) => {
    try {
      const response = await apiClient.get(`/admissions/${admissionId}`);
      setAdmission(response.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل تحميل تفاصيل الإيواء");
      navigate('/admissions/advanced');
    } finally {
      setLoading(false);
    }
  };

  const handleDischargePatient = async () => {
    if (!admission || !confirm("هل أنت متأكد من تسريح المريض؟")) return;

    try {
      await apiClient.post(`/admissions/${admission.id}/discharge`, {
        dischargeDisposition: "HOME",
        followUpRequired: false,
        notes: "تسريح من صفحة التفاصيل",
      });

      toast.success("تم تسريح المريض بنجاح");
      loadAdmissionDetails(admission.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل تسريح المريض");
    }
  };

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

  if (loading) {
    return (
      <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
        </div>
      </div>
    );
  }

  if (!admission) {
    return (
      <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">لم يتم العثور على بيانات الإيواء</h2>
          <button
            onClick={() => navigate('/admissions/advanced')}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg"
          >
            العودة إلى قائمة الإيواءات
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admissions/advanced')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all"
          >
            ← العودة
          </button>
          <div>
            <h1 className="text-2xl font-bold mb-1">تفاصيل الإيواء #{admission.id}</h1>
            <p className="text-sm text-slate-400">
              {admission.patient.fullName} - {admission.patient.mrn}
            </p>
          </div>
        </div>
        {admission.admissionStatus !== 'DISCHARGED' && (
          <button
            onClick={handleDischargePatient}
            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-all"
          >
            تسريح المريض
          </button>
        )}
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">حالة الإيواء</div>
          <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(admission.admissionStatus)}`}>
            {admission.admissionStatus}
          </span>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">الأولوية</div>
          <span className={`px-3 py-1 rounded-full text-sm ${getPriorityColor(admission.priority)}`}>
            {admission.priority}
          </span>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">مدة الإقامة</div>
          <div className="text-lg font-bold">
            {admission.lengthOfStay ? `${admission.lengthOfStay} يوم` : '-'}
          </div>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">السرير</div>
          <div className="text-lg font-bold">
            {admission.bed?.bedNumber || '-'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 space-x-reverse border-b border-slate-700">
        {[
          { id: 'overview', label: 'نظرة عامة' },
          { id: 'vitals', label: 'العلامات الحيوية' },
          { id: 'medications', label: 'الأدوية' },
          { id: 'procedures', label: 'الإجراءات' },
          { id: 'notes', label: 'الملاحظات' },
          { id: 'transfers', label: 'نقلات السرير' },
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

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Patient Information */}
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-4">معلومات المريض</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-400">الاسم الكامل:</span>
                  <div className="font-medium">{admission.patient.fullName}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">الرقم الطبي:</span>
                  <div className="font-medium">{admission.patient.mrn}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">تاريخ الميلاد:</span>
                  <div className="font-medium">{new Date(admission.patient.dateOfBirth).toLocaleDateString('ar-SA')}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">الجنس:</span>
                  <div className="font-medium">{admission.patient.gender}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">رقم الهاتف:</span>
                  <div className="font-medium">{admission.patient.contactNumber}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">العنوان:</span>
                  <div className="font-medium">{admission.patient.address}</div>
                </div>
              </div>
            </div>

            {/* Admission Information */}
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-4">معلومات الإيواء</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-400">تاريخ الإدخال:</span>
                  <div className="font-medium">{new Date(admission.actualAdmissionDate).toLocaleDateString('ar-SA')}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">تاريخ التسريح المتوقع:</span>
                  <div className="font-medium">
                    {admission.expectedDischargeDate 
                      ? new Date(admission.expectedDischargeDate).toLocaleDateString('ar-SA')
                      : '-'
                    }
                  </div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">سبب الإدخال:</span>
                  <div className="font-medium">{admission.admissionReason}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">التشخيص الرئيسي:</span>
                  <div className="font-medium">{admission.primaryDiagnosis || '-'}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">الطبيب المعالج:</span>
                  <div className="font-medium">{admission.admittingDoctor.fullName}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">القسم:</span>
                  <div className="font-medium">{admission.department?.name || '-'}</div>
                </div>
              </div>
            </div>

            {/* Cost Information */}
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-4">معلومات التكلفة</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-400">التكلفة المقدرة:</span>
                  <div className="font-medium">{admission.estimatedCost ? `${admission.estimatedCost} ريال` : '-'}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-400">التكلفة الفعلية:</span>
                  <div className="font-medium">{admission.actualCost ? `${admission.actualCost} ريال` : '-'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Other tabs would be implemented similarly */}
        {activeTab !== 'overview' && (
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
            <div className="text-center py-8 text-slate-400">
              <p>محتوى {activeTab} قيد التطوير...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
