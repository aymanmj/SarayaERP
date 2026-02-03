// src/pages/AppointmentsPage.tsx

import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { useAuthStore } from "../stores/authStore";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DatePicker } from "@/components/ui/date-picker";
import { format, addDays, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ar } from 'date-fns/locale';

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
  });

  // ✅ ER Form
  const [erForm, setErForm] = useState({
    patientId: "",
    complaint: "",
  });

  const [patientSearch, setPatientSearch] = useState("");
  const [erPatientSearch, setErPatientSearch] = useState(""); // بحث خاص بالطوارئ

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
      queryKey: ['doctorsWithSchedule'],
      queryFn: async () => {
          const [docRes, schedRes] = await Promise.all([
            apiClient.get("/users/doctors-list"),
            apiClient.get("/appointments/schedules/list"),
          ]);
          
          return docRes.data.map((d: any) => ({
            ...d,
            schedule: schedRes.data.find((s: any) => s.doctorId === d.id),
          }));
      },
      staleTime: 1000 * 60 * 30, // 30 min
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
  const createAppointmentMutation = useMutation({
      mutationFn: async (payload: any) => {
          await apiClient.post<Appointment>("/appointments", payload);
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['appointments'] }); 
          setShowAppointmentModal(false);
          setForm({ ...form, patientId: "", reason: "" });
          toast.success("تم حجز الموعد");
      },
      onError: (err: any) => {
          toast.error(err.response?.data?.message || "فشل الحجز");
      }
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

    const start = new Date(`${date}T${form.startTime}:00`).toISOString();
    const end = new Date(`${date}T${form.endTime}:00`).toISOString();

    createAppointmentMutation.mutate({
        patientId: Number(form.patientId),
        doctorId: form.doctorId ? Number(form.doctorId) : undefined,
        reason: form.reason,
        scheduledStart: start,
        scheduledEnd: end,
        type: form.type,
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

  const creating = createAppointmentMutation.isPending || registerERMutation.isPending;

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
            <span className="text-sm text-slate-400 mr-2">تاريخ العرض:</span>
            <DatePicker
              date={date ? new Date(date) : undefined}
              onChange={(d) => setDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-950 border-slate-700 h-9 px-2 text-sm text-slate-200"
            />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              →
            </button>
            
            <h2 className="text-xl font-semibold min-w-[200px] text-center">
              {format(currentMonth, 'MMMM yyyy', { locale: ar })}
            </h2>
            
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              ←
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
        <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 overflow-auto p-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 text-right">الرقم</th>
                <th className="py-3 px-4 text-right">الوقت</th>
                <th className="py-3 px-4 text-right">المريض</th>
                <th className="py-3 px-4 text-right">الطبيب</th>
                <th className="py-3 px-4 text-right">الحالة</th>
                <th className="py-3 px-4 text-right w-48">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    جارِ التحميل...
                  </td>
                </tr>
              ) : appointments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    لا توجد مواعيد لهذا اليوم.
                  </td>
                </tr>
              ) : (
                appointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3 px-4 text-slate-400">
                      #{appt.queueNumber ?? appt.id}
                    </td>
                    <td className="py-3 px-4 font-mono text-sky-300">
                      {formatTime(appt.scheduledStart)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-200">
                        {appt.patient?.fullName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {appt.patient?.mrn}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {appt.doctor?.fullName ?? "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          statusClasses[appt.status]
                        }`}
                      >
                        {statusLabels[appt.status]}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        {isReception && appt.status === "REQUESTED" && (
                          <button
                            onClick={() =>
                              handleChangeStatus(appt.id, "CONFIRMED")
                            }
                            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-xs text-white"
                          >
                            تأكيد
                          </button>
                        )}

                        {isDoctor &&
                          (appt.status === "CONFIRMED" ||
                            appt.status === "REQUESTED") && (
                            <button
                              disabled={updatingId === appt.id}
                              onClick={() => handleStartVisit(appt)}
                              className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded text-xs text-white shadow-md shadow-sky-500/20 font-bold flex items-center gap-1"
                            >
                              <span>▶</span> ابدأ الكشف
                            </button>
                          )}

                        {isDoctor &&
                          appt.status === "CHECKED_IN" &&
                          appt.encounterId && (
                            <>
                              <button
                                onClick={() =>
                                  navigate(`/encounters/${appt.encounterId}`)
                                }
                                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs text-white shadow-md"
                              >
                                الملف الطبي
                              </button>
                              <button
                                onClick={() => handleCompleteVisit(appt)}
                                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-xs text-white shadow-md"
                              >
                                إنهاء
                              </button>
                            </>
                          )}

                        {isReception &&
                          appt.status !== "CANCELLED" &&
                          appt.status !== "COMPLETED" && (
                            <button
                              onClick={() =>
                                handleChangeStatus(appt.id, "CANCELLED")
                              }
                              className="text-rose-400 hover:text-rose-300 text-xs px-2"
                            >
                              إلغاء
                            </button>
                          )}

                         {/* ✅ زر دخول الاجتماع (Video Call) */}
                         {appt.type === "ONLINE" && appt.meetingLink && (
                            <a
                              href={appt.meetingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs text-white shadow-md shadow-purple-500/20 flex items-center gap-1"
                            >
                               📹 اتصال
                            </a>
                         )}

                         {/* ✅ زر طباعة الإيصال (Ticket) */}
                         {(appt.status === "CONFIRMED" || appt.status === "REQUESTED") && (
                            <button
                              onClick={() => handlePrintReceipt(appt.id)}
                              className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-200 border border-slate-600 flex items-center gap-1"
                              title="طباعة تذكرة موعد"
                            >
                              🖨️ تذكرة
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
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold">حجز موعد عيادة</h3>

            <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              <label className="text-xs text-slate-400 block mb-1">
                بحث عن مريض <span className="text-rose-400">*</span>
              </label>
              <input
                placeholder="اسم، ملف، هاتف..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none mb-2"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-32 overflow-y-auto border border-slate-700 rounded-lg bg-slate-950">
                {getFilteredPatients(patientSearch).map((p) => (
                  <div
                    key={p.id}
                    onClick={() =>
                      setForm({ ...form, patientId: String(p.id) })
                    }
                    className={`cursor-pointer px-3 py-2 text-sm border-b border-slate-800 last:border-0 hover:bg-slate-800
                          ${form.patientId === String(p.id) ? "bg-sky-600 text-white" : "text-slate-300"}
                        `}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{p.fullName}</span>
                      <span
                        className={`text-[10px] ${form.patientId === String(p.id) ? "text-sky-200" : "text-slate-500"}`}
                      >
                        {p.mrn}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">الطبيب المعالج</label>
              <select
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-sky-500 outline-none"
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

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-slate-400">وقت البدء</label>
                <input
                  type="time"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-slate-400">وقت الانتهاء</label>
                <input
                  type="time"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm({ ...form, endTime: e.target.value })
                  }
                />
              </div>
            </div>



            {/* ✅ عرض أيام العمل والتحقق منها */}
            {form.doctorId && (
                (() => {
                    const doc = doctorsList.find(d => String(d.id) === form.doctorId);
                    if (doc?.schedule) {
                        // 1. التحقق من الأيام
                        let dayMsg = null;
                        if (doc.schedule.workDays) {
                            const daysMap = ["الأحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس", "الجمعة", "السبت"];
                            const allowedIndices = doc.schedule.workDays.split(',').map(Number);
                            const allowedNames = allowedIndices.map(i => daysMap[i]).join("، ");
                            
                            const selectedDateDay = new Date(date).getDay();
                            const isInvalidDay = !allowedIndices.includes(selectedDateDay);

                            dayMsg = (
                                <div className={`text-xs p-2 rounded-lg border mb-2 ${isInvalidDay ? 'bg-rose-950/30 border-rose-800 text-rose-300' : 'bg-emerald-950/30 border-emerald-800 text-emerald-400'}`}>
                                    <div className="font-bold flex items-center gap-1">
                                        {isInvalidDay ? '⚠️ تنبيه: الطبيب لا يعمل في هذا اليوم!' : '✅ الطبيب متاح في هذا اليوم'}
                                    </div>
                                    <div className="mt-1 opacity-80">
                                        <span>أيام العمل: {allowedNames}</span>
                                    </div>
                                </div>
                            );
                        }

                        // 2. عرض السعر الفعلي من الباك إند
                        const priceDisplay = doc.schedule.calculatedPrice 
                            ? Number(doc.schedule.calculatedPrice).toFixed(2) 
                            : "0.00";

                        return (
                            <div>
                                {dayMsg}
                                <div className="bg-emerald-900/20 border border-emerald-800 p-3 rounded-xl flex justify-between items-center">
                                  <span className="text-sm text-emerald-200">💰 سعر الكشف:</span>
                                  <span className="text-lg font-bold text-emerald-400">{priceDisplay} د.ل</span>
                                </div>
                            </div>
                        );
                    }
                    return null;
                })()
            )}

            {/* ✅ نوع الموعد (Type) */}
            <div className="flex gap-4 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
               <label className="flex items-center gap-2 cursor-pointer">
                 <input
                   type="radio"
                   name="apptType"
                   checked={form.type === "IN_PERSON"}
                   onChange={() => setForm({ ...form, type: "IN_PERSON" })}
                   className="accent-sky-500"
                 />
                 <span className="text-sm text-slate-300">عيادة (In-Person)</span>
               </label>
               <label className="flex items-center gap-2 cursor-pointer">
                 <input
                   type="radio"
                   name="apptType"
                   checked={form.type === "ONLINE"}
                   onChange={() => setForm({ ...form, type: "ONLINE" })}
                   className="accent-purple-500"
                 />
                 <span className="text-sm text-purple-300">أونلاين (Telemedicine) 📹</span>
               </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowAppointmentModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm hover:bg-slate-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreateAppointment}
                disabled={creating}
                className="px-6 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-white text-sm font-semibold shadow-lg"
              >
                حفظ الموعد
              </button>
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
