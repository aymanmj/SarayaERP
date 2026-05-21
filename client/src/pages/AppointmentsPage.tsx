// src/pages/AppointmentsPage.tsx

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ar } from "date-fns/locale";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const user = useAuthStore((s) => s.user);
  const roles = user?.roles ?? [];
  const navigate = useNavigate();
// src/pages/AppointmentsPage.tsx

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ar } from "date-fns/locale";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ChevronLeft, ChevronRight, Calendar, Clock, Users, User, Search, Plus, Filter, X, Printer, Video, PlayCircle, FileText, CheckCircle, AlertCircle, BarChart3, Sparkles } from "lucide-react";
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const [mainTab, setMainTab] = useState<'appointments' | 'ai_followups'>('appointments');
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const monthAppointments = monthData || [];

  const error = queryError ? "حدث خطأ أثناء تحميل المواعيد." : null;

  // 2. Fetch Patients List
  const { data: patientsList = [] } = useQuery({
      queryKey: ['patientsList'],
      queryFn: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return docRes.data.map((d: any) => ({
            ...d,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // 5. Fetch Notifications for AI Follow-ups
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get<any[]>("/notifications");
      return res.data;
    },
    refetchInterval: 60000, // Poll every minute
  });

  const aiFollowUps = useMemo(() => {
    return notifications.filter((n) => n.type === 'AI_FOLLOW_UP' && !n.isRead);
  }, [notifications]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                        p.mrn.includes(patientSearch) ||
                        (p.phone && p.phone.includes(patientSearch))
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
