// src/layout/MainLayout.tsx

import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useSocketStore } from "../stores/socketStore";
import { useLicenseStore } from "../stores/licenseStore";
import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NotificationBell } from "../components/NotificationBell";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import {
  AlertTriangle,
  Baby,
  BarChart3,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  DollarSign,
  GitBranch,
  Home,
  Loader2,
  LogOut,
  Menu,
  Network,
  Package,
  RefreshCw,
  Scissors,
  Settings,
  Shield,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";

type MenuItem = {
  label: string;
  path: string;
  access?: string;
  requiredModule?: string;
  translationKey?: string;
};

type MenuSection = {
  key: string;
  title: string;
  icon: ReactNode;
  allowedRoles: string[];
  items: MenuItem[];
  requiredModule?: string;
  translationKey?: string;
};

export function MainLayout() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const accessibleBranches = useAuthStore((s) => s.accessibleBranches);
  const currentBranchId = useAuthStore((s) => s.currentBranchId);
  const switchBranch = useAuthStore((s) => s.switchBranch);
  const isSwitchingBranch = useAuthStore((s) => s.isSwitchingBranch);

  const location = useLocation();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);

  const currentBranchName = useMemo(() => {
    const branch = accessibleBranches.find((b) => b.id === currentBranchId);
    return branch?.name || t("common.mainBranch", "الفرع الرئيسي");
  }, [accessibleBranches, currentBranchId, t]);

  const fetchLicenseStatus = useLicenseStore((s) => s.fetchLicenseStatus);
  const isModuleEnabled = useLicenseStore((s) => s.isModuleEnabled);
  const licenseDetails = useLicenseStore((s) => s.details);
  const licenseState = useLicenseStore((s) => s.licenseState);
  const licenseFeatures = useLicenseStore((s) => s.features);

  const toggleSection = (key: string) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const { connect, disconnect } = useSocketStore();

  useEffect(() => {
    if (user) {
      connect();
      fetchLicenseStatus();
    }
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const hasAccess = (item: MenuItem, allowedRoles: string[]) => {
    if (!user) return false;

    if (item.requiredModule && !isModuleEnabled(item.requiredModule)) {
      return false;
    }

    if (user.roles?.includes("ADMIN")) return true;

    const permissionCode = item.access;
    if (permissionCode) {
      return Boolean(user.permissions && user.permissions.includes(permissionCode));
    }

    if (allowedRoles && allowedRoles.length > 0) {
      return allowedRoles.some((r) => user.roles.includes(r));
    }

    return false;
  };

  const menuStructure: MenuSection[] = [
    {
      key: "home",
      title: "الرئيسية",
      translationKey: "home",
      icon: <Home size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      items: [{ label: "لوحة المتابعة", path: "/", translationKey: "dashboard" }],
    },
    {
      key: "clinical",
      title: "التشغيل السريري",
      translationKey: "clinical",
      icon: <Stethoscope size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      items: [
        {
          label: "فرز الطوارئ (Triage)",
          path: "/triage",
          access: "nursing:triage:manage",
          translationKey: "triage",
        },
        {
          label: "المواعيد",
          path: "/appointments",
          access: "clinical:appointments:view",
          translationKey: "appointments",
        },
        {
          label: "المرضى",
          path: "/patients",
          access: "clinical:patients:view",
          translationKey: "patients",
        },
        {
          label: "سجل الحالات",
          path: "/encounters",
          access: "clinical:encounters:view",
          translationKey: "encounters",
        },
        {
          label: "الإيواء (Admissions)",
          path: "/admissions",
          access: "adt:admissions:create",
          translationKey: "admissions",
        },
        {
          label: "حالات الإيواء",
          path: "/active-inpatients",
          access: "adt:bed:view",
          translationKey: "activeInpatients",
        },
        {
          label: "محطة التمريض (Ward)",
          path: "/nursing",
          access: "nursing:station:view",
          translationKey: "nursing",
        },
        {
          label: "جولات الأطباء",
          path: "/doctor-rounds",
          access: "clinical:doctor:view",
          translationKey: "rounds",
        },
        {
          label: "تخطيط الخروج",
          path: "/discharge-planning",
          access: "clinical:encounters:view",
          translationKey: "discharge",
        },
        {
          label: "إدارة الأسرة (Dashboard)",
          path: "/bed-management",
          access: "adt:bed:manage",
          translationKey: "beds",
        },
        {
          label: "الصيدلية",
          path: "/pharmacy",
          access: "pharmacy:dashboard:view",
          requiredModule: "PHARMACY",
          translationKey: "pharmacy",
        },
        {
          label: "مختبر التحاليل",
          path: "/lab",
          access: "lab:dashboard:view",
          requiredModule: "LAB",
          translationKey: "labs",
        },
        {
          label: "الأشعة",
          path: "/radiology",
          access: "rad:dashboard:view",
          requiredModule: "RADIOLOGY",
          translationKey: "radiology",
        },
        {
          label: "تجهيز الأسرة",
          path: "/housekeeping",
          access: "adt:bed:manage",
          translationKey: "housekeeping",
        },
        {
          label: "نظام الإحالات",
          path: "/referrals",
          access: "clinical:encounters:view",
          translationKey: "referrals",
        },
        {
          label: "العناية المركزة (ICU)",
          path: "/clinical/icu",
          access: "adt:bed:view",
          translationKey: "icu",
        },
        {
          label: "مجموعات الطلبات (Order Sets)",
          path: "/clinical/order-sets",
          access: "clinical:encounters:view",
          translationKey: "orderSets",
        },
        {
          label: "المسارات العلاجية (Pathways)",
          path: "/clinical/pathways",
          access: "clinical:encounters:view",
          translationKey: "pathways",
        },
        {
          label: "لوحة السجلات وفجوات الرعاية",
          path: "/clinical/registries",
          access: "clinical:encounters:view",
          translationKey: "registries",
        },
        {
          label: "الجدولة المتقدمة للموارد",
          path: "/clinical/scheduling",
          access: "clinical:appointments:view",
          translationKey: "scheduling",
        },
        {
          label: "قوائم الانتظار الذكية",
          path: "/clinical/waitlist",
          access: "clinical:appointments:view",
          translationKey: "waitlist",
        },
      ],
    },
    {
      key: "obgyn",
      title: "النساء والولادة والخصوبة",
      translationKey: "obgynSection",
      icon: <Baby size={18} strokeWidth={1.75} />,
      allowedRoles: ["ADMIN", "DOCTOR", "NURSE"],
      requiredModule: "OBGYN",
      items: [
        {
          label: "متابعة الحمل (ANC)",
          path: "/obgyn/anc",
          access: "obgyn:view",
          requiredModule: "OBGYN",
          translationKey: "anc",
        },
        {
          label: "تسجيل ولادة (OB/GYN)",
          path: "/obgyn/deliveries/new",
          access: "obgyn:manage",
          requiredModule: "OBGYN",
          translationKey: "obgyn",
        },
        {
          label: "الحقن المجهري (IVF)",
          path: "/obgyn/fertility",
          access: "obgyn:view",
          requiredModule: "OBGYN",
          translationKey: "ivf",
        },
        {
          label: "أمراض الذكورة والعقم",
          path: "/andrology",
          access: "obgyn:view",
          requiredModule: "OBGYN",
          translationKey: "andrology",
        },
      ],
    },
    {
      key: "surgery",
      title: "العمليات الجراحية",
      translationKey: "surgery",
      icon: <Scissors size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      items: [
        {
          label: "جدول العمليات",
          path: "/surgery",
          access: "surgery:dashboard:view",
          translationKey: "surgerySchedule",
        },
      ],
    },
    {
      key: "humanResources",
      title: "الموارد البشرية",
      translationKey: "hr",
      icon: <Users size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      requiredModule: "HR",
      items: [
        { label: "تعريف الورديات", path: "/hr/shifts", access: "hr:shifts:manage", translationKey: "shifts" },
        { label: "جدول المناوبات", path: "/hr/roster", access: "hr:shifts:manage", translationKey: "roster" },
        { label: "إدارة الإجازات", path: "/hr/leaves", access: "hr:leave:manage", translationKey: "leaves" },
        { label: "الحضور والانصراف", path: "/attendance", access: "hr:attendance:manage", translationKey: "attendance" },
        { label: "الرواتب والأجور", path: "/payroll", access: "hr:payroll:manage", translationKey: "payroll" },
      ],
    },
    {
      key: "revenue",
      title: "الإيرادات والخزينة",
      translationKey: "revenue",
      icon: <DollarSign size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      items: [
        { label: "الخزينة (POS)", path: "/cashier", access: "billing:payments:collect", translationKey: "cashier" },
        { label: "سجل الفواتير", path: "/invoices", access: "billing:invoices:view", translationKey: "invoices" },
        { label: "تقرير الكاشير اليومي", path: "/cashier/reports/daily", access: "billing:payments:collect", translationKey: "cashierReport" },
        { label: "تقرير المستخدمين", path: "/cashier/reports/by-cashier", access: "billing:payments:collect", translationKey: "userReport" },
        { label: "الشفتات المقفولة", path: "/cashier/shifts", access: "billing:payments:collect", translationKey: "closedShifts" },
        { label: "تحليل ذمم المرضى", path: "/accounting/patients-aging", access: "acc:reports:view", translationKey: "patientsAging" },
      ],
    },
    {
      key: "insurance",
      title: "التأمين الصحي والمطالبات",
      translationKey: "insuranceSection",
      icon: <ShieldCheck size={18} strokeWidth={1.75} />,
      allowedRoles: ["ADMIN", "ACCOUNTANT", "RCM_MANAGER", "CASHIER"],
      items: [
        { label: "شركات التأمين", path: "/insurance/providers", access: "billing:insurance:manage", translationKey: "insurance" },
        { label: "الموافقات المسبقة", path: "/insurance/pre-auth", access: "billing:insurance:manage", translationKey: "preAuth" },
        { label: "مطالبات التأمين", path: "/insurance/claims", access: "billing:insurance:manage", translationKey: "claims" },
      ],
    },
    {
      key: "analytics",
      title: "التحليلات والتقارير",
      translationKey: "analytics",
      icon: <BarChart3 size={18} strokeWidth={1.75} />,
      allowedRoles: ["ADMIN", "CEO", "QUALITY_MANAGER"],
      items: [
        { label: "اللوحة التنفيذية (KPIs)", path: "/analytics/executive", translationKey: "executive" },
        { label: "مؤشرات الجودة (HIMSS)", path: "/analytics/clinical-kpis", translationKey: "himss" },
        { label: "لوحة التقارير والتحليلات", path: "/reports", access: "acc:reports:view", translationKey: "reports" },
        { label: "تقارير أداء الأطباء", path: "/reports/doctor-performance", translationKey: "doctorPerf" },
        { label: "إيرادات الأقسام", path: "/reports/revenue-department", translationKey: "revDept" },
      ],
    },
    {
      key: "purchases",
      title: "المخازن وسلاسل الإمداد",
      translationKey: "purchases",
      icon: <Package size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      items: [
        { label: "لوحة تحكم المخزون", path: "/inventory/dashboard", access: "inventory:stock:view", translationKey: "stockDashboard" },
        { label: "البيانات الأساسية (الأصناف)", path: "/inventory/master-data/products", access: "inventory:stock:manage", translationKey: "products" },
        { label: "فئات الأصناف للتقييم", path: "/inventory/master-data/categories", access: "inventory:stock:manage", translationKey: "categories" },
        { label: "إعدادات معاملات التحويل", path: "/inventory/settings/product-uoms", access: "inventory:stock:manage", translationKey: "uomConversion" },
        { label: "إدارة وحدات القياس (UOMs)", path: "/inventory/master-data/uoms", access: "inventory:stock:manage", translationKey: "uoms" },
        { label: "إدارة المستودعات", path: "/inventory/warehouses", access: "inventory:stock:manage", translationKey: "warehouses" },
        { label: "طلبات الشراء (PR)", path: "/inventory/procurement/pr/new", access: "inventory:stock:manage", translationKey: "pr" },
        { label: "أوامر الشراء (PO)", path: "/purchases/orders", access: "purchases:manage", translationKey: "po" },
        { label: "استلام بضاعة (GRN)", path: "/inventory/procurement/grn/new", access: "inventory:stock:manage", translationKey: "grn" },
        { label: "الموردون", path: "/suppliers", access: "purchases:suppliers:manage", translationKey: "suppliers" },
        { label: "فواتير المشتريات", path: "/purchases/invoices", access: "purchases:invoices:manage", translationKey: "purchaseInvoices" },
        { label: "تحليل ذمم الموردين", path: "/suppliers/aging", access: "purchases:dashboard:view", translationKey: "supplierAging" },
        { label: "مخزون الصيدلية", path: "/pharmacy/stock", access: "pharmacy:inventory:view", requiredModule: "PHARMACY", translationKey: "pharmacyStock" },
        { label: "تنبيهات المخزون", path: "/inventory/alerts", access: "inventory:stock:view", translationKey: "inventoryAlerts" },
        { label: "تقرير حركات المخزون", path: "/pharmacy/stock-report", access: "pharmacy:inventory:view", requiredModule: "PHARMACY", translationKey: "stockReport" },
        {
          label: i18n.language.startsWith("ar") ? "متابعة استهلاك المواد" : "Material consumption operations",
          path: "/inventory/consumption-operations",
          access: "inventory:view",
          translationKey: "consumptionOperations",
        },
        { label: "التحويلات المخزنية", path: "/inventory/transfers", access: "inventory:transfers:manage", translationKey: "transfers" },
        { label: "طلبات المواد", path: "/inventory/material-requests", access: "inventory:stock:manage", translationKey: "materialRequests" },
        { label: "جرد المخزون", path: "/inventory/counts", access: "inventory:stock:manage", translationKey: "counts" },
      ],
    },
    {
      key: "assets",
      title: "الأصول والصيانة",
      translationKey: "assets",
      icon: <Building2 size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      requiredModule: "ASSETS",
      items: [
        { label: "سجل الأصول", path: "/assets", access: "assets:dashboard:view", translationKey: "assetsRegistry" },
        { label: "إدارة الصيانة", path: "/assets/maintenance", access: "assets:maintenance:manage", translationKey: "maintenance" },
        { label: "احتساب الإهلاك", path: "/assets/depreciation", access: "assets:manage", translationKey: "depreciation" },
      ],
    },
    {
      key: "accounting",
      title: "المحاسبة العامة",
      translationKey: "accounting",
      icon: <Calculator size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      requiredModule: "ACCOUNTS",
      items: [
        { label: "السنوات المالية", path: "/financial-years", access: "acc:settings:manage", translationKey: "years" },
        { label: "دليل الحسابات", path: "/accounting/chart-of-accounts", access: "acc:dashboard:view", translationKey: "coa" },
        { label: "الأرصدة الافتتاحية", path: "/accounting/opening-balances", access: "acc:opening-balances", translationKey: "openingBalances" },
        { label: "قيد يدوي", path: "/accounting/manual-entry", access: "acc:entries:create", translationKey: "manualEntry" },
        { label: "دفتر اليومية العامة", path: "/accounting/journal", access: "acc:entries:view", translationKey: "journal" },
        { label: "سجل القيود المحاسبية (Entries)", path: "/accounting/entries", access: "acc:entries:view", translationKey: "entries" },
        { label: "دفتر الأستاذ", path: "/accounting/ledger", access: "acc:reports:view", translationKey: "ledger" },
        { label: "ميزان المراجعة", path: "/accounting/trial-balance", access: "acc:reports:view", translationKey: "trialBalance" },
        { label: "قائمة الدخل", path: "/accounting/income-statement", access: "acc:reports:view", translationKey: "incomeStatement" },
        { label: "مراكز التكلفة", path: "/accounting/cost-centers", access: "acc:cost_centers:manage", translationKey: "costCenters" },
        { label: "أذونات الصرف والقبض", path: "/accounting/vouchers", access: "acc:entries:create", translationKey: "vouchers" },
        { label: "الميزانية العمومية", path: "/accounting/balance-sheet", access: "acc:reports:view", translationKey: "balanceSheet" },
        { label: "إقفال السنة", path: "/accounting/year-closing", access: "acc:year:close", translationKey: "closing" },
      ],
    },
    {
      key: "quality",
      title: "الجودة وسلامة المريض",
      translationKey: "quality",
      icon: <Shield size={18} strokeWidth={1.75} />,
      allowedRoles: ["ADMIN", "QUALITY_MANAGER", "MEDICAL_DIRECTOR"],
      items: [
        { label: "لوحة الجودة والحوادث", path: "/quality", access: "quality:incidents:view", translationKey: "qualityDashboard" },
        { label: "الإبلاغ عن حادثة / Near Miss", path: "/quality?tab=report", access: "quality:incidents:report", translationKey: "incidentReport" },
        { label: "مهام CAPA المسندة إليّ", path: "/quality?tab=my-capa", translationKey: "myCapa" },
      ],
    },
    {
      key: "integration",
      title: "الربط والتكامل",
      translationKey: "integration",
      icon: <Network size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      items: [
        { label: "السجل الوطني (MPI)", path: "/settings", access: "admin:settings:manage", translationKey: "mpi" },
        { label: "إدارة الأجهزة (LIS/PACS)", path: "/integration", access: "integration:manage", translationKey: "gateway" },
      ],
    },
    {
      key: "settings",
      title: "الإعدادات",
      translationKey: "settings",
      icon: <Settings size={18} strokeWidth={1.75} />,
      allowedRoles: [],
      items: [
        { label: "المؤسسة والفروع", path: "/settings", access: "admin:settings:manage", translationKey: "branches" },
        { label: "الشبكة والمؤسسات", path: "/settings/organizations", access: "admin:settings:manage", translationKey: "tenants" },
        { label: "وصول الفروع", path: "/settings/branch-access", access: "admin:users:manage", translationKey: "branchAccess" },
        { label: "إعدادات النظام", path: "/settings/system", access: "admin:settings:manage", translationKey: "system" },
        { label: "الأقسام (Departments)", path: "/settings/departments", access: "admin:settings:manage", translationKey: "departments" },
        { label: "التخصصات (Specialties)", path: "/settings/specialties", access: "admin:settings:manage", translationKey: "specialties" },
        { label: "قوائم الأسعار", path: "/settings/price-lists", access: "admin:settings:manage", translationKey: "priceLists" },
        { label: "الخدمات والأسعار", path: "/services", access: "admin:settings:manage", translationKey: "services" },
        { label: "المستخدمون والصلاحيات", path: "/users", access: "admin:users:manage", translationKey: "users" },
        { label: "إدارة الأسرة", path: "/settings/bed-management", access: "adt:bed:manage", translationKey: "bedConfig" },
        { label: "لوحة تدقيق الامتثال (ISO/SOC2)", path: "/settings/compliance", access: "admin:audit:view", translationKey: "compliance" },
        { label: "سجل التدقيق (Audit Logs)", path: "/audit/logs", access: "admin:audit:view", translationKey: "auditLogs" },
        { label: "جداول الأطباء", path: "/settings/doctor-schedules", access: "admin:settings:manage", translationKey: "doctorSchedules" },
        { label: "النسخ الاحتياطي والاستعادة", path: "/settings/backup", access: "admin:settings:manage", translationKey: "backups" },
        { label: "قوالب الملاحظات الطبية", path: "/settings/note-templates", access: "admin:settings:manage", translationKey: "noteTemplates" },
        { label: "إعدادات العمولات", path: "/settings/commissions", access: "admin:settings:manage", translationKey: "commissions" },
        { label: "حول النظام", path: "/about", translationKey: "about" },
      ],
    },
  ];

  const authorizedMenu = useMemo(() => {
    if (!user) return [];

    return menuStructure
      .map((section) => {
        if (section.requiredModule && !isModuleEnabled(section.requiredModule)) {
          return null;
        }

        const validItems = section.items.filter((item) =>
          hasAccess(item, section.allowedRoles),
        );

        if (validItems.length === 0) return null;

        return { ...section, items: validItems };
      })
      .filter((section): section is MenuSection => section !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isModuleEnabled, licenseState, licenseDetails, licenseFeatures]);

  useEffect(() => {
    const activeSection = authorizedMenu.find((section) =>
      section.items.some(
        (item) =>
          item.path === location.pathname ||
          (item.path !== "/" &&
            location.pathname.startsWith(item.path.split("?")[0])),
      ),
    );
    if (activeSection) {
      setOpenSection(activeSection.key);
    }
  }, [location.pathname, authorizedMenu]);

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `block w-full px-4 py-2.5 rounded-lg text-xs md:text-sm transition-all duration-200 ${
      isRtl ? "border-r-[3px]" : "border-l-[3px]"
    } ${
      isActive
        ? "bg-sky-500/10 text-sky-400 border-sky-500 font-medium"
        : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/5"
    }`;

  return (
    <div className="h-screen w-screen flex bg-slate-950 text-slate-100 overflow-hidden">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`w-64 flex flex-col bg-slate-950/95 backdrop-blur h-full flex-shrink-0 z-50
        fixed md:relative top-0
        ${isRtl ? "right-0 border-l border-slate-800" : "left-0 border-r border-slate-800"}
        transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? "translate-x-0" : isRtl ? "translate-x-full md:translate-x-0" : "-translate-x-full md:translate-x-0"}
        md:flex`}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex-shrink-0 flex items-center gap-3">
          <img src="/sarayalogo.png" alt="السرايا" className="w-10 h-10 rounded-lg object-contain" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-sky-500 font-bold mb-0.5">
              HOSPITAL SUITE
            </div>
            <div className="font-bold text-sm text-white leading-tight">
              {t("common.appName", "نظام السرايا الطبي")}
            </div>
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
                  data-testid={`menu-section-${section.key}`}
                  className={`flex items-center justify-between w-full px-3 py-3 text-sm font-medium rounded-xl transition-colors duration-200
                    ${isOpen ? "text-slate-100" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isOpen ? "text-sky-500" : "text-slate-500"}>
                      {section.icon}
                    </span>
                    <span>
                      {t("menu." + (section.translationKey || section.key), section.title)}
                    </span>
                  </div>
                  <span
                    className={`transition-transform duration-300 text-slate-600 ${
                      isOpen ? (isRtl ? "-rotate-90" : "rotate-90") : "rotate-0"
                    }`}
                  >
                    <ChevronLeft size={16} strokeWidth={1.75} className={isRtl ? "" : "scale-x-[-1]"} />
                  </span>
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpen ? "max-h-[2000px] opacity-100 mt-1" : "max-h-0 opacity-0"
                  }`}
                >
                  <div
                    className={`space-y-1 py-1 ${
                      isRtl
                        ? "pr-4 pl-1 mr-2 border-r border-slate-800/50"
                        : "pl-4 pr-1 ml-2 border-l border-slate-800/50"
                    }`}
                  >
                    {section.items.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={navLinkClasses}
                      >
                        {t("menu." + (item.translationKey || item.label), item.label)}
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
              <div className="font-semibold text-sm text-white">{user.fullName}</div>
              <div className="text-slate-500 text-[10px] truncate">
                {user.roles?.join(" | ")}
              </div>
              <NavLink
                to="/account/sessions"
                className="mt-2 inline-block text-xs text-sky-300 hover:text-sky-100 underline-offset-4 hover:underline"
              >
                {t("deviceSessions.title")}
              </NavLink>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 hover:text-rose-300 text-xs py-2 transition border border-rose-900/30"
          >
            <LogOut size={14} strokeWidth={1.75} />
            <span>{t("common.logout", "تسجيل الخروج")}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 relative">
        {licenseDetails?.isGracePeriod && (
          <div className="saraya-solid-bg bg-rose-900/90 text-white text-center text-sm py-2 px-4 shadow-lg backdrop-blur-sm z-50 border-b border-rose-500/30 flex items-center justify-center gap-3 flex-wrap">
            <AlertTriangle size={16} className="text-amber-300 shrink-0" />
            <span>
              <strong>تنبيه:</strong> انتهت فترة الاشتراك. متبقي{" "}
              <strong className="text-amber-300">
                {licenseDetails.graceDaysRemaining ?? "?"} يوم
              </strong>{" "}
              من فترة السماح. سيتوقف النظام بعدها.
            </span>
            <a
              href="/activation"
              className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors border border-white/20"
            >
              <RefreshCw size={12} />
              <span>تجديد الاشتراك الآن</span>
            </a>
          </div>
        )}

        {!licenseDetails?.isGracePeriod &&
          licenseDetails?.daysRemaining !== undefined &&
          licenseDetails.daysRemaining <= 7 &&
          licenseDetails.daysRemaining > 0 && (
            <div className="saraya-solid-bg bg-amber-900/80 text-white text-center text-sm py-2 px-4 shadow-lg backdrop-blur-sm z-50 border-b border-amber-500/30 flex items-center justify-center gap-3 flex-wrap">
              <Clock size={16} className="text-amber-200 shrink-0" />
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
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label={t("common.openMenu", "فتح القائمة")}
          >
            <Menu size={22} strokeWidth={1.75} />
          </button>
          <div className="hidden md:block text-slate-400 text-xs font-medium">
            {t("common.welcomeMsg", "مرحباً بك في نظام السرايا الطبي - النسخة التشغيلية")}
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <LanguageSwitcher />
            <NotificationBell />
            {accessibleBranches.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setBranchMenuOpen(!branchMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-900/30 hover:bg-sky-900/50 border border-sky-700/30 text-sky-300 text-xs font-medium transition-all duration-200"
                  title={t("common.switchBranch", "تبديل الفرع")}
                >
                  <GitBranch size={14} strokeWidth={1.75} />
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {currentBranchName}
                  </span>
                  {isSwitchingBranch ? (
                    <Loader2 size={12} className="animate-spin text-sky-400" />
                  ) : (
                    <ChevronDown size={12} strokeWidth={2} />
                  )}
                </button>
                {branchMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setBranchMenuOpen(false)}
                    />
                    <div className="absolute left-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden backdrop-blur-xl">
                      <div className="px-3 py-2 border-b border-slate-700/50">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                          {t("common.switchBranch", "تبديل الفرع")}
                        </div>
                      </div>
                      <div className="py-1 max-h-60 overflow-y-auto custom-scrollbar">
                        {accessibleBranches.map((branch) => (
                          <button
                            key={branch.id}
                            onClick={() => {
                              setBranchMenuOpen(false);
                              switchBranch(branch.id);
                            }}
                            disabled={isSwitchingBranch || branch.id === currentBranchId}
                            className={`w-full text-right px-4 py-2.5 text-sm transition-all duration-150 flex items-center justify-between gap-2 ${
                              branch.id === currentBranchId
                                ? "bg-sky-900/40 text-sky-300 font-medium"
                                : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                            }`}
                          >
                            <span className="truncate">{branch.name}</span>
                            {branch.id === currentBranchId && (
                              <Check size={14} strokeWidth={2.5} className="text-sky-400 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
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
