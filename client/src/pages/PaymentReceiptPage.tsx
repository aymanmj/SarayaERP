// src/pages/PaymentReceiptPage.tsx

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import PrintLayout from "../components/print/PrintLayout";
import type { OrganizationSettings } from "../types/organization";

type EncounterType = "OPD" | "ER" | "IPD";

type Patient = {
  id: number;
  fullName: string;
  mrn: string;
};

type EncounterLite = {
  id: number;
  type: EncounterType;
} | null;

type Payment = {
  id: number;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
};

type Invoice = {
  id: number;
  status: string;
  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  remainingAmount: number;
  currency: string;
  createdAt: string;
};

type PaymentReceiptData = {
  payment: Payment;
  invoice: Invoice;
  patient: Patient | null;
  encounter: EncounterLite;
};

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(val: number | string | null | undefined) {
  const num = Number(val ?? 0);
  return num.toFixed(3);
}

export default function PaymentReceiptPage() {
  const { id } = useParams();
  const paymentId = Number(id);

  const [data, setData] = useState<PaymentReceiptData | null>(null);
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentId || Number.isNaN(paymentId)) {
      setError("رقم الدفعة غير صحيح.");
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [receiptRes, orgRes] = await Promise.all([
          apiClient.get<PaymentReceiptData>(
            `/cashier/payments/${paymentId}/receipt`
          ),
          apiClient.get<OrganizationSettings>("/settings/organization"),
        ]);
        setData(receiptRes.data);
        setOrg(orgRes.data);
      } catch (err: any) {
        console.error(err);
        const msg = err?.response?.data?.message;
        if (typeof msg === "string") setError(msg);
        else setError("حدث خطأ أثناء تحميل بيانات إيصال الدفع.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [paymentId]);

  const currency = data?.invoice.currency ?? "LYD";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 animate-pulse">جارِ إعداد معاينة الإيصال...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-rose-500">
        خطأ: {error}
      </div>
    );
  }

  if (!data) return null;

  const { payment, invoice, patient, encounter } = data;
  const afterThisPayment = invoice.remainingAmount;

  return (
    <PrintLayout
      title="إيصال استلام نقدية"
      subtitle={`Receipt #${payment.id}`}
      documentId={payment.id}
      pageSize="A5"
      footerNotes="شكراً لتعاملكم معنا."
    >
      {/* شبكة معلومات صغيرة ومكثفة لتناسب A5 */}
      <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
        {/* بيانات المريض */}
        <div className="bg-slate-50 p-3 rounded border border-slate-100">
          <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">بيانات المريض</div>
          <div className="space-y-1">
             <div className="flex justify-between">
                <span className="text-slate-500">الاسم:</span>
                <span className="font-bold">{patient?.fullName}</span>
             </div>
             <div className="flex justify-between">
                <span className="text-slate-500">رقم الملف:</span>
                <span className="font-mono">{patient?.mrn}</span>
             </div>
          </div>
        </div>

        {/* تفاصيل الفاتورة المرتبطة */}
        <div className="bg-slate-50 p-3 rounded border border-slate-100">
          <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">المرجع (الفاتورة)</div>
          <div className="space-y-1">
             <div className="flex justify-between">
                <span className="text-slate-500">رقم الفاتورة:</span>
                <span className="font-mono">#{invoice.id}</span>
             </div>
             <div className="flex justify-between">
                <span className="text-slate-500">تاريخها:</span>
                <span>{formatDateTime(invoice.createdAt)}</span>
             </div>
          </div>
        </div>
      </div>

      {/* المبلغ المستلم - أبرز جزء */}
      <div className="border-2 border-slate-900 rounded-lg p-4 mb-6 text-center bg-slate-50">
         <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">المبلغ المستلم</div>
         <div className="text-3xl font-bold text-slate-900 font-mono">
           {formatMoney(payment.amount)} <span className="text-lg text-slate-500">{currency}</span>
         </div>
         <div className="text-xs font-bold text-emerald-600 mt-2 bg-emerald-50 inline-block px-3 py-1 rounded-full border border-emerald-100">
            {payment.method}
            {payment.reference && <span className="text-slate-400 font-normal"> - Ref: {payment.reference}</span>}
         </div>
      </div>
      
      {/* جدول التفاصيل المالية المصغرة */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-xs">
           <thead className="bg-slate-50 border-b border-slate-200">
             <tr>
               <th className="py-2 px-3 text-right font-medium text-slate-500">البيان</th>
               <th className="py-2 px-3 text-left font-medium text-slate-500">القيمة</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             <tr>
               <td className="py-2 px-3 text-slate-700">إجمالي قيمة الفاتورة</td>
               <td className="py-2 px-3 text-left font-mono">{formatMoney(invoice.totalAmount)}</td>
             </tr>
             <tr>
               <td className="py-2 px-3 text-slate-700">إجمالي المدفوع سابقاً</td>
               <td className="py-2 px-3 text-left font-mono">{formatMoney(invoice.paidAmount - payment.amount)}</td>
             </tr>
              <tr className="bg-slate-50/50">
               <td className="py-2 px-3 font-bold text-emerald-700">الدفعة الحالية</td>
               <td className="py-2 px-3 text-left font-bold font-mono text-emerald-700">{formatMoney(payment.amount)}</td>
             </tr>
             <tr>
               <td className="py-2 px-3 font-bold text-slate-900">المتبقي بعد الدفع</td>
               <td className="py-2 px-3 text-left font-bold font-mono text-rose-600">{formatMoney(afterThisPayment)}</td>
             </tr>
           </tbody>
        </table>
      </div>

      {/* التاريخ والوقت */}
      <div className="text-xs text-slate-400 text-center mb-8">
         تاريخ ووقت العملية: <span className="font-mono text-slate-600">{formatDateTime(payment.paidAt)}</span>
      </div>

      {/* التوقيع */}
      <div className="flex justify-between items-end mt-auto pt-8">
        <div className="text-center">
           <div className="h-px w-32 bg-slate-300 mb-2"></div>
           <div className="text-[10px] text-slate-500">توقيع المستلم (الكاشير)</div>
        </div>
        <div className="text-center">
           <div className="h-px w-32 bg-slate-300 mb-2"></div>
           <div className="text-[10px] text-slate-500">توقيع الدافع (المريض)</div>
        </div>
      </div>
    </PrintLayout>
  );
}
