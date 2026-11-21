import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { apiClient } from "@/api/apiClient";
type Payload = { productId: number; quantity: string; requestId: string };
export function SurgeryConsumableForm({
  caseId,
  products,
  onPosted,
}: {
  caseId: number;
  products: { id: number; name: string; type: string }[];
  onPosted: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1.000");
  const [pending, setPending] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  async function submit() {
    if (inFlight.current) return;
    if (
      !pending &&
      (!productId ||
        !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(quantity) ||
        !/[1-9]/.test(quantity))
    ) {
      setMessage("اختر مستلزمًا وكمية موجبة بدقة ثلاث خانات كحد أقصى");
      return;
    }
    const body = pending ?? {
      productId: Number(productId),
      quantity,
      requestId: crypto.randomUUID(),
    };
    inFlight.current = true;
    setBusy(true);
    setPending(body);
    setMessage("");
    try {
      await apiClient.post(`/surgery/cases/${caseId}/consumables`, body);
      setPending(null);
      setQuantity("1.000");
      setMessage("تم الصرف وتسجيل رسوم المستهلك بنجاح");
      try {
        onPosted();
      } catch {
        setMessage(
          "تم الصرف؛تعذر تحديث العرض. حدّث بيانات العملية دون إعادة الصرف",
        );
      }
    } catch (error: unknown) {
      const response = isAxiosError<{ message?: string | string[] }>(error)
        ? error.response
        : undefined;
      // A retry rejection cannot disprove an earlier commit whose reply was lost.
      if (
        !pending &&
        response &&
        [400, 401, 403, 404, 409, 422].includes(response.status)
      )
        setPending(null);
      const detail = response?.data?.message;
      setMessage(
        (Array.isArray(detail) ? detail.join("، ") : detail) ||
          "لم يتأكد الرد؛أعد المحاولة بالطلب نفسه دون تسجيل صرف جديد",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p>
        المستلزمات فقط؛الأدوية تخضع لدورة الصيدلية المعتمدة. الكمية بالوحدة
        الأساسية للصنف.
      </p>
      <label>
        المستلزم
        <select
          className="block bg-slate-900 p-2"
          value={productId}
          disabled={busy || !!pending}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">اختر المستلزم</option>
          {products
            .filter((p) => p.type === "SUPPLY")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        الكمية
        <input
          className="block bg-slate-900 p-2"
          inputMode="decimal"
          value={quantity}
          disabled={busy || !!pending}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>
      <button
        className="bg-amber-600 rounded p-2"
        disabled={busy}
        type="submit"
      >
        {busy
          ? "جارٍ الصرف"
          : pending
            ? "إعادة المحاولة بالطلب نفسه"
            : "صرف المستلزم"}
      </button>
      {pending && !busy && (
        <p role="alert">
          احتُفظ بالطلب حتى يتأكد الرد. لا تغلق الصفحة قبل حسم النتيجة.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
