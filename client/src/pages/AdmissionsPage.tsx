// src/pages/AdmissionsPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// Types
type BedStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "CLEANING"
  | "MAINTENANCE"
  | "BLOCKED";

type Bed = {
  id: number;
  bedNumber: string;
  status: BedStatus;
  wardName?: string;
  number?: string;
};

type Room = {
  id: number;
  roomNumber: string;
  beds: Bed[];
};

type Ward = {
  id: number;
  name: string;
  type: string | null;
  gender: string | null;
  rooms: Room[];
};

type PatientLite = {
  id: number;
  fullName: string;
  mrn: string;
};

type DoctorLite = {
  id: number;
  fullName: string;
  departmentId?: number; // [NEW] Added
};

// واجهة الاستجابة الجديدة للمرضى
type PatientsListResponse = {
  items: PatientLite[];
  meta: any;
};

export default function AdmissionsPage() {
  const navigate = useNavigate();
  const [wards, setWards] = useState<Ward[]>([]);
  const [patients, setPatients] = useState<PatientLite[]>([]);
  const [doctors, setDoctors] = useState<DoctorLite[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 1. تحميل البيانات الأساسية
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [wardsRes, patientsRes, doctorsRes] = await Promise.all([
          apiClient.get<Ward[]>("/beds/tree"),
          apiClient.get<PatientsListResponse>("/patients?limit=100"),
          apiClient.get<DoctorLite[]>("/users/doctors-list"),
        ]);
        setWards(wardsRes.data);
        setPatients(patientsRes.data.items);
        setDoctors(doctorsRes.data);
      } catch (err) {
        console.error(err);
        toast.error("حدث خطأ أثناء تحميل بيانات التنويم.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // 2. دالة التنويم (Admission Logic) - Updated to use new Admission API
  const handleAdmission = async () => {
    if (!selectedPatientId) {
      toast.warning("يجب اختيار المريض.");
      return;
    }
    if (!selectedBed) {
      toast.warning("يجب اختيار سرير متاح.");
      return;
    }
    if (!selectedDoctorId) {
      toast.warning("يجب اختيار الطبيب المسؤول.");
      return;
    }

    if (
      !confirm(
        `هل أنت متأكد من تنويم المريض في السرير ${selectedBed.number} (${selectedBed.wardName})؟`,
      )
    )
      return;

    setSubmitting(true);
    try {
      // Find selected doctor to get departmentId
      const selectedDoctor = doctors.find(d => d.id === Number(selectedDoctorId));

      // استخدام Admission API الجديد
      const admissionData = {
        patientId: Number(selectedPatientId),
        bedId: selectedBed.id,
        admittingDoctorId: Number(selectedDoctorId),
        primaryPhysicianId: Number(selectedDoctorId),
        departmentId: selectedDoctor?.departmentId || 1, // ✅ [NEW] Use doctor's department or default to 1
        admissionType: "ELECTIVE",
        priority: "MEDIUM",
        admissionReason: "دخول تنويم عبر نظام الإيواء",
        isEmergency: false,
        isolationRequired: false,
      };

      const admissionRes = await apiClient.post("/admissions", admissionData);
      
      if (admissionRes.data.id) {
        toast.success("تم إجراء الدخول وحجز السرير بنجاح.");

        // إعادة تعيين
        setSelectedBed(null);
        setSelectedPatientId("");
        setSelectedDoctorId("");

        // تحديث الخريطة
        const wardsRes = await apiClient.get<Ward[]>("/beds/tree");
        setWards(wardsRes.data);
      } else {
        throw new Error("فشل إنشاء سجل الإيواء");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || "فشل عملية التنويم.");
    } finally {
      setSubmitting(false);
    }
  };

  // 3. دالة الإيواء السريع للطوارئ
  const handleQuickEmergencyAdmission = async () => {
    if (!selectedPatientId) {
      toast.warning("يجب اختيار المريض للإيواء السريع.");
      return;
    }
    if (!selectedBed) {
      toast.warning("يجب اختيار سرير متاح للإيواء السريع.");
      return;
    }
    if (!selectedDoctorId) {
      toast.warning("يجب اختيار الطبيب للإيواء السريع.");
      return;
    }

    if (
      !confirm(
        `هل أنت متأكد من الإيواء السريع للطوارئ للمريض في السرير ${selectedBed.number} (${selectedBed.wardName})؟`,
      )
    )
      return;

    setSubmitting(true);
    try {
      // Find selected doctor to get departmentId
      const selectedDoctor = doctors.find(d => d.id === Number(selectedDoctorId));

      // استخدام Quick Admission API للطوارئ
      const quickAdmissionData = {
        patientId: Number(selectedPatientId),
        bedId: selectedBed.id,
        admittingDoctorId: Number(selectedDoctorId),
        departmentId: selectedDoctor?.departmentId || 1, // ✅ [NEW] Use doctor's department or default to 1
        admissionReason: "حالة طارئة - إيواء سريع",
        primaryDiagnosis: "حالة طارئة",
      };

      const admissionRes = await apiClient.post("/admissions/quick-admission", quickAdmissionData);
      
      if (admissionRes.data.id) {
        toast.success("تم الإيواء السريع للطوارئ بنجاح.");

        // إعادة تعيين
        setSelectedBed(null);
        setSelectedPatientId("");
        setSelectedDoctorId("");

        // تحديث الخريطة
        const wardsRes = await apiClient.get<Ward[]>("/beds/tree");
        setWards(wardsRes.data);
      } else {
        throw new Error("فشل الإيواء السريع");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || "فشل الإيواء السريع.");
    } finally {
      setSubmitting(false);
    }
  };

  const getBedColor = (status: BedStatus) => {
    switch (status) {
      case "AVAILABLE":
        return "bg-emerald-600 hover:bg-emerald-500 cursor-pointer border-emerald-500";
      case "OCCUPIED":
        return "bg-rose-900/60 border-rose-700/60 cursor-not-allowed opacity-80";
      case "CLEANING":
        return "bg-amber-600/60 border-amber-500/60 cursor-not-allowed";
      case "MAINTENANCE":
        return "bg-slate-600 border-slate-500 cursor-not-allowed";
      default:
        return "bg-slate-700 border-slate-600 cursor-not-allowed";
    }
  };

  const getBedIcon = (status: BedStatus) => {
    switch (status) {
      case "AVAILABLE":
        return "🛏️";
      case "OCCUPIED":
        return "👤";
      case "CLEANING":
        return "🧹";
      case "MAINTENANCE":
        return "🔧";
      default:
        return "❓";
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

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">نظام الإيواء</h1>
          <p className="text-sm text-slate-400">
            إدارة دخول المرضى وتخصيص الأسرة
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/admissions/advanced')}
            className="px-6 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 transition-all"
          >
            🎯 الإدارة المتقدمة
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-all"
          >
            🏠 لوحة التحكم
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">إجمالي العنابر</div>
          <div className="text-2xl font-bold">{wards.length}</div>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">المرضى المسجلين</div>
          <div className="text-2xl font-bold">{patients.length}</div>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">الأطباء المتاحون</div>
          <div className="text-2xl font-bold">{doctors.length}</div>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">الأسرة المتاحة</div>
          <div className="text-2xl font-bold text-green-400">
            {wards.reduce((sum, ward) => 
              sum + ward.rooms.reduce((roomSum, room) => 
                roomSum + room.beds.filter(bed => bed.status === 'AVAILABLE').length, 0), 0)
            }
          </div>
        </div>
      </div>

      {/* Admission Form */}
      <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold mb-4">🏥 إدخال مريض جديد</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              المريض
            </label>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">اختر المريض...</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.fullName} - {patient.mrn}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              الطبيب المسؤول
            </label>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">اختر الطبيب...</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              السرير المحدد
            </label>
            <div className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100">
              {selectedBed ? (
                <span>
                  {getBedIcon(selectedBed.status)} {selectedBed.number} - {selectedBed.wardName}
                </span>
              ) : (
                <span className="text-slate-400">لم يتم الاختيار</span>
              )}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleAdmission}
              disabled={submitting || !selectedPatientId || !selectedBed || !selectedDoctorId}
              className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all"
            >
              {submitting ? "جاري التنويم..." : "🏥 تنويم المريض"}
            </button>
            <button
              onClick={handleQuickEmergencyAdmission}
              disabled={submitting || !selectedPatientId || !selectedBed || !selectedDoctorId}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all"
            >
              {submitting ? "جاري الإيواء..." : "🚨 إيواء طارئ"}
            </button>
          </div>
        </div>
      </div>

      {/* Bed Map */}
      <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold mb-4">🗺️ خريطة الأسرة</h2>
        <div className="space-y-6">
          {wards.map((ward) => (
            <div key={ward.id} className="border border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-slate-100">
                  {ward.name} {ward.type && `(${ward.type})`}
                </h3>
                <span className="text-sm text-slate-400">
                  {ward.gender && `👥 ${ward.gender}`}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ward.rooms.map((room) => (
                  <div key={room.id} className="border border-slate-700 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">
                      غرفة {room.roomNumber}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {room.beds.map((bed) => (
                        <button
                          key={bed.id}
                          onClick={() => {
                            if (bed.status === "AVAILABLE") {
                              setSelectedBed({
                                ...bed,
                                wardName: ward.name,
                                number: bed.bedNumber
                              });
                            }
                          }}
                          className={`p-3 rounded-lg text-center transition-all ${getBedColor(
                            bed.status
                          )}`}
                          disabled={bed.status !== "AVAILABLE"}
                        >
                          <div className="text-lg mb-1">
                            {getBedIcon(bed.status)}
                          </div>
                          <div className="text-xs font-medium">
                            {bed.bedNumber}
                          </div>
                          <div className="text-xs opacity-70">
                            {bed.status === "AVAILABLE" && "متاح"}
                            {bed.status === "OCCUPIED" && "مشغول"}
                            {bed.status === "CLEANING" && "تنظيف"}
                            {bed.status === "MAINTENANCE" && "صيانة"}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-300 mb-3">🔑 مفتاح الأسرة</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-emerald-600 rounded"></div>
            <span>متاح</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-rose-900/60 rounded"></div>
            <span>مشغول</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-600/60 rounded"></div>
            <span>تنظيف</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-slate-600 rounded"></div>
            <span>صيانة</span>
          </div>
        </div>
      </div>
    </div>
  );
}
