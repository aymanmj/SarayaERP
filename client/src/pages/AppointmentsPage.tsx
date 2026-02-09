// src/pages/AppointmentsPage.tsx

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ar } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Clock, Users, User, Search, Plus, Filter, X, Printer, Video, PlayCircle, FileText, CheckCircle, AlertCircle, BarChart3 } from "lucide-react";
import { apiClient } from "../api/apiClient";
import { useAuthStore } from "../stores/authStore";
import { toast } from "sonner";

// --- Types ---
type AppointmentStatus =
  | "REQUESTED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

type Appointment = {
  id: number;
  hospitalId: number;
  patientId: number;
  doctorId?: number | null;
  status: AppointmentStatus;
  reason?: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  queueNumber?: number | null;
  isEmergency?: boolean | null;
  encounterId?: number | null;
  type?: "IN_PERSON" | "ONLINE";
  meetingLink?: string | null;
  patient: {
    fullName: string;
    mrn: string;
    id: number;
  };
  doctor?: {
    fullName: string;
    id: number;
  };
};

type PatientLite = {
  id: number;
  fullName: string;
  mrn: string;
  phone: string | null;
};
type DoctorLite = { 
  id: number; 
  fullName: string;
  schedule?: {
    workDays: string | null;
    startTime: string | null;
    endTime: string | null;
    consultationPrice?: number | null;
    calculatedPrice?: number | null; // ✅ السعر المحسوب من الباك اند
  };
  doctor?: {
    id: number;
    fullName: string;
    jobRank?: string | null; // ✅ الرتبة الوظيفية
  };
};

const statusLabels: Record<AppointmentStatus, string> = {
  REQUESTED: "طلب جديد",
  CONFIRMED: "مؤكّد",
  CHECKED_IN: "جاري الكشف",
  COMPLETED: "تم الكشف",
  CANCELLED: "ملغى",
  NO_SHOW: "لم يحضر",
};

const statusClasses: Record<AppointmentStatus, string> = {
  REQUESTED: "bg-sky-800/40 text-sky-200 border border-sky-500/40",
  CONFIRMED: "bg-emerald-800/30 text-emerald-200 border border-emerald-500/40",
  CHECKED_IN: "bg-amber-800/30 text-amber-200 border border-amber-500/40",
  COMPLETED: "bg-green-800/30 text-green-200 border border-green-500/40",
  CANCELLED: "bg-rose-900/30 text-rose-200 border border-rose-500/40",
  NO_SHOW: "bg-slate-700/60 text-slate-200 border border-slate-500/40",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ar-LY", { hour: "2-digit", minute: "2-digit" });
}

function formatDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const user = useAuthStore((s) => s.user);
  const roles = user?.roles ?? [];
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [date, setDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Calendar View State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [selectedDoctor, setSelectedDoctor] = useState<number | null>(null);

  // Modals State
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showERModal, setShowERModal] = useState(false);

  // Appointment Form
  const [form, setForm] = useState({
    patientId: "",
    doctorId: "",
    reason: "",
    startTime: "09:00",
    endTime: "09:15",
    type: "IN_PERSON" as "IN_PERSON" | "ONLINE",
    isSpecial: false, // ✅ Added for special cases
  });

  // ✅ ER Form
  const [erForm, setErForm] = useState({
    patientId: "",
    complaint: "",
  });

  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientList, setShowPatientList] = useState(false); // ✅ Control dropdown visibility
  const [erPatientSearch, setErPatientSearch] = useState(""); // بحث خاص بالطوارئ

  // ✅ Clear search when modal closes
  useEffect(() => {
    if (!showAppointmentModal) {
      setPatientSearch("");
      setShowPatientList(false);
    }
  }, [showAppointmentModal]);

  const isReception = roles.includes("ADMIN") || roles.includes("RECEPTION");
  const isDoctor = roles.includes("DOCTOR") || roles.includes("ADMIN");

  // 1. Fetch Appointments
  const { data: appointments = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['appointments', date],
    queryFn: async () => {
        const res = await apiClient.get<Appointment[]>("/appointments", {
            params: { date },
        });
        return res.data;
    }
  });

  // Fetch month appointments for calendar view
  const { data: monthData = [], isLoading: monthLoading } = useQuery({
    queryKey: ['appointments-calendar', currentMonth, selectedDoctor],
    queryFn: async () => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const res = await apiClient.get<Appointment[]>("/appointments", {
        params: {
          startDate: monthStart.toISOString().split('T')[0],
          endDate: monthEnd.toISOString().split('T')[0],
          doctorId: selectedDoctor
        }
      });
      return res.data;
    },
    enabled: viewMode === 'calendar'
  });

  // Use monthData directly without useEffect
  const monthAppointments = monthData || [];

  const error = queryError ? "حدث خطأ أثناء تحميل المواعيد." : null;

  // 2. Fetch Patients List
  const { data: patientsList = [] } = useQuery({
      queryKey: ['patientsList'],
      queryFn: async () => {
          const res = await apiClient.get<any>("/patients", { params: { limit: 1000 } });
          return res.data.items || res.data; 
      },
      staleTime: 1000 * 60 * 10,
  });

  // 3. Fetch Doctors with Schedule
  const { data: doctorsList = [] } = useQuery({
      queryKey: ['doctorsWithSchedule', date], // Add date to refetch when date changes
      queryFn: async () => {
          const [docRes, schedRes] = await Promise.all([
            apiClient.get("/users/doctors-list"),
            apiClient.get("/appointments/schedules/list"),
          ]);
          
          return docRes.data.map((d: any) => ({
            ...d,
            schedule: schedRes.data.find((s: any) => s.doctorId === d.id) || null,
          }));
      },
      staleTime: 1000 * 60 * 30, // 30 min
  });

  // 4. Fetch today's appointments for real-time statistics
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ['todayAppointments', date],
    queryFn: async () => {
      const res = await apiClient.get("/appointments", {
        params: { date },
      });
      return res.data;
    },
    staleTime: 1000 * 60 * 5, // 5 min
  });

  const stats = useMemo(() => {
    const total = appointments.length;
    const completed = appointments.filter(
      (a) => a.status === "COMPLETED",
    ).length;
    const cancelled = appointments.filter(
      (a) => a.status === "CANCELLED",
    ).length;
    const noShow = appointments.filter((a) => a.status === "NO_SHOW").length;
    return { total, completed, cancelled, noShow };
  }, [appointments]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: {
      patientId: number;
      doctorId?: number;
      reason?: string;
      startTime: string;
      endTime: string;
      type: "IN_PERSON" | "ONLINE";
      isSpecial?: boolean; // Added special case flag
    }) => {
      const payload = {
        patientId: data.patientId,
        doctorId: data.doctorId,
        reason: data.reason,
        scheduledStart: `${date}T${data.startTime}:00.000Z`,
        scheduledEnd: `${date}T${data.endTime}:00.000Z`,
        type: data.type,
        isEmergency: data.isSpecial, // Map special to emergency for backend
        isSpecial: data.isSpecial,
      };
      return apiClient.post("/appointments", payload);
    },
    onSuccess: () => {
      toast.success("تم حجز الموعد بنجاح");
      setShowAppointmentModal(false);
      setForm({
        patientId: "",
        doctorId: "",
        reason: "",
        startTime: "09:00",
        endTime: "09:15",
        type: "IN_PERSON",
        isSpecial: false, // Reset special flag
      });
      setPatientSearch("");
      queryClient.invalidateQueries({ queryKey: ['appointments', date] });
      queryClient.invalidateQueries({ queryKey: ['appointments-calendar', currentMonth, selectedDoctor] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "فشل حجز الموعد");
    },
  });

  const registerERMutation = useMutation({
      mutationFn: async (payload: any) => {
          await apiClient.post("/encounters", payload);
      },
      onSuccess: () => {
        toast.success("تم تسجيل حالة الطوارئ. المريض الآن في قائمة الفرز.");
        setShowERModal(false);
        setErForm({ patientId: "", complaint: "" });
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.message || "فشل تسجيل الطوارئ");
      }
  });

  const statusMutation = useMutation({
      mutationFn: async ({ id, status }: { id: number, status: AppointmentStatus }) => {
          const res = await apiClient.patch<Appointment>(`/appointments/${id}/status`, { status });
          return res.data;
      },
      onSuccess: (data, variables) => {
         queryClient.setQueryData(['appointments', date], (old: Appointment[] | undefined) => 
            old ? old.map(a => a.id === variables.id ? data : a) : []
         );
         queryClient.invalidateQueries({ queryKey: ['appointments'] }); 
         
         if (variables.status === "CHECKED_IN" && data.encounterId) {
            toast.success("تم بدء الزيارة. جاري الانتقال للملف الطبي...");
            navigate(`/encounters/${data.encounterId}`);
         } else if (variables.status === "COMPLETED") {
             toast.success("تم إنهاء الكشف بنجاح.");
         } else {
            toast.success("تم تحديث الحالة");
         }
      },
      onError: (err: any) => {
         toast.error(err?.response?.data?.message || "فشل تحديث الحالة.");
      }
  });

  // Calendar Functions
  const generateCalendarDays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    
    return days.map(day => ({
      date: day,
      appointments: appointments.filter(apt => isSameDay(new Date(apt.scheduledStart), day)),
      isCurrentMonth: isSameMonth(day, currentMonth),
      isToday: isSameDay(day, new Date()),
      isSelected: selectedDate ? isSameDay(day, selectedDate) : false
    }));
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    const dayString = format(date, 'yyyy-MM-dd');
    setDate(dayString);
    setViewMode('table');
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const weekDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case 'REQUESTED': return 'bg-blue-500';
      case 'CONFIRMED': return 'bg-green-500';
      case 'CHECKED_IN': return 'bg-yellow-500';
      case 'COMPLETED': return 'bg-gray-500';
      case 'CANCELLED': return 'bg-red-500';
      case 'NO_SHOW': return 'bg-orange-500';
      default: return 'bg-gray-400';
    }
  };

  // Filter Patients
  const getFilteredPatients = (query: string) => {
    if (!Array.isArray(patientsList)) return [];

    if (!query) return patientsList.slice(0, 20);
    const q = query.toLowerCase();
    return patientsList
      .filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.mrn.toLowerCase().includes(q) ||
          (p.phone && p.phone.includes(q)),
      )
      .slice(0, 20);
  };

  // 1. Create Appointment Handle
  async function handleCreateAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patientId) {
      toast.warning("اختر المريض");
      return;
    }

    // Check for double booking - same patient at same time
    const conflictingAppointment = appointments.find(apt => {
      const aptStart = new Date(apt.scheduledStart);
      const aptEnd = new Date(apt.scheduledEnd);
      const newStart = new Date(`${date}T${form.startTime}:00`);
      const newEnd = new Date(`${date}T${form.endTime}:00`);
      
      return apt.patientId === Number(form.patientId) && 
             apt.status !== 'CANCELLED' && 
             apt.status !== 'COMPLETED' &&
             apt.status !== 'NO_SHOW' &&
             ((newStart >= aptStart && newStart < aptEnd) || // New start overlaps
              (newEnd > aptStart && newEnd <= aptEnd) ||   // New end overlaps
              (newStart <= aptStart && newEnd >= aptEnd));  // New appointment contains existing
    });

    if (conflictingAppointment) {
      const conflictingTime = `${formatTime(conflictingAppointment.scheduledStart)} - ${formatTime(conflictingAppointment.scheduledEnd)}`;
      toast.error(`المريض لديه موعد محجوز بالفعل في هذا الوقت (${conflictingTime}). يرجى اختيار وقت آخر أو إلغاء الموعد السابق.`);
      return;
    }

    const start = new Date(`${date}T${form.startTime}:00`).toISOString();
    const end = new Date(`${date}T${form.endTime}:00`).toISOString();

    createMutation.mutate({
        patientId: Number(form.patientId),
        doctorId: form.doctorId ? Number(form.doctorId) : undefined,
        reason: form.reason,
        startTime: form.startTime,
        endTime: form.endTime,
        type: form.type,
        isSpecial: form.isSpecial, // ✅ Add special flag
    });
  }

  // 2. ER Handle
  async function handleRegisterER(e: React.FormEvent) {
    e.preventDefault();
    if (!erForm.patientId) {
      toast.warning("اختر المريض");
      return;
    }

    registerERMutation.mutate({
        patientId: Number(erForm.patientId),
        type: "ER",
        chiefComplaint: erForm.complaint || "حالة طوارئ",
    });
  }

  // 3. Status Handles
  async function handleStartVisit(appt: Appointment) {
    if (!confirm("هل تريد بدء الكشف وإنشاء ملف حالة طبية؟")) return;
    setUpdatingId(appt.id);
    statusMutation.mutate({ id: appt.id, status: "CHECKED_IN" }, { onSettled: () => setUpdatingId(null) });
  }

  async function handleCompleteVisit(appt: Appointment) {
    if (!confirm("هل تريد إنهاء الكشف وإغلاق الموعد؟")) return;
    setUpdatingId(appt.id);
    statusMutation.mutate({ id: appt.id, status: "COMPLETED" }, { onSettled: () => setUpdatingId(null) });
  }

  async function handleChangeStatus(id: number, status: AppointmentStatus) {
    if (!confirm("هل أنت متأكد من تغيير الحالة؟")) return;
    setUpdatingId(id);
    statusMutation.mutate({ id, status }, { onSettled: () => setUpdatingId(null) });
  }

  const creating = createMutation.isPending || registerERMutation.isPending;

  // 4. Print Receipt
  async function handlePrintReceipt(apptId: number) {
    try {
      const res = await apiClient.get(`/appointments/${apptId}/print`, {
        responseType: "blob",
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `booking-${apptId}.pdf`); 
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error("فشل تحميل الإيصال.");
    }
  }

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">مكتب الاستقبال والمواعيد</h1>
          <p className="text-sm text-slate-400">
            حجز العيادات وتسجيل حالات الطوارئ.
          </p>
        </div>
        <div className="flex gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                viewMode === 'table' 
                  ? 'bg-sky-600 text-white' 
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              جدول
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                viewMode === 'calendar' 
                  ? 'bg-sky-600 text-white' 
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              تقويم
            </button>
          </div>
          
          {/* ✅ زر الطوارئ الجديد */}
          <button
            onClick={() => setShowERModal(true)}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold shadow-lg shadow-rose-500/20 animate-pulse"
          >
            🚨 تسجيل طوارئ
          </button>

          <button
            onClick={() => setShowAppointmentModal(true)}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium shadow-lg shadow-sky-500/20"
          >
            + حجز عيادة
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* Date Controls */}
        {viewMode === 'table' ? (
          <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-xl border border-slate-800 w-fit">
            <span className="text-sm text-slate-400 mr-2">
              تاريخ العرض:
            </span>
            <div className="relative max-w-sm">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full px-3 py-2.5 bg-slate-800 border border-slate-600 text-slate-100 text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 shadow-sm placeholder:text-slate-400 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:sepia-0 [&::-webkit-calendar-picker-indicator]:saturate-0 [&::-webkit-calendar-picker-indicator]:hue-rotate-180 [&::-webkit-calendar-picker-indicator]:brightness-200 [&::-webkit-calendar-picker-indicator]:contrast-100"
                placeholder="اختر التاريخ"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              ←
            </button>
            
            <h2 className="text-xl font-semibold min-w-[200px] text-center">
              {format(currentMonth, 'MMMM yyyy', { locale: ar })}
            </h2>
            
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              →
            </button>
            
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
            >
              اليوم
            </button>
            
            <select
              value={selectedDoctor || ''}
              onChange={(e) => setSelectedDoctor(e.target.value ? Number(e.target.value) : null)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">جميع الأطباء</option>
              {doctorsList.map((doctor: any) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.fullName}
                </option>
              ))}
            </select>
          </div>
        )}
        
        <div className="flex gap-2 text-xs text-slate-300">
          <span className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
            إجمالي: {stats.total}
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-900/30 border border-emerald-500/30 text-emerald-400">
            مكتملة: {stats.completed}
          </span>
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-300 bg-rose-950/40 p-3 rounded-xl border border-rose-700/50">
          {error}
        </div>
      )}

      {/* Content based on view mode */}
      {viewMode === 'table' ? (
        /* Appointment Table */
        <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="py-4 px-6 text-right font-medium">الرقم</th>
                  <th className="py-4 px-6 text-right font-medium">الوقت</th>
                  <th className="py-4 px-6 text-right font-medium">المريض</th>
                  <th className="py-4 px-6 text-right font-medium">الطبيب</th>
                  <th className="py-4 px-6 text-center font-medium min-w-[200px]">الحالة والإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                        جارِ التحميل...
                      </div>
                    </td>
                  </tr>
                ) : appointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                          <span className="text-slate-400">📅</span>
                        </div>
                        <span>لا توجد مواعيد لهذا اليوم.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  appointments.map((appt, index) => (
                    <tr key={appt.id} className={`hover:bg-slate-900/40 transition-all duration-200 ${index % 2 === 0 ? '' : 'bg-slate-900/20'}`}>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono text-sm">#{appt.queueNumber ?? appt.id}</span>
                          {appt.isEmergency && (
                            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" title="حالة خاصة"></span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sky-300 font-medium">{formatTime(appt.scheduledStart)}</span>
                          {appt.type === "ONLINE" && (
                            <span className="text-purple-400 text-xs">📹</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-200">{appt.patient?.fullName}</span>
                          <span className="text-xs text-slate-500">{appt.patient?.mrn}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-300">
                        <div className="flex items-center gap-2">
                          <span>{appt.doctor?.fullName ?? "—"}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col items-center gap-2 min-w-[200px]">
                          {/* Status Display */}
                          <div className="flex flex-col items-center gap-1">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusClasses[appt.status]}`}>
                              {statusLabels[appt.status]}
                            </span>
                            {appt.isEmergency && (
                              <span className="px-2 py-0.5 bg-amber-600/20 text-amber-300 border border-amber-600/40 rounded-full text-xs font-medium">
                                ⚠️ خاص
                              </span>
                            )}
                          </div>
                          
                          {/* Actions */}
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            {isReception && appt.status === "REQUESTED" && (
                              <button
                                onClick={() => handleChangeStatus(appt.id, "CONFIRMED")}
                                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded-md text-xs text-white font-medium transition-colors"
                              >
                                تأكيد
                              </button>
                            )}

                            {isDoctor && (appt.status === "CONFIRMED" || appt.status === "REQUESTED") && (
                              <button
                                disabled={updatingId === appt.id}
                                onClick={() => handleStartVisit(appt)}
                                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 rounded-md text-xs text-white font-medium shadow-md shadow-sky-500/20 flex items-center gap-1 transition-all disabled:opacity-50"
                              >
                                <span>▶</span>
                                ابدأ
                              </button>
                            )}

                            {isDoctor && appt.status === "CHECKED_IN" && appt.encounterId && (
                              <>
                                <button
                                  onClick={() => navigate(`/encounters/${appt.encounterId}`)}
                                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 rounded-md text-xs text-white font-medium transition-colors"
                                >
                                  ملف
                                </button>
                                <button
                                  onClick={() => handleCompleteVisit(appt)}
                                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded-md text-xs text-white font-medium transition-colors"
                                >
                                  إنهاء
                                </button>
                              </>
                            )}

                            {isReception && appt.status !== "CANCELLED" && appt.status !== "COMPLETED" && (
                              <button
                                onClick={() => handleChangeStatus(appt.id, "CANCELLED")}
                                className="px-2.5 py-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-md text-xs font-medium transition-all"
                              >
                                إلغاء
                              </button>
                            )}

                            {appt.type === "ONLINE" && appt.meetingLink && (
                              <a
                                href={appt.meetingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 bg-purple-700 hover:bg-purple-600 rounded-md text-xs text-white font-medium shadow-md shadow-purple-500/20 flex items-center gap-1 transition-colors"
                              >
                                📹
                              </a>
                            )}

                            {(appt.status === "CONFIRMED" || appt.status === "REQUESTED") && (
                              <button
                                onClick={() => handlePrintReceipt(appt.id)}
                                className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded-md text-xs text-slate-200 font-medium border border-slate-600 flex items-center gap-1 transition-colors"
                                title="طباعة تذكرة موعد"
                              >
                                🖨️
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Calendar View */
        <div className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
          {/* Week days header */}
          <div className="grid grid-cols-7 bg-slate-800/50 border-b border-slate-700">
            {weekDays.map(day => (
              <div key={day} className="p-3 text-center text-sm font-medium text-slate-300">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar days */}
          <div className="grid grid-cols-7">
            {generateCalendarDays().map((day, index) => (
              <div
                key={index}
                onClick={() => handleDayClick(day.date)}
                className={`min-h-[100px] p-2 border border-slate-700 cursor-pointer transition-colors ${
                  !day.isCurrentMonth ? 'bg-slate-800/30 text-slate-500' : 'bg-slate-900/30'
                } ${
                  day.isToday ? 'ring-2 ring-sky-500' : ''
                } ${
                  day.isSelected ? 'bg-slate-700/50' : ''
                } hover:bg-slate-700/50`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-sm font-medium ${
                    day.isToday ? 'text-sky-400' : ''
                  }`}>
                    {format(day.date, 'd')}
                  </span>
                  {day.appointments.length > 0 && (
                    <span className="text-xs bg-sky-600 px-1 rounded">
                      {day.appointments.length}
                    </span>
                  )}
                </div>
                
                <div className="space-y-1">
                  {day.appointments.slice(0, 3).map((apt, idx) => (
                    <div
                      key={apt.id}
                      className={`text-xs p-1 rounded truncate ${getStatusColor(apt.status)} text-white`}
                      title={`${apt.patient.fullName} - ${formatTime(apt.scheduledStart)}`}
                    >
                      {apt.patient.fullName.split(' ')[0]} - {formatTime(apt.scheduledStart)}
                    </div>
                  ))}
                  {day.appointments.length > 3 && (
                    <div className="text-xs text-slate-400">
                      +{day.appointments.length - 3} أخرى
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Sticky Header */}
            <div className="sticky top-0 bg-slate-950 border-b border-slate-700 p-6 pb-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-100">حجز موعد عيادة</h3>
                <button
                  onClick={() => setShowAppointmentModal(false)}
                  className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-800"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Date Selection - Custom Styled */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">
                  التاريخ
                </label>
                <div className="relative group">
                  {/* Decorative Box */}
                  <div className="flex items-center justify-between w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg group-hover:border-sky-500/50 transition-colors cursor-pointer">
                    <span className="text-slate-200 font-medium">
                      {format(new Date(date), 'eeee، d MMMM yyyy', { locale: ar })}
                    </span>
                    <Calendar className="w-5 h-5 text-sky-500/80" />
                  </div>
                  
                  {/* Hidden Overlay Input */}
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>

              {/* Patient Search */}
              <div className="space-y-2 relative">
                <label className="text-sm font-medium text-slate-300">المريض</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="ابحث عن مريض بالاسم أو الرقم الطبي..."
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setShowPatientList(true);
                      if (e.target.value === "") setForm({ ...form, patientId: "" });
                    }}
                    onFocus={() => setShowPatientList(true)}
                    // onBlur with delay to allow clicking items
                    onBlur={() => setTimeout(() => setShowPatientList(false), 200)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-10 py-3 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                  />
                </div>
                
                {/* Patient List Dropdown */}
                {showPatientList && patientSearch && (
                  <div className="absolute z-50 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto mt-1">
                    {patientsList
                      .filter((p) =>
                        p.fullName.toLowerCase().includes(patientSearch.toLowerCase()) ||
                        p.mrn.includes(patientSearch)
                      )
                      .slice(0, 10)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="cursor-pointer px-4 py-3 text-sm border-b border-slate-800 last:border-0 hover:bg-slate-800 transition-colors flex justify-between items-center group"
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevent blur before click
                            setForm({ ...form, patientId: String(p.id) });
                            setPatientSearch(p.fullName); // ✅ Update input to show name
                            setShowPatientList(false); // ✅ Close dropdown
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-200 group-hover:text-sky-400 transition-colors">{p.fullName}</span>
                            <span className="text-xs text-slate-500">
                              {p.mrn} {p.phone && `• ${p.phone}`}
                            </span>
                          </div>
                          {form.patientId === String(p.id) && (
                            <span className="text-sky-500 text-xs">تم الاختيار</span>
                          )}
                        </div>
                      ))}
                    {getFilteredPatients(patientSearch).length === 0 && (
                      <div className="p-4 text-center text-slate-500 text-sm">
                        لا توجد نتائج مطابقة
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Doctor Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">الطبيب المعالج</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                  value={form.doctorId}
                  onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                >
                  <option value="">-- اختر طبيباً --</option>
                  {doctorsList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Statistics Section */}
              {form.doctorId && (() => {
                const doc = doctorsList.find(d => String(d.id) === form.doctorId);
                if (doc?.schedule) {
                  const reservedNumbers = doc.schedule.reservedNumbers?.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n)) || [];
                  const maxPerDay = doc.schedule.maxPerDay || 20;
                  const maxEmergency = doc.schedule.maxEmergency || 5;
                  
                  // Calculate real-time statistics for selected doctor
                  const doctorTodayAppointments = todayAppointments.filter(apt => apt.doctorId === doc.id);
                  const totalBooked = doctorTodayAppointments.length;
                  const emergencyBooked = doctorTodayAppointments.filter(apt => apt.isEmergency).length;
                  const normalBooked = totalBooked - emergencyBooked;
                  
                  // Calculate used reserved numbers
                  const usedReservedNumbers = doctorTodayAppointments
                    .filter(apt => apt.isEmergency && apt.queueNumber && reservedNumbers.includes(apt.queueNumber))
                    .map(apt => apt.queueNumber);
                  const remainingReserved = reservedNumbers.filter(num => !usedReservedNumbers.includes(num)).length;
                  
                  // Calculate remaining slots dynamically
                  const remainingTotal = maxPerDay - totalBooked;
                  const remainingNormal = Math.max(0, (maxPerDay - reservedNumbers.length) - normalBooked);
                  const remainingEmergency = Math.min(maxEmergency - emergencyBooked, remainingReserved);
                  
                  // Calculate percentages
                  const totalPercentage = (totalBooked / maxPerDay) * 100;
                  const emergencyPercentage = (emergencyBooked / maxEmergency) * 100;
                  const normalPercentage = (normalBooked / (maxPerDay - reservedNumbers.length)) * 100;
                  
                  return (
                    <div className="bg-gradient-to-r from-slate-900/50 to-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-4">
                      <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        📊 إحصائيات اليوم - {doc.fullName}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-600">
                          <div className="text-xs text-slate-400 mb-1">الأرقام المحجوزة</div>
                          <div className="text-lg font-bold text-sky-400">{remainingReserved}/{reservedNumbers.length}</div>
                          <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2">
                            <div 
                              className="bg-sky-400 h-1.5 rounded-full transition-all duration-300" 
                              style={{ width: `${(remainingReserved / reservedNumbers.length) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-600">
                          <div className="text-xs text-slate-400 mb-1">الحد اليومي</div>
                          <div className="text-lg font-bold text-emerald-400">{remainingTotal}/{maxPerDay}</div>
                          <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2">
                            <div 
                              className="bg-emerald-400 h-1.5 rounded-full transition-all duration-300" 
                              style={{ width: `${100 - totalPercentage}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-600">
                          <div className="text-xs text-slate-400 mb-1">حالات الطوارئ</div>
                          <div className="text-lg font-bold text-amber-400">{remainingEmergency}/{maxEmergency}</div>
                          <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2">
                            <div 
                              className="bg-amber-400 h-1.5 rounded-full transition-all duration-300" 
                              style={{ width: `${100 - emergencyPercentage}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-600">
                          <div className="text-xs text-slate-400 mb-1">حالات عادية</div>
                          <div className="text-lg font-bold text-blue-400">{remainingNormal}/{maxPerDay - reservedNumbers.length}</div>
                          <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2">
                            <div 
                              className="bg-blue-400 h-1.5 rounded-full transition-all duration-300" 
                              style={{ width: `${100 - normalPercentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Dynamic Warnings */}
                      {remainingTotal === 0 && (
                        <div className="bg-rose-950/30 border border-rose-800 p-3 rounded-lg text-sm text-rose-300 flex items-center gap-2 animate-pulse">
                          <span>⚠️</span>
                          <span>وصلت للحد الأقصى اليومي</span>
                        </div>
                      )}
                      
                      {form.isSpecial && remainingEmergency === 0 && (
                        <div className="bg-amber-950/30 border border-amber-800 p-3 rounded-lg text-sm text-amber-300 flex items-center gap-2 animate-pulse">
                          <span>⚠️</span>
                          <span>لا توجد أرقام محجوزة متاحة للطوارئ</span>
                        </div>
                      )}
                      
                      {remainingNormal === 0 && !form.isSpecial && remainingTotal > 0 && (
                        <div className="bg-blue-950/30 border border-blue-800 p-3 rounded-lg text-sm text-blue-300 flex items-center gap-2">
                          <span>ℹ️</span>
                          <span>فقط الأرقام المحجوزة متاحة (حالات خاصة)</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Time Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">وقت البدء</label>
                  <input
                    type="time"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm({ ...form, startTime: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">وقت الانتهاء</label>
                  <input
                    type="time"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm({ ...form, endTime: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Doctor Availability */}
              {form.doctorId && (() => {
                  const doc = doctorsList.find(d => String(d.id) === form.doctorId);
                  if (doc?.schedule) {
                      let dayMsg = null;
                      if (doc.schedule.workDays) {
                          const daysMap = ["الأحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس", "الجمعة", "السبت"];
                          const allowedIndices = doc.schedule.workDays.split(',').map(Number);
                          const allowedNames = allowedIndices.map(i => daysMap[i]).join("، ");
                          
                          const selectedDateDay = new Date(date).getDay();
                          const isInvalidDay = !allowedIndices.includes(selectedDateDay);

                          dayMsg = (
                              <div className={`p-3 rounded-lg border text-sm ${isInvalidDay ? 'bg-rose-950/30 border-rose-800 text-rose-300' : 'bg-emerald-950/30 border-emerald-800 text-emerald-400'}`}>
                                  <div className="font-semibold flex items-center gap-2">
                                      {isInvalidDay ? <span>⚠️</span> : <span>✅</span>}
                                      {isInvalidDay ? 'الطبيب لا يعمل في هذا اليوم!' : 'الطبيب متاح في هذا اليوم'}
                                  </div>
                                  <div className="mt-1 text-xs opacity-90">
                                      أيام العمل: {allowedNames}
                                  </div>
                              </div>
                          );
                      }

                      const priceDisplay = doc.schedule.calculatedPrice 
                          ? Number(doc.schedule.calculatedPrice).toFixed(2) 
                          : "0.00";

                      return (
                          <div className="space-y-3">
                              {dayMsg}
                              <div className="bg-gradient-to-r from-emerald-900/20 to-emerald-800/20 border border-emerald-700 p-4 rounded-xl flex justify-between items-center">
                                <span className="text-sm text-emerald-200 font-medium flex items-center gap-2">
                                  <span>💰</span>
                                  سعر الكشف:
                                </span>
                                <span className="text-xl font-bold text-emerald-400">{priceDisplay} د.ل</span>
                              </div>
                          </div>
                      );
                  }
                  return null;
              })()}

              {/* Appointment Type */}
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                <label className="text-sm font-medium text-slate-300 block mb-3">نوع الموعد</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="apptType"
                      checked={form.type === "IN_PERSON"}
                      onChange={() => setForm({ ...form, type: "IN_PERSON" })}
                      className="w-4 h-4 accent-sky-500"
                    />
                    <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors">عيادة (In-Person)</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="apptType"
                      checked={form.type === "ONLINE"}
                      onChange={() => setForm({ ...form, type: "ONLINE" })}
                      className="w-4 h-4 accent-purple-500"
                    />
                    <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors">أونلاين (Telemedicine) 📹</span>
                  </label>
                </div>
              </div>

              {/* Special Case */}
              <div className="bg-gradient-to-r from-amber-900/20 to-amber-800/20 p-4 rounded-xl border border-amber-700">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    id="isSpecial"
                    checked={form.isSpecial}
                    onChange={(e) => setForm({ ...form, isSpecial: e.target.checked })}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-amber-300 flex items-center gap-2">
                      <span>⚠️</span>
                      حالة خاصة/طوارئ
                    </span>
                    <span className="text-xs text-amber-500 block mt-1">سيتم استخدام رقم محجوز للحالات الخاصة</span>
                  </div>
                </label>
              </div>

              {/* Reserved Numbers Display */}
              {form.doctorId && form.isSpecial && (() => {
                const doc = doctorsList.find(d => String(d.id) === form.doctorId);
                if (doc?.schedule?.reservedNumbers) {
                  const reservedNumbers = doc.schedule.reservedNumbers?.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n)) || [];
                  
                  // Calculate used reserved numbers
                  const doctorTodayAppointments = todayAppointments.filter(apt => apt.doctorId === doc.id);
                  const usedReservedNumbers = doctorTodayAppointments
                    .filter(apt => apt.isEmergency && apt.queueNumber && reservedNumbers.includes(apt.queueNumber))
                    .map(apt => apt.queueNumber);
                  
                  // Get available reserved numbers
                  const availableReservedNumbers = reservedNumbers.filter(num => !usedReservedNumbers.includes(num));
                  
                  return (
                    <div className="bg-gradient-to-r from-amber-950/30 to-amber-900/30 border border-amber-700 p-4 rounded-xl space-y-3">
                      <div className="text-sm font-medium text-amber-300 flex items-center gap-2">
                        <span>🔢</span>
                        الأرقام المحجوزة المتاحة:
                      </div>
                      
                      {/* Available Numbers Grid */}
                      <div className="grid grid-cols-5 gap-2">
                        {reservedNumbers.map((num) => {
                          const isAvailable = availableReservedNumbers.includes(num);
                          const isUsed = usedReservedNumbers.includes(num);
                          
                          return (
                            <div
                              key={num}
                              className={`p-2 rounded-lg text-center font-mono text-sm font-bold transition-all ${
                                isAvailable 
                                  ? 'bg-emerald-900/30 border border-emerald-700 text-emerald-300' 
                                  : isUsed 
                                    ? 'bg-rose-900/30 border border-rose-700 text-rose-400 opacity-50'
                                    : 'bg-slate-800 border border-slate-600 text-slate-500'
                              }`}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-lg">{num}</span>
                                {isAvailable && (
                                  <span className="text-xs text-emerald-400">متاح</span>
                                )}
                                {isUsed && (
                                  <span className="text-xs text-rose-400">محجوز</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Summary */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-emerald-900/30 border border-emerald-700 rounded"></div>
                            <span className="text-amber-400">متاح ({availableReservedNumbers.length})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-rose-900/30 border border-rose-700 rounded"></div>
                            <span className="text-amber-400">محجوز ({usedReservedNumbers.length})</span>
                          </div>
                        </div>
                        <div className="text-amber-500">
                          سيتم اختيار أول رقم متاح: {availableReservedNumbers.length > 0 ? availableReservedNumbers[0] : 'لا يوجد'}
                        </div>
                      </div>
                      
                      {availableReservedNumbers.length === 0 && (
                        <div className="bg-rose-950/30 border border-rose-800 p-3 rounded-lg text-sm text-rose-300 flex items-center gap-2 animate-pulse">
                          <span>⚠️</span>
                          <span>جميع الأرقام المحجوزة تم حجزها</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Sticky Footer */}
            <div className="sticky bottom-0 bg-slate-950 border-t border-slate-700 p-6 pt-4">
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowAppointmentModal(false)}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-sm font-medium transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleCreateAppointment}
                  disabled={creating}
                  className="px-8 py-3 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 rounded-xl text-white text-sm font-semibold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? "جاري الحفظ..." : "حفظ الموعد"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ ER Modal - مودال الطوارئ */}
      {showERModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-950 border border-rose-700/50 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl shadow-rose-900/20">
            <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2">
              🚨 تسجيل حالة طوارئ جديدة
            </h3>

            <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              <label className="text-xs text-slate-400 block mb-1">
                بحث عن مريض <span className="text-rose-400">*</span>
              </label>
              <input
                placeholder="اسم، ملف، هاتف..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-rose-500 outline-none mb-2"
                value={erPatientSearch}
                onChange={(e) => setErPatientSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-32 overflow-y-auto border border-slate-700 rounded-lg bg-slate-900">
                {getFilteredPatients(erPatientSearch).map((p) => (
                  <div
                    key={p.id}
                    onClick={() =>
                      setErForm({ ...erForm, patientId: String(p.id) })
                    }
                    className={`cursor-pointer px-3 py-2 text-sm border-b border-slate-800 last:border-0 hover:bg-slate-800
                          ${erForm.patientId === String(p.id) ? "bg-rose-700 text-white" : "text-slate-300"}
                        `}
                  >
                    <span className="font-medium">{p.fullName}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">
                الشكوى الرئيسية (اختياري)
              </label>
              <textarea
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-rose-500 outline-none"
                placeholder="مثال: ألم شديد في الصدر، ضيق تنفس..."
                value={erForm.complaint}
                onChange={(e) =>
                  setErForm({ ...erForm, complaint: e.target.value })
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowERModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleRegisterER}
                disabled={creating}
                className="px-6 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-white text-sm font-bold shadow-lg animate-pulse"
              >
                تسجيل الحالة فوراً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
