import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { ConsumptionSourcePolicy } from "./ConsumptionSourcePolicy";
import { consumptionFailureMessage } from "./consumptionFailureMessage";

type Operation = {
  id: number;
  serviceItemId: number;
  referenceType: string;
  referenceId: number;
  warehouseId: number | null;
  status: "PENDING" | "FAILED" | "COMPLETED";
  attempts: number;
  nextRetryAt: string;
  error: string | null;
};
type Page = { items: Operation[]; nextCursor: number | null };
export function ConsumptionOperationsPage() {
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith("ar");
  const { user, hasPermission } = useAuth();
  const cache = useQueryClient();
  const [status, setStatus] = useState("FAILED");
  const [before, setBefore] = useState<number | undefined>();
  const [selected, setSelected] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const labels = ar
    ? {
        title: "متابعة استهلاك مواد الخدمات",
        failed: "فاشلة",
        pending: "بانتظار المعالجة",
        completed: "مكتملة",
        reload: "تحديث",
        next: "الأقدم",
        first: "الأحدث",
        retry: "إعادة جدولة",
        reason: "سبب إعادة المحاولة (10–500 حرف)",
        cancel: "إلغاء",
        save: "تأكيد إعادة الجدولة",
        empty: "لا توجد عمليات ضمن هذا الفلتر",
        denied: "لا تملك صلاحية عرض العمليات",
        note: "إعادة الجدولة لا تعني نجاح الاستهلاك. راجع سبب الفشل قبل إعادة المحاولة.",
        ref: "المرجع / الخدمة",
        state: "الحالة",
        attempts: "الإخفاقات",
        time: "المحاولة التالية",
        warehouse: "المخزن",
        loading: "جارٍ التحميل",
        failure: "تعذر تنفيذ الطلب",
        exhausted: "توقفت المحاولات التلقائية",
      }
    : {
        title: "Service material consumption",
        failed: "Failed",
        pending: "Pending",
        completed: "Completed",
        reload: "Refresh",
        next: "Older",
        first: "Latest",
        retry: "Reschedule",
        reason: "Retry reason (10–500 characters)",
        cancel: "Cancel",
        save: "Confirm reschedule",
        empty: "No operations match this filter",
        denied: "You do not have permission to view operations",
        note: "Rescheduling does not confirm consumption. Review the failure before retrying.",
        ref: "Reference / service",
        state: "Status",
        attempts: "Failures",
        time: "Next attempt",
        warehouse: "Warehouse",
        loading: "Loading",
        failure: "Request failed",
        exhausted: "Automatic retries exhausted",
      };
  const canView = hasPermission("inventory:view");
  const query = useQuery({
    queryKey: [
      "consumption-operations",
      user?.id,
      user?.hospitalId,
      status,
      before,
    ],
    enabled: canView,
    queryFn: async () =>
      (
        await apiClient.get<Page>("/inventory/consumption-operations", {
          params: { status, before, limit: 50 },
        })
      ).data,
  });
  async function retry() {
    if (selected === null) return;
    setBusy(true);
    setError("");
    try {
      await apiClient.post(
        `/inventory/consumption-operations/${selected}/retry`,
        { reason: reason.trim() },
      );
      setSelected(null);
      setReason("");
      await cache.invalidateQueries({ queryKey: ["consumption-operations"] });
    } catch (err: unknown) {
      const message = isAxiosError<{ message?: string | string[] }>(err)
        ? err.response?.data?.message
        : undefined;
      setError(
        Array.isArray(message) ? message.join("، ") : message || labels.failure,
      );
    } finally {
      setBusy(false);
    }
  }
  if (!canView) return <p role="alert">{labels.denied}</p>;
  return (
    <section dir={ar ? "rtl" : "ltr"} className="p-6 space-y-4 text-slate-100">
      <h1 className="text-2xl font-bold">{labels.title}</h1>
      <p>{labels.note}</p>
      <ConsumptionSourcePolicy />
      <div className="flex gap-3">
        <select
          aria-label={labels.state}
          className="bg-slate-800 p-2"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setBefore(undefined);
          }}
        >
          {(["FAILED", "PENDING", "COMPLETED"] as const).map((s) => (
            <option key={s} value={s}>
              {s === "FAILED"
                ? labels.failed
                : s === "PENDING"
                  ? labels.pending
                  : labels.completed}
            </option>
          ))}
        </select>
        <button onClick={() => void query.refetch()}>{labels.reload}</button>
        <button onClick={() => setBefore(undefined)}>{labels.first}</button>
      </div>
      {(query.isError || error) && (
        <p role="alert" className="text-red-300">
          {error || labels.failure}
        </p>
      )}
      {query.isPending ? (
        <p>{labels.loading}</p>
      ) : !query.isError && query.data?.items.length === 0 ? (
        <p>{labels.empty}</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-start">
          <thead>
            <tr>
              {[
                labels.ref,
                labels.state,
                labels.warehouse,
                labels.attempts,
                labels.time,
                "",
              ].map((s, i) => (
                <th key={i} className="text-start p-2">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data?.items.map((o) => (
              <tr key={o.id} className="border-t border-slate-700">
                <td className="p-2">
                  #{o.id} · {o.referenceType} #{o.referenceId} / #
                  {o.serviceItemId}
                </td>
                <td>
                  {o.status === "FAILED"
                    ? labels.failed
                    : o.status === "PENDING"
                      ? labels.pending
                      : labels.completed}
                  {o.error && (
                    <div>{consumptionFailureMessage(o.error, ar)}</div>
                  )}
                </td>
                <td>{o.warehouseId ?? "—"}</td>
                <td>
                  {o.attempts}
                  {o.status === "FAILED" && o.attempts >= 10 && (
                    <div>{labels.exhausted}</div>
                  )}
                </td>
                <td>
                  {o.status !== "COMPLETED" && o.attempts < 10
                    ? new Date(o.nextRetryAt).toLocaleString(i18n.language)
                    : "—"}
                </td>
                <td>
                  {o.status === "FAILED" &&
                    hasPermission("inventory:manage") && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setSelected(o.id);
                          setReason("");
                          setError("");
                        }}
                      >
                        {labels.retry}
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.data?.nextCursor && (
        <button onClick={() => setBefore(query.data?.nextCursor ?? undefined)}>
          {labels.next}
        </button>
      )}
      {selected !== null && (
        <form
          className="border border-slate-600 p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void retry();
          }}
        >
          <label htmlFor="consumption-retry-reason">
            #{selected} — {labels.reason}
          </label>
          <textarea
            id="consumption-retry-reason"
            className="block w-full bg-slate-800 p-2"
            required
            minLength={10}
            maxLength={500}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
          <button disabled={busy || reason.trim().length < 10} type="submit">
            {labels.save}
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={() => setSelected(null)}
          >
            {labels.cancel}
          </button>
        </form>
      )}
    </section>
  );
}
