import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { format } from "date-fns";

type PurchaseInvoiceLine = {
  productId: number;
  product?: { name: string; code: string };
  quantity: number;
  unitPrice: number;
  description?: string;
};

type InvoiceDetails = {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  supplier: { id: number; name: string };
  lines: PurchaseInvoiceLine[];
};

export default function NewPurchaseReturnPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const invoiceId = searchParams.get("invoiceId");

  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [returnReason, setReturnReason] = useState("");
  
  // State for return quantities: { productId: returnQty }
  const [returnQuantities, setReturnQuantities] = useState<Record<number, string>>({});
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (invoiceId) {
      loadInvoice(invoiceId);
    }
  }, [invoiceId]);

  const loadInvoice = async (id: string) => {
    try {
      const res = await apiClient.get<InvoiceDetails>(`/purchases/invoices/${id}`);
      setInvoice(res.data);
      // Initialize return quantities to 0
      const initialQtys: Record<number, string> = {};
      res.data.lines.forEach(line => {
        initialQtys[line.productId] = "0";
      });
      setReturnQuantities(initialQtys);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل بيانات الفاتورة.");
    }
  };

  const handleQtyChange = (productId: number, val: string) => {
    setReturnQuantities(prev => ({ ...prev, [productId]: val }));
  };

  const handleSubmit = async () => {
    if (!invoice) return;

    const itemsToReturn = invoice.lines.map(line => {
      const qty = Number(returnQuantities[line.productId] || 0);
      if (qty > 0) {
        return {
          productId: line.productId,
          quantity: qty,
          description: line.description
        };
      }
      return null;
    }).filter(Boolean);

    if (itemsToReturn.length === 0) {
      toast.error("يجب تحديد كمية للإرجاع لمنتج واحد على الأقل.");
      return;
    }

    // Validate quantities constraint locally (backend also checks)
    for (const item of itemsToReturn) {
      const line = invoice.lines.find(l => l.productId === item!.productId);
      if (line && item!.quantity > line.quantity) {
        toast.error(`الكمية المرجعة للمنتج ${line.product?.name} تتجاوز الكمية الأصلية.`);
        return;
      }
    }

    setLoading(true);
    try {
      await apiClient.post("/purchases/returns", {
        purchaseInvoiceId: invoice.id,
        reason: returnReason,
        items: itemsToReturn
      });
      toast.success("تم إنشاء مرتجع المشتريات بنجاح");
      navigate("/purchases/invoices"); // Or to the Return details if we implement it
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "فشل إنشاء المرتجع");
    } finally {
      setLoading(false);
    }
  };

  if (!invoiceId) {
    return <div className="p-10 text-slate-400">يرجى تحديد فاتورة للبدء.</div>;
  }

  if (!invoice) {
    return <div className="p-10 text-slate-400">جارِ تحميل الفاتورة...</div>;
  }

  return (
    <div className="p-6 lg:p-10 text-slate-100 max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-bold mb-6 text-rose-400">مرتجع مشتريات جديد</h1>
      
      <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">المورد</label>
          <div className="font-semibold">{invoice.supplier.name}</div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">رقم الفاتورة الأصلية</label>
          <div className="font-semibold text-emerald-300">#{invoice.invoiceNumber || invoice.id}</div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">تاريخ الفاتورة</label>
          <div>{format(new Date(invoice.invoiceDate), "yyyy-MM-dd")}</div>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm text-slate-400 mb-2">سبب الإرجاع</label>
        <textarea
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 focus:border-rose-500/50 outline-none"
          rows={3}
          value={returnReason}
          onChange={(e) => setReturnReason(e.target.value)}
          placeholder="مثال: البضاعة تالفة، انتهاء الصلاحية..."
        />
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden mb-6">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="p-3">المنتج</th>
              <th className="p-3">السعر</th>
              <th className="p-3 text-center">الكمية الأصلية</th>
              <th className="p-3 w-32">الكمية المرجعة</th>
              <th className="p-3 w-40">قيمة المرتجع</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {invoice.lines.map((line) => {
              const returnQty = Number(returnQuantities[line.productId] || 0);
              const returnValue = returnQty * line.unitPrice;
              
              const isOver = returnQty > line.quantity;

              return (
                <tr key={line.productId}>
                  <td className="p-3 text-slate-200">
                    <div className="font-medium">{line.product?.name || line.description}</div>
                    <div className="text-xs text-slate-500">{line.product?.code}</div>
                  </td>
                  <td className="p-3 text-slate-300">{Number(line.unitPrice).toFixed(3)}</td>
                  <td className="p-3 text-center text-slate-400">{line.quantity}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      max={line.quantity}
                      step="1" // Assuming integer mostly
                      className={`w-full bg-slate-900 border rounded px-2 py-1 text-center outline-none ${
                        isOver ? "border-red-500 text-red-500" : "border-slate-700 text-slate-100 focus:border-rose-500"
                      }`}
                      value={returnQuantities[line.productId]}
                      onChange={(e) => handleQtyChange(line.productId, e.target.value)}
                    />
                  </td>
                  <td className="p-3 text-rose-300 font-mono">
                    {returnValue > 0 ? returnValue.toFixed(3) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
        >
          إلغاء
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-50"
        >
          {loading ? "جاري الحفظ..." : "حفظ وإصدار المرتجع"}
        </button>
      </div>
    </div>
  );
}
