import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { useAuthStore } from "../../stores/authStore";

interface GovernanceUser {
  id: number;
  fullName: string;
}

interface GovernancePatientSummary {
  id: number;
  mrn: string;
  fullName: string;
  isActive: boolean;
  isDeceased: boolean;
  dateOfDeath?: string | null;
  deathCertificateNumber?: string | null;
  causeOfDeath?: string | null;
  deathLocation?: string | null;
  deathRecordedAt?: string | null;
  deathRecordedBy?: GovernanceUser | null;
  mergedIntoPatientId?: number | null;
  mergedIntoPatient?: GovernancePatientSummary | null;
}

interface MergeHistoryItem {
  id: number;
  status: string;
  reason: string;
  sourcePatientId: number;
  targetPatientId: number;
  sourcePatient?: GovernancePatientSummary;
  targetPatient?: GovernancePatientSummary;
  requestedBy?: GovernanceUser;
  reviewedBy?: GovernanceUser | null;
  unmergedBy?: GovernanceUser | null;
  createdAt: string;
}

interface DeathEventItem {
  id: number;
  eventType: string;
  dateOfDeath?: string | null;
  causeOfDeath?: string | null;
  reason?: string | null;
  relatedEventId?: number | null;
  actor?: GovernanceUser;
  createdAt: string;
}

interface GovernanceStatusPayload {
  patient: GovernancePatientSummary;
  mergeHistory: MergeHistoryItem[];
  deathEvents: DeathEventItem[];
}

interface PatientGovernanceDialogProps {
  patientId: number;
  patientName: string;
  patientMrn: string;
  onClose: () => void;
  onUpdated: () => void;
}

