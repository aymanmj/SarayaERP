// src/pages/DashboardPage.tsx

import { useAuthStore } from "../stores/authStore";
import { apiClient } from "../api/apiClient";
import { useQuery } from "@tanstack/react-query";
import { 
  UserGroupIcon, 
  CalendarIcon, 
  BanknotesIcon, 
  ExclamationTriangleIcon,
  ChartBarIcon,
  BuildingOfficeIcon,
  ClockIcon,
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  BeakerIcon,
  ArrowTrendingUpIcon
} from "@heroicons/react/24/outline";

// Types
type DashboardStats = {
  activeInpatients: number;
  occupiedBeds: number;
  totalBeds: number;
  occupancyRate: number;
  appointmentsToday: number;
  todayRevenue: number;
  lowStockCount: number;
  isPersonalRevenue?: boolean;
  hasRevenueAccess?: boolean;
};

type LicenseDetails = {
  hospitalName: string;
  expiryDate: string;
  plan: string;
  maxUsers: number; // -1 means unlimited
};

type LicenseInfoResponse = {
  machineId: string;
  isValid: boolean;
  details: LicenseDetails;
};

import { useState, useEffect } from "react";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [dbStatus, setDbStatus] = useState<"ACTIVE" | "ERROR" | "CHECKING">("CHECKING");

  // 1. Fetch Stats
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ["dashboardStats", user?.hospitalId],
    queryFn: async () => {
      const start = performance.now();
      const res = await apiClient.get<DashboardStats>("/dashboard/stats");
      setApiLatency(Math.round(performance.now() - start));
      setDbStatus("ACTIVE");
      return res.data;
    },
  });

  useEffect(() => {
    if (statsError) {
      setDbStatus("ERROR");
    }
  }, [statsError]);

  // 2. Fetch License Info
  const { data: licenseInfo, isLoading: licenseLoading } = useQuery({
    queryKey: ["licenseInfo"],
    queryFn: async () => {
      const res = await apiClient.get<LicenseInfoResponse>("/license/info");
      return res.data;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  const license = licenseInfo?.details;
  const loading = statsLoading || licenseLoading;

  // Days Remaining Calc
  const getDaysRemaining = () => {
    if (!license) return 0;
    const end = new Date(license.expiryDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const daysLeft = getDaysRemaining();

  const getPlanLabel = (plan: string) => {
    const p = (plan || '').toUpperCase();
    if (p === "ENTERPRISE" || plan === "مؤسسة") return "مؤسسة (شامل)";
    if (p === "PRO" || plan === "احترافي") return "احترافي";
    if (p === "BASIC" || plan === "أساسي") return "أساسي";
    return plan || "أساسي";
  };

  const StatCard = ({
    title,
    value,
    subtext,
    colorClass,
    icon: Icon,
  }: {
    title: string;
    value: string | number;
    subtext: string;
    colorClass: string;
    icon: any;
  }) => (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col justify-between h-32 hover:bg-slate-900/90 transition-all duration-200 shadow-sm hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400 font-medium">{title}</div>
        <Icon className={`w-4 h-4 ${colorClass}`} />
      </div>
      <div className={`text-3xl font-bold ${colorClass}`}>
        {loading ? "..." : value}
      </div>
      <div className="text-[11px] text-slate-500">{subtext}</div>
    </div>
  );

  const QuickActionCard = ({
    title,
    description,
    icon: Icon,
    href,
    colorClass,
    badge,
  }: {
    title: string;
    description: string;
    icon: any;
    href: string;
    colorClass: string;
    badge?: string;
  }) => (
    <a
      href={href}
      className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-5 hover:bg-slate-900/60 transition-all duration-200 hover:border-slate-700 hover:shadow-lg"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10`}>
          <Icon className={`w-5 h-5 ${colorClass.replace('text-', 'text-')}`} />
        </div>
        {badge && (
          <span className="px-2 py-1 text-xs rounded-full bg-sky-900/30 text-sky-300 border border-sky-700/50">
            {badge}
          </span>
        )}
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1 group-hover:text-white transition-colors">
        {title}
      </h3>
      <p className="text-xs text-slate-400 leading-relaxed">
        {description}
      </p>
    </a>
  );

  return (
    <div className="h-full flex flex-col gap-8 pb-10">
      {/* Header & Subscription Info */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-50 mb-2">
            أهلاً {user?.fullName} 👋
          </h1>
          <p className="text-sm text-slate-400">
            لوحة التحكم الرئيسية - إدارة سريعة للمستشفى
          </p>
        </div>

        {/* License Info Card */}
        {license && (
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl p-4 flex items-center gap-6 shadow-lg">
            <div className="text-center px-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                الباقة الحالية
              </div>
              <div className="font-bold text-sky-400 bg-sky-900/20 px-3 py-1 rounded-lg border border-sky-500/20">
                {getPlanLabel(license.plan)}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-700"></div>

            <div className="text-center">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                المستخدمين
              </div>
              <div className="font-mono font-bold text-white">
                {license.maxUsers === -1 ? "∞" : license.maxUsers}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-700"></div>

            <div className="text-center">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                الصلاحية
              </div>
              <div
                className={`font-bold ${daysLeft < 30 ? "text-rose-400" : "text-emerald-400"}`}
              >
                {daysLeft} يوم
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Essential Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="المرضى المنومين"
          value={stats?.activeInpatients ?? 0}
          subtext={`إشغال: ${stats?.occupancyRate ?? 0}%`}
          colorClass="text-sky-400"
          icon={BuildingOfficeIcon}
        />

        <StatCard
          title="مواعيد اليوم"
          value={stats?.appointmentsToday ?? 0}
          subtext="إجمالي الحجوزات"
          colorClass="text-amber-400"
          icon={CalendarIcon}
        />

        {stats?.hasRevenueAccess && (
          <StatCard
            title={
              stats.isPersonalRevenue
                ? "إيرادك اليوم"
                : "إيرادات اليوم"
            }
            value={`${(stats.todayRevenue ?? 0).toLocaleString()} د.ل`}
            subtext={stats.isPersonalRevenue ? "ورديتك" : "المحصلة"}
            colorClass="text-emerald-400"
            icon={BanknotesIcon}
          />
        )}

        <StatCard
          title="نواقص المخزون"
          value={stats?.lowStockCount ?? 0}
          subtext="أصناف تحتاج طلب"
          colorClass={(stats?.lowStockCount ?? 0) > 0 ? "text-rose-400" : "text-slate-200"}
          icon={ExclamationTriangleIcon}
        />
      </div>

      {/* Quick Actions & Advanced Dashboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div>
          <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-slate-400" />
            وصول سريع
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickActionCard
              title="مكتب الدخول"
              description="إدخال المرضى الجدد وإدارة الإيواء"
              icon={ClipboardDocumentListIcon}
              href="/admissions"
              colorClass="text-blue-400"
            />
            <QuickActionCard
              title="حجز المواعيد"
              description="جدولة المواعيد للعيادات"
              icon={CalendarIcon}
              href="/appointments"
              colorClass="text-amber-400"
            />
            <QuickActionCard
              title="الخزينة"
              description="تحصيل المدفوعات وإدارة الفواتير"
              icon={CurrencyDollarIcon}
              href="/cashier"
              colorClass="text-emerald-400"
            />
            <QuickActionCard
              title="الصيدلية"
              description="إدارة الأدوية والمخزون الطبي"
              icon={BeakerIcon}
              href="/pharmacy"
              colorClass="text-purple-400"
            />
          </div>
        </div>

        {/* Advanced Dashboards */}
        <div>
          <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-slate-400" />
            لوحات تحكم متقدمة
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickActionCard
              title="لوحة تنفيذية"
              description="إحصائيات وتقارير مفصلة للمستشفى"
              icon={ArrowTrendingUpIcon}
              href="/analytics/executive"
              colorClass="text-indigo-400"
              badge="جديدة"
            />
            <QuickActionCard
              title="تخطيط الخروج"
              description="إدارة عملية خروج المرضى"
              icon={UserGroupIcon}
              href="/discharge-planning"
              colorClass="text-green-400"
              badge="محدثة"
            />
            <QuickActionCard
              title="إدارة الأسرة"
              description="مراقبة حالة الأسرة والعنابر"
              icon={BuildingOfficeIcon}
              href="/bed-management"
              colorClass="text-cyan-400"
              badge="مباشر"
            />
            <QuickActionCard
              title="التقارير"
              description="تقارير مالية وإدارية شاملة"
              icon={ChartBarIcon}
              href="/reports"
              colorClass="text-orange-400"
            />
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 mt-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">حالة النظام</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${dbStatus === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : dbStatus === 'ERROR' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'}`}></div>
            <span className="text-sm text-slate-300">قاعدة البيانات</span>
            <span className={`text-xs ${dbStatus === 'ACTIVE' ? 'text-emerald-400' : dbStatus === 'ERROR' ? 'text-rose-400' : 'text-amber-400'}`}>
              {dbStatus === 'ACTIVE' ? 'متصلة' : dbStatus === 'ERROR' ? 'خطأ' : 'جارٍ الفحص...'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${apiLatency !== null ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`}></div>
            <span className="text-sm text-slate-300">استجابة الخادم</span>
            <span className={`text-xs ${apiLatency !== null ? 'text-emerald-400' : 'text-amber-400'}`}>
              {apiLatency !== null ? `${apiLatency}ms` : 'جارٍ الفحص...'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${navigator.onLine ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
            <span className="text-sm text-slate-300">حالة الشبكة</span>
            <span className={`text-xs ${navigator.onLine ? 'text-emerald-400' : 'text-rose-400'}`}>
              {navigator.onLine ? 'متصل' : 'غير متصل'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
