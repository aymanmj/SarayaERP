import { useEffect, useState } from "react";
import { apiClient } from "../../../api/apiClient";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";

type PurchaseOrder = {
  id: number;
  poNumber: string;
  status: string;
  totalAmount: number;
  supplier: { name: string };
  createdBy: { fullName: string };
  createdAt: string;
};

export function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PurchaseOrder[]>("/procurement/orders");
      setOrders(res.data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل أوامر الشراء.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="px-2 py-1 rounded bg-slate-700 text-slate-300">مسودة</span>;
      case "PENDING_APPROVAL":
        return <span className="px-2 py-1 rounded bg-amber-900/50 text-amber-500 border border-amber-800/50">بانتظار الاعتماد</span>;
      case "APPROVED":
        return <span className="px-2 py-1 rounded bg-emerald-900/50 text-emerald-500 border border-emerald-800/50">معتمد</span>;
      case "PARTIALLY_RECEIVED":
        return <span className="px-2 py-1 rounded bg-sky-900/50 text-sky-500 border border-sky-800/50">مستلم جزئياً</span>;
      case "FULLY_RECEIVED":
        return <span className="px-2 py-1 rounded bg-indigo-900/50 text-indigo-500 border border-indigo-800/50">مستلم بالكامل</span>;
      case "CANCELLED":
        return <span className="px-2 py-1 rounded bg-rose-900/50 text-rose-500 border border-rose-800/50">ملغي</span>;
      default:
        return <span className="px-2 py-1 rounded bg-slate-700 text-slate-300">{status}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">أوامر الشراء (PO)</h1>
          <p className="text-sm text-slate-400">إدارة ومتابعة أوامر الشراء للموردين.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadOrders}
            className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700"
          >
            تحديث
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs overflow-auto">
        {loading ? (
          <div className="text-slate-500 flex justify-center p-8">جارِ التحميل...</div>
        ) : orders.length === 0 ? (
          <div className="text-slate-500 flex justify-center p-8">لا توجد أوامر شراء حالياً.</div>
        ) : (
          <table className="w-full text-right border-separate border-spacing-y-1">
            <thead className="text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">رقم الأمر</th>
                <th className="px-3 py-2 font-medium">التاريخ</th>
                <th className="px-3 py-2 font-medium">المورد</th>
                <th className="px-3 py-2 font-medium">المنشئ</th>
                <th className="px-3 py-2 font-medium text-left">الإجمالي</th>
                <th className="px-3 py-2 font-medium">الحالة</th>
                <th className="px-3 py-2 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="bg-slate-900/50 hover:bg-slate-800/50 transition-colors">
                  <td className="px-3 py-2 font-mono text-sky-400">{order.poNumber}</td>
                  <td className="px-3 py-2 text-slate-300">
                    {format(new Date(order.createdAt), "yyyy-MM-dd HH:mm")}
                  </td>
                  <td className="px-3 py-2 font-medium">{order.supplier.name}</td>
                  <td className="px-3 py-2 text-slate-400">{order.createdBy.fullName}</td>
                  <td className="px-3 py-2 font-medium text-emerald-400 text-left">
                    {order.totalAmount.toLocaleString()} د.ل
                  </td>
                  <td className="px-3 py-2">{getStatusBadge(order.status)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => navigate(`/purchases/orders/${order.id}`)}
                      className="text-sky-400 hover:text-sky-300 underline"
                    >
                      التفاصيل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
