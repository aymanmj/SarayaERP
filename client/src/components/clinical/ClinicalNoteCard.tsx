import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

export interface ClinicalNoteUser {
  id: number;
  fullName: string;
}

export interface ClinicalNoteRecord {
  id: number;
  encounterId?: number;
  type: string;
  content?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  isAddendum?: boolean;
  parentNoteId?: number | null;
  addendumReason?: string | null;
  createdById?: number;
  signedById?: number | null;
  signedAt?: string | null;
  signatureHash?: string | null;
  coSignedById?: number | null;
  coSignedAt?: string | null;
  coSignatureHash?: string | null;
  createdAt: string;
  createdBy?: ClinicalNoteUser | null;
  signedBy?: ClinicalNoteUser | null;
  coSignedBy?: ClinicalNoteUser | null;
  appendages?: ClinicalNoteRecord[];
}

interface ClinicalNoteCardProps {
  note: ClinicalNoteRecord;
  encounterId: number;
  currentUserId?: number;
  canManageNotes?: boolean;
  canCoSignNotes?: boolean;
  onChanged: () => void;
}

const ADDENDUM_REASONS = [
  { value: "CLARIFICATION", labelAr: "توضيح سريري", labelEn: "Clarification" },
  { value: "LATE_ENTRY", labelAr: "إدخال متأخر", labelEn: "Late Entry" },
  { value: "CORRECTION", labelAr: "تصحيح معلومة", labelEn: "Correction" },
  { value: "FOLLOW_UP", labelAr: "نتيجة متابعة", labelEn: "Follow-up Result" },
] as const;

