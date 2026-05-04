import { useEffect, useState } from "react";
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

const statusBadge = (status: ComplianceControl["status"]) => {
  const map = {
    PASS: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    FAIL: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    WARNING: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };
  const labels = { PASS: "ناجح", FAIL: "فشل", WARNING: "تحذير" };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${map[status]}`}
    >
      {labels[status]}
    </span>
  );
};

export default function ComplianceDashboardPage() {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ComplianceReport>(
        "/audit/compliance/report"
      );
      setReport(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل تحميل تقرير الجاهزية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-3">جارِ الفحص وتحليل الجاهزية...</span>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        تعذر تحميل التقرير.
      </div>
    );
  }

  const passCount = report.controls.filter((c) => c.status === "PASS").length;
  const failCount = report.controls.filter((c) => c.status === "FAIL").length;
  const warnCount = report.controls.filter(
    (c) => c.status === "WARNING"
  ).length;
  const totalControls = report.controls.length;
  const readinessPercent = Math.round((passCount / totalControls) * 100);

  const handleExportPDF = () => {
    toast.info("جاري تجهيز تقرير الـ PDF...");
    window.print();
  };

  return (
    <div
      className="p-6 text-slate-100 h-full overflow-y-auto custom-scrollbar print:bg-white print:text-black"
      dir="rtl"
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
            لوحة الجاهزية الأمنية
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            تقييم مستوى الجاهزية وفق معايير{" "}
            {report.frameworks.join(" • ")}
          </p>
        </div>
        <div className="flex gap-3 print:hidden">
          <button
            onClick={fetchReport}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            تحديث
          </button>
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            تصدير PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {/* Overall Status */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">
            حالة الجاهزية
          </div>
          <div className="text-2xl font-black">
            {report.status === "READY" ? (
              <span className="text-emerald-500">جاهز (Ready)</span>
            ) : (
              <span className="text-amber-500">يحتاج عمل (Needs Work)</span>
            )}
          </div>
        </div>

        {/* Pass Rate */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">
            نسبة النجاح
          </div>
          <div
            className={`text-3xl font-black ${readinessPercent >= 75 ? "text-emerald-500" : readinessPercent >= 50 ? "text-amber-500" : "text-rose-500"}`}
          >
            {readinessPercent}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {passCount} من {totalControls} ضابط
          </div>
        </div>

        {/* Fail Count */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">
            ضوابط فاشلة
          </div>
          <div
            className={`text-3xl font-black ${failCount === 0 ? "text-emerald-500" : "text-rose-500"}`}
          >
            {failCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">تتطلب إصلاح فوري</div>
        </div>

        {/* Warning Count */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">تحذيرات</div>
          <div
            className={`text-3xl font-black ${warnCount === 0 ? "text-emerald-500" : "text-amber-500"}`}
          >
            {warnCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">تحتاج مراجعة</div>
        </div>
      </div>

      {/* Readiness Progress Bar */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 mb-8 shadow-lg print:border-gray-300">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-slate-300">
            مؤشر الجاهزية الإجمالي
          </span>
          <span className="text-sm text-slate-400">
            {passCount}/{totalControls} ضابط ناجح
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
          ضوابط الجاهزية التفصيلية
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-400">
              <tr>
                <th className="p-3 font-bold w-10">الحالة</th>
                <th className="p-3 font-bold">معرّف الضابط</th>
                <th className="p-3 font-bold">الاسم</th>
                <th className="p-3 font-bold">التفاصيل</th>
                <th className="p-3 font-bold">المسؤول</th>
                <th className="p-3 font-bold">الموعد النهائي</th>
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
        تم إنشاء التقرير في:{" "}
        {new Date(report.generatedAt).toLocaleString("en-GB")} | الأطر
        المعتمدة: {report.frameworks.join(" • ")}
      </div>
    </div>
  );
}
