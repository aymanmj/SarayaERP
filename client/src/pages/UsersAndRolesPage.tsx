// src/pages/UsersAndRolesPage.tsx
// صفحة إدارة المستخدمين والأدوار والصلاحيات - نسخة محسّنة ومتكاملة

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

// ===== TYPES =====
type Permission = {
  id: number;
  code: string;
  description: string | null;
};

type RolePermission = {
  permission: Permission;
};

type Role = {
  id: number;
  name: string;
  description: string | null;
  isSystem?: boolean;
  rolePermissions?: RolePermission[];
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

type JobRank = 'CONSULTANT' | 'SPECIALIST' | 'RESIDENT' | 'GENERAL_PRACTITIONER';

type User = {
  id: number;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isDoctor: boolean;
  jobRank?: JobRank | null;
  department?: Department | null;
  specialty?: Specialty | null;
  basicSalary: string;
  commissionRate: string;
  annualLeaveBalance: number;
  userRoles: UserRole[];
  createdAt?: string;
  lastLogin?: string;
};

type TabType = "users" | "roles";

// ===== ICONS =====
const Icons = {
  users: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  shield: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  add: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  ),
  search: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  edit: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
};

// ===== ROLE COLORS =====
const roleColors: Record<string, string> = {
  ADMIN: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  DOCTOR: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  NURSE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  RECEPTION: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  CASHIER: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  PHARMACIST: "bg-teal-500/10 text-teal-400 border-teal-500/30",
  LAB_TECH: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  RADIOLOGY_TECH: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  QUALITY_MANAGER: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30",
};

// ===== PERMISSION GROUP LABELS =====
const permissionGroupLabels: Record<string, { label: string; icon: string }> = {
  admin: { label: "الإدارة العامة", icon: "⚙️" },
  clinical: { label: "العيادات والاستقبال", icon: "🩺" },
  nursing: { label: "التمريض", icon: "💉" },
  adt: { label: "الدخول والخروج (ADT)", icon: "🏥" },
  lab: { label: "المختبر", icon: "🧪" },
  rad: { label: "الأشعة", icon: "💀" },
  pharmacy: { label: "الصيدلية", icon: "💊" },
  surgery: { label: "العمليات", icon: "🔪" },
  hr: { label: "الموارد البشرية", icon: "👥" },
  billing: { label: "الفوترة", icon: "💰" },
  acc: { label: "المحاسبة", icon: "🧮" },
  purchases: { label: "المشتريات", icon: "📦" },
  inventory: { label: "المخزون", icon: "🏭" },
  assets: { label: "الأصول والصيانة", icon: "🏗️" },
  integration: { label: "الربط والأنظمة", icon: "🔌" },
  system: { label: "النظام", icon: "🖥️" },
};

