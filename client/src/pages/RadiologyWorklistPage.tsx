// src/pages/RadiologyWorklistPage.tsx

import { useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../stores/authStore";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FilePenLine,
  FileText,
  Lock,
  Play,
  Printer,
  Radiation,
  RefreshCw,
  ScanLine,
  Search,
} from "lucide-react";
import {
  RadiologyReportModal,
  type RadiologyOrderModalItem,
} from "../components/radiology/RadiologyReportModal";
import { RadiologyDoseModal } from "../components/radiology/RadiologyDoseModal";
import {
  SarayaKpiCard,
  SarayaLtrBadge,
  SarayaPageHeader,
} from "../components/ui/SarayaPrimitives";

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
  const [activeDoseItem, setActiveDoseItem] =
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
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
          <Lock className="w-3 h-3" /> موقّع نهائي
        </span>
      );
    }
    if (st === "AMENDED") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-[11px] font-semibold">
          <FilePenLine className="w-3 h-3" /> معدّل بملحق
        </span>
      );
    }
    if (st === "PRELIMINARY") {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-semibold">
          أولي (بانتظار التوقيع)
        </span>
      );
    }
    return null;
  };

  const pendingCount = useMemo(
    () =>
      items.filter((x) => x.status === "PENDING" || x.status === "SCHEDULED")
        .length,
    [items],
  );
  const inProgressCount = useMemo(
    () => items.filter((x) => x.status === "IN_PROGRESS").length,
    [items],
  );
  const completedCount = useMemo(
    () => items.filter((x) => x.status === "COMPLETED").length,
    [items],
  );
  const criticalCount = useMemo(
    () => items.filter((x) => x.isCriticalFinding).length,
    [items],
  );

  return (
    <div
      className="flex flex-col h-full text-slate-100 space-y-4"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <SarayaPageHeader
        title={t("radiology.title", "قائمة الأشعة (Worklist)")}
        subtitle={t(
          "radiology.subtitle",
          "عرض طلبات الأشعة، إدخال التقارير المهيكلة وتوقيعها إلكترونيًا، ومتابعة النتائج الحرجة.",
        )}
        icon={<ScanLine className="w-6 h-6" />}
        actions={
          <>
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                placeholder={t("common.searchPlaceholder", "بحث...")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => load()}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {t("common.refresh", "تحديث")}
            </button>
          </>
        }
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SarayaKpiCard
          label="قيد الانتظار / مجدول"
          value={pendingCount}
          accent="amber"
          ltrValue
          icon={<Clock className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="جاري التصوير الآن"
          value={inProgressCount}
          accent="sky"
          ltrValue
          icon={<ScanLine className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="دراسات مكتملة"
          value={completedCount}
          accent="emerald"
          ltrValue
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="نتائج حرجة"
          value={criticalCount}
          accent="rose"
          ltrValue
          icon={<AlertTriangle className="w-5 h-5" />}
        />
      </div>

      <div className="flex-1 rounded-xl bg-slate-900/70 border border-slate-800 p-4 overflow-auto custom-scrollbar shadow-sm">
        <div className="space-y-2.5">
          {filtered.map((it) => {
            const isSigned =
              it.reportStatus === "FINAL" || it.reportStatus === "AMENDED";
            const pendingReadBackCount = (
              it.criticalNotifications ?? []
            ).filter((n) => !n.readBackConfirmed).length;

            return (
              <div
                key={it.id}
                className="border border-slate-800 bg-slate-950/60 hover:border-slate-700 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-100 text-base">
                      {it.patient?.fullName}
                    </span>
                    {it.patient?.mrn && (
                      <SarayaLtrBadge className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs text-sky-400">
                        {it.patient.mrn}
                      </SarayaLtrBadge>
                    )}
                    {renderReportStatusBadge(it)}
                    {it.isCriticalFinding && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-400 text-[11px] font-bold">
                        <AlertTriangle className="w-3 h-3" /> نتيجة حرجة
                        {pendingReadBackCount > 0 ? " (بانتظار Read-Back)" : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-sky-400 font-semibold flex flex-wrap items-center gap-2">
                    <span>{it.study.name}</span>
                    {it.study.modality && (
                      <SarayaLtrBadge className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] border border-slate-700">
                        {it.study.modality}
                      </SarayaLtrBadge>
                    )}
                    {it.study.requiresContrast && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                        صبغة
                      </span>
                    )}
                    {it.dicomAccessionNumber && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        Acc:{" "}
                        <SarayaLtrBadge>{it.dicomAccessionNumber}</SarayaLtrBadge>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                    <span>{t("radiology.orderDate", "تاريخ الطلب:")}</span>
                    <span dir="ltr" className="font-mono tabular-nums">
                      {formatDateTime(it.order.createdAt, dateLocale)}
                    </span>
                    <span>•</span>
                    <span>{t("radiology.statusLabel", "الحالة:")}</span>
                    {renderStatus(it.status)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  {it.viewerUrl && (
                    <a
                      href={it.viewerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {t("radiology.actions.openStudy", "فتح دراسة الأشعة")}
                    </a>
                  )}
                  {(it.status === "PENDING" || it.status === "SCHEDULED") && (
                    <button
                      onClick={() => handleStart(it)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm cursor-pointer transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{t("radiology.actions.start", "بدء الفحص")}</span>
                    </button>
                  )}

                  {(it.status === "IN_PROGRESS" || it.status === "COMPLETED") && (
                    <button
                      onClick={() => setActiveReportItem(it)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                      {isSigned
                        ? "عرض / ملحق موقّع"
                        : it.status === "COMPLETED"
                          ? t("radiology.actions.editReport", "مراجعة وتوقيع التقرير")
                          : t("radiology.actions.enterReport", "إدخال التقرير")}
                    </button>
                  )}

                  {it.patient?.id && (
                    <button
                      onClick={() => setActiveDoseItem(it)}
                      className="px-3 py-2 rounded-xl bg-amber-600/15 hover:bg-amber-600/25 text-xs text-amber-400 border border-amber-500/35 font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Radiation className="w-3.5 h-3.5" />
                      {t("radiology.dose.button", "الجرعة (RDSR)")}
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
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs text-white shadow-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {t("radiology.actions.print", "طباعة")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-500 text-sm">
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

      {activeDoseItem && activeDoseItem.patient && (
        <RadiologyDoseModal
          open={true}
          radiologyOrderId={activeDoseItem.id}
          patientId={activeDoseItem.patient.id}
          patientName={activeDoseItem.patient.fullName}
          patientMrn={activeDoseItem.patient.mrn}
          studyName={activeDoseItem.study.name}
          defaultModality={activeDoseItem.study.modality}
          defaultBodyRegion={activeDoseItem.study.bodyPart}
          onClose={() => setActiveDoseItem(null)}
          onRecorded={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}
