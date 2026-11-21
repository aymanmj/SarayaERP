import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { useAuth } from "@/hooks/useAuth";
import { apiClient as api } from "@/api/apiClient";
import { formatMoney } from "@/utils/money";

type Line = {
  id: number;
  productId: number;
  product: { name: string; code: string | null };
  batchNumber: string | null;
  systemQty: string;
  physicalQty: string | null;
  variance: string;
  costPrice: string;
  revision: number;
  countedById: number | null;
};
type Count = {
  id: number;
  status: string;
  warehouse: { name: string };
  assignedToId: number | null;
  lines: Line[];
};
export function InventoryCountDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith("ar");
  const isNew = id === "new";
  const cache = useQueryClient();
  const [warehouseId, setWarehouseId] = useState("");
  const [type, setType] = useState("FULL");
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const admin = user?.permissions?.includes("ADMIN_FULL_ACCESS") === true;
  const canManage = admin || hasPermission("inventory:manage");
  const canPost = admin || hasPermission("inventory:counts:post");
  const key = ["inventory-count", user?.id, user?.hospitalId, id];
  const query = useQuery({
    queryKey: key,
    enabled: !isNew && !!id && !!user,
    refetchOnWindowFocus: false,
    queryFn: async () => (await api.get<Count>(`/inventory/counts/${id}`)).data,
  });
  const warehouses = useQuery({
    queryKey: ["count-warehouses", user?.id, user?.hospitalId],
    enabled: isNew && !!user,
    queryFn: async () =>
      (
        await api.get<{ id: number; name: string; isActive?: boolean }[]>(
          "/inventory/warehouses",
        )
      ).data,
  });
  function error(e: unknown) {
    const text = isAxiosError<{ message?: string | string[] }>(e)
      ? e.response?.data?.message
      : undefined;
    setMessage(
      Array.isArray(text)
        ? text.join("، ")
        : text || (ar ? "تعذر إتمام العملية" : "Operation failed"),
    );
  }
  async function create() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.post<{ id: number }>("/inventory/counts", {
        warehouseId: Number(warehouseId),
        type,
        notes: notes.trim(),
      });
      navigate(`/inventory/counts/${result.data.id}`);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(line: Line) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.put<Line>(
        `/inventory/counts/${id}/lines/${line.id}`,
        {
          physicalQty: drafts[line.id] ?? line.physicalQty ?? "",
          revision: line.revision,
        },
      );
      cache.setQueryData<Count>(key, (old) =>
        old
          ? {
              ...old,
              status: old.status === "DRAFT" ? "IN_PROGRESS" : old.status,
              lines: old.lines.map((l) =>
                l.id === line.id ? { ...l, ...result.data } : l,
              ),
            }
          : old,
      );
      setDrafts((old) => {
        const next = { ...old };
        delete next[line.id];
        return next;
      });
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function transition(status: string) {
    setBusy(true);
    setMessage("");
    try {
      if (status === "POSTED") await api.post(`/inventory/counts/${id}/post`);
      else await api.put(`/inventory/counts/${id}/status`, { status });
      await query.refetch();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  const count = query.data;
  const editable =
    canManage && !!count && ["DRAFT", "IN_PROGRESS"].includes(count.status);
  const dirty = Object.keys(drafts).length > 0;
  const allCounted =
    !!count?.lines.length && count.lines.every((l) => l.physicalQty !== null);
  const independent =
    !!count &&
    count.assignedToId !== user?.id &&
    !count.lines.some((l) => l.countedById === user?.id);
  return (
    <div className="p-6 space-y-5 text-slate-100" dir={ar ? "rtl" : "ltr"}>
      <button onClick={() => navigate("/inventory/counts")}>
        {ar ? "العودة لقائمة الجرد" : "Back to counts"}
      </button>
      <h1 className="text-2xl font-bold">
        {isNew
          ? ar
            ? "جرد مخزني جديد"
            : "New inventory count"
          : `${ar ? "جرد" : "Count"} #${id}`}
      </h1>
      <p>
        {ar
          ? "يجب عد كل بند صراحةً. حركة المخزون تستمر أثناء العد؛إذا تغيرت اللقطة يُرفض الترحيل ويلزم إلغاء الجرد وإعادة العد. يعتمد الجرد مستخدم مستقل عن منفذ العد."
          : "Confirm every line explicitly. Stock movements continue during counting; changed snapshots require cancellation and recounting. Posting requires an independent approver."}
      </p>
      {message && <p role="alert">{message}</p>}
      {isNew ? (
        canManage ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label>
              {ar ? "المخزن" : "Warehouse"}
              <select
                required
                disabled={busy || warehouses.isError}
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="block bg-slate-800 p-2"
              >
                <option value="">
                  {ar ? "اختر المخزن" : "Select warehouse"}
                </option>
                {warehouses.data
                  ?.filter((w) => w.isActive !== false)
                  .map((w) => (
                    <option value={w.id} key={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {ar ? "نوع الجرد" : "Count type"}
              <select
                value={type}
                disabled={busy}
                onChange={(e) => setType(e.target.value)}
                className="block bg-slate-800 p-2"
              >
                <option value="FULL">{ar ? "شامل" : "Full"}</option>
                <option value="QUARTERLY">
                  {ar ? "ربع سنوي" : "Quarterly"}
                </option>
                <option value="SPOT_CHECK">
                  {ar ? "مفاجئ" : "Spot check"}
                </option>
              </select>
            </label>
            <label>
              {ar ? "ملاحظات" : "Notes"}
              <input
                maxLength={500}
                value={notes}
                disabled={busy}
                onChange={(e) => setNotes(e.target.value)}
                className="block bg-slate-800 p-2"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !warehouseId || warehouses.isError}
            >
              {ar ? "أخذ لقطة وبدء الجرد" : "Take snapshot and create count"}
            </button>
            {warehouses.isError && (
              <p role="alert">
                {ar ? "تعذر تحميل المخازن" : "Could not load warehouses"}
              </p>
            )}
          </form>
        ) : (
          <p>
            {ar
              ? "ليست لديك صلاحية إنشاء الجرد"
              : "Count management permission is required"}
          </p>
        )
      ) : query.isPending ? (
        <p>{ar ? "جارٍ التحميل" : "Loading"}</p>
      ) : query.isError ? (
        <p role="alert">{ar ? "تعذر تحميل الجرد" : "Could not load count"}</p>
      ) : (
        count && (
          <>
            <p>
              {count.warehouse.name} — {count.status}
            </p>
            <div className="flex flex-wrap gap-4">
              {dirty && <button disabled={busy} onClick={() => { setDrafts({}); void query.refetch(); }}>{ar ? 'استبعاد التعديلات المحلية وإعادة التحميل' : 'Discard local edits and reload'}</button>}
              <button
                disabled={busy || dirty}
                onClick={() => void query.refetch()}
              >
                {ar ? "تحديث البيانات" : "Reload"}
              </button>
              <button
                onClick={() =>
                  window.open(`/inventory/counts/${id}/print`, "_blank")
                }
              >
                {ar ? "طباعة" : "Print"}
              </button>
              {canManage && count.status === "IN_PROGRESS" && (
                <button
                  disabled={busy || dirty || !allCounted}
                  onClick={() => void transition("REVIEW")}
                >
                  {ar ? "إرسال للمراجعة" : "Submit for review"}
                </button>
              )}
              {canManage && count.status === "REVIEW" && (
                <button
                  disabled={busy}
                  onClick={() => void transition("IN_PROGRESS")}
                >
                  {ar ? "إعادة للعد" : "Return to counting"}
                </button>
              )}
              {canPost && count.status === "REVIEW" && (
                <button
                  disabled={busy || !independent}
                  onClick={() => void transition("POSTED")}
                >
                  {ar ? "اعتماد وترحيل مستقل" : "Approve and post"}
                </button>
              )}
              {canManage && !["POSTED", "CANCELLED"].includes(count.status) && (
                <button
                  disabled={busy || dirty}
                  onClick={() => void transition("CANCELLED")}
                >
                  {ar ? "إلغاء الجرد" : "Cancel count"}
                </button>
              )}
            </div>
            {canPost && count.status === "REVIEW" && !independent && (
              <p>
                {ar
                  ? "لا يجوز اعتماد الجرد الذي شاركت في عده"
                  : "You cannot approve a count you participated in"}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {(ar
                      ? [
                          "الصنف",
                          "التشغيلة",
                          "لقطة النظام",
                          "العد الفعلي",
                          "الفرق",
                          "تكلفة الوحدة",
                          "الحفظ",
                        ]
                      : [
                          "Product",
                          "Batch",
                          "Snapshot quantity",
                          "Physical count",
                          "Variance",
                          "Unit cost",
                          "Save",
                        ]
                    ).map((h) => (
                      <th className="p-2" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {count.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="p-2">{line.product.name}</td>
                      <td>{line.batchNumber}</td>
                      <td>{line.systemQty}</td>
                      <td>
                        {editable ? (
                          <input
                            aria-label={`${ar ? "عد" : "Count"} ${line.id}`}
                            type="text"
                            inputMode="decimal"
                            value={drafts[line.id] ?? line.physicalQty ?? ""}
                            disabled={busy}
                            onChange={(e) =>
                              setDrafts((old) => ({
                                ...old,
                                [line.id]: e.target.value,
                              }))
                            }
                            className="bg-slate-800 p-2"
                          />
                        ) : (
                          (line.physicalQty ?? (ar ? "لم يُعد" : "Not counted"))
                        )}
                      </td>
                      <td>{line.physicalQty === null ? "—" : line.variance}</td>
                      <td>{formatMoney(line.costPrice, false)}</td>
                      <td>
                        {editable && (
                          <button
                            disabled={
                              busy ||
                              (drafts[line.id] ?? line.physicalQty ?? "") === ""
                            }
                            onClick={() => void save(line)}
                          >
                            {ar ? "تأكيد العد" : "Confirm count"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
}
