import { useTranslation } from "react-i18next";
// src/pages/ReportsDashboardPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import {
  AreaChart,
  Area,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  BarChart,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { toast } from "sonner";

const COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#f43f5e",
  "#6366f1",
];

export default function ReportsDashboardPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

   
  const [financialData, setFinancialData] = useState<any[]>([]);
   
  const [operationalData, setOperationalData] = useState<any[]>([]);
   
  const [kpis, setKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [finRes, opRes, kpiRes] = await Promise.all([
          apiClient.get("/reports/financial-summary"),
          apiClient.get("/reports/operational-stats"),
          apiClient.get("/reports/operational-kpis"), // تأكد من إضافة هذا الـ Endpoint في الـ Controller
        ]);
        setFinancialData(finRes.data);
        setOperationalData(opRes.data.revenueByService);
        setKpis(kpiRes.data);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        toast.error("فشل تحميل البيانات التحليلية");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

   
  const KPICard = ({ title, value, unit, color }: any) => (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-sm">
      <div className="text-xs text-slate-500 font-bold mb-2 uppercase tracking-wider">
        {title}
      </div>
      <div className={`text-3xl font-black ${color}`}>
        {value} <small className="text-sm font-normal opacity-60">{unit}</small>
      </div>
    </div>
  );

  if (loading)
    return (
      <div className="p-10 text-center text-slate-500 animate-pulse">
        جاري إعداد التقارير الاستراتيجية...
      </div>
    );

  return (
    <div className="p-6 text-slate-100 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex justify-between items-end mb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            التحليلات الاستراتيجية
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            نظام دعم القرار - Decision Support System
          </p>
        </div>
      </div>

      {/* 1. KPIs Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KPICard
          title="إشغال الأسرة"
          value={kpis?.occupancyRate}
          unit="%"
          color="text-sky-400"
        />
        <KPICard
          title="إجمالي المرضى"
          value={kpis?.totalPatients}
          unit="مسجل"
          color="text-emerald-400"
        />
        <KPICard
          title="الحالات النشطة"
          value={kpis?.activeCases}
          unit="حالة"
          color="text-amber-400"
        />
        <KPICard
          title="صافي الربح"
          value={financialData
            .reduce((s, m) => s + m.profit, 0)
            .toLocaleString()}
          unit="LYD"
          color="text-white"
        />
      </div>

      {/* 2. Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* الربحية والنمو */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
          <h2 className="text-sm font-bold text-slate-300 mb-6">
            تحليل نمو الدخل والمصروفات
          </h2>
          <div className="h-80" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financialData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="#64748b"
                  tick={{ fontSize: 11 }}
                />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="إيرادات (محصلة)"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorRev)"
                  strokeWidth={3}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="مصروفات"
                  stroke="#f43f5e"
                  fillOpacity={0}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* توزيع الدخل حسب القسم */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
          <h2 className="text-sm font-bold text-slate-300 mb-6">
            كفاءة الأقسام
          </h2>
          <div className="h-80" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={operationalData}
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {operationalData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  wrapperStyle={{ fontSize: "10px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="text-center text-slate-600 text-[10px] uppercase tracking-widest mt-8">
        Saraya ERP • Business Intelligence Module • Version 2.0
      </div>
    </div>
  );
}