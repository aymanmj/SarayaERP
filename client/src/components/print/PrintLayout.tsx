import React from "react";
import { apiClient } from "../../api/apiClient";
import type { OrganizationSettings } from "../../types/organization";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer, X, Download, Share2 } from "lucide-react";

interface PrintLayoutProps {
  title: string;
  subtitle?: string;
  documentId?: string | number;
  children: React.ReactNode;
  footerNotes?: string;
  pageSize?: "A4" | "A5";
  organizationSettings?: OrganizationSettings;
  showWatermark?: boolean;
  watermarkText?: string;
}

export default function PrintLayout({
  title,
  subtitle,
  documentId,
  children,
  footerNotes,
  pageSize = "A4",
  organizationSettings,
  showWatermark = false,
  watermarkText = "ORIGINAL",
}: PrintLayoutProps) {
  const { data: fetchedOrg, isLoading } = useQuery({
    queryKey: ["organizationSettings"],
    queryFn: async () => {
      const res = await apiClient.get<OrganizationSettings>("/settings/organization");
      return res.data;
    },
    enabled: !organizationSettings,
    staleTime: Infinity,
  });

  const org = organizationSettings || fetchedOrg;

  const handlePrint = async () => {
    try {
      // استخراج ID من المسار الحالي
      const currentPath = window.location.pathname;
      const idMatch = currentPath.match(/\/(\d+)(?:\/|$)/);
      const id = idMatch ? idMatch[1] : null;
      
      if (!id) {
        console.error('Could not extract ID from path');
        return;
      }

      // طلب الملف كـ Blob من نفس endpoint المستخدم في InvoiceDetailsPage
      const response = await apiClient.get(`/billing/invoices/${id}/pdf`, {
        responseType: "blob",
      });

      // إنشاء رابط مؤقت للملف في المتصفح
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));

      // فتح الملف في نافذة جديدة
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("target", "_blank");
      document.body.appendChild(link);
      link.click();

      // تنظيف الذاكرة
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  const handleDownload = () => {
    // يمكن إضافة منطق التحميل هنا
    window.print();
  };

  const handleShare = () => {
    // يمكن إضافة منطق المشاركة هنا
    if (navigator.share) {
      navigator.share({
        title: title,
        text: `مستند: ${title}`,
        url: window.location.href,
      });
    }
  };

  if (isLoading && !org) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-lg">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-600" />
          <div className="text-slate-600 font-medium">جاري تحميل بيانات الطباعة...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex justify-center py-8 print:bg-white print:p-0 print:m-0">
      <div
        id="print-container"
        className={`bg-white text-slate-900 shadow-2xl rounded-2xl overflow-hidden flex flex-col print:shadow-none print:w-full print:h-auto print:rounded-none
          ${pageSize === "A5" ? "w-[148mm] min-h-[210mm]" : "w-[210mm] min-h-[297mm]"}
        `}
        dir="rtl"
      >
        {/* Enhanced Actions Bar */}
        <div className="no-print bg-gradient-to-r from-emerald-50 to-slate-50 border-b border-emerald-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium">
                <Printer className="w-4 h-4" />
                معاينة الطباعة
              </div>
              {documentId && (
                <div className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-mono">
                  #{documentId}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 text-sm"
              >
                <Share2 className="w-4 h-4" />
                مشاركة
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 text-sm shadow-sm"
              >
                <Download className="w-4 h-4" />
                تحميل
              </button>
              <button
                onClick={handlePrint}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 text-sm shadow-lg hover:shadow-xl"
              >
                <Printer className="w-4 h-4" />
                طباعة المستند
              </button>
              <button
                onClick={() => window.close()}
                className="p-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-all duration-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Header */}
        <header className="relative bg-gradient-to-r from-emerald-50 via-white to-slate-50 border-b-2 border-emerald-600 pb-8 mb-6">
          {/* Watermark */}
          {showWatermark && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-5">
              <div className="text-[100px] font-black text-emerald-600 rotate-12 select-none">
                {watermarkText}
              </div>
            </div>
          )}

          <div className="relative z-10 px-8 pt-8">
            <div className="flex justify-between items-start">
              {/* Organization Info */}
              <div className="text-right space-y-3">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                  {org?.displayName || "المستشفى المركزي"}
                </h1>
                <div className="text-sm text-slate-600 max-w-[350px] leading-relaxed">
                  {org?.address || "العنوان الرئيسي للمنشأة"}
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                  {org?.phone && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <span className="text-slate-400">📞</span>
                      <span className="font-medium">{org.phone}</span>
                    </div>
                  )}
                  {org?.email && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <span className="text-slate-400">✉️</span>
                      <span className="font-medium">{org.email}</span>
                    </div>
                  )}
                  {org?.website && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <span className="text-slate-400">🌐</span>
                      <span className="font-medium">{org.website}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Logo & Document Title */}
              <div className="text-left flex flex-col items-end">
                {org?.logoUrl && (
                  <div className="mb-4 p-2 bg-white rounded-lg shadow-sm">
                    <img
                      src={org.logoUrl}
                      alt="Logo"
                      className="h-20 w-auto object-contain"
                    />
                  </div>
                )}
                <div className="text-right">
                  <div className="text-4xl font-bold text-emerald-900 uppercase tracking-wider mb-2">
                    {title}
                  </div>
                  {subtitle && (
                    <div className="text-sm text-emerald-600 font-medium uppercase tracking-wider mb-2">
                      {subtitle}
                    </div>
                  )}
                  {documentId && (
                    <div className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-1 rounded inline-block">
                      المرجع: #{documentId}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Enhanced Content Area */}
        <main className="flex-grow px-8 pb-8 relative z-10">
          {children}
        </main>

        {/* Enhanced Footer */}
        <footer className="mt-auto relative z-10 bg-gradient-to-r from-slate-50 to-emerald-50 border-t border-slate-200 text-center px-8 py-6">
          {footerNotes && (
            <div className="text-sm text-slate-600 mb-4 italic bg-white p-3 rounded-lg border border-slate-200">
              {footerNotes}
            </div>
          )}

          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <span>Powered by</span>
              <span className="font-bold text-emerald-600">Saraya ERP</span>
            </div>
            <div className="flex items-center gap-4">
              <span>{new Date().toLocaleString("ar-LY")}</span>
              <span>•</span>
              <span>صفحة 1 من 1</span>
            </div>
          </div>

          {/* Security Features */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex justify-center items-center gap-6 text-[9px] text-slate-400">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span>مستند أصلي</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>مؤمن رقمياً</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>معتمد إلكترونياً</span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Enhanced Print Styles */}
      <style>{`
        @media print {
          @page {
            size: ${pageSize};
            margin: 10mm;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          #print-container {
            box-shadow: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8mm !important;
            border-radius: 0 !important;
            background: white !important;
          }
          #print-container header {
            background: white !important;
            border-bottom: 2px solid #10b981 !important;
          }
          #print-container footer {
            background: white !important;
            border-top: 1px solid #e2e8f0 !important;
          }
          #print-container main {
            background: white !important;
          }
        }

        @media screen {
          #print-container {
            transition: all 0.3s ease;
          }
          #print-container:hover {
            transform: translateY(-2px);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          }
        }
      `}</style>
    </div>
  );
}

// // src/pages/InvoicePrintPage.tsx

// import { useEffect, useState, useMemo, Fragment } from "react";
// import { useParams } from "react-router-dom";
// import { apiClient } from "../../api/apiClient";
// import PrintLayout from "../../components/print/PrintLayout";
// import type { OrganizationSettings } from "../types/organization";

// // ... (نفس الـ Types السابقة كما هي في ملفك، لا تغيير عليها)

// type InvoicePrintData = {
//   invoice: any; // InvoiceLite
//   encounter: any;
//   patient: any; // Patient
//   charges: any[]; // ChargeLite
//   payments: any[]; // BillingPayment
//   creditNotes?: any[];
// };

// type CashierInvoiceDetails = {
//   invoice: any;
//   lines: any[]; // CashierInvoiceLine
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

// export default function InvoicePrintPage() {
//   const { id } = useParams();
//   const invoiceId = Number(id);

//   const [data, setData] = useState<InvoicePrintData | null>(null);
//   const [pharmacyMap, setPharmacyMap] = useState<Record<number, any[]>>({});
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   // const [org, setOrg] = useState... (موجود داخل PrintLayout)

//   useEffect(() => {
//     if (!invoiceId || Number.isNaN(invoiceId)) {
//       setError("رقم الفاتورة غير صحيح.");
//       return;
//     }

//     const load = async () => {
//       setLoading(true);
//       setError(null);
//       try {
//         const [invoiceRes, detailsRes] = await Promise.all([
//           apiClient.get<InvoicePrintData>(
//             `/billing/invoices/${invoiceId}/print`,
//           ),
//           apiClient.get<CashierInvoiceDetails>(
//             `/cashier/invoices/${invoiceId}/details`,
//           ),
//         ]);

//         setData({
//           ...invoiceRes.data,
//           encounter: invoiceRes.data.encounter ?? null,
//           patient: invoiceRes.data.patient ?? null,
//         });

//         const map: Record<number, any[]> = {};
//         for (const line of detailsRes.data.lines) {
//           if (line.pharmacyItems && line.pharmacyItems.length > 0) {
//             map[line.id] = line.pharmacyItems;
//           }
//         }
//         setPharmacyMap(map);
//       } catch (err: any) {
//         console.error(err);
//         setError("حدث خطأ أثناء تحميل بيانات الفاتورة.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     load();
//   }, [invoiceId]);

//   const totals = useMemo(() => {
//     if (!data)
//       return { subTotal: 0, discount: 0, netTotal: 0, paid: 0, remaining: 0 };
//     const subTotal = data.charges.reduce(
//       (sum, c) => sum + Number(c.totalAmount ?? 0),
//       0,
//     );
//     const discount = Number(data.invoice.discountAmount ?? 0);
//     const netTotal = subTotal - discount; // + VAT if needed
//     const paid = Number(data.invoice.paidAmount ?? 0);
//     const remaining = netTotal - paid;
//     return { subTotal, discount, netTotal, paid, remaining };
//   }, [data]);

//   if (loading) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-slate-50">
//         <div className="text-slate-500 animate-pulse font-medium">
//           جارِ إعداد معاينة الطباعة...
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

//   const { invoice, patient, encounter, charges, payments } = data;
//   const isCreditNote = invoice.type === "CREDIT_NOTE";

//   return (
//     <PrintLayout
//       title={isCreditNote ? "إشعار دائن (مرتجع)" : "فاتورة ضريبية"}
//       subtitle={isCreditNote ? "Credit Note" : "Tax Invoice"}
//       documentId={invoice.id}
//       footerNotes="نسخة إلكترونية معتمدة."
//     >
//       {/* Watermark for Credit Note */}
//       {isCreditNote && (
//         <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-10">
//           <div className="text-[120px] font-black text-rose-600 -rotate-45 border-8 border-rose-600 px-10 rounded-3xl">
//             مرتجع / RETURN
//           </div>
//         </div>
//       )}

//       {/* Grid Info */}
//       <div className="grid grid-cols-2 gap-6 mb-8 text-sm relative z-10">
//         <div className="bg-slate-50/50 p-4 rounded-lg border border-slate-200">
//           <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-3 border-b border-slate-200 pb-1">
//             بيانات المريض (Patient Info)
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
//               <span className="font-mono text-slate-700 font-semibold">
//                 {patient?.mrn || "—"}
//               </span>
//             </div>
//             <div className="flex justify-between">
//               <span className="text-slate-500">الجهة الضامنة:</span>
//               <span className="text-slate-900">
//                 {invoice.insuranceShare > 0 ? "تأمين" : "نقدي (مريض)"}
//               </span>
//             </div>
//           </div>
//         </div>

//         <div className="bg-slate-50/50 p-4 rounded-lg border border-slate-200">
//           <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-3 border-b border-slate-200 pb-1">
//             تفاصيل الفاتورة (Invoice Details)
//           </div>
//           <div className="space-y-2">
//             <div className="flex justify-between">
//               <span className="text-slate-500">التاريخ:</span>
//               <span className="font-medium text-slate-900 font-mono">
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
//             {invoice.originalInvoiceId && (
//               <div className="flex justify-between">
//                 <span className="text-slate-500">فاتورة أصلية:</span>
//                 <span className="font-mono font-bold text-slate-700">
//                   #{invoice.originalInvoiceId}
//                 </span>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* Main Table */}
//       <div className="mb-8 relative z-10">
//         <table className="w-full text-sm border-collapse">
//           <thead>
//             <tr className="bg-slate-900 text-white">
//               <th className="py-2 px-3 text-right font-bold w-12 rounded-tr-md">
//                 #
//               </th>
//               <th className="py-2 px-3 text-right font-bold">
//                 البيان / Description
//               </th>
//               <th className="py-2 px-3 text-center font-bold w-20">الكمية</th>
//               <th className="py-2 px-3 text-right font-bold w-28">
//                 سعر الوحدة
//               </th>
//               <th className="py-2 px-3 text-right font-bold w-28 rounded-tl-md">
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
//                   <tr className="odd:bg-white even:bg-slate-50/50">
//                     <td className="py-3 px-3 text-right text-slate-500 border-l border-slate-100 font-mono">
//                       {idx + 1}
//                     </td>
//                     <td className="py-3 px-3 text-right font-bold text-slate-800">
//                       {c.serviceItem.name}
//                       {c.serviceItem.code && (
//                         <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
//                           {c.serviceItem.code}
//                         </span>
//                       )}
//                     </td>
//                     <td className="py-3 px-3 text-center text-slate-600 font-mono">
//                       {c.quantity}
//                     </td>
//                     <td className="py-3 px-3 text-right text-slate-600 font-mono">
//                       {formatMoney(c.unitPrice)}
//                     </td>
//                     <td className="py-3 px-3 text-right text-slate-900 font-bold font-mono border-r border-slate-100">
//                       {formatMoney(c.totalAmount)}
//                     </td>
//                   </tr>

//                   {/* تفاصيل الأدوية إن وجدت */}
//                   {hasPharmacy && (
//                     <tr>
//                       <td
//                         colSpan={5}
//                         className="bg-slate-50 p-0 border-x border-slate-100"
//                       >
//                         <div className="px-12 py-2">
//                           <table className="w-full text-[10px] text-slate-500 mb-2 border border-slate-200 rounded">
//                             <thead className="bg-slate-100">
//                               <tr>
//                                 <th className="py-1 px-2 text-right font-normal">
//                                   اسم الدواء
//                                 </th>
//                                 <th className="py-1 px-2 text-center font-normal">
//                                   الكمية
//                                 </th>
//                                 <th className="py-1 px-2 text-right font-normal">
//                                   سعر الوحدة
//                                 </th>
//                                 <th className="py-1 px-2 text-right font-normal">
//                                   إجمالي
//                                 </th>
//                               </tr>
//                             </thead>
//                             <tbody className="divide-y divide-slate-200">
//                               {pharmacyItems.map((item) => (
//                                 <tr key={item.id}>
//                                   <td className="py-1 px-2">
//                                     {item.dispensedDrug?.name}
//                                   </td>
//                                   <td className="py-1 px-2 text-center font-mono">
//                                     {item.quantity}
//                                   </td>
//                                   <td className="py-1 px-2 text-right font-mono">
//                                     {formatMoney(item.unitPrice)}
//                                   </td>
//                                   <td className="py-1 px-2 text-right font-mono">
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
//           <tfoot className="border-t-2 border-slate-900">
//             <tr className="bg-slate-50">
//               <td colSpan={3}></td>
//               <td className="py-2 px-3 text-right font-bold text-slate-600">
//                 المجموع:
//               </td>
//               <td className="py-2 px-3 text-right font-bold font-mono text-slate-800">
//                 {formatMoney(totals.subTotal)}
//               </td>
//             </tr>
//           </tfoot>
//         </table>
//       </div>

//       {/* Totals Section */}
//       <div className="flex justify-end mb-8 relative z-10">
//         <div className="w-[300px] bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
//           {totals.discount > 0 && (
//             <div className="flex justify-between text-sm text-rose-600 mb-2">
//               <span>الخصم:</span>
//               <span className="font-mono font-bold">
//                 - {formatMoney(totals.discount)}
//               </span>
//             </div>
//           )}

//           <div className="flex justify-between text-base font-black text-slate-900 border-b-2 border-slate-900 pb-2 mb-2">
//             <span>الصـافـي:</span>
//             <span className="font-mono">
//               {formatMoney(totals.netTotal)}{" "}
//               <span className="text-[10px] font-normal text-slate-500">
//                 {invoice.currency}
//               </span>
//             </span>
//           </div>

//           <div className="flex justify-between text-sm text-emerald-600 pt-1">
//             <span>المدفوع:</span>
//             <span className="font-mono font-bold">
//               {formatMoney(totals.paid)}
//             </span>
//           </div>

//           <div className="flex justify-between text-sm text-slate-900 pt-2 mt-1 border-t border-slate-100">
//             <span>المتبقي:</span>
//             <span
//               className={`font-mono font-bold ${totals.remaining > 0.001 ? "text-rose-600" : "text-slate-400"}`}
//             >
//               {formatMoney(totals.remaining)}
//             </span>
//           </div>
//         </div>
//       </div>

//       {/* Signatures */}
//       <div className="flex justify-between items-end mt-auto pt-10 border-t border-slate-200 relative z-10">
//         <div className="text-center w-1/3">
//           <div className="h-px bg-slate-400 mb-2 w-32 mx-auto"></div>
//           <div className="text-[10px] text-slate-500 font-bold uppercase">
//             المحاسب (Cashier)
//           </div>
//         </div>
//         <div className="text-center w-1/3">
//           <div className="h-px bg-slate-400 mb-2 w-32 mx-auto"></div>
//           <div className="text-[10px] text-slate-500 font-bold uppercase">
//             المستلم (Receiver)
//           </div>
//         </div>
//       </div>
//     </PrintLayout>
//   );
// }

// import React, { useEffect, useState } from 'react';
// import { apiClient } from '../../api/apiClient';
// import type { OrganizationSettings } from '../../types/organization';

// interface PrintLayoutProps {
//   title: string;
//   subtitle?: string;
//   documentId?: string | number;
//   children: React.ReactNode;
//   footerNotes?: string;
//   pageSize?: 'A4' | 'A5'; // Added prop
// }

// export default function PrintLayout({
//   title,
//   subtitle,
//   documentId,
//   children,
//   footerNotes,
//   pageSize = 'A4', // Default to A4
// }: PrintLayoutProps) {
//   const [org, setOrg] = useState<OrganizationSettings | null>(null);

//   useEffect(() => {
//     apiClient
//       .get<OrganizationSettings>('/settings/organization')
//       .then((res) => setOrg(res.data))
//       .catch((err) => console.error('Failed to load org settings', err));
//   }, []);

//   return (
//     <div className="min-h-screen bg-slate-900 flex justify-center py-8 print:bg-white print:p-0 print:m-0">
//       <div
//         id="print-container"
//         className={`bg-white text-slate-900 shadow-2xl rounded-sm p-8 flex flex-col print:shadow-none print:w-full print:h-auto print:rounded-none
//           ${pageSize === 'A5' ? 'w-[148mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'}
//         `}
//         dir="rtl"
//       >
//         {/* Actions Bar (Hidden in Print) */}
//         <div className="no-print flex justify-between items-center mb-8 border-b pb-4 border-slate-100">
//           <div className="text-sm text-slate-400">معاينة الطباعة</div>
//           <div className="flex gap-2">
//             <button
//               onClick={() => window.print()}
//               className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium shadow-sm transition-colors flex items-center gap-2"
//             >
//               <span>🖨</span>
//               <span>طباعة المستند</span>
//             </button>
//             <button
//               onClick={() => window.close()}
//               className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md font-medium shadow-sm transition-colors"
//             >
//               إغلاق
//             </button>
//           </div>
//         </div>

//         {/* Header */}
//         <header className="flex justify-between items-start border-b-2 border-emerald-600 pb-6 mb-6">
//           {/* Organization Info */}
//           <div className="text-right space-y-2">
//             <h1 className="text-2xl font-bold text-slate-900">
//               {org?.displayName || 'المستشفى المركزي'}
//             </h1>
//             <div className="text-sm text-slate-500 max-w-[300px] leading-relaxed">
//               {org?.address || 'العنوان الرئيسي للمنشأة'}
//             </div>
//             <div className="flex gap-4 text-xs text-slate-500 mt-2">
//               {org?.phone && (
//                 <div className="flex items-center gap-1">
//                   <span>📞</span> {org.phone}
//                 </div>
//               )}
//               {org?.email && (
//                 <div className="flex items-center gap-1">
//                   <span>✉️</span> {org.email}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Logo & Document Title */}
//           <div className="text-left flex flex-col items-end">
//             {org?.logoUrl && (
//               <img
//                 src={org.logoUrl}
//                 alt="Logo"
//                 className="h-16 w-auto object-contain mb-3"
//               />
//             )}
//             <div className="text-3xl font-bold text-emerald-900 uppercase tracking-wide">
//               {title}
//             </div>
//             {subtitle && (
//               <div className="text-sm text-emerald-600 font-medium uppercase tracking-wider">
//                 {subtitle}
//               </div>
//             )}
//             {documentId && (
//               <div className="text-xs text-slate-400 mt-1 font-mono">
//                 Ref: #{documentId}
//               </div>
//             )}
//           </div>
//         </header>

//         {/* content */}
//         <main className="flex-grow">{children}</main>

//         {/* Footer */}
//         <footer className="mt-auto pt-6 border-t border-slate-200 text-center">
//           {footerNotes && (
//             <div className="text-sm text-slate-600 mb-4 italic">
//               {footerNotes}
//             </div>
//           )}

//           <div className="flex justify-center items-center gap-8 text-[10px] text-slate-400 uppercase tracking-widest">
//             <span>Powered by Saraya ERP</span>
//             <span>•</span>
//             <span>{new Date().toLocaleString('en-US')}</span>
//             <span>•</span>
//             <span>Page 1 of 1</span>
//           </div>
//         </footer>
//       </div>

//       <style>{`
//         @media print {
//           @page {
//             size: ${pageSize};
//             margin: 0;
//           }
//           body {
//             background: white;
//             -webkit-print-color-adjust: exact;
//           }
//           .no-print {
//             display: none !important;
//           }
//           #print-container {
//             box-shadow: none;
//             width: 100%;
//             margin: 0;
//             padding: ${pageSize === 'A5' ? '5mm' : '10mm'};
//           }
//         }
//       `}</style>
//     </div>
//   );
// }
