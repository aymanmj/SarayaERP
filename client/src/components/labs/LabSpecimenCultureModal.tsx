import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useAuthStore } from "../../stores/authStore";

interface SpecimenLite {
  id: number;
  barcode: string;
  specimenType: string;
  status: string;
  rejectionCode?: string | null;
  rejectionReason?: string | null;
  recollectionOfId?: number | null;
  collectedAt: string;
  collectedBy?: { id: number; fullName: string };
}

interface SensitivityRow {
  id?: number;
  antibioticName: string;
  interpretation: "S" | "I" | "R" | "SDD";
  micValue?: string;
  isRestricted?: boolean;
}

interface CultureReportLite {
  id: number;
  specimenId?: number | null;
  status: string;
  growthStatus: string;
  gramStain?: string | null;
  organismName?: string | null;
  colonyCount?: string | null;
  verificationHash?: string | null;
  verifiedBy?: { id: number; fullName: string } | null;
  sensitivities: SensitivityRow[];
}

interface OrderSpecimenBundle {
  specimens: SpecimenLite[];
  cultureReports: CultureReportLite[];
}

interface LabSpecimenCultureModalProps {
  labOrderId: number;
  testName: string;
  patientName: string;
  onClose: () => void;
  onUpdated: () => void;
}

export const LabSpecimenCultureModal: React.FC<LabSpecimenCultureModalProps> = ({
  labOrderId,
  testName,
  patientName,
  onClose,
  onUpdated,
}) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const hasPerm = (perm: string) =>
    Boolean(user?.roles?.includes("ADMIN") || user?.permissions?.includes(perm));

  const canCollect = hasPerm("lab:specimens:collect") || hasPerm("labs:manage");
  const canReceive = hasPerm("lab:specimens:receive") || hasPerm("labs:manage");
  const canEnterCulture = hasPerm("lab:results:enter") || hasPerm("labs:manage");
  const canVerify = hasPerm("lab:results:verify");

  const [tab, setTab] = useState<"SPECIMENS" | "CULTURE">("SPECIMENS");
  const [bundle, setBundle] = useState<OrderSpecimenBundle>({
    specimens: [],
    cultureReports: [],
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Specimen collection form
  const [specimenType, setSpecimenType] = useState("BLOOD_EDTA");
  const [containerType, setContainerType] = useState("");
  const [recollectionOfId, setRecollectionOfId] = useState<number | undefined>();

  // Rejection state
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionCode, setRejectionCode] = useState("HEMOLYZED");
  const [rejectionReason, setRejectionReason] = useState("");

  // Culture & AST form
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<string>("");
  const [growthStatus, setGrowthStatus] = useState<
    "NO_GROWTH" | "MIXED_FLORA" | "SIGNIFICANT_GROWTH" | "CONTAMINATED"
  >("SIGNIFICANT_GROWTH");
  const [organismName, setOrganismName] = useState("");
  const [gramStain, setGramStain] = useState("");
  const [colonyCount, setColonyCount] = useState("");
  const [sensitivities, setSensitivities] = useState<SensitivityRow[]>([
    { antibioticName: "", interpretation: "S", micValue: "", isRestricted: false },
  ]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<OrderSpecimenBundle>(
        `/lab/specimens/order/${labOrderId}`,
      );
      setBundle(res.data);
      const activeSpec = res.data.specimens.find(
        (s) => s.status !== "REJECTED" && s.status !== "RECOLLECT_REQUESTED",
      );
      if (activeSpec) setSelectedSpecimenId(String(activeSpec.id));
    } catch {
      toast.error(t("lab.specimens.loadFailed", "تعذر تحميل بيانات العينات والمزارع."));
    } finally {
      setLoading(false);
    }
  }, [labOrderId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCollect = async () => {
    setBusy(true);
    try {
      await apiClient.post("/lab/specimens/collect", {
        labOrderId,
        specimenType,
        containerType: containerType.trim() || undefined,
        recollectionOfId,
      });
      toast.success(
        recollectionOfId
          ? t("lab.specimens.recollected", "تم تسجيل عينة إعادة السحب وتوليد الباركود.")
          : t("lab.specimens.collected", "تم سحب العينة وتوليد الباركود بنجاح."),
      );
      setRecollectionOfId(undefined);
      setContainerType("");
      await loadData();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("lab.specimens.collectFailed", "تعذر تسجيل سحب العينة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleReceive = async (specimenId: number) => {
    setBusy(true);
    try {
      await apiClient.post(`/lab/specimens/${specimenId}/receive`, {});
      toast.success(t("lab.specimens.received", "تم استلام العينة في المختبر."));
      await loadData();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("lab.specimens.receiveFailed", "تعذر استلام العينة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (specimenId: number) => {
    if (!rejectionReason.trim()) {
      toast.warning(t("lab.specimens.rejectReasonReq", "يرجى ذكر سبب رفض العينة."));
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/lab/specimens/${specimenId}/reject`, {
        rejectionCode,
        rejectionReason: rejectionReason.trim(),
        requestRecollection: true,
      });
      toast.success(
        t("lab.specimens.rejected", "تم رفض العينة وإصدار طلب إعادة سحب."),
      );
      setRejectingId(null);
      setRejectionReason("");
      await loadData();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("lab.specimens.rejectFailed", "تعذر رفض العينة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCulture = async () => {
    const cleanSensitivities = sensitivities
      .filter((s) => s.antibioticName.trim().length > 0)
      .map((s) => ({
        antibioticName: s.antibioticName.trim(),
        interpretation: s.interpretation,
        micValue: s.micValue?.trim() || undefined,
        isRestricted: Boolean(s.isRestricted),
      }));

    setBusy(true);
    try {
      await apiClient.post("/lab/specimens/cultures", {
        labOrderId,
        specimenId: selectedSpecimenId ? Number(selectedSpecimenId) : undefined,
        growthStatus,
        gramStain: gramStain.trim() || undefined,
        organismName: organismName.trim() || undefined,
        colonyCount: colonyCount.trim() || undefined,
        sensitivities: cleanSensitivities,
      });
      toast.success(t("lab.culture.saved", "تم حفظ تقرير المزرعة والحساسية (AST)."));
      await loadData();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("lab.culture.saveFailed", "تعذر حفظ تقرير المزرعة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCulture = async (reportId: number) => {
    setBusy(true);
    try {
      await apiClient.post(`/lab/specimens/cultures/${reportId}/verify`, {});
      toast.success(
        t("lab.culture.verified", "تم الاعتماد النهائي وقفل تقرير المزرعة والحساسية."),
      );
      await loadData();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("lab.culture.verifyFailed", "تعذر اعتماد تقرير المزرعة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 text-slate-100 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white">
              🧪 {t("lab.specimens.modalTitle", "دورة العينات والمزارع (Specimen & AST)")}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {testName} • {patientName} (Order #{labOrderId})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setTab("SPECIMENS")}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === "SPECIMENS"
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            🏷️ {t("lab.specimens.tabSpecimens", "العينات والباركود")} ({bundle.specimens.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("CULTURE")}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === "CULTURE"
                ? "bg-emerald-700 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            🧫 {t("lab.specimens.tabCulture", "المزارع والحساسية (AST)")} ({bundle.cultureReports.length})
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {t("common.loading", "جارٍ التحميل...")}
          </div>
        ) : tab === "SPECIMENS" ? (
          <div className="space-y-4">
            {canCollect && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-sky-300">
                  {recollectionOfId
                    ? `${t("lab.specimens.recollectingFor", "تسجيل عينة إعادة سحب بديلة للعينة")} #${recollectionOfId}`
                    : t("lab.specimens.collectNew", "سحب عينة جديدة وتوليد باركود")}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={specimenType}
                    onChange={(e) => setSpecimenType(e.target.value)}
                    aria-label={t("lab.specimens.type", "نوع العينة")}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                  >
                    <option value="BLOOD_EDTA">BLOOD_EDTA</option>
                    <option value="BLOOD_SERUM">BLOOD_SERUM</option>
                    <option value="BLOOD_CULTURE">BLOOD_CULTURE</option>
                    <option value="URINE">URINE</option>
                    <option value="SWAB">SWAB</option>
                    <option value="SPUTUM">SPUTUM</option>
                    <option value="STOOL">STOOL</option>
                    <option value="CSF">CSF</option>
                    <option value="TISSUE">TISSUE</option>
                  </select>
                  <input
                    type="text"
                    value={containerType}
                    onChange={(e) => setContainerType(e.target.value)}
                    placeholder={t("lab.specimens.container", "نوع الوعاء/الأنبوب (اختياري)")}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCollect}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  🏷️ {t("lab.specimens.collectBtn", "سحب العينة وتوليد باركود")}
                </button>
              </div>
            )}

            <div className="space-y-2">
              {bundle.specimens.map((s) => (
                <div
                  key={s.id}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <span className="font-mono font-bold text-sky-300">
                      {s.barcode}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-600 font-bold">
                      {s.status}
                    </span>
                  </div>
                  <div className="text-slate-400">
                    {s.specimenType}
                    {s.recollectionOfId ? ` • إعادة سحب لـ #${s.recollectionOfId}` : ""}
                    {s.rejectionCode ? ` • مرفوضة (${s.rejectionCode}: ${s.rejectionReason})` : ""}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canReceive && s.status === "COLLECTED" && (
                      <button
                        type="button"
                        onClick={() => handleReceive(s.id)}
                        disabled={busy}
                        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      >
                        ✓ {t("lab.specimens.receiveBtn", "استلام العينة")}
                      </button>
                    )}
                    {canReceive &&
                      !["REJECTED", "RECOLLECT_REQUESTED", "DISPOSED"].includes(
                        s.status,
                      ) && (
                        <button
                          type="button"
                          onClick={() => setRejectingId(s.id)}
                          className="px-3 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white font-bold"
                        >
                          ✗ {t("lab.specimens.rejectBtn", "رفض وطلب إعادة سحب")}
                        </button>
                      )}
                    {canCollect &&
                      (s.status === "REJECTED" ||
                        s.status === "RECOLLECT_REQUESTED") && (
                        <button
                          type="button"
                          onClick={() => setRecollectionOfId(s.id)}
                          className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold"
                        >
                          🔁 {t("lab.specimens.recollectAction", "إعادة سحب بديلة")}
                        </button>
                      )}
                  </div>

                  {rejectingId === s.id && (
                    <div className="bg-slate-900/70 border border-rose-700/50 rounded-lg p-3 space-y-2 mt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select
                          value={rejectionCode}
                          onChange={(e) => setRejectionCode(e.target.value)}
                          className="rounded bg-slate-800 border border-slate-600 px-2 py-1 text-white"
                        >
                          <option value="HEMOLYZED">HEMOLYZED</option>
                          <option value="CLOTTED">CLOTTED</option>
                          <option value="INSUFFICIENT_VOLUME">INSUFFICIENT_VOLUME</option>
                          <option value="UNLABELED">UNLABELED</option>
                          <option value="CONTAMINATED">CONTAMINATED</option>
                          <option value="WRONG_CONTAINER">WRONG_CONTAINER</option>
                        </select>
                        <input
                          type="text"
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder={t("lab.specimens.rejectReasonPlaceholder", "تفاصيل سبب الرفض...")}
                          className="rounded bg-slate-800 border border-slate-600 px-2 py-1 text-white"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setRejectingId(null)}
                          className="px-3 py-1 rounded bg-slate-700 text-slate-200"
                        >
                          {t("common.cancel", "إلغاء")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(s.id)}
                          disabled={busy}
                          className="px-3 py-1 rounded bg-rose-700 text-white font-bold"
                        >
                          {t("lab.specimens.confirmReject", "تأكيد الرفض")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {canEnterCulture && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3 text-xs">
                <h4 className="font-bold text-emerald-300">
                  {t("lab.culture.newTitle", "إدخال تقرير المزرعة والحساسية (AST)")}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={growthStatus}
                    onChange={(e) =>
                      setGrowthStatus(
                        e.target.value as
                          | "NO_GROWTH"
                          | "MIXED_FLORA"
                          | "SIGNIFICANT_GROWTH"
                          | "CONTAMINATED",
                      )
                    }
                    className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white"
                  >
                    <option value="SIGNIFICANT_GROWTH">SIGNIFICANT_GROWTH</option>
                    <option value="NO_GROWTH">NO_GROWTH</option>
                    <option value="MIXED_FLORA">MIXED_FLORA</option>
                    <option value="CONTAMINATED">CONTAMINATED</option>
                  </select>
                  <input
                    type="text"
                    value={organismName}
                    onChange={(e) => setOrganismName(e.target.value)}
                    placeholder={t("lab.culture.organism", "اسم الميكروب المعزول (مثل E. coli)")}
                    className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white"
                  />
                  <input
                    type="text"
                    value={gramStain}
                    onChange={(e) => setGramStain(e.target.value)}
                    placeholder={t("lab.culture.gramStain", "صبغة غرام (Gram Stain)")}
                    className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white"
                  />
                  <input
                    type="text"
                    value={colonyCount}
                    onChange={(e) => setColonyCount(e.target.value)}
                    placeholder={t("lab.culture.colonyCount", "تعداد المستعمرات (CFU/mL)")}
                    className="rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white"
                  />
                </div>

                {/* Antibiogram rows */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-300">
                      {t("lab.culture.astTable", "جدول الحساسية للمضادات الحيوية (S / I / R)")}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSensitivities((prev) => [
                          ...prev,
                          { antibioticName: "", interpretation: "S", micValue: "" },
                        ])
                      }
                      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white"
                    >
                      + {t("lab.culture.addAntibiotic", "إضافة مضاد حيوي")}
                    </button>
                  </div>
                  {sensitivities.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={row.antibioticName}
                        onChange={(e) =>
                          setSensitivities((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, antibioticName: e.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Antibiotic"
                        className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white"
                      />
                      <select
                        value={row.interpretation}
                        onChange={(e) =>
                          setSensitivities((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    interpretation: e.target.value as
                                      | "S"
                                      | "I"
                                      | "R"
                                      | "SDD",
                                  }
                                : item,
                            ),
                          )
                        }
                        className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white"
                      >
                        <option value="S">S (Susceptible)</option>
                        <option value="I">I (Intermediate)</option>
                        <option value="R">R (Resistant)</option>
                        <option value="SDD">SDD</option>
                      </select>
                      <input
                        type="text"
                        value={row.micValue || ""}
                        onChange={(e) =>
                          setSensitivities((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, micValue: e.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="MIC (e.g. <=0.25)"
                        className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-white"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSaveCulture}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold disabled:opacity-50"
                >
                  💾 {t("lab.culture.saveBtn", "حفظ تقرير المزرعة")}
                </button>
              </div>
            )}

            {/* Existing Culture Reports */}
            {bundle.cultureReports.map((rep) => (
              <div
                key={rep.id}
                className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-2 text-xs"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">
                    {rep.organismName || rep.growthStatus}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-600 font-bold">
                    {rep.status}
                  </span>
                </div>
                {rep.sensitivities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {rep.sensitivities.map((s, i) => (
                      <span
                        key={s.id ?? i}
                        className={`px-2 py-0.5 rounded font-semibold ${
                          s.interpretation === "S"
                            ? "bg-emerald-900/50 text-emerald-300"
                            : s.interpretation === "R"
                              ? "bg-rose-900/50 text-rose-300"
                              : "bg-amber-900/50 text-amber-300"
                        }`}
                      >
                        {s.antibioticName}: {s.interpretation}
                      </span>
                    ))}
                  </div>
                )}
                {rep.verificationHash && (
                  <div className="font-mono text-[11px] text-slate-400">
                    🔒 SHA-256: {rep.verificationHash.slice(0, 12)}…
                  </div>
                )}
                {rep.status !== "FINAL_VERIFIED" && canVerify && (
                  <button
                    type="button"
                    onClick={() => handleVerifyCulture(rep.id)}
                    disabled={busy}
                    className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    ✓ {t("lab.culture.verifyBtn", "اعتماد نهائي وقفل التقرير")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
