// src/layout/MainLayout.tsx

import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useSocketStore } from "../stores/socketStore";
import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { NotificationBell } from "../components/NotificationBell";

// ... (Icons تبقى كما هي - لا تغيير) ...
const Icons = {
  ChevronLeft: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  Activity: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  Users: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  DollarSign: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Package: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22.08V12" />
    </svg>
  ),
  Calculator: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" />
      <line x1="16" x2="16" y1="14" y2="18" />
      <path d="M16 10h.01" />
      <path d="M12 10h.01" />
      <path d="M8 10h.01" />
      <path d="M12 14h.01" />
      <path d="M8 14h.01" />
      <path d="M12 18h.01" />
      <path d="M8 18h.01" />
    </svg>
  ),
  Building: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  ),
  ChartBar: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  ),
  Settings: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Scissors: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" x2="8.12" y1="4" y2="15.88" />
      <line x1="14.47" x2="20" y1="14.48" y2="20" />
      <line x1="8.12" x2="12" y1="8.12" y2="12" />
    </svg>
  ),
  Home: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  Network: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
      <path d="M12 12V8" />
    </svg>
  ),
};

import { useLicenseStore } from "../stores/licenseStore"; // Import store

type MenuItem = {
  label: string;
  path: string;
  access?: string; // كود الصلاحية الدقيق
  requiredModule?: string; // 👈 جديد: المودل المطلوب لتفعيل هذا العنصر
};

type MenuSection = {
  key: string;
  title: string;
  icon: ReactNode;
  allowedRoles: string[];
  items: MenuItem[];
  requiredModule?: string; // 👈 جديد: المودل المطلوب للقسم كله
};

