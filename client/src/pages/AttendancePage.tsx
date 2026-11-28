// client/src/pages/AttendancePage.tsx
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
import {
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronUp,
  Cpu,
} from "lucide-react";
import {
  SarayaFilterSelect,
  SarayaPageHeader,
} from "@/components/ui/SarayaPrimitives";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BiometricDevicesModal } from "../components/hr/BiometricDevicesModal";
import {
  hrService,
  type BiometricHoursReportResponse,
} from "../services/hr.service";
import {
  exportBiometricHoursToExcel,
  exportBiometricHoursToWord,
  formatMinutesToHoursText,
  STAFF_CATEGORY_LABELS,
} from "../utils/hrExport";

type AttendanceRecord = {
  id: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: "PRESENT" | "LATE" | "ABSENT";
  lateMinutes: number;
  user?: { id: number; fullName: string; username: string } | null;
  employee?: { id: number; employeeNo: string; fullName: string } | null;
};

type UserLite = { id: number; fullName: string };

export default function AttendancePage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [activeTab, setActiveTab] = useState<"daily" | "hours">("daily");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(false);

  const [dateFrom, setDateFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  // Hours report state
  const [deptId, setDeptId] = useState("");
  const [debounceMinutes, setDebounceMinutes] = useState("3");
  const [hoursReport, setHoursReport] =
    useState<BiometricHoursReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [expandedEmpId, setExpandedEmpId] = useState<number | null>(null);

  const [showManualModal, setShowManualModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [uploading, setUploading] = useState(false);

  const [manualData, setManualData] = useState({
    userId: "",
    time: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: hrService.listDepartments,
  });

  const { data: orgInfo } = useQuery({
    queryKey: ["org-settings-basic"],
    queryFn: async () =>
      (await apiClient.get<{ hospitalName?: string; name?: string }>("/settings/organization"))
        .data,
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

  const loadHoursReport = async () => {
    setLoadingReport(true);
    try {
      const res = await hrService.getBiometricHoursReport({
        startDate: dateFrom,
        endDate: dateTo,
        departmentId: deptId ? Number(deptId) : undefined,
        debounceMinutes: Number(debounceMinutes) || 3,
      });
      setHoursReport(res);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "تعذر تحميل تقرير ساعات البصمة.",
      );
    } finally {
      setLoadingReport(false);
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

  useEffect(() => {
    if (activeTab === "hours") {
      void loadHoursReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dateFrom, dateTo, deptId]);

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
      className="text-slate-100 h-full flex flex-col space-y-4"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <SarayaPageHeader
        title={t("hr.attendance.title", "سجل الحضور الذكي وساعات البصمة")}
        subtitle={t("hr.attendance.subtitle", "تتبع دقيق لمواعيد العمل وساعات المناوبات الفعلية")}
        icon={<ClockIcon className="w-6 h-6" />}
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowBiometricModal(true)}
              data-testid="attendance-open-biometric-modal"
              className="px-3.5 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Cpu className="w-4 h-4" />
              {t("hr.attendance.biometricBtn", "أجهزة البصمة ADMS والعطلات")}
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <DocumentArrowDownIcon className="w-4 h-4" />{" "}
              {t("hr.attendance.importBtn", "استيراد من ملف")}
            </button>
            <button
              onClick={() => setShowManualModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
            >
              {t("hr.attendance.manualBtn", "+ تسجيل يدوي")}
            </button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1.5 bg-slate-900/70 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("daily")}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "daily"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-400 hover:bg-slate-800/70"
          }`}
        >
          سجل الحضور اليومي
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("hours")}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "hours"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-400 hover:bg-slate-800/70"
          }`}
        >
          تقرير ساعات البصمة الفعلية (Excel / Word)
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <DatePicker
            date={new Date(dateFrom)}
            onChange={(d) => d && setDateFrom(d.toISOString().slice(0, 10))}
          />
          <DatePicker
            date={new Date(dateTo)}
            onChange={(d) => d && setDateTo(d.toISOString().slice(0, 10))}
          />
          {activeTab === "hours" && (
            <>
              <SarayaFilterSelect
                value={deptId}
                onChange={setDeptId}
                options={departments.map((d) => ({
                  value: String(d.id),
                  label: d.name,
                }))}
                placeholder="كل الأقسام"
                allLabel="كل الأقسام"
                searchPlaceholder="ابحث عن قسم..."
                className="min-w-[180px]"
                ariaLabel="تصفية ساعات البصمة حسب القسم"
              />
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>مهلة التكرار (د):</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={debounceMinutes}
                  onChange={(e) => setDebounceMinutes(e.target.value)}
                  className="w-16 bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-center font-mono text-white"
                />
              </div>
            </>
          )}
          <button
            onClick={activeTab === "daily" ? loadRecords : loadHoursReport}
            className="p-2 bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            <ArrowPathIcon
              className={`w-5 h-5 ${
                loading || loadingReport ? "animate-spin" : ""
              }`}
            />
          </button>
        </div>

        {activeTab === "daily" ? (
          <div className="text-xs text-slate-400">
            {t("hr.attendance.recordCountLabel", "سجل:")}{" "}
            <span className="text-sky-400 font-bold">{records.length}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!hoursReport}
              onClick={() =>
                hoursReport && exportBiometricHoursToExcel(hoursReport)
              }
              className="px-3.5 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
            </button>
            <button
              type="button"
              disabled={!hoursReport}
              onClick={() =>
                hoursReport &&
                exportBiometricHoursToWord(hoursReport, {
                  hospitalName:
                    orgInfo?.hospitalName ||
                    orgInfo?.name ||
                    "منظومة السرايا الطبي",
                })
              }
              className="px-3.5 py-2 rounded-xl bg-blue-600/90 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" /> تصدير Word (.docx)
            </button>
          </div>
        )}
      </div>

      {activeTab === "daily" ? (
        <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-y-auto custom-scrollbar h-full">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
                <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                  <th className="px-6 py-4 font-bold">
                    {t("hr.attendance.employeeHeader", "الموظف")}
                  </th>
                  <th className="px-6 py-4 font-bold">
                    {t("hr.attendance.dateHeader", "التاريخ")}
                  </th>
                  <th className="px-6 py-4 text-center font-bold">
                    {t("hr.attendance.checkInHeader", "دخول")}
                  </th>
                  <th className="px-6 py-4 text-center font-bold">
                    {t("hr.attendance.checkOutHeader", "خروج")}
                  </th>
                  <th className="px-6 py-4 text-center font-bold">
                    {t("hr.attendance.delayHeader", "التأخير")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-4">
                      <div className="font-bold">
                        {rec.employee?.fullName || rec.user?.fullName || "—"}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono flex gap-2">
                        {rec.employee?.employeeNo && (
                          <span className="text-sky-400">
                            {rec.employee.employeeNo}
                          </span>
                        )}
                        {rec.user?.username && <span>@{rec.user.username}</span>}
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
                      {rec.lateMinutes > 0
                        ? t("hr.attendance.delayMinutes", "{{minutes}} د", {
                            minutes: rec.lateMinutes,
                          })
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          {hoursReport && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <div className="text-slate-400">الموظفون المشمولون (بصمة)</div>
                <div className="text-2xl font-black text-white mt-1">
                  {hoursReport.summary.employeeCount}
                </div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <div className="text-slate-400">إجمالي الساعات الفعلية</div>
                <div className="text-2xl font-black text-sky-400 mt-1">
                  {formatMinutesToHoursText(hoursReport.summary.totalMinutes)}
                </div>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <div className="text-slate-400">بصمات ناقصة للمراجعة</div>
                <div className="text-2xl font-black text-amber-400 mt-1">
                  {hoursReport.summary.issueCount}
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 bg-slate-900/40 border border-slate-800 rounded-3xl overflow-auto shadow-2xl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3.5">الموظف والرقم الوظيفي</th>
                  <th className="px-4 py-3.5">كود البصمة</th>
                  <th className="px-4 py-3.5">القسم / التصنيف</th>
                  <th className="px-4 py-3.5 text-center">الفترات المكتملة</th>
                  <th className="px-4 py-3.5 text-center">بصمات ناقصة</th>
                  <th className="px-4 py-3.5 text-center">إجمالي الساعات</th>
                  <th className="px-4 py-3.5 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(hoursReport?.rows ?? []).map((row) => {
                  const isOpen = expandedEmpId === row.employeeId;
                  return (
                    <>
                      <tr
                        key={row.employeeId}
                        className="hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-100">
                            {row.fullName}
                          </div>
                          <div className="text-[11px] font-mono text-sky-400">
                            {row.employeeNo}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono">{row.biometricId}</td>
                        <td className="px-4 py-3">
                          <div>{row.department}</div>
                          <div className="text-[11px] text-slate-500">
                            {STAFF_CATEGORY_LABELS[row.staffCategory] ||
                              row.staffCategory}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-mono">
                          {row.periodCount}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.issueCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                              {row.issueCount}
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-400">
                          {formatMinutesToHoursText(row.totalMinutes)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedEmpId(isOpen ? null : row.employeeId)
                            }
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700"
                          >
                            {isOpen ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${row.employeeId}-details`}>
                          <td
                            colSpan={7}
                            className="bg-slate-950/60 px-6 py-4 space-y-2"
                          >
                            {row.sessions.length === 0 ? (
                              <div className="text-slate-500">
                                لا توجد فترات مسجلة خلال هذه الفترة.
                              </div>
                            ) : (
                              row.sessions.map((s) => (
                                <div
                                  key={s.workDate}
                                  className="border border-slate-800 rounded-xl p-3 space-y-1.5"
                                >
                                  <div className="font-bold text-sky-300 flex justify-between">
                                    <span>يوم العمل: {s.workDate}</span>
                                    <span>
                                      الإجمالي: {formatMinutesToHoursText(s.totalMinutes)}
                                    </span>
                                  </div>
                                  {s.periods.map((p, idx) => (
                                    <div
                                      key={idx}
                                      className="flex justify-between text-slate-300 font-mono text-[11px]"
                                    >
                                      <span>
                                        فترة {idx + 1}:{" "}
                                        {new Date(p.startTime).toLocaleString("ar-LY")} ←{" "}
                                        {new Date(p.endTime).toLocaleString("ar-LY")}
                                      </span>
                                      <span className="text-emerald-400">
                                        {formatMinutesToHoursText(p.durationMinutes)}
                                      </span>
                                    </div>
                                  ))}
                                  {s.issues.map((issue) => (
                                    <div
                                      key={issue.punchId}
                                      className="text-amber-300 text-[11px]"
                                    >
                                      ⚠ {new Date(issue.punchedAt).toLocaleString("ar-LY")} —{" "}
                                      {issue.reason}
                                    </div>
                                  ))}
                                </div>
                              ))
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals for Manual and Punch */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-sm space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <UserPlusIcon className="w-6 h-6 text-emerald-500" />{" "}
              {t("hr.attendance.manualModalTitle", "تسجيل بصمة")}
            </h3>
            <div className="space-y-3">
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm"
                value={manualData.userId}
                onChange={(e) =>
                  setManualData({ ...manualData, userId: e.target.value })
                }
              >
                <option value="">
                  {t("hr.attendance.selectEmployeePlaceholder", "اختر الموظف...")}
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="w-full bg-slate-800 border border-slate-600 text-slate-100 rounded-xl px-3 py-2 text-sm"
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
            <h3 className="text-xl font-bold">
              {t("hr.attendance.importModalTitle", "استيراد بيانات الجهاز")}
            </h3>
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

      {showBiometricModal && (
        <BiometricDevicesModal
          onClose={() => {
            setShowBiometricModal(false);
            void loadRecords();
          }}
        />
      )}
    </div>
  );
}
