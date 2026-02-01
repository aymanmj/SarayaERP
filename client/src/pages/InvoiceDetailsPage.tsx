// src/pages/InvoiceDetailsPage.tsx

// src/pages/InvoiceDetailsPage.tsx

import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type InvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "CANCELLED";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "INSURANCE" | "OTHER";

type PatientLite = {
  id: number;
  fullName: string;
  mrn: string;
};

type EncounterLite = {
  id: number;
  type: string;
  status: string;
};

type FinancialYearLite = {
  id: number;
  code: string;
  name: string;
};

type FinancialPeriodLite = {
  id: number;
  periodCode: string;
  periodIndex: number;
  monthStartDate: string;
  monthEndDate: string;
};

type ServiceItemLite = {
  id: number;
  name: string;
  code?: string | null;
  nameAr?: string | null; // ✅ [NEW]
};

type ChargeLine = {
  id: number;
  quantity: number;
  unitPrice: number | null;
  totalAmount: number | null;
  notes?: string | null;
  serviceItem: ServiceItemLite;
};

type PaymentLite = {
  id: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string | null;
};

type InvoiceLite = {
  id: number;
  status: InvoiceStatus;
  totalAmount: number | null;
  discountAmount: number | null;
  paidAmount: number | null;
  currency: string;
  createdAt: string;
  financialYear: FinancialYearLite | null;
  financialPeriod: FinancialPeriodLite | null;
};

type InvoicePrintResponse = {
  invoice: InvoiceLite;
  encounter: EncounterLite;
  patient: PatientLite;
  charges: ChargeLine[];
  payments: PaymentLite[];
  creditNotes?: InvoiceLite[]; // ✅ [NEW]
};

// ✅ بيانات المؤسسة من /settings/organization
type OrganizationSettings = {
  id: number;
  displayName: string;
  legalName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string | null;
};

// Local formatDate removed

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ar-LY-u-nu-latn", {
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

function statusLabel(status: InvoiceStatus) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "ISSUED":
      return "صادرة";
    case "PARTIALLY_PAID":
      return "مدفوعة جزئياً";
    case "PAID":
      return "مدفوعة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return status;
  }
}