export function MainLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // License Store
  const fetchLicenseStatus = useLicenseStore((s) => s.fetchLicenseStatus);
  const isModuleEnabled = useLicenseStore((s) => s.isModuleEnabled);
  const licenseDetails = useLicenseStore((s) => s.details);
  const licenseState = useLicenseStore((s) => s.licenseState);

  const toggleSection = (key: string) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const { connect, disconnect } = useSocketStore();

  useEffect(() => {
    if (user) {
      connect();
      fetchLicenseStatus(); // ✅ Fetch license on auth
    }
    return () => disconnect();
  }, [user]);

  // إغلاق القائمة الجانبية عند تغيير الصفحة (للموبايل)
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // ✅ الدالة المصححة للتحقق من الوصول
  const hasAccess = (item: MenuItem, allowedRoles: string[]) => {
    if (!user) return false;

    // 1. License Check (Global override)
    if (item.requiredModule && !isModuleEnabled(item.requiredModule)) {
      return false;
    }

    // 2. Admin sees everything (provided license allows it!)
    if (user.roles.includes("ADMIN")) return true;

    // 3. Role/Permission Check
    const permissionCode = item.access;
    if (permissionCode) {
      if (user.permissions && user.permissions.includes(permissionCode)) {
        return true;
      }
      // If permission code exists but user doesn't have it -> strictly fail?
      // Or fallback to roles? Usually if protected by permission, roles don't matter unless configured.
      // Let's assume strict permission check if code is present.
      return false;
    }

    // 4. Fallback: Check roles if no specific permission code
    if (allowedRoles && allowedRoles.length > 0) {
      return allowedRoles.some((r) => user.roles.includes(r));
    }

    return false;
  };

  const menuStructure: MenuSection[] = [
    {
      key: "home",
      title: "الرئيسية",
      icon: <Icons.Home />,
      allowedRoles: [], // Open to all authenticated
      items: [{ label: "لوحة المتابعة", path: "/" }],
    },
    {
      key: "clinical",
      title: "التشغيل السريري",
      icon: <Icons.Activity />,
      allowedRoles: [],
      items: [
        {
          label: "فرز الطوارئ (Triage)",
          path: "/triage",
          access: "nursing:triage:manage",
        },
        {
          label: "المواعيد",
          path: "/appointments",
          access: "clinical:appointments:view",
        },
        { label: "المرضى", path: "/patients", access: "clinical:patients:view" },
        {
          label: "سجل الحالات",
          path: "/encounters",
          access: "clinical:encounters:view",
        },
        {
          label: "الإيواء (Admissions)",
          path: "/admissions",
          access: "adt:admissions:create",
        },
        {
          label: "حالات الإيواء",
          path: "/active-inpatients",
          access: "adt:bed:view",
        },
        {
          label: "محطة التمريض (Ward)",
          path: "/nursing",
          access: "nursing:station:view",
        },
        {
          label: "جولات الأطباء",
          path: "/doctor-rounds",
          access: "clinical:doctor:view", 
        },
        {
          label: "تخطيط الخروج",
          path: "/discharge-planning",
          access: "clinical:encounters:view",
        },
        {
          label: "إدارة الأسرة (Dashboard)",
          path: "/bed-management",
          access: "adt:bed:manage",
        },
        {
          label: "تسجيل ولادة (OB/GYN)",
          path: "/obgyn/deliveries/new",
          requiredModule: "OBGYN",
        },
        {
          label: "متابعة الحمل (ANC)",
          path: "/obgyn/anc",
          requiredModule: "OBGYN",
        },
        {
          label: "الحقن المجهري (IVF)",
          path: "/obgyn/fertility",
          requiredModule: "OBGYN",
        },
        {
          label: "أمراض الذكورة والعقم",
          path: "/andrology",
          requiredModule: "OBGYN",
        },
        { 
          label: "الصيدلية", 
          path: "/pharmacy", 
          access: "pharmacy:dashboard:view",
          requiredModule: "PHARMACY" 
        },
        { 
          label: "مختبر التحاليل", 
          path: "/lab", 
          access: "lab:dashboard:view",
          requiredModule: "LAB" 
        },
        { 
          label: "الأشعة", 
          path: "/radiology", 
          access: "rad:dashboard:view",
          requiredModule: "RADIOLOGY" 
        },
        { label: "تجهيز الأسرة", path: "/housekeeping", access: "adt:bed:manage" },
        { label: "📋 نظام الإحالات", path: "/referrals" },
        { label: "العناية المركزة (ICU)", path: "/clinical/icu", access: "adt:bed:view" },
        { label: "مجموعات الطلبات (Order Sets)", path: "/clinical/order-sets" },
        { label: "المسارات العلاجية (Pathways)", path: "/clinical/pathways" },
        { label: "لوحة السجلات وفجوات الرعاية", path: "/clinical/registries" },
        { label: "الجدولة المتقدمة للموارد", path: "/clinical/scheduling" },
        { label: "قوائم الانتظار الذكية", path: "/clinical/waitlist" },
      ],
    },
    {
      key: "surgery",
      title: "العمليات الجراحية",
      icon: <Icons.Scissors />,
      allowedRoles: [],
      items: [
        { 
          label: "جدول العمليات", 
          path: "/surgery", 
          access: "surgery:dashboard:view" 
        }
      ],
    },
    {
      key: "humanResources",
      title: "الموارد البشرية",
      icon: <Icons.Users />,
      allowedRoles: [],
      requiredModule: "HR",
      items: [
        { label: "تعريف الورديات", path: "/hr/shifts", access: "hr:shifts:manage" },
        { label: "جدول المناوبات", path: "/hr/roster", access: "hr:shifts:manage" },
        { label: "إدارة الإجازات", path: "/hr/leaves", access: "hr:leave:manage" },
        { label: "الحضور والانصراف", path: "/attendance", access: "hr:attendance:manage" },
        { label: "الرواتب والأجور", path: "/payroll", access: "hr:payroll:manage" },
      ],
    },
    {
      key: "revenue",
      title: "الإيرادات والخزينة",
      icon: <Icons.DollarSign />,
      allowedRoles: [],
      items: [
        { label: "الخزينة (POS)", path: "/cashier", access: "billing:payments:collect" },
        {
          label: "سجل الفواتير",
          path: "/invoices",
          access: "billing:invoices:view",
        },
        {
          label: "تقرير الكاشير اليومي",
          path: "/cashier/reports/daily",
          access: "billing:payments:collect",
        },
        {
          label: "تقرير المستخدمين",
          path: "/cashier/reports/by-cashier",
          access: "billing:payments:collect",
        },
        {
          label: "الشفتات المقفولة",
          path: "/cashier/shifts",
          access: "billing:payments:collect",
        },
        {
          label: "تحليل ذمم المرضى",
          path: "/accounting/patients-aging",
          access: "acc:reports:view",
        },
        {
          label: "شركات التأمين",
          path: "/insurance/providers",
          access: "billing:insurance:manage",
        },
        {
          label: "الموافقات المسبقة",
          path: "/insurance/pre-auth",
          access: "billing:insurance:manage",
        },
        {
          label: "مطالبات التأمين",
          path: "/insurance/claims",
          access: "billing:insurance:manage",
        },
      ],
    },
    {
      key: "analytics",
      title: "التحليلات والتقارير",
      icon: <Icons.ChartBar />,
      allowedRoles: ["ADMIN", "CEO"],
      items: [
        {
          label: "اللوحة التنفيذية (KPIs)",
          path: "/analytics/executive",
        },
        {
          label: "لوحة التقارير والتحليلات",
          path: "/reports",
          access: "acc:reports:view",
        },
        {
          label: "تقارير أداء الأطباء",
          path: "/reports/doctor-performance",
        },
        {
          label: "📊 إيرادات الأقسام",
          path: "/reports/revenue-department",
        },
      ],
    },
    {
      key: "purchases",
      title: "المشتريات والمخزون",
      icon: <Icons.Package />,
      allowedRoles: [],
      items: [
        { label: "الموردون", path: "/suppliers", access: "purchases:suppliers:manage" },
        {
          label: "فواتير المشتريات",
          path: "/purchases/invoices",
          access: "purchases:invoices:manage",
        },
        {
          label: "تحليل ذمم الموردين",
          path: "/suppliers/aging",
          access: "purchases:dashboard:view",
        },
        {
          label: "مخزون الصيدلية",
          path: "/pharmacy/stock",
          access: "pharmacy:inventory:view",
          requiredModule: "PHARMACY",
        },
        {
          label: "تنبيهات المخزون 🔔",
          path: "/inventory/alerts",
          access: "inventory:stock:view",
        },
        {
          label: "تقرير حركات المخزون",
          path: "/pharmacy/stock-report",
          access: "pharmacy:inventory:view",
          requiredModule: "PHARMACY",
        },
        { label: "التحويلات المخزنية", path: "/inventory/transfers", access: "inventory:transfers:manage" },
        {
          label: "جرد المخزون",
          path: "/inventory/counts",
          access: "inventory:stock:manage",
        },
      ],
    },
    {
      key: "assets",
      title: "الأصول والصيانة",
      icon: <Icons.Building />,
      allowedRoles: [],
      requiredModule: "ASSETS",
      items: [
        { label: "سجل الأصول", path: "/assets", access: "assets:dashboard:view" },
        { label: "إدارة الصيانة", path: "/assets/maintenance", access: "assets:maintenance:manage" },
        {
          label: "احتساب الإهلاك",
          path: "/assets/depreciation",
          access: "assets:manage",
        },
      ],
    },
    {
      key: "accounting",
      title: "المحاسبة العامة",
      icon: <Icons.Calculator />,
      allowedRoles: [],
      requiredModule: "ACCOUNTS",
      items: [
        {
          label: "السنوات المالية",
          path: "/financial-years",
          access: "acc:settings:manage",
        },
        {
          label: "دليل الحسابات",
          path: "/accounting/chart-of-accounts",
          access: "acc:dashboard:view",
        },
        {
          label: "الأرصدة الافتتاحية",
          path: "/accounting/opening-balances",
          access: "acc:entries:create",
        },
        {
          label: "قيد يدوي",
          path: "/accounting/manual-entry",
          access: "acc:entries:create",
        },
        {
          label: "دفتر اليومية العامة",
          path: "/accounting/journal",
          access: "acc:entries:view",
        },
        {
          label: "سجل القيود المحاسبية (Entries)",
          path: "/accounting/entries",
          access: "acc:entries:view",
        },
        {
          label: "دفتر الأستاذ",
          path: "/accounting/ledger",
          access: "acc:reports:view",
        },
        {
          label: "ميزان المراجعة",
          path: "/accounting/trial-balance",
          access: "acc:reports:view",
        },
        {
          label: "قائمة الدخل",
          path: "/accounting/income-statement",
          access: "acc:reports:view",
        },
        {
          label: "مراكز التكلفة",
          path: "/accounting/cost-centers",
          access: "acc:cost_centers:manage",
        },
        {
          label: "أذونات الصرف والقبض",
          path: "/accounting/vouchers",
          access: "acc:entries:create",
        },
        {
          label: "الميزانية العمومية",
          path: "/accounting/balance-sheet",
          access: "acc:reports:view",
        },
        {
          label: "إقفال السنة",
          path: "/accounting/year-closing",
          access: "acc:year:close",
        },
      ],
    },
    {
      key: "integration",
      title: "الربط والتكامل",
      icon: <Icons.Network />,
      allowedRoles: [],
      items: [{ label: "إدارة الأجهزة (LIS/PACS)", path: "/integration", access: "integration:manage" }],
    },
    {
      key: "settings",
      title: "الإعدادات",
      icon: <Icons.Settings />,
      allowedRoles: [],
      items: [
        { label: "الإعدادات العامة", path: "/settings", access: "admin:settings:manage" },
        { label: "إعدادات النظام", path: "/settings/system", access: "admin:settings:manage" },
        { label: "الأقسام (Departments)", path: "/settings/departments", access: "admin:settings:manage" },
        { label: "التخصصات (Specialties)", path: "/settings/specialties", access: "admin:settings:manage" },
        { label: "قوائم الأسعار", path: "/settings/price-lists", access: "admin:settings:manage" },
        { label: "الخدمات والأسعار", path: "/services", access: "admin:settings:manage" },
        { label: "المستخدمون والصلاحيات", path: "/users", access: "admin:users:manage" },
        { label: "إدارة الأسرة", path: "/settings/bed-management", access: "adt:bed:manage" },
        { label: "سجل التدقيق (Audit Logs)", path: "/audit/logs", access: "admin:audit:view" },
        { label: "جداول الأطباء", path: "/settings/doctor-schedules", access: "admin:settings:manage" },
        { label: "النسخ الاحتياطي والاستعادة", path: "/settings/backup", access: "admin:settings:manage" }, 
        { label: "📝 قوالب الملاحظات الطبية", path: "/settings/note-templates", access: "admin:settings:manage" },
        { label: "⚙️ إعدادات العمولات", path: "/settings/commissions", access: "admin:settings:manage" },
        { label: "حول النظام", path: "/about" }, 
      ],
    },
  ];

  // فلترة القائمة
  const authorizedMenu = useMemo(() => {
    if (!user) return [];

    // Filter Logic
    return menuStructure
      .map((section) => {
        // Check Section Module
        if (
          section.requiredModule &&
          !isModuleEnabled(section.requiredModule)
        ) {
          return null;
        }

        // Filter Items
        const validItems = section.items.filter((item) =>
          hasAccess(item, section.allowedRoles),
        );

        if (validItems.length === 0) return null;

        return { ...section, items: validItems };
      })
      .filter((section): section is MenuSection => section !== null);
  }, [user, isModuleEnabled]);

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `block w-full px-4 py-2.5 rounded-lg text-xs md:text-sm transition-all duration-200 border-r-[3px] 
     ${isActive ? "bg-sky-500/10 text-sky-400 border-sky-500 font-medium" : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/5"}`;

  return (
    <div className="h-screen w-screen flex bg-slate-950 text-slate-100 overflow-hidden">
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`w-64 flex flex-col border-l border-slate-800 bg-slate-950/95 backdrop-blur h-full flex-shrink-0 z-50
        fixed md:relative top-0 right-0
        transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
        md:flex`}>
        <div className="px-5 py-4 border-b border-slate-800 flex-shrink-0 flex items-center gap-3">
          <img src="/sarayalogo.png" alt="السرايا" className="w-10 h-10 rounded-lg object-contain" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-sky-500 font-bold mb-0.5">
              HOSPITAL SUITE
            </div>
            <div className="font-bold text-sm text-white leading-tight">نظام السرايا الطبي</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {authorizedMenu.map((section) => {
            const isOpen = openSection === section.key;
            return (
              <div key={section.key} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className={`flex items-center justify-between w-full px-3 py-3 text-sm font-medium rounded-xl transition-colors duration-200
                    ${isOpen ? "text-slate-100" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={isOpen ? "text-sky-500" : "text-slate-500"}
                    >
                      {section.icon}
                    </span>
                    <span>{section.title}</span>
                  </div>
                  <span
                    className={`transition-transform duration-300 text-slate-600 ${isOpen ? "-rotate-90" : "rotate-0"}`}
                  >
                    <Icons.ChevronLeft />
                  </span>
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[2000px] opacity-100 mt-1" : "max-h-0 opacity-0"}`}
                >
                  <div className="pr-4 pl-1 space-y-1 py-1 mr-2 border-r border-slate-800/50">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={navLinkClasses}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-950 flex-shrink-0">
          {user && (
            <div className="mb-3">
              <div className="font-semibold text-sm text-white">
                {user.fullName}
              </div>
              <div className="text-slate-500 text-[10px] truncate">
                {user.roles?.join(" | ")}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 hover:text-rose-300 text-xs py-2 transition border border-rose-900/30"
          >
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative">
        {/* Grace Period Warning */}
        {licenseDetails?.isGracePeriod && (
          <div className="bg-rose-900/90 text-white text-center text-sm py-2 px-4 shadow-lg backdrop-blur-sm z-50 border-b border-rose-500/30 flex items-center justify-center gap-3 flex-wrap">
            <span className="animate-pulse">⚠️</span>
            <span>
              <strong>تنبيه:</strong> انتهت فترة الاشتراك. متبقي{" "}
              <strong className="text-amber-300">
                {licenseDetails.graceDaysRemaining ?? "?"} يوم
              </strong>{" "}
              من فترة السماح. سيتوقف النظام بعدها.
            </span>
            <a
              href="/activation"
              className="inline-block bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors border border-white/20"
            >
              🔄 تجديد الاشتراك الآن
            </a>
          </div>
        )}

        {/* Expiring Soon Warning (within 7 days but not yet expired) */}
        {!licenseDetails?.isGracePeriod &&
          licenseDetails?.daysRemaining !== undefined &&
          licenseDetails.daysRemaining <= 7 &&
          licenseDetails.daysRemaining > 0 && (
          <div className="bg-amber-900/80 text-white text-center text-sm py-2 px-4 shadow-lg backdrop-blur-sm z-50 border-b border-amber-500/30 flex items-center justify-center gap-3 flex-wrap">
            <span>⏳</span>
            <span>
              ينتهي اشتراكك خلال{" "}
              <strong className="text-amber-200">{licenseDetails.daysRemaining} يوم</strong>.
              جدّد مبكراً للاحتفاظ بالأيام المتبقية!
            </span>
            <a
              href="/activation"
              className="inline-block bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors border border-white/20"
            >
              تجديد مبكر
            </a>
          </div>
        )}

        <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur z-30">
          {/* زر القائمة للموبايل */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="فتح القائمة"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" x2="21" y1="6" y2="6" />
              <line x1="3" x2="21" y1="12" y2="12" />
              <line x1="3" x2="21" y1="18" y2="18" />
            </svg>
          </button>
          <div className="hidden md:block text-slate-400 text-xs font-medium">
            مرحباً بك في نظام السرايا الطبي - النسخة التشغيلية
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            {user && (
              <div className="text-left text-[11px] hidden md:block">
                <div className="text-white font-medium">{user.fullName}</div>
                <div className="text-slate-500">{user.roles?.[0]}</div>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 custom-scrollbar">
          <div className="max-w-[1600px] mx-auto min-h-full">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

// // src/layout/MainLayout.tsx

// import { Outlet, NavLink, useLocation } from "react-router-dom";
// import { useAuthStore } from "../stores/authStore";
// import { useState, ReactNode, useEffect, useMemo } from "react";
// import { NotificationBell } from "../components/NotificationBell";

// // --- الأيقونات ---
// const Icons = {
//   ChevronLeft: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="16"
//       height="16"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <path d="m15 18-6-6 6-6" />
//     </svg>
//   ),
//   Activity: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
//     </svg>
//   ),
//   Users: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
//       <circle cx="9" cy="7" r="4" />
//       <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
//       <path d="M16 3.13a4 4 0 0 1 0 7.75" />
//     </svg>
//   ),
//   DollarSign: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <line x1="12" x2="12" y1="2" y2="22" />
//       <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
//     </svg>
//   ),
//   Package: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <path d="m7.5 4.27 9 5.15" />
//       <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
//       <path d="m3.3 7 8.7 5 8.7-5" />
//       <path d="M12 22.08V12" />
//     </svg>
//   ),
//   Calculator: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <rect width="16" height="20" x="4" y="2" rx="2" />
//       <line x1="8" x2="16" y1="6" y2="6" />
//       <line x1="16" x2="16" y1="14" y2="18" />
//       <path d="M16 10h.01" />
//       <path d="M12 10h.01" />
//       <path d="M8 10h.01" />
//       <path d="M12 14h.01" />
//       <path d="M8 14h.01" />
//       <path d="M12 18h.01" />
//       <path d="M8 18h.01" />
//     </svg>
//   ),
//   Building: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
//       <path d="M9 22v-4h6v4" />
//       <path d="M8 6h.01" />
//       <path d="M16 6h.01" />
//       <path d="M12 6h.01" />
//       <path d="M12 10h.01" />
//       <path d="M12 14h.01" />
//       <path d="M16 10h.01" />
//       <path d="M16 14h.01" />
//       <path d="M8 10h.01" />
//       <path d="M8 14h.01" />
//     </svg>
//   ),
//   Settings: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
//       <circle cx="12" cy="12" r="3" />
//     </svg>
//   ),
//   Scissors: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <circle cx="6" cy="6" r="3" />
//       <circle cx="6" cy="18" r="3" />
//       <line x1="20" x2="8.12" y1="4" y2="15.88" />
//       <line x1="14.47" x2="20" y1="14.48" y2="20" />
//       <line x1="8.12" x2="12" y1="8.12" y2="12" />
//     </svg>
//   ),
//   Home: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
//       <polyline points="9 22 9 12 15 12 15 22" />
//     </svg>
//   ),
//   Network: () => (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       width="18"
//       height="18"
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="2"
//       strokeLinecap="round"
//       strokeLinejoin="round"
//     >
//       <rect x="16" y="16" width="6" height="6" rx="1" />
//       <rect x="2" y="16" width="6" height="6" rx="1" />
//       <rect x="9" y="2" width="6" height="6" rx="1" />
//       <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
//       <path d="M12 12V8" />
//     </svg>
//   ),
// };

// type MenuItem = {
//   label: string;
//   path: string;
//   access?: string; // كود الصلاحية (Permission Code)
// };

// type MenuSection = {
//   key: string;
//   title: string;
//   icon: ReactNode;
//   allowedRoles: string[]; // أدوار (Roles) للتحقق الثانوي
//   items: MenuItem[];
// };

// export function MainLayout() {
//   const user = useAuthStore((s) => s.user);
//   const logout = useAuthStore((s) => s.logout);
//   const location = useLocation();
//   const [openSection, setOpenSection] = useState<string | null>(null);

//   const toggleSection = (key: string) => {
//     setOpenSection((prev) => (prev === key ? null : key));
//   };

//   // --- دالة فحص الصلاحية ---
//   const hasAccess = (permissionCode?: string) => {
//     if (!user) return false;
//     if (user.roles.includes("ADMIN")) return true; // الأدمن يرى كل شيء
//     if (!permissionCode) return true; // عنصر ليس له صلاحية محددة (متاح للجميع ضمن الدور)
//     return user.permissions?.includes(permissionCode);
//   };

//   const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
//     `block w-full px-4 py-2.5 rounded-lg text-xs md:text-sm transition-all duration-200 border-r-[3px]
//      ${isActive ? "bg-sky-500/10 text-sky-400 border-sky-500 font-medium" : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/5"}`;

//   // === هيكلية القائمة الكاملة ===
//   const menuStructure: MenuSection[] = [
//     {
//       key: "home",
//       title: "الرئيسية",
//       icon: <Icons.Home />,
//       allowedRoles: [
//         "ADMIN",
//         "DOCTOR",
//         "NURSE",
//         "RECEPTION",
//         "PHARMACIST",
//         "LAB_TECH",
//         "RAD_TECH",
//         "ACCOUNTANT",
//         "STORE_KEEPER",
//         "HR",
//       ],
//       items: [{ label: "لوحة المتابعة", path: "/" }],
//     },
//     {
//       key: "clinical",
//       title: "التشغيل السريري",
//       icon: <Icons.Activity />,
//       allowedRoles: ["ADMIN", "DOCTOR", "NURSE", "RECEPTION"],
//       items: [
//         {
//           label: "فرز الطوارئ (Triage)",
//           path: "/triage",
//           access: "emr:vitals:record",
//         },
//         {
//           label: "المواعيد",
//           path: "/appointments",
//           access: "clinical:appointment:view",
//         },
//         { label: "المرضى", path: "/patients", access: "emr:patient:view" },
//         {
//           label: "سجل الحالات",
//           path: "/encounters",
//           access: "emr:patient:view",
//         },
//         {
//           label: "الإيواء (Admissions)",
//           path: "/admissions",
//           access: "clinical:appointment:create",
//         },
//         {
//           label: "حالات الإيواء حالياً",
//           path: "/active-inpatients",
//           access: "emr:patient:view",
//         },
//         {
//           label: "محطة التمريض (Ward)",
//           path: "/nursing",
//           access: "emr:vitals:record",
//         },
//         { label: "الصيدلية", path: "/pharmacy" },
//         { label: "المعمل", path: "/lab" },
//         { label: "الأشعة", path: "/radiology" },
//         { label: "تجهيز الأسرة (Housekeeping)", path: "/housekeeping" },
//       ],
//     },
//     {
//       key: "surgery",
//       title: "العمليات الجراحية",
//       icon: <Icons.Scissors />,
//       allowedRoles: ["ADMIN", "DOCTOR", "NURSE"],
//       items: [{ label: "جدول العمليات", path: "/surgery" }],
//     },
//     {
//       key: "humanResources",
//       title: "الموارد البشرية",
//       icon: <Icons.Users />,
//       allowedRoles: ["ADMIN", "HR"],
//       items: [
//         { label: "تعريف الورديات", path: "/hr/shifts" },
//         { label: "جدول المناوبات", path: "/hr/roster" },
//         { label: "إدارة الإجازات", path: "/hr/leaves" },
//         { label: "الحضور والانصراف", path: "/attendance" },
//         { label: "الرواتب والأجور", path: "/payroll" },
//       ],
//     },
//     {
//       key: "revenue",
//       title: "الإيرادات والخزينة",
//       icon: <Icons.DollarSign />,
//       allowedRoles: ["ADMIN", "ACCOUNTANT", "CASHIER"],
//       items: [
//         {
//           label: "لوحة التقارير والتحليلات",
//           path: "/reports",
//           access: "acc:report:view",
//         },
//         { label: "الخزينة (POS)", path: "/cashier" },
//         {
//           label: "سجل الفواتير",
//           path: "/invoices",
//           access: "billing:invoice:view",
//         },
//         {
//           label: "تقرير الكاشير اليومي",
//           path: "/cashier/reports/daily",
//           access: "billing:invoice:view",
//         },
//         {
//           label: "تقرير المستخدمين",
//           path: "/cashier/reports/by-cashier",
//           access: "billing:invoice:view",
//         },
//         {
//           label: "الشفتات المقفولة",
//           path: "/cashier/shifts",
//           access: "billing:invoice:view",
//         },
//         {
//           label: "تحليل ذمم المرضى",
//           path: "/accounting/patients-aging",
//           access: "acc:report:view",
//         },
//         {
//           label: "شركات التأمين",
//           path: "/insurance/providers",
//           access: "billing:invoice:create",
//         },
//         {
//           label: "الموافقات المسبقة",
//           path: "/insurance/pre-auth",
//           access: "billing:invoice:create",
//         },
//         {
//           label: "مطالبات التأمين",
//           path: "/insurance/claims",
//           access: "billing:invoice:view",
//         },
//       ],
//     },
//     {
//       key: "purchases",
//       title: "المشتريات والمخزون",
//       icon: <Icons.Package />,
//       allowedRoles: ["ADMIN", "ACCOUNTANT", "STORE_KEEPER"],
//       items: [
//         { label: "الموردون", path: "/suppliers" },
//         {
//           label: "فواتير المشتريات",
//           path: "/purchases/invoices",
//           access: "purchases:invoice:create",
//         },
//         {
//           label: "تحليل ذمم الموردين",
//           path: "/suppliers/aging",
//           access: "purchases:invoice:view",
//         },
//         { label: "مخزون الصيدلية", path: "/pharmacy/stock" },
//         { label: "تقرير حركات المخزون", path: "/pharmacy/stock-report" },
//         { label: "التحويلات المخزنية", path: "/inventory/transfers" },
//       ],
//     },
//     {
//       key: "assets",
//       title: "الأصول والصيانة",
//       icon: <Icons.Building />,
//       allowedRoles: ["ADMIN", "ACCOUNTANT", "STORE_KEEPER"],
//       items: [
//         { label: "سجل الأصول", path: "/assets", access: "acc:report:view" },
//         { label: "إدارة الصيانة", path: "/assets/maintenance" },
//         {
//           label: "احتساب الإهلاك",
//           path: "/assets/depreciation",
//           access: "acc:entry:create",
//         },
//       ],
//     },
//     {
//       key: "accounting",
//       title: "المحاسبة العامة",
//       icon: <Icons.Calculator />,
//       allowedRoles: ["ADMIN", "ACCOUNTANT"],
//       items: [
//         {
//           label: "السنوات المالية",
//           path: "/financial-years",
//           access: "acc:report:view",
//         },
//         {
//           label: "دليل الحسابات",
//           path: "/accounting/chart-of-accounts",
//           access: "acc:report:view",
//         },
//         {
//           label: "الأرصدة الافتتاحية",
//           path: "/accounting/opening-balances",
//           access: "acc:entry:create",
//         },
//         {
//           label: "قيد يدوي",
//           path: "/accounting/manual-entry",
//           access: "acc:entry:create",
//         },
//         {
//           label: "دفتر اليومية العامة",
//           path: "/accounting/journal",
//           access: "acc:report:view",
//         },
//         {
//           label: "سجل القيود (Entries)",
//           path: "/accounting/entries",
//           access: "acc:report:view",
//         },
//         {
//           label: "دفتر الأستاذ",
//           path: "/accounting/ledger",
//           access: "acc:report:view",
//         },
//         {
//           label: "ميزان المراجعة",
//           path: "/accounting/trial-balance",
//           access: "acc:report:view",
//         },
//         {
//           label: "قائمة الدخل",
//           path: "/accounting/income-statement",
//           access: "acc:report:view",
//         },
//         {
//           label: "الميزانية العمومية",
//           path: "/accounting/balance-sheet",
//           access: "acc:report:view",
//         },
//         {
//           label: "إقفال السنة",
//           path: "/accounting/year-closing",
//           access: "acc:year:close",
//         },
//       ],
//     },
//     {
//       key: "integration",
//       title: "الربط والتكامل",
//       icon: <Icons.Network />,
//       allowedRoles: ["ADMIN", "IT_ADMIN"],
//       items: [{ label: "إدارة الأجهزة (LIS/PACS)", path: "/integration" }],
//     },
//     {
//       key: "settings",
//       title: "الإعدادات",
//       icon: <Icons.Settings />,
//       allowedRoles: ["ADMIN"],
//       items: [
//         { label: "الإعدادات العامة", path: "/settings" },
//         { label: "الأقسام (Departments)", path: "/settings/departments" },
//         { label: "التخصصات (Specialties)", path: "/settings/specialties" },
//         { label: "قوائم الأسعار", path: "/settings/price-lists" },
//         { label: "الخدمات والأسعار", path: "/services" },
//         { label: "المستخدمون والصلاحيات", path: "/users" },
//       ],
//     },
//   ];

//   // 🛡️ فلترة القائمة ديناميكياً
//   const authorizedMenu = useMemo(() => {
//     if (!user) return [];

//     // إذا كان أدمن، نعرض كل شيء
//     if (user.roles.includes("ADMIN")) return menuStructure;

//     return (
//       menuStructure
//         .map((section) => ({
//           ...section,
//           // نفلتر العناصر بناءً على الصلاحية الدقيقة (access code)
//           // وإذا لم يكن هناك كود، نعتمد على التحقق من الدور العام (allowedRoles) للقسم
//           items: section.items.filter((item) => {
//             // التحقق من الصلاحية الدقيقة
//             const hasPermission = hasAccess(item.access);

//             // التحقق من الدور العام للقسم (Secondary Check)
//             const hasRole = section.allowedRoles.some((role) =>
//               user.roles.includes(role),
//             );

//             return hasPermission && hasRole;
//           }),
//         }))
//         // إخفاء القسم بالكامل إذا لم يتبقَ فيه أي عناصر
//         .filter((section) => section.items.length > 0)
//     );
//   }, [user, menuStructure]);

//   return (
//     <div className="h-screen w-screen flex bg-slate-950 text-slate-100 overflow-hidden">
//       {/* Sidebar */}
//       <aside className="w-64 hidden md:flex flex-col border-l border-slate-800 bg-slate-950/95 backdrop-blur h-full flex-shrink-0 z-40">
//         {/* Header */}
//         <div className="px-5 py-5 border-b border-slate-800 flex-shrink-0">
//           <div className="text-[10px] uppercase tracking-[0.2em] text-sky-500 font-bold mb-1">
//             HOSPITAL SUITE
//           </div>
//           <div className="font-bold text-lg text-white">نظام السرايا الطبي</div>
//         </div>

//         {/* Navigation */}
//         <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
//           {authorizedMenu.map((section) => {
//             const isOpen = openSection === section.key;
//             return (
//               <div key={section.key} className="mb-1">
//                 <button
//                   type="button"
//                   onClick={() => toggleSection(section.key)}
//                   className={`flex items-center justify-between w-full px-3 py-3 text-sm font-medium rounded-xl transition-colors duration-200
//                     ${isOpen ? "text-slate-100" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"}`}
//                 >
//                   <div className="flex items-center gap-3">
//                     <span
//                       className={isOpen ? "text-sky-500" : "text-slate-500"}
//                     >
//                       {section.icon}
//                     </span>
//                     <span>{section.title}</span>
//                   </div>
//                   <span
//                     className={`transition-transform duration-300 text-slate-600 ${isOpen ? "-rotate-90" : "rotate-0"}`}
//                   >
//                     <Icons.ChevronLeft />
//                   </span>
//                 </button>

//                 <div
//                   className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[800px] opacity-100 mt-1" : "max-h-0 opacity-0"}`}
//                 >
//                   <div className="pr-4 pl-1 space-y-1 py-1 mr-2 border-r border-slate-800/50">
//                     {section.items.map((item) => (
//                       <NavLink
//                         key={item.path}
//                         to={item.path}
//                         className={navLinkClasses}
//                       >
//                         {item.label}
//                       </NavLink>
//                     ))}
//                   </div>
//                 </div>
//               </div>
//             );
//           })}
//         </nav>

//         {/* Footer */}
//         <div className="p-4 border-t border-slate-800 bg-slate-950 flex-shrink-0">
//           {user && (
//             <div className="mb-3">
//               <div className="font-semibold text-sm text-white">
//                 {user.fullName}
//               </div>
//               <div className="text-slate-500 text-[10px] truncate">
//                 {user.roles?.join(" | ")}
//               </div>
//             </div>
//           )}
//           <button
//             onClick={logout}
//             className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 hover:text-rose-300 text-xs py-2 transition border border-rose-900/30"
//           >
//             تسجيل الخروج
//           </button>
//         </div>
//       </aside>

//       {/* Main Content */}
//       <main className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative">
//         {/* Header (Desktop & Mobile) */}
//         <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur z-30">
//           <div className="hidden md:block text-slate-400 text-xs font-medium">
//             مرحباً بك في نظام السرايا الطبي - النسخة التشغيلية
//           </div>
//           <div className="flex items-center gap-4">
//             <NotificationBell />
//             {user && (
//               <div className="text-left text-[11px] hidden md:block">
//                 <div className="text-white font-medium">{user.fullName}</div>
//                 <div className="text-slate-500">{user.roles?.[0]}</div>
//               </div>
//             )}
//           </div>
//         </header>

//         <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 custom-scrollbar">
//           <div className="max-w-[1600px] mx-auto min-h-full">
//             <Outlet />
//           </div>
//         </div>
//       </main>
//     </div>
//   );
// }
