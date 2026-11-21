import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../api/apiClient";

type Findings = {
  id: number;
  status: "SUBMITTED" | "RESOLVED" | "ESCALATED";
  countedRemaining: string;
  countReference: string;
  findings: string;
  movementIds: number[];
  submittedById: number;
  reviewedById: number | null;
  decisionNote: string | null;
};
type History = {
  records: Findings[];
  version: number;
  nextBefore: number | null;
  movements: { id: number; type: string; quantity: string; referenceType: string | null; createdAt: string }[];
};
type Form =
  | { kind: "submit"; requestId: string; version: number; movementIds: number[] }
  | { kind: "review"; id: number; decision: "RESOLVE" | "ESCALATE" };
const empty = { countedRemaining: "", countReference: "", findings: "", note: "" };

export function RecallDisposalInvestigation({ path, recallKey, canSubmit, canReview, actorId, onClose }: {
  path: string;
  recallKey: readonly unknown[];
  canSubmit: boolean;
  canReview: boolean;
  actorId: number;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [cursors, setCursors] = useState<number[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [fields, setFields] = useState(empty);
  const msg = (key: string) => t(`inventory.recall.disposal.investigation.${key}`);
  const query = useQuery({
    queryKey: [...recallKey, "investigation", path, cursors.at(-1)],
    queryFn: async () => (await apiClient.get<History>(path, { params: { before: cursors.at(-1) } })).data,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const save = useMutation({
    mutationFn: async (action: Form): Promise<void> => {
      if (action.kind === "review") {
        await apiClient.post(`${path}/${action.id}/review`, { decision: action.decision, note: fields.note.trim() });
        return;
      }
      await apiClient.post(path, {
        requestId: action.requestId, version: action.version, movementIds: action.movementIds,
        countedRemaining: fields.countedRemaining, countReference: fields.countReference.trim(), findings: fields.findings.trim(),
      });
    },
    onSuccess: async () => {
      setForm(null);
      setCursors([]);
      await client.invalidateQueries({ queryKey: recallKey });
    },
  });
  const data = query.data;
  const open = (action: Form) => {
    save.reset();
    setFields(empty);
    setForm(action);
  };
  const edit = (key: keyof typeof fields, value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }));
    if (form?.kind === "submit") setForm({ ...form, requestId: crypto.randomUUID() });
  };
  const error = isAxiosError<{ message?: string }>(save.error) &&
    [400, 409].includes(save.error.response?.status ?? 0) && typeof save.error.response?.data?.message === "string"
    ? save.error.response.data.message : t("inventory.recall.saveFailed");

  return <section className="space-y-3 rounded border border-slate-600 p-3">
    <div className="flex justify-between">
      <h6>{msg("title")}</h6>
      <button type="button" disabled={save.isPending} className="underline" onClick={onClose}>{t("common.close")}</button>
    </div>
    {query.isPending && <p role="status">{t("inventory.recall.loading")}</p>}
    {query.isError && <p role="alert">{t("inventory.recall.loadFailed")} <button type="button" className="underline"
      onClick={() => void query.refetch()}>{t("inventory.recall.refresh")}</button></p>}
    {data && <>
      <details open={form?.kind === "submit" || undefined} className="text-slate-300">
        <summary>{msg("movements")}</summary>
        {data.movements.length === 0 && <p>{t("inventory.recall.noMovements")}</p>}
        <ul className="divide-y divide-slate-700">
          {data.movements.map((movement) => <li key={movement.id} className="py-1">
            <bdi>#{movement.id} · {movement.quantity} · {new Date(movement.createdAt).toLocaleString(i18n.language)}</bdi>
            {" · "}{movement.referenceType ? t(`inventory.recall.types.${movement.referenceType}`, movement.referenceType) : msg(movement.type)}
          </li>)}
        </ul>
      </details>
      {canSubmit && !form && cursors.length === 0 && data.records[0]?.status !== "SUBMITTED" &&
        <button type="button" className="text-sky-300 underline" onClick={() => open({
          kind: "submit", requestId: crypto.randomUUID(), version: data.version,
          movementIds: data.movements.map(({ id }) => id),
        })}>{msg("submit")}</button>}
      {data.records.map((record) => <article key={record.id} className="space-y-1 rounded border border-slate-700 p-2">
        <p><bdi>#{record.id}</bdi> · {msg(record.status)} · {msg("countedRemaining")} <bdi>{record.countedRemaining}</bdi></p>
        <p>{msg("reference")} <bdi>{record.countReference}</bdi></p>
        <p className="whitespace-pre-wrap">{record.findings}</p>
        <p>{msg("reviewedMovements")} <bdi>{record.movementIds.length ? record.movementIds.map((id) => `#${id}`).join(" · ") : "—"}</bdi></p>
        {record.reviewedById && <p>{msg("reviewer")} <bdi>#{record.reviewedById}</bdi> · {record.decisionNote}</p>}
        {canReview && record.status === "SUBMITTED" && actorId !== record.submittedById && !form &&
          <div className="flex gap-3 text-sky-300">
            {(["RESOLVE", "ESCALATE"] as const).map((decision) => <button type="button" key={decision}
              onClick={() => open({ kind: "review", id: record.id, decision })}>{msg(decision)}</button>)}
          </div>}
      </article>)}
      {!form && <div className="flex gap-3 text-sky-300">
        {cursors.length > 0 && <button type="button" onClick={() => setCursors((items) => items.slice(0, -1))}>{t("inventory.recall.previous")}</button>}
        {data.nextBefore !== null && <button type="button" onClick={() => setCursors((items) => [...items, data.nextBefore!])}>{msg("older")}</button>}
      </div>}
    </>}
    {form && <form className="space-y-2" onSubmit={(event) => {
      event.preventDefault();
      if (!save.isPending) save.mutate(form);
    }}>
      <fieldset disabled={save.isPending} className="space-y-2">
        {form.kind === "submit" ? <>
          <label className="block">{msg("countedRemaining")}
            <input className="ms-2 rounded bg-slate-800 p-1" inputMode="decimal" required
              pattern="(0|[1-9][0-9]{0,14})([.][0-9]{1,3})?" value={fields.countedRemaining}
              onChange={(event) => edit("countedRemaining", event.target.value)} /></label>
          <label className="block">{msg("reference")}
            <input className="ms-2 rounded bg-slate-800 p-1" required minLength={3} maxLength={200} value={fields.countReference}
              onChange={(event) => edit("countReference", event.target.value)} /></label>
          <label className="block">{msg("findings")}
            <textarea className="mt-1 block w-full rounded bg-slate-800 p-1" required minLength={10} maxLength={2000} value={fields.findings}
              onChange={(event) => edit("findings", event.target.value)} /></label>
        </> : <label className="block">{msg("decisionNote")} <bdi>#{form.id}</bdi>
          <textarea className="mt-1 block w-full rounded bg-slate-800 p-1" required minLength={5} maxLength={1000} value={fields.note}
            onChange={(event) => edit("note", event.target.value)} /></label>}
        <div className="flex gap-3">
          <button type="submit" className="rounded bg-sky-700 px-3 py-1">{msg(form.kind === "submit" ? "submit" : form.decision)}</button>
          <button type="button" onClick={() => { setForm(null); void query.refetch(); }}>{t("common.cancel")}</button>
        </div>
      </fieldset>
      {save.isError && <p role="alert" className="text-rose-300">{error}</p>}
    </form>}
  </section>;
}
