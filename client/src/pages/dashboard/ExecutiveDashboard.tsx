// src/pages/dashboard/ExecutiveDashboard.tsx

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ar } from 'date-fns/locale';
import {
  BanknotesIcon,
  UserGroupIcon,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ArchiveBoxIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ArrowPathIcon,
  CalendarIcon,
  UserIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import {
  BarChart,
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
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts";

interface ExecutiveStats {
  dailyRevenue: number;
  dailyVisits: number;
  inventoryValue: number;
  activeInpatients: number;
  totalBeds: number;
  occupancyRate: number;
  todayAppointments: number;
  completedAppointments: number;
  pendingAdmissions: number;
  emergencyCases: number;
  monthlyRevenue: number;
  lastMonthRevenue: number;
  weeklyTrend: Array<{ day: string; revenue: number; visits: number; admissions: number }>;
  departmentDistribution: Array<{ name: string; value: number; color: string; patients: number }>;
  bedStatus: Array<{ status: string; count: number; color: string }>;
  hourlyActivity: Array<{ hour: string; visits: number; appointments: number }>;
  lastUpdated: string;
  // ✅ [NEW] Enhanced KPIs
  avgLengthOfStay?: number;
  top5Diagnoses?: Array<{ code: string; name: string; count: number }>;
  revenueGrowthRate?: number;
  currentMonthRevenue?: number;
}

interface RecentActivity {
  id: number;
  type: 'admission' | 'discharge' | 'appointment' | 'emergency';
  patientName: string;
  description: string;
  timestamp: string;
  priority: 'high' | 'medium' | 'low';
}

export function ExecutiveDashboard() {
  const { t, i18n } = useTranslation();
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [refreshInterval, setRefreshInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  // Fetch executive stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['executive-stats', selectedPeriod],
    queryFn: async () => {
      const res = await apiClient.get<ExecutiveStats>("/dashboard/stats", {
        params: { period: selectedPeriod },
      });
      return res.data;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Fetch recent activities
  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: async () => {
      const res = await apiClient.get<RecentActivity[]>("/dashboard/recent-activities");
      return res.data;
    },
    refetchInterval: 15000, // Auto-refresh every 15 seconds
  });

  // Auto-refresh setup
  useEffect(() => {
    const interval = setInterval(() => {
      refetchStats();
    }, 30000);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefreshInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [refetchStats]);

  const handleManualRefresh = () => {
    refetchStats();
    toast.success(t("executiveDashboard.toast.refreshSuccess", "تم تحديث البيانات"));
  };

  const getChangePercentage = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'admission': return <BuildingOfficeIcon className="w-4 h-4" />;
      case 'discharge': return <UserIcon className="w-4 h-4" />;
      case 'appointment': return <CalendarIcon className="w-4 h-4" />;
      case 'emergency': return <ClockIcon className="w-4 h-4" />;
      default: return <ClipboardDocumentListIcon className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-400 bg-red-900/20 border-red-800';
      case 'medium': return 'text-amber-400 bg-amber-900/20 border-amber-800';
      case 'low': return 'text-green-400 bg-green-950/20 border-green-800';
      default: return 'text-slate-400 bg-slate-900/20 border-slate-800';
    }
  };

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center p-20 text-slate-500 animate-pulse">
        {t("executiveDashboard.loading", "جاري تحميل البيانات التحليلية...")}
      </div>
    );
  }

  if (!stats) return null;

  const cardClass = "bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:border-slate-700 transition-all duration-200";

  const revenueChange = getChangePercentage(stats?.dailyRevenue || 0, stats?.lastMonthRevenue || 0);
  const occupancyChange = stats?.occupancyRate || 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t("executiveDashboard.title", "لوحة المعلومات التنفيذية")}</h1>
          <p className="text-slate-400">{t("executiveDashboard.subtitle", "نظرة شاملة على الأداء اليومي والمالي والمؤشرات الحيوية")}</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Period Selector */}
          <div className="flex bg-slate-800 rounded-lg p-1">
            {(['today', 'week', 'month'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  selectedPeriod === period 
                    ? 'bg-sky-600 text-white' 
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {period === 'today' 
                  ? t("executiveDashboard.periods.today", "اليوم") 
                  : period === 'week' 
                    ? t("executiveDashboard.periods.week", "الأسبوع") 
                    : t("executiveDashboard.periods.month", "الشهر")}
              </button>
            ))}
          </div>
          
          {/* Refresh Button */}
          <button
            onClick={handleManualRefresh}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            title={t("executiveDashboard.refreshData", "تحديث البيانات")}
          >
            <ArrowPathIcon className="w-5 h-5 text-slate-300" />
          </button>
          
          {/* Last Updated */}
          <div className="text-xs text-slate-500 font-mono">
            {t("executiveDashboard.lastUpdated", "آخر تحديث: ")}
            {stats?.lastUpdated ? new Date(stats.lastUpdated).toLocaleTimeString(i18n.language === 'ar' ? 'ar-LY' : 'en-US') : '--:--'}
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Daily Revenue */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">{t("executiveDashboard.kpi.dailyRevenue", "الإيرادات اليومية")}</span>
            <BanknotesIcon className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mb-2">
            {(stats?.dailyRevenue || 0).toLocaleString()} {t("common.currency.lyd", "د.ل")}
          </div>
          <div className="flex items-center gap-2 text-xs">
            {revenueChange >= 0 ? (
              <ArrowTrendingUpIcon className="w-4 h-4 text-emerald-400" />
            ) : (
              <ArrowTrendingDownIcon className="w-4 h-4 text-red-400" />
            )}
            <span className={revenueChange >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {Math.abs(revenueChange).toFixed(1)}% {t("executiveDashboard.kpi.vsLastMonth", "عن الشهر الماضي")}
            </span>
          </div>
        </div>

        {/* Daily Visits */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">{t("executiveDashboard.kpi.dailyVisits", "الزيارات اليوم")}</span>
            <UserGroupIcon className="w-5 h-5 text-sky-500" />
          </div>
          <div className="text-2xl font-bold text-white mb-2">
            {stats?.dailyVisits || 0}
          </div>
          <div className="text-xs text-slate-400">
            {stats?.todayAppointments || 0} {t("executiveDashboard.kpi.scheduledAppointments", "موعد محدد")}
          </div>
        </div>

        {/* Occupancy Rate */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">{t("executiveDashboard.kpi.occupancyRate", "نسبة الإشغال")}</span>
            <BuildingOfficeIcon className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-white mb-2">
            {(occupancyChange || 0).toFixed(1)}%
          </div>
          <div className="text-xs text-slate-400">
            {stats?.activeInpatients || 0} {t("executiveDashboard.kpi.of", "من")} {stats?.totalBeds || 0} {t("executiveDashboard.kpi.beds", "سرير")}
          </div>
        </div>

        {/* Emergency Cases */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">{t("executiveDashboard.kpi.emergencyCases", "حالات الطوارئ")}</span>
            <ClockIcon className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-400 mb-2">
            {stats?.emergencyCases || 0}
          </div>
          <div className="text-xs text-slate-400">
            {stats?.pendingAdmissions || 0} {t("executiveDashboard.kpi.pending", "في الانتظار")}
          </div>
        </div>
      </div>

      {/* ✅ [NEW] Enhanced KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Average Length of Stay */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">{t("executiveDashboard.kpi.avgLengthOfStay", "متوسط مدة الإقامة")}</span>
            <ClockIcon className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-indigo-400 mb-2">
            {stats.avgLengthOfStay || 0} <span className="text-sm text-slate-500">{t("executiveDashboard.kpi.days", "يوم")}</span>
          </div>
          <div className="text-xs text-slate-400">{t("executiveDashboard.kpi.ofLastDischarges", "من آخر 100 حالة خروج")}</div>
        </div>

        {/* Revenue Growth Rate */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">{t("executiveDashboard.kpi.monthlyRevenueGrowth", "نمو الإيرادات الشهري")}</span>
            <ChartBarIcon className="w-5 h-5 text-cyan-500" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-2xl font-bold ${(stats.revenueGrowthRate || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {(stats.revenueGrowthRate || 0) >= 0 ? '+' : ''}{stats.revenueGrowthRate || 0}%
            </span>
            {(stats.revenueGrowthRate || 0) >= 0 ? (
              <ArrowTrendingUpIcon className="w-5 h-5 text-emerald-400" />
            ) : (
              <ArrowTrendingDownIcon className="w-5 h-5 text-red-400" />
            )}
          </div>
          <div className="text-xs text-slate-400">
            {(stats.currentMonthRevenue || 0).toLocaleString()} {t("common.currency.lyd", "د.ل")} {t("executiveDashboard.kpi.thisMonth", "هذا الشهر")}
          </div>
        </div>

        {/* Top 5 Diagnoses */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-sm">{t("executiveDashboard.kpi.top5Diagnoses", "أعلى 5 تشخيصات")}</span>
            <ClipboardDocumentListIcon className="w-5 h-5 text-amber-500" />
          </div>
          <div className="space-y-2">
            {(stats.top5Diagnoses || []).length > 0 ? (
              (stats.top5Diagnoses || []).map((d, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2 truncate flex-1">
                    <span className="bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-mono">{d.code}</span>
                    <span className="text-slate-300 truncate">{d.name}</span>
                  </div>
                  <span className="text-slate-400 font-mono mr-2">{d.count}</span>
                </div>
              ))
            ) : (
              <div className="text-center text-slate-500 py-4">{t("executiveDashboard.noData", "لا توجد بيانات")}</div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Performance Chart */}
        <div className={`lg:col-span-2 ${cardClass} h-96`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-slate-300 font-bold">{t("executiveDashboard.charts.weeklyPerformance", "الأداء الأسبوعي")}</h3>
            <ChartBarIcon className="w-5 h-5 text-slate-400" />
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={stats?.weeklyTrend || [
                { day: t("executiveDashboard.days.sat", "السبت"), revenue: 5000, visits: 120, admissions: 15 },
                { day: t("executiveDashboard.days.sun", "الأحد"), revenue: 6200, visits: 150, admissions: 18 },
                { day: t("executiveDashboard.days.mon", "الإثنين"), revenue: 7000, visits: 180, admissions: 22 },
                { day: t("executiveDashboard.days.tue", "الثلاثاء"), revenue: 5800, visits: 140, admissions: 16 },
                { day: t("executiveDashboard.days.wed", "الأربعاء"), revenue: 6500, visits: 160, admissions: 19 },
                { day: t("executiveDashboard.days.thu", "الخميس"), revenue: 8000, visits: 190, admissions: 25 },
                { day: t("executiveDashboard.days.fri", "الجمعة"), revenue: 4000, visits: 90, admissions: 12 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Legend />
              <Area type="monotone" dataKey="revenue" name={t("executiveDashboard.charts.revenue", "الإيرادات")} stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
              <Area type="monotone" dataKey="visits" name={t("executiveDashboard.charts.visits", "الزيارات")} stackId="2" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.6} />
              <Area type="monotone" dataKey="admissions" name={t("executiveDashboard.charts.admissions", "الإدخالات")} stackId="3" stroke="#818cf8" fill="#818cf8" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Department Distribution */}
        <div className={cardClass}>
          <h3 className="text-slate-300 font-bold mb-4">{t("executiveDashboard.charts.deptRevenueDistribution", "توزيع الإيرادات حسب القسم")}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={stats?.departmentDistribution || [
                  { name: t("common.pharmacy", "الصيدلية"), value: 400, color: "#10b981", patients: 45 },
                  { name: t("common.labs", "المختبر"), value: 300, color: "#38bdf8", patients: 32 },
                  { name: t("common.clinical", "العيادات"), value: 300, color: "#818cf8", patients: 28 },
                  { name: t("common.admissions", "التنويم"), value: 200, color: "#f59e0b", patients: 15 },
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {(stats?.departmentDistribution || [
                  { name: t("common.pharmacy", "الصيدلية"), value: 400, color: "#10b981", patients: 45 },
                  { name: t("common.labs", "المختبر"), value: 300, color: "#38bdf8", patients: 32 },
                  { name: t("common.clinical", "العيادات"), value: 300, color: "#818cf8", patients: 28 },
                  { name: t("common.admissions", "التنويم"), value: 200, color: "#f59e0b", patients: 15 },
                ]).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Additional Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bed Status */}
        <div className={cardClass}>
          <h3 className="text-slate-300 font-bold mb-4">{t("executiveDashboard.charts.bedStatus", "حالة الأسرة")}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={stats?.bedStatus || [
                { status: t("executiveDashboard.bedStatus.available", "متاح"), count: 45, color: "#10b981" },
                { status: t("executiveDashboard.bedStatus.occupied", "مشغل"), count: 78, color: "#38bdf8" },
                { status: t("executiveDashboard.bedStatus.cleaning", "تنظيف"), count: 12, color: "#f59e0b" },
                { status: t("executiveDashboard.bedStatus.maintenance", "صيانة"), count: 5, color: "#ef4444" },
                { status: t("executiveDashboard.bedStatus.reserved", "محجوز"), count: 3, color: "#818cf8" },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="status" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }}
              />
              <Bar dataKey="count" name={t("executiveDashboard.charts.bedCount", "عدد الأسرة")} fill="#38bdf8" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Activity */}
        <div className={cardClass}>
          <h3 className="text-slate-300 font-bold mb-4">{t("executiveDashboard.charts.hourlyActivity", "النشاط الساعي")}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={stats?.hourlyActivity || [
                { hour: t("executiveDashboard.hours.8am", "8ص"), visits: 15, appointments: 8 },
                { hour: t("executiveDashboard.hours.9am", "9ص"), visits: 25, appointments: 15 },
                { hour: t("executiveDashboard.hours.10am", "10ص"), visits: 35, appointments: 22 },
                { hour: t("executiveDashboard.hours.11am", "11ص"), visits: 30, appointments: 18 },
                { hour: t("executiveDashboard.hours.12pm", "12م"), visits: 20, appointments: 12 },
                { hour: t("executiveDashboard.hours.1pm", "1م"), visits: 18, appointments: 10 },
                { hour: t("executiveDashboard.hours.2pm", "2م"), visits: 22, appointments: 14 },
                { hour: t("executiveDashboard.hours.3pm", "3م"), visits: 28, appointments: 16 },
                { hour: t("executiveDashboard.hours.4pm", "4م"), visits: 25, appointments: 12 },
                { hour: t("executiveDashboard.hours.5pm", "5م"), visits: 15, appointments: 8 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }}
              />
              <Legend />
              <Line type="monotone" dataKey="visits" name={t("executiveDashboard.charts.visits", "الزيارات")} stroke="#38bdf8" strokeWidth={2} />
              <Line type="monotone" dataKey="appointments" name={t("executiveDashboard.charts.appointments", "المواعيد")} stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activities */}
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-slate-300 font-bold">{t("executiveDashboard.activities.recentActivities", "الأنشطة الحديثة")}</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            {t("executiveDashboard.activities.live", "مباشر")}
          </div>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {activitiesLoading ? (
            <div className="text-center text-slate-500 py-8">{t("executiveDashboard.activities.loading", "جاري تحميل الأنشطة...")}</div>
          ) : activities.length === 0 ? (
            <div className="text-center text-slate-500 py-8">{t("executiveDashboard.activities.noActivities", "لا توجد أنشطة حديثة")}</div>
          ) : (
            activities.slice(0, 10).map((activity) => (
              <div
                key={activity.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${getPriorityColor(activity.priority)}`}
              >
                <div className="text-slate-300">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-medium text-white">
                        {activity.patientName}
                      </div>
                      <div className="text-xs text-slate-400">
                        {activity.description}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(activity.timestamp).toLocaleTimeString(i18n.language === 'ar' ? 'ar-LY' : 'en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
