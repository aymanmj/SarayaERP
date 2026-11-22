import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useIdempotentPost } from "../hooks/useIdempotentPost";
import { useAuthStore } from "../stores/authStore";
import { Money } from "../utils/money";

type Ledger = {
  bankReference: string;
  amount: string;
  unallocatedAmount?: string;
  appliedUnallocated?: string;
  refundedUnallocated?: string;
  pendingRefundUnallocated?: string;
  availableUnallocated?: string;
  allocations: { id: number; invoiceId: number; amount: string; available: string; refunded: string; remainingAfterReceipt?: string }[];
  refunds: {
    id: number; amount: string; unallocatedAmount?: string; status: "PENDING" | "POSTED" | "REJECTED"; reason: string;
    requestedById: number; reviewNote: string | null; bankReference: string | null;
    lines: { allocationId: number; amount: string }[];
  }[];
};
const field = "mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2";
const button = "rounded bg-sky-700 px-3 py-2 disabled:opacity-50";
const MONEY_RE = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/;

export function InsuranceSettlementRefundDialog({ settlementId, onClose, onChange }: {
  settlementId: number;
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const userId = useAuthStore((state) => state.user?.id);
  const dialog = useRef<HTMLDialogElement>(null);
  const url = `/insurance/claims/settlements/${settlementId}/refunds`;
  const request = useIdempotentPost(url);
  const [ledger, setLedger] = useState<Ledger>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<number, string>>({});
  const [unallocatedValue, setUnallocatedValue] = useState("");
  const [reason, setReason] = useState("");
  const [reviewId, setReviewId] = useState<number>();
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const available = ledger?.allocations.filter((item) => Money.decimal(item.available).gt(0)) ?? [];
  const unallocatedAvail = ledger?.availableUnallocated ?? "0.000";
  const hasUnallocatedAvailable = Money.decimal(unallocatedAvail).gt(0);
  const hasUnallocatedInput = unallocatedValue.trim() !== "";
  const lines = available.filter((item) => (values[item.id] ?? "") !== "").map((item) => ({
    allocationId: item.id,
    amount: values[item.id],
    limit: item.available,
  }));
  const linesValid = lines.every((item) =>
    MONEY_RE.test(item.amount) && Money.decimal(item.amount).gt(0) && Money.decimal(item.amount).lte(item.limit));
  const unallocatedValid = !hasUnallocatedInput || (
    MONEY_RE.test(unallocatedValue) && Money.decimal(unallocatedValue).gt(0) && Money.decimal(unallocatedValue).lte(unallocatedAvail));
  const valid = (lines.length > 0 || hasUnallocatedInput) && linesValid && unallocatedValid;
  const hasRequestable = available.length > 0 || hasUnallocatedAvailable;

  useEffect(() => {
    dialog.current?.showModal();
    const abort = new AbortController();
    apiClient.get<Ledger>(url, { signal: abort.signal }).then(({ data }) => setLedger(data)).catch(() => {
      if (!abort.signal.aborted) setFailed(true);
    });
    return () => abort.abort();
  }, [url]);

  const save = async (send: () => Promise<unknown>, reset: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      await send();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      toast.error(typeof message === "string" ? message : t("preAuth.toast.updateFailed"));
      setBusy(false);
      return;
    }
    reset();
    toast.success(t("insuranceClaims.refund.saved"));
    try {
      setLedger((await apiClient.get<Ledger>(url)).data);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      await onChange();
    }
  };

  const resetRequest = () => { setValues({}); setUnallocatedValue(""); setReason(""); };
  const review = (decision: "POST" | "REJECT") => {
    if (reviewId == null || note.trim().length < 5 || (decision === "POST" && (!confirmed || reference.trim().length < 5))) return;
    void save(() => apiClient.post(`${url}/${reviewId}/review`, {
      decision, note: note.trim(), ...(decision === "POST" && { bankReference: reference.trim(), confirmed }),
    }), () => setReviewId(undefined));
  };

  return (
    <dialog ref={dialog} dir={i18n.dir()} aria-labelledby="settlement-refund-title"
      className="m-auto max-h-[85vh] w-[min(94vw,46rem)] space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 backdrop:bg-slate-950/80"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className="flex items-center justify-between gap-3">
        <h2 id="settlement-refund-title" className="text-lg font-bold">{t("insuranceClaims.settlementRefund.title")} <bdi>#{settlementId}</bdi></h2>
        <button type="button" disabled={busy} onClick={onClose}>{t("common.close")}</button>
      </header>
      {failed ? <p role="alert">{t("insuranceClaims.toast.loadFailed")}</p> : ledger ? (
        <>
          <p>{t("insuranceClaims.settlement.reference")} <bdi>{ledger.bankReference} · {ledger.amount}</bdi></p>
          {Money.decimal(ledger.unallocatedAmount ?? 0).gt(0) && (
            <div className="grid gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-sm sm:grid-cols-2">
              <p>{t("insuranceClaims.settlement.unallocatedOriginal")}: <bdi>{ledger.unallocatedAmount}</bdi></p>
              <p>{t("insuranceClaims.refund.unallocatedApplied")}: <bdi>{ledger.appliedUnallocated ?? "0.000"}</bdi></p>
              <p>{t("insuranceClaims.refund.unallocatedRefunded")}: <bdi>{ledger.refundedUnallocated ?? "0.000"}</bdi></p>
              <p>{t("insuranceClaims.refund.unallocatedAvailable")}: <bdi>{unallocatedAvail}</bdi></p>
            </div>
          )}
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (!valid || reason.trim().length < 5 || request.pending) return;
            void save(() => request.submit(url, {
              reason: reason.trim(),
              ...(lines.length > 0 && { lines: lines.map(({ allocationId, amount }) => ({ allocationId, amount })) }),
              ...(hasUnallocatedInput && { unallocatedAmount: unallocatedValue }),
            }), resetRequest);
          }}>
            <fieldset disabled={busy || !!request.pending} className="space-y-3">
              {available.length > 0 && <button className="underline" type="button" onClick={() => {
                setValues(Object.fromEntries(available.map(({ id, available }) => [id, available])));
              }}>{t("insuranceClaims.settlementRefund.allAvailable")}</button>}
              <ul className="space-y-2">
                {ledger.allocations.map((item) => (
                  <li key={item.id} className="grid gap-2 rounded-lg border border-slate-700 p-3 sm:grid-cols-2">
                    <div>
                      <p>{t("insuranceClaims.settlementRefund.invoice")} <bdi>#{item.invoiceId} · {item.amount}</bdi></p>
                      {item.remainingAfterReceipt && Money.decimal(item.remainingAfterReceipt).gt(0) && (
                        <p className="text-sm text-slate-400">{t("insuranceClaims.settlement.remaining")} <bdi>{item.remainingAfterReceipt}</bdi></p>
                      )}
                      <p className="text-sm text-slate-400">{t("insuranceClaims.settlementRefund.available")} <bdi>{item.available}</bdi></p>
                      <p className="text-sm text-slate-400">{t("insuranceClaims.refund.refundedAmount")} <bdi>{item.refunded}</bdi></p>
                    </div>
                    {Money.decimal(item.available).gt(0) && <label>{t("insuranceClaims.settlementRefund.invoiceAmount", { id: item.invoiceId })}
                      <input className={field} inputMode="decimal" dir="ltr" maxLength={19} value={values[item.id] ?? ""}
                        onChange={(event) => setValues({ ...values, [item.id]: event.target.value })} />
                    </label>}
                  </li>
                ))}
              </ul>
              {hasUnallocatedAvailable && (
                <label className="block">
                  {t("insuranceClaims.refund.unallocatedInput")} (<bdi>{unallocatedAvail}</bdi>)
                  <input className={field} inputMode="decimal" dir="ltr" maxLength={19} value={unallocatedValue}
                    onChange={(event) => setUnallocatedValue(event.target.value)} />
                </label>
              )}
              {hasRequestable && <>
                {(lines.length > 0 || hasUnallocatedInput) && <p className="text-sm">{valid
                  ? <>{t("insuranceClaims.refund.amount")} <bdi>{Money.toDbString(Money.sumDecimal(hasUnallocatedInput ? unallocatedValue : "0", ...lines.map((line) => line.amount)))}</bdi></>
                  : t("insuranceClaims.settlementRefund.invalid")}</p>}
                <label className="block">{t("insuranceClaims.refund.reason")}
                  <textarea className={field} required minLength={5} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
                <button className={button} disabled={!valid || reason.trim().length < 5}>{t("insuranceClaims.refund.request")}</button>
              </>}
            </fieldset>
            {request.pending && <button type="button" className={button} disabled={busy} onClick={() => void save(request.retry, resetRequest)}>
              {t("insuranceClaims.refund.retry")}
            </button>}
          </form>
          {ledger.refunds.map((refund) => (
            <section key={refund.id} className="space-y-2 rounded-lg border border-slate-700 p-3">
              <h3><bdi>#{refund.id} · {Money.toDbString(refund.amount)}</bdi> · {t(`insuranceClaims.refund.${refund.status}`)}</h3>
              <ul>
                {Money.decimal(refund.unallocatedAmount ?? 0).gt(0) && (
                  <li>{t("insuranceClaims.refund.unallocatedTag")} · <bdi>{Money.toDbString(refund.unallocatedAmount ?? 0)}</bdi></li>
                )}
                {refund.lines.map((line) => <li key={line.allocationId}>
                  {t("insuranceClaims.settlementRefund.invoice")} <bdi>#{ledger.allocations.find((item) => item.id === line.allocationId)?.invoiceId} · {Money.toDbString(line.amount)}</bdi>
                </li>)}
              </ul>
              <p className="break-words">{refund.reason}</p>
              {refund.reviewNote && <p className="break-words">{refund.reviewNote}</p>}
              {refund.bankReference && <p>{t("insuranceClaims.refund.bankReference")} <bdi>{refund.bankReference}</bdi></p>}
              {refund.status === "PENDING" && userId != null && userId !== refund.requestedById && (
                reviewId === refund.id ? <fieldset disabled={busy} className="space-y-2">
                  <label className="block">{t("insuranceClaims.refund.reviewNote")}
                    <textarea className={field} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
                  </label>
                  <label className="block">{t("insuranceClaims.refund.bankReference")}
                    <input className={field} dir="ltr" maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} />
                  </label>
                  <label className="flex gap-2 text-sm">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                    {t("insuranceClaims.refund.confirmed")}
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className={button} disabled={!confirmed || note.trim().length < 5 || reference.trim().length < 5} onClick={() => review("POST")}>{t("insuranceClaims.refund.post")}</button>
                    <button type="button" disabled={note.trim().length < 5} onClick={() => review("REJECT")}>{t("insuranceClaims.refund.reject")}</button>
                  </div>
                </fieldset> : <button type="button" className={button} disabled={busy} onClick={() => {
                  setReviewId(refund.id); setNote(""); setReference(""); setConfirmed(false);
                }}>{t("insuranceClaims.refund.review")}</button>
              )}
            </section>
          ))}
        </>
      ) : <p role="status">{t("common.loading")}</p>}
    </dialog>
  );
}
