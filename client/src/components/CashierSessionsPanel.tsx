import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useAuthStore } from "../stores/authStore";
type Session = {
  id: number;
  cashierId: number;
  cashier: { fullName: string; isActive?: boolean; isDeleted?: boolean };
  countedById?: number | null;
  custodyReference?: string | null;
  countedBy?: { fullName: string } | null;
  closedBy?: { fullName: string } | null;
  status: string;
  openingAmount: string;
  received: string;
  refunded: string;
  handedOver: string;
  expected: string;
  available: string;
  countedAmount: string | null;
  handovers: { id: number; amount: string; status: string; reason: string }[];
};
export function CashierSessionsPanel({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const full =
    !!user?.roles.includes("ADMIN") ||
    !!user?.permissions.includes("ADMIN_FULL_ACCESS");
  const canManage = full || !!user?.permissions.includes("cashier:manage");
  const canApprove =
    full || !!user?.permissions.includes("cashier:sessions:approve");
  const [amount, setAmount] = useState("0");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [custodyReference, setCustodyReference] = useState("");
  const [confirmedCustody, setConfirmedCustody] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const path = "/cashier/cash-control";
  const query = useQuery({
    queryKey: ["cash-control"],
    queryFn: async () => (await apiClient.get<Session[]>(path)).data,
  });
  const mutation = useMutation({
    mutationFn: async (action: {
      type:
        | "request"
        | "approve"
        | "reject"
        | "handover"
        | "approveHandover"
        | "rejectHandover"
        | "custody-count"
        | "reject-count"
        | "count"
        | "close"
        | "withdraw";
      id?: number;
      handoverId?: number;
    }) => {
      if (action.type === "request")
        return apiClient.post(path, { amount, reason, requestId });
      if (action.type === "handover")
        return apiClient.post(`${path}/${action.id}/handovers`, {
          amount,
          reason,
          requestId,
        });
      if (action.type === "approveHandover" || action.type === "rejectHandover")
        return apiClient.post(
          `${path}/${action.id}/handovers/${action.handoverId}/${action.type === "approveHandover" ? "approve" : "reject"}`,
          { reason, reference },
        );
      if (action.type === "custody-count")
        return apiClient.post(`${path}/${action.id}/custody-count`, {
          amount,
          reason,
          reference: custodyReference,
          confirmedCustody,
        });
      return apiClient.post(
        `${path}/${action.id}/${action.type}`,
        action.type === "count" ? { amount, reason } : { reason, reference },
      );
    },
    onSuccess: async () => {
      setConfirmedCustody(false);
      setRequestId(crypto.randomUUID());
      await Promise.all([
        client.invalidateQueries({ queryKey: ["cash-control"] }),
        client.invalidateQueries({ queryKey: ["invoice-refunds"] }),
      ]);
      onChanged?.();
      toast.success(t("cashControl.saved", "تم حفظ إجراء الصندوق"));
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      toast.error(message || t("cashControl.failed", "تعذر حفظ إجراء الصندوق"));
    },
  });
  if (query.isPending)
    return <p>{t("cashControl.loading", "جارٍ تحميل جلسات الصندوق...")}</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert">
        {t("cashControl.loadFailed", "تعذر تحميل جلسات الصندوق")}{" "}
        <button onClick={() => void query.refetch()}>
          {t("cashControl.retry", "إعادة المحاولة")}
        </button>
      </div>
    );
  const rows = query.data;
  const busy = mutation.isPending;
  const validReason = reason.trim().length >= 5;
  const ownActive = rows.some(
    (row) =>
      row.cashierId === user?.id &&
      ["PENDING", "OPEN", "CLOSING"].includes(row.status),
  );
  const act = (
    type:
      | "approve"
      | "reject"
      | "handover"
      | "approveHandover"
      | "rejectHandover"
      | "custody-count"
      | "reject-count"
      | "count"
      | "close"
      | "withdraw",
    id: number,
    handoverId?: number,
  ) => {
    if (
      [
        "approve",
        "approveHandover",
        "count",
        "custody-count",
        "reject-count",
        "close",
      ].includes(type) &&
      !window.confirm(
        t("cashControl.confirm", "تأكيد الإجراء على جلسة الصندوق المحددة؟"),
      )
    )
      return;
    mutation.mutate({ type, id, handoverId });
  };
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
      <h2 className="text-lg font-bold">
        {t("cashControl.title", "جلسة الصندوق والعد الفعلي")}
      </h2>
      <p className="text-sm text-slate-400">
        {t(
          "cashControl.formula",
          "المتوقع = الرصيد الافتتاحي المعتمد + التحصيل النقدي − الاسترداد النقدي − تسليم الخزينة. العد الفعلي والإقفال يعتمدهما موظف آخر.",
        )}
      </p>
      {(canManage || canApprove) && (
        <div className="flex flex-wrap gap-3">
          <label>
            {t("cashControl.amount", "مبلغ الإجراء أو النقد المعدود")}
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setRequestId(crypto.randomUUID());
              }}
              className="block bg-slate-800 p-2"
            />
          </label>
          <label>
            {t("cashControl.reason", "السبب أو دليل العد")}
            <input
              value={reason}
              maxLength={1000}
              onChange={(event) => {
                setReason(event.target.value);
                setRequestId(crypto.randomUUID());
              }}
              className="block bg-slate-800 p-2"
            />
          </label>
          {canApprove && (
            <label>
              {t(
                "cashControl.reference",
                "مرجع تمويل العهدة أو استلام الخزينة",
              )}
              <input
                value={reference}
                maxLength={200}
                onChange={(event) => setReference(event.target.value)}
                className="block bg-slate-800 p-2"
              />
            </label>
          )}
        </div>
      )}
      {canApprove && (
        <fieldset className="rounded border border-slate-700 p-3 space-y-2">
          <legend>
            {t("cashControl.custodyTitle", "الجرد الاستثنائي لصندوق موظف معطل")}
          </legend>
          <p>
            {t(
              "cashControl.custodyPolicy",
              "مشرف يسجل الجرد الفعلي ومحضر التسلم، ومشرف آخر يراجع العد ويعتمد الإقفال. تبقى حجوزات الصرف المعلقة واجبة الحسم قبل الجرد.",
            )}
          </p>
          <label className="block">
            {t("cashControl.custodyReference", "مرجع محضر تسلم العهدة")}
            <input
              className="block bg-slate-800 p-2"
              maxLength={200}
              value={custodyReference}
              onChange={(event) => {
                setCustodyReference(event.target.value);
                setConfirmedCustody(false);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmedCustody}
              onChange={(event) => setConfirmedCustody(event.target.checked)}
            />{" "}
            {t(
              "cashControl.confirmCustody",
              "أؤكد جرد النقد فعليًا وتسلم العهدة وفق المحضر",
            )}
          </label>
        </fieldset>
      )}
      {canManage && !ownActive && (
        <button
          disabled={
            busy ||
            !validReason ||
            !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(amount)
          }
          onClick={() => mutation.mutate({ type: "request" })}
          className="rounded bg-sky-700 p-2 disabled:opacity-50"
        >
          {t("cashControl.request", "طلب فتح جلسة ورصيد افتتاحي")}
        </button>
      )}
      {!rows.length && <p>{t("cashControl.empty", "لا توجد جلسات صندوق")}</p>}
      {rows.map((row) => (
        <article
          key={row.id}
          className="rounded border border-slate-700 p-3 space-y-2"
        >
          <p>
            #{row.id} · {row.cashier.fullName} ·{" "}
            {t(`cashControl.status.${row.status}`, row.status)}
          </p>
          <p>
            {t("cashControl.opening", "الافتتاحي")}: {row.openingAmount} ·{" "}
            {t("cashControl.received", "التحصيل")}: {row.received} ·{" "}
            {t("cashControl.refunded", "الاسترداد")}: {row.refunded} ·{" "}
            {t("cashControl.handedOver", "تسليم الخزينة")}: {row.handedOver}
          </p>
          <p>
            {t("cashControl.expected", "النقد المتوقع")}: {row.expected} LYD ·{" "}
            {t("cashControl.available", "المتاح بعد حجوزات التسليم")}:{" "}
            {row.available} LYD
          </p>
          {row.countedAmount !== null && (
            <p>
              {t("cashControl.counted", "النقد المعدود")}: {row.countedAmount}{" "}
              LYD
            </p>
          )}
          {row.countedById && (
            <p>
              {t("cashControl.counter", "سجل الجرد")}:{" "}
              {row.countedBy?.fullName ?? `#${row.countedById}`}
            </p>
          )}
          {row.custodyReference && (
            <p>
              {t("cashControl.custodyReference", "مرجع محضر تسلم العهدة")}:{" "}
              {row.custodyReference}
            </p>
          )}
          {row.closedBy && (
            <p>
              {t("cashControl.closer", "اعتمد الإقفال")}:{" "}
              {row.closedBy.fullName}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {row.status === "PENDING" &&
              canApprove &&
              row.cashierId !== user?.id && (
                <>
                  <button
                    disabled={
                      busy || !validReason || reference.trim().length < 5
                    }
                    onClick={() => act("approve", row.id)}
                  >
                    {t(
                      "cashControl.approveOpening",
                      "اعتماد العهدة وفتح الجلسة",
                    )}
                  </button>
                  <button
                    disabled={
                      busy || !validReason || reference.trim().length < 5
                    }
                    onClick={() => act("reject", row.id)}
                  >
                    {t("cashControl.reject", "رفض الطلب")}
                  </button>
                </>
              )}
            {row.status === "OPEN" &&
              canManage &&
              row.cashierId === user?.id && (
                <>
                  <button
                    disabled={busy || !validReason || Number(amount) <= 0}
                    onClick={() => act("handover", row.id)}
                  >
                    {t("cashControl.handover", "طلب تأكيد تسليم للخزينة")}
                  </button>
                  <button
                    disabled={
                      busy ||
                      !validReason ||
                      !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(amount)
                    }
                    onClick={() => act("count", row.id)}
                  >
                    {t("cashControl.count", "تثبيت العد وإيقاف الحركات")}
                  </button>
                </>
              )}
            {row.status === "OPEN" &&
              canApprove &&
              row.cashierId !== user?.id &&
              (row.cashier.isActive === false ||
                row.cashier.isDeleted === true) && (
                <button
                  disabled={
                    busy ||
                    !validReason ||
                    custodyReference.trim().length < 5 ||
                    !confirmedCustody ||
                    !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(amount)
                  }
                  onClick={() => act("custody-count", row.id)}
                >
                  {t(
                    "cashControl.custodyCount",
                    "تثبيت الجرد الاستثنائي ومحضر التسلم",
                  )}
                </button>
              )}
            {["PENDING", "CLOSING"].includes(row.status) &&
              ((canManage &&
                row.cashierId === user?.id &&
                !row.custodyReference) ||
                (canApprove &&
                  row.status === "CLOSING" &&
                  !!row.custodyReference &&
                  row.countedById === user?.id)) && (
                <button
                  disabled={busy || !validReason}
                  onClick={() => act("withdraw", row.id)}
                >
                  {t("cashControl.withdraw", "سحب طلبي للمراجعة")}
                </button>
              )}
            {row.status === "CLOSING" &&
              canApprove &&
              row.cashierId !== user?.id &&
              row.countedById !== user?.id && (
                <button
                  disabled={busy || !validReason}
                  onClick={() => act("close", row.id)}
                >
                  {t("cashControl.close", "اعتماد العد وإقفال الجلسة")}
                </button>
              )}
            {row.status === "CLOSING" &&
              canApprove &&
              row.cashierId !== user?.id &&
              row.countedById !== user?.id && (
                <button
                  disabled={busy || !validReason}
                  onClick={() => act("reject-count", row.id)}
                >
                  {t("cashControl.rejectCount", "رفض العد وإعادته للجرد")}
                </button>
              )}
          </div>
          {row.handovers.map((handover) => (
            <div key={handover.id} className="border-t border-slate-700 pt-2">
              <p>
                {t("cashControl.handoverRecord", "سجل تسليم")}: #{handover.id} ·{" "}
                {handover.amount} LYD ·{" "}
                {t(
                  `cashControl.handoverStatus.${handover.status}`,
                  handover.status,
                )}
              </p>
              <p>{handover.reason}</p>
              {handover.status === "PENDING" &&
                canApprove &&
                row.cashierId !== user?.id && (
                  <div className="flex gap-3">
                    <button
                      disabled={
                        busy || !validReason || reference.trim().length < 5
                      }
                      onClick={() =>
                        act("approveHandover", row.id, handover.id)
                      }
                    >
                      {t("cashControl.acknowledge", "تأكيد استلام الخزينة")}
                    </button>
                    <button
                      disabled={
                        busy || !validReason || reference.trim().length < 5
                      }
                      onClick={() => act("rejectHandover", row.id, handover.id)}
                    >
                      {t("cashControl.reject", "رفض الطلب")}
                    </button>
                  </div>
                )}
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
