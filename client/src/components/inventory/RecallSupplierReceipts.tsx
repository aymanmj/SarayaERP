import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../api/apiClient";
import { Money } from "../../utils/money";

type History = {
  returnId: number;
  supplier: string;
  returnedQuantity: string;
  acknowledgedQuantity: string;
  outstandingQuantity: string;
  records: {
    id: number;
    quantity: string;
    evidenceReference: string;
    receivedBy: string;
    receivedAt: string;
    recordedById: number;
  }[];
  nextBefore: number | null;
};

const empty = {
  quantity: "",
  evidenceReference: "",
  receivedBy: "",
  receivedAt: "",
};

export function RecallSupplierReceipts({
  stockId,
  movementId,
  recallKey,
  onClose,
}: {
  stockId: number;
  movementId: number;
  recallKey: readonly unknown[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [cursors, setCursors] = useState<number[]>([]);
  const [form, setForm] = useState(empty);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const msg = (key: string) => t(`inventory.recall.supplierReceipt.${key}`);
  const path = `/inventory/stock/${stockId}/recall-supplier-receipts/${movementId}`;
  const history = useQuery({
    queryKey: [...recallKey, "supplier-receipts", movementId, cursors.at(-1)],
    queryFn: async () =>
      (
        await apiClient.get<History>(path, {
          params: { before: cursors.at(-1) },
        })
      ).data,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = history.data;
  const validQuantity =
    /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(form.quantity) &&
    Money.decimal(form.quantity).gt(0) &&
    Money.decimal(form.quantity).lte(data?.outstandingQuantity ?? "0");
  const receivedAt = new Date(form.receivedAt);
  const valid =
    validQuantity &&
    form.evidenceReference.trim().length >= 3 &&
    form.receivedBy.trim().length >= 2 &&
    Number.isFinite(receivedAt.getTime()) &&
    receivedAt <= new Date();
  const save = useMutation({
    mutationFn: () =>
      apiClient.post(path, {
        ...form,
        evidenceReference: form.evidenceReference.trim(),
        receivedBy: form.receivedBy.trim(),
        receivedAt: receivedAt.toISOString(),
        requestId,
      }),
    onSuccess: async () => {
      setForm(empty);
      setRequestId(crypto.randomUUID());
      await client.invalidateQueries({
        queryKey: [...recallKey, "supplier-receipts", movementId],
      });
    },
  });
  const change = (field: keyof typeof empty, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setRequestId(crypto.randomUUID());
  };

  return (
    <section className="mt-2 space-y-3 rounded border border-slate-700 bg-slate-950/50 p-3">
      <div className="flex justify-between gap-2">
        <h6 className="font-semibold">{msg("title")}</h6>
        <button
          type="button"
          disabled={save.isPending}
          onClick={onClose}
          className="text-sky-300"
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
      {data && (
        <>
          <p>
            {data.supplier} · {msg("returnNumber")} <bdi>#{data.returnId}</bdi>
          </p>
          <p className="text-slate-300">
            {msg("returned")} <bdi>{data.returnedQuantity}</bdi> ·{" "}
            {msg("acknowledged")} <bdi>{data.acknowledgedQuantity}</bdi> ·{" "}
            {msg("outstanding")} <bdi>{data.outstandingQuantity}</bdi>
          </p>
          <ol className="divide-y divide-slate-700">
            {data.records.map((item) => (
              <li key={item.id} className="py-2">
                <p>
                  <bdi>
                    {item.evidenceReference} · {item.receivedBy} ·{" "}
                    {item.quantity}
                  </bdi>
                </p>
                <p className="text-slate-400">
                  <bdi>
                    {new Date(item.receivedAt).toLocaleString(i18n.language)}
                  </bdi>{" "}
                  · {msg("actor")} <bdi>#{item.recordedById}</bdi>
                </p>
              </li>
            ))}
          </ol>
          <div className="flex gap-3 text-sky-300">
            {cursors.length > 0 && (
              <button
                type="button"
                onClick={() => setCursors((items) => items.slice(0, -1))}
              >
                {t("inventory.recall.previous")}
              </button>
            )}
            {data.nextBefore !== null && (
              <button
                type="button"
                disabled={save.isPending}
                onClick={() =>
                  setCursors((items) => [...items, data.nextBefore!])
                }
              >
                {msg("older")}
              </button>
            )}
          </div>
          {cursors.length === 0 &&
            Money.decimal(data.outstandingQuantity).gt(0) && (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (valid && !save.isPending) save.mutate();
                }}
              >
                <label className="block">
                  {msg("quantity")}
                  <input
                    required
                    inputMode="decimal"
                    value={form.quantity}
                    disabled={save.isPending}
                    onChange={(event) => change("quantity", event.target.value)}
                    className="ms-2 rounded bg-slate-800 p-1"
                  />
                </label>
                {(["evidenceReference", "receivedBy"] as const).map((field) => (
                  <label key={field} className="block">
                    {msg(field)}
                    <input
                      required
                      maxLength={200}
                      value={form[field]}
                      disabled={save.isPending}
                      onChange={(event) => change(field, event.target.value)}
                      className="ms-2 rounded bg-slate-800 p-1"
                    />
                  </label>
                ))}
                <label className="block">
                  {msg("receivedAt")}
                  <input
                    required
                    type="datetime-local"
                    value={form.receivedAt}
                    disabled={save.isPending}
                    onChange={(event) =>
                      change("receivedAt", event.target.value)
                    }
                    className="ms-2 rounded bg-slate-800 p-1"
                  />
                  <span className="ms-2 text-slate-400">
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </span>
                </label>
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
                  disabled={!valid || save.isPending}
                  className="rounded bg-sky-700 px-3 py-1 disabled:opacity-50"
                >
                  {msg("save")}
                </button>
              </form>
            )}
        </>
      )}
    </section>
  );
}
