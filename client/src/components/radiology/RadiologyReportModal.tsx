import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

export type RadiologyAddendumItem = {
  id: number;
  addendumNumber: number;
  reason: string;
  addendumText: string;
  isCriticalFinding: boolean;
  signedAt: string;
  addendumHash: string;
  author?: { id: number; fullName: string } | null;
};

export type RadiologyCriticalNotificationItem = {
  id: number;
  findingSummary: string;
  severity: string;
  readBackConfirmed: boolean;
  notifiedToName?: string | null;
  communicationChannel?: string | null;
  acknowledgedAt?: string | null;
  slaDeadlineAt: string;
  slaBreached: boolean;
};

export type RadiologyOrderModalItem = {
  id: number;
  status: string;
  reportStatus?: string | null;
  reportedAt?: string | null;
  reportText?: string | null;
  indicationText?: string | null;
  techniqueText?: string | null;
  findingsText?: string | null;
  impressionText?: string | null;
  biradsScore?: string | null;
  isCriticalFinding?: boolean;
  signedAt?: string | null;
  signatureHash?: string | null;
  signedBy?: { id: number; fullName: string } | null;
  dicomAccessionNumber?: string | null;
  contrastSafetyNotes?: string | null;
  egfrAtOrder?: number | null;
  pregnancyStatus?: string | null;
  viewerUrl?: string | null;
  addenda?: RadiologyAddendumItem[];
  criticalNotifications?: RadiologyCriticalNotificationItem[];
  patient?: { id: number; fullName: string; mrn: string } | null;
  study: {
    id: number;
    code: string;
    name: string;
    modality?: string | null;
    bodyPart?: string | null;
    requiresContrast?: boolean;
    ionizingRadiation?: boolean;
  };
};

type RadiologyTemplateItem = {
  id: number;
  code: string;
  title: string;
  modality?: string | null;
  indicationTemplate?: string | null;
  techniqueTemplate?: string | null;
  findingsTemplate?: string | null;
  impressionTemplate?: string | null;
};

interface Props {
  item: RadiologyOrderModalItem;
  onClose: () => void;
  onSaved: () => void;
}

