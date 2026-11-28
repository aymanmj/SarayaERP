// client/src/pages/ShiftsPage.tsx
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
  CalendarDays,
  Users,
  Plus,
  Trash2,
  Pencil,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  hrService,
  type EmployeeShiftDayItem,
  type RosterCsvPreviewResult,
  type RosterDayType,
  type ShiftType,
  type WorkShiftItem,
} from "../services/hr.service";
import {
  SarayaFilterSelect,
  SarayaPageHeader,
} from "../components/ui/SarayaPrimitives";

type ShiftTab = "grid" | "assignments" | "types";

const DAY_TYPE_LABELS: Record<RosterDayType, string> = {
  WORK: "عمل",
  REST: "راحة (REST)",
  OFF: "إجازة أسبوعية (OFF)",
  LEAVE: "إجازة معتمدة (LEAVE)",
  HOLIDAY: "عطلة رسمية",
};

const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  MORNING: "صباحي",
  EVENING: "مسائي",
  NIGHT: "ليلي",
  FULL_DAY: "يوم كامل (24س)",
};

const WEEKDAY_AR = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

function getPillStyle(day?: EmployeeShiftDayItem) {
  if (!day) {
    return "text-slate-600 hover:bg-slate-800/70 border border-transparent";
  }
  if (day.dayType === "REST") {
    return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/35";
  }
  if (day.dayType === "OFF") {
    return "bg-slate-700/40 text-slate-300 border border-slate-600/40";
  }
  if (day.dayType === "LEAVE") {
    return "bg-rose-500/15 text-rose-300 border border-rose-500/35";
  }
  if (day.dayType === "HOLIDAY") {
    return "bg-violet-500/15 text-violet-300 border border-violet-500/35";
  }
  const code = (day.shift?.code || "").toUpperCase();
  if (code === "N" || day.shift?.type === "NIGHT") {
    return "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40";
  }
  if (code === "24" || day.shift?.type === "FULL_DAY") {
    return "bg-amber-500/20 text-amber-300 border border-amber-500/40";
  }
  return "bg-sky-500/20 text-sky-300 border border-sky-500/40";
}

