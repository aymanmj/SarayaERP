// client/src/pages/hr/EmployeeDetailsPage.tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Pencil,
  KeyRound,
  Unlink,
  Download,
  Plus,
  Trash2,
  ShieldCheck,
  FileLock2,
  Clock,
  GraduationCap,
} from "lucide-react";
import { hrService, type EmployeeActionType } from "../../services/hr.service";
import {
  EMPLOYEE_STATUS_LABELS,
  STAFF_CATEGORY_LABELS,
} from "../../utils/hrExport";
import { formatMoney } from "../../utils/money";

type ProfileTab =
  | "overview"
  | "qualifications"
  | "documents"
  | "actions"
  | "shifts";

const ACTION_TYPE_LABELS: Record<EmployeeActionType, string> = {
  HIRE: "تعيين",
  PROMOTION: "ترقية",
  TRANSFER: "نقل إداري",
  SALARY_ADJUSTMENT: "تعديل راتب",
  BONUS: "مكافأة",
  WARNING: "لفت نظر / إنذار",
  SUSPENSION: "إيقاف مؤقت",
  TERMINATION: "إنهاء خدمة",
  RESIGNATION: "استقالة",
  REHIRE: "إعادة تعيين",
};

export default function EmployeeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<ProfileTab>("overview");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkMode, setLinkMode] = useState<"create" | "existing">("create");
  const [linkForm, setLinkForm] = useState({
    existingUserId: "",
    username: "",
    password: "",
    roleNames: ["RECEPTION"],
    isDoctor: false,
  });

  const [showActionModal, setShowActionModal] = useState(false);
  const [actionForm, setActionForm] = useState({
    actionType: "PROMOTION" as EmployeeActionType,
    fromValue: "",
    toValue: "",
    effectiveDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const { data: config } = useQuery({
    queryKey: ["hr-config"],
    queryFn: hrService.getConfig,
  });

  const {
    data: employee,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["hr-employee", employeeId],
    queryFn: () => hrService.getEmployee(employeeId),
    enabled: Number.isFinite(employeeId) && employeeId > 0,
  });

  const { data: usersAndRoles } = useQuery({
    queryKey: ["users-and-roles-lite"],
    queryFn: hrService.listUsersAndRoles,
    enabled: showLinkModal,
  });

  const altamamEnabled = Boolean(config?.altamamIntegrationEnabled);

  const handleLinkUser = async () => {
    try {
      if (linkMode === "existing") {
        if (!linkForm.existingUserId) {
          toast.warning("اختر حساب مستخدم لربطه بالموظف.");
          return;
        }
        await hrService.linkUser(employeeId, {
          userId: Number(linkForm.existingUserId),
        });
      } else {
        if (!linkForm.username.trim() || linkForm.password.length < 6) {
          toast.warning("أدخل اسم مستخدم (3 أحرف+) وكلمة مرور (6 أحرف+).");
          return;
        }
        await hrService.linkUser(employeeId, {
          username: linkForm.username.trim(),
          password: linkForm.password,
          roleNames: linkForm.roleNames,
          isDoctor: linkForm.isDoctor,
        });
      }
      toast.success("تم ربط حساب المستخدم بملف الموظف بنجاح.");
      setShowLinkModal(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr-employees-stats"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر ربط الحساب.");
    }
  };

  const handleUnlinkUser = async () => {
    if (
      !confirm(
        "هل تريد فك ارتباط حساب المستخدم بهذا الموظف؟ سيبقى ملف الموظف مستقلاً بدون صلاحية دخول.",
      )
    ) {
      return;
    }
    try {
      await hrService.unlinkUser(employeeId);
      toast.success("تم فك ارتباط الحساب بنجاح.");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr-employees-stats"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر فك الارتباط.");
    }
  };

  const handleCreateAction = async () => {
    try {
      await hrService.createAction(employeeId, {
        actionType: actionForm.actionType,
        fromValue: actionForm.fromValue.trim() || undefined,
        toValue: actionForm.toValue.trim() || undefined,
        effectiveDate: actionForm.effectiveDate,
        notes: actionForm.notes.trim() || undefined,
      });
      toast.success("تم تسجيل الإجراء الوظيفي بنجاح.");
      setShowActionModal(false);
      setActionForm({
        actionType: "PROMOTION",
        fromValue: "",
        toValue: "",
        effectiveDate: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "تعذر تسجيل الإجراء.");
    }
  };

  const handleDownloadDocument = async (docId: number, filename: string) => {
    try {
      const blob = await hrService.downloadDocumentBlob(employeeId, docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("تعذر تحميل الوثيقة.");
    }
  };

  if (isLoading || !employee) {
    return (
      <div className="p-10 text-center text-slate-400" dir="rtl">
        جارِ تحميل ملف الموظف...
      </div>
    );
  }

  return (
    <div className="p-6 text-slate-100 max-w-6xl mx-auto space-y-6" dir="rtl">
      {/* Header Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/hr/employees")}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="w-14 h-14 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300 text-xl font-black">
            {employee.fullName.slice(0, 2)}
          </div>
          <div>
            <h1 className="text-2xl font-black">{employee.fullName}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-800 text-sky-300 font-mono border border-slate-700">
                {employee.employeeNo}
              </span>
              {altamamEnabled && employee.altamamEmployeeNo && (
                <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/15 text-purple-300 font-mono border border-purple-500/30">
                  التمام: {employee.altamamEmployeeNo}
                </span>
              )}
              <span className="text-slate-400">
                {employee.department?.name || "—"} • {employee.jobTitle?.name || "—"}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {EMPLOYEE_STATUS_LABELS[employee.status] || employee.status}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {employee.user ? (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <span className="font-mono text-emerald-300">
                @{employee.user.username}
              </span>
              <button
                type="button"
                onClick={handleUnlinkUser}
                className="mr-2 px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 flex items-center gap-1"
              >
                <Unlink className="w-3.5 h-3.5" /> فك الارتباط
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLinkModal(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              إنشاء / ربط حساب مستخدم
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(`/hr/employees/${employee.id}/edit`)}
            className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-2"
          >
            <Pencil className="w-4 h-4" />
            تعديل البيانات
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-900/40 p-2 rounded-2xl border border-slate-800">
        {[
          { id: "overview", label: "نظرة عامة والبيانات المالية" },
          { id: "qualifications", label: "المؤهلات والدورات" },
          { id: "documents", label: "الوثائق المشفرة" },
          { id: "actions", label: "الإجراءات الوظيفية" },
          { id: "shifts", label: "الورديات والتراخيص" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as ProfileTab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              tab === t.id
                ? "bg-sky-600 text-white"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 shadow-xl">
        {tab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-3 bg-slate-950/50 p-5 rounded-2xl border border-slate-800">
              <h3 className="font-black text-sky-400 text-sm mb-2">
                البيانات الشخصية والوظيفية
              </h3>
              <div className="grid grid-cols-2 gap-y-2.5">
                <span className="text-slate-400">التصنيف:</span>
                <span>{STAFF_CATEGORY_LABELS[employee.staffCategory]}</span>
                <span className="text-slate-400">الإدارة / القسم:</span>
                <span>{employee.department?.name || "—"}</span>
                <span className="text-slate-400">الشعبة:</span>
                <span>{employee.section?.name || "—"}</span>
                <span className="text-slate-400">المسمى الوظيفي:</span>
                <span>{employee.jobTitle?.name || "—"}</span>
                <span className="text-slate-400">كود البصمة:</span>
                <span className="font-mono">{employee.biometricId || "—"}</span>
                <span className="text-slate-400">الرقم الوطني:</span>
                <span className="font-mono">{employee.nationalId || "—"}</span>
                <span className="text-slate-400">الهاتف:</span>
                <span className="font-mono">{employee.phone || "—"}</span>
                <span className="text-slate-400">تاريخ التعيين:</span>
                <span>{employee.hireDate?.slice(0, 10) || "—"}</span>
              </div>
            </div>

            <div className="space-y-3 bg-slate-950/50 p-5 rounded-2xl border border-slate-800">
              <h3 className="font-black text-emerald-400 text-sm mb-2">
                الهيكل المالي والبيانات البنكية ({employee.currency || "LYD"})
              </h3>
              <div className="grid grid-cols-2 gap-y-2.5">
                <span className="text-slate-400">أساس الصرف:</span>
                <span>{employee.payBasis}</span>
                <span className="text-slate-400">الراتب الأساسي:</span>
                <span className="font-mono font-bold text-emerald-300">
                  {formatMoney(employee.basicSalary, false)} {employee.currency}
                </span>
                <span className="text-slate-400">بدل سكن:</span>
                <span className="font-mono">
                  {formatMoney(employee.housingAllowance, false)} {employee.currency}
                </span>
                <span className="text-slate-400">بدل مواصلات:</span>
                <span className="font-mono">
                  {formatMoney(employee.transportAllowance, false)} {employee.currency}
                </span>
                <span className="text-slate-400">بدلات أخرى:</span>
                <span className="font-mono">
                  {formatMoney(employee.otherAllowance, false)} {employee.currency}
                </span>
                <span className="text-slate-400">المصرف / IBAN:</span>
                <span className="font-mono">
                  {[employee.bankName, employee.iban || employee.bankAccountNo]
                    .filter(Boolean)
                    .join(" • ") || "—"}
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === "qualifications" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-3">
              <h3 className="font-black text-sky-400 flex items-center gap-2">
                <GraduationCap className="w-4 h-4" /> المؤهلات العلمية
              </h3>
              {employee.qualifications.length === 0 ? (
                <div className="text-slate-500">لا توجد مؤهلات مسجلة.</div>
              ) : (
                employee.qualifications.map((q) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800"
                  >
                    <div className="font-bold">{q.degree} {q.major ? `(${q.major})` : ""}</div>
                    <div className="text-slate-400 mt-0.5">
                      {q.institution} {q.graduationYear ? `• ${q.graduationYear}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-3">
              <h3 className="font-black text-amber-400">الدورات التدريبية</h3>
              {employee.trainingCourses.length === 0 ? (
                <div className="text-slate-500">لا توجد دورات مسجلة.</div>
              ) : (
                employee.trainingCourses.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800"
                  >
                    <div className="font-bold">{c.courseName}</div>
                    <div className="text-slate-400 mt-0.5">
                      {c.provider} {c.hoursCount ? `• ${c.hoursCount} ساعة` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-sky-400 flex items-center gap-2">
                <FileLock2 className="w-4 h-4" /> الوثائق المشفرة (AES-256-GCM)
              </h3>
              <button
                type="button"
                onClick={() => navigate(`/hr/employees/${employee.id}/edit`)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold"
              >
                إدارة / رفع وثيقة جديدة
              </button>
            </div>
            {employee.documents.length === 0 ? (
              <div className="text-slate-500">لا توجد وثائق مرفوعة.</div>
            ) : (
              employee.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800"
                >
                  <div>
                    <div className="font-bold text-slate-100">{doc.title}</div>
                    <div className="text-slate-400 font-mono text-[11px]">
                      {doc.originalName} • SHA-256: {doc.sha256?.slice(0, 12)}...
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadDocument(doc.id, doc.originalName)
                      }
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" /> تنزيل آمن
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await hrService.removeDocument(employeeId, doc.id);
                        refetch();
                      }}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "actions" && (
          <div className="space-y-4 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-indigo-400">
                سجل الإجراءات والتغييرات الوظيفية
              </h3>
              <button
                type="button"
                onClick={() => setShowActionModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> تسجيل إجراء وظيفي
              </button>
            </div>
            {employee.actions.length === 0 ? (
              <div className="text-slate-500">لا توجد إجراءات وظيفية مسجلة.</div>
            ) : (
              employee.actions.map((a) => (
                <div
                  key={a.id}
                  className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 flex justify-between items-start"
                >
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-bold">
                      {ACTION_TYPE_LABELS[a.actionType] || a.actionType}
                    </span>
                    <div className="text-slate-200 mt-2">
                      {a.fromValue && <span>من: {a.fromValue} ← </span>}
                      {a.toValue && <span className="font-bold">إلى: {a.toValue}</span>}
                    </div>
                    {a.notes && (
                      <div className="text-slate-400 mt-1">{a.notes}</div>
                    )}
                  </div>
                  <div className="text-left text-slate-400">
                    <div>{a.effectiveDate?.slice(0, 10)}</div>
                    {a.approvedBy && (
                      <div className="text-[11px] text-slate-500">
                        بواسطة: {a.approvedBy.fullName}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "shifts" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-3">
              <h3 className="font-black text-sky-400 flex items-center gap-2">
                <Clock className="w-4 h-4" /> تعيينات الورديات النشطة
              </h3>
              {employee.shiftAssignments.length === 0 ? (
                <div className="text-slate-500">لا توجد تعيينات ورديات نشطة.</div>
              ) : (
                employee.shiftAssignments.map((sa) => (
                  <div
                    key={sa.id}
                    className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800 flex justify-between"
                  >
                    <div>
                      <div className="font-bold">{sa.shift.name}</div>
                      <div className="text-slate-400 font-mono">
                        {sa.shift.startTime} - {sa.shift.endTime}
                      </div>
                    </div>
                    <div className="text-slate-400">
                      من {sa.startDate?.slice(0, 10)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <h3 className="font-black text-emerald-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> تراخيص مزاولة المهنة والامتثال
              </h3>
              {employee.credentials.length === 0 ? (
                <div className="text-slate-500">لا توجد تراخيص مسجلة.</div>
              ) : (
                employee.credentials.map((cr) => (
                  <div
                    key={cr.id}
                    className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800 flex justify-between"
                  >
                    <div>
                      <div className="font-bold">{cr.title}</div>
                      <div className="text-slate-400 font-mono">
                        {cr.licenseNumber} • {cr.issuingAuthority}
                      </div>
                    </div>
                    <div className="text-amber-300 font-mono">
                      ينتهي: {cr.expiryDate?.slice(0, 10)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Link User Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md space-y-4 text-xs">
            <h3 className="text-base font-black">إنشاء أو ربط حساب مستخدم</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLinkMode("create")}
                className={`flex-1 py-2 rounded-xl font-bold ${
                  linkMode === "create"
                    ? "bg-sky-600 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                إنشاء حساب جديد
              </button>
              <button
                type="button"
                onClick={() => setLinkMode("existing")}
                className={`flex-1 py-2 rounded-xl font-bold ${
                  linkMode === "existing"
                    ? "bg-sky-600 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                ربط بحساب قائم
              </button>
            </div>

            {linkMode === "create" ? (
              <div className="space-y-3">
                <input
                  value={linkForm.username}
                  onChange={(e) =>
                    setLinkForm({ ...linkForm, username: e.target.value })
                  }
                  placeholder="اسم المستخدم (username)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                />
                <input
                  type="password"
                  value={linkForm.password}
                  onChange={(e) =>
                    setLinkForm({ ...linkForm, password: e.target.value })
                  }
                  placeholder="كلمة المرور (6 أحرف فأكثر)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                />
                <div>
                  <label className="text-slate-400 block mb-1">الدور الوظيفي</label>
                  <select
                    value={linkForm.roleNames[0] || "RECEPTION"}
                    onChange={(e) =>
                      setLinkForm({ ...linkForm, roleNames: [e.target.value] })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                  >
                    {(usersAndRoles?.roles || []).map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={linkForm.isDoctor}
                    onChange={(e) =>
                      setLinkForm({ ...linkForm, isDoctor: e.target.checked })
                    }
                  />
                  الحساب لطبيب ممارس (isDoctor)
                </label>
              </div>
            ) : (
              <div>
                <label className="text-slate-400 block mb-1">
                  اختر المستخدم
                </label>
                <select
                  value={linkForm.existingUserId}
                  onChange={(e) =>
                    setLinkForm({ ...linkForm, existingUserId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
                >
                  <option value="">اختر حساباً...</option>
                  {(usersAndRoles?.users || []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} (@{u.username})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleLinkUser}
                className="px-5 py-2 rounded-xl bg-sky-600 text-white font-bold"
              >
                تأكيد الربط
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md space-y-3 text-xs">
            <h3 className="text-base font-black">تسجيل إجراء وظيفي جديد</h3>
            <select
              value={actionForm.actionType}
              onChange={(e) =>
                setActionForm({
                  ...actionForm,
                  actionType: e.target.value as EmployeeActionType,
                })
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            >
              {(Object.keys(ACTION_TYPE_LABELS) as EmployeeActionType[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {ACTION_TYPE_LABELS[t]}
                  </option>
                ),
              )}
            </select>
            <input
              type="date"
              value={actionForm.effectiveDate}
              onChange={(e) =>
                setActionForm({ ...actionForm, effectiveDate: e.target.value })
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <input
              value={actionForm.fromValue}
              onChange={(e) =>
                setActionForm({ ...actionForm, fromValue: e.target.value })
              }
              placeholder="القيمة / المسمى السابق (اختياري)"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <input
              value={actionForm.toValue}
              onChange={(e) =>
                setActionForm({ ...actionForm, toValue: e.target.value })
              }
              placeholder="القيمة / المسمى الجديد (اختياري)"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
            />
            <textarea
              value={actionForm.notes}
              onChange={(e) =>
                setActionForm({ ...actionForm, notes: e.target.value })
              }
              placeholder="تفاصيل القرار أو الملاحظات"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2"
              rows={3}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowActionModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleCreateAction}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold"
              >
                حفظ الإجراء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
