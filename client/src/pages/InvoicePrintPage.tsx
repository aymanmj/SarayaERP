// src/pages/InvoicePrintPage.tsx

import { useEffect, useState, useMemo, Fragment } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import PrintLayout from "../components/print/PrintLayout";
import type { OrganizationSettings } from "../types/organization";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

type EncounterStatus = "OPEN" | "CLOSED" | "CANCELLED";
type EncounterType = "OPD" | "ER" | "IPD";

type Patient = {
  id: number;
  fullName: string;
  mrn: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dateOfBirth?: string | null;
};

type BillingPayment = {
  id: number;
  amount: string;
  method: string;
  paidAt: string;
  reference?: string | null;
};

type ServiceItemLite = {
  id: number;
  name: string;
  code?: string | null;
};

type ChargeLite = {
  id: number;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  createdAt: string;
  serviceItem: ServiceItemLite;
};

type InvoiceLite = {
  id: number;
  status: string;
  totalAmount: string;
  discountAmount: string;
  paidAmount: string;
  currency: string;
  createdAt: string;
};

type InvoicePrintData = {
  invoice: InvoiceLite;
  encounter: {
    id: number;
    type: EncounterType;
    status: EncounterStatus;
  } | null;
  patient: Patient | null;
  charges: ChargeLite[];
  payments: BillingPayment[];
};

// ==== أنواع بيانات الـ breakdown من /cashier/invoices/:id/details ====

type PharmacyInvoiceItem = {
  id: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  isSubstitute: boolean;
  dispensedDrug: {
    id: number;
    code: string | null;
    name: string;
    strength: string | null;
    form: string | null;
  } | null;
  originalDrug: {
    id: number;
    code: string | null;
    name: string;
    strength: string | null;
    form: string | null;
  } | null;
};

type CashierInvoiceLine = {
  id: number;
  description: string;
  serviceCode: string | null;
  serviceType: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  pharmacyItems?: PharmacyInvoiceItem[];
};

