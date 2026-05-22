import React, { useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { apiClient } from "../../../api/apiClient";

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch Purchase Order with details
  const { data: po, isLoading, error } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const res = await apiClient.get(`/procurement/orders/${id}`);
      return res.data;
    }
  });

  // Cancel PO Mutation
  const cancelPOMutation = useMutation({
    mutationFn: async () => {
      return apiClient.patch(`/procurement/orders/${id}/status`, { status: 'CANCELLED' });
    },
    onSuccess: () => {
      toast.success("تم إلغاء أمر الشراء بنجاح");
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    },
     
    onError: (err: any) => {
      console.error(err);
      toast.error(err.response?.data?.message || "فشل إلغاء أمر الشراء");
    }
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">جاري تحميل تفاصيل أمر الشراء...</div>;
  }

  if (error || !po) {
    return (
      <div className="p-8 text-center text-rose-500">
        حدث خطأ أثناء تحميل أمر الشراء أو أنه غير موجود.
        <button onClick={() => navigate('/purchases/orders')} className="mt-4 block mx-auto px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs">
          عودة إلى أوامر الشراء
        </button>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">مسودة</span>;
      case "SENT":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-900/50 text-blue-400 border border-blue-800/40">تم الإرسال</span>;
      case "PARTIALLY_RECEIVED":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-900/50 text-amber-400 border border-amber-800/40">مستلم جزئياً</span>;
      case "COMPLETED":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-900/50 text-emerald-400 border border-emerald-800/40">مكتمل</span>;
      case "CANCELLED":
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-900/50 text-rose-400 border border-rose-800/40">ملغي</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">{status}</span>;
    }
  };

  const showCancelButton = po.status !== 'CANCELLED' && po.status !== 'COMPLETED' && po.status !== 'PARTIALLY_RECEIVED';

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6 text-slate-100" dir="rtl">
      {/* Action Header - Hidden on Print */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/purchases/orders')}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              تفاصيل أمر الشراء: <span className="font-mono text-sky-400">{po.poNumber}</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">عرض وطباعة أمر الشراء وتتبع حالة الاستلام.</p>
          </div>
        </div>

        <div className="flex gap-2">
          {showCancelButton && (
            <button
              onClick={() => {
                if (window.confirm("هل أنت متأكد من إلغاء أمر الشراء هذا؟")) {
                  cancelPOMutation.mutate();
                }
              }}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold transition-all"
            >
              إلغاء الأمر
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-blue-600/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            طباعة أمر الشراء
          </button>
        </div>
      </div>

      {/* Main Print Layout container */}
      <div
        ref={printRef}
        className="bg-slate-950/80 border border-slate-800 rounded-3xl p-8 space-y-8 print:bg-white print:text-black print:border-none print:shadow-none print:p-0"
      >
        {/* Print Only Header (Hospital & Supplier info) */}
        <div className="hidden print:flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6 text-black">
          <div>
            <h2 className="text-xl font-bold">مستشفى صرايا التخصصي</h2>
            <p className="text-xs text-slate-600 mt-1">قسم المشتريات والتموين الطبي</p>
            <p className="text-[11px] text-slate-500">هاتف: 091-0000000 | بريد الكتروني: info@saraya.ly</p>
          </div>
          <div className="text-left font-mono">
            <h1 className="text-2xl font-bold mb-1">أمر شراء (PO)</h1>
            <p className="text-sm">رقم الأمر: {po.poNumber}</p>
            <p className="text-sm">التاريخ: {format(new Date(po.poDate), "yyyy/MM/dd")}</p>
          </div>
        </div>

        {/* Info Blocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:text-black">
          <div className="space-y-3 bg-slate-900/30 print:bg-slate-100 p-5 rounded-2xl border border-slate-800/60 print:border-slate-300">
            <h3 className="text-sm font-bold text-slate-400 print:text-slate-700 border-b border-slate-800 print:border-slate-300 pb-2">بيانات المورد</h3>
            <div className="space-y-1.5 text-xs text-slate-300 print:text-slate-900">
              <p><span className="text-slate-500 print:text-slate-600">اسم المورد:</span> <strong className="text-slate-100 print:text-black">{po.supplier.name}</strong></p>
              <p><span className="text-slate-500 print:text-slate-600">مسؤول الاتصال:</span> {po.supplier.contactName || "N/A"}</p>
              <p><span className="text-slate-500 print:text-slate-600">الهاتف:</span> {po.supplier.phone || "N/A"}</p>
              <p><span className="text-slate-500 print:text-slate-600">البريد الإلكتروني:</span> {po.supplier.email || "N/A"}</p>
            </div>
          </div>

          <div className="space-y-3 bg-slate-900/30 print:bg-slate-100 p-5 rounded-2xl border border-slate-800/60 print:border-slate-300">
            <h3 className="text-sm font-bold text-slate-400 print:text-slate-700 border-b border-slate-800 print:border-slate-300 pb-2">تفاصيل الأمر</h3>
            <div className="space-y-1.5 text-xs text-slate-300 print:text-slate-900">
              <p><span className="text-slate-500 print:text-slate-600">رقم أمر الشراء:</span> <strong className="text-slate-100 print:text-black font-mono">{po.poNumber}</strong></p>
              <p><span className="text-slate-500 print:text-slate-600">تاريخ الإصدار:</span> {format(new Date(po.poDate), "yyyy-MM-dd HH:mm")}</p>
              <p><span className="text-slate-500 print:text-slate-600">حرر بواسطة:</span> {po.createdBy?.fullName || "N/A"}</p>
              <p className="flex items-center gap-2">
                <span className="text-slate-500 print:text-slate-600">حالة الأمر:</span>
                <span className="print:hidden">{getStatusBadge(po.status)}</span>
                <span className="hidden print:inline font-bold">{po.status === 'SENT' ? 'تم الإرسال للمورد' : po.status}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="space-y-3 print:text-black">
          <h3 className="text-sm font-bold text-slate-400 print:text-slate-700">الأصناف المطلوبة</h3>
          <div className="bg-slate-900/10 border border-slate-800 print:border-slate-400 rounded-2xl overflow-hidden">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-900/60 print:bg-slate-200 border-b border-slate-800 print:border-slate-400 text-slate-400 print:text-black">
                <tr>
                  <th className="py-3.5 px-4 font-bold">اسم المنتج / الصنف</th>
                  <th className="py-3.5 px-4 font-bold text-center">الوحدة المشتراة</th>
                  <th className="py-3.5 px-4 font-bold text-center">الكمية</th>
                  <th className="py-3.5 px-4 font-bold text-center print:hidden">الكمية المستلمة</th>
                  <th className="py-3.5 px-4 font-bold text-left">سعر الوحدة</th>
                  <th className="py-3.5 px-4 font-bold text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-slate-300 text-slate-300 print:text-black">
                {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
                {po.items?.map((item: any, idx: number) => (
                  <tr key={item.id} className="hover:bg-slate-900/20">
                    <td className="py-3.5 px-4 font-medium">
                      <div>{item.product?.name}</div>
                      {item.product?.code && (
                        <span className="text-[10px] text-slate-500 print:text-slate-600 font-mono">كود: {item.product.code}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">{item.uom?.name || "N/A"}</td>
                    <td className="py-3.5 px-4 text-center font-mono">{Number(item.quantity).toLocaleString()}</td>
                    <td className="py-3.5 px-4 text-center font-mono print:hidden text-slate-500">
                      {Number(item.receivedQuantity).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-left font-mono">{Number(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })} د.ل</td>
                    <td className="py-3.5 px-4 text-left font-mono text-slate-100 print:text-black font-semibold">
                      {Number(item.totalPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })} د.ل
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes & Summary Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pt-4 border-t border-slate-800 print:border-slate-400 print:text-black">
          <div className="max-w-md">
            <span className="text-xs font-bold text-slate-500 block mb-1">ملاحظات وشروط إضافية:</span>
            <p className="text-xs text-slate-400 print:text-slate-800 italic bg-slate-900/20 print:bg-slate-50 p-3 rounded-xl border border-slate-800/40 print:border-slate-200">
              {po.notes || "لا توجد ملاحظات خاصة."}
            </p>
          </div>

          <div className="w-full md:w-auto bg-emerald-500/5 print:bg-slate-100 border border-emerald-500/10 print:border-slate-400 p-5 rounded-2xl text-left min-w-[280px]">
            <div className="flex justify-between items-center text-xs text-slate-400 print:text-slate-700 mb-1.5">
              <span>المجموع الفرعي:</span>
              <span className="font-mono">{Number(po.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} د.ل</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-400 print:text-slate-700 mb-2 pb-2 border-b border-slate-800/50 print:border-slate-300">
              <span>الضريبة / الرسوم:</span>
              <span className="font-mono">0.00 د.ل</span>
            </div>
            <div className="flex justify-between items-center font-bold text-sm">
              <span className="text-slate-300 print:text-black">الإجمالي الكلي:</span>
              <span className="text-lg text-emerald-400 print:text-emerald-700 font-mono">
                {Number(po.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} د.ل
              </span>
            </div>
          </div>
        </div>

        {/* Print Signatures */}
        <div className="hidden print:grid grid-cols-3 gap-8 pt-16 text-xs text-black text-center">
          <div>
            <p className="font-bold border-t border-slate-400 pt-2">مُعِد الطلب</p>
            <p className="text-[10px] text-slate-500 mt-1">{po.createdBy?.fullName || ""}</p>
          </div>
          <div>
            <p className="font-bold border-t border-slate-400 pt-2">مدير إدارة التموين الطبي</p>
          </div>
          <div>
            <p className="font-bold border-t border-slate-400 pt-2">المدير المالي والاعتماد</p>
          </div>
        </div>
      </div>
    </div>
  );
}
