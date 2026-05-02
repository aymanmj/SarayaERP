import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import SearchableSelect from "../../components/ui/SearchableSelect";
import {
  Users,
  Building2,
  Plus,
  Trash2,
  Search,
  X,
  Check,
  GitBranch,
  Shield,
  UserPlus,
  ChevronDown,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

// ============================================
// Types
// ============================================

interface UserSummary {
  id: number;
  fullName: string;
  username: string;
  isActive: boolean;
  isDoctor: boolean;
  hospitalId: number;
}

interface BranchInfo {
  id: number;
  code: string;
  name: string;
  isDefault: boolean;
}

interface BranchUserRecord {
  id: number;
  userId: number;
  hospitalId: number;
  isDefault: boolean;
  user: UserSummary;
}

// ============================================
// Component
// ============================================

export default function BranchesAccessPage() {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [assignForm, setAssignForm] = useState({ userId: null as number | null, hospitalId: null as number | null, isDefault: false });

  // ============================================
  // Queries
  // ============================================

  // جلب كل المستخدمين (لعرضهم في القائمة اليسرى)
  const { data: usersData = [], isLoading: loadingUsers } = useQuery<UserSummary[]>({
    queryKey: ["users-list-simple"],
    queryFn: async () => {
      const res = await apiClient.get("/users");
      // Extract users from the response (may be nested or flat)
      const users = res.data?.users || res.data || [];
      return users.map((u: any) => ({
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        isActive: u.isActive,
        isDoctor: u.isDoctor,
        hospitalId: u.hospitalId,
      }));
    },
    staleTime: 1000 * 60,
  });

  // جلب فروع المستخدم المحدد
  const { data: userBranches = [], isLoading: loadingBranches } = useQuery<BranchInfo[]>({
    queryKey: ["user-branches", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const res = await apiClient.get(`/organizations/branches/users/${selectedUserId}`);
      return res.data;
    },
    enabled: !!selectedUserId,
  });

  // ============================================
  // Mutations
  // ============================================

  const assignMutation = useMutation({
    mutationFn: async (data: { userId: number; hospitalId: number; isDefault?: boolean }) => {
      const res = await apiClient.post("/organizations/branches/users", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-branches", selectedUserId] });
      toast.success("تم تعيين المستخدم في الفرع بنجاح");
      setShowAssignModal(false);
      setAssignForm({ userId: null, hospitalId: null, isDefault: false });
    },
    onError: () => toast.error("حدث خطأ أثناء تعيين المستخدم"),
  });

  const removeMutation = useMutation({
    mutationFn: async ({ userId, hospitalId }: { userId: number; hospitalId: number }) => {
      const res = await apiClient.delete(`/organizations/branches/users/${userId}/${hospitalId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-branches", selectedUserId] });
      toast.success("تم إلغاء وصول المستخدم من الفرع");
    },
    onError: () => toast.error("حدث خطأ أثناء إلغاء الوصول"),
  });

  // ============================================
  // Filtered Users
  // ============================================

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return usersData;
    const q = searchTerm.toLowerCase();
    return usersData.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q),
    );
  }, [usersData, searchTerm]);

  const selectedUser = usersData.find((u) => u.id === selectedUserId);

  // ============================================
  // Render
  // ============================================

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl -mx-20 -my-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl shadow-[0_0_15px_-3px_rgba(14,165,233,0.3)]">
              <GitBranch className="w-6 h-6" />
            </div>
            إدارة وصول الفروع (Branch Access)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            تعيين الموظفين في الفروع المختلفة — يتيح لهم التبديل بين الفروع أثناء العمل
          </p>
        </div>
        <button
          onClick={() => {
            setAssignForm({
              userId: selectedUserId || null,
              hospitalId: null,
              isDefault: false,
            });
            setShowAssignModal(true);
          }}
          className="relative z-10 flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg transition-all duration-200 hover:shadow-sky-500/25"
        >
          <UserPlus className="w-4 h-4" />
          تعيين مستخدم في فرع
        </button>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">

        {/* Users List (Left Panel) */}
        <div className="lg:col-span-1 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 pr-10 pl-3 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                placeholder="ابحث عن موظف..."
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute left-3 top-2.5 text-slate-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loadingUsers ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16 text-slate-600">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا يوجد موظفون</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`w-full text-right flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 ${
                      selectedUserId === user.id
                        ? "bg-sky-500/10 border border-sky-500/30"
                        : "hover:bg-white/[0.03] border border-transparent"
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${
                      user.isDoctor
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-800 text-slate-400"
                    }`}>
                      {user.isDoctor ? "🩺" : user.fullName.charAt(0)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-200 truncate">
                        {user.fullName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        @{user.username}
                      </div>
                    </div>
                    {/* Status */}
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${
                      user.isActive
                        ? "bg-emerald-900/30 text-emerald-400"
                        : "bg-rose-900/30 text-rose-400"
                    }`}>
                      {user.isActive ? "نشط" : "موقف"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-slate-800 text-[10px] text-slate-600 text-center font-mono">
            {filteredUsers.length} موظف
          </div>
        </div>

        {/* Branch Assignments (Right Panel) */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <Shield className="w-5 h-5 text-sky-400" />
              {selectedUser
                ? `فروع ${selectedUser.fullName}`
                : "الفروع المتاحة"}
            </h2>
            {selectedUser && (
              <button
                onClick={() => {
                  setAssignForm({
                    userId: selectedUser.id,
                    hospitalId: null,
                    isDefault: false,
                  });
                  setShowAssignModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 text-xs font-bold border border-sky-700/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                إضافة فرع
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            {!selectedUserId ? (
              <div className="text-center py-20 text-slate-600">
                <div className="text-4xl mb-3">👈</div>
                <p className="text-sm font-bold">اختر موظفاً من القائمة</p>
                <p className="text-xs mt-1 text-slate-700">
                  لعرض وإدارة الفروع التي يملك الوصول إليها
                </p>
              </div>
            ) : loadingBranches ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full" />
              </div>
            ) : userBranches.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800/50 flex items-center justify-center text-3xl mb-4">
                  🏥
                </div>
                <p className="text-sm font-bold text-slate-400 mb-1">
                  لم يتم تعيين فروع إضافية
                </p>
                <p className="text-xs text-slate-600 mb-4">
                  هذا المستخدم يعمل حالياً في فرعه الافتراضي فقط.
                  <br />
                  أضف فروعاً لتمكينه من التبديل بينها.
                </p>
                <button
                  onClick={() => {
                    setAssignForm({
                      userId: selectedUserId || null,
                      hospitalId: null,
                      isDefault: false,
                    });
                    setShowAssignModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  تعيين في فرع جديد
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Info Banner */}
                <div className="flex items-start gap-3 bg-sky-500/5 border border-sky-800/30 rounded-xl p-4 mb-4">
                  <AlertCircle className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-400 leading-relaxed">
                    <strong className="text-sky-300">تبديل الفروع:</strong> عند
                    تسجيل الدخول، سيظهر للمستخدم زر "تبديل الفرع" في الشريط
                    العلوي يتيح له الانتقال بين الفروع المدرجة أدناه. الفرع
                    المميز بـ{" "}
                    <span className="text-emerald-400 font-bold">
                      ★ افتراضي
                    </span>{" "}
                    سيتم تحديده تلقائياً عند الدخول.
                  </div>
                </div>

                {/* Branch Cards */}
                {userBranches.map((branch) => (
                  <div
                    key={branch.id}
                    className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all duration-200 ${
                      branch.isDefault
                        ? "bg-emerald-500/5 border-emerald-700/30"
                        : "bg-slate-950/50 border-slate-800/50 hover:border-slate-700/50"
                    }`}
                  >
                    {/* Branch Icon */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                      branch.isDefault
                        ? "bg-emerald-500/15"
                        : "bg-slate-800/50"
                    }`}>
                      🏥
                    </div>

                    {/* Branch Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-slate-200">
                          {branch.name}
                        </span>
                        {branch.isDefault && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 font-bold border border-emerald-800/40">
                            ★ افتراضي
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        كود: {branch.code} | ID: {branch.id}
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `هل تريد إلغاء وصول ${selectedUser?.fullName} من فرع ${branch.name}؟`,
                          )
                        ) {
                          removeMutation.mutate({
                            userId: selectedUserId!,
                            hospitalId: branch.id,
                          });
                        }
                      }}
                      disabled={removeMutation.isPending}
                      className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-all"
                      title="إلغاء الوصول"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* Assign User to Branch Modal */}
      {/* ============================================ */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-sky-400" />
                تعيين مستخدم في فرع
              </h3>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* User Search */}
              <SearchableSelect
                value={assignForm.userId}
                onChange={(id) => setAssignForm((p) => ({ ...p, userId: id }))}
                onSearch={async (q) => {
                  // Search from already-loaded users list (client-side filter)
                  const filtered = q
                    ? usersData.filter(
                        (u) =>
                          u.fullName.toLowerCase().includes(q.toLowerCase()) ||
                          u.username.toLowerCase().includes(q.toLowerCase()),
                      )
                    : usersData;
                  return filtered.slice(0, 30).map((u) => ({
                    id: u.id,
                    label: u.fullName,
                    sublabel: `@${u.username}`,
                    badge: u.isActive ? "\u0646\u0634\u0637" : "\u0645\u0648\u0642\u0641",
                    badgeColor: u.isActive ? "green" : "red",
                  }));
                }}
                label="\u0627\u062e\u062a\u0631 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645"
                placeholder="\u0627\u0628\u062d\u062b \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645..."
                icon={<Users className="w-4 h-4" />}
                required
              />

              {/* Hospital/Branch Search */}
              <SearchableSelect
                value={assignForm.hospitalId}
                onChange={(id) => setAssignForm((p) => ({ ...p, hospitalId: id }))}
                onSearch={async (q) => {
                  const res = await apiClient.get("/organizations/hospitals", {
                    params: { search: q || undefined },
                  });
                  return (res.data as any[]).map((h) => ({
                    id: h.id,
                    label: h.displayName || h.name,
                    sublabel: `${h.code}${h.city ? ` \u2014 ${h.city}` : ""}`,
                    badge: h.isActive ? "\u0646\u0634\u0637" : "\u0645\u062a\u0648\u0642\u0641",
                    badgeColor: h.isActive ? "green" : "red",
                  }));
                }}
                label="\u0627\u062e\u062a\u0631 \u0627\u0644\u0641\u0631\u0639 / \u0627\u0644\u0645\u0633\u062a\u0634\u0641\u0649"
                placeholder="\u0627\u0628\u062d\u062b \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0643\u0648\u062f \u0623\u0648 \u0627\u0644\u0645\u062f\u064a\u0646\u0629..."
                icon={<Building2 className="w-4 h-4" />}
                required
              />

              {/* Is Default */}
              <label className="flex items-center gap-3 cursor-pointer group bg-slate-950 p-4 rounded-xl border border-slate-800 hover:border-sky-500/50 transition-all">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={assignForm.isDefault}
                    onChange={(e) =>
                      setAssignForm((p) => ({ ...p, isDefault: e.target.checked }))
                    }
                    className="peer sr-only"
                  />
                  <div className="w-10 h-6 bg-slate-800 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-sky-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-white after:border-slate-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-bold text-slate-200 group-hover:text-white">
                    فرع افتراضي
                  </span>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    سيتم تسجيل دخول المستخدم تلقائياً إلى هذا الفرع
                  </p>
                </div>
              </label>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={() => {
                    if (!assignForm.userId || !assignForm.hospitalId) {
                      toast.warning("يرجى تعبئة جميع الحقول المطلوبة");
                      return;
                    }
                    assignMutation.mutate({
                      userId: assignForm.userId,
                      hospitalId: assignForm.hospitalId,
                      isDefault: assignForm.isDefault,
                    });
                  }}
                  disabled={assignMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold shadow-lg transition-colors disabled:opacity-50"
                >
                  {assignMutation.isPending ? (
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  تعيين في الفرع
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
