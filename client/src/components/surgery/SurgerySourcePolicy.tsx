import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/hooks/useAuth";

type Policy = {
  warehouseId: number | null;
  warehouse: { id: number; name: string; isActive: boolean } | null;
};

export function SurgerySourcePolicy() {
  const { user, hasPermission } = useAuth();
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith("ar");
  const cache = useQueryClient();
  const canManage =
    hasPermission("surgery:source:manage") ||
    user?.permissions?.includes("ADMIN_FULL_ACCESS") === true;
  const canRead = canManage || hasPermission("surgery:view");
  const key = ["surgery-source-policy", user?.id, user?.hospitalId];
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const policy = useQuery({
    queryKey: key,
    enabled: canRead,
    queryFn: async () =>
      (await apiClient.get<Policy>("/surgery/source-policy")).data,
  });
  const warehouses = useQuery({
    queryKey: ["surgery-source-warehouses", user?.id, user?.hospitalId],
    enabled: canManage,
    queryFn: async () =>
      (
        await apiClient.get<{ id: number; name: string }[]>(
          "/surgery/source-policy/warehouses",
        )
      ).data,
  });
  async function save() {
    if (!canManage || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await apiClient.put("/surgery/source-policy", {
        warehouseId: Number(warehouseId),
        reason: reason.trim(),
      });
      setWarehouseId("");
      setReason("");
      await cache.invalidateQueries({ queryKey: key });
      setMessage(
        ar
          ? "تم حفظ مصدر العمليات للحركات التالية."
          : "Surgery source saved for subsequent movements.",
      );
    } catch (error: unknown) {
      const detail = isAxiosError<{ message?: string | string[] }>(error)
        ? error.response?.data?.message
        : undefined;
      setMessage(
        Array.isArray(detail)
          ? detail.join("، ")
          : detail ||
              (ar ? "تعذر حفظ مصدر العمليات" : "Could not save surgery source"),
      );
    } finally {
      setBusy(false);
    }
  }
  if (!canRead) return null;
  return (
    <aside className="rounded-xl border border-slate-700 p-4 space-y-3">
      <h2 className="font-bold">
        {ar ? "مصدر مخزون العمليات" : "Surgery stock source"}
      </h2>
      {policy.isPending ? (
        <p>{ar ? "جارٍ تحميل الإعداد" : "Loading configuration"}</p>
      ) : policy.isError ? (
        <p role="alert">
          {ar ? "تعذر قراءة مصدر العمليات" : "Could not load surgery source"}
        </p>
      ) : policy.data?.warehouse ? (
        <p>
          {policy.data.warehouse.name} (#{policy.data.warehouse.id})
          {!policy.data.warehouse.isActive && (
            <span role="alert">
              {" "}
              —{" "}
              {ar
                ? "المخزن معطل؛الصرف والحركات متوقفة حتى اختيار مخزن نشط"
                : "Warehouse inactive; dispensing and movements require an active source"}
            </span>
          )}
        </p>
      ) : (
        <p role="alert">
          {ar
            ? "لم يُعيّن مصدر العمليات؛لن يُختار مخزن تلقائيًا. يلزم ضبط المصدر قبل الصرف أو تسجيل حركة."
            : "Surgery source is not configured. Select a source before dispensing or recording movements; no warehouse is selected automatically."}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {canManage && (
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            {ar ? "المخزن الجديد" : "New source warehouse"}
            <select
              className="block rounded bg-slate-800 p-2"
              required
              value={warehouseId}
              disabled={busy || warehouses.isPending || warehouses.isError}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">
                {ar ? "اختر مخزنًا نشطًا" : "Select an active warehouse"}
              </option>
              {warehouses.data?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ar ? "سبب تغيير المصدر" : "Reason for changing source"}
            <input
              className="block rounded bg-slate-800 p-2"
              required
              minLength={10}
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={
              busy ||
              !warehouseId ||
              reason.trim().length < 10 ||
              warehouses.isError ||
              policy.isError ||
              policy.isPending
            }
          >
            {ar ? "حفظ مصدر العمليات" : "Save surgery source"}
          </button>
        </form>
      )}
      {canManage && warehouses.isError && (
        <p role="alert">
          {ar ? "تعذر تحميل قائمة المخازن" : "Could not load warehouses"}
        </p>
      )}
    </aside>
  );
}
