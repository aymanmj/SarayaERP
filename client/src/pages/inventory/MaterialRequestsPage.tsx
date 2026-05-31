import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { inventoryApi } from "@/api/inventoryApi";
import { formatDate } from "@/lib/utils";

export function MaterialRequestsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data: requests = [], isLoading: loading, refetch: fetchRequests } = useQuery({
    queryKey: ['materialRequests', user?.hospitalId, statusFilter],
    queryFn: async () => {
       const res = await inventoryApi.getMaterialRequests({ status: statusFilter });
       return res;
    },
    enabled: !!user?.hospitalId
  });

  const filteredRequests = requests.filter((r) =>
    r.requestNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.requestingWarehouse?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.fulfillingWarehouse?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusLabel = (status: string) => {
    switch(status) {
      case "PENDING_APPROVAL": return t("inventory.materialRequest.status.pending", "بانتظار الاعتماد");
      case "APPROVED": return t("inventory.materialRequest.status.approved", "معتمد - بانتظار الصرف");
      case "REJECTED": return t("inventory.materialRequest.status.rejected", "مرفوض");
      case "PARTIALLY_ISSUED": return t("inventory.materialRequest.status.partial", "مصروف جزئياً");
      case "COMPLETED": return t("inventory.materialRequest.status.completed", "مكتمل");
      case "CANCELLED": return t("inventory.materialRequest.status.cancelled", "ملغى");
      default: return status;
    }
  };

  const getStatusColorClass = (status: string) => {
      switch(status) {
          case "PENDING_APPROVAL": return "bg-amber-900/30 text-amber-400 border-amber-500/30";
          case "APPROVED": return "bg-sky-900/30 text-sky-400 border-sky-500/30";
          case "REJECTED": return "bg-rose-900/30 text-rose-400 border-rose-500/30";
          case "PARTIALLY_ISSUED": return "bg-violet-900/30 text-violet-400 border-violet-500/30";
          case "COMPLETED": return "bg-emerald-900/30 text-emerald-400 border-emerald-500/30";
          case "CANCELLED": return "bg-slate-800 text-slate-400 border-slate-700";
          default: return "bg-slate-800 text-slate-400 border-slate-700";
      }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">📦</span>
            {t("inventory.materialRequest.title", "طلبات المواد")}
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            {t("inventory.materialRequest.subtitle", "إدارة طلبات صرف المواد من المستودعات للأقسام والمستودعات الفرعية.")}
          </p>
        </div>
        <button 
          onClick={() => navigate("/inventory/material-requests/new")}
          className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-900/20 transition-all flex items-center gap-2"
        >
          <span>+</span> {t("inventory.materialRequest.btn.new", "طلب مواد جديد")}
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex-1 min-w-[250px] relative group">
          <span className="absolute inset-y-0 right-4 flex items-center text-slate-500 group-focus-within:text-amber-400">
            🔍
          </span>
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-12 pl-4 py-2.5 text-sm focus:border-amber-500 outline-none transition-all"
            placeholder={t("inventory.materialRequest.searchPlaceholder", "بحث برقم الطلب أو اسم المستودع...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-500 outline-none transition-all text-slate-300"
          >
            <option value="">{t("common.allStatus", "جميع الحالات")}</option>
            <option value="PENDING_APPROVAL">{t("inventory.materialRequest.status.pending", "بانتظار الاعتماد")}</option>
            <option value="APPROVED">{t("inventory.materialRequest.status.approved", "معتمد - بانتظار الصرف")}</option>
            <option value="PARTIALLY_ISSUED">{t("inventory.materialRequest.status.partial", "مصروف جزئياً")}</option>
            <option value="COMPLETED">{t("inventory.materialRequest.status.completed", "مكتمل")}</option>
            <option value="REJECTED">{t("inventory.materialRequest.status.rejected", "مرفوض")}</option>
          </select>
        </div>

        <button
          onClick={() => fetchRequests()}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold border border-slate-700 transition-all"
        >
          {t("common.refresh", "تحديث")}
        </button>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
              <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4 font-bold">{t("inventory.materialRequest.table.number", "رقم الطلب")}</th>
                <th className="px-6 py-4 font-bold">{t("common.date", "التاريخ")}</th>
                <th className="px-6 py-4 font-bold">{t("inventory.materialRequest.table.requestingWarehouse", "المستودع الطالب")}</th>
                <th className="px-6 py-4 font-bold">{t("inventory.materialRequest.table.fulfillingWarehouse", "المستودع المصرف")}</th>
                <th className="px-6 py-4 font-bold">{t("inventory.materialRequest.table.itemCount", "عدد الأصناف")}</th>
                <th className="px-6 py-4 font-bold">{t("inventory.materialRequest.table.requestedBy", "طالب المواد")}</th>
                <th className="px-6 py-4 font-bold text-center">{t("common.status", "الحالة")}</th>
                <th className="px-6 py-4 font-bold text-center">{t("common.actions", "إجراءات")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-slate-500 animate-pulse">
                    جاري تحميل البيانات...
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-slate-500">
                    {t("inventory.materialRequest.empty", "لا توجد طلبات مواد.")}
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4 font-mono text-amber-400 font-bold">{req.requestNumber}</td>
                    <td className="px-6 py-4 text-slate-400 font-mono">
                        {formatDate(req.createdAt)}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-200">{req.requestingWarehouse?.name || "-"}</td>
                    <td className="px-6 py-4 font-bold text-slate-200">{req.fulfillingWarehouse?.name || "-"}</td>
                    <td className="px-6 py-4 text-slate-300 font-mono text-center">{req._count?.items || 0}</td>
                    <td className="px-6 py-4 text-slate-400">{req.requestedBy?.fullName || "-"}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border uppercase ${getStatusColorClass(req.status)}`}>
                        {getStatusLabel(req.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                            <button
                                onClick={() => navigate(`/inventory/material-requests/${req.id}`)}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] transition-all border border-slate-700 hover:border-amber-500/50"
                            >
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
