// src/components/encounter/PrescriptionsTab.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Info,
  ShieldAlert,
  CheckCircle2,
  ShieldCheck,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  Lock
} from "lucide-react";

// --- Types ---
type MedicationRoute =
  | "ORAL"
  | "IV"
  | "IM"
  | "SC"
  | "TOPICAL"
  | "INHALATION"
  | "OTHER";

type MedicationFrequency =
  | "ONCE"
  | "BID"
  | "TID"
  | "QID"
  | "QHS"
  | "PRN"
  | "DAILY"
  | "OTHER";

type ProductItemLite = {
  id: number;
  code?: string | null;
  name: string;
  genericName?: string | null;
  strength?: string | null;
  form?: string | null;
  stockOnHand: number;
};

type PrescriptionDto = {
  id: number;
  createdAt: string;
  doctor?: { fullName: string };
  status: string;
  notes?: string | null;
  items: {
    id: number;
    drugItem: ProductItemLite;
    dose: string;
    route: string;
    frequency: string;
    durationDays: number;
    quantity: number;
    notes?: string | null;
  }[];
};

type DraftItem = {
  tempId: number;
  drugItemId?: number;
  dose: string;
  route: MedicationRoute;
  frequency: MedicationFrequency;
  durationDays: number;
  quantity: number;
  notes?: string;
};

type CDSSAlertResult = {
  type: string;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "INFO";
  message: string;
  messageAr?: string;
  context?: Record<string, any>;
  requiresOverride: boolean;
};

type PrescriptionsTabProps = {
  encounterId: number;
  hospitalId: number;
  doctorId?: number | null;
  patientId?: number;
};

