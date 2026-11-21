import { useAuth } from "../../hooks/useAuth";
import { useIdempotentPost } from "../../hooks/useIdempotentPost";
// src/components/nursing/MedicationAdministrationPane.tsx

import { useEffect, useId, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type AdministrationStatus = "GIVEN" | "NOT_GIVEN" | "REFUSED" | "HELD";

function isRateLimited(error: unknown) {
  return isAxiosError(error) && error.response?.status === 429;
}

const retryAfterCongestion =
  "طلبات كثيرة على الشبكة. انتظر قليلًا ثم أعد المحاولة بالطلب نفسه.";

type AdministrationRecord = {
  id: number;
  status: AdministrationStatus;
  administeredAt: string;
  scheduledSlot?: string | null;
  notes: string | null;
  scannedPatientBarcode?: string | null;
  scannedDrugBarcode?: string | null;
  isBarcodeMatch?: boolean;
  isEmergencyOverride?: boolean;
  varianceReason?: string | null;
  performer: { fullName: string };
};

type PrescriptionItem = {
  id: number;
  product: {
    name: string;
    strength: string | null;
    form: string | null;
    barcode?: string | null;
    code?: string | null;
  };
  dose: string;
  route: string;
  frequency: string;
  notes: string | null;
};

type Prescription = {
  id: number;
  status: string;
  doctor: { fullName: string };
  createdAt: string;
  items: PrescriptionItem[];
};

type MarResponse = {
  prescriptions: Prescription[];
  administrations: (AdministrationRecord & { prescriptionItemId: number })[];
  schedule?: {
    scheduledTime: string;
    scheduledSlot: string;
    status: "PENDING" | "OVERDUE" | AdministrationStatus;
    drugName: string;
    dose: string;
    route: string;
    prescriptionItemId: number;
  }[];
};
const scheduledFrequencies = new Set(["DAILY", "BID", "TID", "QID", "QHS"]);
const doseStatusLabels: Record<string, string> = {
  PENDING: "مجدول", OVERDUE: "متأخر", GIVEN: "أُعطي",
  HELD: "مؤجل", REFUSED: "رُفض", NOT_GIVEN: "لم يُعطَ",
};

type FiveRightsVerification = {
  pharmacistVerificationStatus: string;
  isPatientMatch: boolean;
  isDrugMatch: boolean;
  isBarcodeMatch: boolean;
  expectedPatientBarcode?: string;
  expectedDrugBarcode?: string;
  patientName?: string;
  drugName?: string;
  dose?: string;
  route?: string;
  frequency?: string;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-LY", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function MedicationAdministrationPane({
  encounterId,
  onPendingChange,
}: {
  encounterId: number;
  onPendingChange?: (hasPending: boolean) => void;
}) {
  const auth = useAuth();
  const can = (permission: string) =>
    auth.hasPermission(permission) ||
    auth.user?.permissions?.includes("ADMIN_FULL_ACCESS") === true;
  const canAdminister = can("nursing:medications:administer");
  const canOverride = can("nursing:medications:override");
  const scope = `medication:${auth.user?.hospitalId}:${auth.user?.id}:${encounterId}`;
  const request = useIdempotentPost(scope, onPendingChange);
  const modalId = useId();
  const drugBarcodeInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<MarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Record<number, string>>({});

  // CLMA Modal State
  const [clmaItem, setClmaItem] = useState<PrescriptionItem | null>(null);
  const [clmaSlot, setClmaSlot] = useState<string>();
  const [patientBarcode, setPatientBarcode] = useState("");
  const [drugBarcode, setDrugBarcode] = useState("");
  const [verificationResult, setVerificationResult] =
    useState<FiveRightsVerification | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isEmergencyOverride, setIsEmergencyOverride] = useState(false);
  const [varianceReason, setVarianceReason] = useState("");
  const [clmaNotes, setClmaNotes] = useState("");
  const [isSubmittingClma, setIsSubmittingClma] = useState(false);
  const cannotEditBarcodes = request.busy || !!request.pending || isVerifying;

  const invalidateBarcodeCheck = () => {
    setVerificationResult(null);
    setIsEmergencyOverride(false);
    setVarianceReason("");
  };

  const loadMAR = async () => {
    setLoading(true);
    try {
      const [marRes, scheduleRes] = await Promise.all([
        apiClient.get<MarResponse>(`/nursing/encounters/${encounterId}/mar`),
        apiClient
          .get(`/nursing/encounters/${encounterId}/mar-schedule`)
          .catch(() => ({ data: [] })),
      ]);

      setData({
        ...marRes.data,
        schedule: scheduleRes.data,
      });
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل سجل الأدوية.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMAR();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId]);

  const openClmaModal = (item: PrescriptionItem, scheduledSlot?: string) => {
    setClmaItem(item);
    setClmaSlot(scheduledSlot);
    setPatientBarcode("");
    setDrugBarcode("");
    setVerificationResult(null);
    setIsEmergencyOverride(false);
    setVarianceReason("");
    setClmaNotes("");
  };

  const closeClmaModal = () => {
    setClmaItem(null);
    setVerificationResult(null);
  };

  const handleVerifyFiveRights = async () => {
    if (!clmaItem || cannotEditBarcodes) return;
    if (!patientBarcode.trim() || !drugBarcode.trim()) {
      toast.error("يرجى مسح باركود إسوارة المريض وباركود الدواء معاً.");
      return;
    }
    setIsVerifying(true);
    try {
      const res = await apiClient.post<FiveRightsVerification>(
        `/nursing/encounters/${encounterId}/verify-five-rights`,
        {
          prescriptionItemId: clmaItem.id,
          patientBarcode: patientBarcode.trim(),
          drugBarcode: drugBarcode.trim(),
        },
      );
      setVerificationResult(res.data);
      if (res.data.isBarcodeMatch) {
        toast.success(
          "✅ مطابقة المريض والدواء ناجحة؛لم يتحقق النظام من الجرعة والطريق والموعد",
        );
      } else {
        toast.warning(
          "⚠️ تحذير: فشل المطابقة بين الباركود الممسوح وبيانات الوصفة!",
        );
      }
    } catch (err: any) {
      toast.error(
        isRateLimited(err)
          ? "طلبات كثيرة على الشبكة. انتظر قليلًا ثم أعد التحقق من الباركود."
          : err.response?.data?.message || "فشل التحقق من الباركود.",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAdministerWithBarcode = async () => {
    if (!clmaItem || isVerifying) return;
    if (!patientBarcode.trim() || !drugBarcode.trim()) {
      toast.error("يرجى إدخال باركود المريض وباركود الدواء.");
      return;
    }

    if (
      verificationResult &&
      (!verificationResult.isBarcodeMatch || verificationResult.pharmacistVerificationStatus !== "VERIFIED") &&
      !isEmergencyOverride
    ) {
      toast.error(
        "المطابقة غير متطابقة! يلزم تفعيل التجاوز الطارئ وتحديد السبب.",
      );
      return;
    }

    if (isEmergencyOverride && varianceReason.trim().length < 10) {
      toast.error("يجب كتابة سبب التجاوز الطارئ للتوثيق والتدقيق.");
      return;
    }

    if (!canAdminister || request.pending) return;
    setIsSubmittingClma(true);
    try {
      await request.submit(
        `/nursing/encounters/${encounterId}/administer-barcode`,
        {
          prescriptionItemId: clmaItem.id,
          patientBarcode: patientBarcode.trim(),
          drugBarcode: drugBarcode.trim(),
          isEmergencyOverride,
          scheduledSlot: clmaSlot,
          varianceReason: isEmergencyOverride
            ? varianceReason.trim()
            : undefined,
          notes: clmaNotes.trim() || undefined,
        },
      );
      toast.success(
        "✅ تم توثيق إعطاء الدواء بمطابقة باركود المريض والدواء بنجاح",
      );
      closeClmaModal();
      await loadMAR();
    } catch (err: any) {
      toast.error(
        isRateLimited(err)
          ? retryAfterCongestion
          : err.response?.data?.message || "فشل تسجيل الإعطاء بالباركود.",
      );
    } finally {
      setIsSubmittingClma(false);
    }
  };

  const handleAdministerManual = async (
    itemId: number,
    status: AdministrationStatus,
    scheduledSlot?: string,
  ) => {
    if (!canAdminister || request.pending) return;
    let notes = "";
    if (status !== "GIVEN") {
      const prompt = window.prompt("الرجاء ذكر سبب عدم الإعطاء / التأجيل:");
      if (prompt === null) return;
      notes = prompt;
    }

    setProcessing(itemId);
    try {
      await request.submit(
        `/nursing/encounters/${encounterId}/administer-med`,
        {
          prescriptionItemId: itemId,
          status,
          scheduledSlot,
          notes,
        },
      );
      toast.success("تم تسجيل الإجراء بنجاح.");
      await loadMAR();
    } catch (err: any) {
      toast.error(
        isRateLimited(err)
          ? retryAfterCongestion
          : err.response?.data?.message || "فشل التسجيل.",
      );
    } finally {
      setProcessing(null);
    }
  };

  if (loading && !data)
    return (
      <div className="text-slate-400 text-sm p-4 animate-pulse">
        جارِ تحميل جدول الأدوية (MAR)...
      </div>
    );

  const pendingNotice = request.pending && (
        <aside role="alert">
          نتيجة إجراء دوائي غير مؤكدة. لا تكرر إعطاء الجرعة. أعد إرسال طلب التسجيل نفسه.
          <button
            disabled={request.busy || request.pending.scope !== scope}
            onClick={async () => {
              try {
                await request.retry();
                toast.success("تأكد تسجيل الإجراء؛راجع سجل الدواء");
                closeClmaModal();
                void loadMAR();
              } catch (error) {
                toast.error(
                  isRateLimited(error)
                    ? retryAfterCongestion
                    : "لم يُحسم الرد؛أعد الاستعلام بالطلب نفسه",
                );
              }
            }}
          >
            إعادة المحاولة بالطلب نفسه
          </button>
        </aside>
  );

  return (
    <div className="space-y-6">
      {!clmaItem && pendingNotice}
      <p>
        فحص الباركود يطابق هوية المريض والدواء فقط. راجع الجرعة وطريق الإعطاء
        والموعد سريريًا؛اعتماد الصيدلي مطلوب أو تجاوز طارئ مفوض وموثق.
      </p>
      {/* MAR Schedule Timeline */}
      {data?.schedule && data.schedule.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-sky-400 mb-4 flex items-center gap-2">
            <span>🕒</span> جدول إعطاء الأدوية المجدول (MAR Schedule)
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
            {data.schedule.map((slot) => (
              <div
                key={`${slot.prescriptionItemId}:${slot.scheduledSlot}`}
                className={`flex-shrink-0 w-48 p-3 rounded-xl border ${
                  slot.status === "OVERDUE"
                    ? "bg-rose-500/10 border-rose-500/30"
                    : slot.status === "GIVEN"
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-slate-950 border-slate-700"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-slate-200">
                    {slot.scheduledSlot.slice(11)}
                  </div>
                  <div
                    className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      slot.status === "OVERDUE"
                        ? "bg-rose-500 text-white"
                        : slot.status === "GIVEN"
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {doseStatusLabels[slot.status]}
                  </div>
                </div>
                <div className="text-xs font-bold text-sky-300 truncate">
                  {slot.drugName}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {slot.dose} - {slot.route}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prescriptions List */}
      {!data || data.prescriptions.length === 0 ? (
        <div className="text-center py-8 text-slate-500 border border-slate-800 rounded-2xl bg-slate-900/50">
          لا توجد وصفات طبية فعالة لهذا المريض.
        </div>
      ) : (
        data.prescriptions.map((pres) => (
          <div
            key={pres.id}
            className="border border-slate-800 bg-slate-900/60 rounded-2xl p-4"
          >
            <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
              <div className="text-xs text-slate-400">
                وصفة د. {pres.doctor?.fullName} (
                {new Date(pres.createdAt).toLocaleDateString()})
              </div>
              <div className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {pres.status}
              </div>
            </div>

            <div className="space-y-4">
              {pres.items.map((item) => {
                const itemHistory = data.administrations.filter(
                  (a) => a.prescriptionItemId === item.id,
                );
                const lastAdmin = itemHistory[0];
                const slots = data.schedule?.filter((slot) =>
                  slot.prescriptionItemId === item.id &&
                  (slot.status === "PENDING" || slot.status === "OVERDUE" || slot.status === "HELD"),
                ) ?? [];
                const scheduledSlot = slots.find((slot) => slot.scheduledSlot === selectedSlots[item.id])?.scheduledSlot;
                const needsSlot = scheduledFrequencies.has(item.frequency);

                return (
                  <div
                    key={item.id}
                    className="flex flex-col md:flex-row gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800/50 hover:border-slate-700 transition-colors"
                  >
                    {/* Medication details */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100 text-sm">
                          {item.product.name} {item.product.strength}
                        </span>
                        {item.product.barcode && (
                          <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                            🏷️ {item.product.barcode}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1.5 flex flex-wrap gap-3">
                        <span>
                          الجرعة:{" "}
                          <strong className="text-sky-300">{item.dose}</strong>
                        </span>
                        <span>
                          الطريق:{" "}
                          <strong className="text-sky-300">{item.route}</strong>
                        </span>
                        <span>
                          التكرار:{" "}
                          <strong className="text-sky-300">
                            {item.frequency}
                          </strong>
                        </span>
                      </div>
                      {item.notes && (
                        <div className="text-[11px] text-amber-400 mt-1.5 bg-amber-950/20 p-2 rounded border border-amber-900/30">
                          📌 ملاحظات الطبيب: {item.notes}
                        </div>
                      )}

                      {/* Last dose audit summary */}
                      <div className="mt-2.5 text-[11px] text-slate-400 flex items-center gap-2">
                        <span>آخر جرعة:</span>
                        {lastAdmin ? (
                          <span
                            className={
                              lastAdmin.status === "GIVEN"
                                ? "text-emerald-400 font-semibold"
                                : "text-rose-400 font-semibold"
                            }
                          >
                            {formatTime(lastAdmin.administeredAt)} (
                            {lastAdmin.performer?.fullName}) -{" "}
                            {lastAdmin.status}
                            {lastAdmin.scheduledSlot &&
                              ` — موعد الجرعة ${lastAdmin.scheduledSlot.replace("T", " ")}`}
                            {lastAdmin.isBarcodeMatch && " (✅ باركود موثق)"}
                            {lastAdmin.isEmergencyOverride &&
                              " (⚠️ تجاوز طارئ)"}
                          </span>
                        ) : (
                          <span className="text-slate-500">لم يُعطَ بعد</span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <fieldset
                      disabled={
                        !canAdminister || request.busy || !!request.pending
                      }
                      className="flex flex-col justify-center gap-2 min-w-[160px]"
                    >
                      {needsSlot && (
                        <select
                          aria-label={`موعد جرعة ${item.product.name}`}
                          value={scheduledSlot ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setSelectedSlots((previous) => ({ ...previous, [item.id]: value }));
                          }}
                          className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="">{slots.length ? "اختر موعد الجرعة" : "لا توجد جرعات متاحة لهذا اليوم"}</option>
                          {slots.map((slot) => (
                            <option key={slot.scheduledSlot} value={slot.scheduledSlot}>
                              {slot.scheduledSlot.slice(11)} — {doseStatusLabels[slot.status]}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => openClmaModal(item, scheduledSlot)}
                        disabled={needsSlot && !scheduledSlot}
                        className="px-3 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs rounded-xl font-bold shadow-lg shadow-sky-900/30 flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                        <span>📷</span>
                        <span>إعطاء بمطابقة الباركود</span>
                      </button>

                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handleAdministerManual(item.id, "GIVEN", scheduledSlot)
                          }
                          disabled={processing === item.id || (needsSlot && !scheduledSlot)}
                          className="flex-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[10px] rounded-lg border border-slate-700 disabled:opacity-50"
                          title="إعطاء يدوي بدون باركود"
                        >
                          يدوي
                        </button>
                        <button
                          onClick={() =>
                            handleAdministerManual(item.id, "REFUSED", scheduledSlot)
                          }
                          disabled={processing === item.id || (needsSlot && !scheduledSlot)}
                          className="flex-1 px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300 text-[10px] rounded-lg disabled:opacity-50"
                        >
                          رفض
                        </button>
                        <button
                          onClick={() =>
                            handleAdministerManual(item.id, "HELD", scheduledSlot)
                          }
                          disabled={processing === item.id || (needsSlot && !slots.some((slot) => slot.scheduledSlot === scheduledSlot && slot.status !== "HELD"))}
                          className="flex-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] rounded-lg disabled:opacity-50"
                        >
                          تأجيل
                        </button>
                      </div>
                    </fieldset>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* CLMA Closed-Loop Barcode Modal */}
      {clmaItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" aria-labelledby={modalId} className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-6 shadow-2xl text-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <div>
                  <h3 id={modalId} className="font-bold text-base text-white">
                    مطابقة باركود المريض والدواء
                  </h3>
                  <p className="text-xs text-sky-400">
                    {clmaItem.product.name} ({clmaItem.dose} - {clmaItem.route})
                  </p>
                  {clmaSlot && <p className="text-xs text-slate-300">موعد الجرعة {clmaSlot.replace("T", " ")}</p>}
                </div>
              </div>
              <button
                onClick={closeClmaModal}
                disabled={cannotEditBarcodes}
                aria-label="إغلاق مطابقة الباركود"
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>
            {pendingNotice}

            {/* Inputs */}
            <div className="space-y-4 text-xs">
              <div>
                <label htmlFor={`${modalId}-patient`} className="block mb-1 font-semibold text-slate-300">
                  1. باركود إسوارة المريض (Patient Wristband / MRN)
                </label>
                <div className="relative">
                  <input
                    id={`${modalId}-patient`}
                    disabled={cannotEditBarcodes}
                    type="text"
                    value={patientBarcode}
                    onChange={(e) => {
                      setPatientBarcode(e.target.value);
                      invalidateBarcodeCheck();
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      if (patientBarcode.trim()) drugBarcodeInput.current?.focus();
                    }}
                    placeholder="امسح باركود المريض أو اكتب الرقم..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none"
                    autoFocus
                  />
                  <span className="absolute left-3 top-2.5 text-slate-500">
                    🏷️
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor={`${modalId}-drug`} className="block mb-1 font-semibold text-slate-300">
                  2. باركود عبوة / شريط الدواء (Medication Barcode)
                </label>
                <div className="relative">
                  <input
                    id={`${modalId}-drug`}
                    ref={drugBarcodeInput}
                    disabled={cannotEditBarcodes}
                    type="text"
                    value={drugBarcode}
                    onChange={(e) => {
                      setDrugBarcode(e.target.value);
                      invalidateBarcodeCheck();
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      if (!e.repeat && patientBarcode.trim() && drugBarcode.trim()) {
                        void handleVerifyFiveRights();
                      }
                    }}
                    placeholder="امسح باركود الدواء..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-sky-500 focus:outline-none"
                  />
                  <span className="absolute left-3 top-2.5 text-slate-500">
                    💊
                  </span>
                </div>
              </div>

              <button
                onClick={handleVerifyFiveRights}
                disabled={cannotEditBarcodes || !patientBarcode.trim() || !drugBarcode.trim()}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-bold text-slate-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isVerifying ? "جارِ التحقق..." : "🔍 فحص مطابقة الباركود"}
              </button>

              {/* Verification Breakdown */}
              {verificationResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                    verificationResult.isBarcodeMatch
                      ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-200"
                      : "bg-rose-950/30 border-rose-800/60 text-rose-200"
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    {verificationResult.isBarcodeMatch
                      ? "✅ مطابقة المريض والدواء ناجحة"
                      : "❌ تعارض في الباركود"}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] opacity-90">
                    <div>
                      المريض:{" "}
                      {verificationResult.isPatientMatch
                        ? "✅ مطابق"
                        : "❌ غير مطابق"}
                    </div>
                    <div>
                      الدواء:{" "}
                      {verificationResult.isDrugMatch
                        ? "✅ مطابق"
                        : "❌ غير مطابق"}
                    </div>
                    <div>
                      الجرعة:{" "}
                      <span className="text-white font-bold">
                        {verificationResult.dose}
                      </span>
                    </div>
                    <div>
                      طريق الإعطاء:{" "}
                      <span className="text-white font-bold">
                        {verificationResult.route}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Emergency Override Section */}
              {verificationResult &&
                (!verificationResult.isBarcodeMatch ||
                  verificationResult.pharmacistVerificationStatus !==
                    "VERIFIED") && (
                  <div className="bg-amber-950/20 border border-amber-900/40 p-3 rounded-xl space-y-2 text-xs">
                    <label className="flex items-center gap-2 text-amber-300 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canOverride || cannotEditBarcodes}
                        checked={isEmergencyOverride}
                        onChange={(e) =>
                          setIsEmergencyOverride(e.target.checked)
                        }
                        className="rounded bg-slate-900 border-amber-700 text-amber-500"
                      />
                      تجاوز طارئ للمطابقة (Emergency Override)
                    </label>
                    {isEmergencyOverride && (
                      <div>
                        <label className="block mb-1 text-[11px] text-amber-200 font-semibold">
                          سبب التجاوز (مطلوب للتدقيق السريري):
                        </label>
                        <input
                          disabled={request.busy || !!request.pending}
                          type="text"
                          value={varianceReason}
                          onChange={(e) => setVarianceReason(e.target.value)}
                          placeholder="مثال: إسوارة المريض تالفة / حالة إنعاش طارئة..."
                          className="w-full bg-slate-950 border border-amber-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}

              <div>
                <label className="block mb-1 text-slate-400 text-[11px]">
                  ملاحظات إضافية (اختياري):
                </label>
                <input
                  disabled={request.busy || !!request.pending}
                  type="text"
                  value={clmaNotes}
                  onChange={(e) => setClmaNotes(e.target.value)}
                  placeholder="ملاحظات الممرض حول الإعطاء..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeClmaModal}
                disabled={cannotEditBarcodes}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleAdministerWithBarcode}
                disabled={
                  !canAdminister ||
                  !!request.pending ||
                  request.busy ||
                  isVerifying ||
                  isSubmittingClma ||
                  !patientBarcode ||
                  !drugBarcode ||
                  (verificationResult &&
                    (!verificationResult.isBarcodeMatch || verificationResult.pharmacistVerificationStatus !== "VERIFIED") &&
                    (!isEmergencyOverride || varianceReason.trim().length < 10))
                }
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/30 disabled:opacity-50"
              >
                {isSubmittingClma
                  ? "جارِ التوثيق..."
                  : "✅ توثيق الإعطاء بالباركود"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
