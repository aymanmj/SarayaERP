import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useIdempotentPost } from "../hooks/useIdempotentPost";
import { useAuthStore } from "../stores/authStore";
import { Money } from "../utils/money";

type WriteOffCategory = "CONTRACTUAL_ALLOWANCE" | "BAD_DEBT";

type WriteOffLedger = {
  invoiceId: number;
  claimStatus: string | null;
  effectiveShare: string;
  settledNet: string;
  postedWriteOff: string;
  pendingWriteOff: string;
  available: string;
  writeOffs: {
    id: number;
    category: WriteOffCategory;
    amount: string;
    reason: string;
    status: "PENDING" | "POSTED" | "REJECTED";
    requestedById: number;
    reviewNote: string | null;
    postingEntryId: number | null;
  }[];
};

const field = "mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2";
const button = "rounded bg-sky-700 px-3 py-2 disabled:opacity-50";
const MONEY_RE = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/;

export function InsuranceWriteOffDialog({
  invoiceId,
  onClose,
  onChange,
}: {
  invoiceId: number;
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const userId = useAuthStore((state) => state.user?.id);
  const dialog = useRef<HTMLDialogElement>(null);
  const url = `/insurance/claims/${invoiceId}/write-offs`;
  const request = useIdempotentPost(url);
  const [ledger, setLedger] = useState<WriteOffLedger>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<WriteOffCategory>(
    "CONTRACTUAL_ALLOWANCE",
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reviewId, setReviewId] = useState<number>();
  const [note, setNote] = useState("");

  const available = ledger?.available ?? "0.000";
  const canRequest =
    Boolean(ledger) &&
    ["SUBMITTED", "PARTIALLY_PAID", "REJECTED"].includes(
      ledger?.claimStatus ?? "",
    ) &&
    Money.decimal(available).gt(0);
  const amountValid =
    MONEY_RE.test(amount) &&
    Money.decimal(amount).gt(0) &&
    Money.decimal(amount).lte(available);
  const validRequest = canRequest && amountValid && reason.trim().length >= 5;

  useEffect(() => {
    dialog.current?.showModal();
    const abort = new AbortController();
    apiClient
      .get<WriteOffLedger>(url, { signal: abort.signal })
      .then(({ data }) => setLedger(data))
      .catch(() => {
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
    reset();
    toast.success(t("insuranceClaims.writeOff.saved"));
    try {
      setLedger((await apiClient.get<WriteOffLedger>(url)).data);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      await onChange();
    }
  };

  const resetRequest = () => {
    setAmount("");
    setReason("");
  };

  const review = (decision: "POST" | "REJECT") => {
    if (reviewId == null || note.trim().length < 5) return;
    void save(
      () =>
        apiClient.post(`${url}/${reviewId}/review`, {
          decision,
          note: note.trim(),
        }),
      () => setReviewId(undefined),
    );
  };

  return (
    <dialog
      ref={dialog}
      dir={i18n.dir()}
      aria-labelledby="insurance-writeoff-title"
      className="m-auto max-h-[85vh] w-[min(94vw,46rem)] space-y-4 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 backdrop:bg-slate-950/80"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id="insurance-writeoff-title" className="text-lg font-bold">
          {t("insuranceClaims.writeOff.title")} <bdi>#{invoiceId}</bdi>
        </h2>
        <button type="button" disabled={busy} onClick={onClose}>
          {t("common.close")}
        </button>
      </header>
      {failed ? (
        <p role="alert">{t("insuranceClaims.toast.loadFailed")}</p>
      ) : ledger ? (
        <>
          <div className="grid gap-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm sm:grid-cols-2">
            <p>
              {t("insuranceClaims.writeOff.effectiveShare")}:{" "}
              <bdi>{ledger.effectiveShare}</bdi>
            </p>
            <p>
              {t("insuranceClaims.writeOff.settledNet")}:{" "}
              <bdi>{ledger.settledNet}</bdi>
            </p>
            <p>
              {t("insuranceClaims.writeOff.writtenOffAmount")}:{" "}
              <bdi>{ledger.postedWriteOff}</bdi>
            </p>
            <p>
              {t("insuranceClaims.writeOff.pendingAmount")}:{" "}
              <bdi>{ledger.pendingWriteOff}</bdi>
            </p>
            <p className="font-bold text-amber-300 sm:col-span-2">
              {t("insuranceClaims.writeOff.availableAmount")}:{" "}
              <bdi>{ledger.available}</bdi>
            </p>
          </div>

          {canRequest && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!validRequest || request.pending) return;
                void save(
                  () =>
                    request.submit(url, {
                      category,
                      amount,
                      reason: reason.trim(),
                    }),
                  resetRequest,
                );
              }}
            >
              <fieldset
                disabled={busy || !!request.pending}
                className="space-y-3"
              >
                <label className="block text-sm">
                  {t("insuranceClaims.writeOff.category")}
                  <select
                    className={field}
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as WriteOffCategory)
                    }
                  >
                    <option value="CONTRACTUAL_ALLOWANCE">
                      {t("insuranceClaims.writeOff.CONTRACTUAL_ALLOWANCE")}
                    </option>
                    <option value="BAD_DEBT">
                      {t("insuranceClaims.writeOff.BAD_DEBT")}
                    </option>
                  </select>
                </label>

                <label className="block text-sm">
                  {t("insuranceClaims.writeOff.amount")} (<bdi>{available}</bdi>)
                  <input
                    className={field}
                    dir="ltr"
                    inputMode="decimal"
                    maxLength={19}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() => setAmount(available)}
                >
                  {t("insuranceClaims.writeOff.fillRemaining")}
                </button>
                {amount && !amountValid && (
                  <p className="text-sm text-amber-300">
                    {t("insuranceClaims.writeOff.invalid")}
                  </p>
                )}

                <label className="block text-sm">
                  {t("insuranceClaims.writeOff.reason")}
                  <textarea
                    className={field}
                    required
                    minLength={5}
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button className={button} disabled={!validRequest}>
                  {t("insuranceClaims.writeOff.request")}
                </button>
              </fieldset>
              {request.pending && (
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => void save(request.retry, resetRequest)}
                >
                  {t("insuranceClaims.writeOff.retry")}
                </button>
              )}
            </form>
          )}

          {ledger.writeOffs.map((item) => (
            <section
              key={item.id}
              className="space-y-2 rounded-lg border border-slate-700 p-3"
            >
              <h3 className="font-bold">
                <bdi>
                  #{item.id} · {item.amount}
                </bdi>{" "}
                · {t(`insuranceClaims.writeOff.${item.category}`)} ·{" "}
                {t(`insuranceClaims.writeOff.${item.status}`)}
              </h3>
              <p className="break-words text-sm">{item.reason}</p>
              {item.reviewNote && (
                <p className="break-words text-sm text-slate-300">
                  {item.reviewNote}
                </p>
              )}
              {item.status === "PENDING" &&
                userId != null &&
                userId !== item.requestedById &&
                (reviewId === item.id ? (
                  <fieldset disabled={busy} className="space-y-2">
                    <label className="block text-sm">
                      {t("insuranceClaims.writeOff.reviewNote")}
                      <textarea
                        className={field}
                        maxLength={1000}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className={button}
                        disabled={note.trim().length < 5}
                        onClick={() => review("POST")}
                      >
                        {t("insuranceClaims.writeOff.post")}
                      </button>
                      <button
                        type="button"
                        disabled={note.trim().length < 5}
                        onClick={() => review("REJECT")}
                      >
                        {t("insuranceClaims.writeOff.reject")}
                      </button>
                    </div>
                  </fieldset>
                ) : (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      setReviewId(item.id);
                      setNote("");
                    }}
                  >
                    {t("insuranceClaims.writeOff.review")}
                  </button>
                ))}
            </section>
          ))}
        </>
      ) : (
        <p role="status">{t("common.loading")}</p>
      )}
    </dialog>
  );
}
