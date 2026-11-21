import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useIdempotentPost } from "../hooks/useIdempotentPost";
import { useAuthStore } from "../stores/authStore";
import { Money } from "../utils/money";

type Refund = {
  id: number;
  receiptId: number;
  amount: string;
  reason: string;
  requestedById: number;
  status: "PENDING" | "POSTED" | "REJECTED";
  reviewNote: string | null;
  bankReference: string | null;
};
type Ledger = {
  grossAmount: string;
  refundedAmount: string;
  netAmount: string;
  receipts: { id: number; amount: string; availableAmount: string }[];
  refunds: Refund[];
};
const field = "mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2";
const action = "rounded bg-sky-700 px-3 py-2 disabled:opacity-50";

export function ClaimReceiptRefundDialog({ invoiceId, onClose, onChange }: {
  invoiceId: number;
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const userId = useAuthStore((state) => state.user?.id);
  const dialog = useRef<HTMLDialogElement>(null);
  const url = `/insurance/claims/${invoiceId}/receipt-refunds`;
  const request = useIdempotentPost(url);
  const [ledger, setLedger] = useState<Ledger>();
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [receiptId, setReceiptId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reviewId, setReviewId] = useState<number>();
  const [note, setNote] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<Ledger>(url, { signal: controller.signal }).then(({ data }) => {
      setLedger(data);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadFailed(true);
    });
    return () => controller.abort();
  }, [url]);

  const receipts = ledger?.receipts.filter((receipt) => Money.decimal(receipt.availableAmount).gt(0)) ?? [];
  const selected = receipts.find((receipt) => String(receipt.id) === receiptId);
  const validAmount = selected && /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(amount) &&
    Money.decimal(amount).gt(0) && !Money.decimal(amount).gt(selected.availableAmount);

  const save = async (send: () => Promise<unknown>, reset: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      await send();
      reset();
      toast.success(t("insuranceClaims.refund.saved"));
      try {
        setLedger((await apiClient.get<Ledger>(url)).data);
      } catch {
        setLoadFailed(true);
      }
      await onChange();
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      toast.error(typeof message === "string" ? message : t("preAuth.toast.updateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const review = (decision: "POST" | "REJECT") => {
    if (reviewId == null || note.trim().length < 5 || (decision === "POST" && (!confirmed || bankReference.trim().length < 5))) return;
    void save(() => apiClient.post(`${url}/${reviewId}/review`, {
      decision, note: note.trim(), ...(decision === "POST" && { bankReference: bankReference.trim(), confirmed }),
    }), () => setReviewId(undefined));
  };

  return (
    <dialog ref={dialog} dir={i18n.dir()} aria-labelledby="claim-receipt-refund-title"
      className="m-auto max-h-[85vh] w-[min(92vw,44rem)] space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 backdrop:bg-slate-950/80"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className="flex items-center justify-between gap-3">
        <h2 id="claim-receipt-refund-title" className="text-lg font-bold">
          {t("insuranceClaims.refund.title")} <bdi>#{invoiceId}</bdi>
        </h2>
        <button type="button" disabled={busy} onClick={onClose}>{t("common.close")}</button>
      </header>
      {loadFailed ? <p role="alert">{t("insuranceClaims.toast.loadFailed")}</p> : ledger ? (
        <>
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-slate-950 p-3 text-sm">
            {(["grossAmount", "refundedAmount", "netAmount"] as const).map((key) => (
              <div key={key}><dt>{t(`insuranceClaims.refund.${key}`)}</dt><dd dir="ltr">{ledger[key]}</dd></div>
            ))}
          </dl>
          {receipts.length > 0 && (
            <form className="space-y-3" onSubmit={(event) => {
              event.preventDefault();
              if (!selected || !validAmount || reason.trim().length < 5 || busy) return;
              void save(() => request.submit(url, { receiptId: selected.id, amount, reason: reason.trim() }), () => {
                setAmount("");
                setReason("");
                setReceiptId("");
              });
            }}>
              <fieldset disabled={busy || !!request.pending} className="space-y-2">
                <label className="block">{t("insuranceClaims.refund.receipt")}
                  <select className={field} value={receiptId} required onChange={(event) => setReceiptId(event.target.value)}>
                    <option value="">{t("insuranceClaims.refund.chooseReceipt")}</option>
                    {receipts.map((receipt) => <option value={receipt.id} key={receipt.id}>#{receipt.id} · {receipt.availableAmount}</option>)}
                  </select>
                </label>
                <label className="block">{t("insuranceClaims.refund.amount")}
                  <input className={field} dir="ltr" inputMode="decimal" required maxLength={19} value={amount} onChange={(event) => setAmount(event.target.value)} />
                </label>
                <label className="block">{t("insuranceClaims.refund.reason")}
                  <textarea className={field} required minLength={5} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
                <button className={action} disabled={!validAmount || reason.trim().length < 5}>{t("insuranceClaims.refund.request")}</button>
              </fieldset>
              {request.pending && (
                <button type="button" className={action} disabled={busy || request.busy} onClick={() => {
                  void save(request.retry, () => {
                    setAmount("");
                    setReason("");
                    setReceiptId("");
                  });
                }}>{t("insuranceClaims.refund.retry")}</button>
              )}
            </form>
          )}
          {ledger.refunds.map((refund) => (
            <section key={refund.id} className="space-y-2 rounded-lg border border-slate-700 p-3">
              <h3><bdi>#{refund.id} · {Money.toDbString(refund.amount)}</bdi> · {t(`insuranceClaims.refund.${refund.status}`)}</h3>
              <p className="break-words text-sm">{refund.reason}</p>
              {refund.reviewNote && <p className="break-words text-sm">{refund.reviewNote}</p>}
              {refund.bankReference && <p className="break-words text-sm">{t("insuranceClaims.refund.bankReference")} <bdi>{refund.bankReference}</bdi></p>}
              {refund.status === "PENDING" && userId != null && userId !== refund.requestedById && (
                reviewId === refund.id ? (
                  <fieldset disabled={busy} className="space-y-2">
                    <label className="block">{t("insuranceClaims.refund.reviewNote")}
                      <textarea className={field} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
                    </label>
                    <label className="block">{t("insuranceClaims.refund.bankReference")}
                      <input className={field} dir="ltr" maxLength={200} value={bankReference} onChange={(event) => setBankReference(event.target.value)} />
                    </label>
                    <label className="flex gap-2 text-sm">
                      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                      {t("insuranceClaims.refund.confirmed")}
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className={action} disabled={!confirmed || note.trim().length < 5 || bankReference.trim().length < 5} onClick={() => review("POST")}>{t("insuranceClaims.refund.post")}</button>
                      <button type="button" disabled={note.trim().length < 5} onClick={() => review("REJECT")}>{t("insuranceClaims.refund.reject")}</button>
                    </div>
                  </fieldset>
                ) : <button type="button" className={action} disabled={busy} onClick={() => {
                  setReviewId(refund.id);
                  setNote("");
                  setBankReference("");
                  setConfirmed(false);
                }}>{t("insuranceClaims.refund.review")}</button>
              )}
            </section>
          ))}
        </>
      ) : <p role="status">{t("common.loading")}</p>}
    </dialog>
  );
}