export const PatientGovernanceDialog: React.FC<PatientGovernanceDialogProps> = ({
  patientId,
  patientName,
  patientMrn,
  onClose,
  onUpdated,
}) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const currentUserId = user?.id;

  const hasPermission = (perm: string) =>
    Boolean(user?.roles?.includes("ADMIN") || user?.permissions?.includes(perm));

  const canRequestMerge = hasPermission("patients:merge:request");
  const canApproveMerge = hasPermission("patients:merge:approve");
  const canRecordDeath = hasPermission("patients:death:record");
  const canReverseDeath = hasPermission("patients:death:reverse");

  const [activeTab, setActiveTab] = useState<"MERGE" | "DEATH">("MERGE");
  const [status, setStatus] = useState<GovernanceStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Merge Request Form
  const [targetPatientId, setTargetPatientId] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  const [unmergeReason, setUnmergeReason] = useState("");

  // Death Form
  const [dateOfDeath, setDateOfDeath] = useState("");
  const [causeOfDeath, setCauseOfDeath] = useState("");
  const [deathCertNumber, setDeathCertNumber] = useState("");
  const [deathLocation, setDeathLocation] = useState("");
  const [reversalReason, setReversalReason] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<GovernanceStatusPayload>(
        `/patients/governance/${patientId}/status`,
      );
      setStatus(res.data);
    } catch {
      toast.error(
        t("patients.governance.loadError", "تعذر تحميل سجل حوكمة المريض."),
      );
    } finally {
      setLoading(false);
    }
  }, [patientId, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleRequestMerge = async () => {
    const targetIdNum = Number(targetPatientId);
    if (!Number.isInteger(targetIdNum) || targetIdNum <= 0) {
      toast.warning(
        t(
          "patients.governance.invalidTarget",
          "يرجى إدخال معرّف صالح للملف الأساسي الهدف.",
        ),
      );
      return;
    }
    if (mergeReason.trim().length < 5) {
      toast.warning(
        t(
          "patients.governance.reasonRequired",
          "يرجى كتابة سبب واضح للدمج (5 أحرف على الأقل).",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await apiClient.post("/patients/governance/merges", {
        sourcePatientId: patientId,
        targetPatientId: targetIdNum,
        reason: mergeReason.trim(),
      });
      toast.success(
        t(
          "patients.governance.mergeRequested",
          "تم رفع طلب الدمج للمراجعة المستقلة (4 عيون).",
        ),
      );
      setTargetPatientId("");
      setMergeReason("");
      await loadStatus();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        t("patients.governance.mergeRequestFailed", "تعذر إرسال طلب الدمج.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleReviewMerge = async (
    mergeId: number,
    decision: "APPROVE" | "REJECT",
  ) => {
    setBusy(true);
    try {
      await apiClient.post(`/patients/governance/merges/${mergeId}/review`, {
        decision,
      });
      toast.success(
        decision === "APPROVE"
          ? t(
              "patients.governance.mergeApproved",
              "تم اعتماد دمج ملف المريض ونقل السجلات ذريًا.",
            )
          : t("patients.governance.mergeRejected", "تم رفض طلب الدمج."),
      );
      await loadStatus();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        t("patients.governance.reviewFailed", "تعذر تنفيذ قرار المراجعة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleUnmerge = async (mergeId: number) => {
    const reason =
      unmergeReason.trim() ||
      t("patients.governance.defaultUnmergeReason", "فك دمج بناءً على مراجعة السجل الطبي");
    setBusy(true);
    try {
      await apiClient.post(`/patients/governance/merges/${mergeId}/unmerge`, {
        reason,
      });
      toast.success(
        t(
          "patients.governance.unmergedSuccess",
          "تم فك الدمج واستعادة كافة السجلات للملف الأصلي.",
        ),
      );
      setUnmergeReason("");
      await loadStatus();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("patients.governance.unmergeFailed", "تعذر فك الدمج.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordDeath = async () => {
    if (!dateOfDeath || causeOfDeath.trim().length < 3) {
      toast.warning(
        t(
          "patients.governance.deathFieldsRequired",
          "يرجى تحديد تاريخ الوفاة وسبب الوفاة.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/patients/governance/${patientId}/death`, {
        dateOfDeath: new Date(dateOfDeath).toISOString(),
        causeOfDeath: causeOfDeath.trim(),
        deathCertificateNumber: deathCertNumber.trim() || undefined,
        deathLocation: deathLocation.trim() || undefined,
      });
      toast.success(
        t(
          "patients.governance.deathRecorded",
          "تم توثيق الوفاة وإلغاء المواعيد المستقبلية تلقائيًا.",
        ),
      );
      await loadStatus();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        t("patients.governance.deathFailed", "تعذر توثيق الوفاة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRequestDeathReversal = async () => {
    if (reversalReason.trim().length < 10) {
      toast.warning(
        t(
          "patients.governance.reversalReasonMin",
          "يرجى كتابة تبرير مفصل (10 أحرف على الأقل).",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(
        `/patients/governance/${patientId}/death/reversal-request`,
        { reason: reversalReason.trim() },
      );
      toast.success(
        t(
          "patients.governance.reversalRequested",
          "تم رفع طلب إلغاء الوفاة للمراجعة المستقلة.",
        ),
      );
      setReversalReason("");
      await loadStatus();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        t(
          "patients.governance.reversalRequestFailed",
          "تعذر إرسال طلب إلغاء الوفاة.",
        );
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleReviewDeathReversal = async (
    eventId: number,
    decision: "APPROVE" | "REJECT",
  ) => {
    setBusy(true);
    try {
      await apiClient.post(
        `/patients/governance/${patientId}/death/reversal-review/${eventId}`,
        { decision },
      );
      toast.success(
        decision === "APPROVE"
          ? t(
              "patients.governance.reversalApproved",
              "تم إلغاء توثيق الوفاة وإعادة تفعيل ملف المريض.",
            )
          : t("patients.governance.reversalRejected", "تم رفض طلب إلغاء الوفاة."),
      );
      await loadStatus();
      onUpdated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        t("patients.governance.reviewFailed", "تعذر تنفيذ قرار المراجعة.");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const reviewedReversalIds = new Set(
    (status?.deathEvents ?? [])
      .filter(
        (e) =>
          e.eventType === "REVERSAL_APPROVED" ||
          e.eventType === "REVERSAL_REJECTED",
      )
      .map((e) => e.relatedEventId),
  );

  const pendingDeathReversal = (status?.deathEvents ?? []).find(
    (e) =>
      e.eventType === "REVERSAL_REQUESTED" && !reviewedReversalIds.has(e.id),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 text-slate-100 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white">
              🛡️ {t("patients.governance.title", "حوكمة ملف المريض (الدمج والوفاة)")}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {patientName} • <span className="font-mono">{patientMrn}</span> (#{patientId})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("MERGE")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "MERGE"
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            🔀 {t("patients.governance.mergeTab", "الدمج وفك الدمج (MPI)")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("DEATH")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "DEATH"
                ? "bg-rose-700 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            🕊️ {t("patients.governance.deathTab", "إدارة الوفاة")}
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            {t("common.loading", "جارٍ التحميل...")}
          </div>
        ) : activeTab === "MERGE" ? (
          <div className="space-y-4">
            {canRequestMerge && !status?.patient.mergedIntoPatientId && !status?.patient.isDeceased && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-bold text-sky-300">
                  {t(
                    "patients.governance.newMergeTitle",
                    "طلب دمج هذا الملف (المصدر) في ملف أساسي (الهدف)",
                  )}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={targetPatientId}
                    onChange={(e) => setTargetPatientId(e.target.value)}
                    placeholder={t(
                      "patients.governance.targetIdPlaceholder",
                      "معرّف المريض الأساسي (Target ID)",
                    )}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="text"
                    value={mergeReason}
                    onChange={(e) => setMergeReason(e.target.value)}
                    placeholder={t(
                      "patients.governance.mergeReasonPlaceholder",
                      "سبب الدمج الموثّق...",
                    )}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRequestMerge}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-50"
                >
                  {t("patients.governance.submitMergeBtn", "رفع طلب الدمج للمراجعة")}
                </button>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400">
                {t("patients.governance.mergeHistoryTitle", "سجل عمليات الدمج")}
              </h4>
              {status?.mergeHistory.length === 0 ? (
                <div className="text-xs text-slate-500 py-3">
                  {t("patients.governance.noMerges", "لا توجد طلبات دمج مسجلة لهذا المريض.")}
                </div>
              ) : (
                status?.mergeHistory.map((m) => {
                  const canReviewThis =
                    m.status === "PENDING" &&
                    canApproveMerge &&
                    currentUserId !== undefined &&
                    m.requestedBy?.id !== currentUserId;
                  return (
                    <div
                      key={m.id}
                      className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-2 text-xs"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white">
                          #{m.id} • #{m.sourcePatientId} → #{m.targetPatientId}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-600 font-semibold">
                          {m.status}
                        </span>
                      </div>
                      <p className="text-slate-300">{m.reason}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {canReviewThis && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleReviewMerge(m.id, "APPROVE")}
                              disabled={busy}
                              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                            >
                              ✓ {t("patients.governance.approveMerge", "اعتماد الدمج")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewMerge(m.id, "REJECT")}
                              disabled={busy}
                              className="px-3 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white font-bold"
                            >
                              ✗ {t("patients.governance.rejectMerge", "رفض")}
                            </button>
                          </>
                        )}
                        {m.status === "APPROVED" && canApproveMerge && (
                          <div className="flex flex-wrap items-center gap-2 w-full">
                            <input
                              type="text"
                              value={unmergeReason}
                              onChange={(e) => setUnmergeReason(e.target.value)}
                              placeholder={t(
                                "patients.governance.unmergeReasonPlaceholder",
                                "سبب فك الدمج...",
                              )}
                              className="flex-1 rounded bg-slate-900 border border-slate-600 px-2 py-1 text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleUnmerge(m.id)}
                              disabled={busy}
                              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold"
                            >
                              ↩ {t("patients.governance.unmergeBtn", "فك الدمج")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {status?.patient.isDeceased ? (
              <div className="bg-rose-950/40 border border-rose-700/60 rounded-xl p-4 space-y-2 text-xs">
                <div className="text-sm font-bold text-rose-300">
                  🕊️ {t("patients.governance.deceasedBadge", "الملف مسجّل كمتوفى ومقفل سريريًا")}
                </div>
                <div>
                  <strong>{t("patients.governance.dateOfDeath", "تاريخ الوفاة:")}</strong>{" "}
                  {status.patient.dateOfDeath
                    ? new Date(status.patient.dateOfDeath).toLocaleString()
                    : "—"}
                </div>
                <div>
                  <strong>{t("patients.governance.causeOfDeath", "السبب:")}</strong>{" "}
                  {status.patient.causeOfDeath || "—"}
                </div>
                {status.patient.deathCertificateNumber && (
                  <div>
                    <strong>{t("patients.governance.certNumber", "رقم الشهادة:")}</strong>{" "}
                    {status.patient.deathCertificateNumber}
                  </div>
                )}

                {canReverseDeath && !pendingDeathReversal && (
                  <div className="pt-3 border-t border-rose-800/50 space-y-2">
                    <textarea
                      value={reversalReason}
                      onChange={(e) => setReversalReason(e.target.value)}
                      placeholder={t(
                        "patients.governance.reversalPlaceholder",
                        "تبرير طلب إلغاء توثيق الوفاة المسجّلة بالخطأ (10 أحرف على الأقل)...",
                      )}
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2 text-white"
                      rows={2}
                    />
                    <button
                      type="button"
                      onClick={handleRequestDeathReversal}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                    >
                      {t("patients.governance.requestReversalBtn", "طلب إلغاء توثيق الوفاة")}
                    </button>
                  </div>
                )}

                {pendingDeathReversal &&
                  canReverseDeath &&
                  currentUserId !== undefined &&
                  pendingDeathReversal.actor?.id !== currentUserId && (
                    <div className="pt-3 border-t border-rose-800/50 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-amber-300">
                        {t(
                          "patients.governance.pendingReversalReview",
                          "يوجد طلب إلغاء وفاة بانتظار اعتماد طبيب مستقل:",
                        )}{" "}
                        {pendingDeathReversal.reason}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleReviewDeathReversal(
                              pendingDeathReversal.id,
                              "APPROVE",
                            )
                          }
                          disabled={busy}
                          className="px-3 py-1 rounded bg-emerald-600 text-white font-bold"
                        >
                          ✓ {t("patients.governance.approveReversal", "اعتماد الإلغاء")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleReviewDeathReversal(
                              pendingDeathReversal.id,
                              "REJECT",
                            )
                          }
                          disabled={busy}
                          className="px-3 py-1 rounded bg-slate-700 text-white font-bold"
                        >
                          ✗ {t("patients.governance.rejectReversal", "رفض")}
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            ) : canRecordDeath ? (
              <div className="bg-slate-800/60 border border-rose-800/40 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-bold text-rose-300">
                  {t("patients.governance.recordDeathTitle", "توثيق وفاة المريض")}
                </h4>
                <p className="text-xs text-slate-400">
                  {t(
                    "patients.governance.recordDeathWarning",
                    "سيؤدي التوثيق إلى قفل الملف سريريًا وإلغاء كافة المواعيد المستقبلية تلقائيًا.",
                  )}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="datetime-local"
                    value={dateOfDeath}
                    onChange={(e) => setDateOfDeath(e.target.value)}
                    aria-label={t("patients.governance.dateOfDeath", "تاريخ الوفاة")}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="text"
                    value={deathCertNumber}
                    onChange={(e) => setDeathCertNumber(e.target.value)}
                    placeholder={t(
                      "patients.governance.certNumberPlaceholder",
                      "رقم شهادة الوفاة (اختياري)",
                    )}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="text"
                    value={causeOfDeath}
                    onChange={(e) => setCauseOfDeath(e.target.value)}
                    placeholder={t(
                      "patients.governance.causePlaceholder",
                      "سبب الوفاة السريري...",
                    )}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white sm:col-span-2"
                  />
                  <input
                    type="text"
                    value={deathLocation}
                    onChange={(e) => setDeathLocation(e.target.value)}
                    placeholder={t(
                      "patients.governance.locationPlaceholder",
                      "مكان الوفاة (مثلاً: العناية المركزة)",
                    )}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white sm:col-span-2"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRecordDeath}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  🕊️ {t("patients.governance.confirmDeathBtn", "تأكيد وتوثيق الوفاة")}
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-400">
                {t("patients.governance.noDeathPermission", "لا تملك صلاحية توثيق الوفاة.")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
