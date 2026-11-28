// src/pages/DashboardPage.tsx

import { useAuthStore } from "../stores/authStore";
import { apiClient } from "../api/apiClient";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Users,
  Calendar,
  Banknote,
  AlertTriangle,
  BarChart3,
  Building2,
  Clock,
  ClipboardList,
  CircleDollarSign,
  FlaskConical,
  TrendingUp,
  FolderArchive,
  UserCheck,
} from "lucide-react";
import { SarayaKpiCard } from "../components/ui/SarayaPrimitives";

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

import { useState, useEffect, ComponentType } from "react";

// QuickActionCard Component (Moved outside to prevent re-creation during render)
interface QuickActionCardProps {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  href: string;
  colorClass: string;
  badge?: string;
}

const QuickActionCard = ({
  title,
  description,
  icon: Icon,
  href,
  colorClass,
  badge,
}: QuickActionCardProps) => (
  <a
    href={href}
    className="group rounded-xl border border-slate-800 bg-slate-900/80 p-4 hover:bg-slate-900 transition-all duration-150 hover:border-sky-500/40 shadow-sm hover:shadow-md"
  >
    <div className="flex items-start justify-between mb-2.5">
      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
        <Icon className={`w-4 h-4 ${colorClass}`} strokeWidth={1.75} />
      </div>
      {badge && (
        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
          {badge}
        </span>
      )}
    </div>
    <h3 className="text-sm font-bold text-slate-100 mb-0.5 group-hover:text-sky-400 transition-colors">
      {title}
    </h3>
    <p className="text-[11px] text-slate-400 leading-relaxed">
      {description}
    </p>
  </a>
);

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (p === "ENTERPRISE" || plan === "مؤسسة") return t("menu.enterprise", "مؤسسة (شامل)");
    if (p === "PRO" || plan === "احترافي") return t("menu.pro", "احترافي");
    if (p === "BASIC" || plan === "أساسي") return t("menu.basic", "أساسي");
    return plan || "أساسي";
  };

  return (
    <div className="h-full flex flex-col gap-5 pb-6">
      {/* Header & Subscription Info */}
      <div className={`flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/80 px-5 py-4 shadow-sm ${isRtl ? 'text-right' : 'text-left'}`}>
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-50 tracking-tight">
            {t("dashboard.welcome", { name: user?.fullName || t("dashboard.welcomeDefault", "أهلاً") })}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {t("dashboard.subTitle", "لوحة التحكم الرئيسية - إدارة سريعة للمستشفى")}
          </p>
        </div>

        {/* License Info Card */}
        {license && (
          <div className={`bg-slate-950/70 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-5 ${isRtl ? 'flex-row' : 'flex-row-reverse'}`}>
            <div className="text-center px-1">
              <div className="text-[10px] text-slate-400 font-semibold mb-1">
                {t("dashboard.licensePlan", "الباقة الحالية")}
              </div>
              <div className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-md border border-sky-500/25">
                {getPlanLabel(license.plan)}
              </div>
            </div>

            <div className="h-7 w-px bg-slate-800"></div>

            <div className="text-center">
              <div className="text-[10px] text-slate-400 font-semibold mb-1">
                {t("dashboard.licenseUsers", "المستخدمين")}
              </div>
              <div dir="ltr" className="font-mono font-bold text-sm text-slate-100 tabular-nums">
                {license.maxUsers === -1 ? "∞" : license.maxUsers}
              </div>
            </div>

            <div className="h-7 w-px bg-slate-800"></div>

            <div className="text-center">
              <div className="text-[10px] text-slate-400 font-semibold mb-1">
                {t("dashboard.licenseExpiry", "الصلاحية")}
              </div>
              <div
                className={`text-sm font-bold tabular-nums ${daysLeft < 30 ? "text-rose-400" : "text-emerald-400"}`}
              >
                {daysLeft} {t("dashboard.days", "يوم")}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Essential Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SarayaKpiCard
          label={t("dashboard.inpatientsCard", "المرضى المنومين")}
          value={stats?.activeInpatients ?? 0}
          subtext={t("dashboard.inpatientsSub", { rate: stats?.occupancyRate ?? 0 })}
          accent="sky"
          icon={<Building2 className="w-5 h-5" strokeWidth={1.75} />}
          ltrValue
          loading={loading}
        />

        <SarayaKpiCard
          label={t("dashboard.appointmentsCard", "مواعيد اليوم")}
          value={stats?.appointmentsToday ?? 0}
          subtext={t("dashboard.appointmentsSub", "إجمالي الحجوزات")}
          accent="amber"
          icon={<Calendar className="w-5 h-5" strokeWidth={1.75} />}
          ltrValue
          loading={loading}
        />

        {stats?.hasRevenueAccess && (
          <SarayaKpiCard
            label={
              stats.isPersonalRevenue
                ? t("dashboard.revenuePersonalCard", "إيرادك اليوم")
                : t("dashboard.revenueCard", "إيرادات اليوم")
            }
            value={`${(stats.todayRevenue ?? 0).toLocaleString()} ${isRtl ? "د.ل" : "LYD"}`}
            subtext={stats.isPersonalRevenue ? t("dashboard.revenuePersonalSub", "ورديتك") : t("dashboard.revenueSub", "المحصلة")}
            accent="emerald"
            icon={<Banknote className="w-5 h-5" strokeWidth={1.75} />}
            ltrValue
            loading={loading}
          />
        )}

        <SarayaKpiCard
          label={t("dashboard.stockCard", "نواقص المخزون")}
          value={stats?.lowStockCount ?? 0}
          subtext={t("dashboard.stockSub", "أصناف تحتاج طلب")}
          accent="rose"
          icon={<AlertTriangle className="w-5 h-5" strokeWidth={1.75} />}
          ltrValue
          loading={loading}
        />
      </div>

      {/* Quick Actions & Advanced Dashboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Quick Actions */}
        <div className={isRtl ? "text-right" : "text-left"}>
          <h3 className={`text-sm font-bold text-slate-200 mb-3 flex items-center gap-2 ${isRtl ? 'flex-row' : 'flex-row-reverse'}`}>
            <Clock className="w-4 h-4 text-sky-400" strokeWidth={1.75} />
            {t("dashboard.quickAccess", "وصول سريع")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickActionCard
              title={t("dashboard.admissionsTitle", "مكتب الدخول")}
              description={t("dashboard.admissionsDesc", "إدخال المرضى الجدد وإدارة الإيواء")}
              icon={ClipboardList}
              href="/admissions"
              colorClass="text-blue-400"
            />
            <QuickActionCard
              title={t("dashboard.appointmentsTitle", "حجز المواعيد")}
              description={t("dashboard.appointmentsDesc", "جدولة المواعيد للعيادات")}
              icon={Calendar}
              href="/appointments"
              colorClass="text-amber-400"
            />
            <QuickActionCard
              title={t("dashboard.cashierTitle", "الخزينة")}
              description={t("dashboard.cashierDesc", "تحصيل المدفوعات وإدارة الفواتير")}
              icon={CircleDollarSign}
              href="/cashier"
              colorClass="text-emerald-400"
            />
            <QuickActionCard
              title={t("dashboard.pharmacyTitle", "الصيدلية")}
              description={t("dashboard.pharmacyDesc", "إدارة الأدوية والمخزون الطبي")}
              icon={FlaskConical}
              href="/pharmacy"
              colorClass="text-purple-400"
            />
          </div>
        </div>

        {/* Advanced Dashboards & Administration */}
        <div className={isRtl ? "text-right" : "text-left"}>
          <h3 className={`text-sm font-bold text-slate-200 mb-3 flex items-center gap-2 ${isRtl ? 'flex-row' : 'flex-row-reverse'}`}>
            <BarChart3 className="w-4 h-4 text-sky-400" strokeWidth={1.75} />
            {t("dashboard.advDashboards", "لوحات تحكم متقدمة")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickActionCard
              title={t("dashboard.executiveTitle", "لوحة تنفيذية")}
              description={t("dashboard.executiveDesc", "إحصائيات وتقارير مفصلة للمستشفى")}
              icon={TrendingUp}
              href="/analytics/executive"
              colorClass="text-indigo-400"
              badge={t("dashboard.newBadge", "جديدة")}
            />
            <QuickActionCard
              title={t("dashboard.bedsTitle", "إدارة الأسرة")}
              description={t("dashboard.bedsDesc", "مراقبة حالة الأسرة والعنابر")}
              icon={Building2}
              href="/bed-management"
              colorClass="text-cyan-400"
              badge={t("dashboard.liveBadge", "مباشر")}
            />
            <QuickActionCard
              title="شؤون الموظفين والكوادر"
              description="سجل الموظفين والهيكل الوظيفي والورديات والبصمة"
              icon={UserCheck}
              href="/hr/employees"
              colorClass="text-teal-400"
            />
            <QuickActionCard
              title="الأرشيف الإلكتروني (DMS)"
              description="توثيق المستندات المشفرة وإدارة الصادر والوارد"
              icon={FolderArchive}
              href="/archive"
              colorClass="text-amber-400"
            />
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className={`rounded-xl border border-slate-800 bg-slate-900/70 px-5 py-3.5 ${isRtl ? 'text-right' : 'text-left'}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-xs font-bold text-slate-300">{t("dashboard.sysStatus", "حالة النظام")}</h3>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dbStatus === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : dbStatus === 'ERROR' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'}`} />
              <span className="text-xs text-slate-400">{t("dashboard.dbStatus", "قاعدة البيانات")}:</span>
              <span className={`text-xs font-bold ${dbStatus === 'ACTIVE' ? 'text-emerald-400' : dbStatus === 'ERROR' ? 'text-rose-400' : 'text-amber-400'}`}>
                {dbStatus === 'ACTIVE' ? t("dashboard.dbConnected", "متصلة") : dbStatus === 'ERROR' ? t("dashboard.dbError", "خطأ") : t("dashboard.dbChecking", "جارٍ الفحص...")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${apiLatency !== null ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
              <span className="text-xs text-slate-400">{t("dashboard.apiLatency", "استجابة الخادم")}:</span>
              <span dir="ltr" className={`text-xs font-mono font-bold tabular-nums ${apiLatency !== null ? 'text-emerald-400' : 'text-amber-400'}`}>
                {apiLatency !== null ? `${apiLatency}ms` : t("dashboard.apiChecking", "جارٍ الفحص...")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${navigator.onLine ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-xs text-slate-400">{t("dashboard.networkStatus", "حالة الشبكة")}:</span>
              <span className={`text-xs font-bold ${navigator.onLine ? 'text-emerald-400' : 'text-rose-400'}`}>
                {navigator.onLine ? t("dashboard.networkOnline", "متصل") : t("dashboard.networkOffline", "غير متصل")}
              </span>
            </div>
            <a href="/reports" className="text-xs font-bold text-sky-400 hover:underline">
              {t("dashboard.reportsTitle", "التقارير")} ←
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
