import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useIdempotentPost } from "../hooks/useIdempotentPost";
import { Money } from "../utils/money";

type EraLineItem = {
  id: number;
  claimId: number | null;
  receiptId: number | null;
  claimNumber: string;
  billedAmount: string | number;
  paidAmount: string | number;
  adjustmentAmount?: string | number | null;
  adjustmentCode?: string | null;
  denialCode?: string | null;
  denialReason?: string | null;
  status: "MATCHED" | "UNDERPAID" | "DENIED" | "UNMATCHED";
};

type EraTransaction = {
  id: number;
  eraNumber: string;
  insuranceProvider?: { id: number; name: string; code: string };
  totalPaid: string | number;
  totalClaims: number;
  bankReference: string | null;
  status: "RECEIVED" | "PROCESSING" | "RECONCILED" | "DISCREPANCY";
  lineItems: EraLineItem[];
};

const field = "mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2";
const button = "rounded bg-sky-700 px-3 py-2 disabled:opacity-50";

function EraCard({
  era,
  busy,
  onRun,
}: {
  era: EraTransaction;
  busy: boolean;
  onRun: (action: () => Promise<unknown>, onSuccess: () => void) => Promise<void>;
}) {
  const { t } = useTranslation();
  const url = `/rcm/claims/era/${era.id}/post`;
  const postHook = useIdempotentPost(url);
  const [bankReference, setBankReference] = useState(era.bankReference ?? "");
  const [confirmed, setConfirmed] = useState(false);

  const hasUnmatched = era.lineItems.some(
    (line) => !line.claimId || line.status === "UNMATCHED",
  );
  const canPost =
    era.status !== "RECONCILED" &&
    !hasUnmatched &&
    era.lineItems.length > 0 &&
    bankReference.trim().length >= 5 &&
    confirmed;

  return (
    <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-100">
            {t("insuranceClaims.era.eraNumber")}: <bdi>{era.eraNumber}</bdi>
          </h3>
          <p className="text-xs text-slate-400">
            {era.insuranceProvider?.name ?? "-"} ·{" "}
            {t("insuranceClaims.era.totalPaid")}:{" "}
            <bdi>{Money.toFixed(era.totalPaid)}</bdi> ·{" "}
            {t("insuranceClaims.era.lineCount")}: <bdi>{era.totalClaims}</bdi>
          </p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-bold">
          {t(`insuranceClaims.era.${era.status}`)}
        </span>
      </div>

      <ul className="space-y-1 text-xs">
        {era.lineItems.map((line) => (
          <li
            key={line.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/60 px-3 py-2"
          >
            <div>
              <bdi className="font-mono font-bold text-slate-200">
                {line.claimNumber}
              </bdi>{" "}
              · {t(`insuranceClaims.era.${line.status}`)}
              {line.adjustmentCode && ` (${line.adjustmentCode})`}
              {line.denialCode && ` (${line.denialCode})`}
            </div>
            <div className="flex items-center gap-3">
              <span>
                <bdi>{Money.toFixed(line.paidAmount)}</bdi> /{" "}
                <bdi>{Money.toFixed(line.billedAmount)}</bdi>
              </span>
              {line.receiptId != null && (
                <span className="text-emerald-300">
                  {t("insuranceClaims.era.receipt")} <bdi>#{line.receiptId}</bdi>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {era.bankReference && era.status === "RECONCILED" && (
        <p className="text-xs text-emerald-300">
          {t("insuranceClaims.era.bankReference")}:{" "}
          <bdi>{era.bankReference}</bdi>
        </p>
      )}

      {era.status !== "RECONCILED" && hasUnmatched && (
        <p className="text-xs text-amber-300" role="alert">
          {t("insuranceClaims.era.unmatchedWarning")}
        </p>
      )}

      {era.status !== "RECONCILED" && !hasUnmatched && (
        <form
          className="space-y-2 border-t border-slate-800 pt-3 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canPost || postHook.pending) return;
            void onRun(
              () =>
                postHook.submit(url, {
                  bankReference: bankReference.trim(),
                  confirmed,
                }),
              () => setConfirmed(false),
            );
          }}
        >
          <fieldset
            disabled={busy || !!postHook.pending}
            className="space-y-2"
          >
            <label className="block">
              {t("insuranceClaims.era.bankReference")}
              <input
                className={field}
                dir="ltr"
                required
                minLength={5}
                maxLength={200}
                value={bankReference}
                onChange={(event) => setBankReference(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {t("insuranceClaims.era.confirmed")}
            </label>
            <button className={button} disabled={!canPost}>
              {t("insuranceClaims.era.postBtn")}
            </button>
          </fieldset>
          {postHook.pending && (
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() =>
                void onRun(postHook.retry, () => setConfirmed(false))
              }
            >
              {t("insuranceClaims.era.retry")}
            </button>
          )}
        </form>
      )}
    </section>
  );
}

export function EraReconciliationDialog({
  providerId,
  onClose,
  onChange,
}: {
  providerId?: number;
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [eras, setEras] = useState<EraTransaction[]>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const queryParams = providerId ? { providerId: String(providerId) } : undefined;

  useEffect(() => {
    dialog.current?.showModal();
    const abort = new AbortController();
    apiClient
      .get<EraTransaction[]>("/rcm/claims/era", {
        params: queryParams,
        signal: abort.signal,
      })
      .then(({ data }) => setEras(Array.isArray(data) ? data : []))
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  const handleRun = async (
    action: () => Promise<unknown>,
    onSuccess: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const message = (
        error as { response?: { data?: { message?: unknown } } }
      ).response?.data?.message;
      toast.error(
        typeof message === "string"
          ? message
          : t("preAuth.toast.updateFailed"),
      );
      setBusy(false);
      return;
    }
    onSuccess();
    toast.success(t("insuranceClaims.era.saved"));
    try {
      const { data } = await apiClient.get<EraTransaction[]>("/rcm/claims/era", {
        params: queryParams,
      });
      setEras(Array.isArray(data) ? data : []);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      await onChange();
    }
  };

  return (
    <dialog
      ref={dialog}
      dir={i18n.dir()}
      aria-labelledby="era-reconciliation-title"
      className="m-auto max-h-[85vh] w-[min(94vw,52rem)] space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 backdrop:bg-slate-950/80"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="era-reconciliation-title" className="text-lg font-bold">
          {t("insuranceClaims.era.title")}
        </h2>
        <button type="button" disabled={busy} onClick={onClose}>
          {t("common.close")}
        </button>
      </header>
      {failed ? (
        <p role="alert">{t("insuranceClaims.toast.loadFailed")}</p>
      ) : eras ? (
        eras.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t("insuranceClaims.era.empty")}
          </p>
        ) : (
          <div className="space-y-4">
            {eras.map((era) => (
              <EraCard key={era.id} era={era} busy={busy} onRun={handleRun} />
            ))}
          </div>
        )
      ) : (
        <p role="status">{t("common.loading")}</p>
      )}
    </dialog>
  );
}
