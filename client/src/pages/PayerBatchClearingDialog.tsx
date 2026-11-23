import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useIdempotentPost } from "../hooks/useIdempotentPost";
import { Money } from "../utils/money";

const MONEY_RE = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/;
const RATE_RE = /^0(\.\d{1,4})?$|^1(\.0{1,4})?$/;

type BatchClaim = {
  id: number;
  claimNumber: string;
  status: string;
  claimedAmount: string | number;
  denialCode?: string | null;
};

type GatewayFeeSummary = {
  id: number;
  b2bInvoiceNumber: string;
  totalFeeAmount: string | number;
  flatFeeTotal: string | number;
  percentageFeeTotal: string | number;
  status: "ACCRUED" | "SETTLED";
  settlementBankReference?: string | null;
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
  gatewayFeeEntry?: GatewayFeeSummary | null;
  claims: BatchClaim[];
};

type BankStatementLineItem = {
  id: number;
  bankName: string;
  bankReference: string;
  direction: "CREDIT" | "DEBIT";
  amount: string | number;
  status: "UNMATCHED" | "MATCHED";
  matchedEra?: { id: number; eraNumber: string } | null;
  matchedFeeEntry?: { id: number; b2bInvoiceNumber: string } | null;
};

function BankLineCard({
  line,
  busy,
  onRun,
}: {
  line: BankStatementLineItem;
  busy: boolean;
  onRun: (action: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const reconcileUrl = `/rcm/claims/bank-statements/${line.id}/reconcile`;
  const reconcileHook = useIdempotentPost(reconcileUrl);
  const [targetId, setTargetId] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const targetType = line.direction === "CREDIT" ? "ERA" : "GATEWAY_FEE";
  const parsedTargetId = Number(targetId);
  const canReconcile =
    line.status === "UNMATCHED" &&
    Number.isInteger(parsedTargetId) &&
    parsedTargetId > 0 &&
    confirmed;

  return (
    <div className="space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <bdi className="font-mono font-bold text-slate-200">
            {line.bankReference}
          </bdi>{" "}
          · {line.bankName} ·{" "}
          <bdi className="font-bold">{Money.toFixed(line.amount)}</bdi> (
          {line.direction})
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-0.5 font-bold">
          {t(`insuranceClaims.clearinghouse.bankStatus_${line.status}`)}
        </span>
      </div>

      {line.status === "UNMATCHED" && (
        <form
          className="flex flex-wrap items-end gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canReconcile || reconcileHook.pending) return;
            void onRun(
              () =>
                reconcileHook.submit(reconcileUrl, {
                  targetType,
                  targetId: parsedTargetId,
                  confirmed,
                }),
              t("insuranceClaims.clearinghouse.bankReconciledMsg"),
            );
          }}
        >
          <label className="flex flex-col gap-1">
            {t("insuranceClaims.clearinghouse.bankTargetLabel")} ({targetType})
            <input
              dir="ltr"
              type="number"
              min={1}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t("insuranceClaims.clearinghouse.bankReconcileConfirmed")}
          </label>
          <button
            disabled={busy || !canReconcile || !!reconcileHook.pending}
            className="rounded bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-50"
          >
            {t("insuranceClaims.clearinghouse.reconcileBankBtn")}
          </button>
        </form>
      )}
    </div>
  );
}

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
  const accrueFeeUrl = `/rcm/claims/batches/${batch.id}/gateway-fee`;
  const settleFeeUrl = `/rcm/claims/gateway-fees/${batch.gatewayFeeEntry?.id ?? 0}/settle`;
  const exportFhirUrl = `/rcm/claims/batches/${batch.id}/fhir-bundle`;

  const submitHook = useIdempotentPost(submitUrl);
  const adjudicateHook = useIdempotentPost(adjudicateUrl);
  const accrueFeeHook = useIdempotentPost(accrueFeeUrl);
  const settleFeeHook = useIdempotentPost(settleFeeUrl);
  const exportFhirHook = useIdempotentPost(exportFhirUrl);

  const [fhirSignature, setFhirSignature] = useState<string | null>(null);

  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [denialCodes, setDenialCodes] = useState<Record<number, string>>({});
  const [denialReasons, setDenialReasons] = useState<Record<number, string>>({});

  const [flatFeePerClaim, setFlatFeePerClaim] = useState("2.000");
  const [feeRate, setFeeRate] = useState("0.0050");
  const [feeConfirmed, setFeeConfirmed] = useState(false);

  const [feeBankRef, setFeeBankRef] = useState("");
  const [feeSettleConfirmed, setFeeSettleConfirmed] = useState(false);

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

  const canAccrueFee =
    batch.status === "CLOSED" &&
    !batch.gatewayFeeEntry &&
    MONEY_RE.test(flatFeePerClaim.trim()) &&
    RATE_RE.test(feeRate.trim()) &&
    !Money.decimal(feeRate.trim()).gt(Money.decimal("0.2500")) &&
    feeConfirmed;

  const canSettleFee =
    batch.gatewayFeeEntry?.status === "ACCRUED" &&
    feeBankRef.trim().length >= 5 &&
    feeSettleConfirmed;

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

      {(batch.status === "SUBMITTED" || batch.status === "CLOSED") && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs">
          <button
            type="button"
            disabled={busy || !!exportFhirHook.pending}
            onClick={() =>
              void onRun(async () => {
                const res = (await exportFhirHook.submit(exportFhirUrl, {})) as {
                  data?: { hmacSignature?: string };
                };
                if (res?.data?.hmacSignature) {
                  setFhirSignature(res.data.hmacSignature);
                }
              }, t("insuranceClaims.clearinghouse.fhirExportedMsg"))
            }
            className="rounded border border-sky-500/40 bg-sky-950/50 px-3 py-1.5 font-bold text-sky-200 disabled:opacity-50"
          >
            {t("insuranceClaims.clearinghouse.exportFhirBtn")}
          </button>
          {fhirSignature && (
            <span className="font-mono text-[11px] text-sky-300">
              {t("insuranceClaims.clearinghouse.fhirSignatureLabel")}:{" "}
              <bdi>{fhirSignature.slice(0, 23)}…</bdi>
            </span>
          )}
        </div>
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

      {batch.status === "CLOSED" && !batch.gatewayFeeEntry && (
        <form
          className="space-y-2 border-t border-slate-800 pt-3 text-xs"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canAccrueFee || accrueFeeHook.pending) return;
            void onRun(
              () =>
                accrueFeeHook.submit(accrueFeeUrl, {
                  flatFeePerClaim: flatFeePerClaim.trim(),
                  feeRate: feeRate.trim(),
                  confirmed: feeConfirmed,
                }),
              t("insuranceClaims.clearinghouse.feeAccruedMsg"),
            );
          }}
        >
          <fieldset
            disabled={busy || !!accrueFeeHook.pending}
            className="space-y-2"
          >
            <div className="grid gap-2 md:grid-cols-2">
              <label className="block">
                {t("insuranceClaims.clearinghouse.flatFeeLabel")}
                <input
                  dir="ltr"
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1.5"
                  value={flatFeePerClaim}
                  onChange={(e) => setFlatFeePerClaim(e.target.value)}
                />
              </label>
              <label className="block">
                {t("insuranceClaims.clearinghouse.feeRateLabel")}
                <input
                  dir="ltr"
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1.5"
                  value={feeRate}
                  onChange={(e) => setFeeRate(e.target.value)}
                />
              </label>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={feeConfirmed}
                onChange={(e) => setFeeConfirmed(e.target.checked)}
              />
              {t("insuranceClaims.clearinghouse.feeConfirmed")}
            </label>
            <button
              disabled={!canAccrueFee}
              className="rounded bg-indigo-700 px-3 py-2 font-bold text-white disabled:opacity-50"
            >
              {t("insuranceClaims.clearinghouse.accrueFeeBtn")}
            </button>
          </fieldset>
        </form>
      )}

      {batch.gatewayFeeEntry && (
        <div className="space-y-2 border-t border-slate-800 pt-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-indigo-500/30 bg-indigo-950/30 px-3 py-2 text-indigo-200">
            <div>
              {t("insuranceClaims.clearinghouse.b2bInvoiceLabel")}:{" "}
              <bdi className="font-mono font-bold">
                {batch.gatewayFeeEntry.b2bInvoiceNumber}
              </bdi>{" "}
              ·{" "}
              <bdi className="font-bold">
                {Money.toFixed(batch.gatewayFeeEntry.totalFeeAmount)}
              </bdi>
              {batch.gatewayFeeEntry.settlementBankReference && (
                <>
                  {" "}
                  ·{" "}
                  <bdi className="font-mono">
                    {batch.gatewayFeeEntry.settlementBankReference}
                  </bdi>
                </>
              )}
            </div>
            <span className="rounded-full border border-indigo-500/40 bg-indigo-950 px-2.5 py-0.5 font-bold">
              {t(
                `insuranceClaims.clearinghouse.feeStatus_${batch.gatewayFeeEntry.status}`,
              )}
            </span>
          </div>

          {batch.gatewayFeeEntry.status === "ACCRUED" && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSettleFee || settleFeeHook.pending) return;
                void onRun(
                  () =>
                    settleFeeHook.submit(settleFeeUrl, {
                      bankReference: feeBankRef.trim(),
                      confirmed: feeSettleConfirmed,
                    }),
                  t("insuranceClaims.clearinghouse.feeSettledMsg"),
                );
              }}
            >
              <fieldset
                disabled={busy || !!settleFeeHook.pending}
                className="space-y-2"
              >
                <label className="block">
                  {t("insuranceClaims.clearinghouse.feeBankReference")}
                  <input
                    dir="ltr"
                    minLength={5}
                    maxLength={200}
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-1.5"
                    value={feeBankRef}
                    onChange={(e) => setFeeBankRef(e.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={feeSettleConfirmed}
                    onChange={(e) => setFeeSettleConfirmed(e.target.checked)}
                  />
                  {t("insuranceClaims.clearinghouse.feeSettleConfirmed")}
                </label>
                <button
                  disabled={!canSettleFee}
                  className="rounded bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-50"
                >
                  {t("insuranceClaims.clearinghouse.settleFeeBtn")}
                </button>
              </fieldset>
            </form>
          )}
        </div>
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
  const [bankLines, setBankLines] = useState<BankStatementLineItem[]>([]);
  const [showBankPanel, setShowBankPanel] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createProviderId, setCreateProviderId] = useState<string>(() =>
    String(initialProviderId ?? providers[0]?.id ?? ""),
  );

  const importBankUrl = "/rcm/claims/bank-statements/import";
  const importBankHook = useIdempotentPost(importBankUrl);
  const [bankName, setBankName] = useState("مصرف الجمهورية");
  const [bankReference, setBankReference] = useState("");
  const [bankDirection, setBankDirection] = useState<"CREDIT" | "DEBIT">(
    "CREDIT",
  );
  const [bankAmount, setBankAmount] = useState("");

  const queryParams = initialProviderId
    ? { providerId: String(initialProviderId) }
    : undefined;

  const reloadBatches = async () => {
    const [batchRes, bankRes] = await Promise.all([
      apiClient.get<ClaimBatchItem[]>("/rcm/claims/batches", {
        params: queryParams,
      }),
      apiClient
        .get<BankStatementLineItem[]>("/rcm/claims/bank-statements")
        .catch(() => ({ data: [] as BankStatementLineItem[] })),
    ]);
    setBatches(Array.isArray(batchRes?.data) ? batchRes.data : []);
    setBankLines(Array.isArray(bankRes?.data) ? bankRes.data : []);
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

  const canImportBankLine =
    bankName.trim().length >= 3 &&
    bankReference.trim().length >= 5 &&
    MONEY_RE.test(bankAmount.trim()) &&
    Money.decimal(bankAmount.trim()).gt(0);

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const next = !showBankPanel;
              setShowBankPanel(next);
              if (next) {
                void apiClient
                  .get<BankStatementLineItem[]>("/rcm/claims/bank-statements")
                  .then((res) =>
                    setBankLines(Array.isArray(res?.data) ? res.data : []),
                  )
                  .catch(() => {});
              }
            }}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold"
          >
            {t("insuranceClaims.clearinghouse.bankStatementToggle")}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </header>

      {showBankPanel && (
        <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-xs">
          <form
            className="grid gap-2 md:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canImportBankLine || importBankHook.pending) return;
              void handleRun(
                () =>
                  importBankHook.submit(importBankUrl, {
                    bankName: bankName.trim(),
                    lines: [
                      {
                        bankReference: bankReference.trim(),
                        direction: bankDirection,
                        amount: bankAmount.trim(),
                      },
                    ],
                  }),
                t("insuranceClaims.clearinghouse.bankImportedMsg"),
              );
            }}
          >
            <label className="flex flex-col gap-1">
              {t("insuranceClaims.clearinghouse.bankNameLabel")}
              <input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              {t("insuranceClaims.era.bankReference")}
              <input
                dir="ltr"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              Direction
              <select
                value={bankDirection}
                onChange={(e) =>
                  setBankDirection(e.target.value as "CREDIT" | "DEBIT")
                }
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
              >
                <option value="CREDIT">
                  {t("insuranceClaims.clearinghouse.bankDirectionCredit")}
                </option>
                <option value="DEBIT">
                  {t("insuranceClaims.clearinghouse.bankDirectionDebit")}
                </option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              {t("insuranceClaims.clearinghouse.bankAmountLabel")}
              <input
                dir="ltr"
                value={bankAmount}
                onChange={(e) => setBankAmount(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
              />
            </label>
            <div className="flex items-end">
              <button
                disabled={busy || !canImportBankLine}
                className="w-full rounded bg-sky-700 px-3 py-1.5 font-bold text-white disabled:opacity-50"
              >
                {t("insuranceClaims.clearinghouse.importBankBtn")}
              </button>
            </div>
          </form>

          {bankLines.length > 0 && (
            <div className="space-y-2">
              {bankLines.map((line) => (
                <BankLineCard
                  key={line.id}
                  line={line}
                  busy={busy}
                  onRun={handleRun}
                />
              ))}
            </div>
          )}
        </section>
      )}

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
