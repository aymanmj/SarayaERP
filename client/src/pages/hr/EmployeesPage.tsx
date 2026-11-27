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
    <div className="p-6 text-slate-100 h-full flex flex-col space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sky-500/15 border border-sky-500/40 rounded-2xl text-sky-400">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              شؤون الموظفين والكوادر (Employees)
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              سجل مركزي موحد لجميع الكوادر الطبية والتمريضية والفنية والإدارية (مستقل عن حسابات دخول النظام)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/hr/org"
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-2"
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
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-xs font-bold flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            تصدير Excel
          </button>

          <button
            type="button"
            onClick={() => setImportModal({ open: true, mode: "standard" })}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-sky-400" />
            استيراد Excel
          </button>

          {altamamEnabled && (
            <button
              type="button"
              onClick={() => setImportModal({ open: true, mode: "altamam" })}
              data-testid="btn-altamam-import"
              className="px-4 py-2.5 rounded-xl bg-purple-600/90 hover:bg-purple-500 text-white text-xs font-bold shadow-lg flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              استيراد من منظومة التمام (Excel)
            </button>
          )}

          <Link
            to="/hr/employees/new"
            className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-lg shadow-sky-900/30 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            موظف جديد
          </Link>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-bold">إجمالي الموظفين</div>
            <div className="text-2xl font-black mt-1 text-white">
              {stats?.total ?? 0}
            </div>
          </div>
          <Users className="w-8 h-8 text-sky-500/60" />
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-bold">على رأس العمل</div>
            <div className="text-2xl font-black mt-1 text-emerald-400">
              {stats?.active ?? 0}
            </div>
          </div>
          <UserCheck className="w-8 h-8 text-emerald-500/60" />
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-bold">غير نشط / منتهي</div>
            <div className="text-2xl font-black mt-1 text-rose-400">
              {stats?.inactive ?? 0}
            </div>
          </div>
          <UserX className="w-8 h-8 text-rose-500/60" />
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-bold">لديهم حساب دخول</div>
            <div className="text-2xl font-black mt-1 text-indigo-300">
              {stats?.linkedToUser ?? 0}
            </div>
          </div>
          <KeyRound className="w-8 h-8 text-indigo-400/60" />
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-bold">موظفون بدون حساب نظام</div>
            <div className="text-2xl font-black mt-1 text-amber-300">
              {stats?.nonLoginStaff ?? 0}
            </div>
          </div>
          <UserMinus className="w-8 h-8 text-amber-400/60" />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم، الرقم الوظيفي، البصمة، الهاتف..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
          />
        </div>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
        >
          <option value="">كل الأقسام والإدارات</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={staffCategory}
          onChange={(e) => setStaffCategory(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
        >
          <option value="">كل التصنيفات</option>
          {(Object.keys(STAFF_CATEGORY_LABELS) as StaffCategory[]).map((cat) => (
            <option key={cat} value={cat}>
              {STAFF_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
        >
          <option value="">كل الحالات</option>
          {Object.entries(EMPLOYEE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={hasUserAccount}
          onChange={(e) => setHasUserAccount(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs"
        >
          <option value="">حساب النظام (الكل)</option>
          <option value="true">مرتبط بحساب دخول</option>
          <option value="false">بدون حساب نظام</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/70 text-slate-400 sticky top-0 z-10 border-b border-slate-800 text-xs">
              <tr>
                <th className="px-4 py-3.5">الموظف والرقم الوظيفي</th>
                <th className="px-4 py-3.5">الإدارة / الشعبة والمسمى</th>
                <th className="px-4 py-3.5">التصنيف</th>
                <th className="px-4 py-3.5">حساب النظام</th>
                <th className="px-4 py-3.5">الراتب الأساسي</th>
                <th className="px-4 py-3.5">الحالة</th>
                <th className="px-4 py-3.5 text-center">الإجراءات</th>
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 font-black flex items-center justify-center text-xs shrink-0">
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
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-sky-300 font-mono text-[11px] border border-slate-700">
                              {emp.employeeNo}
                            </span>
                            {altamamEnabled && emp.altamamEmployeeNo && (
                              <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 font-mono text-[11px] border border-purple-500/30">
                                التمام: {emp.altamamEmployeeNo}
                              </span>
                            )}
                            {emp.biometricId && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 font-mono text-[11px]">
                                بصمة: {emp.biometricId}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-200 text-xs">
                        {emp.department?.name || "غير محدد"}
                        {emp.section ? ` / ${emp.section.name}` : ""}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {emp.jobTitle?.name || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          CATEGORY_BADGES[emp.staffCategory] ||
                          CATEGORY_BADGES.ADMINISTRATIVE
                        }`}
                      >
                        {STAFF_CATEGORY_LABELS[emp.staffCategory] ||
                          emp.staffCategory}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {emp.user ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          @{emp.user.username}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] bg-slate-800 text-slate-400 border border-slate-700">
                          بدون حساب نظام
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">
                      {formatMoney(emp.basicSalary, false)}{" "}
                      <span className="text-slate-400 text-[10px]">
                        {emp.currency || "LYD"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          STATUS_BADGES[emp.status] || STATUS_BADGES.ACTIVE
                        }`}
                      >
                        {EMPLOYEE_STATUS_LABELS[emp.status] || emp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
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
