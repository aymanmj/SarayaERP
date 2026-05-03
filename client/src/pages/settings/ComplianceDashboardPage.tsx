import { useEffect, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertTriangle, Ghost, Download, CheckCircle2, XCircle } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from "recharts";

interface ComplianceReport {
  timestamp: string;
  generatedBy: string;
  auditIntegrity: {
    totalLogsChecked: number;
    tamperedLogsCount: number;
    isValid: boolean;
  };
  ghostAccounts: {
    count: number;
    users: Array<{
      id: number;
      username: string;
      fullName: string;
      lastLogin: string | null;
      roles: string[];
    }>;
  };
  mfaCompliance: {
    totalUsers: number;
    mfaEnabledCount: number;
    complianceRate: number;
  };
  passwordPolicies: {
    expiredPasswordsCount: number;
  };
  overallStatus: "COMPLIANT" | "NON_COMPLIANT" | "WARNING";
}

export default function ComplianceDashboardPage() {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ComplianceReport>("/audit/compliance-report");
      setReport(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل تحميل تقرير الامتثال");
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
        <span className="ml-3">جارِ الفحص وتحليل الامتثال...</span>
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

  const COLORS = ["#10b981", "#f43f5e", "#f59e0b", "#3b82f6"];

  const mfaData = [
    { name: "مفعل", value: report.mfaCompliance.mfaEnabledCount },
    { name: "غير مفعل", value: report.mfaCompliance.totalUsers - report.mfaCompliance.mfaEnabledCount }
  ];

  const handleExportPDF = () => {
    toast.info("جاري تجهيز تقرير الـ PDF...");
    window.print();
  };

  return (
    <div className="p-6 text-slate-100 h-full overflow-y-auto custom-scrollbar print:bg-white print:text-black" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <ShieldCheck className={`w-8 h-8 ${report.overallStatus === 'COMPLIANT' ? 'text-emerald-500' : 'text-rose-500'}`} />
            لوحة الامتثال والأمان (ISO 27001 / SOC 2)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            مراقبة وتدقيق سياسات الأمان، سجلات التدقيق، وحسابات المستخدمين النشطة.
          </p>
        </div>
        <div className="flex gap-3 print:hidden">
          <button 
            onClick={fetchReport}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2"
          >
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
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300 print:text-black">
          <div className="text-sm text-slate-400 mb-2 font-bold">الحالة العامة</div>
          <div className="text-2xl font-black flex items-center gap-2">
            {report.overallStatus === "COMPLIANT" && <span className="text-emerald-500">متوافق (Compliant)</span>}
            {report.overallStatus === "NON_COMPLIANT" && <span className="text-rose-500">غير متوافق (Non-Compliant)</span>}
            {report.overallStatus === "WARNING" && <span className="text-amber-500">تحذير (Warning)</span>}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">سلامة سجلات التدقيق (Hash Chain)</div>
          <div className="text-2xl font-black flex items-center gap-2">
            {report.auditIntegrity.isValid ? (
              <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-5 h-5"/> سليم 100%</span>
            ) : (
              <span className="text-rose-500 flex items-center gap-1"><AlertTriangle className="w-5 h-5"/> تم التلاعب!</span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-2">السجلات المفحوصة: {report.auditIntegrity.totalLogsChecked}</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">الحسابات المهجورة (Ghost Accounts)</div>
          <div className="text-2xl font-black flex items-center gap-2">
            {report.ghostAccounts.count === 0 ? (
              <span className="text-emerald-500">0 حساب</span>
            ) : (
              <span className="text-amber-500 flex items-center gap-1"><Ghost className="w-5 h-5"/> {report.ghostAccounts.count} حسابات</span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-2"> 30 يوم بلا تسجيل دخول</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden print:border-gray-300">
          <div className="text-sm text-slate-400 mb-2 font-bold">نسبة الامتثال للـ MFA</div>
          <div className="text-2xl font-black flex items-center gap-2">
            <span className={report.mfaCompliance.complianceRate >= 90 ? "text-emerald-500" : "text-rose-500"}>
              {report.mfaCompliance.complianceRate}%
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-2">{report.mfaCompliance.mfaEnabledCount} من {report.mfaCompliance.totalUsers} مفعل</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ghost Accounts List */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl print:border-gray-300">
          <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2 mb-6">
            <Ghost className="w-5 h-5" />
            الحسابات المهجورة (تحتاج إلى إيقاف)
          </h3>
          
          {report.ghostAccounts.users.length === 0 ? (
            <div className="text-center py-10 text-emerald-500 font-bold">
              لا توجد حسابات مهجورة. الامتثال محقق.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-950/50 text-slate-400">
                  <tr>
                    <th className="p-3 font-bold">المستخدم</th>
                    <th className="p-3 font-bold">الأدوار</th>
                    <th className="p-3 font-bold">آخر دخول</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {report.ghostAccounts.users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-800/30">
                      <td className="p-3">
                        <div className="font-bold text-white">{u.fullName}</div>
                        <div className="text-xs text-slate-500">@{u.username}</div>
                      </td>
                      <td className="p-3 text-xs text-sky-400">{u.roles.join(", ")}</td>
                      <td className="p-3 text-amber-400">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "لم يدخل أبداً"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Charts & Graphics */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl print:border-gray-300">
          <h3 className="text-lg font-bold text-sky-400 flex items-center gap-2 mb-6">
            <ShieldCheck className="w-5 h-5" />
            الامتثال للمصادقة الثنائية (MFA)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mfaData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {mfaData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? COLORS[0] : COLORS[1]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-center text-sm text-slate-400">
            وفقاً لسياسات (SOC 2)، يجب أن تكون نسبة الامتثال للمصادقة الثنائية 100% للحسابات الإدارية.
          </div>
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="mt-8 text-center text-xs text-slate-600 print:text-black">
        تم إنشاء التقرير في: {new Date(report.timestamp).toLocaleString()} | بواسطة: {report.generatedBy}
      </div>
    </div>
  );
}
