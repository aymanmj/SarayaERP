// src/pages/AppointmentsPage.tsx

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ar } from "date-fns/locale";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Hash,
  Info,
  List,
  Play,
  Plus,
  Printer,
  Search,
  Siren,
  UserX,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { apiClient } from "../api/apiClient";
import { useAuthStore } from "../stores/authStore";
import { toast } from "sonner";
import { formatMoney } from "../utils/money";
import {
  SarayaFilterSelect,
  SarayaKpiCard,
  SarayaLtrBadge,
  SarayaPageHeader,
} from "../components/ui/SarayaPrimitives";

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PatientLite = {
  id: number;
  fullName: string;
  mrn: string;
  phone: string | null;
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type DoctorLite = {
  id: number;
  fullName: string;
  schedule?: {
    workDays: string | null;
    startTime: string | null;
    endTime: string | null;
    consultationPrice?: number | null;
    calculatedPrice?: number | null;
  };
  doctor?: {
    id: number;
    fullName: string;
    jobRank?: string | null;
  };
};

const statusLabelsKeys: Record<AppointmentStatus, string> = {
  REQUESTED: "statusRequested",
  CONFIRMED: "statusConfirmed",
  CHECKED_IN: "statusCheckedIn",
  COMPLETED: "statusCompleted",
  CANCELLED: "statusCancelled",
  NO_SHOW: "statusNoShow",
};

const statusClasses: Record<AppointmentStatus, string> = {
  REQUESTED: "bg-sky-900/30 text-sky-400 border border-sky-500/30",
  CONFIRMED: "bg-emerald-900/30 text-emerald-400 border border-emerald-500/30",
  CHECKED_IN: "bg-amber-900/30 text-amber-400 border border-amber-500/30",
  COMPLETED: "bg-green-900/30 text-green-400 border border-green-500/30",
  CANCELLED: "bg-rose-900/30 text-rose-400 border border-rose-500/30",
  NO_SHOW: "bg-slate-800 text-slate-300 border border-slate-600/40",
};

function formatTimeOuter(iso: string, isRtl = true) {
  const d = new Date(iso);
  return d.toLocaleTimeString(isRtl ? "ar-LY" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const formatTime = (iso: string) => formatTimeOuter(iso, isRtl);
  const user = useAuthStore((s) => s.user);
  const roles = user?.roles ?? [];
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [date, setDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Calendar View State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [mainTab, setMainTab] = useState<"appointments" | "ai_followups">("appointments");
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
    isSpecial: false,
  });

  // ER Form
  const [erForm, setErForm] = useState({
    patientId: "",
    complaint: "",
  });

  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientList, setShowPatientList] = useState(false);
  const [erPatientSearch, setErPatientSearch] = useState("");

  useEffect(() => {
    if (!showAppointmentModal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPatientSearch("");
      setShowPatientList(false);
    }
  }, [showAppointmentModal]);

  const isReception = roles.includes("ADMIN") || roles.includes("RECEPTION");
  const isDoctor = roles.includes("DOCTOR") || roles.includes("ADMIN");

  // 1. Fetch Appointments
  const { data: appointments = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ["appointments", date],
    queryFn: async () => {
      const res = await apiClient.get<Appointment[]>("/appointments", {
        params: { date },
      });
      return res.data;
    },
  });

  // Fetch month appointments for calendar view
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: monthData = [], isLoading: monthLoading } = useQuery({
    queryKey: ["appointments-calendar", currentMonth, selectedDoctor],
    queryFn: async () => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const res = await apiClient.get<Appointment[]>("/appointments", {
        params: {
          startDate: monthStart.toISOString().split("T")[0],
          endDate: monthEnd.toISOString().split("T")[0],
          doctorId: selectedDoctor,
        },
      });
      return res.data;
    },
    enabled: viewMode === "calendar",
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const monthAppointments = monthData || [];

  const error = queryError ? t("appointments.queryError", "حدث خطأ أثناء تحميل المواعيد.") : null;

  // 2. Fetch Patients List
  const { data: patientsList = [] } = useQuery({
    queryKey: ["patientsList"],
    queryFn: async () => {
      const res = await apiClient.get<any>("/patients", { params: { limit: 1000 } });
      return res.data.items || res.data;
    },
    staleTime: 1000 * 60 * 10,
  });

  // 3. Fetch Doctors with Schedule
  const { data: doctorsList = [] } = useQuery({
    queryKey: ["doctorsWithSchedule", date],
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
    staleTime: 1000 * 60 * 30,
  });

  // 4. Fetch today's appointments for real-time statistics
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ["todayAppointments", date],
    queryFn: async () => {
      const res = await apiClient.get("/appointments", {
        params: { date },
      });
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  // 5. Fetch Notifications for AI Follow-ups
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await apiClient.get<any[]>("/notifications");
      return res.data;
    },
    refetchInterval: 60000,
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const aiFollowUps = useMemo(() => {
    return notifications.filter((n) => n.type === "AI_FOLLOW_UP" && !n.isRead);
  }, [notifications]);

  const stats = useMemo(() => {
    const total = appointments.length;
    const completed = appointments.filter((a) => a.status === "COMPLETED").length;
    const cancelled = appointments.filter((a) => a.status === "CANCELLED").length;
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
      isSpecial?: boolean;
    }) => {
      const payload = {
        patientId: data.patientId,
        doctorId: data.doctorId,
        reason: data.reason,
        scheduledStart: `${date}T${data.startTime}:00.000Z`,
        scheduledEnd: `${date}T${data.endTime}:00.000Z`,
        type: data.type,
        isEmergency: data.isSpecial,
        isSpecial: data.isSpecial,
      };
      return apiClient.post("/appointments", payload);
    },
    onSuccess: () => {
      toast.success(t("appointments.successAdd"));
      setShowAppointmentModal(false);
      setForm({
        patientId: "",
        doctorId: "",
        reason: "",
        startTime: "09:00",
        endTime: "09:15",
        type: "IN_PERSON",
        isSpecial: false,
      });
      setPatientSearch("");
      queryClient.invalidateQueries({ queryKey: ["appointments", date] });
      queryClient.invalidateQueries({ queryKey: ["appointments-calendar", currentMonth, selectedDoctor] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || t("appointments.failedAdd", "فشل حجز الموعد"));
    },
  });

  const registerERMutation = useMutation({
    mutationFn: async (payload: any) => {
      await apiClient.post("/encounters", payload);
    },
    onSuccess: () => {
      toast.success(t("appointments.successER", "تم تسجيل حالة الطوارئ. المريض الآن في قائمة الفرز."));
      setShowERModal(false);
      setErForm({ patientId: "", complaint: "" });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || t("appointments.failedER", "فشل تسجيل الطوارئ"));
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: AppointmentStatus }) => {
      const res = await apiClient.patch<Appointment>(`/appointments/${id}/status`, { status });
      return res.data;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["appointments", date], (old: Appointment[] | undefined) =>
        old ? old.map((a) => (a.id === variables.id ? data : a)) : [],
      );
      queryClient.invalidateQueries({ queryKey: ["appointments"] });

      if (variables.status === "CHECKED_IN" && data.encounterId) {
        toast.success(t("appointments.visitStartedToast"));
        navigate(`/encounters/${data.encounterId}`);
      } else if (variables.status === "COMPLETED") {
        toast.success(t("appointments.visitEndedToast"));
      } else {
        toast.success(t("appointments.statusUpdatedToast"));
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || t("appointments.statusUpdateFailedToast"));
    },
  });

  // Calendar Functions
  const generateCalendarDays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return days.map((day) => ({
      date: day,
      appointments: appointments.filter((apt) => isSameDay(new Date(apt.scheduledStart), day)),
      isCurrentMonth: isSameMonth(day, currentMonth),
      isToday: isSameDay(day, new Date()),
      isSelected: selectedDate ? isSameDay(day, selectedDate) : false,
    }));
  };

  const handleDayClick = (d: Date) => {
    setSelectedDate(d);
    const dayString = format(d, "yyyy-MM-dd");
    setDate(dayString);
    setViewMode("table");
  };

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth((prev) => (direction === "prev" ? subMonths(prev, 1) : addMonths(prev, 1)));
  };

  const weekDays = [
    t("appointments.calendar.sun", "الأحد"),
    t("appointments.calendar.mon", "الاثنين"),
    t("appointments.calendar.tue", "الثلاثاء"),
    t("appointments.calendar.wed", "الأربعاء"),
    t("appointments.calendar.thu", "الخميس"),
    t("appointments.calendar.fri", "الجمعة"),
    t("appointments.calendar.sat", "السبت"),
  ];

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case "REQUESTED":
        return "bg-sky-600";
      case "CONFIRMED":
        return "bg-emerald-600";
      case "CHECKED_IN":
        return "bg-amber-600";
      case "COMPLETED":
        return "bg-slate-600";
      case "CANCELLED":
        return "bg-rose-600";
      case "NO_SHOW":
        return "bg-orange-600";
      default:
        return "bg-slate-500";
    }
  };

  // Filter Patients
  const getFilteredPatients = (query: string) => {
    if (!Array.isArray(patientsList)) return [];

    if (!query) return patientsList.slice(0, 20);
    const q = query.toLowerCase();
    return patientsList
      .filter(
        (p: any) =>
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

    const conflictingAppointment = appointments.find((apt) => {
      const aptStart = new Date(apt.scheduledStart);
      const aptEnd = new Date(apt.scheduledEnd);
      const newStart = new Date(`${date}T${form.startTime}:00`);
      const newEnd = new Date(`${date}T${form.endTime}:00`);

      return (
        apt.patientId === Number(form.patientId) &&
        apt.status !== "CANCELLED" &&
        apt.status !== "COMPLETED" &&
        apt.status !== "NO_SHOW" &&
        ((newStart >= aptStart && newStart < aptEnd) ||
          (newEnd > aptStart && newEnd <= aptEnd) ||
          (newStart <= aptStart && newEnd >= aptEnd))
      );
    });

    if (conflictingAppointment) {
      const conflictingTime = `${formatTime(conflictingAppointment.scheduledStart)} - ${formatTime(conflictingAppointment.scheduledEnd)}`;
      toast.error(
        t(
          "appointments.error.doubleBooking",
          "المريض لديه موعد محجوز بالفعل في هذا الوقت ({{time}}). يرجى اختيار وقت آخر أو إلغاء الموعد السابق.",
          { time: conflictingTime },
        ),
      );
      return;
    }

    createMutation.mutate({
      patientId: Number(form.patientId),
      doctorId: form.doctorId ? Number(form.doctorId) : undefined,
      reason: form.reason,
      startTime: form.startTime,
      endTime: form.endTime,
      type: form.type,
      isSpecial: form.isSpecial,
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
      chiefComplaint: erForm.complaint || t("appointments.er.emergencyDefaultComplaint", "حالة طوارئ"),
    });
  }

  // 3. Status Handles
  async function handleStartVisit(appt: Appointment) {
    if (!confirm(t("appointments.confirmStartVisit"))) return;
    setUpdatingId(appt.id);
    statusMutation.mutate(
      { id: appt.id, status: "CHECKED_IN" },
      { onSettled: () => setUpdatingId(null) },
    );
  }

  async function handleCompleteVisit(appt: Appointment) {
    if (!confirm(t("appointments.confirmCompleteVisit"))) return;
    setUpdatingId(appt.id);
    statusMutation.mutate(
      { id: appt.id, status: "COMPLETED" },
      { onSettled: () => setUpdatingId(null) },
    );
  }

  async function handleChangeStatus(id: number, status: AppointmentStatus) {
    if (!confirm(t("appointments.confirmChangeStatus"))) return;
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

      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `booking-${apptId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("appointments.receiptLoadFailedToast"));
    }
  }

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-5"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <SarayaPageHeader
        icon={<Calendar className="w-5 h-5" />}
        title={t("appointments.title")}
        subtitle={t("appointments.subTitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="inline-flex bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === "table"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                {t("appointments.tableView")}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === "calendar"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                {t("appointments.calendarView")}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowERModal(true)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs md:text-sm font-bold shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Siren className="w-4 h-4" />
              {t("appointments.erRegister")}
            </button>

            <button
              type="button"
              onClick={() => setShowAppointmentModal(true)}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs md:text-sm font-bold shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("appointments.bookClinic")}
            </button>
          </div>
        }
      />

      {/* 4 KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SarayaKpiCard
          label={t("appointments.totalLabel")}
          value={stats.total}
          accent="sky"
          icon={<CalendarDays className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label={t("appointments.completedLabel")}
          value={stats.completed}
          accent="emerald"
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label={t("appointments.statusCancelled")}
          value={stats.cancelled}
          accent="rose"
          icon={<XCircle className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label={t("appointments.statusNoShow")}
          value={stats.noShow}
          accent="amber"
          icon={<UserX className="w-5 h-5" />}
        />
      </div>

      {/* Filter / Date Controls Bar */}
      <div className="saraya-card rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
        {viewMode === "table" ? (
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400">
              {t("appointments.displayDateLabel")}
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              dir="ltr"
              className="px-3 py-2 bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-xl tabular-nums focus:border-sky-500 outline-none"
              placeholder={t("appointments.selectDatePlaceholder", "اختر التاريخ")}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 w-full justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigateMonth("prev")}
                className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-300 transition-colors"
              >
                {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>

              <h2 className="text-base font-bold min-w-[160px] text-center text-slate-100">
                {format(currentMonth, "MMMM yyyy", { locale: isRtl ? ar : undefined })}
              </h2>

              <button
                type="button"
                onClick={() => navigateMonth("next")}
                className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-300 transition-colors"
              >
                {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setCurrentMonth(new Date())}
                className="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition-colors"
              >
                {t("appointments.today")}
              </button>
            </div>

            <div className="min-w-[220px]">
              <SarayaFilterSelect
                value={selectedDoctor ? String(selectedDoctor) : ""}
                onChange={(val) => setSelectedDoctor(val ? Number(val) : null)}
                placeholder={t("appointments.allDoctors")}
                allLabel={t("appointments.allDoctors")}
                options={doctorsList.map((doctor: any) => ({
                  value: String(doctor.id),
                  label: doctor.fullName,
                }))}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-rose-300 bg-rose-950/40 p-3 rounded-xl border border-rose-700/50 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Content based on view mode */}
      {viewMode === "table" ? (
        /* Appointment Table */
        <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 saraya-card overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className={`w-full text-sm ${isRtl ? "text-right" : "text-left"}`}>
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 sticky top-0 z-10 text-xs">
                <tr>
                  <th className={`py-3.5 px-5 ${isRtl ? "text-right" : "text-left"} font-semibold`}>
                    {t("appointments.tableQueue")}
                  </th>
                  <th className={`py-3.5 px-5 ${isRtl ? "text-right" : "text-left"} font-semibold`}>
                    {t("appointments.tableTime")}
                  </th>
                  <th className={`py-3.5 px-5 ${isRtl ? "text-right" : "text-left"} font-semibold`}>
                    {t("appointments.tablePatient")}
                  </th>
                  <th className={`py-3.5 px-5 ${isRtl ? "text-right" : "text-left"} font-semibold`}>
                    {t("appointments.tableDoctor")}
                  </th>
                  <th className="py-3.5 px-5 text-center font-semibold min-w-[200px]">
                    {t("appointments.tableStatusActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                        {t("common.loading")}
                      </div>
                    </td>
                  </tr>
                ) : appointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2.5">
                        <div className="w-12 h-12 rounded-2xl bg-slate-800/70 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-slate-400" />
                        </div>
                        <span>{t("appointments.noAppointments", "لا توجد مواعيد لهذا اليوم.")}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  appointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <SarayaLtrBadge className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-400 border border-sky-500/25 text-xs font-semibold">
                            #{appt.queueNumber ?? appt.id}
                          </SarayaLtrBadge>
                          {appt.isEmergency && (
                            <span
                              className="w-2 h-2 bg-amber-500 rounded-full"
                              title="حالة خاصة"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <span dir="ltr" className="font-mono tabular-nums text-sky-400 font-semibold">
                            {formatTime(appt.scheduledStart)}
                          </span>
                          {appt.type === "ONLINE" && (
                            <Video className="w-4 h-4 text-purple-400" />
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-semibold text-slate-100">
                            {appt.patient?.fullName}
                          </span>
                          {appt.patient?.mrn && (
                            <SarayaLtrBadge className="text-[11px] text-slate-400">
                              {appt.patient.mrn}
                            </SarayaLtrBadge>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-slate-300">
                        <span>{appt.doctor?.fullName ?? "—"}</span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex flex-col items-center gap-2 min-w-[200px]">
                          {/* Status Display */}
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusClasses[appt.status]}`}
                            >
                              {t("appointments." + statusLabelsKeys[appt.status])}
                            </span>
                            {appt.isEmergency && (
                              <span className="px-2 py-0.5 bg-amber-900/30 text-amber-400 border border-amber-500/30 rounded-full text-[11px] font-semibold inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {t("appointments.specialBadge", "خاص")}
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            {isReception && appt.status === "REQUESTED" && (
                              <button
                                onClick={() => handleChangeStatus(appt.id, "CONFIRMED")}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs text-white font-semibold transition-colors"
                              >
                                {t("appointments.confirmBtn")}
                              </button>
                            )}

                            {isDoctor && (appt.status === "CONFIRMED" || appt.status === "REQUESTED") && (
                              <button
                                disabled={updatingId === appt.id}
                                onClick={() => handleStartVisit(appt)}
                                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs text-white font-semibold shadow-sm inline-flex items-center gap-1 transition-all disabled:opacity-50"
                              >
                                <Play className="w-3 h-3" />
                                {t("appointments.startBtn")}
                              </button>
                            )}

                            {isDoctor && appt.status === "CHECKED_IN" && appt.encounterId && (
                              <>
                                <button
                                  onClick={() => navigate(`/encounters/${appt.encounterId}`)}
                                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs text-white font-semibold inline-flex items-center gap-1 transition-colors"
                                >
                                  <FileText className="w-3 h-3" />
                                  {t("appointments.fileBtn")}
                                </button>
                                <button
                                  onClick={() => handleCompleteVisit(appt)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs text-white font-semibold transition-colors"
                                >
                                  {t("appointments.endBtn")}
                                </button>
                              </>
                            )}

                            {isReception &&
                              appt.status !== "CANCELLED" &&
                              appt.status !== "COMPLETED" && (
                                <button
                                  onClick={() => handleChangeStatus(appt.id, "CANCELLED")}
                                  className="px-2.5 py-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg text-xs font-semibold transition-all"
                                >
                                  {t("appointments.cancelBtn")}
                                </button>
                              )}

                            {appt.type === "ONLINE" && appt.meetingLink && (
                              <a
                                href={appt.meetingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs text-white font-semibold inline-flex items-center gap-1 transition-colors"
                              >
                                <Video className="w-3.5 h-3.5" />
                              </a>
                            )}

                            {(appt.status === "CONFIRMED" || appt.status === "REQUESTED") && (
                              <button
                                onClick={() => handlePrintReceipt(appt.id)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-200 font-medium border border-slate-700 inline-flex items-center gap-1 transition-colors"
                                title={t("appointments.printTicketTooltip")}
                              >
                                <Printer className="w-3.5 h-3.5" />
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 saraya-card overflow-hidden">
          {/* Week days header */}
          <div className="grid grid-cols-7 bg-slate-950/60 border-b border-slate-800">
            {weekDays.map((day) => (
              <div key={day} className="p-3 text-center text-xs font-semibold text-slate-400">
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
                className={`min-h-[105px] p-2 border border-slate-800 cursor-pointer transition-colors ${
                  !day.isCurrentMonth ? "bg-slate-950/50 text-slate-500" : "bg-slate-900/40"
                } ${day.isToday ? "ring-2 ring-inset ring-sky-500" : ""} ${
                  day.isSelected ? "bg-sky-950/30" : ""
                } hover:bg-slate-800/40`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      day.isToday ? "text-sky-400" : "text-slate-200"
                    }`}
                  >
                    {format(day.date, "d")}
                  </span>
                  {day.appointments.length > 0 && (
                    <span className="text-[11px] font-bold bg-sky-600 text-white px-1.5 py-0.5 rounded-md tabular-nums">
                      {day.appointments.length}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  {day.appointments.slice(0, 3).map((apt) => (
                    <div
                      key={apt.id}
                      className={`text-[11px] px-1.5 py-0.5 rounded truncate ${getStatusColor(apt.status)} text-white`}
                      title={`${apt.patient.fullName} - ${formatTime(apt.scheduledStart)}`}
                    >
                      {apt.patient.fullName.split(" ")[0]} - {formatTime(apt.scheduledStart)}
                    </div>
                  ))}
                  {day.appointments.length > 3 && (
                    <div className="text-[11px] text-slate-400 font-medium">
                      +{day.appointments.length - 3} {t("appointments.other", "أخرى")}
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
            <div className="sticky top-0 bg-slate-950 border-b border-slate-800 p-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-100">
                {t("appointments.newAppointmentTitle")}
              </h3>
              <button
                type="button"
                onClick={() => setShowAppointmentModal(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
              {/* Date Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">
                  {t("appointments.dateLabel", "التاريخ")}
                </label>
                <div className="relative group">
                  <div className="flex items-center justify-between w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl group-hover:border-sky-500/50 transition-colors cursor-pointer">
                    <span className="text-slate-100 font-medium">
                      {format(new Date(date), "eeee، d MMMM yyyy", { locale: ar })}
                    </span>
                    <Calendar className="w-5 h-5 text-sky-400" />
                  </div>
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
                <label className="text-sm font-medium text-slate-300">
                  {t("appointments.tablePatient")}
                </label>
                <div className="relative">
                  <Search
                    className={`absolute ${
                      isRtl ? "right-3.5" : "left-3.5"
                    } top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none`}
                  />
                  <input
                    type="text"
                    placeholder={t("appointments.searchPatientPlaceholder")}
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      setShowPatientList(true);
                      if (e.target.value === "") setForm({ ...form, patientId: "" });
                    }}
                    onFocus={() => setShowPatientList(true)}
                    onBlur={() => setTimeout(() => setShowPatientList(false), 200)}
                    className={`w-full bg-slate-900 border border-slate-700 rounded-xl py-3 text-sm focus:border-sky-500 outline-none transition-all ${
                      isRtl ? "pr-10 pl-4" : "pl-10 pr-4"
                    }`}
                  />
                </div>

                {/* Patient List Dropdown */}
                {showPatientList && patientSearch && (
                  <div className="absolute z-50 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto mt-1">
                    {patientsList
                      .filter(
                        (p: any) =>
                          p.fullName.toLowerCase().includes(patientSearch.toLowerCase()) ||
                          p.mrn.includes(patientSearch) ||
                          (p.phone && p.phone.includes(patientSearch)),
                      )
                      .slice(0, 10)
                      .map((p: any) => (
                        <div
                          key={p.id}
                          className="cursor-pointer px-4 py-3 text-sm border-b border-slate-800 last:border-0 hover:bg-slate-800 transition-colors flex justify-between items-center group"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setForm({ ...form, patientId: String(p.id) });
                            setPatientSearch(p.fullName);
                            setShowPatientList(false);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-200 group-hover:text-sky-400 transition-colors">
                              {p.fullName}
                            </span>
                            <span className="text-xs text-slate-500" dir="ltr">
                              {p.mrn} {p.phone && `• ${p.phone}`}
                            </span>
                          </div>
                          {form.patientId === String(p.id) && (
                            <span className="text-sky-500 text-xs font-semibold">
                              {t("appointments.selected")}
                            </span>
                          )}
                        </div>
                      ))}
                    {getFilteredPatients(patientSearch).length === 0 && (
                      <div className="p-4 text-center text-slate-500 text-sm">
                        {t("appointments.noMatches")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Doctor Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">
                  {t("appointments.tableDoctor")}
                </label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-sky-500 outline-none transition-all"
                  value={form.doctorId}
                  onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                >
                  <option value="">{t("appointments.selectDoctorPlaceholder")}</option>
                  {doctorsList.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Statistics Section */}
              {form.doctorId &&
                (() => {
                  const doc = doctorsList.find((d: any) => String(d.id) === form.doctorId);
                  if (doc?.schedule) {
                    const reservedNumbers: number[] =
                      doc.schedule.reservedNumbers
                        ?.split(",")
                        .map((n: string) => parseInt(n.trim()))
                        .filter((n: number) => !isNaN(n)) || [];
                    const maxPerDay = doc.schedule.maxPerDay || 20;
                    const maxEmergency = doc.schedule.maxEmergency || 5;

                    const doctorTodayAppointments = todayAppointments.filter(
                      (apt: any) => apt.doctorId === doc.id,
                    );
                    const totalBooked = doctorTodayAppointments.length;
                    const emergencyBooked = doctorTodayAppointments.filter(
                      (apt: any) => apt.isEmergency,
                    ).length;
                    const normalBooked = totalBooked - emergencyBooked;

                    const usedReservedNumbers = doctorTodayAppointments
                      .filter(
                        (apt: any) =>
                          apt.isEmergency &&
                          apt.queueNumber &&
                          reservedNumbers.includes(apt.queueNumber),
                      )
                      .map((apt: any) => apt.queueNumber);
                    const remainingReserved = reservedNumbers.filter(
                      (num: number) => !usedReservedNumbers.includes(num),
                    ).length;

                    const remainingTotal = maxPerDay - totalBooked;
                    const remainingNormal = Math.max(
                      0,
                      maxPerDay - reservedNumbers.length - normalBooked,
                    );
                    const remainingEmergency = Math.min(
                      maxEmergency - emergencyBooked,
                      remainingReserved,
                    );

                    const totalPercentage = (totalBooked / maxPerDay) * 100;
                    const emergencyPercentage = (emergencyBooked / maxEmergency) * 100;
                    const normalPercentage =
                      (normalBooked / (maxPerDay - reservedNumbers.length)) * 100;

                    return (
                      <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-700 space-y-4">
                        <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-sky-400" />
                          <span>
                            {t("appointments.stats.todayStats")} - {doc.fullName}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                            <div className="text-xs text-slate-400 mb-1">
                              {t("appointments.stats.reservedNumbers")}
                            </div>
                            <div className="text-lg font-bold text-sky-400 tabular-nums">
                              {remainingReserved}/{reservedNumbers.length}
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
                              <div
                                className="bg-sky-500 h-1.5 rounded-full transition-all duration-300"
                                style={{
                                  width: `${
                                    reservedNumbers.length
                                      ? (remainingReserved / reservedNumbers.length) * 100
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                            <div className="text-xs text-slate-400 mb-1">
                              {t("appointments.stats.dailyLimit")}
                            </div>
                            <div className="text-lg font-bold text-emerald-400 tabular-nums">
                              {remainingTotal}/{maxPerDay}
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
                              <div
                                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${Math.max(0, 100 - totalPercentage)}%` }}
                              />
                            </div>
                          </div>
                          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                            <div className="text-xs text-slate-400 mb-1">
                              {t("appointments.stats.emergencyCases")}
                            </div>
                            <div className="text-lg font-bold text-amber-400 tabular-nums">
                              {remainingEmergency}/{maxEmergency}
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
                              <div
                                className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${Math.max(0, 100 - emergencyPercentage)}%` }}
                              />
                            </div>
                          </div>
                          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                            <div className="text-xs text-slate-400 mb-1">
                              {t("appointments.stats.normalCases")}
                            </div>
                            <div className="text-lg font-bold text-blue-400 tabular-nums">
                              {remainingNormal}/{maxPerDay - reservedNumbers.length}
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
                              <div
                                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${Math.max(0, 100 - normalPercentage)}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Dynamic Warnings */}
                        {remainingTotal === 0 && (
                          <div className="bg-rose-950/30 border border-rose-800 p-3 rounded-xl text-sm text-rose-300 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <span>{t("appointments.stats.limitReached")}</span>
                          </div>
                        )}

                        {form.isSpecial && remainingEmergency === 0 && (
                          <div className="bg-amber-950/30 border border-amber-800 p-3 rounded-xl text-sm text-amber-300 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <span>{t("appointments.stats.noReservedLeft")}</span>
                          </div>
                        )}

                        {remainingNormal === 0 && !form.isSpecial && remainingTotal > 0 && (
                          <div className="bg-blue-950/30 border border-blue-800 p-3 rounded-xl text-sm text-blue-300 flex items-center gap-2">
                            <Info className="w-4 h-4 flex-shrink-0" />
                            <span>{t("appointments.stats.onlyReservedLeft")}</span>
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
                  <label className="text-sm font-medium text-slate-300">
                    {t("appointments.startTime")}
                  </label>
                  <input
                    type="time"
                    dir="ltr"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm tabular-nums focus:border-sky-500 outline-none transition-all"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">
                    {t("appointments.endTime")}
                  </label>
                  <input
                    type="time"
                    dir="ltr"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm tabular-nums focus:border-sky-500 outline-none transition-all"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  />
                </div>
              </div>

              {/* Doctor Availability */}
              {form.doctorId &&
                (() => {
                  const doc = doctorsList.find((d: any) => String(d.id) === form.doctorId);
                  if (doc?.schedule) {
                    let dayMsg = null;
                    if (doc.schedule.workDays) {
                      const daysMap = [
                        t("appointments.calendar.sun", "الأحد"),
                        t("appointments.calendar.mon", "الاثنين"),
                        t("appointments.calendar.tue", "الثلاثاء"),
                        t("appointments.calendar.wed", "الأربعاء"),
                        t("appointments.calendar.thu", "الخميس"),
                        t("appointments.calendar.fri", "الجمعة"),
                        t("appointments.calendar.sat", "السبت"),
                      ];
                      const allowedIndices = doc.schedule.workDays.split(",").map(Number);
                      const allowedNames = allowedIndices.map((i: number) => daysMap[i]).join("، ");

                      const selectedDateDay = new Date(date).getDay();
                      const isInvalidDay = !allowedIndices.includes(selectedDateDay);

                      dayMsg = (
                        <div
                          className={`p-3 rounded-xl border text-sm ${
                            isInvalidDay
                              ? "bg-rose-950/30 border-rose-800 text-rose-300"
                              : "bg-emerald-950/30 border-emerald-800 text-emerald-400"
                          }`}
                        >
                          <div className="font-semibold flex items-center gap-2">
                            {isInvalidDay ? (
                              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            )}
                            {isInvalidDay
                              ? t("appointments.availability.doctorNotWorking")
                              : t("appointments.availability.doctorAvailable")}
                          </div>
                          <div className="mt-1 text-xs opacity-90">
                            {t("appointments.availability.workDays")} {allowedNames}
                          </div>
                        </div>
                      );
                    }

                    const priceDisplay = doc.schedule.calculatedPrice
                      ? formatMoney(doc.schedule.calculatedPrice, false)
                      : formatMoney(0, false);

                    return (
                      <div className="space-y-3">
                        {dayMsg}
                        <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-xl flex justify-between items-center">
                          <span className="text-sm text-emerald-400 font-semibold flex items-center gap-2">
                            <Banknote className="w-4 h-4" />
                            {t("appointments.availability.price")}
                          </span>
                          <span dir="ltr" className="text-xl font-black text-emerald-400 tabular-nums">
                            {priceDisplay} {t("appointments.currency")}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

              {/* Appointment Type */}
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                <label className="text-sm font-medium text-slate-300 block mb-3">
                  {t("appointments.bookingType")}
                </label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="radio"
                      name="apptType"
                      checked={form.type === "IN_PERSON"}
                      onChange={() => setForm({ ...form, type: "IN_PERSON" })}
                      className="w-4 h-4 accent-sky-500"
                    />
                    <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">
                      {t("appointments.inPerson")}
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="radio"
                      name="apptType"
                      checked={form.type === "ONLINE"}
                      onChange={() => setForm({ ...form, type: "ONLINE" })}
                      className="w-4 h-4 accent-purple-500"
                    />
                    <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors inline-flex items-center gap-1.5">
                      {t("appointments.online")}
                      <Video className="w-4 h-4 text-purple-400" />
                    </span>
                  </label>
                </div>
              </div>

              {/* Special Case */}
              <div className="bg-amber-950/20 p-4 rounded-xl border border-amber-500/30">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    id="isSpecial"
                    checked={form.isSpecial}
                    onChange={(e) => setForm({ ...form, isSpecial: e.target.checked })}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {t("appointments.specialCase")}
                    </span>
                    <span className="text-xs text-amber-400/80 block mt-1">
                      {t("appointments.specialCaseDesc")}
                    </span>
                  </div>
                </label>
              </div>

              {/* Reserved Numbers Display */}
              {form.doctorId &&
                form.isSpecial &&
                (() => {
                  const doc = doctorsList.find((d: any) => String(d.id) === form.doctorId);
                  if (doc?.schedule?.reservedNumbers) {
                    const reservedNumbers: number[] =
                      doc.schedule.reservedNumbers
                        ?.split(",")
                        .map((n: string) => parseInt(n.trim()))
                        .filter((n: number) => !isNaN(n)) || [];

                    const doctorTodayAppointments = todayAppointments.filter(
                      (apt: any) => apt.doctorId === doc.id,
                    );
                    const usedReservedNumbers = doctorTodayAppointments
                      .filter(
                        (apt: any) =>
                          apt.isEmergency &&
                          apt.queueNumber &&
                          reservedNumbers.includes(apt.queueNumber),
                      )
                      .map((apt: any) => apt.queueNumber);

                    const availableReservedNumbers = reservedNumbers.filter(
                      (num: number) => !usedReservedNumbers.includes(num),
                    );

                    return (
                      <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl space-y-3">
                        <div className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                          <Hash className="w-4 h-4" />
                          {t("appointments.stats.availableReserved")}
                        </div>

                        <div className="grid grid-cols-5 gap-2">
                          {reservedNumbers.map((num: number) => {
                            const isAvailable = availableReservedNumbers.includes(num);
                            const isUsed = usedReservedNumbers.includes(num);

                            return (
                              <div
                                key={num}
                                className={`p-2 rounded-lg text-center font-mono text-sm font-bold tabular-nums transition-all ${
                                  isAvailable
                                    ? "bg-emerald-900/30 border border-emerald-500/40 text-emerald-400"
                                    : isUsed
                                      ? "bg-rose-900/30 border border-rose-500/40 text-rose-400 opacity-60"
                                      : "bg-slate-800 border border-slate-700 text-slate-400"
                                }`}
                              >
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-base">{num}</span>
                                  {isAvailable && (
                                    <span className="text-[10px] text-emerald-400">
                                      {t("appointments.statusAvailable", "متاح")}
                                    </span>
                                  )}
                                  {isUsed && (
                                    <span className="text-[10px] text-rose-400">
                                      {t("appointments.statusReserved", "محجوز")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 bg-emerald-900/30 border border-emerald-600 rounded" />
                              <span className="text-amber-400">
                                {t("appointments.available")} ({availableReservedNumbers.length})
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 bg-rose-900/30 border border-rose-600 rounded" />
                              <span className="text-amber-400">
                                {t("appointments.reserved")} ({usedReservedNumbers.length})
                              </span>
                            </div>
                          </div>
                          <div className="text-amber-400 font-medium">
                            {t("appointments.firstAvailableNum")}{" "}
                            {availableReservedNumbers.length > 0
                              ? availableReservedNumbers[0]
                              : t("appointments.none")}
                          </div>
                        </div>

                        {availableReservedNumbers.length === 0 && (
                          <div className="bg-rose-950/30 border border-rose-800 p-3 rounded-xl text-sm text-rose-300 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <span>{t("appointments.allReservedUsed")}</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
            </div>

            {/* Sticky Footer */}
            <div className="sticky bottom-0 bg-slate-950 border-t border-slate-800 p-5">
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAppointmentModal(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-sm font-medium transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleCreateAppointment}
                  disabled={creating}
                  className="px-7 py-2.5 bg-sky-600 hover:bg-sky-500 rounded-xl text-white text-sm font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? t("appointments.savingBtn") : t("appointments.saveBtn")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ER Modal */}
      {showERModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-950 border border-rose-500/40 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-rose-400 flex items-center gap-2">
              <Siren className="w-5 h-5" />
              {t("appointments.er.registerNewTitle")}
            </h3>

            <div className="space-y-1.5 bg-slate-900/50 p-3.5 rounded-xl border border-slate-800">
              <label className="text-xs font-semibold text-slate-300 block">
                {t("appointments.er.searchPatient")} <span className="text-rose-400">*</span>
              </label>
              <input
                placeholder={t("appointments.er.searchPatientPlaceholder")}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-rose-500 outline-none mb-2"
                value={erPatientSearch}
                onChange={(e) => setErPatientSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                {getFilteredPatients(erPatientSearch).map((p: any) => (
                  <div
                    key={p.id}
                    onClick={() => setErForm({ ...erForm, patientId: String(p.id) })}
                    className={`cursor-pointer px-3 py-2 text-sm border-b border-slate-800 last:border-0 transition-colors ${
                      erForm.patientId === String(p.id)
                        ? "bg-rose-600 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span className="font-medium">{p.fullName}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                {t("appointments.er.chiefComplaintLabel")}
              </label>
              <textarea
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-rose-500 outline-none"
                placeholder={t("appointments.er.chiefComplaintPlaceholder")}
                value={erForm.complaint}
                onChange={(e) => setErForm({ ...erForm, complaint: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowERModal(false)}
                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300 text-sm hover:bg-slate-700"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleRegisterER}
                disabled={creating}
                className="px-6 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                {t("appointments.er.registerImmediatelyBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
