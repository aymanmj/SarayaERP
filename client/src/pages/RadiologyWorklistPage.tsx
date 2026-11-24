// src/pages/RadiologyWorklistPage.tsx

import { useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../stores/authStore";
import {
  RadiologyReportModal,
  type RadiologyOrderModalItem,
} from "../components/radiology/RadiologyReportModal";

type PatientLite = { id: number; fullName: string; mrn: string };
type StudyLite = {
  id: number;
  code: string;
  name: string;
  modality?: string | null;
  bodyPart?: string | null;
  requiresContrast?: boolean;
  ionizingRadiation?: boolean;
};
type OrderLite = {
  id: number;
  status: string;
  createdAt: string;
  encounterId: number | null;
};
type RadiologyStatus =
  | "PENDING"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

type RadiologyWorklistItem = RadiologyOrderModalItem & {
  status: RadiologyStatus;
  order: OrderLite;
  patient?: PatientLite | null;
  study: StudyLite;
};

function formatDateTime(iso: string, locale: string = "ar-LY") {
  const d = new Date(iso);
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RadiologyWorklistPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const dateLocale = isRtl ? "ar-LY" : "en-US";

  const [search, setSearch] = useState("");
  const [activeReportItem, setActiveReportItem] =
    useState<RadiologyWorklistItem | null>(null);
  const user = useAuthStore((state) => state.user);

  const {
    data: items = [],
    isLoading: loading,
    refetch: load,
  } = useQuery({
    queryKey: ["radiology-worklist", user?.hospitalId, user?.id],
    enabled: Boolean(user),
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<RadiologyWorklistItem[]>(
        "/radiology/worklist",
      );
      return res.data;
    },
    meta: {
      errorMessage: t("radiology.loadFailed", "حدث خطأ أثناء تحميل القائمة."),
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (x) =>
        x.study.name.toLowerCase().includes(s) ||
        (x.study.code?.toLowerCase().includes(s) ?? false) ||
        (x.study.modality?.toLowerCase().includes(s) ?? false) ||
        (x.study.bodyPart?.toLowerCase().includes(s) ?? false) ||
        (x.dicomAccessionNumber?.toLowerCase().includes(s) ?? false) ||
        (x.patient?.fullName?.toLowerCase().includes(s) ?? false) ||
        (x.patient?.mrn?.toLowerCase().includes(s) ?? false) ||
        String(x.order.id).includes(s),
    );
  }, [items, search]);

  const handleStart = async (item: RadiologyWorklistItem) => {
    try {
      await apiClient.post(`/radiology/orders/${item.id}/start`);
      toast.success(t("radiology.startSuccess", "تم تسجيل بدء الفحص."));
      load();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      toast.error(t("radiology.startFailed", "فشل بدء التصوير."));
    }
  };

  const renderStatus = (status: RadiologyStatus) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="text-amber-400">
            {t("radiology.status.pending", "قيد الانتظار")}
          </span>
        );
      case "SCHEDULED":
        return (
          <span className="text-blue-400">
            {t("radiology.status.scheduled", "مجدول")}
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="text-sky-400 animate-pulse">
            {t("radiology.status.inProgress", "جاري التصوير...")}
          </span>
        );
      case "COMPLETED":
        return (
          <span className="text-emerald-400">
            {t("radiology.status.completed", "مكتمل")}
          </span>
        );
      default:
        return status;
    }
  };

  const renderReportStatusBadge = (item: RadiologyWorklistItem) => {
    const st = item.reportStatus;
    if (st === "FINAL") {
      return (
        <span className="px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 text-[11px] font-semibold">
          🔒 موقّع نهائي
        </span>
      );
    }
    if (st === "AMENDED") {
      return (
        <span className="px-2 py-0.5 rounded-full bg-sky-950/70 border border-sky-700/60 text-sky-300 text-[11px] font-semibold">
          📝 معدّل بملحق
        </span>
      );
    }
    if (st === "PRELIMINARY") {
      return (
        <span className="px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-700/60 text-amber-300 text-[11px]">
          أولي (بانتظار التوقيع)
        </span>
      );
    }
    return null;
  };

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            {t("radiology.title", "قائمة الأشعة (Worklist)")}
          </h1>
          <p className="text-sm text-slate-400">
            {t(
              "radiology.subtitle",
              "عرض طلبات الأشعة، إدخال التقارير المهيكلة وتوقيعها إلكترونيًا، ومتابعة النتائج الحرجة.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            placeholder={t("common.searchPlaceholder", "بحث...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => load()}
            className="px-4 py-1.5 rounded-xl bg-slate-800 text-sm hover:bg-slate-700"
          >
            {t("common.refresh", "تحديث")}
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl bg-slate-950/60 border border-slate-800 p-4 overflow-auto">
        <div className="space-y-3">
          {filtered.map((it) => {
            const isSigned =
              it.reportStatus === "FINAL" || it.reportStatus === "AMENDED";
            const pendingReadBackCount = (
              it.criticalNotifications ?? []
            ).filter((n) => !n.readBackConfirmed).length;

            return (
              <div
                key={it.id}
                className="border border-slate-800 bg-slate-900/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-200 text-lg">
                      {it.patient?.fullName}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      ({it.patient?.mrn})
                    </span>
                    {renderReportStatusBadge(it)}
                    {it.isCriticalFinding && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-600/70 text-rose-300 text-[11px] font-bold">
                        🚨 نتيجة حرجة
                        {pendingReadBackCount > 0 ? " (بانتظار Read-Back)" : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-sky-400 font-medium flex flex-wrap items-center gap-2">
                    <span>{it.study.name}</span>
                    {it.study.modality && (
                      <span className="text-slate-500 text-xs">
                        [{it.study.modality}]
                      </span>
                    )}
                    {it.study.requiresContrast && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-700/50 text-amber-300 text-[10px]">
                        صبغة
                      </span>
                    )}
                    {it.dicomAccessionNumber && (
                      <span className="text-[11px] font-mono text-slate-400">
                        Acc: {it.dicomAccessionNumber}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t("radiology.orderDate", "تاريخ الطلب:")}{" "}
                    {formatDateTime(it.order.createdAt, dateLocale)} •{" "}
                    {t("radiology.statusLabel", "الحالة:")}{" "}
                    {renderStatus(it.status)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  {it.viewerUrl && (
                    <a
                      href={it.viewerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-xs text-white"
                    >
                      {t("radiology.actions.openStudy", "فتح دراسة الأشعة")}
                    </a>
                  )}
                  {(it.status === "PENDING" || it.status === "SCHEDULED") && (
                    <button
                      onClick={() => handleStart(it)}
                      className="px-4 py-2 rounded-xl text-xs flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 shadow-lg shadow-indigo-500/20"
                    >
                      <span>{t("radiology.actions.start", "⚡ بدء الفحص")}</span>
                    </button>
                  )}

                  {(it.status === "IN_PROGRESS" || it.status === "COMPLETED") && (
                    <button
                      onClick={() => setActiveReportItem(it)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-600"
                    >
                      {isSigned
                        ? "عرض / ملحق موقّع"
                        : it.status === "COMPLETED"
                          ? t("radiology.actions.editReport", "مراجعة وتوقيع التقرير")
                          : t("radiology.actions.enterReport", "إدخال التقرير")}
                    </button>
                  )}

                  {it.status === "COMPLETED" && (
                    <button
                      onClick={() =>
                        window.open(
                          `/radiology/orders/${it.id}/print`,
                          "_blank",
                        )
                      }
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs text-white shadow-lg shadow-emerald-500/20 font-bold flex items-center gap-2"
                    >
                      <span>🖨️</span> {t("radiology.actions.print", "طباعة")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-10 text-slate-500">
              {t("radiology.empty", "لا توجد طلبات.")}
            </div>
          )}
        </div>
      </div>

      {activeReportItem && (
        <RadiologyReportModal
          item={activeReportItem}
          onClose={() => setActiveReportItem(null)}
          onSaved={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}