export function PrescriptionsTab({
  encounterId,
  doctorId,
  patientId,
}: PrescriptionsTabProps) {
  const { t } = useTranslation();

  const ROUTE_OPTIONS = [
    { value: "ORAL", label: t("homeMeds.route.oral", "فموي (Oral)") },
    { value: "IV", label: t("homeMeds.route.iv", "وريدي (IV)") },
    { value: "IM", label: t("homeMeds.route.im", "عضلي (IM)") },
    { value: "SC", label: t("homeMeds.route.sc", "تحت الجلد (Subcutaneous)") },
    { value: "TOPICAL", label: t("homeMeds.route.topical", "موضعي (Topical)") },
    { value: "INHALATION", label: t("homeMeds.route.inhaled", "استنشاق (Inhalation)") },
    { value: "OTHER", label: t("common.other", "أخرى (Other)") },
  ];

  const FREQ_OPTIONS = [
    { value: "ONCE", label: t("prescriptions.frequency.once", "مرة واحدة (Once)") },
    { value: "DAILY", label: t("prescriptions.frequency.daily", "مرة يومياً (Daily)") },
    { value: "BID", label: t("prescriptions.frequency.bid", "مرتان يومياً (BID)") },
    { value: "TID", label: t("prescriptions.frequency.tid", "3 مرات يومياً (TID)") },
    { value: "QID", label: t("prescriptions.frequency.qid", "4 مرات يومياً (QID)") },
    { value: "QHS", label: t("prescriptions.frequency.qhs", "قبل النوم (QHS)") },
    { value: "PRN", label: t("prescriptions.frequency.prn", "عند اللزوم (PRN)") },
  ];
  const [catalog, setCatalog] = useState<ProductItemLite[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionDto[]>([]);

  // Form State
  const [items, setItems] = useState<DraftItem[]>([
    {
      tempId: 1,
      drugItemId: undefined,
      dose: "",
      route: "ORAL",
      frequency: "DAILY",
      durationDays: 3,
      quantity: 1,
      notes: "",
    },
  ]);
  const [nextTempId, setNextTempId] = useState(2);
  const [globalNotes, setGlobalNotes] = useState("");

  // Live CDSS State
  const [cdssResult, setCdssResult] = useState<{
    passed: boolean;
    alerts: CDSSAlertResult[];
    canProceed: boolean;
  } | null>(null);
  const [checkingSafety, setCheckingSafety] = useState(false);

  // Override Dialog State
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [submittingWithOverride, setSubmittingWithOverride] = useState(false);

  const canOrder = !!doctorId;

  // Load Catalog and Prescriptions
  useEffect(() => {
    const load = async () => {
      try {
        const [resP, resC] = await Promise.all([
          apiClient.get<PrescriptionDto[]>(
            `/pharmacy/encounters/${encounterId}/prescriptions`,
          ),
          apiClient.get<ProductItemLite[]>(`/pharmacy/catalog`),
        ]);
        setPrescriptions(resP.data);
        setCatalog(resC.data);
      } catch (e) {
        console.error(e);
      }
    };
    if (encounterId) load();
  }, [encounterId]);

  // Live CDSS check (debounced)
  useEffect(() => {
    const checkSafety = async () => {
      const validItems = items.filter((i) => i.drugItemId);
      if (validItems.length === 0) {
        setCdssResult(null);
        return;
      }
      setCheckingSafety(true);
      try {
        const res = await apiClient.post("/cdss/check-prescription", {
          patientId: patientId,
          encounterId: encounterId,
          drugs: validItems.map((it) => {
            const prod = catalog.find((p) => p.id === it.drugItemId);
            return {
              productId: it.drugItemId,
              genericName: prod?.genericName || prod?.name || "",
              dose: it.dose || "",
              route: it.route || "",
            };
          }),
        });
        setCdssResult(res.data);
      } catch (err) {
        console.error("Failed to run CDSS check:", err);
      } finally {
        setCheckingSafety(false);
      }
    };

    const timer = setTimeout(checkSafety, 600);
    return () => clearTimeout(timer);
  }, [items, patientId, encounterId, catalog]);

  // Row operations
  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        tempId: nextTempId,
        drugItemId: undefined,
        dose: "",
        route: "ORAL",
        frequency: "DAILY",
        durationDays: 3,
        quantity: 1,
        notes: "",
      },
    ]);
    setNextTempId((n) => n + 1);
  };

  const removeRow = (id: number) => {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((i) => i.tempId !== id) : prev,
    );
  };

  const updateItem = (id: number, field: keyof DraftItem, val: any) => {
    setItems((prev) =>
      prev.map((i) => (i.tempId === id ? { ...i, [field]: val } : i)),
    );
  };

  // Submit Logic
  const handleSavePrescription = async (forcedOverride = false) => {
    if (!canOrder) {
      toast.error(t("prescriptions.toast.assignDoctorFirst", "لا يمكن إنشاء وصفة. يرجى تعيين طبيب للحالة أولاً."));
      return;
    }

    const validItems = items.filter((i) => i.drugItemId);
    if (validItems.length === 0) {
      toast.warning(t("prescriptions.toast.addMedicationFirst", "أضف دواء واحداً على الأقل."));
      return;
    }

    // Check blockers
    const blockers = cdssResult?.alerts.filter((a) => a.requiresOverride) || [];
    if (blockers.length > 0 && !forcedOverride) {
      setShowOverrideModal(true);
      return;
    }

    if (forcedOverride) {
      setSubmittingWithOverride(true);
    }

    try {
      await apiClient.post(
        `/pharmacy/encounters/${encounterId}/prescriptions`,
        {
          doctorId,
          notes: globalNotes || undefined,
          overrideSafety: forcedOverride ? true : undefined,
          overrideReason: forcedOverride ? overrideReason : undefined,
          items: validItems.map((it) => ({
            drugItemId: it.drugItemId,
            dose: it.dose || "As directed",
            route: it.route,
            frequency: it.frequency,
            durationDays: Number(it.durationDays),
            quantity: Number(it.quantity),
            notes: it.notes,
          })),
        },
      );

      toast.success(
        forcedOverride
          ? t("prescriptions.toast.savedWithOverride", "تم حفظ الوصفة (مع تجاوز التحذيرات ومبرر طبي)")
          : t("prescriptions.toast.savedSuccess", "تم حفظ الوصفة بنجاح"),
      );

      // Reset
      setItems([
        {
          tempId: 1,
          drugItemId: undefined,
          dose: "",
          route: "ORAL",
          frequency: "DAILY",
          durationDays: 3,
          quantity: 1,
          notes: "",
        },
      ]);
      setGlobalNotes("");
      setOverrideReason("");
      setShowOverrideModal(false);

      // Reload
      const res = await apiClient.get<PrescriptionDto[]>(
        `/pharmacy/encounters/${encounterId}/prescriptions`,
      );
      setPrescriptions(res.data);
    } catch (e: any) {
      if (e.response?.data?.code === "SAFETY_WARNING") {
        setShowOverrideModal(true);
      } else {
        toast.error(e.response?.data?.message || t("prescriptions.toast.saveFailed", "فشل حفظ الوصفة."));
      }
    } finally {
      setSubmittingWithOverride(false);
    }
  };

  const getAlertIcon = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return <ShieldAlert className="w-5 h-5 text-rose-500 animate-pulse" />;
      case "HIGH":
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "MODERATE":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Info className="w-5 h-5 text-slate-400" />;
    }
  };

  const getAlertSeverityClass = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "border-rose-900 bg-rose-950/20 text-rose-200";
      case "HIGH":
        return "border-amber-900 bg-amber-950/20 text-amber-200";
      case "MODERATE":
        return "border-yellow-900 bg-yellow-950/10 text-yellow-100";
      default:
        return "border-slate-800 bg-slate-900/40 text-slate-300";
    }
  };

  const getAlertLabelAr = (type: string) => {
    switch (type) {
      case "DRUG_INTERACTION":
        return t("prescriptions.cdss.drugDrugInteraction", "تفاعل دواء-دواء");
      case "DRUG_ALLERGY":
        return t("prescriptions.cdss.drugAllergy", "حساسية الدواء");
      case "DUPLICATE_THERAPY":
        return t("prescriptions.cdss.therapeuticDuplication", "تكرار علاجي مفرط");
      case "RENAL_DOSE_ADJUST":
        return t("prescriptions.cdss.renalAdjustment", "قصور كلوي / تعديل جرعة");
      case "DRUG_DISEASE":
        return t("prescriptions.cdss.hepaticContraindication", "تعارض دواء-مرض (كبدي)");
      case "DOSAGE_WARNING":
        return t("prescriptions.cdss.dosageWarning", "تحذير جرعة زائدة / منخفضة");
      default:
        return t("prescriptions.cdss.clinicalAlert", "تنبيه سريري");
    }
  };

  const renderDrugName = (d: ProductItemLite) => {
    return `${d.name} ${d.strength ? d.strength : ""} ${d.form ? `(${d.form})` : ""}`;
  };

  const blockers = cdssResult?.alerts.filter((a) => a.requiresOverride) || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main prescribing flow */}
      <div className="lg:col-span-8 space-y-6">
        {/* Form Area */}
        <div
          className={`border border-slate-800 rounded-2xl p-5 bg-slate-900/60 shadow-sm relative overflow-hidden ${
            !canOrder ? "opacity-60 pointer-events-none grayscale" : ""
          }`}
        >
          {/* Glassmorphic border glow */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500/20 via-sky-500/40 to-emerald-500/20" />

          <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/50">
            <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              {t("prescriptions.newPrescription", "وصفة طبية جديدة")}
            </h3>
            {!canOrder && (
              <span className="text-[10px] text-rose-300 font-bold bg-rose-950/60 px-3 py-1 rounded-xl border border-rose-900 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                {t("prescriptions.assignDoctorRequired", "يجب تعيين طبيب للحالة أولاً")}
              </span>
            )}
          </div>

          {/* Dynamic Rows */}
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.tempId}
                className="flex flex-col md:flex-row gap-3 items-start bg-slate-950/40 p-3 rounded-xl border border-slate-800/55 hover:border-slate-800 transition duration-150"
              >
                <div className="flex-1 w-full min-w-[220px]">
                  <label className="text-[10px] text-slate-500 mb-1 block font-medium">
                    الصنف الدوائي
                  </label>
                  <select
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all text-slate-100"
                    value={item.drugItemId ?? ""}
                    onChange={(e) =>
                      updateItem(
                        item.tempId,
                        "drugItemId",
                        Number(e.target.value) || undefined,
                      )
                    }
                  >
                    <option value="">-- {t("prescriptions.selectDrugPlaceholder", "اختر الدواء من الدليل")} --</option>
                    {catalog.map((d) => (
                      <option key={d.id} value={d.id}>
                        {renderDrugName(d)} ("(" + t("inventory.stock", "المخزون:") + ` ${d.stockOnHand})`)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full md:w-28">
                  <label className="text-[10px] text-slate-500 mb-1 block font-medium">
                    الجرعة
                  </label>
                  <input
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-emerald-500 transition-all text-slate-100"
                    placeholder="500mg"
                    value={item.dose}
                    onChange={(e) =>
                      updateItem(item.tempId, "dose", e.target.value)
                    }
                  />
                </div>

                <div className="w-full md:w-32">
                  <label className="text-[10px] text-slate-500 mb-1 block font-medium">
                    طريقة الإعطاء
                  </label>
                  <select
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-2 text-xs outline-none focus:border-emerald-500 transition-all text-slate-100"
                    value={item.route}
                    onChange={(e) =>
                      updateItem(item.tempId, "route", e.target.value)
                    }
                  >
                    {ROUTE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full md:w-36">
                  <label className="text-[10px] text-slate-500 mb-1 block font-medium">
                    التكرار
                  </label>
                  <select
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-2 text-xs outline-none focus:border-emerald-500 transition-all text-slate-100"
                    value={item.frequency}
                    onChange={(e) =>
                      updateItem(item.tempId, "frequency", e.target.value)
                    }
                  >
                    {FREQ_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-20">
                  <label className="text-[10px] text-slate-500 mb-1 block font-medium">
                    الأيام
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-2 text-xs text-center outline-none focus:border-emerald-500 transition-all text-slate-100"
                    value={item.durationDays}
                    onChange={(e) =>
                      updateItem(item.tempId, "durationDays", Number(e.target.value) || 1)
                    }
                  />
                </div>

                <div className="w-20">
                  <label className="text-[10px] text-slate-500 mb-1 block font-medium">
                    الكمية
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-2 text-xs text-center font-bold text-emerald-400 outline-none focus:border-emerald-500 transition-all"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(item.tempId, "quantity", Number(e.target.value) || 1)
                    }
                  />
                </div>

                <button
                  onClick={() => removeRow(item.tempId)}
                  className="mt-6 p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-950/25 rounded-lg transition"
                  title={t("common.deleteRow", "حذف السطر")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center mt-4">
            <button
              onClick={addRow}
              className="text-xs text-sky-400 hover:text-sky-300 font-bold px-3 py-1.5 hover:bg-sky-950/20 rounded-lg border border-sky-950 transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              إضافة دواء آخر
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/60 flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="text-[10px] text-slate-500 mb-1 block font-medium">
                ملاحظات عامة للصيدلي (اختياري)
              </label>
              <input
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-emerald-500 transition-all text-slate-100"
                placeholder={t("prescriptions.placeholder.pharmacistNotes", "مثال: صرف البديل في حال عدم التوفر...")}
                value={globalNotes}
                onChange={(e) => setGlobalNotes(e.target.value)}
              />
            </div>
            <button
              onClick={() => handleSavePrescription(false)}
              disabled={!canOrder}
              className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white px-7 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-950/40 disabled:opacity-50 transition w-full md:w-auto"
            >
              حفظ وإرسال الوصفة
            </button>
          </div>
        </div>

        {/* List Area */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 px-1 uppercase tracking-wider flex items-center gap-2">
            <span>{t("prescriptions.historyTitle", "سجل الوصفات المعتمدة لهذه الحالة")}</span>
            <span className="h-px bg-slate-800/40 flex-1" />
          </h3>
          {prescriptions.length === 0 && (
            <div className="text-center text-xs text-slate-500 py-8 border border-dashed border-slate-800 rounded-2xl bg-slate-900/10">
              {t("prescriptions.empty", "لا توجد وصفات مسجلة لهذه الحالة حتى الآن.")}
            </div>
          )}

          {prescriptions.map((pres) => (
            <div
              key={pres.id}
              className="bg-slate-900/30 border border-slate-800/80 hover:border-slate-800 rounded-2xl p-4 transition"
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-800/40">
                <div className="flex items-center gap-2.5">
                  <span className="text-emerald-400 font-mono text-xs font-bold bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/30">
                    t("prescriptions.prescriptionLabel", "وصفة #"){pres.id}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(pres.createdAt).toLocaleString("ar-LY")}
                  </span>
                </div>
                <span className="text-[10px] bg-slate-950/60 px-2.5 py-1 rounded-lg text-slate-400 border border-slate-800">
                  الطبيب: {pres.doctor?.fullName ?? "—"}
                </span>
              </div>

              <div className="space-y-2">
                {pres.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex justify-between items-center text-xs bg-slate-950/20 p-2.5 rounded-lg border border-slate-900"
                  >
                    <div className="font-semibold text-slate-300">
                      {renderDrugName(it.drugItem)}
                    </div>
                    <div className="text-slate-400 flex gap-3 text-[11px]">
                      <span>{it.dose}</span>
                      <span className="text-slate-700">|</span>
                      <span>{it.frequency}</span>
                      <span className="text-slate-700">|</span>
                      <span>{it.durationDays} {t("common.days", "يوم")}</span>
                    </div>
                    <div className="font-mono text-emerald-400 font-bold bg-emerald-950/20 px-2.5 py-0.5 rounded">
                      x{it.quantity}
                    </div>
                  </div>
                ))}
              </div>
              {pres.notes && (
                <div className="mt-3 text-[10px] text-amber-200/80 bg-amber-950/10 p-2 rounded-lg border border-amber-900/20 font-medium">
                  t("prescriptions.pharmacistNotesLabel", "ملاحظات الصيدلي:") + " " + pres.notes
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CDSS Sidebar Panel */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 sticky top-6">
          <div className="flex justify-between items-center pb-3 border-b border-slate-800/60 mb-4">
            <h3 className="font-bold text-xs text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              {t("cdss.alerts", "التدقيق السريري الذكي (CDSS)")}
            </h3>
            {checkingSafety && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </div>

          {checkingSafety && !cdssResult && (
            <div className="py-6 text-center text-slate-500 text-xs animate-pulse">
              {t("cdss.checking", "جاري تدقيق الملاءمة الطبية والسلامة...")}
            </div>
          )}

          {!cdssResult && !checkingSafety && (
            <div className="py-6 text-center text-slate-500 text-xs">
              {t("cdss.prompt", "قم باختيار الأدوية والجرعات لمراقبة تفاعل وتطابق السلامة الطبية فوراً.")}
            </div>
          )}

          {cdssResult && (
            <div className="space-y-3">
              {/* Critical Alert summary */}
              {blockers.length > 0 && (
                <div className="p-3 rounded-xl border border-rose-955 bg-rose-950/15 text-rose-300 text-xs flex gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 animate-pulse" />
                  <div>
                    <span className="font-bold block mb-0.5">⚠️ {t("cdss.criticalWarning", "تحذير حرج:")}</span>
                    {t("cdss.criticalAlertsCount", { count: blockers.length, defaultValue: `يوجد ${blockers.length} تنبيهات حرجة تمنع إقرار الوصفة دون تبرير طبي موثق.` })}
                  </div>
                </div>
              )}

              {/* Success summary */}
              {cdssResult.alerts.length === 0 && (
                <div className="p-4 rounded-xl border border-emerald-950 bg-emerald-950/10 text-emerald-400 text-xs flex gap-2.5 items-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold block">{t("cdss.safePrescription", "الوصفة آمنة تماماً")}</span>
                    {t("cdss.noConflicts", "لم يتم الكشف عن أي تعارضات أو حساسيات مع الحالة.")}
                  </div>
                </div>
              )}

              {/* Live Alerts List */}
              <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                {cdssResult.alerts.map((alert, index) => {
                  const isAutoSuppressed = alert.context?.autoSuppressed;

                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 transition duration-150 ${getAlertSeverityClass(
                        alert.severity,
                      )}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold flex items-center gap-1.5">
                          {getAlertIcon(alert.severity)}
                          {getAlertLabelAr(alert.type)}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                            alert.severity === "CRITICAL"
                              ? "bg-rose-950 text-rose-300 border border-rose-800"
                              : "bg-slate-950/60 text-slate-400"
                          }`}
                        >
                          {alert.severity}
                        </span>
                      </div>

                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {alert.messageAr || alert.message}
                      </p>

                      {alert.context?.recommendation && (
                        <div className="text-[10px] text-sky-405/90 pt-1 border-t border-slate-800/40">
                          <span className="font-semibold">💡 {t("cdss.recommendation", "توصية: ")}</span>
                          {alert.context.recommendation}
                        </div>
                      )}

                      {/* Auto suppression indicator */}
                      {isAutoSuppressed && (
                        <div className="flex flex-col gap-1 text-[9px] text-emerald-400 bg-emerald-950/20 p-2 rounded border border-emerald-900/20 mt-1.5">
                          <div className="flex items-center gap-1 font-bold">
                            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{t("cdss.autoSuppressedLabel", "تم الإخماد سريرياً (Auto-Suppressed)")}</span>
                          </div>
                          <span className="text-[10px] text-slate-300 block">
                            تجاوز مسبق معتمد: "{alert.context?.originalOverrideReason}"
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Medical Override justification Dialog */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-905 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

            <div className="p-5">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800 mb-4 text-rose-400 font-bold">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                <h4>{t("cdss.overrideTitle", "تجاوز التنبيهات السريرية الحرجة")}</h4>
              </div>

              <div className="space-y-3 mb-5">
                <p className="text-xs text-slate-300 leading-relaxed">
                  {t("cdss.overrideDescLine1", "الرجاء تدوين تبرير طبي معتمد لتجاوز التحذيرات الحرجة التالية. سيتم توثيق")}
                  {t("cdss.overrideDescLine2", "هذا المبرر في السجل الطبي وقاعدة بيانات CDSS لأغراض المسؤولية القانونية ومتابعة السلامة.")}
                </p>

                <div className="space-y-2 max-h-36 overflow-y-auto bg-slate-950/50 p-2.5 rounded-lg border border-slate-850">
                  {blockers.map((b, idx) => (
                    <div key={idx} className="text-xs text-rose-300/90 flex items-start gap-1">
                      <span className="text-rose-500">•</span>
                      <span>{b.messageAr || b.message}</span>
                    </div>
                  ))}
                  {blockers.length === 0 && cdssResult?.alerts.map((b, idx) => (
                    <div key={idx} className="text-xs text-amber-300/90 flex items-start gap-1">
                      <span className="text-amber-500">•</span>
                      <span>{b.messageAr || b.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-slate-400 font-bold block">
                  {t("cdss.overrideReasonRequired", "المبرر الطبي (مطلوب - 4 حروف على الأقل)")}
                </label>
                <textarea
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-100 transition min-h-[80px]"
                  placeholder={t("cdss.overridePlaceholder", "مثال: تم إبلاغ المريض بالمخاطر وسيتم مراقبة وظائف الكلى دورياً...")}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-slate-800">
                <button
                  onClick={() => {
                    setShowOverrideModal(false);
                    setOverrideReason("");
                  }}
                  className="text-xs text-slate-400 hover:text-white px-4 py-2 hover:bg-slate-800 rounded-lg transition"
                >
                  إلغاء وتعديل الأدوية
                </button>
                <button
                  onClick={() => handleSavePrescription(true)}
                  disabled={overrideReason.trim().length < 4 || submittingWithOverride}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2 rounded-lg transition flex items-center gap-1.5"
                >
                  {submittingWithOverride ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-transparent" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  تجاوز واعتماد الوصفة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
