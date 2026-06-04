import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/apiClient";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCcw,
  ClipboardList,
  User,
  Calendar,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ComplianceControl {
  controlId: string;
  name: string;
  status: "PASS" | "FAIL" | "WARNING";
  details: string;
  owner?: string;
  dueDate?: string;
  evidenceLink?: string;
}

interface ComplianceReport {
  status: "READY" | "NEEDS_WORK";
  generatedAt: string;
  frameworks: string[];
  controls: ComplianceControl[];
}

const statusIcon = (status: ComplianceControl["status"]) => {
  switch (status) {
    case "PASS":
      return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
    case "FAIL":
      return <XCircle className="w-5 h-5 text-rose-400 shrink-0" />;
    case "WARNING":
      return <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
  }
};

export default function ComplianceDashboardPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const queryClient = useQueryClient();

  // Moved inside component to fix module-level t() bug
  const statusBadge = (status: ComplianceControl["status"]) => {
    const map = {
      PASS: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      FAIL: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      WARNING: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    };
    const labels = {
      PASS: t("settings.compliance.successful", "ناجح"),
      FAIL: t("settings.compliance.toFail", "فشل"),
      WARNING: t("settings.compliance.warning", "تحذير"),
    };
    return (
      <span
        className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${map[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  const { data: report, isLoading: loading } = useQuery({
    queryKey: ["complianceReport"],
    queryFn: async () => {
      const res = await apiClient.get<ComplianceReport>("/audit/compliance/report");
      return res.data;
    },
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-3">{t("settings.compliance.inspectionAndReadinessAnalysisUnderway", "جارِ الفحص وتحليل الجاهزية...")}</span>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        {t("settings.compliance.failedToLoadReport", "تعذر تحميل التقرير.")}
      </div>
    );
  }

  const passCount = report.controls.filter((c) => c.status === "PASS").length;
  const failCount = report.controls.filter((c) => c.status === "FAIL").length;
  const warnCount = report.controls.filter((c) => c.status === "WARNING").length;
  const totalControls = report.controls.length;
  const readinessPercent = totalControls > 0 ? Math.round((passCount / totalControls) * 100) : 0;

  const handleExportPDF = () => {
    toast.info(t("settings.compliance.thePdfReportIsBeingPrepared", "جاري تجهيز تقرير الـ PDF..."));
    window.print();
  };

  return (
    <div
      className="p-6 text-slate-100 h-full overflow-y-auto custom-scrollbar print:bg-white print:text-black"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            {report.status === "READY" ? (
              <ShieldCheck className="w-8 h-8 text-emerald-500" />
            ) : (
              <ShieldAlert className="w-8 h-8 text-amber-500" />
            )}
            {t("settings.compliance.securityReadinessDashboard", "لوحة الجاهزية الأمنية")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t("settings.compliance.readinessAssessmentAccordingTo", "تقييم مستوى الجاهزية وفق معايير")}{" "}
            {report.frameworks.join(" • ")}
          </p>
        </div>
        <div className="flex gap-3 print:hidden">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["complianceReport"] })}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            {t("settings.compliance.refresh", "تحديث")}
          </button>
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t("settings.compliance.exportPdf", "تصدير PDF")}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {/* Overall Status */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">
            {t("settings.compliance.readinessStatus", "حالة الجاهزية")}
          </div>
          <div className="text-2xl font-black">
            {report.status === "READY" ? (
              <span className="text-emerald-500">{t("settings.compliance.ready", "جاهز (Ready)")}</span>
            ) : (
              <span className="text-amber-500">{t("settings.compliance.needsWork", "يحتاج عمل (Needs Work)")}</span>
            )}
          </div>
        </div>

        {/* Pass Rate */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">
            {t("settings.compliance.passRate", "نسبة النجاح")}
          </div>
          <div
            className={`text-3xl font-black ${readinessPercent >= 75 ? "text-emerald-500" : readinessPercent >= 50 ? "text-amber-500" : "text-rose-500"}`}
          >
            {readinessPercent}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {passCount} {t("settings.compliance.outOf", "من")} {totalControls} {t("settings.compliance.control", "ضابط")}
          </div>
        </div>

        {/* Fail Count */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">
            {t("settings.compliance.failedControls", "ضوابط فاشلة")}
          </div>
          <div
            className={`text-3xl font-black ${failCount === 0 ? "text-emerald-500" : "text-rose-500"}`}
          >
            {failCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t("settings.compliance.requiresImmediateRepair", "تتطلب إصلاح فوري")}</div>
        </div>

        {/* Warning Count */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">{t("settings.compliance.warnings", "تحذيرات")}</div>
          <div
            className={`text-3xl font-black ${warnCount === 0 ? "text-emerald-500" : "text-amber-500"}`}
          >
            {warnCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t("settings.compliance.needReview", "تحتاج مراجعة")}</div>
        </div>
      </div>

      {/* Readiness Progress Bar */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 mb-8 shadow-lg print:border-gray-300">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-slate-300">
            {t("settings.compliance.overallReadinessIndex", "مؤشر الجاهزية الإجمالي")}
          </span>
          <span className="text-sm text-slate-400">
            {passCount}/{totalControls} {t("settings.compliance.successfulControl", "ضابط ناجح")}
          </span>
        </div>
        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${readinessPercent >= 75 ? "bg-gradient-to-r from-emerald-600 to-emerald-400" : readinessPercent >= 50 ? "bg-gradient-to-r from-amber-600 to-amber-400" : "bg-gradient-to-r from-rose-600 to-rose-400"}`}
            style={{ width: `${readinessPercent}%` }}
          />
        </div>
      </div>

      {/* Controls Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl print:border-gray-300">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
          <ClipboardList className="w-5 h-5 text-sky-400" />
          {t("settings.compliance.detailedReadinessControls", "ضوابط الجاهزية التفصيلية")}
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-400">
              <tr>
                <th className="p-3 font-bold w-10">{t("settings.compliance.theCondition", "الحالة")}</th>
                <th className="p-3 font-bold">{t("settings.compliance.officerId", "معرّف الضابط")}</th>
                <th className="p-3 font-bold">{t("settings.compliance.theName", "الاسم")}</th>
                <th className="p-3 font-bold">{t("settings.compliance.theDetails", "التفاصيل")}</th>
                <th className="p-3 font-bold">{t("settings.compliance.responsible", "المسؤول")}</th>
                <th className="p-3 font-bold">{t("settings.compliance.deadline", "الموعد النهائي")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {report.controls.map((control) => (
                <tr
                  key={control.controlId}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="p-3">{statusIcon(control.status)}</td>
                  <td className="p-3">
                    <span className="font-mono text-xs bg-slate-800 px-2 py-1 rounded text-sky-300">
                      {control.controlId}
                    </span>
                  </td>
                  <td className="p-3 font-bold text-white">{control.name}</td>
                  <td className="p-3 text-slate-300 max-w-xs">
                    <div className="flex items-start gap-2">
                      {statusBadge(control.status)}
                      <span className="text-xs leading-relaxed">
                        {control.details}
                      </span>
                    </div>
                  </td>
                  <td className="p-3">
                    {control.owner && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <User className="w-3 h-3" />
                        {control.owner}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {control.dueDate ? (
                      <span className="flex items-center gap-1 text-xs text-amber-400">
                        <Calendar className="w-3 h-3" />
                        {new Date(control.dueDate).toLocaleDateString("en-GB")}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-8 text-center text-xs text-slate-600 print:text-black">
        {t("settings.compliance.reportGeneratedAt", "تم إنشاء التقرير في:")}{" "}
        {new Date(report.generatedAt).toLocaleString("en-GB")} | {t("settings.compliance.approvedFrameworks", "الأطر المعتمدة:")} {report.frameworks.join(" • ")}
      </div>
    </div>
  );
}
