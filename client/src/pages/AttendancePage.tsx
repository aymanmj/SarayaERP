import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import {
  ClockIcon,
  DocumentArrowDownIcon,
  UserPlusIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

type AttendanceRecord = {
  id: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: "PRESENT" | "LATE" | "ABSENT";
  lateMinutes: number;
  user: { id: number; fullName: string; username: string };
};

type UserLite = { id: number; fullName: string };

export default function AttendancePage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(false);

  const [dateFrom, setDateFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const [showManualModal, setShowManualModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [uploading, setUploading] = useState(false);

  const [manualData, setManualData] = useState({
    userId: "",
    time: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/attendance", {
        params: { from: dateFrom, to: dateTo },
      });
      setRecords(res.data);
    } catch {
      toast.error(t("hr.toast.loadFailed", "فشل تحميل البيانات"));
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await apiClient.get("/cashier/users");
      setUsers(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadRecords();
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const handleManualPunch = async () => {
    if (!manualData.userId || !manualData.time)
      return toast.warning(t("hr.toast.fillRequired", "يرجى إكمال البيانات"));
    try {
      const timestamp = new Date(
        `${manualData.date}T${manualData.time}:00`,
      ).toISOString();
      await apiClient.post("/attendance/punch", {
        userId: Number(manualData.userId),
        timestamp,
      });
      toast.success(t("hr.toast.punchSuccess", "تم تسجيل البصمة يدوياً"));
      setShowManualModal(false);
      loadRecords();
    } catch {
      toast.error(t("hr.toast.punchFailed", "فشل التسجيل"));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").slice(1);
        const punches = lines
          .map((l) => {
            const [id, date, time] = l.trim().split(",");
            if (!id || !date || !time) return null;
            return {
              userId: Number(id),
              timestamp: new Date(`${date}T${time}`).toISOString(),
            };
          })
          .filter((p) => p !== null);

        await apiClient.post("/attendance/bulk-import", { punches });
        toast.success(t("hr.toast.importSuccess", "تم استيراد الملف بنجاح"));
        setShowUploadModal(false);
        loadRecords();
      } catch {
        toast.error(t("hr.toast.importFailed", "خطأ في تنسيق الملف"));
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "--:--";
    return new Date(iso).toLocaleTimeString(isRtl ? "ar-LY" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className="p-6 text-slate-100 h-full flex flex-col space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex justify-between items-center bg-slate-900/50 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sky-500/20 rounded-2xl border border-sky-500/40">
            <ClockIcon className="w-8 h-8 text-sky-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black">{t("hr.attendance.title", "سجل الحضور الذكي")}</h1>
            <p className="text-slate-400 text-xs mt-1">
              {t("hr.attendance.subtitle", "تتبع دقيق لمواعيد العمل")}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2"
          >
            <DocumentArrowDownIcon className="w-4 h-4" /> {t("hr.attendance.importBtn", "استيراد من ملف")}
          </button>
          <button
            onClick={() => setShowManualModal(true)}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black shadow-lg"
          >
            {t("hr.attendance.manualBtn", "+ تسجيل يدوي")}
          </button>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <DatePicker
            date={new Date(dateFrom)}
            onChange={(d) => d && setDateFrom(d.toISOString().slice(0, 10))}
          />
          <DatePicker
            date={new Date(dateTo)}
            onChange={(d) => d && setDateTo(d.toISOString().slice(0, 10))}
          />
          <button onClick={loadRecords} className="p-2 bg-slate-900 rounded-lg">
            <ArrowPathIcon
              className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
        <div className="text-xs text-slate-400">
          {t("hr.attendance.recordCountLabel", "سجل:")} <span className="text-sky-400 font-bold">{records.length}</span>
        </div>
      </div>

      <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-y-auto custom-scrollbar h-full">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
              <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4 font-bold">{t("hr.attendance.employeeHeader", "الموظف")}</th>
                <th className="px-6 py-4 font-bold">{t("hr.attendance.dateHeader", "التاريخ")}</th>
                <th className="px-6 py-4 text-center font-bold">{t("hr.attendance.checkInHeader", "دخول")}</th>
                <th className="px-6 py-4 text-center font-bold">{t("hr.attendance.checkOutHeader", "خروج")}</th>
                <th className="px-6 py-4 text-center font-bold">{t("hr.attendance.delayHeader", "التأخير")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {records.map((rec) => (
                <tr key={rec.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4">
                    <div className="font-bold">{rec.user.fullName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      @{rec.user.username}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-xs">
                    {formatDate(rec.date)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg text-xs border border-emerald-500/20">
                      {formatTime(rec.checkIn)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="bg-rose-500/10 text-rose-400 px-3 py-1 rounded-lg text-xs border border-rose-500/20">
                      {formatTime(rec.checkOut)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-rose-400">
                    {rec.lateMinutes > 0 ? t("hr.attendance.delayMinutes", "{{minutes}} د", { minutes: rec.lateMinutes }) : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals for Manual and Punch */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-sm space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <UserPlusIcon className="w-6 h-6 text-emerald-500" /> {t("hr.attendance.manualModalTitle", "تسجيل بصمة")}
            </h3>
            <div className="space-y-3">
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                value={manualData.userId}
                onChange={(e) =>
                  setManualData({ ...manualData, userId: e.target.value })
                }
              >
                <option value="">{t("hr.attendance.selectEmployeePlaceholder", "اختر الموظف...")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-xl px-3 py-2 text-sm [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:sepia-0 [&::-webkit-calendar-picker-indicator]:saturate-0 [&::-webkit-calendar-picker-indicator]:hue-rotate-180 [&::-webkit-calendar-picker-indicator]:brightness-200 [&::-webkit-calendar-picker-indicator]:contrast-100"
                value={manualData.date}
                onChange={(e) =>
                  setManualData({ ...manualData, date: e.target.value })
                }
              />
              <input
                type="time"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                value={manualData.time}
                onChange={(e) =>
                  setManualData({ ...manualData, time: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowManualModal(false)}
                className="flex-1 py-2 bg-slate-800 rounded-xl"
              >
                {t("common.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleManualPunch}
                className="flex-1 py-2 bg-emerald-600 rounded-xl font-bold"
              >
                {t("common.save", "حفظ")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-md text-center space-y-6">
            <DocumentArrowDownIcon className="w-12 h-12 text-sky-500 mx-auto" />
            <h3 className="text-xl font-bold">{t("hr.attendance.importModalTitle", "استيراد بيانات الجهاز")}</h3>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-sky-600 file:text-white cursor-pointer"
            />
            <button
              onClick={() => setShowUploadModal(false)}
              className="text-slate-500 text-sm"
            >
              {t("common.close", "إغلاق")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