type CashierInvoiceDetails = {
  invoice: {
    id: number;
    status: string;
    totalAmount: number;
    discountAmount: number;
    paidAmount: number;
    remainingAmount: number;
    currency: string;
    createdAt: string;
    patient?: Patient | null;
    encounter?: { id: number; type: EncounterType } | null;
  };
  lines: CashierInvoiceLine[];
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
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

export default function InvoicePrintPage() {
  const { id } = useParams();
  const invoiceId = Number(id);

  // ✅ استخدام React Query لجلب البيانات مرة واحدة وتخزينها
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["invoicePrintData", invoiceId],
    queryFn: async () => {
      if (!invoiceId || isNaN(invoiceId))
        throw new Error("رقم الفاتورة غير صحيح");

      const [invoiceRes, detailsRes] = await Promise.all([
        apiClient.get(`/billing/invoices/${invoiceId}/print`),
        apiClient.get(`/cashier/invoices/${invoiceId}/details`),
      ]);

      const pharmacyMap: Record<number, any[]> = {};
      for (const line of detailsRes.data.lines) {
        if (line.pharmacyItems && line.pharmacyItems.length > 0) {
          pharmacyMap[line.id] = line.pharmacyItems;
        }
      }

      return {
        ...invoiceRes.data,
        encounter: invoiceRes.data.encounter ?? null,
        patient: invoiceRes.data.patient ?? null,
        pharmacyMap, // نمرر الخريطة مع البيانات
      };
    },
    enabled: !!invoiceId,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <span className="font-medium">جارِ إعداد الفاتورة...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-rose-500 font-bold">
        خطأ: {(error as any)?.message || "تعذر تحميل الفاتورة"}
      </div>
    );
  }

  if (!data) return null;

  const { invoice, patient, encounter, charges, payments, pharmacyMap } = data;
  const isCreditNote = invoice.type === "CREDIT_NOTE";

  // حساب المجاميع
  const subTotal = charges.reduce(
    (sum: number, c: any) => sum + Number(c.totalAmount ?? 0),
    0,
  );
  const discount = Number(invoice.discountAmount ?? 0);
  const netTotal = subTotal - discount; // + VAT if needed
  const paid = Number(invoice.paidAmount ?? 0);
  const remaining = netTotal - paid;

  return (
    <PrintLayout
      title={isCreditNote ? "إشعار دائن (مرتجع)" : "فاتورة ضريبية"}
      subtitle={isCreditNote ? "Credit Note" : "Tax Invoice"}
      documentId={invoice.id}
      footerNotes="نسخة إلكترونية معتمدة."
    >
      {/* Watermark */}
      {isCreditNote && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-10">
          <div className="text-[120px] font-black text-rose-600 -rotate-45 border-8 border-rose-600 px-10 rounded-3xl">
            مرتجع / RETURN
          </div>
        </div>
      )}

      {/* Grid Info */}
      <div className="grid grid-cols-2 gap-6 mb-8 text-sm relative z-10">
        <div className="bg-slate-50/50 p-4 rounded-lg border border-slate-200">
          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-3 border-b border-slate-200 pb-1">
            بيانات المريض (Patient Info)
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">الاسم:</span>
              <span className="font-bold text-slate-900">
                {patient?.fullName || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">رقم الملف:</span>
              <span className="font-mono text-slate-700 font-semibold">
                {patient?.mrn || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الجهة الضامنة:</span>
              <span className="text-slate-900">
                {invoice.insuranceShare > 0 ? "تأمين" : "نقدي (مريض)"}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50/50 p-4 rounded-lg border border-slate-200">
          <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-3 border-b border-slate-200 pb-1">
            تفاصيل الفاتورة (Invoice Details)
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">التاريخ:</span>
              <span className="font-medium text-slate-900 font-mono">
                {formatDateTime(invoice.createdAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الحالة:</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  invoice.status === "PAID"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : invoice.status === "DRAFT"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {invoice.status}
              </span>
            </div>
            {invoice.originalInvoiceId && (
              <div className="flex justify-between">
                <span className="text-slate-500">فاتورة أصلية:</span>
                <span className="font-mono font-bold text-slate-700">
                  #{invoice.originalInvoiceId}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="mb-8 relative z-10">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="py-2 px-3 text-right font-bold w-12 rounded-tr-md">
                #
              </th>
              <th className="py-2 px-3 text-right font-bold">
                البيان / Description
              </th>
              <th className="py-2 px-3 text-center font-bold w-20">الكمية</th>
              <th className="py-2 px-3 text-right font-bold w-28">
                سعر الوحدة
              </th>
              <th className="py-2 px-3 text-right font-bold w-28 rounded-tl-md">
                الإجمالي
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {charges.map((c: any, idx: number) => {
              const items = pharmacyMap[c.id] ?? [];
              return (
                <Fragment key={c.id}>
                  <tr className="odd:bg-white even:bg-slate-50/50">
                    <td className="py-3 px-3 text-right text-slate-500 border-l border-slate-100 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-slate-800">
                      {c.serviceItem.name}
                      {c.serviceItem.code && (
                        <span className="text-xs text-slate-400 block mt-0.5 font-mono">
                          {c.serviceItem.code}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-600 font-mono">
                      {c.quantity}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-600 font-mono">
                      {formatMoney(c.unitPrice)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-900 font-bold font-mono border-r border-slate-100">
                      {formatMoney(c.totalAmount)}
                    </td>
                  </tr>

                  {items.length > 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="bg-slate-50 p-0 border-x border-slate-100"
                      >
                        <div className="px-12 py-2">
                          <table className="w-full text-[10px] text-slate-500 mb-2 border border-slate-200 rounded">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="py-1 px-2 text-right font-normal">
                                  اسم الدواء
                                </th>
                                <th className="py-1 px-2 text-center font-normal">
                                  الكمية
                                </th>
                                <th className="py-1 px-2 text-right font-normal">
                                  سعر الوحدة
                                </th>
                                <th className="py-1 px-2 text-right font-normal">
                                  إجمالي
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {items.map((item: any) => (
                                <tr key={item.id}>
                                  <td className="py-1 px-2">
                                    {item.dispensedDrug?.name}
                                  </td>
                                  <td className="py-1 px-2 text-center font-mono">
                                    {item.quantity}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono">
                                    {formatMoney(item.unitPrice)}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono">
                                    {formatMoney(item.totalAmount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-900">
            <tr className="bg-slate-50">
              <td colSpan={3}></td>
              <td className="py-2 px-3 text-right font-bold text-slate-600">
                المجموع:
              </td>
              <td className="py-2 px-3 text-right font-bold font-mono text-slate-800">
                {formatMoney(subTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Totals Section */}
      <div className="flex justify-end mb-8 relative z-10">
        <div className="w-[300px] bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          {discount > 0 && (
            <div className="flex justify-between text-sm text-rose-600 mb-2">
              <span>الخصم:</span>
              <span className="font-mono font-bold">
                - {formatMoney(discount)}
              </span>
            </div>
          )}

          <div className="flex justify-between text-base font-black text-slate-900 border-b-2 border-slate-900 pb-2 mb-2">
            <span>الصـافـي:</span>
            <span className="font-mono">
              {formatMoney(netTotal)}{" "}
              <span className="text-xs font-normal text-slate-500">
                {invoice.currency}
              </span>
            </span>
          </div>

          <div className="flex justify-between text-sm text-emerald-600 pt-1">
            <span>تم دفع:</span>
            <span className="font-mono font-bold">{formatMoney(paid)}</span>
          </div>

          <div className="flex justify-between text-sm text-slate-900 pt-1 border-t border-slate-200 mt-2">
            <span>المتبقي:</span>
            <span
              className={`font-mono font-bold ${remaining > 0.001 ? "text-rose-600" : "text-slate-400"}`}
            >
              {formatMoney(remaining)}
            </span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="flex justify-between items-end mt-auto pt-10 border-t border-slate-200 relative z-10">
        <div className="text-center w-1/3">
          <div className="h-px bg-slate-400 mb-2 w-32 mx-auto"></div>
          <div className="text-[10px] text-slate-500 font-bold uppercase">
            المحاسب (Cashier)
          </div>
        </div>
        <div className="text-center w-1/3">
          <div className="h-px bg-slate-400 mb-2 w-32 mx-auto"></div>
          <div className="text-[10px] text-slate-500 font-bold uppercase">
            المستلم (Receiver)
          </div>
        </div>
      </div>
    </PrintLayout>
  );
}

// // src/pages/InvoicePrintPage.tsx

// import { useEffect, useState, useMemo, Fragment } from "react";
// import { useParams } from "react-router-dom";
// import { apiClient } from "../api/apiClient";
// import PrintLayout from "../components/print/PrintLayout";
// import type { OrganizationSettings } from "../types/organization";
// import { useQuery } from "@tanstack/react-query";
// import { Loader2 } from "lucide-react";

// type EncounterStatus = "OPEN" | "CLOSED" | "CANCELLED";
// type EncounterType = "OPD" | "ER" | "IPD";

// type Patient = {
//   id: number;
//   fullName: string;
//   mrn: string;
//   gender?: "MALE" | "FEMALE" | "OTHER" | null;
//   dateOfBirth?: string | null;
// };

// type BillingPayment = {
//   id: number;
//   amount: string;
//   method: string;
//   paidAt: string;
//   reference?: string | null;
// };

// type ServiceItemLite = {
//   id: number;
//   name: string;
//   code?: string | null;
// };

// type ChargeLite = {
//   id: number;
//   quantity: number;
//   unitPrice: string;
//   totalAmount: string;
//   createdAt: string;
//   serviceItem: ServiceItemLite;
// };

// type InvoiceLite = {
//   id: number;
//   status: string;
//   totalAmount: string;
//   discountAmount: string;
//   paidAmount: string;
//   currency: string;
//   createdAt: string;
// };

// type InvoicePrintData = {
//   invoice: InvoiceLite;
//   encounter: {
//     id: number;
//     type: EncounterType;
//     status: EncounterStatus;
//   } | null;
//   patient: Patient | null;
//   charges: ChargeLite[];
//   payments: BillingPayment[];
// };

// // ==== أنواع بيانات الـ breakdown من /cashier/invoices/:id/details ====

// type PharmacyInvoiceItem = {
//   id: number;
//   quantity: number;
//   unitPrice: number;
//   totalAmount: number;
//   isSubstitute: boolean;
//   dispensedDrug: {
//     id: number;
//     code: string | null;
//     name: string;
//     strength: string | null;
//     form: string | null;
//   } | null;
//   originalDrug: {
//     id: number;
//     code: string | null;
//     name: string;
//     strength: string | null;
//     form: string | null;
//   } | null;
// };

// type CashierInvoiceLine = {
//   id: number;
//   description: string;
//   serviceCode: string | null;
//   serviceType: string | null;
//   quantity: number;
//   unitPrice: number;
//   totalAmount: number;
//   pharmacyItems?: PharmacyInvoiceItem[];
// };

// type CashierInvoiceDetails = {
//   invoice: {
//     id: number;
//     status: string;
//     totalAmount: number;
//     discountAmount: number;
//     paidAmount: number;
//     remainingAmount: number;
//     currency: string;
//     createdAt: string;
//     patient?: Patient | null;
//     encounter?: { id: number; type: EncounterType } | null;
//   };
//   lines: CashierInvoiceLine[];
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

// export default function InvoicePrintPage() {
//   const { id } = useParams();
//   const invoiceId = Number(id);

//   const [data, setData] = useState<InvoicePrintData | null>(null);
//   const [pharmacyMap, setPharmacyMap] = useState<
//     Record<number, PharmacyInvoiceItem[]>
//   >({});
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [org, setOrg] = useState<OrganizationSettings | null>(null);

//   useEffect(() => {
//     if (!invoiceId || Number.isNaN(invoiceId)) {
//       setError("رقم الفاتورة غير صحيح.");
//       return;
//     }

//     const load = async () => {
//       setLoading(true);
//       setError(null);
//       try {
//         const [invoiceRes, detailsRes, orgRes] = await Promise.all([
//           apiClient.get<InvoicePrintData>(
//             `/billing/invoices/${invoiceId}/print`,
//           ),
//           apiClient.get<CashierInvoiceDetails>(
//             `/cashier/invoices/${invoiceId}/details`,
//           ),
//           apiClient.get<OrganizationSettings>("/settings/organization"),
//         ]);

//         setData({
//           ...invoiceRes.data,
//           encounter: invoiceRes.data.encounter ?? null,
//           patient: invoiceRes.data.patient ?? null,
//         });

//         const map: Record<number, PharmacyInvoiceItem[]> = {};
//         for (const line of detailsRes.data.lines) {
//           if (line.pharmacyItems && line.pharmacyItems.length > 0) {
//             map[line.id] = line.pharmacyItems;
//           }
//         }
//         setPharmacyMap(map);

//         setOrg(orgRes.data);
//       } catch (err: any) {
//         console.error(err);
//         const msg = err?.response?.data?.message;
//         if (typeof msg === "string") setError(msg);
//         else setError("حدث خطأ أثناء تحميل بيانات الفاتورة.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     load();
//   }, [invoiceId]);

//   const totals = useMemo(() => {
//     if (!data) {
//       return {
//         subTotal: 0,
//         discount: 0,
//         netTotal: 0,
//         paid: 0,
//         remaining: 0,
//       };
//     }

//     const subTotal = data.charges.reduce(
//       (sum, c) => sum + Number(c.totalAmount ?? 0),
//       0,
//     );

//     const discount = Number(data.invoice.discountAmount ?? 0);
//     const netTotal = subTotal - discount;
//     const paid = Number(data.invoice.paidAmount ?? 0);
//     const remaining = netTotal - paid;

//     return { subTotal, discount, netTotal, paid, remaining };
//   }, [data]);

//   const formatMoney = (val: number | string | null | undefined) => {
//     const num = Number(val ?? 0);
//     return num.toFixed(3);
//   };

//   if (loading) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-slate-50">
//         <div className="text-slate-500 animate-pulse">
//           جارِ إعداد معاينة الطباعة...
//         </div>
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

//   const { invoice, patient, encounter, charges, payments } = data;

//   return (
//     <PrintLayout
//       title="فاتورة خدمات"
//       subtitle={invoice.status === "PAID" ? "مدفوعة بالكامل" : "مستحقة الدفع"}
//       documentId={invoice.id}
//       footerNotes="نتمنى لكم دوام الصحة والعافية."
//     >
//       {/* قسم المعلومات العلوية */}
//       <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
//         {/* بيانات المريض */}
//         <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
//           <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">
//             بيانات المريض
//           </div>
//           <div className="space-y-2">
//             <div className="flex justify-between">
//               <span className="text-slate-500">الاسم:</span>
//               <span className="font-bold text-slate-900">
//                 {patient?.fullName || "—"}
//               </span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-slate-500">رقم الملف:</span>
//               <span className="font-mono text-slate-700">
//                 {patient?.mrn || "—"}
//               </span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-slate-500">تاريخ الميلاد:</span>
//               <span className="text-slate-700">
//                 {patient?.dateOfBirth
//                   ? formatDateTime(patient.dateOfBirth).split(",")[0]
//                   : "—"}
//               </span>
//             </div>
//           </div>
//         </div>

//         {/* بيانات الفاتورة */}
//         <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
//           <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">
//             معلومات الفاتورة
//           </div>
//           <div className="space-y-2">
//             <div className="flex justify-between">
//               <span className="text-slate-500">التاريخ:</span>
//               <span className="font-medium text-slate-900">
//                 {formatDateTime(invoice.createdAt)}
//               </span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-slate-500">الحالة:</span>
//               <span
//                 className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
//                   invoice.status === "PAID"
//                     ? "bg-emerald-50 text-emerald-700 border-emerald-200"
//                     : invoice.status === "DRAFT"
//                       ? "bg-amber-50 text-amber-700 border-amber-200"
//                       : "bg-slate-100 text-slate-700 border-slate-200"
//                 }`}
//               >
//                 {invoice.status}
//               </span>
//             </div>
//             {encounter && (
//               <div className="flex justify-between">
//                 <span className="text-slate-500">نوع الزيارة:</span>
//                 <span className="text-slate-700">{encounter.type}</span>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* جدول الخدمات */}
//       <div className="mb-8">
//         <table className="w-full text-sm border-collapse">
//           <thead>
//             <tr className="border-b-2 border-slate-800">
//               <th className="py-2 text-right font-bold text-slate-900 w-12">
//                 #
//               </th>
//               <th className="py-2 text-right font-bold text-slate-900">
//                 الوصف / الخدمة
//               </th>
//               <th className="py-2 text-center font-bold text-slate-900 w-24">
//                 الكمية
//               </th>
//               <th className="py-2 text-right font-bold text-slate-900 w-32">
//                 السعر
//               </th>
//               <th className="py-2 text-right font-bold text-slate-900 w-32">
//                 الإجمالي
//               </th>
//             </tr>
//           </thead>
//           <tbody className="divide-y divide-slate-100">
//             {charges.map((c, idx) => {
//               const pharmacyItems = pharmacyMap[c.id] ?? [];
//               const hasPharmacy = pharmacyItems.length > 0;
//               return (
//                 <Fragment key={c.id}>
//                   <tr>
//                     <td className="py-3 text-right text-slate-500">
//                       {idx + 1}
//                     </td>
//                     <td className="py-3 text-right font-medium text-slate-800">
//                       {c.serviceItem.name}
//                       {c.serviceItem.code && (
//                         <span className="text-xs text-slate-400 block mt-0.5 font-mono">
//                           {c.serviceItem.code}
//                         </span>
//                       )}
//                     </td>
//                     <td className="py-3 text-center text-slate-600">
//                       {c.quantity}
//                     </td>
//                     <td className="py-3 text-right text-slate-600 font-mono">
//                       {formatMoney(c.unitPrice)}
//                     </td>
//                     <td className="py-3 text-right text-slate-900 font-bold font-mono">
//                       {formatMoney(c.totalAmount)}
//                     </td>
//                   </tr>

//                   {/* Pharmacy Breakdown Sub-table */}
//                   {hasPharmacy && (
//                     <tr>
//                       <td colSpan={5} className="bg-slate-50/50 p-0">
//                         <div className="pr-12 pl-4 py-2">
//                           <table className="w-full text-xs text-slate-500 mb-2">
//                             <thead>
//                               <tr className="border-b border-slate-200">
//                                 <th className="py-1 text-right font-normal">
//                                   اسم الدواء
//                                 </th>
//                                 <th className="py-1 text-center font-normal">
//                                   الكمية
//                                 </th>
//                                 <th className="py-1 text-right font-normal">
//                                   سعر الوحدة
//                                 </th>
//                                 <th className="py-1 text-right font-normal">
//                                   إجمالي
//                                 </th>
//                               </tr>
//                             </thead>
//                             <tbody>
//                               {pharmacyItems.map((item) => (
//                                 <tr
//                                   key={item.id}
//                                   className="border-b border-slate-100/50"
//                                 >
//                                   <td className="py-1">
//                                     {item.dispensedDrug?.name}
//                                   </td>
//                                   <td className="py-1 text-center">
//                                     {item.quantity}
//                                   </td>
//                                   <td className="py-1 text-right">
//                                     {formatMoney(item.unitPrice)}
//                                   </td>
//                                   <td className="py-1 text-right">
//                                     {formatMoney(item.totalAmount)}
//                                   </td>
//                                 </tr>
//                               ))}
//                             </tbody>
//                           </table>
//                         </div>
//                       </td>
//                     </tr>
//                   )}
//                 </Fragment>
//               );
//             })}
//           </tbody>
//         </table>
//       </div>

//       {/* المجاميع والملخص */}
//       <div className="flex justify-end mb-12">
//         <div className="w-[300px] bg-slate-50 rounded-lg p-4 space-y-3">
//           <div className="flex justify-between text-sm text-slate-600">
//             <span>المجموع الفرعي:</span>
//             <span className="font-mono">{formatMoney(totals.subTotal)}</span>
//           </div>
//           <div className="flex justify-between text-sm text-slate-600">
//             <span>الخصم:</span>
//             <span className="font-mono text-rose-500">
//               - {formatMoney(totals.discount)}
//             </span>
//           </div>
//           <div className="h-px bg-slate-200 my-2"></div>
//           <div className="flex justify-between text-base font-bold text-slate-900">
//             <span>الصافي المطلوب:</span>
//             <span className="font-mono">
//               {formatMoney(totals.netTotal)}{" "}
//               <span className="text-xs font-normal text-slate-500">
//                 {invoice.currency}
//               </span>
//             </span>
//           </div>

//           <div className="flex justify-between text-sm text-emerald-600 pt-2">
//             <span>تم دفع:</span>
//             <span className="font-mono font-bold">
//               {formatMoney(totals.paid)}
//             </span>
//           </div>

//           <div className="flex justify-between text-sm text-slate-900 pt-1 border-t border-slate-200 mt-2">
//             <span>المتبقي:</span>
//             <span
//               className={`font-mono font-bold ${totals.remaining > 0 ? "text-rose-600" : "text-slate-400"}`}
//             >
//               {formatMoney(totals.remaining)}
//             </span>
//           </div>
//         </div>
//       </div>

//       {/* قسم المدفوعات المسجلة */}
//       {payments.length > 0 && (
//         <div className="mb-8 border-t border-slate-100 pt-4">
//           <h4 className="text-sm font-bold text-slate-900 mb-3">
//             سجل الدفعات المستلمة
//           </h4>
//           <div className="flex gap-4 flex-wrap">
//             {payments.map((p) => (
//               <div
//                 key={p.id}
//                 className="text-xs bg-white border border-slate-200 rounded px-3 py-2 flex gap-4 items-center"
//               >
//                 <span className="font-mono text-slate-500">
//                   {formatDateTime(p.paidAt)}
//                 </span>
//                 <span className="font-bold text-slate-900">{p.method}</span>
//                 <span className="font-mono font-bold text-emerald-600">
//                   {formatMoney(p.amount)} {invoice.currency}
//                 </span>
//               </div>
//             ))}
//           </div>
//         </div>
//       )}
//     </PrintLayout>
//   );
// }
