import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
type Line = {
  id: number;
  productId: number | null;
  product?: { name: string; code: string } | null;
  quantity: number | string;
  remainingReturnQuantity: number | string;
  unitPrice: number | string;
  batchNumber: string | null;
  description: string;
};
type Invoice = {
  id: number;
  invoiceNumber: string | null;
  currency: string;
  status: string;
  discountAmount: number | string;
  vatAmount: number | string;
  supplier: { name: string };
  lines: Line[];
};
export default function NewPurchaseReturnPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const invoiceId = Number(params.get("invoiceId"));
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const query = useQuery({
    queryKey: ["purchase-return-source", invoiceId],
    enabled: Number.isSafeInteger(invoiceId) && invoiceId > 0,
    queryFn: async () =>
      (await apiClient.get<Invoice>(`/purchases/invoices/${invoiceId}`)).data,
  });
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0)
    return (
      <p>
        {t("inventory.newPurchaseReturn.noInvoice", "يرجى تحديد فاتورة للبدء.")}
      </p>
    );
  if (query.isPending)
    return (
      <p>
        {t(
          "inventory.newPurchaseReturn.loadingInvoice",
          "جارِ تحميل الفاتورة...",
        )}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert">
        {t(
          "inventory.newPurchaseReturn.toast.loadError",
          "فشل تحميل بيانات الفاتورة.",
        )}{" "}
        <button onClick={() => void query.refetch()}>
          {t("refunds.retry", "إعادة المحاولة")}
        </button>
      </div>
    );
  const invoice = query.data;
  const eligible =
    invoice.currency === "LYD" &&
    Number(invoice.vatAmount) === 0 &&
    Number(invoice.discountAmount) === 0 &&
    ["APPROVED", "PARTIALLY_PAID", "PAID"].includes(invoice.status);
  const selected = invoice.lines.filter(
    (l) => l.productId && Number(quantities[l.id] || 0) > 0,
  );
  const valid =
    invoice.lines.every((l) => {
      const q = quantities[l.id] ?? "";
      return (
        q === "" ||
        (/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(q) &&
          Number(q) <=
            Math.min(Number(l.remainingReturnQuantity), 999999999999.999))
      );
    }) &&
    selected.length > 0 &&
    selected.every(
      (l) =>
        /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(quantities[l.id]) &&
        Number(quantities[l.id]) <= Number(l.remainingReturnQuantity),
    );
  const submit = async () => {
    if (busy || !eligible || !valid || reason.trim().length < 5) return;
    if (
      !window.confirm(
        t(
          "purchaseReturns.confirm",
          "تأكيد إخراج الأصناف المحددة من التشغيلات الأصلية وتسجيل إشعار دائن للمورد؟",
        ),
      )
    )
      return;
    setBusy(true);
    try {
      await apiClient.post("/purchases/returns", {
        purchaseInvoiceId: invoice.id,
        reason: reason.trim(),
        requestId: requestId.current,
        items: selected.map((l) => ({
          productId: l.productId,
          purchaseInvoiceLineId: l.id,
          quantity: Number(quantities[l.id]),
          description: l.description,
        })),
      });
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["purchase-return-source", invoice.id],
        }),
        cache.invalidateQueries({ queryKey: ["purchase-invoices"] }),
      ]);
      toast.success(
        t(
          "inventory.newPurchaseReturn.toast.success",
          "تم إنشاء مرتجع المشتريات بنجاح",
        ),
      );
      navigate("/purchases/invoices");
    } catch (error: unknown) {
      toast.error(
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
          t("inventory.newPurchaseReturn.toast.error", "فشل إنشاء المرتجع"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section dir={i18n.dir()} className="p-6 text-slate-100 space-y-4">
      <h1>
        {t("inventory.newPurchaseReturn.title", "مرتجع مشتريات جديد")} #
        {invoice.invoiceNumber || invoice.id} — {invoice.supplier.name}
      </h1>
      <p className="text-amber-300">
        {t(
          "purchaseReturns.scope",
          "هذا المسار لفاتورة مخزنية معتمدة بعملة LYD دون خصم أو ضريبة. يخرج المخزون ويسجل رصيد المورد مع القيد داخل معاملة واحدة؛لا يسجل استردادًا نقديًا من المورد.",
        )}
      </p>
      {!eligible && (
        <p role="alert">
          {t(
            "purchaseReturns.unsupported",
            "هذه الفاتورة تحتاج مسار مطابقة أو توزيع خصم وضريبة قبل الإرجاع.",
          )}
        </p>
      )}
      <label className="block">
        {t(
          "inventory.newPurchaseReturn.reason",
          "سبب الإرجاع ومحضر تسليم البضاعة",
        )}
        <textarea
          disabled={busy}
          minLength={5}
          maxLength={1000}
          className="block bg-slate-800 p-2"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            requestId.current = crypto.randomUUID();
          }}
        />
      </label>
      <div className="overflow-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th>
                {t("inventory.newPurchaseReturn.table.product", "المنتج")}
              </th>
              <th>{t("purchaseReturns.batch", "التشغيلة الأصلية")}</th>
              <th>
                {t("purchaseReturns.remaining", "الكمية المتاحة للإرجاع")}
              </th>
              <th>{t("inventory.newPurchaseReturn.table.price", "السعر")}</th>
              <th>
                {t(
                  "inventory.newPurchaseReturn.table.returnedQty",
                  "الكمية المرجعة",
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.product?.name || l.description}</td>
                <td>{l.batchNumber || "GENERAL"}</td>
                <td>{Number(l.remainingReturnQuantity).toFixed(3)}</td>
                <td>{Number(l.unitPrice).toFixed(3)}</td>
                <td>
                  <input
                    aria-label={`${t("inventory.newPurchaseReturn.table.returnedQty", "الكمية المرجعة")} #${l.id}`}
                    type="number"
                    min="0"
                    max={Math.min(
                      Number(l.remainingReturnQuantity),
                      999999999999.999,
                    )}
                    step="0.001"
                    disabled={busy || !eligible || !l.productId}
                    value={quantities[l.id] ?? ""}
                    onChange={(e) => {
                      setQuantities({ ...quantities, [l.id]: e.target.value });
                      requestId.current = crypto.randomUUID();
                    }}
                    className="bg-slate-800 p-2"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button disabled={busy} onClick={() => navigate(-1)}>
        {t("inventory.newPurchaseReturn.btn.cancel", "إلغاء")}
      </button>
      <button
        disabled={busy || !eligible || !valid || reason.trim().length < 5}
        onClick={() => void submit()}
        className="bg-rose-700 p-2 disabled:opacity-50"
      >
        {t("inventory.newPurchaseReturn.btn.save", "حفظ وإصدار المرتجع")}
      </button>
    </section>
  );
}
