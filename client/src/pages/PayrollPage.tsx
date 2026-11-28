// src/pages/hr/PayrollPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatMoney as formatLydMoney } from "../utils/money";
import {
  BanknotesIcon,
  CheckBadgeIcon,
  TrashIcon,
  CalculatorIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Banknote, Briefcase, CheckCircle2 } from "lucide-react";
import { HrFinancialModal } from "../components/hr/HrFinancialModal";
import {
  SarayaKpiCard,
  SarayaLtrBadge,
  SarayaPageHeader,
} from "../components/ui/SarayaPrimitives";

const formatMoney = (amount: number | string | null | undefined) =>
  formatLydMoney(amount, false);

export default function PayrollPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showHrFinancialModal, setShowHrFinancialModal] = useState(false);

  const getStatusLabel = (s: string) => {
    if (s === "APPROVED") return t("hr.payroll.statusApproved", "معتمد");
    if (s === "DRAFT") return t("hr.payroll.statusDraft", "مسودة");
    return s;
  };

  const loadRuns = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/payroll");
      setRuns(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (id: number) => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/payroll/${id}`);
      setSelectedRun(res.data);
    } catch {
      toast.error(t("hr.payroll.loadDetailsFailed", "فشل تحميل تفاصيل كشف المرتبات"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    try {
      await apiClient.post("/payroll/generate", { month, year });
      toast.success(t("hr.payroll.draftCreated", "تم إنشاء مسودة كشف المرتبات بنجاح"));
      loadRuns();
     
    } catch (e: any) {
      toast.error(e.response?.data?.message || t("hr.payroll.createFailed", "فشل الإنشاء"));
    }
  };

  const handleApprove = async () => {
    if (!selectedRun) return;
    if (!confirm(t("hr.payroll.confirmApprove", "هل أنت متأكد من اعتماد كشف المرتبات وترحيل القيد المحاسبي؟")))
      return;
    setApproving(true);
    try {
      await apiClient.post(`/payroll/${selectedRun.id}/approve`);
      toast.success(t("hr.payroll.approveSuccess", "تم اعتماد كشف المرتبات والترحيل للمالية بنجاح"));
      loadRuns();
      handleViewDetails(selectedRun.id);
    } catch {
      toast.error(t("hr.payroll.approveFailed", "فشل اعتماد كشف المرتبات"));
    } finally {
      setApproving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("hr.payroll.confirmDelete", "حذف المسودة نهائياً؟"))) return;
    try {
      await apiClient.delete(`/payroll/${id}`);
      toast.success(t("hr.payroll.deleteSuccess", "تم الحذف"));
      setSelectedRun(null);
      loadRuns();
    } catch {
      toast.error(t("hr.payroll.deleteFailed", "لا يمكن حذف كشف مرتبات معتمد"));
    }
  };

  return (
    <div
      className="h-full flex flex-col space-y-4 text-slate-100"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <SarayaPageHeader
        title={t("hr.payroll.pageTitle", "مسير الرواتب والأجور والاستقطاعات")}
        subtitle={t(
          "hr.payroll.pageSubtitle",
          "إصدار كشوف المرتبات الشهرية للكوادر والترحيل المحاسبي الآلي بدقة ثلاثية",
        )}
        icon={<Banknote className="w-6 h-6" />}
        actions={
          <button
            type="button"
            onClick={() => setShowHrFinancialModal(true)}
            data-testid="payroll-open-cap11-modal"
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Briefcase className="w-4 h-4" />
            {t("hr.payroll.cap11Governance", "تصنيفات الصرف والسلف والاستقطاعات ونهاية الخدمة")}
          </button>
        }
      />

      {/* 📊 Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SarayaKpiCard
          label={t("hr.payroll.lastTotalNetLabel", "إجمالي آخر كشف مرتبات")}
          value={`${formatMoney(runs[0]?.totalNet || 0)} ${t("common.lyd", "د.ل")}`}
          accent="emerald"
          ltrValue
          icon={<BanknotesIcon className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="إجمالي الدورات الصادرة"
          value={runs.length}
          accent="sky"
          ltrValue
          icon={<DocumentTextIcon className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="كشوف معتمدة ومرحّلة"
          value={runs.filter((r) => r.status === "APPROVED").length}
          accent="indigo"
          ltrValue
          icon={<CheckBadgeIcon className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="مسودات قيد المراجعة"
          value={runs.filter((r) => r.status === "DRAFT").length}
          accent="amber"
          ltrValue
          icon={<CalculatorIcon className="w-5 h-5" />}
        />
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden">
        {/* Sidebar */}
        <div className="w-full lg:w-72 flex flex-col gap-3 shrink-0">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
            <h3 className="text-xs font-bold flex items-center gap-2 text-slate-200">
              <CalculatorIcon className="w-4 h-4 text-sky-400" /> {t("hr.payroll.newPayrollTitle", "كشف مرتبات جديد")}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(+e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs font-mono"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(+e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-xs text-center font-mono"
              />
            </div>
            <button
              onClick={handleGenerate}
              className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
            >
              {t("hr.payroll.generateBtn", "بدء التوليد")}
            </button>
          </div>

          <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-xl p-4 overflow-y-auto custom-scrollbar shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 mb-3">
              {t("hr.payroll.historyTitle", "السجل التاريخي")}
            </h3>
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  onClick={() => handleViewDetails(run.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedRun?.id === run.id ? "bg-sky-500/15 border-sky-500/50" : "bg-slate-950/60 border-slate-800 hover:bg-slate-800/40"}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span dir="ltr" className="font-bold font-mono text-xs tabular-nums">
                      {run.month} / {run.year}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${run.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"}`}
                    >
                      {getStatusLabel(run.status)}
                    </span>
                  </div>
                  <div dir="ltr" className={`text-xs text-slate-400 font-mono tabular-nums ${isRtl ? "text-right" : "text-left"}`}>
                    {formatMoney(run.totalNet)} {t("common.lyd", "د.ل")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Details */}
        <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-sm">
          {!selectedRun ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-16">
              <DocumentTextIcon className="w-12 h-12 opacity-20 mb-3" />
              <p className="text-sm">{t("hr.payroll.selectPayrollPrompt", "اختر كشف مرتبات للمراجعة")}</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3 bg-slate-950/40">
                <div>
                  <h2 className="text-base md:text-lg font-extrabold">
                    {t("hr.payroll.detailsTitle", "تفاصيل كشف المرتبات {{month}} / {{year}}", { month: selectedRun.month, year: selectedRun.year })}
                  </h2>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {t("hr.payroll.detailsSubtitle", "الحالة: {{status}} | إجمالي كشف المرتبات: {{total}}", { status: getStatusLabel(selectedRun.status), total: `${formatMoney(selectedRun.totalNet)} ${t("common.lyd", "د.ل")}` })}
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedRun.status === "DRAFT" && (
                    <>
                      <button
                        onClick={() => handleDelete(selectedRun.id)}
                        className="p-2 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-xl hover:bg-rose-500/25 cursor-pointer"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={approving}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {t("hr.payroll.approveBtn", "اعتماد وترحيل مالي")}
                      </button>
                    </>
                  )}
                  {selectedRun.status === "APPROVED" && (
                    <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold">
                      <CheckBadgeIcon className="w-4 h-4" /> {t("hr.payroll.approvedBadge", "تم الترحيل للمالية")}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-950/70 text-slate-400 sticky top-0 backdrop-blur z-10">
                    <tr className="text-xs border-b border-slate-800">
                      <th className="px-4 py-3 font-bold">{t("hr.payroll.employeeHeader", "الموظف")}</th>
                      <th className="px-4 py-3 font-bold">{t("hr.payroll.basicHeader", "الأساسي")}</th>
                      <th className="px-4 py-3 font-bold">{t("hr.payroll.allowanceHeader", "علاوات/عمولات")}</th>
                      <th className="px-4 py-3 font-bold text-rose-400">{t("hr.payroll.deductionsHeader", "خصومات")}</th>
                      <th className="px-4 py-3 text-emerald-400 font-black">
                        {t("hr.payroll.netHeader", "الصافي")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {selectedRun.slips &&
                      selectedRun.slips.map((slip: any) => (
                        <tr
                          key={slip.id}
                          className="hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-100">
                              {slip.employee?.fullName || slip.user?.fullName || "—"}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1">
                              {slip.employee?.employeeNo && (
                                <SarayaLtrBadge className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-400">
                                  {slip.employee.employeeNo}
                                </SarayaLtrBadge>
                              )}
                              {slip.user?.username ? (
                                <SarayaLtrBadge className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  @{slip.user.username}
                                </SarayaLtrBadge>
                              ) : (
                                <span className="text-amber-400 text-[11px]">
                                  بدون حساب نظام
                                </span>
                              )}
                              {slip.employee?.currency && (
                                <span className="text-slate-400 font-mono text-[10px]">
                                  ({slip.employee.currency})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-200">
                            <span dir="ltr" className="font-mono tabular-nums">
                              {formatMoney(slip.basicSalary)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sky-400">
                            <span dir="ltr" className="font-mono tabular-nums">
                              {formatMoney(slip.totalAllowances ?? slip.otherAllowance)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-rose-400">
                            <span dir="ltr" className="font-mono tabular-nums">
                              {formatMoney(slip.deductions)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-emerald-400 font-black">
                            <span dir="ltr" className="font-mono tabular-nums">
                              {formatMoney(slip.netSalary)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {showHrFinancialModal && (
        <HrFinancialModal onClose={() => setShowHrFinancialModal(false)} />
      )}
    </div>
  );
}
