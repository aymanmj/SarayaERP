import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { apiClient } from "../../api/apiClient";
import { useAuth } from "../../hooks/useAuth";
import { Money } from "../../utils/money";
import { RecallDisposalInvestigation } from "./RecallDisposalInvestigation";

type Disposal = {
  id: number;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXECUTED" | "POSTED" | "NO_DISPOSAL";
  quantity: string;
  reason: string;
  requestedById: number;
  reviewNote: string | null;
  cancellationNote: string | null;
  performedQuantity: string | null;
  recordedById?: number | null;
  reconciledById?: number | null;
  reconciledAt?: string | null;
  reconciliationReference?: string | null;
  reconciliationNote?: string | null;
  countedRemaining?: string | null;
  investigations?: { id: number; status: string }[];
  evidenceReference: string | null;
  performedBy: string | null;
  performedAt: string | null;
  movementId: number | null;
  accountingEntryId: number | null;
  isolation: { onHand: string; isolatedQuantity: string; location: string };
};

type Form =
  | { kind: "request"; requestId: string; isolationId: number }
  | { kind: "review"; id: number; decision: "APPROVE" | "REJECT" | "CANCEL" }
  | { kind: "evidence"; id: number }
  | { kind: "reconcile"; id: number }
  | { kind: "post"; id: number };

const draftFields = { quantity: "", note: "", evidenceReference: "", performedBy: "", performedAt: "", reference: "" };
const quantityPattern = "(0|[1-9][0-9]{0,14})([.][0-9]{1,3})?";

