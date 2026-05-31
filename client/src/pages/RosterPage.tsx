import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ar } from "date-fns/locale";
import { DatePicker } from "@/components/ui/date-picker";
import { useTranslation } from "react-i18next";

// --- Types ---
type UserLite = { id: number; fullName: string };
type WorkShift = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  type: string;
};
type RosterEntry = {
  id: number;
  date: string;
  userId: number;
  workShiftId: number;
  isOffDay: boolean;
  shift: WorkShift;
  user: { fullName: string };
};

export default function RosterPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [users, setUsers] = useState<UserLite[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [rosterData, setRosterData] = useState<RosterEntry[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);

  // --- View Control ---
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // --- Assignment Form State ---
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [form, setForm] = useState({
    userId: "",
    workShiftId: "",
    fromDate: new Date(),
    toDate: new Date(),
    isOffDay: false,
  });

  // --- Edit/Delete Modal State ---
  const [selectedEntry, setSelectedEntry] = useState<RosterEntry | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    workShiftId: "",
    isOffDay: false,
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // 1. Load Initial Data
  useEffect(() => {
    const loadResources = async () => {
      try {
        const [uRes, sRes] = await Promise.all([
          apiClient.get<UserLite[]>("/cashier/users"),
          apiClient.get<WorkShift[]>("/hr/shifts"),
        ]);
        setUsers(uRes.data);
        setShifts(sRes.data);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        toast.error(t("hr.roster.loadResourcesFailed", "فشل تحميل الموارد الأساسية"));
      }
    };
    loadResources();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Load Roster for current month
  const loadRoster = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<RosterEntry[]>("/hr/roster", {
        params: {
          from: monthStart.toISOString(),
          to: monthEnd.toISOString(),
        },
      });
      setRosterData(res.data);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("hr.roster.loadRosterFailed", "فشل تحميل الجدول"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  // 3. Handlers
  const handleAssign = async () => {
    if (!form.userId || (!form.isOffDay && !form.workShiftId)) {
      toast.warning(t("hr.roster.fillRequired", "يرجى إكمال بيانات التوزيع."));
      return;
    }

    try {
      await apiClient.post("/hr/roster/assign", {
        userId: Number(form.userId),
        workShiftId: Number(form.workShiftId),
        fromDate: form.fromDate,
        toDate: form.toDate,
        isOffDay: form.isOffDay,
      });
      toast.success(t("hr.roster.rosterUpdated", "تم تحديث الجدول بنجاح"));
      setShowAssignModal(false);
      loadRoster();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("hr.roster.rosterUpdateFailed", "فشل عملية التوزيع"));
    }
  };

  // --- Edit Entry Handler ---
  const handleOpenEdit = (entry: RosterEntry) => {
    setSelectedEntry(entry);
    setEditForm({
      workShiftId: entry.workShiftId?.toString() || "",
      isOffDay: entry.isOffDay,
    });
    setShowEditModal(true);
    setShowDeleteConfirm(false);
  };

  const handleUpdate = async () => {
    if (!selectedEntry) return;
    if (!editForm.isOffDay && !editForm.workShiftId) {
      toast.warning(t("hr.roster.selectShiftOrOffDay", "يرجى اختيار وردية أو تحديد يوم راحة"));
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.patch(`/hr/roster/${selectedEntry.id}`, {
        workShiftId: editForm.isOffDay ? null : Number(editForm.workShiftId),
        isOffDay: editForm.isOffDay,
      });
      toast.success(t("hr.roster.entryUpdated", "تم تحديث الإدخال بنجاح"));
      setShowEditModal(false);
      setSelectedEntry(null);
      loadRoster();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("hr.roster.entryUpdateFailed", "فشل تحديث الإدخال"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEntry) return;

    setIsSubmitting(true);
    try {
      await apiClient.delete(`/hr/roster/${selectedEntry.id}`);
      toast.success(t("hr.roster.entryDeleted", "تم حذف الإدخال بنجاح"));
      setShowEditModal(false);
      setShowDeleteConfirm(false);
      setSelectedEntry(null);
      loadRoster();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("hr.roster.entryDeleteFailed", "فشل حذف الإدخال"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // organizar
  const rosterGrid = useMemo(() => {
    const grid: Record<number, Record<string, RosterEntry>> = {};
    rosterData.forEach((entry) => {
      if (!grid[entry.userId]) grid[entry.userId] = {};
      const dayKey = format(new Date(entry.date), "yyyy-MM-dd");
      grid[entry.userId][dayKey] = entry;
    });
    return grid;
  }, [rosterData]);

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-3xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold">{t("hr.roster.title", "جدول المناوبات الشهري")}</h1>
          <div className="flex items-center gap-4 mt-2">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1 hover:text-sky-400"
            >
              {isRtl ? "◀" : "▶"}
            </button>
            <span className="text-sky-400 font-bold min-w-[120px] text-center uppercase">
              {format(currentMonth, "MMMM yyyy", { locale: isRtl ? ar : undefined })}
            </span>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1 hover:text-sky-400"
            >
              {isRtl ? "▶" : "◀"}
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowAssignModal(true)}
          className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-bold shadow-lg shadow-sky-900/20 transition-all"
        >
          {t("hr.roster.bulkAssignBtn", "+ توزيع ورديات (Bulk Assign)")}
        </button>
      </div>

      {/* Roster Grid View */}
      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-slate-900 sticky top-0 z-20">
              <tr>
                <th className={`p-3 text-right border-b border-slate-800 sticky ${isRtl ? "right-0" : "left-0"} bg-slate-900 z-30 min-w-[150px]`}>
                  {t("hr.roster.employeeHeader", "الموظف")}
                </th>
                {daysInMonth.map((day) => (
                  <th
                    key={day.toString()}
                    className={`p-2 border-b border-slate-800 text-center min-w-[45px] ${[0, 6].includes(day.getDay()) ? "bg-slate-800/50" : ""}`}
                  >
                    <div className="text-slate-500">
                      {format(day, "E", { locale: isRtl ? ar : undefined })}
                    </div>
                    <div className="text-sm font-bold">{format(day, "d")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-900/30 border-b border-slate-900"
                >
                  <td className={`p-3 font-bold border-l border-slate-800 sticky ${isRtl ? "right-0" : "left-0"} bg-slate-950 z-10`}>
                    {user.fullName}
                  </td>
                  {daysInMonth.map((day) => {
                    const dayKey = format(day, "yyyy-MM-dd");
                    const entry = rosterGrid[user.id]?.[dayKey];

                    return (
                      <td
                        key={dayKey}
                        className="p-1 text-center border-r border-slate-900/50"
                      >
                        {entry ? (
                          <div
                            onClick={() => handleOpenEdit(entry)}
                            className={`py-1.5 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity ${
                              entry.isOffDay
                                ? "bg-rose-950/20 border-rose-900/50 text-rose-500 hover:bg-rose-900/30"
                                : "bg-emerald-950/20 border-emerald-900/50 text-emerald-400 hover:bg-emerald-900/30"
                            }`}
                          >
                            {entry.isOffDay
                              ? t("hr.roster.off", "OFF")
                              : entry.shift?.name.substring(0, 3)}
                          </div>
                        ) : (
                          <div className="text-slate-800">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg space-y-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white border-b border-slate-800 pb-3">
              {t("hr.roster.assignModalTitle", "توزيع ورديات العمل")}
            </h3>

            <div className="space-y-4">
              {/* اختيار الموظف */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {t("hr.roster.targetEmployeeLabel", "الموظف المستهدف")}
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:border-sky-500 outline-none"
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                >
                  <option value="">{t("hr.roster.selectEmployeePlaceholder", "-- اختر الموظف --")}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {/* اختيار التاريخ */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    {t("hr.roster.fromDateLabel", "من تاريخ")}
                  </label>
                  <DatePicker
                    date={form.fromDate}
                    onChange={(d) => d && setForm({ ...form, fromDate: d })}
                    className="bg-slate-950 border-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    {t("hr.roster.toDateLabel", "إلى تاريخ")}
                  </label>
                  <DatePicker
                    date={form.toDate}
                    onChange={(d) => d && setForm({ ...form, toDate: d })}
                    className="bg-slate-950 border-slate-700"
                  />
                </div>
              </div>

              {/* نوع التوزيع */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <input
                    type="checkbox"
                    checked={form.isOffDay}
                    onChange={(e) =>
                      setForm({ ...form, isOffDay: e.target.checked })
                    }
                    className="w-5 h-5 rounded accent-rose-500"
                  />
                  <span className="text-sm font-bold text-rose-400">
                    {t("hr.roster.setOffDaysLabel", "تحديد كأيام راحة (Off Days)")}
                  </span>
                </label>

                {!form.isOffDay && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="text-xs text-slate-400 block mb-1">
                      {t("hr.roster.assignedShiftLabel", "الوردية المخصصة")}
                    </label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      value={form.workShiftId}
                      onChange={(e) =>
                        setForm({ ...form, workShiftId: e.target.value })
                      }
                    >
                      <option value="">{t("hr.roster.selectShiftPlaceholder", "-- اختر الوردية --")}</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime}-{s.endTime})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-6 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              >
                {t("common.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleAssign}
                className="px-8 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-900/20 transition"
              >
                {t("hr.roster.applyRosterBtn", "تطبيق الجدول")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Delete Modal */}
      {showEditModal && selectedEntry && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xl font-bold text-white">
                {t("hr.roster.editModalTitle", "تعديل وردية الموظف")}
              </h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedEntry(null);
                  setShowDeleteConfirm(false);
                }}
                className="text-slate-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>

            {/* Entry Info */}
            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block mb-1">{t("hr.roster.employeeLabel", "الموظف")}</span>
                  <span className="font-bold text-white">
                    {selectedEntry.user.fullName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">{t("hr.roster.dateLabel", "التاريخ")}</span>
                  <span className="font-bold text-sky-400">
                    {format(new Date(selectedEntry.date), "EEEE d MMMM", { locale: isRtl ? ar : undefined })}
                  </span>
                </div>
              </div>
            </div>

            {/* Edit Form */}
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-950 rounded-xl border border-slate-800 hover:border-rose-500/50 transition">
                <input
                  type="checkbox"
                  checked={editForm.isOffDay}
                  onChange={(e) =>
                    setEditForm({ ...editForm, isOffDay: e.target.checked })
                  }
                  className="w-5 h-5 rounded accent-rose-500"
                />
                <span className="text-sm font-bold text-rose-400">
                  {t("hr.roster.offDayLabel", "يوم راحة (Off Day)")}
                </span>
              </label>

              {!editForm.isOffDay && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="text-xs text-slate-400 block mb-2">
                    {t("hr.roster.shiftLabel", "الوردية")}
                  </label>
                  <select
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500"
                    value={editForm.workShiftId}
                    onChange={(e) =>
                      setEditForm({ ...editForm, workShiftId: e.target.value })
                    }
                  >
                    <option value="">{t("hr.roster.selectShiftPlaceholder", "-- اختر الوردية --")}</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startTime} - {s.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Delete Confirmation */}
            {showDeleteConfirm ? (
              <div className="bg-rose-950/30 border border-rose-900/50 rounded-xl p-4 animate-in fade-in">
                <p className="text-rose-400 text-sm mb-3">
                  {t("hr.roster.deleteConfirmMsg", "هل أنت متأكد من حذف هذا الإدخال؟")}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                  >
                    {isSubmitting ? t("common.deleting", "جارِ الحذف...") : t("common.deleteConfirmBtn", "نعم، احذف")}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-sm"
                  >
                    {t("common.cancel", "إلغاء")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full px-4 py-2.5 bg-rose-950/30 border border-rose-900/50 text-rose-400 hover:bg-rose-900/30 rounded-xl text-sm font-bold transition"
              >
                {t("hr.roster.deleteEntryBtn", "🗑️ حذف هذا الإدخال")}
              </button>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedEntry(null);
                  setShowDeleteConfirm(false);
                }}
                className="px-6 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              >
                {t("common.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleUpdate}
                disabled={isSubmitting}
                className="px-8 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/20 transition disabled:opacity-50"
              >
                {isSubmitting ? t("common.saving", "جارِ الحفظ...") : t("common.saveChanges", "حفظ التعديلات")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
