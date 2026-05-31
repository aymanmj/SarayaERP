import { useTranslation } from "react-i18next";
// src/pages/ClinicalKpisPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";

export default function ClinicalKpisPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

   
  const [kpis, setKpis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await apiClient.get("/analytics/clinical-kpis");
        setKpis(res.data);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        toast.error("فشل تحميل المؤشرات السريرية");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

   
  const KPICard = ({ title, value, unit, color, icon, description }: any) => (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-sm hover:border-slate-700 transition-all group">
      <div className="flex justify-between items-start mb-4">
        <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">
          {title}
        </div>
        <div className={`text-2xl opacity-80 group-hover:opacity-100 transition-opacity ${color}`}>
          {icon}
        </div>
      </div>
      <div className={`text-4xl font-black ${color} mb-2`}>
        {value} <span className="text-sm font-normal opacity-60 ml-1">{unit}</span>
      </div>
      <div className="text-xs text-slate-500">{description}</div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-10 flex flex-col items-center justify-center h-full text-slate-500 animate-pulse">
        <div className="text-4xl mb-4">📊</div>
        <div>جاري تجميع المؤشرات السريرية (HIMSS Quality Metrics)...</div>
      </div>
    );
  }

  // Mock data for the chart to show trends over the last 6 months
  const trendData = [
    { name: "يناير", readmission: 12, override: 8, gapClosure: 70 },
    { name: "فبراير", readmission: 11, override: 9, gapClosure: 72 },
    { name: "مارس", readmission: 14, override: 7, gapClosure: 68 },
    { name: "أبريل", readmission: 9, override: 5, gapClosure: 75 },
    { name: "مايو", readmission: 8, override: 4, gapClosure: 80 },
    { name: "يونيو", readmission: Number(kpis?.readmissionRate?.toFixed(1) || 0), override: Number(kpis?.medicationOverrideRate?.toFixed(1) || 0), gapClosure: Number(kpis?.careGapClosureRate?.toFixed(1) || 0) },
  ];

  return (
    <div className="p-6 text-slate-100 h-full overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex justify-between items-end mb-8 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-fuchsia-400 bg-fuchsia-400/10 p-2 rounded-xl text-xl">🎯</span>
            <h1 className="text-3xl font-black tracking-tight text-white">
              مؤشرات الأداء السريري والجودة
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            لوحة تحكم مدير الجودة - مؤشرات جودة الرعاية الصحية (HIMSS Stage 6/7)
          </p>
        </div>
        <div className="text-xs font-mono bg-slate-800 text-slate-400 px-3 py-1.5 rounded-lg border border-slate-700">
          Last 30 Days
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <KPICard
          title="معدل إعادة التنويم"
          value={kpis?.readmissionRate?.toFixed(1) || 0}
          unit="%"
          color="text-rose-400"
          icon="🔄"
          description="إعادة التنويم خلال 30 يوماً من الخروج"
        />
        <KPICard
          title="متوسط مدة الإقامة (ALOS)"
          value={kpis?.averageLengthOfStay?.toFixed(1) || 0}
          unit="أيام"
          color="text-amber-400"
          icon="⏳"
          description="متوسط بقاء المريض في المستشفى"
        />
        <KPICard
          title="تجاوزات التنبيهات الدوائية"
          value={kpis?.medicationOverrideRate?.toFixed(1) || 0}
          unit="%"
          color="text-fuchsia-400"
          icon="⚠️"
          description="نسبة تجاهل الأطباء لتحذيرات النظام"
        />
        <KPICard
          title="إجهاد التنبيهات (Fatigue)"
          value={kpis?.alertFatigueRate?.toFixed(1) || 0}
          unit="%"
          color="text-purple-400"
          icon="🔔"
          description="نسبة الإلغاء السريع للتنبيهات"
        />
        <KPICard
          title="إغلاق فجوات الرعاية"
          value={kpis?.careGapClosureRate?.toFixed(1) || 0}
          unit="%"
          color="text-emerald-400"
          icon="✅"
          description="مدى التزام الطاقم بالبروتوكولات الوقائية"
        />
      </div>

      {/* Analytics Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-slate-200">
            تحليل اتجاهات الجودة (Quality Trends)
          </h2>
          <div className="flex gap-4 text-xs font-bold">
            <div className="flex items-center gap-2 text-rose-400">
              <div className="w-3 h-3 rounded-full bg-rose-500"></div>
              إعادة التنويم
            </div>
            <div className="flex items-center gap-2 text-emerald-400">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              إغلاق الفجوات
            </div>
          </div>
        </div>
        <div className="h-80" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorReadmission" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorGap" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "12px",
                }}
                itemStyle={{ fontWeight: 'bold' }}
              />
              <Area
                type="monotone"
                dataKey="readmission"
                name="معدل إعادة التنويم (%)"
                stroke="#f43f5e"
                fillOpacity={1}
                fill="url(#colorReadmission)"
                strokeWidth={3}
              />
              <Area
                type="monotone"
                dataKey="gapClosure"
                name="إغلاق فجوات الرعاية (%)"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorGap)"
                strokeWidth={3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
    </div>
  );
}