export const ClinicalNoteCard: React.FC<ClinicalNoteCardProps> = ({
  note,
  encounterId,
  currentUserId,
  canManageNotes = true,
  canCoSignNotes = false,
  onChanged,
}) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language !== "en";

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content || "");
  const [editSubjective, setEditSubjective] = useState(note.subjective || "");
  const [editObjective, setEditObjective] = useState(note.objective || "");
  const [editAssessment, setEditAssessment] = useState(note.assessment || "");
  const [editPlan, setEditPlan] = useState(note.plan || "");

  const [showAddendumForm, setShowAddendumForm] = useState(false);
  const [addendumReason, setAddendumReason] = useState<string>("CLARIFICATION");
  const [addendumContent, setAddendumContent] = useState("");

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<
    null | { verified: boolean; signatureHash?: string | null }
  >(null);

  const isSigned = Boolean(note.signedAt);
  const isCoSigned = Boolean(note.coSignedAt);
  const authorId = note.createdById ?? note.createdBy?.id;
  const signerId = note.signedById ?? note.signedBy?.id;
  const isAuthor = currentUserId !== undefined && authorId === currentUserId;
  const canSignDraft = !isSigned && canManageNotes && isAuthor;
  const canEditDraft = !isSigned && canManageNotes && isAuthor;
  const canCoSign =
    isSigned &&
    !isCoSigned &&
    canCoSignNotes &&
    currentUserId !== undefined &&
    signerId !== currentUserId;

  const isStructured = Boolean(
    note.subjective || note.objective || note.assessment || note.plan,
  );

  const handleSaveDraft = async () => {
    setBusyAction("save");
    try {
      const payload = isStructured
        ? {
            subjective: editSubjective,
            objective: editObjective,
            assessment: editAssessment,
            plan: editPlan,
          }
        : { content: editContent };
      await apiClient.patch(`/clinical-notes/${note.id}`, payload);
      toast.success(t("clinicalNotes.draftUpdated", "تم تحديث مسودة الملاحظة."));
      setIsEditing(false);
      onChanged();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("clinicalNotes.updateFailed", "تعذر تحديث المسودة.");
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteDraft = async () => {
    setBusyAction("delete");
    try {
      await apiClient.delete(`/clinical-notes/${note.id}`);
      toast.success(t("clinicalNotes.draftDeleted", "تم حذف المسودة."));
      onChanged();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("clinicalNotes.deleteFailed", "تعذر حذف المسودة.");
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSign = async (targetNoteId: number) => {
    setBusyAction(`sign-${targetNoteId}`);
    try {
      await apiClient.post(`/clinical-notes/${targetNoteId}/sign`, {});
      toast.success(
        t(
          "clinicalNotes.signedSuccess",
          "تم التوقيع الإلكتروني وقفل الملاحظة نهائيًا.",
        ),
      );
      onChanged();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("clinicalNotes.signFailed", "تعذر توقيع الملاحظة.");
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCoSign = async () => {
    setBusyAction("cosign");
    try {
      await apiClient.post(`/clinical-notes/${note.id}/cosign`, {});
      toast.success(
        t("clinicalNotes.coSignedSuccess", "تم اعتماد التوقيع المشترك بنجاح."),
      );
      onChanged();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("clinicalNotes.coSignFailed", "تعذر التوقيع المشترك.");
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleVerifyIntegrity = async () => {
    setBusyAction("verify");
    try {
      const res = await apiClient.get(`/clinical-notes/${note.id}/verify`);
      const ok = Boolean(res.data?.integrityVerified);
      setVerifyStatus({
        verified: ok,
        signatureHash: res.data?.signatureHash,
      });
      if (ok) {
        toast.success(
          t(
            "clinicalNotes.integrityVerified",
            "تم التحقق من البصمة الرقمية وسلامة التوقيع.",
          ),
        );
      } else {
        toast.error(
          t(
            "clinicalNotes.integrityMismatch",
            "تحذير: فشل التحقق من البصمة الرقمية للملاحظة!",
          ),
        );
      }
    } catch {
      toast.error(
        t("clinicalNotes.verifyFailed", "تعذر التحقق من سلامة التوقيع."),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateAddendum = async () => {
    if (!addendumContent.trim()) {
      toast.warning(
        t("clinicalNotes.addendumEmpty", "يرجى كتابة نص الملحق أولاً."),
      );
      return;
    }
    setBusyAction("addendum");
    try {
      await apiClient.post("/clinical-notes", {
        encounterId,
        type: note.type,
        isAddendum: true,
        parentNoteId: note.id,
        addendumReason,
        content: addendumContent.trim(),
      });
      toast.success(
        t(
          "clinicalNotes.addendumCreated",
          "تم حفظ مسودة الملحق؛ يرجى توقيعها لقفلها نهائيًا.",
        ),
      );
      setAddendumContent("");
      setShowAddendumForm(false);
      onChanged();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        t("clinicalNotes.addendumFailed", "تعذر إضافة الملحق السريري.");
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-sm space-y-3">
      {/* Header & Lifecycle Badges */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-sky-400">
            {note.createdBy?.fullName || t("common.unknown", "غير معروف")}
          </span>
          <span className="text-xs text-slate-400">
            {new Date(note.createdAt).toLocaleString()} • {note.type}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isSigned ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-500/40">
              🔒 {t("clinicalNotes.signedLocked", "موقّعة ومقفلة")}
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-900/40 text-amber-300 border border-amber-500/40">
              📝 {t("clinicalNotes.draft", "مسودة غير موقّعة")}
            </span>
          )}

          {isCoSigned && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-900/40 text-blue-300 border border-blue-500/40">
              ☑️ {t("clinicalNotes.coSigned", "توقيع مشترك")}
            </span>
          )}

          {verifyStatus && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                verifyStatus.verified
                  ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/50"
                  : "bg-rose-950/60 text-rose-300 border-rose-500/50"
              }`}
            >
              {verifyStatus.verified
                ? t("clinicalNotes.hashValid", "✓ بصمة SHA-256 سليمة")
                : t("clinicalNotes.hashInvalid", "✗ عدم تطابق البصمة")}
            </span>
          )}
        </div>
      </div>

      {/* Body or Inline Draft Editor */}
      {isEditing ? (
        <div className="space-y-3 bg-slate-900/60 p-3 rounded-lg border border-slate-700">
          {isStructured ? (
            <>
              <textarea
                value={editSubjective}
                onChange={(e) => setEditSubjective(e.target.value)}
                placeholder="Subjective (S)"
                className="w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 p-2 text-sm"
                rows={2}
              />
              <textarea
                value={editObjective}
                onChange={(e) => setEditObjective(e.target.value)}
                placeholder="Objective (O)"
                className="w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 p-2 text-sm"
                rows={2}
              />
              <textarea
                value={editAssessment}
                onChange={(e) => setEditAssessment(e.target.value)}
                placeholder="Assessment (A)"
                className="w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 p-2 text-sm"
                rows={2}
              />
              <textarea
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
                placeholder="Plan (P)"
                className="w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 p-2 text-sm"
                rows={2}
              />
            </>
          ) : (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 p-2 text-sm"
              rows={4}
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold"
            >
              {t("common.cancel", "إلغاء")}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={busyAction === "save"}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
            >
              {busyAction === "save"
                ? t("common.saving", "جارٍ الحفظ...")
                : t("clinicalNotes.saveDraft", "حفظ التعديل")}
            </button>
          </div>
        </div>
      ) : isStructured ? (
        <div className="space-y-2 text-sm text-slate-200">
          {note.subjective && (
            <div>
              <strong className="text-sky-400">S:</strong> {note.subjective}
            </div>
          )}
          {note.objective && (
            <div>
              <strong className="text-emerald-400">O:</strong> {note.objective}
            </div>
          )}
          {note.assessment && (
            <div>
              <strong className="text-amber-400">A:</strong> {note.assessment}
            </div>
          )}
          {note.plan && (
            <div>
              <strong className="text-purple-400">P:</strong> {note.plan}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-slate-200 whitespace-pre-wrap">
          {note.content}
        </div>
      )}

      {/* Signature Attestation Metadata */}
      {isSigned && (
        <div className="text-xs text-slate-400 bg-slate-900/50 border border-slate-700/70 rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            {t("clinicalNotes.signedByLabel", "وقّعها:")}{" "}
            <strong className="text-emerald-300">
              {note.signedBy?.fullName || `#${note.signedById}`}
            </strong>{" "}
            ({note.signedAt ? new Date(note.signedAt).toLocaleString() : ""})
          </span>
          {note.signatureHash && (
            <span className="font-mono text-[11px] text-slate-400">
              SHA-256: {note.signatureHash.slice(0, 12)}…
            </span>
          )}
          {isCoSigned && (
            <span>
              {t("clinicalNotes.coSignedByLabel", "توقيع مشترك:")}{" "}
              <strong className="text-blue-300">
                {note.coSignedBy?.fullName || `#${note.coSignedById}`}
              </strong>{" "}
              ({note.coSignedAt ? new Date(note.coSignedAt).toLocaleString() : ""})
            </span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/70">
        {canEditDraft && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold"
          >
            ✏️ {t("clinicalNotes.editDraft", "تعديل المسودة")}
          </button>
        )}

        {canSignDraft && !isEditing && (
          <button
            type="button"
            onClick={() => handleSign(note.id)}
            disabled={busyAction === `sign-${note.id}`}
            className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
          >
            ✍️ {t("clinicalNotes.signAndLock", "توقيع إلكتروني وقفل")}
          </button>
        )}

        {canEditDraft && !isEditing && (
          <button
            type="button"
            onClick={handleDeleteDraft}
            disabled={busyAction === "delete"}
            className="px-2.5 py-1 rounded-lg bg-rose-900/50 hover:bg-rose-800/70 text-rose-200 border border-rose-700/50 text-xs font-semibold disabled:opacity-50"
          >
            🗑️ {t("clinicalNotes.deleteDraft", "حذف المسودة")}
          </button>
        )}

        {canCoSign && (
          <button
            type="button"
            onClick={handleCoSign}
            disabled={busyAction === "cosign"}
            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50"
          >
            ☑️ {t("clinicalNotes.coSignAction", "توقيع مشترك (Co-Sign)")}
          </button>
        )}

        {isSigned && canManageNotes && (
          <button
            type="button"
            onClick={() => setShowAddendumForm((v) => !v)}
            className="px-2.5 py-1 rounded-lg bg-indigo-700/70 hover:bg-indigo-600 text-indigo-100 text-xs font-semibold"
          >
            ➕ {t("clinicalNotes.addAddendum", "إضافة ملحق (Addendum)")}
          </button>
        )}

        {isSigned && (
          <button
            type="button"
            onClick={handleVerifyIntegrity}
            disabled={busyAction === "verify"}
            className="px-2.5 py-1 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-200 text-xs font-semibold disabled:opacity-50"
          >
            🛡️ {t("clinicalNotes.verifySignature", "التحقق من السلامة")}
          </button>
        )}
      </div>

      {/* Addendum Creation Drawer */}
      {showAddendumForm && isSigned && (
        <div className="bg-slate-900/70 border border-indigo-500/40 rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-indigo-300">
              {t("clinicalNotes.newAddendumTitle", "ملحق جديد للملاحظة الموقّعة")}
            </span>
            <select
              value={addendumReason}
              onChange={(e) => setAddendumReason(e.target.value)}
              aria-label={t("clinicalNotes.addendumReason", "سبب الملحق")}
              className="rounded-md bg-slate-800 border border-slate-600 text-slate-100 text-xs px-2 py-1"
            >
              {ADDENDUM_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {isArabic ? r.labelAr : r.labelEn}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={addendumContent}
            onChange={(e) => setAddendumContent(e.target.value)}
            placeholder={t(
              "clinicalNotes.addendumPlaceholder",
              "اكتب تفاصيل الملحق السريري هنا...",
            )}
            className="w-full rounded-md bg-slate-800 border border-slate-600 text-slate-100 p-2 text-sm"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddendumForm(false)}
              className="px-3 py-1 rounded-lg bg-slate-700 text-slate-200 text-xs"
            >
              {t("common.cancel", "إلغاء")}
            </button>
            <button
              type="button"
              onClick={handleCreateAddendum}
              disabled={busyAction === "addendum"}
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50"
            >
              {busyAction === "addendum"
                ? t("common.saving", "جارٍ الحفظ...")
                : t("clinicalNotes.saveAddendum", "حفظ الملحق")}
            </button>
          </div>
        </div>
      )}

      {/* Nested Addenda */}
      {note.appendages && note.appendages.length > 0 && (
        <div className="mt-3 space-y-2 border-r-2 border-indigo-500/60 pr-3">
          <div className="text-xs font-bold text-indigo-300">
            {t("clinicalNotes.addendaHeading", "الملاحق السريرية (Addenda)")} (
            {note.appendages.length})
          </div>
          {note.appendages.map((addendum) => {
            const addendumSigned = Boolean(addendum.signedAt);
            const addendumAuthorId =
              addendum.createdById ?? addendum.createdBy?.id;
            const canSignAddendum =
              !addendumSigned &&
              canManageNotes &&
              currentUserId !== undefined &&
              addendumAuthorId === currentUserId;
            return (
              <div
                key={addendum.id}
                className="bg-slate-900/60 border border-slate-700/80 rounded-lg p-3 space-y-1.5"
              >
                <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
                  <span className="font-semibold text-indigo-300">
                    {addendum.createdBy?.fullName ||
                      t("common.unknown", "غير معروف")}
                    {addendum.addendumReason
                      ? ` • ${addendum.addendumReason}`
                      : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      {new Date(addendum.createdAt).toLocaleString()}
                    </span>
                    {addendumSigned ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-900/40 text-emerald-300 border border-emerald-500/40">
                        🔒 {t("clinicalNotes.signedLocked", "موقّع ومقفل")}
                      </span>
                    ) : (
                      canSignAddendum && (
                        <button
                          type="button"
                          onClick={() => handleSign(addendum.id)}
                          disabled={busyAction === `sign-${addendum.id}`}
                          className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold"
                        >
                          ✍️ {t("clinicalNotes.signAddendum", "توقيع الملحق")}
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap">
                  {addendum.content}
                </div>
                {addendumSigned && addendum.signatureHash && (
                  <div className="text-[11px] font-mono text-slate-500">
                    SHA-256: {addendum.signatureHash.slice(0, 12)}…
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