function getPillLabel(day?: EmployeeShiftDayItem) {
  if (!day) return "—";
  if (day.dayType === "REST") return "REST";
  if (day.dayType === "OFF") return "OFF";
  if (day.dayType === "LEAVE") return "LEAVE";
  if (day.dayType === "HOLIDAY") return "HOL";
  return day.shift?.code || day.shift?.name?.slice(0, 3) || "WORK";
}

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ShiftTab>("grid");

  // --- Tab 1: Monthly Grid ---
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [departmentId, setDepartmentId] = useState<string>("");
  const [dayForm, setDayForm] = useState<{
    id?: number;
    employeeId: string;
    rosterDate: string;
    dayType: RosterDayType;
    shiftId: string;
    notes: string;
  }>({
    employeeId: "",
    rosterDate: new Date().toISOString().slice(0, 10),
    dayType: "WORK",
    shiftId: "",
    notes: "",
  });

  // CSV Modal
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvContent, setCsvContent] = useState(
    "employeeNo,date,code,notes\nEMP-0001,2026-11-28,D,دوام صباحي\n",
  );
  const [csvPreview, setCsvPreview] =
    useState<RosterCsvPreviewResult | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  // --- Tab 2: Shift Assignment Modal ---
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignMode, setAssignMode] = useState<"employee" | "department">(
    "employee",
  );
  const [assignForm, setAssignForm] = useState({
    employeeId: "",
    departmentId: "",
    shiftId: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  });

  // --- Tab 3: WorkShift Modal ---
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [shiftForm, setShiftForm] = useState({
    code: "",
    name: "",
    nameEn: "",
    type: "MORNING" as ShiftType,
    startTime: "08:00",
    endTime: "16:00",
    workHours: "8",
    graceMinutes: "15",
    breakMinutes: "0",
    nightAllowance: "0",
    overtimeMultiplier: "1.5",
    holidayMultiplier: "2.0",
    isOvernight: false,
    isFlexible: false,
    isScrubShift: false,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: hrService.listDepartments,
  });

  const { data: grid, isLoading: loadingGrid } = useQuery({
    queryKey: ["hr-monthly-grid", month, departmentId],
    queryFn: () =>
      hrService.getMonthlyShiftGrid({
        month,
        departmentId: departmentId ? Number(departmentId) : undefined,
      }),
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["hr-shifts"],
    queryFn: hrService.listShifts,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["hr-shift-assignments", departmentId],
    queryFn: () =>
      hrService.listShiftAssignments({
        departmentId: departmentId ? Number(departmentId) : undefined,
      }),
    enabled: activeTab === "assignments",
  });

  const { data: allEmployeesRes } = useQuery({
    queryKey: ["hr-employees-all-for-shifts"],
    queryFn: () => hrService.listEmployees({ isActive: "true", limit: 500 }),
  });
  const allEmployees = allEmployeesRes?.items ?? [];

  const monthDays = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return [];
    const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: total }, (_, idx) => {
      const dayNum = idx + 1;
      const d = new Date(Date.UTC(y, m - 1, dayNum));
      const iso = d.toISOString().slice(0, 10);
      return {
        dayNum,
        iso,
        weekdayAr: WEEKDAY_AR[d.getUTCDay()],
      };
    });
  }, [month]);

  const dayLookup = useMemo(() => {
    const map = new Map<string, EmployeeShiftDayItem>();
    for (const d of grid?.days ?? []) {
      const key = `${d.employeeId}|${d.rosterDate.slice(0, 10)}`;
      map.set(key, d);
    }
    return map;
  }, [grid]);

  const invalidateShiftsAll = () => {
    queryClient.invalidateQueries({ queryKey: ["hr-monthly-grid"] });
    queryClient.invalidateQueries({ queryKey: ["hr-shift-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["hr-shifts"] });
  };

  const handleSaveDay = async () => {
    if (!dayForm.employeeId || !dayForm.rosterDate) {
      toast.warning("حدد الموظف والتاريخ.");
      return;
    }
    if (dayForm.dayType === "WORK" && !dayForm.shiftId) {
      toast.warning("اختر الوردية ليوم العمل.");
      return;
    }
    try {
      await hrService.upsertShiftDay({
        employeeId: Number(dayForm.employeeId),
        rosterDate: dayForm.rosterDate,
        dayType: dayForm.dayType,
        shiftId:
          dayForm.dayType === "WORK" ? Number(dayForm.shiftId) : undefined,
        notes: dayForm.notes.trim() || undefined,
      });
      toast.success("تم حفظ يوم المناوبة بنجاح.");
      invalidateShiftsAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر حفظ يوم المناوبة.");
    }
  };

  const handleDeleteDay = async () => {
    if (!dayForm.id) return;
    try {
      await hrService.deleteShiftDay(dayForm.id);
      toast.success("تم مسح اليوم من الجدول.");
      setDayForm((prev) => ({ ...prev, id: undefined }));
      invalidateShiftsAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر حذف السجل.");
    }
  };

  const handleCsvPreview = async () => {
    setCsvBusy(true);
    try {
      const res = await hrService.previewRosterCsv(csvContent);
      setCsvPreview(res);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر قراءة ملف CSV.");
    } finally {
      setCsvBusy(false);
    }
  };

  const handleCsvApply = async () => {
    setCsvBusy(true);
    try {
      await hrService.applyRosterCsv(csvContent);
      toast.success("تم تطبيق جدول المناوبات بنجاح.");
      setShowCsvModal(false);
      setCsvPreview(null);
      invalidateShiftsAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "فشل تطبيق الجدول.");
    } finally {
      setCsvBusy(false);
    }
  };

  const handleAssignSubmit = async () => {
    if (!assignForm.shiftId || !assignForm.startDate) {
      toast.warning("حدد الوردية وتاريخ البداية.");
      return;
    }
    try {
      if (assignMode === "employee") {
        if (!assignForm.employeeId) {
          toast.warning("اختر الموظف.");
          return;
        }
        await hrService.assignShift({
          employeeId: Number(assignForm.employeeId),
          shiftId: Number(assignForm.shiftId),
          startDate: assignForm.startDate,
          endDate: assignForm.endDate || undefined,
        });
      } else {
        if (!assignForm.departmentId) {
          toast.warning("اختر القسم.");
          return;
        }
        await hrService.bulkAssignShift({
          departmentId: Number(assignForm.departmentId),
          shiftId: Number(assignForm.shiftId),
          startDate: assignForm.startDate,
          endDate: assignForm.endDate || undefined,
        });
      }
      toast.success("تم تعيين الوردية بنجاح.");
      setShowAssignModal(false);
      invalidateShiftsAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر تعيين الوردية.");
    }
  };

  const openCreateShift = () => {
    setEditingShiftId(null);
    setShiftForm({
      code: "",
      name: "",
      nameEn: "",
      type: "MORNING",
      startTime: "08:00",
      endTime: "16:00",
      workHours: "8",
      graceMinutes: "15",
      breakMinutes: "0",
      nightAllowance: "0",
      overtimeMultiplier: "1.5",
      holidayMultiplier: "2.0",
      isOvernight: false,
      isFlexible: false,
      isScrubShift: false,
    });
    setShowShiftModal(true);
  };

  const openEditShift = (s: WorkShiftItem) => {
    setEditingShiftId(s.id);
    setShiftForm({
      code: s.code || "",
      name: s.name,
      nameEn: s.nameEn || "",
      type: s.type,
      startTime: s.startTime,
      endTime: s.endTime,
      workHours: String(s.workHours ?? "8"),
      graceMinutes: String(s.graceMinutes ?? "15"),
      breakMinutes: String(s.breakMinutes ?? "0"),
      nightAllowance: String(s.nightAllowance ?? "0"),
      overtimeMultiplier: String(s.overtimeMultiplier ?? "1.5"),
      holidayMultiplier: String(s.holidayMultiplier ?? "2.0"),
      isOvernight: Boolean(s.isOvernight),
      isFlexible: Boolean(s.isFlexible),
      isScrubShift: Boolean(s.isScrubShift),
    });
    setShowShiftModal(true);
  };

  const handleSaveShiftType = async () => {
    if (!shiftForm.name.trim()) {
      toast.warning("أدخل اسم الوردية.");
      return;
    }
    const payload = {
      code: shiftForm.code.trim() || undefined,
      name: shiftForm.name.trim(),
      nameEn: shiftForm.nameEn.trim() || undefined,
      type: shiftForm.type,
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      workHours: Number(shiftForm.workHours) || 8,
      graceMinutes: Number(shiftForm.graceMinutes) || 0,
      breakMinutes: Number(shiftForm.breakMinutes) || 0,
      nightAllowance: Number(shiftForm.nightAllowance) || 0,
      overtimeMultiplier: Number(shiftForm.overtimeMultiplier) || 1.5,
      holidayMultiplier: Number(shiftForm.holidayMultiplier) || 2.0,
      isOvernight: shiftForm.isOvernight,
      isFlexible: shiftForm.isFlexible,
      isScrubShift: shiftForm.isScrubShift,
    };
    try {
      if (editingShiftId) {
        await hrService.updateShift(editingShiftId, payload);
        toast.success("تم تحديث نوع الوردية.");
      } else {
        await hrService.createShift(payload);
        toast.success("تم إنشاء الوردية الجديدة.");
      }
      setShowShiftModal(false);
      invalidateShiftsAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر حفظ الوردية.");
    }
  };

  return (
    <div className="text-slate-100 h-full flex flex-col space-y-4" dir="rtl">
      {/* Header */}
      <SarayaPageHeader
        title="إدارة الورديات وجدول المناوبات (Shift Rostering)"
        subtitle="تعريف أنواع الورديات وتوزيع الكوادر الطبية والتمريضية على المناوبات اليومية وأيام الراحة"
        icon={<Clock className="w-6 h-6" />}
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowCsvModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4 text-sky-400" />
              استيراد جدول المناوبات (CSV)
            </button>
            <button
              type="button"
              onClick={() => setShowAssignModal(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4" />
              تعيين وردية لموظف / قسم
            </button>
            <button
              type="button"
              onClick={openCreateShift}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              إضافة وردية جديدة
            </button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-slate-900/70 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("grid")}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "grid"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-400 hover:bg-slate-800/70"
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          الجدول اليومي وأيام الراحة ({grid?.days.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("assignments")}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "assignments"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-400 hover:bg-slate-800/70"
          }`}
        >
          <Users className="w-4 h-4" />
          جدول توزيع المناوبات ({assignments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("types")}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "types"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-400 hover:bg-slate-800/70"
          }`}
        >
          <Clock className="w-4 h-4" />
          أنواع الورديات والدوام ({shifts.length})
        </button>
      </div>

      {activeTab === "grid" && (
        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          {/* Note */}
          <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-2.5 text-xs text-sky-200 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">الجدول اليومي هو المرجع الفعلي للحضور: </span>
              يوم REST أو OFF أو LEAVE لا يُنشئ غياباً. رموز الورديات (مثل D, N, 24) تربط كل يوم بوردية مستقلة بما في ذلك الورديات العابرة لمنتصف الليل. انقر على أي خلية في الشبكة لتحميلها وتعديلها فوراً.
            </div>
          </div>

          {/* Inline Control & Edit Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 grid grid-cols-1 md:grid-cols-7 gap-3 items-end text-xs shadow-sm">
            <div>
              <label className="text-slate-400 block mb-1">الشهر</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">القسم</label>
              <SarayaFilterSelect
                value={departmentId}
                onChange={setDepartmentId}
                options={departments.map((d) => ({
                  value: String(d.id),
                  label: d.name,
                }))}
                placeholder="كل الأقسام"
                allLabel="كل الأقسام"
                searchPlaceholder="ابحث عن قسم..."
                ariaLabel="تصفية المناوبات حسب القسم"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">الموظف *</label>
              <select
                value={dayForm.employeeId}
                onChange={(e) =>
                  setDayForm({ ...dayForm, employeeId: e.target.value, id: undefined })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              >
                <option value="">اختر الموظف...</option>
                {(grid?.employees || allEmployees).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeNo})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">التاريخ *</label>
              <input
                type="date"
                value={dayForm.rosterDate}
                onChange={(e) =>
                  setDayForm({ ...dayForm, rosterDate: e.target.value, id: undefined })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">نوع اليوم *</label>
              <select
                value={dayForm.dayType}
                onChange={(e) =>
                  setDayForm({
                    ...dayForm,
                    dayType: e.target.value as RosterDayType,
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              >
                {(Object.keys(DAY_TYPE_LABELS) as RosterDayType[]).map((dt) => (
                  <option key={dt} value={dt}>
                    {DAY_TYPE_LABELS[dt]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">الوردية</label>
              <select
                value={dayForm.shiftId}
                disabled={dayForm.dayType !== "WORK"}
                onChange={(e) =>
                  setDayForm({ ...dayForm, shiftId: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 disabled:opacity-40"
              >
                <option value="">اختر الوردية...</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code ? `[${s.code}] ` : ""}
                    {s.name} ({s.startTime}-{s.endTime})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveDay}
                className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black"
              >
                حفظ اليوم
              </button>
              {dayForm.id && (
                <button
                  type="button"
                  onClick={handleDeleteDay}
                  title="حذف اليوم"
                  className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Monthly Matrix */}
          <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-auto shadow-2xl">
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-slate-950 text-slate-400 sticky top-0 z-20">
                <tr>
                  <th className="sticky right-0 z-30 bg-slate-950 px-4 py-3 text-right min-w-[200px] border-b border-l border-slate-800">
                    الموظف
                  </th>
                  {monthDays.map((d) => (
                    <th
                      key={d.iso}
                      className="px-2 py-2 text-center border-b border-slate-800 min-w-[54px]"
                    >
                      <div className="font-mono font-bold text-slate-200">
                        {d.dayNum}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {d.weekdayAr}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loadingGrid ? (
                  <tr>
                    <td
                      colSpan={monthDays.length + 1}
                      className="py-16 text-center text-slate-400"
                    >
                      جارِ تحميل شبكة المناوبات الشهرية...
                    </td>
                  </tr>
                ) : (grid?.employees ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={monthDays.length + 1}
                      className="py-16 text-center text-slate-500"
                    >
                      لا يوجد موظفون نشطون في هذا النطاق.
                    </td>
                  </tr>
                ) : (
                  (grid?.employees ?? []).map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-800/25">
                      <td className="sticky right-0 z-10 bg-slate-900 px-4 py-2.5 border-l border-slate-800">
                        <div className="font-bold text-slate-100 truncate max-w-[180px]">
                          {emp.fullName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {emp.employeeNo}
                        </div>
                      </td>
                      {monthDays.map((d) => {
                        const cell = dayLookup.get(`${emp.id}|${d.iso}`);
                        return (
                          <td key={d.iso} className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                setDayForm({
                                  id: cell?.id,
                                  employeeId: String(emp.id),
                                  rosterDate: d.iso,
                                  dayType: cell?.dayType ?? "WORK",
                                  shiftId: cell?.shiftId
                                    ? String(cell.shiftId)
                                    : shifts[0]?.id
                                      ? String(shifts[0].id)
                                      : "",
                                  notes: cell?.notes || "",
                                })
                              }
                              className={`w-full py-1 px-1.5 rounded-lg font-mono font-bold transition-all ${getPillStyle(
                                cell,
                              )}`}
                            >
                              {getPillLabel(cell)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "assignments" && (
        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-auto shadow-2xl">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">الموظف</th>
                <th className="px-4 py-3.5">القسم</th>
                <th className="px-4 py-3.5">الوردية</th>
                <th className="px-4 py-3.5">الفترة</th>
                <th className="px-4 py-3.5 text-center">إزالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    لا توجد تعيينات ورديات دائمة حالياً.
                  </td>
                </tr>
              ) : (
                assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="font-bold">
                        {a.employee?.fullName || "—"}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {a.employee?.employeeNo}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {a.employee?.department?.name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 font-bold">
                        {a.shift.code ? `[${a.shift.code}] ` : ""}
                        {a.shift.name}
                      </span>
                      <span className="mr-2 font-mono text-slate-400">
                        {a.shift.startTime} - {a.shift.endTime}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      من {a.startDate.slice(0, 10)}
                      {a.endDate ? ` إلى ${a.endDate.slice(0, 10)}` : " (مستمر)"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={async () => {
                          await hrService.removeShiftAssignment(a.id);
                          toast.success("تم حذف التعيين.");
                          invalidateShiftsAll();
                        }}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "types" && (
        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-auto shadow-2xl">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">الرمز</th>
                <th className="px-4 py-3.5">الاسم</th>
                <th className="px-4 py-3.5">النوع</th>
                <th className="px-4 py-3.5">التوقيت</th>
                <th className="px-4 py-3.5 text-center">ساعات العمل</th>
                <th className="px-4 py-3.5 text-center">السماحية</th>
                <th className="px-4 py-3.5">خصائص</th>
                <th className="px-4 py-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {shifts.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-mono font-bold text-sky-300">
                    {s.code || "—"}
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {s.name}
                    {s.nameEn && (
                      <div className="text-[11px] text-slate-500">{s.nameEn}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {SHIFT_TYPE_LABELS[s.type] || s.type}
                  </td>
                  <td className="px-4 py-3 font-mono text-sky-300" dir="ltr">
                    {s.startTime} - {s.endTime}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {s.workHours} س
                  </td>
                  <td className="px-4 py-3 text-center text-slate-400">
                    {s.graceMinutes} د
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.isOvernight && (
                        <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          عابرة لمنتصف الليل
                        </span>
                      )}
                      {s.isScrubShift && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          عمليات (Scrub)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditShift(s)}
                        className="p-1.5 rounded-lg bg-slate-800 text-amber-400 hover:bg-amber-500/20"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await hrService.deleteShift(s.id);
                          toast.success("تم تعطيل الوردية.");
                          invalidateShiftsAll();
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-3xl space-y-4 text-xs">
            <h3 className="text-base font-black">استيراد جدول المناوبات الشهري (CSV)</h3>
            <p className="text-slate-400">
              الأعمدة المطلوبة: <code className="text-sky-300">employeeNo,date,code,notes</code> — مثل رمز الوردية (D, N, 24) أو REST / OFF / LEAVE.
            </p>
            <textarea
              rows={6}
              value={csvContent}
              onChange={(e) => {
                setCsvContent(e.target.value);
                setCsvPreview(null);
              }}
              dir="ltr"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-xs"
            />
            {csvPreview && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center gap-4">
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> صالحة: {csvPreview.rows.length}
                  </span>
                  {csvPreview.errors.length > 0 && (
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> أخطاء: {csvPreview.errors.length}
                    </span>
                  )}
                </div>
                {csvPreview.errors.map((e, i) => (
                  <div key={i} className="text-rose-300">
                    السطر {e.line}: {e.message}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إغلاق
              </button>
              <button
                type="button"
                disabled={csvBusy}
                onClick={handleCsvPreview}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white font-bold"
              >
                معاينة وتحقق
              </button>
              <button
                type="button"
                disabled={
                  csvBusy || !csvPreview || csvPreview.errors.length > 0 || csvPreview.rows.length === 0
                }
                onClick={handleCsvApply}
                className="px-5 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white font-black"
              >
                اعتماد الجدول
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Shift Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md space-y-4 text-xs">
            <h3 className="text-base font-black">تعيين وردية لموظف / قسم</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAssignMode("employee")}
                className={`flex-1 py-2 rounded-xl font-bold ${
                  assignMode === "employee"
                    ? "bg-sky-600 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                لموظف محدد
              </button>
              <button
                type="button"
                onClick={() => setAssignMode("department")}
                className={`flex-1 py-2 rounded-xl font-bold ${
                  assignMode === "department"
                    ? "bg-sky-600 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                لقسم كامل (جماعي)
              </button>
            </div>

            {assignMode === "employee" ? (
              <select
                value={assignForm.employeeId}
                onChange={(e) =>
                  setAssignForm({ ...assignForm, employeeId: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              >
                <option value="">اختر الموظف...</option>
                {allEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeNo})
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={assignForm.departmentId}
                onChange={(e) =>
                  setAssignForm({ ...assignForm, departmentId: e.target.value })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              >
                <option value="">اختر القسم...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={assignForm.shiftId}
              onChange={(e) =>
                setAssignForm({ ...assignForm, shiftId: e.target.value })
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            >
              <option value="">اختر الوردية...</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ` : ""}
                  {s.name} ({s.startTime} - {s.endTime})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">من تاريخ</label>
                <input
                  type="date"
                  value={assignForm.startDate}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, startDate: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  إلى تاريخ (اختياري)
                </label>
                <input
                  type="date"
                  value={assignForm.endDate}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, endDate: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleAssignSubmit}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold"
              >
                حفظ التعيين
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit WorkShift Modal */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg space-y-4 text-xs">
            <h3 className="text-base font-black">
              {editingShiftId ? "تعديل الوردية" : "تعريف وردية جديدة"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">الرمز (D / N / 24)</label>
                <input
                  value={shiftForm.code}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, code: e.target.value })
                  }
                  placeholder="D"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">النوع</label>
                <select
                  value={shiftForm.type}
                  onChange={(e) =>
                    setShiftForm({
                      ...shiftForm,
                      type: e.target.value as ShiftType,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                >
                  {(Object.keys(SHIFT_TYPE_LABELS) as ShiftType[]).map((st) => (
                    <option key={st} value={st}>
                      {SHIFT_TYPE_LABELS[st]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">الاسم بالعربية *</label>
                <input
                  value={shiftForm.name}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, name: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">الاسم بالإنجليزية</label>
                <input
                  value={shiftForm.nameEn}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, nameEn: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">من</label>
                <input
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, startTime: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">إلى</label>
                <input
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, endTime: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">ساعات العمل المعتمدة</label>
                <input
                  type="number"
                  step="0.5"
                  value={shiftForm.workHours}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, workHours: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">سماحية التأخير (د)</label>
                <input
                  type="number"
                  value={shiftForm.graceMinutes}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, graceMinutes: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">بدل السهر الليلي (LYD)</label>
                <input
                  type="number"
                  step="0.001"
                  value={shiftForm.nightAllowance}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, nightAllowance: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">معامل الإضافي</label>
                <input
                  type="number"
                  step="0.1"
                  value={shiftForm.overtimeMultiplier}
                  onChange={(e) =>
                    setShiftForm({
                      ...shiftForm,
                      overtimeMultiplier: e.target.value,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={shiftForm.isOvernight}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, isOvernight: e.target.checked })
                  }
                />
                عابرة لمنتصف الليل
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={shiftForm.isScrubShift}
                  onChange={(e) =>
                    setShiftForm({
                      ...shiftForm,
                      isScrubShift: e.target.checked,
                    })
                  }
                />
                وردية عمليات (Scrub)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={shiftForm.isFlexible}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, isFlexible: e.target.checked })
                  }
                />
                دوام مرن
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowShiftModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveShiftType}
                className="px-5 py-2 rounded-xl bg-sky-600 text-white font-bold"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
