import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../api/apiClient";

export type ContactAudience = "PATIENT" | "DEPARTMENT";
export type ContactOutcome = "ATTEMPTED" | "NOTIFIED" | "RESOLVED";
type ContactChannel =
  | "PHONE"
  | "IN_PERSON"
  | "SECURE_MESSAGE"
  | "INTERNAL_HANDOFF";
type History = {
  records: {
    id: number;
    movementId: number;
    outcome: ContactOutcome;
    channel: ContactChannel;
    note: string;
    recordedAt: string;
    recordedById: number;
  }[];
  nextBefore: number | null;
};

export function RecallContactHistory({
  stockId,
  movementId,
  audience,
  recallKey,
  onClose,
}: {
  stockId: number;
  movementId: number;
  audience: ContactAudience;
  recallKey: readonly unknown[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [cursors, setCursors] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState<ContactChannel>();
  const [chosenOutcome, setChosenOutcome] = useState<ContactOutcome>();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const path = `/inventory/stock/${stockId}/recall-contacts/${movementId}`;
  const msg = (key: string) => t(`inventory.recall.contact.${key}`);
  const history = useQuery({
    queryKey: [...recallKey, "contacts", movementId, audience, cursors.at(-1)],
    queryFn: async () =>
      (
        await apiClient.get<History>(path, {
          params: { audience, before: cursors.at(-1) },
        })
      ).data,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const previous = history.data?.records[0]?.outcome;
  const outcomes: ContactOutcome[] =
    previous === "RESOLVED"
      ? []
      : previous === "NOTIFIED"
        ? ["RESOLVED"]
        : ["ATTEMPTED", "NOTIFIED"];
  const outcome =
    chosenOutcome && outcomes.includes(chosenOutcome)
      ? chosenOutcome
      : undefined;
  const channels: ContactChannel[] = ["PHONE", "IN_PERSON", "SECURE_MESSAGE"];
  if (audience === "DEPARTMENT") channels.push("INTERNAL_HANDOFF");
  const save = useMutation({
    mutationFn: () =>
      apiClient.post(path, {
        audience,
        outcome,
        channel,
        note: note.trim(),
        requestId,
      }),
    onSuccess: async () => {
      setNote("");
      setChosenOutcome(undefined);
      setChannel(undefined);
      setRequestId(crypto.randomUUID());
      await client.invalidateQueries({ queryKey: recallKey });
    },
  });

  return (
    <section className="mt-2 space-y-3 rounded border border-slate-700 bg-slate-950/50 p-3">
      <div className="flex justify-between gap-2">
        <h6 className="font-semibold">{msg(audience)}</h6>
        <button
          type="button"
          disabled={save.isPending}
          className="text-sky-300"
          onClick={onClose}
        >
          {t("common.close", "إغلاق")}
        </button>
      </div>
      {history.isPending && <p role="status">{msg("loading")}</p>}
      {history.isError && (
        <p role="alert">
          {msg("loadFailed")}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void history.refetch()}
          >
            {msg("refresh")}
          </button>
        </p>
      )}
      {history.data && (
        <>
          {!history.data.records.length && (
            <p className="text-slate-400">{msg("empty")}</p>
          )}
          <ol className="divide-y divide-slate-700">
            {history.data.records.map((entry) => (
              <li key={entry.id} className="py-2">
                <p>
                  {msg(`outcomes.${entry.outcome}`)} ·{" "}
                  {msg(`channels.${entry.channel}`)} ·{" "}
                  <bdi>
                    {new Date(entry.recordedAt).toLocaleString(i18n.language)}
                  </bdi>
                </p>
                <p className="text-slate-400">
                  {msg("actor")} <bdi>#{entry.recordedById}</bdi> ·{" "}
                  {msg("movement")} <bdi>#{entry.movementId}</bdi>
                </p>
                <bdi className="block break-words">{entry.note}</bdi>
              </li>
            ))}
          </ol>
          <div className="flex gap-3 text-sky-300">
            {cursors.length > 0 && (
              <button
                type="button"
                onClick={() => setCursors((current) => current.slice(0, -1))}
              >
                {t("inventory.recall.previous")}
              </button>
            )}
            {history.data.nextBefore !== null && (
              <button
                type="button"
                disabled={save.isPending}
                onClick={() =>
                  setCursors((current) => [
                    ...current,
                    history.data.nextBefore!,
                  ])
                }
              >
                {msg("older")}
              </button>
            )}
          </div>
          {cursors.length === 0 && outcomes.length > 0 && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  outcome &&
                  channel &&
                  note.trim().length >= 5 &&
                  !save.isPending
                )
                  save.mutate();
              }}
            >
              <div className="flex flex-wrap gap-3">
                <label>
                  {msg("outcome")}
                  <select
                    required
                    value={outcome ?? ""}
                    disabled={save.isPending}
                    className="ms-2 rounded bg-slate-800 p-1"
                    onChange={(event) => {
                      setChosenOutcome(event.target.value as ContactOutcome);
                      setRequestId(crypto.randomUUID());
                    }}
                  >
                    <option value="" disabled>
                      {msg("select")}
                    </option>
                    {outcomes.map((option) => (
                      <option key={option} value={option}>
                        {msg(`outcomes.${option}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {msg("channel")}
                  <select
                    required
                    value={channel ?? ""}
                    disabled={save.isPending}
                    className="ms-2 rounded bg-slate-800 p-1"
                    onChange={(event) => {
                      setChannel(event.target.value as ContactChannel);
                      setRequestId(crypto.randomUUID());
                    }}
                  >
                    <option value="" disabled>
                      {msg("select")}
                    </option>
                    {channels.map((option) => (
                      <option key={option} value={option}>
                        {msg(`channels.${option}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                {msg("note")}
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  disabled={save.isPending}
                  value={note}
                  className="mt-1 block w-full rounded bg-slate-800 p-2"
                  onChange={(event) => {
                    setNote(event.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                />
              </label>
              {audience === "DEPARTMENT" && (
                <p className="text-slate-400">{msg("departmentPrivacy")}</p>
              )}
              {save.isError && (
                <p role="alert" className="text-rose-300">
                  {msg("saveFailed")}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void history.refetch()}
                  >
                    {msg("refresh")}
                  </button>
                </p>
              )}
              <button
                type="submit"
                disabled={
                  save.isPending ||
                  !outcome ||
                  !channel ||
                  note.trim().length < 5
                }
                className="rounded bg-sky-700 px-3 py-1 disabled:opacity-50"
              >
                {msg("record")}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
