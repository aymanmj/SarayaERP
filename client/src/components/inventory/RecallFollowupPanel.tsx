import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../api/apiClient";
import { useAuth } from "../../hooks/useAuth";
import { RecallContactHistory, type ContactAudience, type ContactOutcome } from "./RecallContactHistory";
import { RecallSupplierReceipts } from "./RecallSupplierReceipts";
import { RecallDisposals } from "./RecallDisposals";

type StockRow = {
  id: number;
  version: number;
  quantity: string;
  warehouse: { name: string };
  isolationCurrent: boolean;
  unverifiedQuantity: string;
  latestIsolation: {
    id: number;
    isolatedQuantity: string;
    location: string;
    reason: string;
    recordedAt: string;
  } | null;
};

type Followup = {
  batchNumber: string;
  reason: string;
  recalledAt: string;
  canViewPatientIdentity: boolean;
  stocks: StockRow[];
  movements: {
    id: number;
    createdAt: string;
    quantity: string;
    referenceType: string | null;
    referenceId: number | null;
    sourceWarehouse: string | null;
    targetWarehouse: string | null;
    department: string | null;
    transferStatus: string | null;
    linked: boolean;
    patient: string | null;
    mrn: string | null;
    canContactPatient: boolean;
    canContactDepartment: boolean;
    patientOutcome: ContactOutcome | null;
    departmentOutcome: ContactOutcome | null;
    canRecordSupplierReceipt: boolean;
  }[];
  nextBefore: number | null;
};

