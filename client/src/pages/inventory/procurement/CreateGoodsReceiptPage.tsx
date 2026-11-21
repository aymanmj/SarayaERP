import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { useAuth } from "@/hooks/useAuth";
import { procurementApi, type GoodsReceiptData } from "@/api/procurementApi";
import { apiClient } from "@/api/apiClient";
type Order = {
  id: number;
  poNumber: string | null;
  status: string;
  items: {
    id: number;
    productId: number;
    uomId: number | null;
    remainingQuantity: string;
    product: { name: string };
    uom: { name: string } | null;
  }[];
};
type Edit = { quantity: string; batchNumber: string; expiryDate: string };
export function CreateGoodsReceiptPage() {
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith("ar");
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canReceive =
    hasPermission("inventory:manage") ||
    user?.permissions?.includes("ADMIN_FULL_ACCESS") === true;
  const [poId, setPoId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [retryPayload, setRetryPayload] = useState<GoodsReceiptData | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const scope = [user?.id, user?.hospitalId];
  const orders = useQuery({
    queryKey: ["receipt-orders", ...scope],
    enabled: !!user,
    queryFn: async () =>
      (await apiClient.get<Order[]>("/procurement/orders")).data,
  });
  const warehouses = useQuery({
    queryKey: ["receipt-warehouses", ...scope],
    enabled: !!user,
    queryFn: async () =>
      (
        await apiClient.get<{ id: number; name: string; isActive?: boolean }[]>(
          "/inventory/warehouses",
        )
      ).data,
  });
  const order = useQuery({
    queryKey: ["receipt-order", ...scope, poId],
    enabled: !!poId && !!user,
    refetchOnWindowFocus: false,
    queryFn: async () =>
      (await apiClient.get<Order>(`/procurement/orders/${poId}`)).data,
  });
  const locked = busy || uncertain;
  function changed() {
    setRequestId(crypto.randomUUID());
    setMessage("");
  }
  function edit(id: number, key: keyof Edit, value: string) {
    setEdits((old) => ({
      ...old,
      [id]: {
        quantity: "",
        batchNumber: "",
        expiryDate: "",
        ...old[id],
        [key]: value,
      },
    }));
    changed();
  }
  const rows = order.data?.items ?? [];
  const selected = rows.filter((i) => edits[i.id]?.quantity);
  const ready =
    !!poId &&
    !!warehouseId &&
    selected.length > 0 &&
    !order.isError &&
    !!order.data &&
    ["SENT", "PARTIALLY_RECEIVED"].includes(order.data.status) &&
    selected.every(
      (i) =>
        !!i.uomId &&
        !!edits[i.id].batchNumber.trim() &&
        !!edits[i.id].expiryDate,
    );
  async function save() {
    if (!canReceive || busy || (!retryPayload && !ready)) return;
    setBusy(true);
    setMessage("");
    const payload: GoodsReceiptData = retryPayload ?? {
      poId: Number(poId),
      warehouseId: Number(warehouseId),
      requestId,
      notes: notes.trim() || undefined,
      items: selected.map((i) => ({
        purchaseOrderItemId: i.id,
        productId: i.productId,
        uomId: i.uomId!,
        quantity: edits[i.id].quantity,
        batchNumber: edits[i.id].batchNumber.trim(),
        expiryDate: new Date(edits[i.id].expiryDate).toISOString(),
      })),
    };
    try {
      await procurementApi.createGRN(payload);
      setRetryPayload(null);
      setUncertain(false);
      navigate("/inventory/dashboard");
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      setUncertain(!status || status >= 500);
      setRetryPayload(!status || status >= 500 ? payload : null);
      const text = isAxiosError<{ message?: string | string[] }>(error)
        ? error.response?.data?.message
        : undefined;
      setMessage(
        Array.isArray(text)
          ? text.join("، ")
          : text ||
              (ar
                ? "تعذر تأكيد الاستلام؛أعد المحاولة بنفس البيانات"
                : "Could not confirm receipt; retry with the same details"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="p-6 space-y-5 text-slate-100" dir={ar ? "rtl" : "ltr"}>
      <h1 className="text-2xl font-bold">
        {ar ? "استلام أمر شراء" : "Receive a purchase order"}
      </h1>
      <p>
        {ar
          ? "استلم من بنود الطلب المعتمدة وبوحدتها فقط. اترك كمية البند فارغة إذا لم يصل؛لا تضاف أصناف خارج أمر الشراء."
          : "Receive only ordered lines in their ordered unit. Leave a quantity empty when a line was not delivered; unrelated products cannot be added."}
      </p>
      {message && <p role="alert">{message}</p>}
      {!canReceive ? (
        <p>
          {ar
            ? "صلاحية إدارة المخزون مطلوبة للاستلام"
            : "Inventory management permission is required"}
        </p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-wrap gap-4">
            <label>
              {ar ? "أمر الشراء" : "Purchase order"}
              <select
                required
                value={poId}
                disabled={locked || orders.isError}
                onChange={(e) => {
                  setPoId(e.target.value);
                  setEdits({});
                  changed();
                }}
                className="block bg-slate-800 p-2"
              >
                <option value="">{ar ? "اختر الطلب" : "Select order"}</option>
                {orders.data
                  ?.filter((p) =>
                    ["SENT", "PARTIALLY_RECEIVED"].includes(p.status),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.poNumber || `#${p.id}`}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {ar ? "المخزن المستلم" : "Receiving warehouse"}
              <select
                required
                value={warehouseId}
                disabled={locked || warehouses.isError}
                onChange={(e) => {
                  setWarehouseId(e.target.value);
                  changed();
                }}
                className="block bg-slate-800 p-2"
              >
                <option value="">
                  {ar ? "اختر المخزن" : "Select warehouse"}
                </option>
                {warehouses.data
                  ?.filter((w) => w.isActive !== false)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {order.isFetching && (
            <p>{ar ? "جارٍ تحميل الطلب" : "Loading order"}</p>
          )}
          {poId && (
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                changed();
                void order.refetch();
              }}
            >
              {ar ? "تحديث متبقي الطلب" : "Refresh remaining quantities"}
            </button>
          )}
          {(orders.isError || order.isError || warehouses.isError) && (
            <p role="alert">
              {ar
                ? "تعذر تحميل بيانات الاستلام"
                : "Could not load receiving data"}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {(ar
                    ? [
                        "الصنف",
                        "الوحدة المعتمدة",
                        "المتبقي",
                        "الكمية الواصلة",
                        "التشغيلة",
                        "الصلاحية",
                      ]
                    : [
                        "Product",
                        "Ordered unit",
                        "Remaining",
                        "Received quantity",
                        "Batch",
                        "Expiry",
                      ]
                  ).map((h) => (
                    <th className="p-2" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td className="p-2">{i.product.name}</td>
                    <td>{i.uom?.name || "—"}</td>
                    <td>{i.remainingQuantity}</td>
                    <td>
                      <input
                        aria-label={`Quantity ${i.id}`}
                        type="text"
                        inputMode="decimal"
                        pattern="(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?"
                        disabled={locked}
                        value={edits[i.id]?.quantity ?? ""}
                        onChange={(e) => edit(i.id, "quantity", e.target.value)}
                        className="bg-slate-800 p-2"
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Batch ${i.id}`}
                        maxLength={100}
                        disabled={locked}
                        value={edits[i.id]?.batchNumber ?? ""}
                        onChange={(e) =>
                          edit(i.id, "batchNumber", e.target.value)
                        }
                        className="bg-slate-800 p-2"
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Expiry ${i.id}`}
                        type="date"
                        disabled={locked}
                        value={edits[i.id]?.expiryDate ?? ""}
                        onChange={(e) =>
                          edit(i.id, "expiryDate", e.target.value)
                        }
                        className="bg-slate-800 p-2"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label>
            {ar ? "ملاحظات" : "Notes"}
            <input
              maxLength={500}
              value={notes}
              disabled={locked}
              onChange={(e) => {
                setNotes(e.target.value);
                changed();
              }}
              className="block bg-slate-800 p-2"
            />
          </label>
          {uncertain && (
            <p>
              {ar
                ? "لم تتأكد النتيجة؛مرجع العملية"
                : "Uncertain result; operation reference"}
              : {requestId}
            </p>
          )}
          <button type="submit" disabled={busy || (!retryPayload && !ready)}>
            {ar ? "تأكيد الاستلام" : "Confirm receipt"}
          </button>
        </form>
      )}
    </div>
  );
}