export default function UsersAndRolesPage() {
  // ===== STATE =====
  const [activeTab, setActiveTab] = useState<TabType>("users");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Users Tab State
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userFormData, setUserFormData] = useState({
    fullName: "",
    username: "",
    password: "",
    email: "",
    phone: "",
    isDoctor: false,
    isActive: true,
    departmentId: "",
    specialtyId: "",
    jobRank: "" as string,
    roles: [] as string[],
    basicSalary: "0",
    commissionRate: "0",
    annualLeaveBalance: "30",
  });

  // Roles Tab State
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  // ===== DATA LOADING =====
  const loadUsersData = async () => {
    setLoading(true);
    try {
      const [usersRes, deptsRes, specsRes, rolesRes] = await Promise.all([
        apiClient.get<User[]>("/users"),
        apiClient.get<Department[]>("/departments"),
        apiClient.get<Specialty[]>("/specialties"),
        apiClient.get<Role[]>("/users/roles"),
      ]);
      setUsers(usersRes.data);
      setDepartments(deptsRes.data);
      setSpecialties(specsRes.data);
      setAvailableRoles(rolesRes.data);
    } catch {
      toast.error("فشل تحميل بيانات المستخدمين");
    } finally {
      setLoading(false);
    }
  };

  const loadRolesData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        apiClient.get<Role[]>("/users/roles-permissions"),
        apiClient.get<Permission[]>("/users/permissions"),
      ]);
      setRoles(rolesRes.data);
      setAllPermissions(permsRes.data);
    } catch {
      toast.error("فشل تحميل بيانات الأدوار");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") {
      loadUsersData();
    } else {
      loadRolesData();
    }
  }, [activeTab]);

  // ===== USERS TAB HANDLERS =====
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.phone?.includes(q)
    );
  }, [users, searchQuery]);

  const handleOpenCreateUser = () => {
    setEditingUserId(null);
    setUserFormData({
      fullName: "",
      username: "",
      password: "",
      email: "",
      phone: "",
      isDoctor: false,
      isActive: true,
      departmentId: "",
      specialtyId: "",
      jobRank: "",
      roles: [],
      basicSalary: "0",
      commissionRate: "0",
      annualLeaveBalance: "30",
    });
    setShowUserModal(true);
  };

  const handleOpenEditUser = (user: User) => {
    setEditingUserId(user.id);
    setUserFormData({
      fullName: user.fullName,
      username: user.username,
      password: "",
      email: user.email || "",
      phone: user.phone || "",
      isDoctor: user.isDoctor,
      isActive: user.isActive,
      departmentId: user.department ? String(user.department.id) : "",
      specialtyId: user.specialty ? String(user.specialty.id) : "",
      jobRank: user.jobRank || "",
      roles: user.userRoles.map((r) => r.role.name),
      basicSalary: user.basicSalary,
      commissionRate: String(user.commissionRate ?? 0),
      annualLeaveBalance: String(user.annualLeaveBalance ?? 30),
    });
    setShowUserModal(true);
  };

  const handleSubmitUser = async () => {
    if (!userFormData.fullName || !userFormData.username) {
      toast.warning("الاسم واسم المستخدم مطلوبان");
      return;
    }
    if (userFormData.roles.length === 0) {
      toast.warning("يجب تعيين دور واحد على الأقل");
      return;
    }

    try {
      const payload = {
        ...userFormData,
        basicSalary: Number(userFormData.basicSalary),
        commissionRate: Number(userFormData.commissionRate),
        annualLeaveBalance: Number(userFormData.annualLeaveBalance),
        departmentId: userFormData.departmentId ? Number(userFormData.departmentId) : null,
        specialtyId: userFormData.specialtyId ? Number(userFormData.specialtyId) : null,
        jobRank: userFormData.isDoctor && userFormData.jobRank ? userFormData.jobRank : null,
      };

      if (editingUserId) {
        await apiClient.patch(`/users/${editingUserId}`, payload);
        toast.success("تم تحديث المستخدم بنجاح");
      } else {
        await apiClient.post("/users", payload);
        toast.success("تم إنشاء المستخدم بنجاح");
      }
      setShowUserModal(false);
      loadUsersData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.response?.data?.message || "حدث خطأ");
    }
  };

  const toggleUserRole = (roleName: string) => {
    setUserFormData((prev) => ({
      ...prev,
      roles: prev.roles.includes(roleName)
        ? prev.roles.filter((r) => r !== roleName)
        : [...prev.roles, roleName],
    }));
  };

  // ===== ROLES TAB HANDLERS =====
  const handleSelectRole = (role: Role) => {
    setSelectedRole(role);
    setSelectedPermissionIds(role.rolePermissions?.map((rp) => rp.permission.id) || []);
  };

  const togglePermission = (permId: number) => {
    setSelectedPermissionIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  };

  const handleSaveRolePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await apiClient.patch(`/users/roles/${selectedRole.id}/permissions`, {
        permissionIds: selectedPermissionIds,
      });
      toast.success(`تم تحديث صلاحيات ${selectedRole.name}`);
      loadRolesData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.response?.data?.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const selectAllInGroup = (perms: Permission[]) => {
    const ids = perms.map((p) => p.id);
    setSelectedPermissionIds((prev) => [...new Set([...prev, ...ids])]);
  };

  const deselectAllInGroup = (perms: Permission[]) => {
    const ids = perms.map((p) => p.id);
    setSelectedPermissionIds((prev) => prev.filter((id) => !ids.includes(id)));
  };

  const groupedPermissions = useMemo(() => {
    return allPermissions.reduce((acc, perm) => {
      // Split by colon to get the module prefix (e.g., 'lab:view' -> 'lab')
      const prefix = perm.code.split(":")[0] || "other"; 
      if (!acc[prefix]) acc[prefix] = [];
      acc[prefix].push(perm);
      return acc;
    }, {} as Record<string, Permission[]>);
  }, [allPermissions]);

  // ===== RENDER =====
  return (
    <div className="p-6 h-full flex flex-col text-slate-100" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            إدارة المستخدمين والصلاحيات
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            إدارة حسابات المستخدمين، الأدوار، والصلاحيات التفصيلية
          </p>
        </div>

        {activeTab === "users" && (
          <button
            onClick={handleOpenCreateUser}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl font-bold shadow-lg shadow-emerald-900/30 transition-all"
          >
            {Icons.add}
            <span>مستخدم جديد</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
            activeTab === "users"
              ? "bg-sky-600 text-white shadow-lg shadow-sky-600/30"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
          }`}
        >
          {Icons.users}
          <span>المستخدمون</span>
          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{users.length}</span>
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
            activeTab === "roles"
              ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
          }`}
        >
          {Icons.shield}
          <span>الأدوار والصلاحيات</span>
          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{roles.length}</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {/* ===== USERS TAB ===== */}
        {activeTab === "users" && (
          <div className="h-full flex flex-col">
            {/* Search */}
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">{Icons.search}</span>
              <input
                type="text"
                placeholder="البحث بالاسم، اسم المستخدم، البريد، أو الهاتف..."
                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-sky-500 transition"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Users Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`bg-slate-900/50 border rounded-2xl p-5 hover:border-slate-600 transition-all group ${
                      user.isActive ? "border-slate-800" : "border-rose-500/20 bg-rose-500/5"
                    }`}
                  >
                    {/* User Header */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${
                          user.isDoctor 
                            ? "bg-sky-500/20 text-sky-400" 
                            : "bg-slate-700 text-slate-300"
                        }`}>
                          {user.isDoctor ? "👨‍⚕️" : user.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-white text-lg">{user.fullName}</div>
                          <div className="text-xs text-slate-500 font-mono">@{user.username}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenEditUser(user)}
                        className="opacity-0 group-hover:opacity-100 p-2 bg-slate-800 hover:bg-sky-600 rounded-lg transition-all"
                      >
                        {Icons.edit}
                      </button>
                    </div>

                    {/* User Info */}
                    <div className="space-y-2 text-sm mb-4">
                      {user.department && (
                        <div className="flex items-center gap-2 text-slate-400">
                          <span>📍</span>
                          <span>{user.department.name}</span>
                        </div>
                      )}
                      {user.specialty && (
                        <div className="flex items-center gap-2 text-purple-400">
                          <span>🩺</span>
                          <span>{user.specialty.name}</span>
                        </div>
                      )}
                      {user.email && (
                        <div className="flex items-center gap-2 text-slate-500 text-xs">
                          <span>✉️</span>
                          <span>{user.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Roles */}
                    <div className="flex flex-wrap gap-1.5">
                      {user.userRoles.map((ur) => (
                        <span
                          key={ur.role.id}
                          className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold ${
                            roleColors[ur.role.name] || "bg-slate-700 text-slate-300 border-slate-600"
                          }`}
                        >
                          {ur.role.name}
                        </span>
                      ))}
                    </div>

                    {/* Status Badge */}
                    {!user.isActive && (
                      <div className="mt-3 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-lg inline-block">
                        ⛔ حساب معطّل
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {filteredUsers.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <div className="text-5xl mb-4">🔍</div>
                  <div>لا يوجد مستخدمون مطابقون للبحث</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== ROLES TAB ===== */}
        {activeTab === "roles" && (
          <div className="h-full flex gap-6">
            {/* Roles Sidebar */}
            <div className="w-72 flex-shrink-0 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 overflow-y-auto custom-scrollbar">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-4 flex items-center justify-between">
                <span>الأدوار المتاحة</span>
                <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">{roles.length}</span>
              </div>
              <div className="space-y-2">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => handleSelectRole(role)}
                    className={`w-full text-right p-4 rounded-xl border transition-all ${
                      selectedRole?.id === role.id
                        ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/30"
                        : "bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">{role.name}</span>
                      {role.isSystem && (
                        <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">نظام</span>
                      )}
                    </div>
                    <div className="text-[11px] opacity-70 mb-2">{role.description || "---"}</div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className={`px-2 py-0.5 rounded ${
                        selectedRole?.id === role.id ? "bg-white/20" : "bg-slate-800"
                      }`}>
                        🔐 {role.rolePermissions?.length || 0} صلاحية
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Permissions Panel */}
            <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col overflow-hidden">
              {!selectedRole ? (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🔐</div>
                    <div className="text-lg">اختر دوراً لإدارة صلاحياته</div>
                    <div className="text-sm mt-2 opacity-70">
                      يمكنك تحديد الصلاحيات التي يمتلكها كل دور
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Role Header */}
                  <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-purple-500/20 rounded-xl flex items-center justify-center text-2xl">
                        {Icons.shield}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-white">{selectedRole.name}</h2>
                        <p className="text-sm text-slate-400">{selectedRole.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleSaveRolePermissions}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-xl font-bold shadow-lg transition-all"
                    >
                      {saving ? "جاري الحفظ..." : "💾 حفظ التغييرات"}
                    </button>
                  </div>

                  {/* Stats Bar */}
                  <div className="flex items-center gap-6 bg-slate-950 rounded-xl p-3 mb-4">
                    <div className="text-sm">
                      <span className="text-slate-500">محدد: </span>
                      <span className="text-emerald-400 font-bold">{selectedPermissionIds.length}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-slate-500">إجمالي: </span>
                      <span className="text-slate-300">{allPermissions.length}</span>
                    </div>
                    <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                        style={{ width: `${(selectedPermissionIds.length / allPermissions.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Permissions Grid */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
                    {Object.entries(groupedPermissions).map(([prefix, perms]) => {
                      const groupInfo = permissionGroupLabels[prefix] || { label: prefix, icon: "📌" };
                      const selectedInGroup = perms.filter((p) => selectedPermissionIds.includes(p.id)).length;
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const allSelected = selectedInGroup === perms.length;

                      return (
                        <div key={prefix} className="bg-slate-950/50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-sm font-bold">
                              <span>{groupInfo.icon}</span>
                              <span className="text-white">{groupInfo.label}</span>
                              <span className="text-xs text-slate-500">({selectedInGroup}/{perms.length})</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => selectAllInGroup(perms)}
                                className="text-[10px] px-2 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded transition"
                              >
                                تحديد الكل
                              </button>
                              <button
                                onClick={() => deselectAllInGroup(perms)}
                                className="text-[10px] px-2 py-1 bg-slate-700 text-slate-400 hover:bg-slate-600 rounded transition"
                              >
                                إلغاء الكل
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {perms.map((perm) => {
                              const isChecked = selectedPermissionIds.includes(perm.id);
                              return (
                                <label
                                  key={perm.id}
                                  className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                                    isChecked
                                      ? "bg-emerald-500/10 border-emerald-500/30 shadow-sm shadow-emerald-500/10"
                                      : "bg-slate-900 border-slate-800 hover:border-slate-700"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePermission(perm.id)}
                                    className="w-4 h-4 mt-0.5 rounded accent-emerald-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-mono text-slate-300 truncate">
                                      {perm.code}
                                    </div>
                                    <div className="text-[10px] text-slate-500 truncate">
                                      {perm.description || "---"}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== USER MODAL ===== */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-700 rounded-3xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 custom-scrollbar">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-white">
                {editingUserId ? "تعديل بيانات المستخدم" : "إضافة مستخدم جديد"}
              </h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-500 hover:text-white text-2xl">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Right Column */}
              <div className="space-y-4">
                <div className="text-sky-400 font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-2">
                  بيانات الحساب
                </div>

                <div>
                  <label className="text-slate-400 text-xs block mb-1">الاسم الكامل *</label>
                  <input
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-sky-500 transition"
                    value={userFormData.fullName}
                    onChange={(e) => setUserFormData({ ...userFormData, fullName: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">اسم المستخدم *</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-sky-500 transition font-mono"
                      value={userFormData.username}
                      onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                      disabled={!!editingUserId}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">كلمة المرور</label>
                    <input
                      type="password"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-sky-500 transition"
                      value={userFormData.password}
                      onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                      placeholder={editingUserId ? "اتركه فارغاً للإبقاء" : ""}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-xs block mb-2">الأدوار *</label>
                  <div className="flex flex-wrap gap-2 bg-slate-900/50 p-3 rounded-xl border border-slate-800 min-h-[80px] content-start">
                    {availableRoles.map((role) => {
                      const isSelected = userFormData.roles.includes(role.name);
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => toggleUserRole(role.name)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                            isSelected
                              ? roleColors[role.name] || "bg-sky-600 border-sky-500 text-white"
                              : "bg-slate-950 border-slate-700 text-slate-400 hover:bg-slate-800"
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
                      checked={userFormData.isActive}
                      onChange={(e) => setUserFormData({ ...userFormData, isActive: e.target.checked })}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                    <span className="text-slate-300 text-xs">حساب نشط</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userFormData.isDoctor}
                      onChange={(e) => setUserFormData({ ...userFormData, isDoctor: e.target.checked })}
                      className="w-4 h-4 rounded accent-purple-500"
                    />
                    <span className="text-slate-300 text-xs">طبيب</span>
                  </label>
                </div>
              </div>

              {/* Left Column */}
              <div className="space-y-4">
                <div className="text-emerald-400 font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-2">
                  البيانات الوظيفية
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">القسم</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-xs"
                      value={userFormData.departmentId}
                      onChange={(e) => setUserFormData({ ...userFormData, departmentId: e.target.value })}
                    >
                      <option value="">-- بدون --</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className={userFormData.isDoctor ? "" : "opacity-50 pointer-events-none"}>
                    <label className="text-slate-400 text-xs block mb-1">التخصص</label>
                    <select
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-xs"
                      value={userFormData.specialtyId}
                      onChange={(e) => setUserFormData({ ...userFormData, specialtyId: e.target.value })}
                      disabled={!userFormData.isDoctor}
                    >
                      <option value="">-- بدون --</option>
                      {specialties.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 🏷️ الرتبة الوظيفية (للأطباء فقط) */}
                <div className={userFormData.isDoctor ? "" : "hidden"}>
                  <label className="text-slate-400 text-xs block mb-1">الرتبة الوظيفية (لتسعير الكشف)</label>
                  <select
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-purple-500 text-xs"
                    value={userFormData.jobRank}
                    onChange={(e) => setUserFormData({ ...userFormData, jobRank: e.target.value })}
                    disabled={!userFormData.isDoctor}
                  >
                    <option value="">-- اختر الرتبة --</option>
                    <option value="CONSULTANT">استشاري</option>
                    <option value="SPECIALIST">اخصائي</option>
                    <option value="GENERAL_PRACTITIONER">طبيب عام</option>
                    <option value="RESIDENT">مقيم / طبيب تدريب</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">الراتب الأساسي</label>
                    <input
                      type="number"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500"
                      value={userFormData.basicSalary}
                      onChange={(e) => setUserFormData({ ...userFormData, basicSalary: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">رصيد الإجازات</label>
                    <input
                      type="number"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-center"
                      value={userFormData.annualLeaveBalance}
                      onChange={(e) => setUserFormData({ ...userFormData, annualLeaveBalance: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-xs block mb-1">نسبة العمولة</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.01"
                      max="1"
                      className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 text-center"
                      value={userFormData.commissionRate}
                      onChange={(e) => setUserFormData({ ...userFormData, commissionRate: e.target.value })}
                    />
                    <span className="text-sm text-slate-500">
                      = {(Number(userFormData.commissionRate) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">الهاتف</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-slate-500"
                      value={userFormData.phone}
                      onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">البريد الإلكتروني</label>
                    <input
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-slate-500"
                      value={userFormData.email}
                      onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowUserModal(false)}
                className="px-6 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleSubmitUser}
                className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 text-sm font-bold shadow-lg transition"
              >
                {editingUserId ? "حفظ التعديلات" : "إنشاء المستخدم"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
