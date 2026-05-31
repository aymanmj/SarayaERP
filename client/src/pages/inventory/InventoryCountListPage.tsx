import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { apiClient as api } from "@/api/apiClient";
import { formatDate } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface InventoryCount {
  id: number;
  date: string;
  status: string;
  type: string;
  warehouse: { name: string };
  assignedTo: { fullName: string };
}

export function InventoryCountListPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: counts = [], isLoading: loading, refetch: fetchCounts } = useQuery({
    queryKey: ['inventoryCounts', user?.hospitalId],
    queryFn: async () => {
       const hospitalId = user?.hospitalId || 1; 
       const res = await api.get(`/inventory/counts?hospitalId=${hospitalId}`);
       return res.data;
    },
    enabled: !!user?.hospitalId
  });


  const filteredCounts = counts.filter((c) =>
    c.warehouse?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusLabel = (status: string) => {
    switch(status) {
      case "POSTED": return t("inventory.count.status.posted", "مرحل");
      case "DRAFT": return t("inventory.count.status.draft", "مسودة");
      case "REVIEW": return t("inventory.count.status.review", "مراجعة");
      case "IN_PROGRESS": return t("inventory.count.status.inProgress", "قيد التنفيذ");
      default: return status;
    }
  };

  const getTypeLabel = (type: string) => {
     switch(type) {
         case "FULL": return t("inventory.count.type.full", "جرد شامل");
         case "QUARTERLY": return t("inventory.count.type.quarterly", "ربع سنوي");
         case "SPOT_CHECK": return t("inventory.count.type.spotCheck", "جرد مفاجئ");
         default: return type;
     }
  }

  const getStatusColorClass = (status: string) => {
      switch(status) {
          case "POSTED": return "bg-emerald-900/30 text-emerald-400 border-emerald-500/30";
          case "DRAFT": return "bg-slate-800 text-slate-400 border-slate-700";
          case "REVIEW": return "bg-amber-900/20 text-amber-400 border-amber-500/30";
          case "IN_PROGRESS": return "bg-sky-900/30 text-sky-400 border-sky-500/30";
          default: return "bg-slate-800 text-slate-400 border-slate-700";
      }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            {t("inventory.count.title", "عمليات جرد المخزون")}
          </h1>
          <p className="text-sm text-slate-400">
            {t("inventory.count.subtitle", "إدارة عمليات الجرد الفعلي للمخزون والتسويات المخزنية.")}
          </p>
        </div>
        <button 
          onClick={() => navigate("/inventory/counts/new")}
          className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-900/20 transition-all flex items-center gap-2"
        >
          <span>+</span> {t("inventory.count.btn.new", "جرد جديد")}
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex-1 min-w-[250px] relative group">
          <span className="absolute inset-y-0 right-4 flex items-center text-slate-500 group-focus-within:text-sky-400">
            🔍
          </span>
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-12 pl-4 py-2.5 text-sm focus:border-sky-500 outline-none transition-all"
            placeholder={t("inventory.count.searchPlaceholder", "بحث باسم المخزن...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <button
          onClick={() => fetchCounts()}
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
                <th className="px-6 py-4 font-bold">{t("common.id", "الرقم")}</th>
                <th className="px-6 py-4 font-bold">{t("common.date", "التاريخ")}</th>
                <th className="px-6 py-4 font-bold">{t("inventory.warehouse", "المخزن")}</th>
                <th className="px-6 py-4 font-bold">{t("common.type", "النوع")}</th>
                <th className="px-6 py-4 font-bold">{t("common.assignedTo", "المسؤول")}</th>
                <th className="px-6 py-4 font-bold text-center">{t("common.status", "الحالة")}</th>
                <th className="px-6 py-4 font-bold text-center">{t("common.actions", "إجراءات")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-20 text-slate-500 animate-pulse">
                    {t("common.loading", "جاري تحميل البيانات...")}
                  </td>
                </tr>
              ) : filteredCounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-20 text-slate-500">
                    {t("inventory.count.empty", "لا توجد عمليات جرد.")}
                  </td>
                </tr>
              ) : (
                filteredCounts.map((count) => (
                  <tr key={count.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4 font-mono text-sky-400 font-bold">#{count.id}</td>
                    <td className="px-6 py-4 text-slate-400 font-mono">
                        {formatDate(count.date)}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-200">{count.warehouse?.name}</td>
                    <td className="px-6 py-4 text-slate-300">{getTypeLabel(count.type)}</td>
                    <td className="px-6 py-4 text-slate-400">{count.assignedTo?.fullName || "-"}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border uppercase ${getStatusColorClass(count.status)}`}>
                        {getStatusLabel(count.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                            <button
                                onClick={() => navigate(`/inventory/counts/${count.id}`)}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] transition-all border border-slate-700 hover:border-sky-500/50"
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