export default function InvoiceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ✅ حالة بيانات المستشفى/المؤسسة
  // const [org, setOrg] = useState<OrganizationSettings | null>(null);

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");


  // 1. Fetch Invoice Details
  const { data, isLoading: loading, error, refetch } = useQuery({
      queryKey: ['invoice', id],
      queryFn: async () => {
          if (!id) throw new Error("No ID");
          const res = await apiClient.get<InvoicePrintResponse>(`/billing/invoices/${id}/print`);
          return res.data;
      },
      enabled: !!id
  });

  // 2. Fetch Org Settings
  const { data: org } = useQuery({
      queryKey: ['organizationSettings'],
      queryFn: async () => {
          const res = await apiClient.get<OrganizationSettings>("/settings/organization");
          return res.data;
      },
      staleTime: Infinity
  });

  // 3. Mutation
  const createReturnMutation = useMutation({
      mutationFn: async () => {
          await apiClient.post(`/billing/invoices/${id}/return`, { reason: returnReason });
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['invoice', id] });
          toast.success("تم إنشاء المرتجع بنجاح");
          setIsReturnModalOpen(false);
          setReturnReason("");
      },
      onError: (err: any) => {
          console.error(err);
          toast.error(err.response?.data?.message || "فشل إنشاء المرتجع");
      }
  });

  const outstanding = useMemo(() => {
    if (!data) return 0;
    const total = Number(data.invoice.totalAmount ?? 0);
    const paid = Number(data.invoice.paidAmount ?? 0);
    return total - paid;
  }, [data]);
  
  const handleCreateReturn = () => {
      if (!id || !returnReason) return;
      createReturnMutation.mutate();
  };

  // ✅ طباعة في نافذة مستقلة مع قالب A4 واستخدام بيانات المستشفى
  // const handlePrint = () => {
  //   if (!data) {
  //     toast.error("لا توجد بيانات فاتورة للطباعة.");
  //     return;
  //   }

  //   const { invoice, patient, encounter, charges, payments } = data;

  //   // تحضير بيانات المؤسسة للطباعة
  //   const orgDisplayName =
  //     org?.displayName || org?.legalName || "اسم المستشفى / العيادة";
  //   const orgLegalLine =
  //     org?.legalName && org.legalName !== orgDisplayName ? org.legalName : "";
  //   const orgAddress = org?.address || "";
  //   const orgContacts = [org?.phone, org?.email, org?.website]
  //     .filter(Boolean)
  //     .join(" - ");
  //   const logoUrl = org?.logoUrl || "";

  //   const chargesRows = charges
  //     .map(
  //       (c, index) => `
  //       <tr>
  //         <td class="text-center">${index + 1}</td>
  //         <td>${c.serviceItem?.name ?? ""}</td>
  //         <td class="text-center">${formatMoney(c.quantity)}</td>
  //         <td class="text-center">${formatMoney(c.unitPrice ?? 0)} ${
  //           invoice.currency
  //         }</td>
  //         <td class="text-center">${formatMoney(c.totalAmount ?? 0)} ${
  //           invoice.currency
  //         }</td>
  //       </tr>
  //     `,
  //     )
  //     .join("");

  //   const paymentsRows = payments.length
  //     ? payments
  //         .map(
  //           (p, index) => `
  //       <tr>
  //         <td class="text-center">${index + 1}</td>
  //         <td class="text-center">${formatDateTime(p.paidAt)}</td>
  //         <td class="text-center">${formatMoney(p.amount)} ${
  //           invoice.currency
  //         }</td>
  //         <td class="text-center">${p.method ?? ""}</td>
  //         <td class="text-center">${p.reference ?? ""}</td>
  //       </tr>
  //     `,
  //         )
  //         .join("")
  //     : `
  //       <tr>
  //         <td colspan="5" class="text-center">
  //           لا توجد مدفوعات مسجلة على هذه الفاتورة.
  //         </td>
  //       </tr>
  //     `;

  //   const outstandingLocal =
  //     Number(invoice.totalAmount ?? 0) - Number(invoice.paidAmount ?? 0);

  //   const headerHtml = `
  //     <div class="header">
  //       ${
  //         logoUrl
  //           ? `<img src="${logoUrl}" alt="Logo" style="height:60px; margin-bottom:6px;" />`
  //           : ""
  //       }
  //       <h1>${orgDisplayName}</h1>
  //       ${orgLegalLine ? `<div>${orgLegalLine}</div>` : ""}
  //       ${orgAddress ? `<div>${orgAddress}</div>` : ""}
  //       ${orgContacts ? `<div>${orgContacts}</div>` : ""}
  //     </div>
  //   `;

  //   const win = window.open("", "_blank", "width=900,height=700");
  //   if (!win) {
  //     toast.error(
  //       "المتصفح منع فتح نافذة الطباعة (Pop-up). الرجاء السماح بالنافذة.",
  //     );
  //     return;
  //   }

  //   win.document.write(`
  //     <html lang="ar" dir="rtl">
  //       <head>
  //         <meta charset="utf-8" />
  //         <title>فاتورة رقم #${invoice.id}</title>
  //         <style>
  //           /* هوامش ورقة A4 عند الطباعة */
  //           @page {
  //             size: A4;
  //             margin: 15mm 12mm 18mm 12mm; /* أعلى، يمين، أسفل، يسار */
  //           }

  //           body {
  //             font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  //             font-size: 12px;
  //             color: #000;
  //             margin: 0;
  //             padding: 0;
  //           }

  //           /* حاوية الصفحة الفعلية داخل الهوامش */
  //           .page {
  //             width: 190mm;          /* أقل قليلاً من عرض الـ A4 */
  //             margin: 0 auto;
  //             padding: 8mm 6mm 10mm 6mm; /* مسافة إضافية من داخل الورقة */
  //             box-sizing: border-box;
  //           }

  //           h1, h2, h3, h4 { margin: 0; }
  //           .header {
  //             text-align: center;
  //             margin-bottom: 8px;
  //           }
  //           .sub-header {
  //             text-align: center;
  //             margin-bottom: 16px;
  //           }
  //           .row {
  //             display: flex;
  //             justify-content: space-between;
  //             margin-bottom: 8px;
  //           }
  //           .box {
  //             border: 1px solid #333;
  //             padding: 8px;
  //             margin-bottom: 12px;
  //           }
  //           table {
  //             width: 100%;
  //             border-collapse: collapse;
  //             margin-top: 6px;
  //           }
  //           th, td {
  //             border: 1px solid #333;
  //             padding: 4px 6px;
  //           }
  //           th { background: #f0f0f0; }
  //           .text-center { text-align: center; }
  //           .mt-8 { margin-top: 8px; }
  //           .signatures {
  //             display: flex;
  //             justify-content: space-between;
  //             margin-top: 40px;
  //           }
  //           .signature-box {
  //             width: 30%;
  //             text-align: center;
  //           }
  //         </style>
  //       </head>
  //       <body>
  //         <div class="page">
  //           ${headerHtml}

  //           <div class="sub-header">
  //             <h2>فاتورة تحصيل</h2>
  //             <div>Invoice #${invoice.id}</div>
  //           </div>

  //           <div class="row">
  //             <div class="box" style="flex:1; margin-left:8px;">
  //               <strong>بيانات المريض</strong>
  //               <div>الاسم: ${patient.fullName}</div>
  //               <div>الرقم الطبي (MRN): ${patient.mrn}</div>
  //             </div>
  //             <div class="box" style="flex:1; margin-right:8px;">
  //               <strong>معلومات الفاتورة</strong>
  //               <div>التاريخ: ${formatDateTime(invoice.createdAt)}</div>
  //               <div>الحالة: ${statusLabel(invoice.status)}</div>
  //               <div>السنة المالية: ${
  //                 invoice.financialYear
  //                   ? `${invoice.financialYear.code} – ${invoice.financialYear.name}`
  //                   : "-"
  //               }</div>
  //               <div>الفترة المالية: ${
  //                 invoice.financialPeriod
  //                   ? invoice.financialPeriod.periodCode
  //                   : "-"
  //               }</div>
  //             </div>
  //           </div>

  //           <div class="box">
  //             <strong>بيانات الحالة الطبية</strong>
  //             <div>رقم الحالة: #${encounter.id}</div>
  //             <div>نوع الحالة: ${encounter.type}</div>
  //             <div>حالة الحالة: ${encounter.status}</div>
  //           </div>

  //           <div class="box">
  //             <strong>بنود الفاتورة</strong>
  //             <table>
  //               <thead>
  //                 <tr>
  //                   <th class="text-center" style="width:40px;">م</th>
  //                   <th>الخدمة</th>
  //                   <th class="text-center" style="width:70px;">الكمية</th>
  //                   <th class="text-center" style="width:90px;">سعر الوحدة</th>
  //                   <th class="text-center" style="width:100px;">الإجمالي</th>
  //                 </tr>
  //               </thead>
  //               <tbody>
  //                 ${
  //                   chargesRows ||
  //                   `<tr>
  //                     <td colspan="5" class="text-center">
  //                       لا توجد بنود لهذه الفاتورة.
  //                     </td>
  //                   </tr>`
  //                 }
  //               </tbody>
  //             </table>

  //             <div class="row mt-8">
  //               <div></div>
  //               <div>
  //                 <div>إجمالي الفاتورة: ${formatMoney(invoice.totalAmount)} ${
  //                   invoice.currency
  //                 }</div>
  //                 <div>الخصم: ${formatMoney(invoice.discountAmount)} ${
  //                   invoice.currency
  //                 }</div>
  //                 <div>المدفوع: ${formatMoney(invoice.paidAmount)} ${
  //                   invoice.currency
  //                 }</div>
  //                 <div>المتبقي: ${formatMoney(outstandingLocal)} ${
  //                   invoice.currency
  //                 }</div>
  //               </div>
  //             </div>
  //           </div>

  //           <div class="box">
  //             <strong>المدفوعات على الفاتورة</strong>
  //             <table>
  //               <thead>
  //                 <tr>
  //                   <th class="text-center" style="width:40px;">م</th>
  //                   <th class="text-center" style="width:120px;">التاريخ</th>
  //                   <th class="text-center" style="width:100px;">المبلغ</th>
  //                   <th class="text-center" style="width:80px;">الطريقة</th>
  //                   <th class="text-center">المرجع</th>
  //                 </tr>
  //               </thead>
  //               <tbody>
  //                 ${paymentsRows}
  //               </tbody>
  //             </table>
  //           </div>

  //           <div class="signatures">
  //             <div class="signature-box">
  //               ___________________________<br/>
  //               مسؤول الخزينة
  //             </div>
  //             <div class="signature-box">
  //               ___________________________<br/>
  //               مسؤول الحسابات
  //             </div>
  //             <div class="signature-box">
  //               ___________________________<br/>
  //               مدير المنشأة
  //             </div>
  //           </div>
  //         </div>
  //       </body>
  //     </html>
  //   `);

  //   win.document.close();
  //   win.focus();
  //   win.print();
  //   win.close();
  // };

  const handleDownloadPdf = async () => {
    if (!id) return;

    try {
      // طلب الملف كـ Blob (Binary Large Object)
      const response = await apiClient.get(`/billing/invoices/${id}/pdf`, {
        responseType: "blob", // 👈 مهم جداً لاستقبال الملفات
      });

      // إنشاء رابط مؤقت للملف في المتصفح
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));

      // فتح الملف في نافذة جديدة
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("target", "_blank"); // فتح في تبويب جديد
      // link.setAttribute('download', `invoice-${id}.pdf`); // لو أردت تحميله مباشرة بدلاً من فتحه، أزل التعليق هنا
      document.body.appendChild(link);
      link.click();

      // تنظيف الذاكرة
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل ملف الـ PDF. تأكد من إعدادات السيرفر.");
    }
  };



  if (!id) {
    return (
      <div className="p-6 text-sm text-rose-400">
        لم يتم تمرير رقم الفاتورة في الرابط.
      </div>
    );
  }

  if (!data && loading) {
    return (
      <div className="p-6 text-sm text-slate-300">
        جارِ تحميل بيانات الفاتورة...
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className="p-6 text-sm text-slate-300">
        لم يتم العثور على بيانات هذه الفاتورة.
      </div>
    );
  }

  const { invoice, patient, encounter, charges, payments } = data!;

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* العنوان + الأزرار */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">فاتورة رقم #{invoice.id}</h1>
          <p className="text-sm text-slate-400">
            عرض تفاصيل الفاتورة والمريض والحالة البنود والمدفوعات.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-100"
          >
            رجوع
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-full text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            تحديث
          </button>
          
          {/* ✅ زر المرتجع (يظهر فقط إذا لم يكن مرتجعاً بالكامل) */}
          {(invoice.status === 'PAID' || invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID') && 
           (!data.creditNotes || data.creditNotes.length === 0) && (
            <button
              type="button"
              onClick={() => setIsReturnModalOpen(true)}
              className="px-3 py-1.5 rounded-full text-xs bg-rose-600 hover:bg-rose-500 text-white"
            >
              مرتجع
            </button>
          )}

          {data.creditNotes && data.creditNotes.length > 0 && (
             <span className="px-3 py-1.5 rounded-full text-xs bg-rose-600/20 text-rose-300 border border-rose-600/30">
               تم الإرجاع (Credit Note #{data.creditNotes[0].id})
             </span>
          )}

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="px-3 py-1.5 rounded-full text-xs bg-sky-600 hover:bg-sky-500 text-white"
          >
            طباعة
          </button>
        </div>
      </div>
      
      {/* Return Modal */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[400px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6">
            <h2 className="text-xl font-bold mb-4 text-rose-400">إنشاء مرتجع / استرداد</h2>
            <p className="text-sm text-slate-400 mb-4">
              سيتم إنشاء فاتورة مرتجع (Credit Note) وعكس القيود المحاسبية بالكامل. 
              يرجى إدخال سبب المرتجع أدناه.
            </p>
            
            <textarea
              className="w-full h-24 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:border-rose-500/50 mb-4"
              placeholder="سبب المرتجع..."
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsReturnModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreateReturn}
                disabled={!returnReason}
                className="px-4 py-2 rounded-xl text-sm bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50"
              >
                تأكيد المرتجع
              </button>
            </div>
          </div>
        </div>
      )}
      {/* نفس تصميم الشاشة السابق */}
      <div className="flex-1 flex flex-col gap-4 overflow-auto pb-6">
        {/* ملخص الفاتورة والمريض */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* بيانات الفاتورة */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400">معلومات الفاتورة</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] ${
                  invoice.status === "PAID"
                    ? "bg-emerald-600/20 text-emerald-300"
                    : invoice.status === "PARTIALLY_PAID"
                      ? "bg-amber-600/20 text-amber-300"
                      : invoice.status === "CANCELLED"
                        ? "bg-rose-600/20 text-rose-300"
                        : "bg-slate-700/40 text-slate-200"
                }`}
              >
                {statusLabel(invoice.status)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">التاريخ:</span>
              <span className="font-semibold">
                {formatDateTime(invoice.createdAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">المبلغ الإجمالي:</span>
              <span className="font-semibold">
                {formatMoney(invoice.totalAmount)} {invoice.currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">الخصم:</span>
              <span>
                {formatMoney(invoice.discountAmount)} {invoice.currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">المدفوع:</span>
              <span className="text-emerald-300 font-semibold">
                {formatMoney(invoice.paidAmount)} {invoice.currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">المتبقي:</span>
              <span
                className={`font-semibold ${
                  outstanding > 0 ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {formatMoney(outstanding)} {invoice.currency}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">السنة المالية:</span>
                <span>
                  {invoice.financialYear
                    ? `${invoice.financialYear.code} – ${invoice.financialYear.name}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">الفترة المالية:</span>
                <span>
                  {invoice.financialPeriod
                    ? invoice.financialPeriod.periodCode
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* بيانات المريض */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs space-y-2">
            <div className="text-slate-400 mb-1">بيانات المريض</div>
            <div className="flex justify-between">
              <span className="text-slate-400">الاسم:</span>
              <span className="font-semibold">{patient.fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">الرقم الطبي (MRN):</span>
              <span>{patient.mrn}</span>
            </div>
          </div>

          {/* بيانات الحالة */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs space-y-2">
            <div className="text-slate-400 mb-1">بيانات الحالة الطبية</div>
            <div className="flex justify-between">
              <span className="text-slate-400">رقم الحالة:</span>
              <span>#{encounter.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">نوع الحالة:</span>
              <span>{encounter.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">حالة الحالة:</span>
              <span>{encounter.status}</span>
            </div>
          </div>
        </div>

        {/* بنود الفاتورة */}
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">
              بنود الفاتورة
            </h2>
          </div>

          <div className="overflow-x-auto max-h-[360px]">
            <table className="w-full text-[11px] text-right border-separate border-spacing-y-1">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-right">الخدمة</th>
                  <th className="px-2 py-1 text-right">الكمية</th>
                  <th className="px-2 py-1 text-right">سعر الوحدة</th>
                  <th className="px-2 py-1 text-right">الإجمالي</th>
                  <th className="px-2 py-1 text-right">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr
                    key={c.id}
                    className="bg-slate-950/70 border border-slate-800 rounded-xl"
                  >
                    <td className="px-2 py-1 align-top">
                      <div className="font-semibold">
                        {c.serviceItem?.name ?? "—"}
                      </div>
                      {c.serviceItem?.code && (
                        <div className="text-[10px] text-slate-500">
                          {c.serviceItem.code}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {formatMoney(c.quantity)}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {c.unitPrice != null
                        ? `${formatMoney(c.unitPrice)} ${invoice.currency}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1 align-top font-semibold">
                      {c.totalAmount != null
                        ? `${formatMoney(c.totalAmount)} ${invoice.currency}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1 align-top">{c.notes ?? "—"}</td>
                  </tr>
                ))}
                {charges.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-2 py-4 text-center text-slate-500"
                    >
                      لا توجد بنود لهذه الفاتورة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* المدفوعات */}
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">
              المدفوعات على الفاتورة
            </h2>
          </div>

          <div className="overflow-x-auto max-h-[260px]">
            <table className="w-full text-[11px] text-right border-separate border-spacing-y-1">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-right">التاريخ</th>
                  <th className="px-2 py-1 text-right">المبلغ</th>
                  <th className="px-2 py-1 text-right">طريقة الدفع</th>
                  <th className="px-2 py-1 text-right">المرجع</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="bg-slate-950/70 border border-slate-800 rounded-xl"
                  >
                    <td className="px-2 py-1 align-top">
                      {formatDateTime(p.paidAt)}
                    </td>
                    <td className="px-2 py-1 align-top text-emerald-300 font-semibold">
                      {formatMoney(p.amount)} {invoice.currency}
                    </td>
                    <td className="px-2 py-1 align-top">{p.method ?? "—"}</td>
                    <td className="px-2 py-1 align-top">
                      {p.reference ?? "—"}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-2 py-4 text-center text-slate-500"
                    >
                      لا توجد مدفوعات مسجلة على هذه الفاتورة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
