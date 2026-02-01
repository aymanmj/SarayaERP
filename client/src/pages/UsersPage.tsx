// src/pages/UsersPage.tsx

// src/pages/UsersPage.tsx

import { useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Types
type Role = {
  id: number;
  name: string;
  description?: string;
};

type UserRole = {
  role: Role;
};

type Department = {
  id: number;
  name: string;
};

type Specialty = {
  id: number;
  name: string;
};

type User = {
  id: number;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isDoctor: boolean;
  department?: Department | null;
  specialty?: Specialty | null;
  basicSalary: string;
  commissionRate: string;
  annualLeaveBalance: number;
  userRoles: UserRole[];
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    password: "",
    email: "",
    phone: "",
    isDoctor: false,
    isActive: true,
    departmentId: "",
    specialtyId: "",
    roles: [] as string[], // Store Role Names
    basicSalary: "0",
    housingAllowance: "0",
    transportAllowance: "0",
    otherAllowance: "0",
    commissionRate: "0",
    annualLeaveBalance: "30",
  });

  // 1. Queries
  const { data: users = [], isLoading: usersLoading } = useQuery({
      queryKey: ['users'],
      queryFn: async () => {
          const res = await apiClient.get<User[]>("/users");
          return res.data;
      }
  });

  const { data: departments = [] } = useQuery({
      queryKey: ['departments'],
      queryFn: async () => {
          const res = await apiClient.get<Department[]>("/departments");
          return res.data;
      },
      staleTime: Infinity
  });

  const { data: specialties = [] } = useQuery({
      queryKey: ['specialties'],
      queryFn: async () => {
          const res = await apiClient.get<Specialty[]>("/specialties");
          return res.data;
      },
      staleTime: Infinity
  });

  const { data: availableRoles = [] } = useQuery({
      queryKey: ['roles'],
      queryFn: async () => {
          const res = await apiClient.get<Role[]>("/users/roles");
          return res.data;
      },
      staleTime: Infinity
  });

  // 2. Mutation
  const saveUserMutation = useMutation({
      mutationFn: async (payload: any) => {
          if (editingId) {
             await apiClient.patch(`/users/${editingId}`, payload);
          } else {
             await apiClient.post("/users", payload);
          }
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['users'] });
          toast.success(editingId ? "تم تحديث المستخدم" : "تم إنشاء المستخدم");
          setShowModal(false);
      },
      onError: (err: any) => {
          console.error(err);
          toast.error(err.response?.data?.message || "حدث خطأ");
      }
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      fullName: "",
      username: "",
      password: "",
      email: "",
      phone: "",
      isDoctor: false,
      isActive: true,
      departmentId: "",
      specialtyId: "",
      roles: [],
      basicSalary: "0",
      housingAllowance: "0",
      transportAllowance: "0",
      otherAllowance: "0",
      commissionRate: "0",
      annualLeaveBalance: "30",
    });
    setShowModal(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingId(u.id);
    setFormData({
      fullName: u.fullName,
      username: u.username,
      password: "", // لا نعرض كلمة المرور
      email: u.email || "",
      phone: u.phone || "",
      isDoctor: u.isDoctor,
      isActive: u.isActive,
      departmentId: u.department ? String(u.department.id) : "",
      specialtyId: u.specialty ? String(u.specialty.id) : "",
      roles: u.userRoles.map((r) => r.role.name),
      basicSalary: u.basicSalary,
      housingAllowance: "0",
      transportAllowance: "0",
      otherAllowance: "0",
      commissionRate: String(u.commissionRate ?? 0),
      annualLeaveBalance: String(u.annualLeaveBalance ?? 30),
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.fullName || !formData.username) {
      toast.warning("الاسم واسم المستخدم مطلوبان");
      return;
    }
    if (formData.roles.length === 0) {
      toast.warning("يجب تعيين دور واحد على الأقل للمستخدم");
      return;
    }

    const payload = {
        ...formData,
        basicSalary: Number(formData.basicSalary),
        housingAllowance: Number(formData.housingAllowance),
        transportAllowance: Number(formData.transportAllowance),
        otherAllowance: Number(formData.otherAllowance),
        commissionRate: Number(formData.commissionRate),
        annualLeaveBalance: Number(formData.annualLeaveBalance),
        departmentId: formData.departmentId
          ? Number(formData.departmentId)
          : null,
        specialtyId: formData.specialtyId ? Number(formData.specialtyId) : null,
    };

    saveUserMutation.mutate(payload);
  };

  const toggleRole = (roleName: string) => {
    setFormData((prev) => {
      const roles = prev.roles.includes(roleName)
        ? prev.roles.filter((r) => r !== roleName)
        : [...prev.roles, roleName];
      return { ...prev, roles };
    });
  };

  return (
    <div className="p-6 h-full flex flex-col text-slate-100" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">إدارة الموظفين والصلاحيات</h1>
          <p className="text-sm text-slate-400">
            إدارة حسابات المستخدمين، تعيين الأدوار (Roles)، والبيانات الوظيفية.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg flex items-center gap-2"
        >
          <span>+</span> موظف جديد
        </button>
      </div>

      {/* Users Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4 custom-scrollbar">
        <table className="w-full text-sm text-right border-separate border-spacing-y-1">
          <thead className="text-slate-400">
            <tr>
              <th className="pb-3 px-2">الموظف</th>
              <th className="pb-3 px-2">القسم / التخصص</th>
              <th className="pb-3 px-2">الأدوار (Roles)</th>
              <th className="pb-3 px-2">الحالة</th>
              <th className="pb-3 px-2 text-center">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="bg-slate-950/40 hover:bg-slate-800/40 transition-colors group"
              >
                <td className="py-3 px-2 rounded-r-xl">
                  <div className="font-bold text-slate-100">{u.fullName}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    @{u.username}
                  </div>
                </td>
                <td className="py-3 px-2">
                  <div className="flex flex-col gap-1">
                    {u.department && (
                      <span className="text-[10px] text-sky-300">
                        {u.department.name}
                      </span>
                    )}
                    {u.specialty && (
                      <span className="text-[10px] text-purple-300">
                        {u.specialty.name}
                      </span>
                    )}
                    {!u.department && !u.specialty && (
                      <span className="text-slate-600">-</span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-2">
                  <div className="flex flex-wrap gap-1">
                    {u.userRoles.map((r) => (
                      <span
                        key={r.role.name}
                        className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300"
                      >
                        {r.role.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border ${u.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}
                  >
                    {u.isActive ? "نشط" : "معطل"}
                  </span>
                </td>
                <td className="py-3 px-2 rounded-l-xl text-center">
                  <button
                    onClick={() => handleOpenEdit(u)}
                    className="text-xs bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg transition-all shadow"
                  >
                    تعديل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-3xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 custom-scrollbar">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-white">
                {editingId ? "تعديل بيانات الموظف" : "إضافة موظف جديد"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              {/* === العمود الأيمن: بيانات الدخول والصلاحيات === */}
              <div className="space-y-4">
                <div className="text-sky-400 font-bold text-xs uppercase tracking-wider mb-2">
                  بيانات الحساب والصلاحيات
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">
                      الاسم الكامل *
                    </label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-sky-500 transition"
                      value={formData.fullName}
                      onChange={(e) =>
                        setFormData({ ...formData, fullName: e.target.value })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">
                        اسم المستخدم *
                      </label>
                      <input
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-sky-500 transition font-mono"
                        value={formData.username}
                        onChange={(e) =>
                          setFormData({ ...formData, username: e.target.value })
                        }
                        disabled={!!editingId}
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 text-xs block mb-1">
                        كلمة المرور
                      </label>
                      <input
                        type="password"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-sky-500 transition"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        placeholder={editingId ? "اتركه فارغاً للإبقاء" : ""}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="text-slate-400 text-xs block mb-2">
                    تعيين الأدوار (Roles)
                  </label>
                  <div className="flex flex-wrap gap-2 bg-slate-900/50 p-3 rounded-xl border border-slate-800 min-h-[80px] content-start">
                    {availableRoles.map((role) => {
                      const isSelected = formData.roles.includes(role.name);
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => toggleRole(role.name)}
                          className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                            isSelected
                              ? "bg-sky-600 border-sky-500 text-white shadow-md shadow-sky-500/20"
                              : "bg-slate-950 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                          }`}
                        >
                          {role.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-900/30 p-3 rounded-xl border border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData({ ...formData, isActive: e.target.checked })
                      }
                      className="w-4 h-4 rounded bg-slate-800 border-slate-600 accent-emerald-500"
                    />
                    <span className="text-slate-300 text-xs">حساب نشط</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isDoctor}
                      onChange={(e) =>
                        setFormData({ ...formData, isDoctor: e.target.checked })
                      }
                      className="w-4 h-4 rounded bg-slate-800 border-slate-600 accent-purple-500"
                    />
                    <span className="text-slate-300 text-xs">
                      تصنيف كـ طبيب
                    </span>
                  </label>
                </div>
              </div>

              {/* === العمود الأيسر: البيانات الوظيفية والمالية === */}
              <div className="space-y-4">
                <div className="text-emerald-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-slate-800 pb-1">
                  البيانات الوظيفية والمالية
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">
                      القسم
                    </label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-emerald-500 text-xs"
                      value={formData.departmentId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          departmentId: e.target.value,
                        })
                      }
                    >
                      <option value="">-- بدون قسم --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={
                      formData.isDoctor
                        ? "opacity-100"
                        : "opacity-50 pointer-events-none"
                    }
                  >
                    <label className="text-slate-400 text-xs block mb-1">
                      التخصص
                    </label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-emerald-500 text-xs"
                      value={formData.specialtyId}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          specialtyId: e.target.value,
                        })
                      }
                      disabled={!formData.isDoctor}
                    >
                      <option value="">-- بدون تخصص --</option>
                      {specialties.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">
                      الراتب الأساسي
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-emerald-500"
                      value={formData.basicSalary}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          basicSalary: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">
                      رصيد الإجازات
                    </label>
                    <input
                      type="number"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-emerald-500 text-center"
                      value={formData.annualLeaveBalance}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          annualLeaveBalance: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-xs block mb-1">
                    نسبة العمولة (0.00 - 1.00)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      max="1"
                      className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-emerald-500 text-center"
                      value={formData.commissionRate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          commissionRate: e.target.value,
                        })
                      }
                    />
                    <span className="text-xs text-slate-500">
                      = {(Number(formData.commissionRate) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* معلومات التواصل */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">
                      الهاتف
                    </label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-slate-500"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">
                      البريد
                    </label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-slate-500"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleSubmit}
                className="px-8 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-bold shadow-lg shadow-emerald-900/20 transition"
              >
                حفظ البيانات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
