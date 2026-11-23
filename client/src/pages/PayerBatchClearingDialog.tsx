import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useIdempotentPost } from "../hooks/useIdempotentPost";
import { Money } from "../utils/money";

const MONEY_RE = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/;

type BatchClaim = {
  id: number;
  claimNumber: string;
  status: string;
  claimedAmount: string | number;
  denialCode?: string | null;
};

type ClaimBatchItem = {
  id: number;
  batchNumber: string;
  clearingChannel: string;
  status: "OPEN" | "SUBMITTED" | "CLOSED";
  totalClaims: number;
  totalAmount: string | number;
  approvedAmount?: string | number | null;
  rejectedClaimsCount?: number;
  provider?: { id: number; name: string; code: string };
  eraTransaction?: {
    id: number;
    eraNumber: string;
    status: string;
    totalPaid: string | number;
  } | null;
  claims: BatchClaim[];
};

function BatchCard({
  batch,
  busy,
  onRun,
}: {
  batch: ClaimBatchItem;
  busy: boolean;
  onRun: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const submitUrl = `/rcm/claims/batches/${batch.id}/submit`;
  const adjudicateUrl = `/rcm/claims/batches/${batch.id}/adjudicate`;
  const submitHook = useIdempotentPost(submitUrl);
  const adjudicateHook = useIdempotentPost(adjudicateUrl);

  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [denialCodes, setDenialCodes] = useState<Record<number, string>>({});
  const [denialReasons, setDenialReasons] = useState<Record<number, string>>({});

  const amountValue = (claim: BatchClaim) =>
    amounts[claim.id] ?? Money.toFixed(claim.claimedAmount);

  const validDecisions = batch.claims.every((claim) => {
    const val = amountValue(claim).trim();
    if (!MONEY_RE.test(val)) return false;
    const dec = Money.decimal(val);
    if (dec.gt(Money.decimal(claim.claimedAmount))) return false;
    if (dec.isZero() && (denialCodes[claim.id] ?? "").trim().length < 2) {
      return false;
    }
    return true;
  });

  return (
    <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-100">
            {t("insuranceClaims.clearinghouse.batchNumber")}:{" "}
            <bdi>{batch.batchNumber}</bdi>
          </h3>
          <p className="text-xs text-slate-400">
            {batch.provider?.name ?? "-"} ·{" "}
            {t("insuranceClaims.clearinghouse.totalAmount")}:{" "}
            <bdi>{Money.toFixed(batch.totalAmount)}</bdi> ·{" "}
            {t("insuranceClaims.era.lineCount")}: <bdi>{batch.totalClaims}</bdi>{" "}
            · <bdi>{batch.clearingChannel}</bdi>
          </p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-bold">
          {t(`insuranceClaims.clearinghouse.status_${batch.status}`)}
        </span>
      </div>

      {batch.eraTransaction && (
        <p className="rounded border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
          {t("insuranceClaims.clearinghouse.generatedEra")}:{" "}
          <bdi className="font-bold">{batch.eraTransaction.eraNumber}</bdi> (
          <bdi>{Money.toFixed(batch.eraTransaction.totalPaid)}</bdi>)
        </p>
      )}

      {batch.status === "OPEN" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3 text-xs">
          <button
            type="button"
            disabled={busy || !!submitHook.pending}
            onClick={() =>
              void onRun(
                () =>
                  submitHook.submit(submitUrl, {
                    channel: "LOCAL_CLEARINGHOUSE",
                  }),
                t("insuranceClaims.clearinghouse.submittedMsg"),
              )
            }
            className="rounded bg-sky-700 px-3 py-2 font-bold text-white disabled:opacity-50"
          >
            {t("insuranceClaims.clearinghouse.submitBtn")}
          </button>
          {submitHook.pending && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void onRun(
                  submitHook.retry,
                  t("insuranceClaims.clearinghouse.submittedMsg"),
                )
              }
              className="rounded bg-amber-700 px-3 py-2 font-bold text-white disabled:opacity-50"
            >
              {t("insuranceClaims.clearinghouse.retry")}
            </button>
          )}
        </div>
      )}

      {batch.status === "SUBMITTED" && (
        <form
          className="space-y-3 border-t border-slate-800 pt-3 text-xs"
          onSubmit={(event) => {
            event.preventDefault();
            if (!validDecisions || adjudicateHook.pending) return;
            const decisions = batch.claims.map((claim) => {
              const approvedAmount = amountValue(claim).trim();
              const isZero = Money.decimal(approvedAmount).isZero();
              return {
                claimId: claim.id,
                approvedAmount,
                ...(isZero
                  ? {
                      denialCode: (denialCodes[claim.id] ?? "").trim(),
                      denialReason:
                        (denialReasons[claim.id] ?? "").trim() || undefined,
                    }
                  : {}),
              };
            });
            void onRun(
              () => adjudicateHook.submit(adjudicateUrl, { decisions }),
              t("insuranceClaims.clearinghouse.adjudicatedMsg"),
            );
          }}
        >
          <fieldset
            disabled={busy || !!adjudicateHook.pending}
            className="space-y-2"
          >
            {batch.claims.map((claim) => {
              const rawVal = amountValue(claim);
              const val = rawVal.trim();
              const isZero = MONEY_RE.test(val) && Money.decimal(val).isZero();
              return (
                <div
                  key={claim.id}
                  className="grid gap-2 rounded border border-slate-800 bg-slate-900/60 p-2 md:grid-cols-3"
                >
                  <div>
                    <div className="font-mono font-bold text-slate-200">
                      <bdi>{claim.claimNumber}</bdi>
                    </div>
                    <div className="text-slate-400">
                      <bdi>{Money.toFixed(claim.claimedAmount)}</bdi>
                    </div>
                  </div>
                  <label className="block">
                    {t("insuranceClaims.clearinghouse.approvedAmount")}
                    <input
                      aria-label={`${t("insuranceClaims.clearinghouse.approvedAmount")} ${claim.claimNumber}`}
                      dir="ltr"
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1.5"
                      value={rawVal}
                      onChange={(e) =>
                        setAmounts((prev) => ({
                          ...prev,
                          [claim.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                  {isZero && (
                    <div className="space-y-1">
                      <label className="block">
                        {t("insuranceClaims.clearinghouse.denialCode")}
                        <input
                          aria-label={`${t("insuranceClaims.clearinghouse.denialCode")} ${claim.claimNumber}`}
                          dir="ltr"
                          required
                          minLength={2}
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1.5"
                          value={denialCodes[claim.id] ?? ""}
                          onChange={(e) =>
                            setDenialCodes((prev) => ({
                              ...prev,
                              [claim.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <input
                        placeholder={t(
                          "insuranceClaims.clearinghouse.denialReason",
                        )}
                        className="w-full rounded border border-slate-700 bg-slate-950 p-1.5"
                        value={denialReasons[claim.id] ?? ""}
                        onChange={(e) =>
                          setDenialReasons((prev) => ({
                            ...prev,
                            [claim.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <button
              className="rounded bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-50"
              disabled={!validDecisions}
            >
              {t("insuranceClaims.clearinghouse.adjudicateBtn")}
            </button>
          </fieldset>
          {adjudicateHook.pending && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void onRun(
                  adjudicateHook.retry,
                  t("insuranceClaims.clearinghouse.adjudicatedMsg"),
                )
              }
              className="rounded bg-amber-700 px-3 py-2 font-bold text-white disabled:opacity-50"
            >
              {t("insuranceClaims.clearinghouse.retry")}
            </button>
          )}
        </form>
      )}
    </section>
  );
}

export function PayerBatchClearingDialog({
  providers,
  initialProviderId,
  onClose,
  onChange,
}: {
  providers: Array<{ id: number; name: string }>;
  initialProviderId?: number;
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [batches, setBatches] = useState<ClaimBatchItem[]>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createProviderId, setCreateProviderId] = useState<string>(() =>
    String(initialProviderId ?? providers[0]?.id ?? ""),
  );

  const queryParams = initialProviderId
    ? { providerId: String(initialProviderId) }
    : undefined;

  const reloadBatches = async () => {
    const { data } = await apiClient.get<ClaimBatchItem[]>(
      "/rcm/claims/batches",
      { params: queryParams },
    );
    setBatches(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    dialog.current?.showModal();
    const abort = new AbortController();
    apiClient
      .get<ClaimBatchItem[]>("/rcm/claims/batches", {
        params: queryParams,
        signal: abort.signal,
      })
      .then(({ data }) => setBatches(Array.isArray(data) ? data : []))
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProviderId]);

  const handleRun = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(message);
      await reloadBatches();
      await onChange();
    } catch (error) {
      const errMsg = (
        error as { response?: { data?: { message?: unknown } } }
      ).response?.data?.message;
      toast.error(
        typeof errMsg === "string"
          ? errMsg
          : t("preAuth.toast.updateFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      dir={i18n.dir()}
      aria-labelledby="payer-clearinghouse-title"
      className="m-auto max-h-[85vh] w-[min(94vw,54rem)] space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 backdrop:bg-slate-950/80"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="payer-clearinghouse-title" className="text-lg font-bold">
          {t("insuranceClaims.clearinghouse.title")}
        </h2>
        <button type="button" disabled={busy} onClick={onClose}>
          {t("common.close")}
        </button>
      </header>

      {providers.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
          <label className="flex flex-col gap-1">
            {t("insuranceClaims.clearinghouse.providerSelect")}
            <select
              value={createProviderId}
              onChange={(e) => setCreateProviderId(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !createProviderId}
            onClick={() =>
              void handleRun(
                () =>
                  apiClient.post("/rcm/claims/batches", {
                    providerId: Number(createProviderId),
                  }),
                t("insuranceClaims.clearinghouse.createdMsg"),
              )
            }
            className="rounded bg-sky-700 px-3 py-2 font-bold text-white disabled:opacity-50"
          >
            {t("insuranceClaims.clearinghouse.createBtn")}
          </button>
        </div>
      )}

      {failed ? (
        <p role="alert">{t("insuranceClaims.toast.loadFailed")}</p>
      ) : batches ? (
        batches.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t("insuranceClaims.clearinghouse.empty")}
          </p>
        ) : (
          <div className="space-y-4">
            {batches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                busy={busy}
                onRun={handleRun}
              />
            ))}
          </div>
        )
      ) : (
        <p role="status">{t("common.loading")}</p>
      )}
    </dialog>
  );
}
