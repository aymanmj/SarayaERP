// client/src/pages/hr/EmployeesPage.tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users,
  UserCheck,
  UserX,
  KeyRound,
  UserMinus,
  Plus,
  Search,
  FileSpreadsheet,
  Download,
  Eye,
  Pencil,
  Trash2,
  Building2,
} from "lucide-react";
import {
  hrService,
  type EmployeeListItem,
  type StaffCategory,
} from "../../services/hr.service";
import {
  EMPLOYEE_STATUS_LABELS,
  STAFF_CATEGORY_LABELS,
  exportEmployeesToExcel,
} from "../../utils/hrExport";
import { formatMoney } from "../../utils/money";
import { BulkImportEmployeesModal } from "../../components/hr/BulkImportEmployeesModal";
import {
  SarayaFilterSelect,
  SarayaKpiCard,
  SarayaLtrBadge,
  SarayaPageHeader,
} from "../../components/ui/SarayaPrimitives";

const CATEGORY_BADGES: Record<StaffCategory, string> = {
  MEDICAL: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  NURSING: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PHARMACY: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  LABORATORY: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  RADIOLOGY: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  TECHNICAL: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ADMINISTRATIVE: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const STATUS_BADGES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  PROBATION: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ON_LEAVE: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  SUSPENDED: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  TERMINATED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  RESIGNED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export default function EmployeesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [staffCategory, setStaffCategory] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [hasUserAccount, setHasUserAccount] = useState<string>("");
  const [importModal, setImportModal] = useState<{
    open: boolean;
    mode: "standard" | "altamam";
  }>({ open: false, mode: "standard" });

  const { data: config } = useQuery({
    queryKey: ["hr-config"],
    queryFn: hrService.getConfig,
  });

  const { data: stats } = useQuery({
    queryKey: ["hr-employees-stats"],
    queryFn: hrService.getStats,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: hrService.listDepartments,
  });

  const { data: directory, isLoading } = useQuery({
    queryKey: [
      "hr-employees",
      search,
      departmentId,
      staffCategory,
      status,
      hasUserAccount,
    ],
    queryFn: () =>
      hrService.listEmployees({
        search: search.trim() || undefined,
        departmentId: departmentId ? Number(departmentId) : undefined,
        staffCategory: staffCategory || undefined,
        status: status || undefined,
        hasUserAccount: hasUserAccount || undefined,
        limit: 200,
      }),
  });

  const altamamEnabled = Boolean(config?.altamamIntegrationEnabled);
  const employees: EmployeeListItem[] = directory?.items ?? [];

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
    queryClient.invalidateQueries({ queryKey: ["hr-employees-stats"] });
    queryClient.invalidateQueries({ queryKey: ["hr-config"] });
  };

  const handleDelete = async (emp: EmployeeListItem) => {
    if (
      !confirm(
        `هل أنت متأكد من إنهاء/أرشفة ملف الموظف "${emp.fullName}" (${emp.employeeNo})؟`,
      )
    ) {
      return;
    }
    try {
      await hrService.deleteEmployee(emp.id);
      toast.success("تم حذف/إنهاء سجل الموظف بنجاح.");
      handleRefreshAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر حذف الموظف.");
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4" dir="rtl">
      {/* Header */}
      <SarayaPageHeader
        title="شؤون الموظفين والكوادر (Employees)"
        subtitle="سجل مركزي موحد لجميع الكوادر الطبية والتمريضية والفنية والإدارية (مستقل عن حسابات دخول النظام)"
        icon={<Users className="w-6 h-6" />}
        actions={
          <>
            <Link
              to="/hr/org"
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <Building2 className="w-4 h-4 text-amber-400" />
              الشُعب والمسميات
            </Link>

            <button
              type="button"
              onClick={() =>
                exportEmployeesToExcel(employees, { includeAltamam: altamamEnabled })
              }
              disabled={employees.length === 0}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              تصدير Excel
            </button>

            <button
              type="button"
              onClick={() => setImportModal({ open: true, mode: "standard" })}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-sky-400" />
              استيراد Excel
            </button>

            {altamamEnabled && (
              <button
                type="button"
                onClick={() => setImportModal({ open: true, mode: "altamam" })}
                data-testid="btn-altamam-import"
                className="px-3.5 py-2 rounded-xl bg-purple-600/90 hover:bg-purple-500 text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                استيراد من منظومة التمام (Excel)
              </button>
            )}

            <Link
              to="/hr/employees/new"
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold shadow-sm flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              موظف جديد
            </Link>
          </>
        }
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SarayaKpiCard
          label="إجمالي الموظفين"
          value={stats?.total ?? 0}
          accent="sky"
          ltrValue
          icon={<Users className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="على رأس العمل"
          value={stats?.active ?? 0}
          accent="emerald"
          ltrValue
          icon={<UserCheck className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="غير نشط / منتهي"
          value={stats?.inactive ?? 0}
          accent="rose"
          ltrValue
          icon={<UserX className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="لديهم حساب دخول"
          value={stats?.linkedToUser ?? 0}
          accent="indigo"
          ltrValue
          icon={<KeyRound className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="موظفون بدون حساب نظام"
          value={stats?.nonLoginStaff ?? 0}
          accent="amber"
          ltrValue
          icon={<UserMinus className="w-5 h-5" />}
        />
      </div>

      {/* Filters */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 grid grid-cols-1 md:grid-cols-6 gap-2.5 shadow-sm">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم، الرقم الوظيفي، البصمة، الهاتف..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
          />
        </div>
        <SarayaFilterSelect
          value={departmentId}
          onChange={setDepartmentId}
          options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
          placeholder="كل الأقسام والإدارات"
          allLabel="كل الأقسام والإدارات"
          searchPlaceholder="ابحث عن قسم..."
          ariaLabel="تصفية حسب القسم"
        />
        <SarayaFilterSelect
          value={staffCategory}
          onChange={setStaffCategory}
          options={(Object.keys(STAFF_CATEGORY_LABELS) as StaffCategory[]).map(
            (cat) => ({
              value: cat,
              label: STAFF_CATEGORY_LABELS[cat],
            }),
          )}
          placeholder="كل التصنيفات"
          allLabel="كل التصنيفات"
          ariaLabel="تصفية حسب التصنيف"
        />
        <SarayaFilterSelect
          value={status}
          onChange={setStatus}
          options={Object.entries(EMPLOYEE_STATUS_LABELS).map(([k, v]) => ({
            value: k,
            label: v,
          }))}
          placeholder="كل الحالات"
          allLabel="كل الحالات"
          ariaLabel="تصفية حسب الحالة"
        />
        <SarayaFilterSelect
          value={hasUserAccount}
          onChange={setHasUserAccount}
          options={[
            { value: "true", label: "مرتبط بحساب دخول" },
            { value: "false", label: "بدون حساب نظام" },
          ]}
          placeholder="حساب النظام (الكل)"
          allLabel="حساب النظام (الكل)"
          ariaLabel="تصفية حسب حساب النظام"
        />
      </div>

      {/* Table */}
      <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/80 text-slate-400 sticky top-0 z-10 border-b border-slate-800 text-xs">
              <tr>
                <th className="px-4 py-3 font-bold">الموظف والرقم الوظيفي</th>
                <th className="px-4 py-3 font-bold">الإدارة / الشعبة والمسمى</th>
                <th className="px-4 py-3 font-bold">التصنيف</th>
                <th className="px-4 py-3 font-bold">حساب النظام</th>
                <th className="px-4 py-3 font-bold">الراتب الأساسي</th>
                <th className="px-4 py-3 font-bold">الحالة</th>
                <th className="px-4 py-3 font-bold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    جارِ تحميل سجل الموظفين...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    لا توجد سجلات موظفين مطابقة للفلاتر المحددة.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 font-black flex items-center justify-center text-xs shrink-0">
                          {emp.fullName?.trim()?.slice(0, 2) || "مو"}
                        </div>
                        <div>
                          <Link
                            to={`/hr/employees/${emp.id}`}
                            className="font-bold text-slate-100 hover:text-sky-400 transition-colors"
                          >
                            {emp.fullName}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <SarayaLtrBadge className="px-2 py-0.5 rounded-md bg-slate-800 text-sky-300 text-[11px] border border-slate-700">
                              {emp.employeeNo}
                            </SarayaLtrBadge>
                            {altamamEnabled && emp.altamamEmployeeNo && (
                              <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 text-[11px] border border-purple-500/30">
                                التمام:{" "}
                                <SarayaLtrBadge>{emp.altamamEmployeeNo}</SarayaLtrBadge>
                              </span>
                            )}
                            {emp.biometricId && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 text-[11px]">
                                بصمة:{" "}
                                <SarayaLtrBadge>{emp.biometricId}</SarayaLtrBadge>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-200 text-xs">
                        {emp.department?.name || "غير محدد"}
                        {emp.section ? ` / ${emp.section.name}` : ""}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {emp.jobTitle?.name || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          CATEGORY_BADGES[emp.staffCategory] ||
                          CATEGORY_BADGES.ADMINISTRATIVE
                        }`}
                      >
                        {STAFF_CATEGORY_LABELS[emp.staffCategory] ||
                          emp.staffCategory}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {emp.user ? (
                        <SarayaLtrBadge className="px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          @{emp.user.username}
                        </SarayaLtrBadge>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-slate-800 text-slate-400 border border-slate-700">
                          بدون حساب نظام
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-200">
                      <span
                        dir="ltr"
                        className="inline-flex items-baseline gap-1 font-mono font-bold tabular-nums"
                      >
                        <span>{formatMoney(emp.basicSalary, false)}</span>
                        <span className="text-slate-400 text-[10px] font-normal">
                          {emp.currency || "LYD"}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          STATUS_BADGES[emp.status] || STATUS_BADGES.ACTIVE
                        }`}
                      >
                        {EMPLOYEE_STATUS_LABELS[emp.status] || emp.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/hr/employees/${emp.id}`)}
                          title="عرض الملف الشامل"
                          className="p-2 rounded-lg bg-slate-800 hover:bg-sky-600/20 text-sky-400"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/hr/employees/${emp.id}/edit`)}
                          title="تعديل"
                          className="p-2 rounded-lg bg-slate-800 hover:bg-amber-600/20 text-amber-400"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(emp)}
                          title="حذف / أرشفة"
                          className="p-2 rounded-lg bg-slate-800 hover:bg-rose-600/20 text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BulkImportEmployeesModal
        open={importModal.open}
        mode={importModal.mode}
        altamamEnabled={altamamEnabled}
        onClose={() => setImportModal({ open: false, mode: "standard" })}
        onSuccess={handleRefreshAll}
      />
    </div>
  );
}
