// src/pages/PaymentReceiptPage.tsx

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import PrintLayout from "../components/print/PrintLayout";
import type { OrganizationSettings } from "../types/organization";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle, CreditCard, Calendar, User, FileText, Building2 } from "lucide-react";

type EncounterType = "OPD" | "ER" | "IPD";

type Patient = {
  id: number;
  fullName: string;
  mrn: string;
  gender?: "MALE" | "FEMALE" | null;
  dateOfBirth?: string | null;
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
  cashierId?: number;
  cashierName?: string;
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

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ar-LY", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMoney(val: number | string | null | undefined) {
  const num = Number(val ?? 0);
  return num.toLocaleString("ar-LY", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function getPaymentMethodIcon(method: string) {
  switch (method.toLowerCase()) {
    case 'cash':
      return '💵';
    case 'card':
    case 'credit_card':
      return '💳';
    case 'bank_transfer':
      return '🏦';
    case 'check':
      return '📄';
    default:
      return '💰';
  }
}

function getPaymentMethodLabel(method: string) {
  switch (method.toLowerCase()) {
    case 'cash':
      return 'نقدي';
    case 'card':
    case 'credit_card':
      return 'بطاقة ائتمان';
    case 'bank_transfer':
      return 'تحويل بنكي';
    case 'check':
      return 'شيك';
    default:
      return method;
  }
}

function getEncounterTypeLabel(type: EncounterType) {
  switch (type) {
    case 'OPD':
      return 'عيادات خارجية';
    case 'ER':
      return 'طوارئ';
    case 'IPD':
      return 'إقامة';
    default:
      return type;
  }
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-lg">
          <Loader2 className="w-12 h-12 animate-spin text-emerald-600" />
          <div className="text-slate-600 font-medium">جاري إعداد إيصال الدفعة...</div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-lg border border-rose-200">
          <div className="text-rose-600 font-bold text-center">خطأ: {(error as any)?.message}</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { payment, invoice, patient, encounter } = data as PaymentReceiptData;
  const isFullyPaid = Number(invoice.remainingAmount) <= 0;

  return (
    <PrintLayout
      title="إيصال دفعة"
      subtitle="Payment Receipt"
      documentId={payment.id}
      footerNotes="إيصال رسمي معتمد - شكراً لدفعكم"
      showWatermark={true}
      watermarkText="PAID"
    >
      <div className="space-y-6">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-emerald-600 mb-2">تم استلام الدفعة بنجاح</h2>
          <p className="text-slate-600">نشكرك لثقتكم بنا</p>
        </div>

        {/* Payment Summary Card */}
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              تفاصيل الدفعة
            </h3>
            <div className="text-2xl font-bold text-emerald-600">
              {formatMoney(payment.amount)} {invoice.currency}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">طريقة الدفع:</span>
              <span className="font-medium text-slate-800 flex items-center gap-1">
                <span>{getPaymentMethodIcon(payment.method)}</span>
                {getPaymentMethodLabel(payment.method)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">التاريخ:</span>
              <span className="font-medium text-slate-800">{formatDateTime(payment.paidAt)}</span>
            </div>
            {payment.reference && (
              <div className="flex justify-between col-span-2">
                <span className="text-slate-600">رقم المرجع:</span>
                <span className="font-medium text-slate-800 font-mono">{payment.reference}</span>
              </div>
            )}
          </div>
        </div>

        {/* Patient & Invoice Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Patient Information */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              بيانات المريض
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-600">الاسم:</span>
                <span className="font-medium text-slate-800">{patient?.fullName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">رقم الملف:</span>
                <span className="font-mono text-slate-800">{patient?.mrn || "—"}</span>
              </div>
              {encounter && (
                <div className="flex justify-between">
                  <span className="text-slate-600">نوع الزيارة:</span>
                  <span className="font-medium text-slate-800">
                    {getEncounterTypeLabel(encounter.type)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Invoice Information */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              بيانات الفاتورة
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-600">رقم الفاتورة:</span>
                <span className="font-mono text-slate-800">#{invoice.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">تاريخ الفاتورة:</span>
                <span className="font-medium text-slate-800">{formatDate(invoice.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">الحالة:</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  isFullyPaid 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {isFullyPaid ? 'مدفوعة بالكامل' : 'مدفوعة جزئياً'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Invoice Summary */}
        <div className="bg-white border-2 border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
              ملخص الفاتورة
          </h3>
          
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">المبلغ الإجمالي:</span>
              <span className="font-medium text-slate-800">{formatMoney(invoice.totalAmount)} {invoice.currency}</span>
            </div>
            
            {Number(invoice.discountAmount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">الخصم:</span>
                <span className="font-medium text-rose-600">-{formatMoney(invoice.discountAmount)} {invoice.currency}</span>
              </div>
            )}
            
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-slate-600">المبلغ الصافي:</span>
              <span className="font-bold text-slate-800">
                {formatMoney(Number(invoice.totalAmount) - Number(invoice.discountAmount))} {invoice.currency}
              </span>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">المبلغ المدفوع:</span>
              <span className="font-medium text-emerald-600">{formatMoney(invoice.paidAmount)} {invoice.currency}</span>
            </div>
            
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-slate-600 font-medium">المبلغ المتبقي:</span>
              <span className={`font-bold text-lg ${
                Number(invoice.remainingAmount) > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}>
                {formatMoney(invoice.remainingAmount)} {invoice.currency}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Breakdown */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
              تفاصيل الدفعة
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white p-4 rounded-lg border border-blue-100">
              <div className="text-slate-600 mb-1">رقم الدفعة</div>
              <div className="font-bold text-slate-800 text-lg">#{payment.id}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-blue-100">
              <div className="text-slate-600 mb-1">المبلغ المدفوع</div>
              <div className="font-bold text-emerald-600 text-lg">{formatMoney(payment.amount)}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-blue-100">
              <div className="text-slate-600 mb-1">طريقة الدفع</div>
              <div className="font-bold text-slate-800 flex items-center gap-1">
                <span>{getPaymentMethodIcon(payment.method)}</span>
                {getPaymentMethodLabel(payment.method)}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Notes */}
        <div className="text-center text-sm text-slate-600 bg-slate-50 rounded-lg p-4">
          <p className="mb-2">• هذا الإيصال دليل على الدفعة ولا يعتبر فاتورة ضريبية</p>
          <p>• يرجى الاحتفاظ به للمراجعة والمطالبة</p>
          <p className="mt-2 font-medium text-emerald-600">شكراً لدفعكم!</p>
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
//             <div className="flex justify-between">
//               <span className="text-slate-500">الاسم:</span>
//               <span className="font-bold">{patient?.fullName}</span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-slate-500">رقم الملف:</span>
//               <span className="font-mono">{patient?.mrn}</span>
//             </div>
//           </div>
//         </div>

//         {/* تفاصيل الفاتورة المرتبطة */}
//         <div className="bg-slate-50 p-3 rounded border border-slate-100">
//           <div className="font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">المرجع (الفاتورة)</div>
//           <div className="space-y-1">
//             <div className="flex justify-between">
//               <span className="text-slate-500">رقم الفاتورة:</span>
//               <span className="font-mono">#{invoice.id}</span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-slate-500">تاريخها:</span>
//               <span>{formatDateTime(invoice.createdAt)}</span>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* المبلغ المستلم - أبرز جزء */}
//       <div className="border-2 border-slate-900 rounded-lg p-4 mb-6 text-center bg-slate-50">
//         <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">المبلغ المستلم</div>
//         <div className="text-3xl font-bold text-slate-900 font-mono">
//           {formatMoney(payment.amount)} <span className="text-lg text-slate-500">{currency}</span>
//         </div>
//         <div className="text-xs font-bold text-emerald-600 mt-2 bg-emerald-50 inline-block px-3 py-1 rounded-full border border-emerald-100">
//           {payment.method}
//           {payment.reference && <span className="text-slate-400 font-normal"> - Ref: {payment.reference}</span>}
//         </div>
//       </div>

//       {/* جدول التفاصيل المالية المصغرة */}
//       <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
//         <table className="w-full text-xs">
//           <thead className="bg-slate-50 border-b border-slate-200">
//             <tr>
//               <th className="py-2 px-3 text-right font-medium text-slate-500">البيان</th>
//               <th className="py-2 px-3 text-left font-medium text-slate-500">القيمة</th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-slate-100">
//             <tr>
//               <td className="py-2 px-3 text-slate-700">إجمالي قيمة الفاتورة</td>
//               <td className="py-2 px-3 text-left font-mono">{formatMoney(invoice.totalAmount)}</td>
//             </tr>
//             <tr>
//               <td className="py-2 px-3 text-slate-700">إجمالي المدفوع سابقاً</td>
//               <td className="py-2 px-3 text-left font-mono">{formatMoney(invoice.paidAmount - payment.amount)}</td>
//             </tr>
//             <tr className="bg-slate-50/50">
//               <td className="py-2 px-3 font-bold text-emerald-700">الدفعة الحالية</td>
//               <td className="py-2 px-3 text-left font-bold font-mono text-emerald-700">{formatMoney(payment.amount)}</td>
//             </tr>
//             <tr>
//               <td className="py-2 px-3 font-bold text-slate-900">المتبقي بعد الدفع</td>
//               <td className="py-2 px-3 text-left font-bold font-mono text-rose-600">{formatMoney(afterThisPayment)}</td>
//             </tr>
//           </tbody>
//         </table>
//       </div>

//       {/* التاريخ والوقت */}
//       <div className="text-xs text-slate-400 text-center mb-8">
//         تاريخ ووقت العملية: <span className="font-mono text-slate-600">{formatDateTime(payment.paidAt)}</span>
//       </div>

//       {/* التوقيع */}
//       <div className="flex justify-between items-end mt-auto pt-8">
//         <div className="text-center">
//           <div className="h-px w-32 bg-slate-300 mb-2"></div>
//           <div className="text-[10px] text-slate-500">توقيع المستلم (الكاشير)</div>
//         </div>
//         <div className="text-center">
//           <div className="h-px w-32 bg-slate-300 mb-2"></div>
//           <div className="text-[10px] text-slate-500">توقيع الدافع (المريض)</div>
//         </div>
//       </div>
//     </PrintLayout>
//   );
// }
// }
