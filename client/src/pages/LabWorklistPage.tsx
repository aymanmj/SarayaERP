// src/pages/LabWorklistPage.tsx

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { LabSpecimenCultureModal } from "../components/labs/LabSpecimenCultureModal";
import { BloodBankModal } from "../components/labs/BloodBankModal";
import { LabQcModal } from "../components/labs/LabQcModal";
import {
  LabResultEntryModal,
  type LabWorklistOrderForModal,
} from "../components/labs/LabResultEntryModal";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Droplets,
  FileText,
  FlaskConical,
  Lock,
  Play,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  TestTubes,
} from "lucide-react";
import {
  SarayaKpiCard,
  SarayaLtrBadge,
  SarayaPageHeader,
} from "../components/ui/SarayaPrimitives";

type PatientLite = { id: number; fullName: string; mrn: string };
type TestLite = {
  id: number;
  code: string;
  name: string;
  category?: string | null;
  unit?: string | null;
};
type OrderLite = {
  id: number;
  status: string;
  // ✅ [NEW] Payment Status
  paymentStatus: "PENDING" | "PAID" | "WAIVED";
  createdAt: string;
  encounterId: number | null;
};
type LabWorklistItem = LabWorklistOrderForModal & {
  resultStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  resultDate?: string | null;
  order: OrderLite;
  patient?: PatientLite | null;
  test: TestLite & {
    parameters?: Array<{
      id: number;
      code: string;
      name: string;
      unit?: string | null;
      refRange?: string | null;
    }>;
  };
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

export default function LabWorklistPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const dateLocale = isRtl ? "ar-LY" : "en-US";

  const [search, setSearch] = useState("");
  const [specimenModalItem, setSpecimenModalItem] =
    useState<LabWorklistItem | null>(null);
  const [resultModalItem, setResultModalItem] =
    useState<LabWorklistItem | null>(null);
  const [bloodBankOpen, setBloodBankOpen] = useState(false);
  const [qcOpen, setQcOpen] = useState(false);

  const {
    data: items = [],
    isLoading: loading,
    refetch: load,
  } = useQuery({
    queryKey: ["lab-worklist"],
    queryFn: async () => {
      const res = await apiClient.get<LabWorklistItem[]>("/lab/worklist");
      return res.data;
    },
    meta: {
      errorMessage: t("lab.loadFailed", "حدث خطأ أثناء تحميل القائمة."),
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return items;
    return items.filter(
      (x) =>
        x.test.name.includes(s) ||
        x.patient?.fullName.includes(s) ||
        x.patient?.mrn.includes(s) ||
        (x.order.encounterId && String(x.order.encounterId) === s),
    );
  }, [items, search]);

  const handleComplete = (item: LabWorklistItem) => {
    if (item.order.paymentStatus === "PENDING") {
      toast.error(
        t("lab.paymentRequired", "⚠️ لا يمكن إدخال النتيجة قبل سداد الرسوم."),
      );
      return;
    }
    setResultModalItem(item);
  };

  const renderPaymentStatus = (status: string) => {
    if (status === "PAID")
      return (
        <span className="text-[10px] bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
          {t("lab.payment.paid", "تم الدفع")}
        </span>
      );
    if (status === "WAIVED")
      return (
        <span className="text-[10px] bg-sky-900/30 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded font-mono">
          {t("lab.payment.waived", "معفى")}
        </span>
      );
    return (
      <span className="text-[10px] bg-rose-900/30 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded font-bold">
        {t("lab.payment.unpaid", "غير مدفوع")}
      </span>
    );
  };

  const handleStart = async (item: LabWorklistItem) => {
    if (item.order.paymentStatus === "PENDING") {
      toast.error(t("lab.paymentRequiredStart", "⚠️ يجب سداد الرسوم قبل بدء التحليل."));
      return;
    }

    try {
        await apiClient.post(`/lab/orders/${item.id}/start`);
        toast.success(t("lab.startSuccess", "✅ تم إرسال الطلب للجهاز (HL7)."));
        load();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
        toast.error(t("lab.startFailed", "فشل بدء التحليل."));
    }
  };

  const renderStatus = (status: string) => {
    if (status === "COMPLETED")
      return <span className="text-emerald-400">{t("lab.status.completed", "مكتمل")}</span>;
    if (status === "IN_PROGRESS")
      return <span className="text-sky-400 animate-pulse">{t("lab.status.inProgress", "جاري التحليل...")}</span>;
    if (status === "PENDING")
      return <span className="text-amber-400">{t("lab.status.pending", "انتظار")}</span>;
    return status;
  };

  const pendingCount = useMemo(
    () => items.filter((x) => x.resultStatus === "PENDING").length,
    [items],
  );
  const inProgressCount = useMemo(
    () => items.filter((x) => x.resultStatus === "IN_PROGRESS").length,
    [items],
  );
  const completedCount = useMemo(
    () => items.filter((x) => x.resultStatus === "COMPLETED").length,
    [items],
  );
  const unpaidCount = useMemo(
    () => items.filter((x) => x.order.paymentStatus === "PENDING").length,
    [items],
  );

  return (
    <div
      className="flex flex-col h-full text-slate-100 space-y-4"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <SarayaPageHeader
        title={t("lab.title", "قائمة المعمل")}
        subtitle={t("lab.subtitle", "إدخال النتائج وطباعة التقارير المجمعة.")}
        icon={<FlaskConical className="w-6 h-6" />}
        actions={
          <>
            <button
              type="button"
              onClick={() => setQcOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              {t("lab.qc.button", "ضبط الجودة (Westgard QC)")}
            </button>
            <button
              type="button"
              onClick={() => setBloodBankOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Droplets className="w-4 h-4" />
              {t("lab.bloodBank", "بنك الدم وسلامة النقل")}
            </button>
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                placeholder={t("common.searchPlaceholder", "بحث...")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs outline-none focus:border-sky-500 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={() => load()}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
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
          label="بانتظار السحب / التحليل"
          value={pendingCount}
          accent="amber"
          ltrValue
          icon={<Clock className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="جاري التحليل الآن"
          value={inProgressCount}
          accent="sky"
          ltrValue
          icon={<FlaskConical className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="تحاليل مكتملة"
          value={completedCount}
          accent="emerald"
          ltrValue
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
        <SarayaKpiCard
          label="طلبات غير مدفوعة"
          value={unpaidCount}
          accent="rose"
          ltrValue
          icon={<AlertTriangle className="w-5 h-5" />}
        />
      </div>

      <div className="flex-1 rounded-xl bg-slate-900/70 border border-slate-800 p-4 overflow-auto custom-scrollbar shadow-sm">
        <div className="space-y-2.5">
          {filtered.map((it) => (
            <div
              key={it.id}
              className={`border rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-colors ${
                it.order.paymentStatus === "PENDING"
                  ? "bg-slate-950/40 border-slate-800/70 opacity-85"
                  : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
              }`}
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
                  <SarayaLtrBadge className="text-[11px] text-slate-400 bg-slate-800/70 border border-slate-700/60 px-2 py-0.5 rounded">
                    {t("lab.encounterLabel", "Encounter #")}{it.order.encounterId}
                  </SarayaLtrBadge>
                </div>
                <div className="text-sm text-sky-400 font-semibold flex flex-wrap items-center gap-2">
                  <span>{it.test.name}</span>
                  {it.test.code && (
                    <SarayaLtrBadge className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[11px]">
                      {it.test.code}
                    </SarayaLtrBadge>
                  )}
                  {renderPaymentStatus(it.order.paymentStatus)}
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                  <span>{t("lab.orderDate", "تاريخ الطلب:")}</span>
                  <span dir="ltr" className="font-mono tabular-nums">
                    {formatDateTime(it.order.createdAt, dateLocale)}
                  </span>
                  <span>•</span>
                  <span>{t("lab.statusLabel", "الحالة:")}</span>
                  {renderStatus(it.resultStatus)}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                {it.resultStatus === "PENDING" && (
                  <button
                    onClick={() => handleStart(it)}
                    disabled={it.order.paymentStatus === "PENDING"}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                      it.order.paymentStatus === "PENDING"
                        ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-sm cursor-pointer"
                    }`}
                  >
                    {it.order.paymentStatus === "PENDING" ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>{t("lab.actions.start", "بدء التحليل")}</span>
                  </button>
                )}

                {(it.resultStatus === "IN_PROGRESS" || it.resultStatus === "COMPLETED") && (
                  <button
                    onClick={() => handleComplete(it)}
                    disabled={it.order.paymentStatus === "PENDING"}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                      it.order.paymentStatus === "PENDING"
                        ? "bg-slate-800/50 text-slate-500 border-slate-700 cursor-not-allowed"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer"
                    }`}
                  >
                    {it.order.paymentStatus === "PENDING" ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                    )}
                    {it.isVerified
                      ? t("lab.actions.amendResult", "تصحيح معتمد")
                      : it.resultStatus === "COMPLETED"
                        ? t("lab.actions.editResult", "مراجعة/اعتماد")
                        : t("lab.actions.enterResult", "إدخال النتيجة")}
                  </button>
                )}

                {it.pendingCriticalNotifications &&
                  it.pendingCriticalNotifications.length > 0 && (
                    <button
                      onClick={() => setResultModalItem(it)}
                      className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs text-white font-bold animate-pulse cursor-pointer"
                    >
                      قيمة حرجة ({it.pendingCriticalNotifications.length})
                    </button>
                  )}

                <button
                  onClick={() => setSpecimenModalItem(it)}
                  className="px-3 py-2 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 text-xs text-teal-400 border border-teal-500/35 transition font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <TestTubes className="w-3.5 h-3.5" />
                  {t("lab.actions.specimensCulture", "العينات والمزرعة")}
                </button>

                {it.resultStatus === "COMPLETED" && it.order.encounterId && (
                  <button
                    onClick={() =>
                      window.open(
                        `/lab/encounters/${it.order.encounterId}/print`,
                        "_blank",
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs text-white shadow-sm font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    {t("lab.actions.report", "تقرير مجمع")}
                  </button>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-500 text-sm">
              {t("lab.empty", "لا توجد طلبات.")}
            </div>
          )}
        </div>
      </div>

      {specimenModalItem && (
        <LabSpecimenCultureModal
          labOrderId={specimenModalItem.id}
          testName={specimenModalItem.test.name}
          patientName={specimenModalItem.patient?.fullName || "—"}
          onClose={() => setSpecimenModalItem(null)}
          onUpdated={() => {
            void load();
          }}
        />
      )}

      {resultModalItem && (
        <LabResultEntryModal
          item={resultModalItem}
          onClose={() => setResultModalItem(null)}
          onSaved={() => {
            void load();
          }}
        />
      )}

      <BloodBankModal
        open={bloodBankOpen}
        onClose={() => setBloodBankOpen(false)}
      />

      <LabQcModal open={qcOpen} onClose={() => setQcOpen(false)} />
    </div>
  );
}