export function RecallDisposals({ stockId, isolationId, recallKey }: {
  stockId: number;
  isolationId: number | null;
  recallKey: readonly unknown[];
}) {
  const { t, i18n } = useTranslation();
  const { user, hasPermission } = useAuth();
  const client = useQueryClient();
  const [cursors, setCursors] = useState<number[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [investigationId, setInvestigationId] = useState<number | null>(null);
  const [fields, setFields] = useState(draftFields);
  const msg = (key: string) => t(`inventory.recall.disposal.${key}`);
  const path = `/inventory/stock/${stockId}/recall-disposals`;
  const queryKey = [...recallKey, "disposals", stockId];
  const admin = user?.roles?.includes("ADMIN") || user?.permissions.includes("ADMIN_FULL_ACCESS");
  const manage = admin || hasPermission("inventory:manage");
  const review = admin || hasPermission("inventory:recall-disposal:review");
  const post = admin || hasPermission("inventory:recall-disposal:post");
  const list = useQuery({
    queryKey: [...queryKey, cursors.at(-1)],
    queryFn: async () => (await apiClient.get<{ records: Disposal[]; nextBefore: number | null }>(path, {
      params: { before: cursors.at(-1) },
    })).data,
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: (action: Form) => {
      if (action.kind === "request")
        return apiClient.post(path, { isolationId: action.isolationId, requestId: action.requestId, quantity: fields.quantity, reason: fields.note.trim() });
      const actionPath = `${path}/${action.id}/${action.kind}`;
      if (action.kind === "review") return apiClient.post(actionPath, { decision: action.decision, note: fields.note.trim() });
      if (action.kind === "reconcile") return apiClient.post(actionPath, {
        countedRemaining: fields.quantity, reference: fields.reference.trim(), note: fields.note.trim(),
      });
      if (action.kind === "evidence") return apiClient.post(actionPath, {
        quantity: fields.quantity, evidenceReference: fields.evidenceReference.trim(), performedBy: fields.performedBy.trim(),
        performedAt: new Date(fields.performedAt).toISOString(),
      });
      return apiClient.post(actionPath);
    },
    onSuccess: async (_, action) => {
      setForm(null);
      setCursors([]);
      await client.invalidateQueries({ queryKey: recallKey });
      if (action.kind === "post") {
        await Promise.all([
          client.invalidateQueries({ queryKey: ["warehouse-stock"] }),
          client.invalidateQueries({ queryKey: ["warehouse-details"] }),
          client.invalidateQueries({ queryKey: ["warehouses-detailed"] }),
        ]);
      }
    },
  });
  const open = (action: Form, quantity = "") => {
    save.reset();
    setFields({ ...draftFields, quantity });
    setForm(action);
  };
  const edit = (key: keyof typeof draftFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (form?.kind === "request") setForm({ ...form, requestId: crypto.randomUUID() });
  };
  const label = form?.kind === "review" ? form.decision : form?.kind;
  const failure = isAxiosError<{ message?: string }>(save.error) &&
    (save.error.response?.status === 400 || save.error.response?.status === 409) &&
    typeof save.error.response.data?.message === "string"
    ? save.error.response.data.message
    : t("inventory.recall.saveFailed");

  return <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
    {list.isPending && <p role="status">{t("inventory.recall.loading")}</p>}
    {list.isError && <p role="alert">{t("inventory.recall.loadFailed")}{" "}
      <button type="button" className="underline" onClick={() => void list.refetch()}>{t("inventory.recall.refresh")}</button>
    </p>}
    {manage && isolationId !== null && !form && <button type="button" className="text-sky-300 underline"
      onClick={() => open({ kind: "request", isolationId, requestId: crypto.randomUUID() })}>{msg("request")}</button>}
    {manage && isolationId === null && <p className="text-slate-400">{msg("needsIsolation")}</p>}
    {list.data?.records.map((row) => {
      const differentQuantity = row.performedQuantity !== null && !Money.decimal(row.performedQuantity).eq(row.quantity);
      const needsReconciliation = row.status === "EXECUTED" && differentQuantity && !row.reconciledById;
      const hasInvestigation = Boolean(row.investigations?.length);
      const independentReviewer = review && Number(user?.id) !== row.requestedById && Number(user?.id) !== row.recordedById;
      return <div key={row.id} className="space-y-1 rounded border border-slate-700 p-2">
        <p><bdi>#{row.id}</bdi> · {msg(row.status)} · {msg("quantity")} <bdi>{row.quantity}</bdi></p>
        <p className="text-slate-400">{msg("snapshot")} <bdi>{row.isolation.isolatedQuantity} / {row.isolation.onHand} · {row.isolation.location}</bdi></p>
        <p><bdi>{[row.reason, row.reviewNote, row.cancellationNote].filter(Boolean).join(" · ")}</bdi></p>
        {row.performedAt && <p>{msg("evidence")} <bdi>{row.evidenceReference} · {row.performedBy} · {row.performedQuantity} · {new Date(row.performedAt).toLocaleString(i18n.language)}</bdi></p>}
        {needsReconciliation && <p className="text-amber-300">{msg("difference")}</p>}
        {row.reconciledAt && <div className="text-slate-300">
          <p>{msg("reconciled")} <bdi>#{row.reconciledById} · {new Date(row.reconciledAt).toLocaleString(i18n.language)}</bdi></p>
          <p>{msg("countedRemaining")} <bdi>{row.countedRemaining} · {row.reconciliationReference} · {row.reconciliationNote}</bdi></p>
        </div>}
        {row.movementId && <p>{msg("movement")} <bdi>#{row.movementId}</bdi> · {row.accountingEntryId ? <>{msg("journal")} <bdi>#{row.accountingEntryId}</bdi></> : msg("zeroValue")}</p>}
        {!form && <div className="flex flex-wrap gap-3 text-sky-300">
          {review && row.status === "REQUESTED" && Number(user?.id) !== row.requestedById &&
            (["APPROVE", "REJECT"] as const).map((decision) => <button type="button" key={decision}
              onClick={() => open({ kind: "review", id: row.id, decision })}>{msg(decision)}</button>)}
          {review && (row.status === "REQUESTED" || row.status === "APPROVED") && <button type="button"
            onClick={() => open({ kind: "review", id: row.id, decision: "CANCEL" })}>{msg("CANCEL")}</button>}
          {manage && row.status === "APPROVED" && <button type="button"
            onClick={() => open({ kind: "evidence", id: row.id }, row.quantity)}>{msg("evidence")}</button>}
          {independentReviewer && needsReconciliation && !hasInvestigation && <button type="button"
            onClick={() => open({ kind: "reconcile", id: row.id })}>{msg("reconcile")}</button>}
          {(manage || review) && (needsReconciliation || hasInvestigation) && investigationId !== row.id && <button type="button"
            onClick={() => setInvestigationId(row.id)}>{msg("investigation.title")}</button>}
          {post && row.status === "EXECUTED" && !needsReconciliation && <button type="button"
            onClick={() => open({ kind: "post", id: row.id })}>{msg("post")}</button>}
        </div>}
        {investigationId === row.id && <RecallDisposalInvestigation key={row.id}
          path={`${path}/${row.id}/investigations`} recallKey={recallKey} actorId={Number(user?.id)}
          canSubmit={Boolean(manage && needsReconciliation)} canReview={Boolean(independentReviewer && needsReconciliation)}
          onClose={() => setInvestigationId(null)} />}
      </div>;
    })}
    {!form && <div className="flex gap-3 text-sky-300">
      {cursors.length > 0 && <button type="button" onClick={() => setCursors((current) => current.slice(0, -1))}>{t("inventory.recall.previous")}</button>}
      {list.data?.nextBefore != null && <button type="button" onClick={() => setCursors((current) => [...current, list.data!.nextBefore!])}>{msg("older")}</button>}
    </div>}
    {form && <form className="space-y-2 rounded border border-slate-600 p-3" onSubmit={(event) => {
      event.preventDefault();
      if (!save.isPending && (form.kind !== "request" || isolationId !== null)) save.mutate(form);
    }}>
      <p>{msg(label!)} {"id" in form && <bdi>#{form.id}</bdi>}</p>
      <fieldset disabled={save.isPending} className="space-y-2">
        {(form.kind === "request" || form.kind === "evidence" || form.kind === "reconcile") && <label className="block">
          {msg(form.kind === "reconcile" ? "countedRemaining" : "quantity")}
          <input className="ms-2 rounded bg-slate-800 p-1" required inputMode="decimal" pattern={quantityPattern} value={fields.quantity}
            onChange={(event) => edit("quantity", event.target.value)} /></label>}
        {(form.kind === "request" || form.kind === "review" || form.kind === "reconcile") && <label className="block">{msg("note")}
          <input className="ms-2 rounded bg-slate-800 p-1" required minLength={5} maxLength={1000} value={fields.note}
            onChange={(event) => edit("note", event.target.value)} /></label>}
        {form.kind === "reconcile" && <label className="block">{msg("reconciliationReference")}
          <input className="ms-2 rounded bg-slate-800 p-1" required minLength={3} maxLength={200}
            value={fields.reference} onChange={(event) => edit("reference", event.target.value)} /></label>}
        {form.kind === "evidence" && <>
          {(["evidenceReference", "performedBy"] as const).map((key) => <label key={key} className="block">{msg(key)}
            <input className="ms-2 rounded bg-slate-800 p-1" required minLength={key === "performedBy" ? 2 : 3} maxLength={200}
              value={fields[key]} onChange={(event) => edit(key, event.target.value)} /></label>)}
          <label className="block">{msg("performedAt")}
            <input className="ms-2 rounded bg-slate-800 p-1" required type="datetime-local" step={1}
              value={fields.performedAt} onChange={(event) => edit("performedAt", event.target.value)} />
            <span className="ms-2">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></label>
        </>}
        {form.kind === "post" && <p>{msg("postEffect")}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={form.kind === "request" && isolationId === null} className="rounded bg-sky-700 px-3 py-1">{msg(label!)}</button>
          <button type="button" onClick={() => setForm(null)}>{t("common.cancel")}</button>
        </div>
      </fieldset>
      {save.isError && <p role="alert" className="text-rose-300">{failure}</p>}
    </form>}
  </div>;
}
