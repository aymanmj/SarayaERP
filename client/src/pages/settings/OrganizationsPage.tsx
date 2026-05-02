import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import SearchableSelect, { SearchableOption } from "../../components/ui/SearchableSelect";
import {
  Building2,
  Plus,
  ChevronDown,
  ChevronLeft,
  Network,
  MapPin,
  Globe,
  Settings2,
  Trash2,
  Link2,
  Users,
  Search,
  X,
  Check,
  AlertCircle,
} from "lucide-react";

// ============================================
// Types
// ============================================

interface Organization {
  id: number;
  code: string;
  name: string;
  type: string;
  parentId: number | null;
  currency: string;
  timezone: string;
  country: string;
  locale: string;
  isActive: boolean;
  _count?: { hospitals: number; children: number };
  parent?: { id: number; name: string } | null;
}

interface Hospital {
  id: number;
  code: string;
  name: string;
  displayName: string | null;
  isActive: boolean;
  city?: string;
}

interface OrgTreeNode extends Organization {
  children?: OrgTreeNode[];
  hospitals?: Hospital[];
}

// ============================================
// Component
// ============================================

export default function OrganizationsPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkHospitalId, setLinkHospitalId] = useState<number | null>(null);

  // ============================================
  // Queries
  // ============================================

  const { data: organizations = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["organizations"],
    queryFn: async () => {
      const res = await apiClient.get("/organizations");
      return res.data;
    },
  });

  // ============================================
  // Build Tree Structure
  // ============================================

  const orgTree = useMemo(() => {
    const roots = organizations.filter((o) => !o.parentId);
    const getChildren = (parentId: number): Organization[] =>
      organizations.filter((o) => o.parentId === parentId);

    const buildNode = (org: Organization): OrgTreeNode => ({
      ...org,
      children: getChildren(org.id).map(buildNode),
    });

    return roots.map(buildNode);
  }, [organizations]);

  // ============================================
  // Mutations
  // ============================================

  const createMutation = useMutation({
    mutationFn: async (data: {
      code: string;
      name: string;
      type: string;
      parentId?: number;
      currency: string;
      country: string;
    }) => {
      const res = await apiClient.post("/organizations", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("تم إنشاء المؤسسة بنجاح");
      setShowCreateModal(false);
    },
    onError: () => toast.error("حدث خطأ أثناء إنشاء المؤسسة"),
  });

  const linkHospitalMutation = useMutation({
    mutationFn: async ({
      orgId,
      hospitalId,
    }: {
      orgId: number;
      hospitalId: number;
    }) => {
      const res = await apiClient.post(
        `/organizations/${orgId}/hospitals/${hospitalId}`,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("تم ربط المستشفى بالمؤسسة بنجاح");
      setShowLinkModal(false);
      setLinkHospitalId(null);
    },
    onError: () => toast.error("حدث خطأ أثناء ربط المستشفى"),
  });

  // ============================================
  // Helpers
  // ============================================

  const toggleNode = (id: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const orgTypeLabels: Record<string, { label: string; color: string; icon: string }> = {
    NETWORK: { label: "شبكة مستشفيات", color: "violet", icon: "🏛️" },
    MEDICAL_CITY: { label: "مدينة طبية", color: "sky", icon: "🏙️" },
    HOSPITAL: { label: "مستشفى", color: "emerald", icon: "🏥" },
    CLINIC: { label: "عيادة / مركز", color: "amber", icon: "🩺" },
  };

  // ============================================
  // Tree Node Renderer
  // ============================================

  const renderTreeNode = (node: OrgTreeNode, depth = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren =
      (node.children && node.children.length > 0) ||
      (node._count && (node._count.children > 0 || node._count.hospitals > 0));
    const typeInfo = orgTypeLabels[node.type] || orgTypeLabels.HOSPITAL;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group
            ${selectedOrg?.id === node.id ? "bg-violet-500/10 border border-violet-500/30" : "hover:bg-white/[0.03] border border-transparent"}
          `}
          style={{ paddingRight: `${16 + depth * 24}px` }}
          onClick={() => setSelectedOrg(node)}
        >
          {/* Expand Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleNode(node.id);
            }}
            className={`w-6 h-6 flex items-center justify-center rounded-lg transition-all ${
              hasChildren
                ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                : "text-transparent"
            }`}
          >
            {hasChildren &&
              (isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              ))}
          </button>

          {/* Type Icon */}
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold bg-${typeInfo.color}-500/15`}
          >
            {typeInfo.icon}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-200 truncate">
              {node.name}
            </div>
            <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
              <span className="font-mono text-sky-500/80">{node.code}</span>
              <span>•</span>
              <span>{typeInfo.label}</span>
              {node._count && (
                <>
                  <span>•</span>
                  <span>
                    {node._count.hospitals} فرع, {node._count.children} مؤسسة
                    فرعية
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <span
            className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
              node.isActive
                ? "bg-emerald-900/30 text-emerald-400"
                : "bg-rose-900/30 text-rose-400"
            }`}
          >
            {node.isActive ? "نشط" : "متوقف"}
          </span>

          {/* Action Buttons (visible on hover) */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedOrg(node);
                setShowLinkModal(true);
              }}
              className="p-1.5 rounded-lg hover:bg-sky-500/20 text-slate-500 hover:text-sky-400 transition-colors"
              title="ربط مستشفى"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Children */}
        {isExpanded && node.children && node.children.length > 0 && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 border-r border-slate-800/50"
              style={{ right: `${28 + depth * 24}px` }}
            />
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden"
      dir="rtl"
    >
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl -mx-20 -my-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 text-violet-400 rounded-xl shadow-[0_0_15px_-3px_rgba(139,92,246,0.3)]">
              <Network className="w-6 h-6" />
            </div>
            إدارة الشبكة والمؤسسات
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            إنشاء وإدارة الهيكل التنظيمي: وزارة ← شبكات ← مستشفيات ← فروع
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="relative z-10 flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold shadow-lg transition-all duration-200 hover:shadow-violet-500/25"
        >
          <Plus className="w-4 h-4" />
          إنشاء مؤسسة جديدة
        </button>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
        {/* Tree View */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-violet-400" />
              الشجرة التنظيمية
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              {organizations.length} مؤسسة
            </span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
              </div>
            ) : orgTree.length === 0 ? (
              <div className="text-center py-20 text-slate-600">
                <div className="text-4xl mb-3">🏗️</div>
                <p className="text-sm font-bold">لا توجد مؤسسات بعد</p>
                <p className="text-xs mt-1">
                  ابدأ بإنشاء المؤسسة الأم (مثل: وزارة الصحة)
                </p>
              </div>
            ) : (
              orgTree.map((node) => renderTreeNode(node))
            )}
          </div>
        </div>

        {/* Details Panel */}
        <div className="lg:col-span-1 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-sky-400" />
              تفاصيل المؤسسة
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            {selectedOrg ? (
              <div className="space-y-5">
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-violet-500/15 flex items-center justify-center text-3xl mb-3">
                    {orgTypeLabels[selectedOrg.type]?.icon || "🏥"}
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    {selectedOrg.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    {selectedOrg.code}
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      label: "النوع",
                      value:
                        orgTypeLabels[selectedOrg.type]?.label || selectedOrg.type,
                      icon: <Building2 className="w-4 h-4" />,
                    },
                    {
                      label: "الدولة",
                      value: selectedOrg.country,
                      icon: <MapPin className="w-4 h-4" />,
                    },
                    {
                      label: "العملة",
                      value: selectedOrg.currency,
                      icon: <Globe className="w-4 h-4" />,
                    },
                    {
                      label: "المؤسسة الأم",
                      value: selectedOrg.parent?.name || "— (مستقلة)",
                      icon: <Network className="w-4 h-4" />,
                    },
                    {
                      label: "عدد الفروع",
                      value: selectedOrg._count?.hospitals ?? "—",
                      icon: <Building2 className="w-4 h-4" />,
                    },
                    {
                      label: "مؤسسات فرعية",
                      value: selectedOrg._count?.children ?? "—",
                      icon: <Users className="w-4 h-4" />,
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-slate-950/50 rounded-xl px-4 py-3 border border-slate-800/50"
                    >
                      <div className="flex items-center gap-2 text-slate-400">
                        {item.icon}
                        <span className="text-xs font-bold">{item.label}</span>
                      </div>
                      <span className="text-sm text-slate-200 font-medium">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 space-y-2">
                  <button
                    onClick={() => setShowLinkModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 text-sm font-bold border border-sky-700/30 transition-colors"
                  >
                    <Link2 className="w-4 h-4" />
                    ربط مستشفى بهذه المؤسسة
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-slate-600">
                <div className="text-3xl mb-3">👆</div>
                <p className="text-sm">اختر مؤسسة من الشجرة لعرض التفاصيل</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* Create Organization Modal */}
      {/* ============================================ */}
      {showCreateModal && (
        <CreateOrgModal
          organizations={organizations}
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* ============================================ */}
      {/* Link Hospital Modal */}
      {/* ============================================ */}
      {showLinkModal && selectedOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Link2 className="w-5 h-5 text-sky-400" />
                ربط مستشفى بـ {selectedOrg.name}
              </h3>
              <button
                onClick={() => setShowLinkModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <SearchableSelect
                value={linkHospitalId}
                onChange={(id) => setLinkHospitalId(id)}
                onSearch={async (q) => {
                  const res = await apiClient.get("/organizations/hospitals", {
                    params: { search: q || undefined },
                  });
                  return (res.data as any[]).map((h) => ({
                    id: h.id,
                    label: h.displayName || h.name,
                    sublabel: `${h.code}${h.city ? ` — ${h.city}` : ""}`,
                    badge: h.isActive ? "نشط" : "متوقف",
                    badgeColor: h.isActive ? "green" : "red",
                  }));
                }}
                label="اختر المستشفى أو الفرع"
                placeholder="ابحث بالاسم أو الكود أو المدينة..."
                icon={<Building2 className="w-4 h-4" />}
                required
              />

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={() =>
                    linkHospitalId && linkHospitalMutation.mutate({
                      orgId: selectedOrg.id,
                      hospitalId: linkHospitalId,
                    })
                  }
                  disabled={
                    !linkHospitalId || linkHospitalMutation.isPending
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold shadow-lg transition-colors disabled:opacity-50"
                >
                  {linkHospitalMutation.isPending ? (
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  ربط المستشفى
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Create Organization Modal Component
// ============================================

function CreateOrgModal({
  organizations,
  onClose,
  onSubmit,
  isLoading,
}: {
  organizations: Organization[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "HOSPITAL",
    parentId: "",
    currency: "LYD",
    country: "LY",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.warning("الكود والاسم مطلوبان");
      return;
    }
    onSubmit({
      ...form,
      parentId: form.parentId ? Number(form.parentId) : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-violet-400" />
            إنشاء مؤسسة جديدة
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400">
              الكود <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) =>
                setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all font-mono"
              placeholder="MOH-LY"
              dir="ltr"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400">
              النوع
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-violet-500 outline-none transition-all"
            >
              <option value="NETWORK">شبكة مستشفيات</option>
              <option value="MEDICAL_CITY">مدينة طبية</option>
              <option value="HOSPITAL">مستشفى</option>
              <option value="CLINIC">عيادة / مركز</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <label className="text-xs font-bold text-slate-400">
            اسم المؤسسة <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) =>
              setForm((p) => ({ ...p, name: e.target.value }))
            }
            className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all"
            placeholder="مثال: وزارة الصحة — ليبيا"
          />
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <label className="text-xs font-bold text-slate-400">
            المؤسسة الأم (اختياري)
          </label>
          <select
            value={form.parentId}
            onChange={(e) =>
              setForm((p) => ({ ...p, parentId: e.target.value }))
            }
            className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-violet-500 outline-none transition-all"
          >
            <option value="">— بدون (مؤسسة مستقلة) —</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.code})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400">الدولة</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) =>
                setForm((p) => ({ ...p, country: e.target.value }))
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-violet-500 outline-none transition-all font-mono"
              dir="ltr"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400">العملة</label>
            <input
              type="text"
              value={form.currency}
              onChange={(e) =>
                setForm((p) => ({ ...p, currency: e.target.value }))
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-violet-500 outline-none transition-all font-mono"
              dir="ltr"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold transition-colors"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold shadow-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            إنشاء المؤسسة
          </button>
        </div>
      </form>
    </div>
  );
}
