import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/hooks/useAuth";

export function PharmacyAdjustmentForm({
  products,
  onPosted,
}: {
  products: { id: number; name: string }[];
  onPosted: () => Promise<void>;
}) {
  const { user, hasPermission } = useAuth();
  const { i18n } = useTranslation();
  const ar = i18n.language.startsWith("ar");
  const [product, setProduct] = useState("");
  const [batch, setBatch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const canAdjust =
    hasPermission("pharmacy:stock:adjust") ||
    user?.permissions?.includes("ADMIN_FULL_ACCESS") === true;
  function changed() {
    setRequestId(crypto.randomUUID());
    setMessage("");
  }
  async function save() {
    if (!canAdjust || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await apiClient.post("/pharmacy/stock/transactions", {
        drugItemId: Number(product),
        type: "ADJUST",
        quantity,
        batchNumber: batch.trim(),
        reason: reason.trim(),
        requestId,
      });
      // Retain the same request identity on an uncertain network failure.
      setUncertain(false);
      setMessage(ar ? "تم تسجيل التسوية" : "Adjustment posted");
      setQuantity("");
      setReason("");
      setRequestId(crypto.randomUUID());
      try {
        await onPosted();
      } catch {
        setMessage(
          ar
            ? "تمت التسوية؛تعذر تحديث القائمة،حدّث الصفحة"
            : "Adjustment posted; could not refresh the list",
        );
      }
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      setUncertain(!status || status >= 500);
      const detail = isAxiosError<{ message?: string | string[] }>(error)
        ? error.response?.data?.message
        : undefined;
      setMessage(
        Array.isArray(detail)
          ? detail.join("، ")
          : detail ||
              (ar
                ? "تعذر تأكيد التسوية؛يمكن إعادة المحاولة بنفس البيانات"
                : "Could not confirm adjustment; retry with the same details"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl bg-gray-900 border border-gray-800 p-4 space-y-4">
      <h2 className="font-semibold">
        {ar ? "تسوية مخزون الصيدلية" : "Pharmacy stock adjustment"}
      </h2>
      <p>
        {ar
          ? "التوريد يتم عبر مستندات المشتريات والاستلام. التسوية لتشغيلة موجودة وبالوحدة الأساسية وتكلفة التقييم المعتمدة؛الموجب زيادة والسالب نقص،وليس الرصيد النهائي."
          : "Use purchasing and receiving documents for receipts. Adjust an existing batch in base units at its approved valuation cost. Positive adds, negative removes; this is a change, not the final balance."}
      </p>
      {message && <p role="status">{message}</p>}
      {!canAdjust ? (
        <p>
          {ar
            ? "يلزم امتياز تسوية مخزون الصيدلية لتسجيل تعديل"
            : "Pharmacy stock adjustment permission is required"}
        </p>
      ) : (
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            {ar ? "الدواء" : "Drug"}
            <select
              required
              value={product}
              disabled={busy || uncertain}
              onChange={(e) => {
                setProduct(e.target.value);
                changed();
              }}
              className="block bg-slate-800 p-2"
            >
              <option value="">{ar ? "اختر الدواء" : "Select drug"}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {ar ? "التشغيلة الموجودة" : "Existing batch"}
            <input
              required
              maxLength={100}
              value={batch}
              disabled={busy || uncertain}
              onChange={(e) => {
                setBatch(e.target.value);
                changed();
              }}
              className="block bg-slate-800 p-2"
            />
          </label>
          <label>
            {ar ? "التغير في الكمية" : "Quantity change"}
            <input
              required
              type="text"
              inputMode="decimal"
              pattern="-?(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?"
              value={quantity}
              disabled={busy || uncertain}
              onChange={(e) => {
                setQuantity(e.target.value);
                changed();
              }}
              className="block bg-slate-800 p-2"
            />
          </label>
          <label>
            {ar ? "سبب التسوية" : "Adjustment reason"}
            <input
              required
              minLength={10}
              maxLength={500}
              value={reason}
              disabled={busy || uncertain}
              onChange={(e) => {
                setReason(e.target.value);
                changed();
              }}
              className="block bg-slate-800 p-2"
            />
          </label>
          <button
            type="submit"
            disabled={
              busy ||
              !product ||
              !batch.trim() ||
              !quantity ||
              reason.trim().length < 10
            }
          >
            {ar ? "تسجيل التسوية" : "Post adjustment"}
          </button>
        </form>
      )}
    </section>
  );
}
