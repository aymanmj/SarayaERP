// src/pages/RolesPermissionsPage.tsx
// صفحة إدارة الأدوار والصلاحيات

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";

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
  isSystem: boolean;
  rolePermissions: RolePermission[];
};

export default function RolesPermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        apiClient.get<Role[]>("/users/roles-permissions"),
        apiClient.get<Permission[]>("/users/permissions"),
      ]);
      setRoles(rolesRes.data);
      setAllPermissions(permsRes.data);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectRole = (role: Role) => {
    setSelectedRole(role);
    setSelectedPermissionIds(role.rolePermissions.map((rp) => rp.permission.id));
  };

  const togglePermission = (permId: number) => {
    setSelectedPermissionIds((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await apiClient.patch(`/users/roles/${selectedRole.id}/permissions`, {
        permissionIds: selectedPermissionIds,
      });
      toast.success(`تم تحديث صلاحيات ${selectedRole.name}`);
      loadData();
     
    } catch (err: any) {
      toast.error(err.response?.data?.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  // Group permissions by prefix (e.g., INPATIENT_, NURSING_, etc.)
  const groupedPermissions = allPermissions.reduce((acc, perm) => {
    const prefix = perm.code.split("_")[0] || "OTHER";
    if (!acc[prefix]) acc[prefix] = [];
    acc[prefix].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const groupLabels: Record<string, string> = {
    PATIENT: "المرضى",
    ENCOUNTER: "الزيارات",
    INPATIENT: "الإيواء",
    NURSING: "التمريض",
    APPOINTMENT: "المواعيد",
    USER: "المستخدمين",
    ROLE: "الأدوار",
    VIEW: "عرض",
    BILLING: "الفواتير",
    PAYMENT: "المدفوعات",
    PHARMACY: "الصيدلية",
    LAB: "المختبر",
    RADIOLOGY: "الأشعة",
    ADMIN: "الإدارة",
  };

  return (
    <div className="p-6 h-full flex flex-col text-slate-100" dir="rtl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">إدارة الأدوار والصلاحيات</h1>
        <p className="text-sm text-slate-400">
          اختر دوراً لعرض وتعديل الصلاحيات المرتبطة به
        </p>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Roles List */}
        <div className="w-64 flex-shrink-0 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-2 overflow-y-auto custom-scrollbar">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">
            الأدوار ({roles.length})
          </div>
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => handleSelectRole(role)}
              className={`w-full text-right px-4 py-3 rounded-xl border transition-all ${
                selectedRole?.id === role.id
                  ? "bg-sky-600 border-sky-500 text-white shadow-lg shadow-sky-600/20"
                  : "bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <div className="font-bold text-sm">{role.name}</div>
              <div className="text-[10px] opacity-70">{role.description || "---"}</div>
              <div className="text-[10px] mt-1 opacity-50">
                {role.rolePermissions.length} صلاحية
              </div>
            </button>
          ))}
        </div>

        {/* Permissions Panel */}
        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col overflow-hidden">
          {!selectedRole ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <div className="text-4xl mb-2">🔐</div>
                <div>اختر دوراً من القائمة</div>
              </div>
            </div>
          ) : (
            <>
              {/* Role Header */}
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedRole.name}</h2>
                  <p className="text-sm text-slate-400">{selectedRole.description}</p>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white rounded-xl text-sm font-bold shadow-lg transition"
                >
                  {saving ? "جاري الحفظ..." : "💾 حفظ الصلاحيات"}
                </button>
              </div>

              {/* Permissions Grid */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
                {Object.entries(groupedPermissions).map(([prefix, perms]) => (
                  <div key={prefix}>
                    <div className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-sky-500 rounded-full"></span>
                      {groupLabels[prefix] || prefix}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {perms.map((perm) => {
                        const isChecked = selectedPermissionIds.includes(perm.id);
                        return (
                          <label
                            key={perm.id}
                            className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                              isChecked
                                ? "bg-emerald-500/10 border-emerald-500/30"
                                : "bg-slate-950 border-slate-800 hover:border-slate-700"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePermission(perm.id)}
                              className="w-4 h-4 mt-0.5 rounded accent-emerald-500"
                            />
                            <div>
                              <div className="text-xs font-mono text-slate-300">
                                {perm.code}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {perm.description || "---"}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer Stats */}
              <div className="pt-4 border-t border-slate-800 mt-4">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>
                    ✅ مختار: <span className="text-emerald-400 font-bold">{selectedPermissionIds.length}</span>
                  </span>
                  <span>
                    📋 الإجمالي: <span className="text-slate-400">{allPermissions.length}</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
