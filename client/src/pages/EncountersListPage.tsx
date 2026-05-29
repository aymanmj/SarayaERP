// src/pages/EncountersListPage.tsx

// src/pages/EncountersListPage.tsx

import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { useTranslation } from "react-i18next";

// --- Types ---
type EncounterStatus = "OPEN" | "CLOSED" | "CANCELLED";
type EncounterType = "OPD" | "ER" | "IPD";

interface Encounter {
  id: number;
  type: EncounterType;
  status: EncounterStatus;
  chiefComplaint: string | null;
  createdAt: string;
  patient?: {
    id: number;
    fullName: string;
    mrn: string;
  } | null;
  doctor?: {
    fullName: string;
    id: number;
  };
  department?: {
    name: string;
  } | null;
}

interface PaginationMeta {
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface EncounterListResponse {
    items: Encounter[];
    meta: PaginationMeta;
}

export default function EncountersListPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // --- Filter States ---
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>(
    searchParams.get("type") || "",
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [statusFilter, setStatusFilter] = useState<string>(
    searchParams.get("status") || "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const patientIdParam = searchParams.get("patientId");

  // 1. Fetch Encounters
  const { data, isLoading: loading, refetch, isError } = useQuery<EncounterListResponse>({
      queryKey: ['encounters', page, typeFilter, statusFilter, searchQuery, patientIdParam],
      queryFn: async () => {
          const res = await apiClient.get<EncounterListResponse | Encounter[]>("/encounters", {
            params: {
              page,
              limit: 15,
              patientId: patientIdParam || undefined,
              type: typeFilter || undefined,
              status: statusFilter || undefined,
              search: searchQuery || undefined,
            },
          });
          
          // Normalize response
          if ('items' in res.data) {
              return res.data;
          } else {
             // Fallback for array response
             return { items: Array.isArray(res.data) ? res.data : [], meta: { totalCount: 0, page: 1, limit: 15, totalPages: 1 } };
          }
      },
      placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (isError) {
      toast.error(t("encounters.loadFailed", "فشل تحميل سجل الحالات الطبية"));
    }
  }, [isError]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const encounters = data?.items || [];
  const meta = data?.meta;

  // حساب الإحصائيات السريعة بأمان
  const stats = useMemo(() => {
    return {
      active: encounters.filter((e) => e.status === "OPEN").length,
      er: encounters.filter((e) => e.type === "ER" && e.status === "OPEN").length,
      ipd: encounters.filter((e) => e.type === "IPD" && e.status === "OPEN").length,
    };
  }, [encounters]);

  const getStatusStyle = (status: EncounterStatus) => {
    switch (status) {
      case "OPEN":
        return "bg-emerald-900/30 text-emerald-400 border-emerald-500/30";
      case "CLOSED":
        return "bg-slate-800 text-slate-400 border-slate-700";
      case "CANCELLED":
        return "bg-rose-900/20 text-rose-400 border-rose-500/20";
      default:
        return "";
    }
  };

  const getTypeLabel = (type: EncounterType) => {
    switch (type) {
      case "ER":
        return { label: t("encounters.type.er", "طوارئ"), color: "text-rose-400 bg-rose-400/10" };
      case "IPD":
        return { label: t("encounters.type.ipd", "إيواء"), color: "text-purple-400 bg-purple-400/10" };
      case "OPD":
        return { label: t("encounters.type.opd", "عيادة"), color: "text-sky-400 bg-sky-400/10" };
      default:
        return { label: type, color: "text-slate-400 bg-slate-400/10" };
    }
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            {t("encounters.title", "سجل الحالات الطبية")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t("encounters.subtitle", "متابعة الزيارات، حالات الطوارئ، وعمليات الإيواء النشطة.")}
          </p>
        </div>

        {patientIdParam && (
          <div className="bg-sky-600/20 border border-sky-500/50 px-4 py-2 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
            <span className="text-xs text-sky-300">
              {t("encounters.patientHistoryLabel", "عرض تاريخ المريض ID:")} <b>{patientIdParam}</b>
            </span>
            <button
              onClick={() => {
                const newParams = new URLSearchParams(searchParams);
                newParams.delete("patientId");
                setSearchParams(newParams);
              }}
              className="text-white hover:text-rose-400 font-bold"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            🟢
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase">
              {t("encounters.stats.active", "الحالات النشطة")}
            </div>
            <div className="text-xl font-black text-white">{stats.active}</div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
            🚨
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase">
              {t("encounters.stats.er", "في الطوارئ")}
            </div>
            <div className="text-xl font-black text-white">{stats.er}</div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
            🛌
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase">
              {t("encounters.stats.ipd", "قيد الإيواء")}
            </div>
            <div className="text-xl font-black text-white">{stats.ipd}</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex-1 min-w-[200px] space-y-1">
          <label className="text-[10px] text-slate-500 font-bold mr-2">
            {t("encounters.filters.searchLabel", "بحث سريع")}
          </label>
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:border-sky-500 outline-none transition-all"
            placeholder={t("encounters.filters.searchPlaceholder", "رقم الحالة، MRN، أو اسم المريض...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="w-40 space-y-1">
          <label className="text-[10px] text-slate-500 font-bold mr-2">
            {t("encounters.filters.typeLabel", "نوع الحالة")}
          </label>
          <select
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm outline-none"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">{t("encounters.filters.all", "الكل")}</option>
            <option value="OPD">{t("encounters.filters.opd", "عيادات خارجية")}</option>
            <option value="ER">{t("encounters.filters.er", "طوارئ")}</option>
            <option value="IPD">{t("encounters.filters.ipd", "إيواء")}</option>
          </select>
        </div>

        <button
          onClick={() => {
            setPage(1);
            refetch();
          }}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold border border-slate-700 transition-all"
        >
          {t("common.refresh", "تحديث")}
        </button>
      </div>

      {/* Main Table Section */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
              <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4 font-bold">{t("encounters.table.id", "رقم الحالة")}</th>
                <th className="px-6 py-4 font-bold">{t("encounters.table.admissionDate", "تاريخ الدخول")}</th>
                <th className="px-6 py-4 font-bold">{t("encounters.table.patient", "المريض")}</th>
                <th className="px-6 py-4 font-bold">{t("encounters.table.typeDepartment", "النوع / القسم")}</th>
                <th className="px-6 py-4 font-bold">{t("encounters.table.doctor", "الطبيب")}</th>
                <th className="px-6 py-4 font-bold text-center">{t("encounters.table.status", "الحالة")}</th>
                <th className="px-6 py-4 font-bold text-center">{t("encounters.table.actions", "إجراءات")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-20 text-slate-500 animate-pulse"
                  >
                    {t("encounters.loading", "جارِ تحميل السجلات...")}
                  </td>
                </tr>
              ) : encounters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-20 text-slate-600">
                    {t("encounters.empty", "لا توجد حالات مسجلة تطابق البحث.")}
                  </td>
                </tr>
              ) : (
                encounters.map((enc) => {
                  const typeInfo = getTypeLabel(enc.type);
                  return (
                    <tr
                      key={enc.id}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="px-6 py-4 font-mono text-slate-400">
                        #{enc.id}
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        {formatDate(enc.createdAt)}
                        <div className="text-[10px] text-slate-600">
                          {new Date(enc.createdAt).toLocaleTimeString(isRtl ? "ar-LY" : "en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {/* ✅ استخدام الحماية هنا لمنع الانهيار */}
                        <div className="font-bold text-slate-100 group-hover:text-white">
                          {enc.patient?.fullName || t("encounters.unknownPatient", "مريض غير معروف")}
                        </div>
                        <div className="text-[10px] text-sky-500/70 font-mono">
                          {enc.patient?.mrn || "—"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${typeInfo.color}`}
                        >
                          {typeInfo.label}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {enc.department?.name || "---"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-300 font-medium">
                        {enc.doctor?.fullName || (
                          <span className="text-rose-500/50">{t("encounters.unassignedDoctor", "غير محدد")}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[9px] font-black border tracking-tighter ${getStatusStyle(enc.status)}`}
                        >
                          {enc.status === "OPEN"
                            ? t("encounters.status.open", "نشطة")
                            : enc.status === "CLOSED"
                              ? t("encounters.status.closed", "مكتملة")
                              : t("encounters.status.cancelled", "ملغاة")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => navigate(`/encounters/${enc.id}`)}
                          className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-[11px] font-bold shadow-lg shadow-sky-900/20 transition-all active:scale-95"
                        >
                          {t("encounters.actions.openFile", "فتح الملف ➜")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-6 py-4 flex justify-between items-center text-xs">
          <div className="text-slate-500">
            {t("encounters.pagination.total", "إجمالي السجلات:")}{" "}
            <span className="text-white font-bold">
              {meta?.totalCount ?? encounters.length}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className="px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl disabled:opacity-20 hover:text-sky-400 transition-colors"
            >
              {t("common.previous", "السابق")}
            </button>
            <button
              disabled={page >= (meta?.totalPages || 1) || loading}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl disabled:opacity-20 hover:text-sky-400 transition-colors"
            >
              {t("common.next", "التالي")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
