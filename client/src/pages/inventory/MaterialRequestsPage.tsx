// src/pages/inventory/MaterialRequestsPage.tsx

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { inventoryApi } from "@/api/inventoryApi";
import { formatDate } from "@/lib/utils";
import {
  SarayaFilterSelect,
  SarayaKpiCard,
  SarayaLtrBadge,
  SarayaPageHeader,
} from "../../components/ui/SarayaPrimitives";

export function MaterialRequestsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const {
    data: requests = [],
    isLoading: loading,
    refetch: fetchRequests,
  } = useQuery({
    queryKey: ["materialRequests", user?.hospitalId, statusFilter],
    queryFn: async () => {
      const res = await inventoryApi.getMaterialRequests({ status: statusFilter });
      return res;
    },
    enabled: !!user?.hospitalId,
  });

  const filteredRequests = requests.filter(
    (r) =>
      r.requestNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.requestingWarehouse?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.fulfillingWarehouse?.name?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const pendingCount = requests.filter((r) => r.status === "PENDING_APPROVAL").length;
  const activeFulfillCount = requests.filter(
    (r) => r.status === "APPROVED" || r.status === "PARTIALLY_ISSUED",
  ).length;
  const kpis = {
    total: requests.length,
    pendingCount,
    activeFulfillCount,
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "PENDING_APPROVAL":
        return t("inventory.materialRequest.status.pending", "بانتظار الاعتماد");
      case "APPROVED":
        return t("inventory.materialRequest.status.approved", "معتمد - بانتظار الصرف");
      case "REJECTED":
        return t("inventory.materialRequest.status.rejected", "مرفوض");
      case "PARTIALLY_ISSUED":
        return t("inventory.materialRequest.status.partial", "مصروف جزئياً");
      case "COMPLETED":
        return t("inventory.materialRequest.status.completed", "مكتمل");
      case "CANCELLED":
        return t("inventory.materialRequest.status.cancelled", "ملغى");
      default:
        return status;
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case "PENDING_APPROVAL":
        return "bg-amber-900/30 text-amber-400 border-amber-500/30";
      case "APPROVED":
        return "bg-sky-900/30 text-sky-400 border-sky-500/30";
      case "REJECTED":
        return "bg-rose-900/30 text-rose-400 border-rose-500/30";
      case "PARTIALLY_ISSUED":
        return "bg-violet-900/30 text-violet-400 border-violet-500/30";
      case "COMPLETED":
        return "bg-emerald-900/30 text-emerald-400 border-emerald-500/30";
      case "CANCELLED":
        return "bg-slate-800 text-slate-400 border-slate-700";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-5"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <SarayaPageHeader
        icon={<ClipboardList className="w-5 h-5" />}
        title={t("inventory.materialRequest.title", "طلبات المواد")}
        subtitle={t(
          "inventory.materialRequest.subtitle",
          "إدارة طلبات صرف المواد من المستودعات للأقسام والمستودعات الفرعية.",
        )}
        actions={
          <button
            type="button"
            onClick={() => navigate("/inventory/material-requests/new")}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold shadow-sm transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t("inventory.materialRequest.btn.new", "طلب مواد جديد")}
          </button>
        }
      />

      {/* 3 KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SarayaKpiCard
          label={t("inventory.materialRequest.kpiTotal", "إجمالي الطلبات")}
          value={kpis.total}
          accent="sky"
          icon={<ClipboardList className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label={t("inventory.materialRequest.status.pending", "بانتظار الاعتماد")}
          value={kpis.pendingCount}
          accent="amber"
          icon={<Clock className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label={t("inventory.materialRequest.status.approved", "معتمد - بانتظار الصرف")}
          value={kpis.activeFulfillCount}
          accent="emerald"
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
      </div>

      {/* Filters Bar */}
      <div className="saraya-card bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-3 items-center shadow-sm">
        <div className="flex-1 min-w-[250px] relative group">
          <Search
            className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-amber-400 pointer-events-none ${
              isRtl ? "right-3.5" : "left-3.5"
            }`}
          />
          <input
            className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 text-sm focus:border-amber-500 outline-none transition-all ${
              isRtl ? "pr-10 pl-4" : "pl-10 pr-4"
            }`}
            placeholder={t(
              "inventory.materialRequest.searchPlaceholder",
              "بحث برقم الطلب أو اسم المستودع...",
            )}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="w-52">
          <SarayaFilterSelect
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            placeholder={t("common.allStatus", "جميع الحالات")}
            allLabel={t("common.allStatus", "جميع الحالات")}
            options={[
              {
                value: "PENDING_APPROVAL",
                label: t("inventory.materialRequest.status.pending", "بانتظار الاعتماد"),
              },
              {
                value: "APPROVED",
                label: t("inventory.materialRequest.status.approved", "معتمد - بانتظار الصرف"),
              },
              {
                value: "PARTIALLY_ISSUED",
                label: t("inventory.materialRequest.status.partial", "مصروف جزئياً"),
              },
              {
                value: "COMPLETED",
                label: t("inventory.materialRequest.status.completed", "مكتمل"),
              },
              {
                value: "REJECTED",
                label: t("inventory.materialRequest.status.rejected", "مرفوض"),
              },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => fetchRequests()}
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-sm font-bold border border-slate-700 transition-all inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {t("common.refresh", "تحديث")}
        </button>
      </div>

      {/* Main Table */}
      <div className="flex-1 saraya-card bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-sm">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className={`w-full text-sm ${isRtl ? "text-right" : "text-left"}`}>
            <thead className="bg-slate-950/60 text-slate-400 sticky top-0 z-10 border-b border-slate-800 text-xs">
              <tr>
                <th className="px-5 py-3.5 font-semibold">
                  {t("inventory.materialRequest.table.number", "رقم الطلب")}
                </th>
                <th className="px-5 py-3.5 font-semibold">{t("common.date", "التاريخ")}</th>
                <th className="px-5 py-3.5 font-semibold">
                  {t("inventory.materialRequest.table.requestingWarehouse", "المستودع الطالب")}
                </th>
                <th className="px-5 py-3.5 font-semibold">
                  {t("inventory.materialRequest.table.fulfillingWarehouse", "المستودع المصرف")}
                </th>
                <th className="px-5 py-3.5 font-semibold text-center">
                  {t("inventory.materialRequest.table.itemCount", "عدد الأصناف")}
                </th>
                <th className="px-5 py-3.5 font-semibold">
                  {t("inventory.materialRequest.table.requestedBy", "طالب المواد")}
                </th>
                <th className="px-5 py-3.5 font-semibold text-center">
                  {t("common.status", "الحالة")}
                </th>
                <th className="px-5 py-3.5 font-semibold text-center">
                  {t("common.actions", "إجراءات")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-500">
                    {t("common.loading", "جاري تحميل البيانات...")}
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-500">
                    {t("inventory.materialRequest.empty", "لا توجد طلبات مواد.")}
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5">
                      <SarayaLtrBadge className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/25 text-xs font-semibold">
                        {req.requestNumber}
                      </SarayaLtrBadge>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono tabular-nums">
                      {formatDate(req.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-100">
                      {req.requestingWarehouse?.name || "-"}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-100">
                      {req.fulfillingWarehouse?.name || "-"}
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono tabular-nums text-center">
                      {req._count?.items || 0}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">
                      {req.requestedBy?.fullName || "-"}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusColorClass(req.status)}`}
                      >
                        {getStatusLabel(req.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/inventory/material-requests/${req.id}`)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-[11px] font-semibold transition-all border border-slate-700 hover:border-amber-500/50 inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {t("common.viewDetails", "عرض التفاصيل")}
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
    </div>
  );
}