export function RecallFollowupPanel({ stockId, onClose }: { stockId: number; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { user, hasPermission } = useAuth();
  const client = useQueryClient();
  const [cursors, setCursors] = useState<number[]>([]);
  const [contact, setContact] = useState<{ movementId: number; audience: ContactAudience } | null>(null);
  const [supplierMovement, setSupplierMovement] = useState<number | null>(null);
  const [disposalStock, setDisposalStock] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ stock: StockRow; isolatedQuantity: string; location: string; reason: string; requestId: string } | null>(null);
  const canReadPatient = hasPermission("patients:view") || user?.permissions.includes("ADMIN_FULL_ACCESS") === true;
  const baseKey = ["inventory-recall", user?.hospitalId, user?.id, canReadPatient, stockId];
  const query = useQuery({
    queryKey: [...baseKey, cursors.at(-1)],
    queryFn: async () => (await apiClient.get<Followup>(`/inventory/stock/${stockId}/recall-followup`, {
      params: { before: cursors.at(-1) },
    })).data,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const record = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("No isolation evidence");
      return apiClient.post(`/inventory/stock/${draft.stock.id}/recall-isolation`, {
        stockVersion: draft.stock.version, isolatedQuantity: draft.isolatedQuantity,
        location: draft.location.trim(), reason: draft.reason.trim(), requestId: draft.requestId,
      });
    },
    onSuccess: async () => {
      setDraft(null);
      await client.invalidateQueries({ queryKey: baseKey });
    },
  });
  const data = query.data;
  const msg = (key: string) => t(`inventory.recall.${key}`);
  const typeLabel = (value: string | null) => value ? t(`inventory.recall.types.${value}`, value) : "—";
  const localDate = (value: string) => new Date(value).toLocaleString(i18n.language);

  return <section className="mb-4 space-y-4 rounded-xl border border-amber-800/60 bg-slate-900 p-4">
    <div className="flex items-center justify-between">
      <h4 className="font-semibold text-amber-200">{msg("title")} {data && <bdi>· {data.batchNumber}</bdi>}</h4>
      <button type="button" onClick={onClose} disabled={record.isPending} className="px-2 py-1 text-slate-300">{t("common.close", "إغلاق")}</button>
    </div>
    {query.isPending && <p role="status">{msg("loading")}</p>}
    {query.isError && <p role="alert">{msg("loadFailed")} <button type="button" onClick={() => void query.refetch()} className="underline">{msg("refresh")}</button></p>}
    {data && <>
      <p className="text-sm text-slate-300">{localDate(data.recalledAt)} · <bdi>{data.reason}</bdi></p>
      <h5 className="font-medium">{msg("isolation")}</h5>
      <ul className="space-y-2 text-sm">
        {data.stocks.map((stock) => <li key={stock.id} className="rounded border border-slate-700 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>{stock.warehouse.name} · {msg("onHand")} <bdi>{stock.quantity}</bdi>
              {stock.unverifiedQuantity !== "0" && <> · {msg("unverified")} <bdi>{stock.unverifiedQuantity}</bdi></>}
            </p>
            <button type="button" disabled={record.isPending} className="text-sky-300 underline" onClick={() => {
              record.reset();
              setDraft({ stock, isolatedQuantity: "", location: "", reason: "", requestId: crypto.randomUUID() });
            }}>{msg("recordIsolation")}</button>
          </div>
          {stock.latestIsolation && <p className="mt-1 text-slate-400">
            {msg("isolated")} <bdi>{stock.latestIsolation.isolatedQuantity}</bdi> · <bdi>{stock.latestIsolation.location}</bdi> · {localDate(stock.latestIsolation.recordedAt)}
            {!stock.isolationCurrent && <span className="ms-2 text-amber-300">{msg("stale")}</span>}
            <bdi className="block">{stock.latestIsolation.reason}</bdi>
          </p>}
          <button type="button" className="mt-1 text-sky-300 underline" aria-expanded={disposalStock === stock.id}
            onClick={() => setDisposalStock(disposalStock === stock.id ? null : stock.id)}>{msg("disposal.title")}</button>
          {disposalStock === stock.id && <RecallDisposals key={stock.id} stockId={stock.id} recallKey={baseKey}
            isolationId={stock.isolationCurrent ? stock.latestIsolation?.id ?? null : null} />}
        </li>)}
      </ul>
      {draft && <form className="space-y-2 rounded border border-sky-800 p-3 text-sm" onSubmit={(event) => {
        event.preventDefault();
        if (!record.isPending && draft.location.trim().length >= 2 && draft.reason.trim().length >= 5) record.mutate();
      }}>
        <p>{msg("recordIsolation")} · {draft.stock.warehouse.name}</p>
        <label className="block">{msg("isolated")}<input className="ms-2 rounded bg-slate-800 p-1" required inputMode="decimal"
          pattern="(0|[1-9][0-9]{0,14})([.][0-9]{1,3})?" disabled={record.isPending} value={draft.isolatedQuantity}
          onChange={(event) => setDraft({ ...draft, isolatedQuantity: event.target.value, requestId: crypto.randomUUID() })} /></label>
        {(["location", "reason"] as const).map((field) => <label key={field} className="block">{msg(field)}
          <input className="ms-2 rounded bg-slate-800 p-1" required minLength={field === "location" ? 2 : 5}
            maxLength={field === "location" ? 200 : 1000} disabled={record.isPending} value={draft[field]}
            onChange={(event) => setDraft({ ...draft, [field]: event.target.value, requestId: crypto.randomUUID() })} />
        </label>)}
        {record.isError && <p role="alert" className="text-rose-300">{msg("saveFailed")} <button type="button" className="underline" onClick={() => { setDraft(null); void query.refetch(); }}>{msg("refresh")}</button></p>}
        <button type="submit" disabled={record.isPending} className="rounded bg-sky-700 px-3 py-1">{t("common.save")}</button>
        <button type="button" disabled={record.isPending} onClick={() => setDraft(null)} className="px-3 py-1">{t("common.cancel")}</button>
      </form>}
      <h5 className="font-medium">{msg("movements")}</h5>
      {!data.canViewPatientIdentity && <p className="text-sm text-slate-400">{msg("identityRestricted")}</p>}
      {data.movements.length === 0 && <p className="text-sm text-slate-400">{msg("noMovements")}</p>}
      <ul className="divide-y divide-slate-700 text-sm">
        {data.movements.map((movement) => <li key={movement.id} className="py-2">
          <p>{localDate(movement.createdAt)} · {typeLabel(movement.referenceType)} <bdi>#{movement.referenceId ?? movement.id}</bdi> · <bdi>{movement.quantity}</bdi></p>
          <p className="text-slate-400">
            {[movement.sourceWarehouse, movement.targetWarehouse, movement.department, movement.transferStatus && t(`inventory.recall.transfer.${movement.transferStatus}`, movement.transferStatus)].filter(Boolean).join(" · ")}
          </p>
          {movement.patient && <p><bdi>{movement.patient} · {movement.mrn}</bdi></p>}
          {!movement.linked && <p className="text-amber-300">{msg("unlinked")}</p>}
          <div className="flex flex-wrap gap-3 text-sky-300">
            {movement.canContactPatient && <button type="button" onClick={() => setContact({ movementId: movement.id, audience: "PATIENT" })}>
              {msg("contact.PATIENT")} · {msg(`contact.outcomes.${movement.patientOutcome ?? "PENDING"}`)}
            </button>}
            {movement.canContactDepartment && <button type="button" onClick={() => setContact({ movementId: movement.id, audience: "DEPARTMENT" })}>
              {msg("contact.DEPARTMENT")} · {msg(`contact.outcomes.${movement.departmentOutcome ?? "PENDING"}`)}
            </button>}
            {movement.canRecordSupplierReceipt && <button type="button" onClick={() => setSupplierMovement(movement.id)}>
              {msg("supplierReceipt.title")}
            </button>}
          </div>
          {contact?.movementId === movement.id &&
            (contact.audience === "DEPARTMENT" ? movement.canContactDepartment : movement.canContactPatient) &&
            <RecallContactHistory key={`${contact.movementId}:${contact.audience}`} stockId={stockId} movementId={movement.id}
              audience={contact.audience} recallKey={baseKey} onClose={() => setContact(null)} />}
          {supplierMovement === movement.id && movement.canRecordSupplierReceipt &&
            <RecallSupplierReceipts stockId={stockId} movementId={movement.id} recallKey={baseKey} onClose={() => setSupplierMovement(null)} />}
        </li>)}
      </ul>
      <div className="flex gap-4 text-sm text-sky-300">
        {cursors.length > 0 && <button type="button" onClick={() => { setContact(null); setSupplierMovement(null); setCursors((current) => current.slice(0, -1)); }}>{msg("previous")}</button>}
        {data.nextBefore !== null && <button type="button" onClick={() => { setContact(null); setSupplierMovement(null); setCursors((current) => [...current, data.nextBefore!]); }}>{msg("older")}</button>}
      </div>
    </>}
  </section>;
}
