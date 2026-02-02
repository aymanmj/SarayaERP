// src/pages/PaymentReceiptPage.tsx

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import PrintLayout from "../components/print/PrintLayout";
import type { OrganizationSettings } from "../types/organization";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["paymentReceipt", paymentId],
    queryFn: async () => {
      if (!paymentId) throw new Error("رقم الدفعة غير صحيح");
      const res = await apiClient.get(`/cashier/payments/${paymentId}/receipt`);
      return res.data;
    },
    enabled: !!paymentId,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <span className="text-xs">جارِ إعداد الإيصال...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-rose-500">
        خطأ: {(error as any)?.message}
      </div>
    );
  }

  if (!data) return null;

  const { payment, invoice, patient } = data;
  const afterThisPayment = invoice.remainingAmount;
  const currency = invoice.currency ?? "LYD";

  return (
    <PrintLayout
      title="إيصال استلام نقدية"
      subtitle={`Receipt #${payment.id}`}
      documentId={payment.id}
      pageSize="A5"
      footerNotes="شكراً لتعاملكم معنا."
    >
      {/* (نفس التصميم الجديد لـ A5 الذي اعتمدناه) */}
      <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
        <div className="bg-slate-50 p-3 rounded border border-slate-100">
          <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">
            بيانات المريض
          </div>
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

        <div className="bg-slate-50 p-3 rounded border border-slate-100">
          <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">
            المرجع (الفاتورة)
          </div>
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

      <div className="border-2 border-slate-900 rounded-lg p-4 mb-6 text-center bg-slate-50">
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">
          المبلغ المستلم
        </div>
        <div className="text-3xl font-bold text-slate-900 font-mono">
          {formatMoney(payment.amount)}{" "}
          <span className="text-lg text-slate-500">{currency}</span>
        </div>
        <div className="text-xs font-bold text-emerald-600 mt-2 bg-emerald-50 inline-block px-3 py-1 rounded-full border border-emerald-100">
          {payment.method}
          {payment.reference && (
            <span className="text-slate-400 font-normal">
              {" "}
              - Ref: {payment.reference}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="py-2 px-3 text-right font-medium text-slate-500">
                البيان
              </th>
              <th className="py-2 px-3 text-left font-medium text-slate-500">
                القيمة
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2 px-3 text-slate-700">إجمالي قيمة الفاتورة</td>
              <td className="py-2 px-3 text-left font-mono">
                {formatMoney(invoice.totalAmount)}
              </td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-700">
                إجمالي المدفوع سابقاً
              </td>
              <td className="py-2 px-3 text-left font-mono">
                {formatMoney(invoice.paidAmount - payment.amount)}
              </td>
            </tr>
            <tr className="bg-slate-50/50">
              <td className="py-2 px-3 font-bold text-emerald-700">
                الدفعة الحالية
              </td>
              <td className="py-2 px-3 text-left font-bold font-mono text-emerald-700">
                {formatMoney(payment.amount)}
              </td>
            </tr>
            <tr>
              <td className="py-2 px-3 font-bold text-slate-900">
                المتبقي بعد الدفع
              </td>
              <td className="py-2 px-3 text-left font-bold font-mono text-rose-600">
                {formatMoney(afterThisPayment)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-400 text-center mb-8">
        تاريخ ووقت العملية:{" "}
        <span className="font-mono text-slate-600">
          {formatDateTime(payment.paidAt)}
        </span>
      </div>

      <div className="flex justify-between items-end mt-auto pt-8">
        <div className="text-center">
          <div className="h-px w-32 bg-slate-300 mb-2"></div>
          <div className="text-[10px] text-slate-500">
            توقيع المستلم (الكاشير)
          </div>
        </div>
        <div className="text-center">
          <div className="h-px w-32 bg-slate-300 mb-2"></div>
          <div className="text-[10px] text-slate-500">
            توقيع الدافع (المريض)
          </div>
        </div>
      </div>
    </PrintLayout>
  );
}

// // src/pages/PaymentReceiptPage.tsx

// import { useEffect, useState } from "react";
// import { useParams } from "react-router-dom";
// import { apiClient } from "../api/apiClient";
// import PrintLayout from "../components/print/PrintLayout";
// import type { OrganizationSettings } from "../types/organization";

// type EncounterType = "OPD" | "ER" | "IPD";

// type Patient = {
//   id: number;
//   fullName: string;
//   mrn: string;
// };

// type EncounterLite = {
//   id: number;
//   type: EncounterType;
// } | null;

// type Payment = {
//   id: number;
//   amount: number;
//   method: string;
//   paidAt: string;
//   reference: string | null;
// };

// type Invoice = {
//   id: number;
//   status: string;
//   totalAmount: number;
//   discountAmount: number;
//   paidAmount: number;
//   remainingAmount: number;
//   currency: string;
//   createdAt: string;
// };

// type PaymentReceiptData = {
//   payment: Payment;
//   invoice: Invoice;
//   patient: Patient | null;
//   encounter: EncounterLite;
// };

// function formatDateTime(iso?: string | null) {
//   if (!iso) return "—";
//   const d = new Date(iso);
//   return d.toLocaleString("ar-LY", {
//     year: "numeric",
//     month: "2-digit",
//     day: "2-digit",
//     hour: "2-digit",
//     minute: "2-digit",
//   });
// }

// function formatMoney(val: number | string | null | undefined) {
//   const num = Number(val ?? 0);
//   return num.toLocaleString("en-US", {
//     minimumFractionDigits: 3,
//     maximumFractionDigits: 3,
//   });
// }

// export default function PaymentReceiptPage() {
//   const { id } = useParams();
//   const paymentId = Number(id);

//   const [data, setData] = useState<PaymentReceiptData | null>(null);
//   const [org, setOrg] = useState<OrganizationSettings | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     if (!paymentId || Number.isNaN(paymentId)) {
//       setError("رقم الدفعة غير صحيح.");
//       return;
//     }

//     const load = async () => {
//       setLoading(true);
//       setError(null);
//       try {
//         const [receiptRes, orgRes] = await Promise.all([
//           apiClient.get<PaymentReceiptData>(
//             `/cashier/payments/${paymentId}/receipt`,
//           ),
//           apiClient.get<OrganizationSettings>("/settings/organization"),
//         ]);
//         setData(receiptRes.data);
//         setOrg(orgRes.data);
//       } catch (err: any) {
//         console.error(err);
//         setError("حدث خطأ أثناء تحميل بيانات إيصال الدفع.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     load();
//   }, [paymentId]);

//   const currency = data?.invoice.currency ?? "LYD";

//   if (loading) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-slate-50">
//         <div className="text-slate-500 animate-pulse font-medium">
//           جارِ إعداد معاينة الإيصال...
//         </div>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-slate-50 text-rose-500 font-bold">
//         خطأ: {error}
//       </div>
//     );
//   }

//   if (!data) return null;

//   const { payment, invoice, patient } = data;
//   const afterThisPayment = invoice.remainingAmount;

//   return (
//     <PrintLayout
//       title="إيصال استلام نقدية"
//       subtitle={`Receipt #${payment.id}`}
//       documentId={payment.id}
//       pageSize="A5"
//       footerNotes="شكراً لتعاملكم معنا. نتمنى لكم الشفاء العاجل."
//     >
//       {/* شبكة معلومات صغيرة ومكثفة لتناسب A5 */}
//       <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
//         {/* بيانات المريض */}
//         <div className="bg-slate-50 p-3 rounded border border-slate-200">
//           <div className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2 text-[10px] uppercase tracking-wider">
//             بيانات المريض
//           </div>
//           <div className="space-y-1">
//             <div className="flex justify-between">
//               <span className="text-slate-500">الاسم:</span>
//               <span className="font-bold text-slate-900">
//                 {patient?.fullName}
//               </span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-slate-500">رقم الملف:</span>
//               <span className="font-mono text-slate-700 font-semibold">
//                 {patient?.mrn}
//               </span>
//             </div>
//           </div>
//         </div>

//         {/* تفاصيل الفاتورة المرتبطة */}
//         <div className="bg-slate-50 p-3 rounded border border-slate-200">
//           <div className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2 text-[10px] uppercase tracking-wider">
//             المرجع (الفاتورة)
//           </div>
//           <div className="space-y-1">
//             <div className="flex justify-between">
//               <span className="text-slate-500">رقم الفاتورة:</span>
//               <span className="font-mono text-slate-700 font-semibold">
//                 #{invoice.id}
//               </span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-slate-500">تاريخها:</span>
//               <span className="font-mono text-slate-700">
//                 {formatDateTime(invoice.createdAt)}
//               </span>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* المبلغ المستلم - أبرز جزء */}
//       <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 mb-6 text-center bg-slate-50/50 relative overflow-hidden">
//         <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-sky-400"></div>
//         <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">
//           المبلغ المستلم
//         </div>
//         <div className="text-4xl font-black text-slate-900 font-mono tracking-tight my-2">
//           {formatMoney(payment.amount)}{" "}
//           <span className="text-lg text-slate-400 font-medium">{currency}</span>
//         </div>
//         <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600 shadow-sm mt-1">
//           <span>{payment.method}</span>
//           {payment.reference && (
//             <span className="text-slate-400 font-normal border-r border-slate-200 pr-2 mr-2">
//               Ref: {payment.reference}
//             </span>
//           )}
//         </div>
//       </div>

//       {/* جدول التفاصيل المالية المصغرة */}
//       <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-6">
//         <table className="w-full text-xs">
//           <thead className="bg-slate-100 border-b border-slate-200 text-slate-500">
//             <tr>
//               <th className="py-2 px-3 text-right font-semibold">البيان</th>
//               <th className="py-2 px-3 text-left font-semibold">القيمة</th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-slate-100">
//             <tr>
//               <td className="py-2 px-3 text-slate-600">إجمالي قيمة الفاتورة</td>
//               <td className="py-2 px-3 text-left font-mono text-slate-900">
//                 {formatMoney(invoice.totalAmount)}
//               </td>
//             </tr>
//             <tr>
//               <td className="py-2 px-3 text-slate-600">
//                 إجمالي المدفوع سابقاً
//               </td>
//               <td className="py-2 px-3 text-left font-mono text-slate-900">
//                 {formatMoney(invoice.paidAmount - payment.amount)}
//               </td>
//             </tr>
//             <tr className="bg-emerald-50/50">
//               <td className="py-2 px-3 font-bold text-emerald-800">
//                 الدفعة الحالية
//               </td>
//               <td className="py-2 px-3 text-left font-bold font-mono text-emerald-700">
//                 {formatMoney(payment.amount)}
//               </td>
//             </tr>
//             <tr className="bg-slate-50/50 font-bold">
//               <td className="py-2 px-3 text-slate-900">المتبقي بعد الدفع</td>
//               <td
//                 className={`py-2 px-3 text-left font-mono ${afterThisPayment > 0 ? "text-rose-600" : "text-emerald-600"}`}
//               >
//                 {formatMoney(afterThisPayment)}
//               </td>
//             </tr>
//           </tbody>
//         </table>
//       </div>

//       {/* التاريخ والوقت */}
//       <div className="text-[10px] text-slate-400 text-center mb-8 border-t border-slate-100 pt-2">
//         تمت العملية في:{" "}
//         <span className="font-mono text-slate-600 font-medium">
//           {formatDateTime(payment.paidAt)}
//         </span>
//       </div>

//       {/* التوقيع */}
//       <div className="flex justify-between items-end mt-auto pt-6">
//         <div className="text-center w-1/3">
//           <div className="h-px bg-slate-300 mb-2 w-full"></div>
//           <div className="text-[10px] text-slate-500 font-medium">
//             توقيع المستلم (الكاشير)
//           </div>
//         </div>
//         <div className="text-center w-1/3">
//           <div className="h-px bg-slate-300 mb-2 w-full"></div>
//           <div className="text-[10px] text-slate-500 font-medium">
//             توقيع الدافع (المريض)
//           </div>
//         </div>
//       </div>
//     </PrintLayout>
//   );
// }

// // src/pages/PaymentReceiptPage.tsx

// import { useEffect, useState } from "react";
// import { useParams } from "react-router-dom";
// import { apiClient } from "../api/apiClient";
// import PrintLayout from "../components/print/PrintLayout";
// import type { OrganizationSettings } from "../types/organization";

// type EncounterType = "OPD" | "ER" | "IPD";

// type Patient = {
//   id: number;
//   fullName: string;
//   mrn: string;
// };

// type EncounterLite = {
//   id: number;
//   type: EncounterType;
// } | null;

// type Payment = {
//   id: number;
//   amount: number;
//   method: string;
//   paidAt: string;
//   reference: string | null;
// };

// type Invoice = {
//   id: number;
//   status: string;
//   totalAmount: number;
//   discountAmount: number;
//   paidAmount: number;
//   remainingAmount: number;
//   currency: string;
//   createdAt: string;
// };

// type PaymentReceiptData = {
//   payment: Payment;
//   invoice: Invoice;
//   patient: Patient | null;
//   encounter: EncounterLite;
// };

// function formatDateTime(iso?: string | null) {
//   if (!iso) return "—";
//   const d = new Date(iso);
//   return d.toLocaleString("ar-LY", {
//     year: "numeric",
//     month: "2-digit",
//     day: "2-digit",
//     hour: "2-digit",
//     minute: "2-digit",
//   });
// }

// function formatMoney(val: number | string | null | undefined) {
//   const num = Number(val ?? 0);
//   return num.toFixed(3);
// }

// export default function PaymentReceiptPage() {
//   const { id } = useParams();
//   const paymentId = Number(id);

//   const [data, setData] = useState<PaymentReceiptData | null>(null);
//   const [org, setOrg] = useState<OrganizationSettings | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     if (!paymentId || Number.isNaN(paymentId)) {
//       setError("رقم الدفعة غير صحيح.");
//       return;
//     }

//     const load = async () => {
//       setLoading(true);
//       setError(null);
//       try {
//         const [receiptRes, orgRes] = await Promise.all([
//           apiClient.get<PaymentReceiptData>(
//             `/cashier/payments/${paymentId}/receipt`
//           ),
//           apiClient.get<OrganizationSettings>("/settings/organization"),
//         ]);
//         setData(receiptRes.data);
//         setOrg(orgRes.data);
//       } catch (err: any) {
//         console.error(err);
//         const msg = err?.response?.data?.message;
//         if (typeof msg === "string") setError(msg);
//         else setError("حدث خطأ أثناء تحميل بيانات إيصال الدفع.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     load();
//   }, [paymentId]);

//   const currency = data?.invoice.currency ?? "LYD";

//   if (loading) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-slate-50">
//         <div className="text-slate-500 animate-pulse">جارِ إعداد معاينة الإيصال...</div>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-slate-50 text-rose-500">
//         خطأ: {error}
//       </div>
//     );
//   }

//   if (!data) return null;

//   const { payment, invoice, patient, encounter } = data;
//   const afterThisPayment = invoice.remainingAmount;

//   return (
//     <PrintLayout
//       title="إيصال استلام نقدية"
//       subtitle={`Receipt #${payment.id}`}
//       documentId={payment.id}
//       pageSize="A5"
//       footerNotes="شكراً لتعاملكم معنا."
//     >
//       {/* شبكة معلومات صغيرة ومكثفة لتناسب A5 */}
//       <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
//         {/* بيانات المريض */}
//         <div className="bg-slate-50 p-3 rounded border border-slate-100">
//           <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">بيانات المريض</div>
//           <div className="space-y-1">
//              <div className="flex justify-between">
//                 <span className="text-slate-500">الاسم:</span>
//                 <span className="font-bold">{patient?.fullName}</span>
//              </div>
//              <div className="flex justify-between">
//                 <span className="text-slate-500">رقم الملف:</span>
//                 <span className="font-mono">{patient?.mrn}</span>
//              </div>
//           </div>
//         </div>

//         {/* تفاصيل الفاتورة المرتبطة */}
//         <div className="bg-slate-50 p-3 rounded border border-slate-100">
//           <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">المرجع (الفاتورة)</div>
//           <div className="space-y-1">
//              <div className="flex justify-between">
//                 <span className="text-slate-500">رقم الفاتورة:</span>
//                 <span className="font-mono">#{invoice.id}</span>
//              </div>
//              <div className="flex justify-between">
//                 <span className="text-slate-500">تاريخها:</span>
//                 <span>{formatDateTime(invoice.createdAt)}</span>
//              </div>
//           </div>
//         </div>
//       </div>

//       {/* المبلغ المستلم - أبرز جزء */}
//       <div className="border-2 border-slate-900 rounded-lg p-4 mb-6 text-center bg-slate-50">
//          <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">المبلغ المستلم</div>
//          <div className="text-3xl font-bold text-slate-900 font-mono">
//            {formatMoney(payment.amount)} <span className="text-lg text-slate-500">{currency}</span>
//          </div>
//          <div className="text-xs font-bold text-emerald-600 mt-2 bg-emerald-50 inline-block px-3 py-1 rounded-full border border-emerald-100">
//             {payment.method}
//             {payment.reference && <span className="text-slate-400 font-normal"> - Ref: {payment.reference}</span>}
//          </div>
//       </div>

//       {/* جدول التفاصيل المالية المصغرة */}
//       <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
//         <table className="w-full text-xs">
//            <thead className="bg-slate-50 border-b border-slate-200">
//              <tr>
//                <th className="py-2 px-3 text-right font-medium text-slate-500">البيان</th>
//                <th className="py-2 px-3 text-left font-medium text-slate-500">القيمة</th>
//              </tr>
//            </thead>
//            <tbody className="divide-y divide-slate-100">
//              <tr>
//                <td className="py-2 px-3 text-slate-700">إجمالي قيمة الفاتورة</td>
//                <td className="py-2 px-3 text-left font-mono">{formatMoney(invoice.totalAmount)}</td>
//              </tr>
//              <tr>
//                <td className="py-2 px-3 text-slate-700">إجمالي المدفوع سابقاً</td>
//                <td className="py-2 px-3 text-left font-mono">{formatMoney(invoice.paidAmount - payment.amount)}</td>
//              </tr>
//               <tr className="bg-slate-50/50">
//                <td className="py-2 px-3 font-bold text-emerald-700">الدفعة الحالية</td>
//                <td className="py-2 px-3 text-left font-bold font-mono text-emerald-700">{formatMoney(payment.amount)}</td>
//              </tr>
//              <tr>
//                <td className="py-2 px-3 font-bold text-slate-900">المتبقي بعد الدفع</td>
//                <td className="py-2 px-3 text-left font-bold font-mono text-rose-600">{formatMoney(afterThisPayment)}</td>
//              </tr>
//            </tbody>
//         </table>
//       </div>

//       {/* التاريخ والوقت */}
//       <div className="text-xs text-slate-400 text-center mb-8">
//          تاريخ ووقت العملية: <span className="font-mono text-slate-600">{formatDateTime(payment.paidAt)}</span>
//       </div>

//       {/* التوقيع */}
//       <div className="flex justify-between items-end mt-auto pt-8">
//         <div className="text-center">
//            <div className="h-px w-32 bg-slate-300 mb-2"></div>
//            <div className="text-[10px] text-slate-500">توقيع المستلم (الكاشير)</div>
//         </div>
//         <div className="text-center">
//            <div className="h-px w-32 bg-slate-300 mb-2"></div>
//            <div className="text-[10px] text-slate-500">توقيع الدافع (المريض)</div>
//         </div>
//       </div>
//     </PrintLayout>
//   );
// }
