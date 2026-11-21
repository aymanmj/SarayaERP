import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useAuthStore } from "../stores/authStore";

type Refund = {
  id: number;
  paymentId: number;
  adjustmentId: number;
  amount: string;
  method: string;
  status: string;
  requestedById: number;
  reviewedById: number | null;
  assignedExecutorId: number | null;
  reason: string;
  executionReference: string | null;
  executionEvidence: string | null;
  postingEntryId: number | null;
};
type RefundData = {
  items: Refund[];
  payments: { id: number; amount: string; method: string }[];
  credits: { id: number; delta: string }[];
  patientCredit: string;
  reservedAmount: string;
  availableAmount: string;
  refundedAmount: string;
};
type Action = {
  type:
    | "request"
    | "approve"
    | "reject"
    | "cancel"
    | "prepare"
    | "release"
    | "execute";
  id?: number;
};

export function InvoiceRefundsPanel({
  invoiceId,
  onChanged,
}: {
  invoiceId: number;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const full =
    !!user?.roles.includes("ADMIN") ||
    !!user?.permissions.includes("ADMIN_FULL_ACCESS");
  const canRequest =
    full || !!user?.permissions.includes("cashier:refunds:request");
  const canApprove =
    full || !!user?.permissions.includes("cashier:refunds:approve");
  const canExecute =
    full || !!user?.permissions.includes("cashier:refunds:execute");
  const [paymentId, setPaymentId] = useState("");
  const [adjustmentId, setAdjustmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedNotPaid, setConfirmedNotPaid] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const executionIds = useRef<Record<number, string>>({});
  const resetRequest = () => setRequestId(crypto.randomUUID());
  const resetExecution = () => {
    executionIds.current = {};
    setConfirmed(false);
  };
  const path = `/billing/invoices/${invoiceId}/refunds`;
  const query = useQuery({
    queryKey: ["invoice-refunds", invoiceId],
    queryFn: async () => (await apiClient.get<RefundData>(path)).data,
  });
  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (action.type === "request")
        return apiClient.post(path, {
          paymentId: Number(paymentId),
          adjustmentId: Number(adjustmentId),
          amount,
          reason,
          requestId,
        });
      if (action.type === "prepare")
        return apiClient.post(`${path}/${action.id}/prepare`, {
          requestId: crypto.randomUUID(),
        });
      if (action.type === "release")
        return apiClient.post(`${path}/${action.id}/release`, {
          reason: reviewReason,
          confirmedNotPaid,
        });
      if (action.type === "execute") {
        const id = action.id!;
        executionIds.current[id] ??= crypto.randomUUID();
        return apiClient.post(`${path}/${id}/execute`, {
          reference,
          evidence: proof,
          confirmedPaid: confirmed,
          requestId: executionIds.current[id],
        });
      }
      return apiClient.post(`${path}/${action.id}/${action.type}`, {
        reason: reviewReason,
      });
    },
    onSuccess: async () => {
      resetRequest();
      resetExecution();
      setConfirmedNotPaid(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["invoice-refunds", invoiceId] }),
        client.invalidateQueries({
          queryKey: ["invoice-adjustments", invoiceId],
        }),
        client.invalidateQueries({ queryKey: ["cash-control"] }),
        client.invalidateQueries({ queryKey: ["refund-worklist"] }),
      ]);
      onChanged?.();
      toast.success(t("refunds.saved", "تم حفظ إجراء الاسترداد"));
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      toast.error(
        message ||
          t("refunds.failed", "تعذر حفظ الإجراء؛ تحقق من الرصيد والدليل"),
      );
    },
  });
  if (query.isPending)
    return <p>{t("refunds.loading", "جارٍ تحميل الاستردادات...")}</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert">
        {t("refunds.loadFailed", "تعذر تحميل الاستردادات")}{" "}
        <button onClick={() => void query.refetch()}>
          {t("refunds.retry", "إعادة المحاولة")}
        </button>
      </div>
    );
  const data = query.data;
  const busy = mutation.isPending;
  const act = (type: Action["type"], id: number) => {
    if (
      (type === "approve" ||
        type === "prepare" ||
        type === "release" ||
        type === "execute") &&
      !window.confirm(
        t(
          "refunds.confirmAction",
          "تأكيد الإجراء المالي على طلب الاسترداد المحدد؟",
        ),
      )
    )
      return;
    mutation.mutate({ type, id });
  };
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
      <h2 className="text-lg font-bold">
        {t("refunds.title", "الاستردادات المرتبطة بالإشعار والإيصال")}
      </h2>
      <p className="text-sm text-amber-300">
        {t(
          "refunds.scope",
          "الموافقة تحجز الرصيد ولا تصرفه. تسجيل التنفيذ يتطلب مرجعًا وإثبات دفع فعلي؛ لا تنفذ هذه الشاشة تحويلًا مصرفيًا أو رد بطاقة آليًا.",
        )}
      </p>
      <p>
        {t("refunds.credit", "المستحق للمريض")}: {data.patientCredit} LYD ·{" "}
        {t("refunds.reserved", "المحجوز للطلبات")}: {data.reservedAmount} LYD ·{" "}
        {t("refunds.available", "المتاح لطلب جديد")}: {data.availableAmount} LYD
      </p>
      <p>
        {t("refunds.executed", "الاسترداد المثبت")}: {data.refundedAmount} LYD
      </p>
      {canRequest && data.credits.length > 0 && (
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ type: "request" });
          }}
        >
          <label>
            {t("refunds.creditNote", "الإشعار الدائن")}
            <select
              required
              value={adjustmentId}
              onChange={(event) => {
                setAdjustmentId(event.target.value);
                resetRequest();
              }}
              className="block bg-slate-800 p-2"
            >
              <option value="">—</option>
              {data.credits.map((credit) => (
                <option key={credit.id} value={credit.id}>
                  #{credit.id} · {credit.delta}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("refunds.payment", "إيصال التحصيل الأصلي")}
            <select
              required
              value={paymentId}
              onChange={(event) => {
                setPaymentId(event.target.value);
                resetRequest();
              }}
              className="block bg-slate-800 p-2"
            >
              <option value="">—</option>
              {data.payments.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  #{payment.id} · {payment.method} · {payment.amount}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("refunds.amount", "مبلغ الاسترداد")}
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                resetRequest();
              }}
              className="block bg-slate-800 p-2"
            />
          </label>
          <label>
            {t("refunds.reason", "سبب الاسترداد")}
            <input
              required
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                resetRequest();
              }}
              className="block bg-slate-800 p-2"
            />
          </label>
          <button
            disabled={
              busy ||
              !paymentId ||
              !adjustmentId ||
              !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(amount) ||
              Number(amount) <= 0 ||
              reason.trim().length < 5
            }
            className="rounded bg-sky-700 p-2 disabled:opacity-50"
          >
            {t("refunds.request", "إرسال طلب استرداد")}
          </button>
        </form>
      )}
      {(canRequest || canApprove) && (
        <label className="block">
          {t("refunds.reviewReason", "سبب الموافقة أو الرفض أو الإلغاء")}
          <input
            minLength={5}
            maxLength={1000}
            value={reviewReason}
            onChange={(event) => setReviewReason(event.target.value)}
            className="block bg-slate-800 p-2 w-full"
          />
        </label>
      )}
      {canApprove && (
        <label className="block">
          <input
            type="checkbox"
            checked={confirmedNotPaid}
            onChange={(event) => setConfirmedNotPaid(event.target.checked)}
          />{" "}
          {t(
            "refunds.confirmNotPaid",
            "تحققت من عدم صرف المبلغ؛ يمكن تحرير الحجز بأمان",
          )}
        </label>
      )}
      {canExecute && (
        <fieldset className="rounded border border-slate-700 p-3 space-y-2">
          <legend>{t("refunds.proofTitle", "إثبات استرداد تم تنفيذه")}</legend>
          <label className="block">
            {t("refunds.reference", "مرجع الصرف أو تأكيد البنك")}
            <input
              value={reference}
              maxLength={200}
              onChange={(event) => {
                setReference(event.target.value);
                resetExecution();
              }}
              className="block bg-slate-800 p-2 w-full"
            />
          </label>
          <label className="block">
            {t("refunds.proof", "دليل استلام المستفيد أو تأكيد العملية")}
            <input
              value={proof}
              maxLength={1000}
              onChange={(event) => {
                setProof(event.target.value);
                resetExecution();
              }}
              className="block bg-slate-800 p-2 w-full"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{" "}
            {t(
              "refunds.confirmPaid",
              "أؤكد دفع المبلغ والتحقق من استلام المستفيد",
            )}
          </label>
        </fieldset>
      )}
      {!data.items.length && (
        <p>{t("refunds.empty", "لا توجد طلبات استرداد")}</p>
      )}
      {data.items.map((row) => (
        <article
          key={row.id}
          className="rounded border border-slate-700 p-3 space-y-2"
        >
          <p>
            #{row.id} · {row.method} · {row.amount} LYD ·{" "}
            {t(`refunds.status.${row.status}`, row.status)}
          </p>
          <p>{row.reason}</p>
          <p>
            {t("refunds.source", "الإشعار / الإيصال")}: #{row.adjustmentId} / #
            {row.paymentId}
          </p>
          {row.executionReference && (
            <p>
              {t("refunds.reference", "مرجع الصرف أو تأكيد البنك")}:{" "}
              {row.executionReference} · {t("refunds.entry", "القيد")}: #
              {row.postingEntryId}
            </p>
          )}
          <div className="flex gap-3">
            {row.status === "PENDING" &&
              canApprove &&
              row.requestedById !== user?.id && (
                <>
                  <button
                    disabled={busy || reviewReason.trim().length < 5}
                    onClick={() => act("approve", row.id)}
                  >
                    {t("refunds.approve", "اعتماد الطلب")}
                  </button>
                  <button
                    disabled={busy || reviewReason.trim().length < 5}
                    onClick={() => act("reject", row.id)}
                  >
                    {t("refunds.reject", "رفض الطلب")}
                  </button>
                </>
              )}
            {["PENDING", "APPROVED"].includes(row.status) &&
              canRequest &&
              row.requestedById === user?.id && (
                <button
                  disabled={busy || reviewReason.trim().length < 5}
                  onClick={() => act("cancel", row.id)}
                >
                  {t("refunds.cancel", "إلغاء طلبي")}
                </button>
              )}
            {row.status === "APPROVED" &&
              canExecute &&
              row.reviewedById !== user?.id && (
                <button disabled={busy} onClick={() => act("prepare", row.id)}>
                  {t("refunds.prepare", "حجز النقد وبدء الصرف")}
                </button>
              )}
            {row.status === "DISBURSING" &&
              canApprove &&
              row.reviewedById === user?.id && (
                <button
                  disabled={
                    busy || !confirmedNotPaid || reviewReason.trim().length < 5
                  }
                  onClick={() => act("release", row.id)}
                >
                  {t("refunds.release", "تحرير الحجز بعد التحقق من عدم الصرف")}
                </button>
              )}
            {row.status === "DISBURSING" &&
              canExecute &&
              row.assignedExecutorId === user?.id && (
                <button
                  disabled={
                    busy ||
                    !confirmed ||
                    reference.trim().length < 5 ||
                    proof.trim().length < 5
                  }
                  onClick={() => act("execute", row.id)}
                  className="rounded bg-rose-800 px-3 py-2 disabled:opacity-50"
                >
                  {t("refunds.execute", "تسجيل استرداد منفذ")}
                </button>
              )}
          </div>
        </article>
      ))}
    </section>
  );
}