export function RadiologyReportModal({ item, onClose, onSaved }: Props) {
  const isSigned =
    item.reportStatus === "FINAL" ||
    item.reportStatus === "AMENDED" ||
    Boolean(item.signedAt);

  const [templates, setTemplates] = useState<RadiologyTemplateItem[]>([]);
  const [indicationText, setIndicationText] = useState(
    item.indicationText ?? "",
  );
  const [techniqueText, setTechniqueText] = useState(item.techniqueText ?? "");
  const [findingsText, setFindingsText] = useState(
    item.findingsText ?? (!item.indicationText ? (item.reportText ?? "") : ""),
  );
  const [impressionText, setImpressionText] = useState(
    item.impressionText ?? "",
  );
  const [biradsScore, setBiradsScore] = useState(item.biradsScore ?? "");
  const [isCriticalFinding, setIsCriticalFinding] = useState(
    Boolean(item.isCriticalFinding),
  );
  const [criticalFindingSummary, setCriticalFindingSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Addendum form (for FINAL / AMENDED reports)
  const [addendumReason, setAddendumReason] = useState("");
  const [addendumText, setAddendumText] = useState("");
  const [addendumCritical, setAddendumCritical] = useState(false);

  // JCI IPSG.2 Read-Back form
  const pendingNotifs = (item.criticalNotifications ?? []).filter(
    (n) => !n.readBackConfirmed,
  );
  const [readBackToName, setReadBackToName] = useState("");
  const [readBackChannel, setReadBackChannel] = useState<
    "PHONE" | "IN_PERSON" | "DIRECT_MESSAGE" | "PAGER"
  >("PHONE");
  const [readBackNotes, setReadBackNotes] = useState("");

  useEffect(() => {
    let active = true;
    const modalityParam = item.study.modality
      ? `?modality=${encodeURIComponent(item.study.modality)}`
      : "";
    apiClient
      .get<RadiologyTemplateItem[]>(`/radiology/templates${modalityParam}`)
      .then((res) => {
        if (active && Array.isArray(res.data)) {
          setTemplates(res.data);
        }
      })
      .catch(() => {
        // Optional helper templates
      });
    return () => {
      active = false;
    };
  }, [item.study.modality]);

  const applyTemplate = (tpl: RadiologyTemplateItem) => {
    if (tpl.indicationTemplate) setIndicationText(tpl.indicationTemplate);
    if (tpl.techniqueTemplate) setTechniqueText(tpl.techniqueTemplate);
    if (tpl.findingsTemplate) setFindingsText(tpl.findingsTemplate);
    if (tpl.impressionTemplate) setImpressionText(tpl.impressionTemplate);
  };

  const handleSaveDraft = async () => {
    setSubmitting(true);
    try {
      await apiClient.patch(`/radiology/orders/${item.id}/report`, {
        indicationText: indicationText || undefined,
        techniqueText: techniqueText || undefined,
        findingsText: findingsText || undefined,
        impressionText: impressionText || undefined,
        biradsScore: biradsScore || undefined,
        isCriticalFinding,
        criticalFindingSummary: criticalFindingSummary || undefined,
      });
      toast.success("تم حفظ مسودة التقرير الأولي (PRELIMINARY).");
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل حفظ التقرير.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignFinal = async () => {
    if (!findingsText.trim() && !impressionText.trim()) {
      toast.error("يرجى إدخال الموجودات أو الخلاصة قبل التوقيع النهائي.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/radiology/orders/${item.id}/sign`, {
        indicationText: indicationText || undefined,
        techniqueText: techniqueText || undefined,
        findingsText: findingsText || undefined,
        impressionText: impressionText || undefined,
        biradsScore: biradsScore || undefined,
        isCriticalFinding,
        criticalFindingSummary: criticalFindingSummary || undefined,
      });
      toast.success("تم توقيع التقرير الإشعاعي إلكترونيًا وإقفاله (SHA-256).");
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل التوقيع الإلكتروني للتقرير.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAddendum = async () => {
    if (addendumReason.trim().length < 3 || addendumText.trim().length < 3) {
      toast.error("يجب إدخال سبب واضح ونص للملحق الموقّع.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/radiology/orders/${item.id}/addenda`, {
        reason: addendumReason.trim(),
        addendumText: addendumText.trim(),
        isCriticalFinding: addendumCritical,
      });
      toast.success("تمت إضافة الملحق الموقّع وتحديث سلسلة التشفير.");
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل إضافة الملحق.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReadBack = async (notificationId: number) => {
    if (readBackToName.trim().length < 2) {
      toast.error("يرجى إدخال اسم الطبيب المبلَّغ.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(
        `/radiology/critical-notifications/${notificationId}/read-back`,
        {
          notifiedToName: readBackToName.trim(),
          communicationChannel: readBackChannel,
          readBackNotes: readBackNotes.trim() || undefined,
        },
      );
      toast.success("تم توثيق إبلاغ النتيجة الحرجة وإعادة القراءة (JCI IPSG.2).");
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "فشل توثيق إعادة القراءة.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="محرر التقرير الإشعاعي المهيكل"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 text-slate-100 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-sky-300">
              تقرير الأشعة المهيكل — {item.study.name}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              المريض: <span className="text-slate-200 font-semibold">{item.patient?.fullName ?? "—"}</span>{" "}
              ({item.patient?.mrn ?? "—"}) • النمط: {item.study.modality ?? "—"}
              {item.dicomAccessionNumber && ` • Accession: ${item.dicomAccessionNumber}`}
            </p>
            {(item.egfrAtOrder != null || item.contrastSafetyNotes || item.pregnancyStatus) && (
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                {item.egfrAtOrder != null && (
                  <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-700/50 text-amber-300">
                    eGFR: {item.egfrAtOrder}
                  </span>
                )}
                {item.pregnancyStatus && (
                  <span className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-700/50 text-purple-300">
                    الحمل: {item.pregnancyStatus}
                  </span>
                )}
                {item.contrastSafetyNotes && (
                  <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-700/50 text-rose-300">
                    {item.contrastSafetyNotes}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {item.viewerUrl && (
              <a
                href={item.viewerUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-xs font-semibold text-white"
              >
                فتح عارض OHIF
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs"
            >
              إغلاق
            </button>
          </div>
        </div>

        {isSigned && (
          <div className="rounded-xl bg-emerald-950/40 border border-emerald-700/50 p-3 text-xs space-y-1">
            <div className="font-bold text-emerald-300">
              🔒 التقرير موقّع ومقفل إلكترونيًا ({item.reportStatus})
            </div>
            <div className="text-slate-300">
              الموقّع: {item.signedBy?.fullName ?? "—"} • التاريخ:{" "}
              {item.signedAt ? new Date(item.signedAt).toLocaleString("ar-LY") : "—"}
            </div>
            {item.signatureHash && (
              <div className="font-mono text-[11px] text-emerald-400/90 break-all">
                SHA-256: {item.signatureHash}
              </div>
            )}
          </div>
        )}

        {!isSigned && templates.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">قوالب سريعة:</span>
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-900/50 border border-slate-700 text-xs text-sky-300"
              >
                {tpl.title}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1" htmlFor="rad-indication">
              الدواعي السريرية (Clinical Indication)
            </label>
            <textarea
              id="rad-indication"
              rows={2}
              disabled={isSigned}
              value={indicationText}
              onChange={(e) => setIndicationText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1" htmlFor="rad-technique">
              التقنية والبروتوكول (Technique)
            </label>
            <textarea
              id="rad-technique"
              rows={2}
              disabled={isSigned}
              value={techniqueText}
              onChange={(e) => setTechniqueText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm disabled:opacity-60"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1" htmlFor="rad-findings">
            الموجودات الإشعاعية (Findings)
          </label>
          <textarea
            id="rad-findings"
            rows={4}
            disabled={isSigned}
            value={findingsText}
            onChange={(e) => setFindingsText(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1" htmlFor="rad-impression">
              الخلاصة التشخيصية (Impression)
            </label>
            <textarea
              id="rad-impression"
              rows={3}
              disabled={isSigned}
              value={impressionText}
              onChange={(e) => setImpressionText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm disabled:opacity-60"
            />
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1" htmlFor="rad-birads">
                تصنيف معياري (BI-RADS / TI-RADS / LI-RADS)
              </label>
              <input
                id="rad-birads"
                type="text"
                disabled={isSigned}
                placeholder="مثال: BI-RADS 2"
                value={biradsScore}
                onChange={(e) => setBiradsScore(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm disabled:opacity-60"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-rose-300 cursor-pointer">
              <input
                type="checkbox"
                disabled={isSigned}
                checked={isCriticalFinding}
                onChange={(e) => setIsCriticalFinding(e.target.checked)}
              />
              نتيجة حرجة طارئة (تستدعي إبلاغ Read-Back خلال 30 دقيقة)
            </label>
            {!isSigned && isCriticalFinding && (
              <input
                type="text"
                placeholder="ملخص النتيجة الحرجة للإبلاغ..."
                value={criticalFindingSummary}
                onChange={(e) => setCriticalFindingSummary(e.target.value)}
                className="w-full bg-slate-950 border border-rose-700/60 rounded-xl p-2 text-xs"
              />
            )}
          </div>
        </div>

        {!isSigned && (
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              disabled={submitting}
              onClick={handleSaveDraft}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium"
            >
              حفظ مسودة أولية (PRELIMINARY)
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSignFinal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white"
            >
              توقيع واعتماد نهائي (FINAL)
            </button>
          </div>
        )}

        {/* JCI IPSG.2 Critical Finding Read-Back */}
        {pendingNotifs.length > 0 && (
          <div className="rounded-xl bg-rose-950/30 border border-rose-700/60 p-4 space-y-3">
            <div className="text-sm font-bold text-rose-300">
              🚨 توثيق إبلاغ النتيجة الحرجة وإعادة القراءة (JCI IPSG.2 Read-Back)
            </div>
            {pendingNotifs.map((n) => (
              <div key={n.id} className="space-y-2 border-t border-rose-800/40 pt-2">
                <div className="text-xs text-rose-200">{n.findingSummary}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="اسم الطبيب المبلَّغ"
                    value={readBackToName}
                    onChange={(e) => setReadBackToName(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                  <select
                    aria-label="وسيلة الإبلاغ"
                    value={readBackChannel}
                    onChange={(e) =>
                      setReadBackChannel(
                        e.target.value as
                          | "PHONE"
                          | "IN_PERSON"
                          | "DIRECT_MESSAGE"
                          | "PAGER",
                      )
                    }
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <option value="PHONE">هاتف (PHONE)</option>
                    <option value="IN_PERSON">شخصيًا (IN_PERSON)</option>
                    <option value="DIRECT_MESSAGE">رسالة مباشرة</option>
                    <option value="PAGER">نداء (PAGER)</option>
                  </select>
                  <input
                    type="text"
                    placeholder="ملاحظات إعادة القراءة"
                    value={readBackNotes}
                    onChange={(e) => setReadBackNotes(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleConfirmReadBack(n.id)}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white"
                >
                  تأكيد Read-Back
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Signed Addenda Timeline & Append Form */}
        {isSigned && (
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 space-y-3">
            <div className="text-sm font-bold text-sky-300">
              ملحقات التقرير الموقّعة (Append-Only Addenda)
            </div>
            {(item.addenda ?? []).length > 0 && (
              <div className="space-y-2">
                {(item.addenda ?? []).map((add) => (
                  <div
                    key={add.id}
                    className="rounded-lg bg-slate-900 border border-slate-800 p-3 text-xs space-y-1"
                  >
                    <div className="flex justify-between text-sky-300 font-semibold">
                      <span>
                        ملحق #{add.addendumNumber} — {add.reason}
                      </span>
                      <span className="text-slate-400">
                        {add.author?.fullName ?? "—"}
                      </span>
                    </div>
                    <p className="text-slate-200 whitespace-pre-wrap">
                      {add.addendumText}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                placeholder="سبب الملحق (إلزامي)"
                value={addendumReason}
                onChange={(e) => setAddendumReason(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <textarea
                rows={2}
                placeholder="نص الملحق الإضافي الموقّع..."
                value={addendumText}
                onChange={(e) => setAddendumText(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-rose-300">
                  <input
                    type="checkbox"
                    checked={addendumCritical}
                    onChange={(e) => setAddendumCritical(e.target.checked)}
                  />
                  الملحق يتضمن نتيجة حرجة جديدة
                </label>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleAddAddendum}
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white"
                >
                  إضافة ملحق موقّع
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
