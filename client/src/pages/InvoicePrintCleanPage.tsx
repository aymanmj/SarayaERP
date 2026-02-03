import React from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

type OrganizationSettings = {
  id: number;
  displayName: string;
  legalName: string;
  address: string;
  phone: string;
  email: string;
  logo?: string;
  taxNumber?: string;
  commercialRegister?: string;
};

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
  remainingAmount: string;
  currency: string;
  createdAt: string;
  type: string;
  originalInvoiceId?: number;
  insuranceShare?: string;
};

type InvoicePrintData = {
  invoice: InvoiceLite;
  patient: Patient;
  encounter: {
    id: number;
    type: EncounterType;
  } | null;
  charges: ChargeLite[];
  payments: BillingPayment[];
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

export default function InvoicePrintCleanPage() {
  const { id } = useParams();
  const invoiceId = Number(id);

  // Fetch organization settings
  const { data: orgSettings, isLoading: orgLoading } = useQuery({
    queryKey: ["organizationSettings"],
    queryFn: async () => {
      try {
        const res = await apiClient.get("/settings/organization");
        console.log("Organization settings fetched:", res.data);
        return res.data;
      } catch (error) {
        console.error("Error fetching organization settings:", error);
        return null;
      }
    },
    staleTime: Infinity,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["invoicePrint", invoiceId],
    queryFn: async () => {
      if (!invoiceId) throw new Error("رقم الفاتورة غير صحيح");
      const res = await apiClient.get(`/billing/invoices/${invoiceId}/print`);
      return res.data;
    },
    enabled: !!invoiceId,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-rose-500 font-bold">
        <div className="text-center">
          جاري تحميل الفاتورة...
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

  const { invoice, patient, encounter, charges, payments } = data;
  const pharmacyMap = (data as any).pharmacyMap || {};
  const isCreditNote = invoice.type === "CREDIT_NOTE";

  // حساب المجاميع
  const subTotal = charges.reduce(
    (sum: number, c: any) => sum + Number(c.totalAmount ?? 0),
    0,
  );
  const discount = Number(invoice.discountAmount ?? 0);
  const netTotal = subTotal - discount;
  const paid = Number(invoice.paidAmount ?? 0);
  const remaining = netTotal - paid;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex justify-center py-8">
      <div className="w-[210mm] min-h-[297mm] bg-white shadow-2xl rounded-2xl overflow-hidden flex flex-col">
        {/* Watermark */}
        {isCreditNote && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-10">
            <div className="text-[120px] font-black text-rose-600 -rotate-45 border-8 border-rose-600 px-10 rounded-3xl">
              مرتجع / RETURN
            </div>
          </div>
        )}

        {/* Header */}
        <header className="relative bg-gradient-to-r from-emerald-50 via-white to-slate-50 border-b-2 border-emerald-600 pb-8 mb-6">
          <div className="relative z-10 px-8 pt-8">
            <div className="flex justify-between items-start">
              {/* Organization Info */}
              <div className="text-right space-y-3">
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: 'Tajawal, sans-serif' }}>
                  {orgSettings?.displayName || orgSettings?.legalName || 'المستشفى المركزي'}
                </h1>
                <div className="text-base text-slate-600 max-w-[400px] leading-relaxed" style={{ fontFamily: 'Tajawal, sans-serif' }}>
                  {orgSettings?.address || 'العنوان الرئيسي للمنشأة'}
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                    <span>📞</span>
                    <span className="font-medium">{orgSettings?.phone || '123456789'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                    <span>✉️</span>
                    <span className="font-medium">{orgSettings?.email || 'info@hospital.com'}</span>
                  </div>
                  {orgSettings?.taxNumber && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                      <span>🏢</span>
                      <span className="font-medium">الرقم الضريبي: {orgSettings.taxNumber}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Logo & Document Title */}
              <div className="text-left flex flex-col items-end">
                {orgSettings?.logo ? (
                  <img src={orgSettings.logo} alt="Logo" className="w-20 h-20 object-contain mb-2" />
                ) : (
                  <div className="w-20 h-20 bg-emerald-100 rounded-lg flex items-center justify-center mb-2">
                    <span className="text-2xl text-emerald-600">🏥</span>
                  </div>
                )}
                <div className="text-4xl font-bold text-emerald-900 uppercase tracking-wider mb-2" style={{ fontFamily: 'Tajawal, sans-serif' }}>
                  {isCreditNote ? "إشعار دائن" : "فاتورة ضريبية"}
                </div>
                <div className="text-sm text-emerald-600 font-medium uppercase tracking-wider mb-2" style={{ fontFamily: 'Tajawal, sans-serif' }}>
                  {isCreditNote ? "Credit Note" : "Tax Invoice"}
                </div>
                <div className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-1 rounded inline-block">
                  المرجع: #{invoice.id}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-grow px-8 pb-8 relative z-10">
          {/* Grid Info */}
          <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
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
  <table
    dir="rtl"
    className="w-full text-sm border-collapse table-fixed"
  >
    <thead>
      <tr className="bg-slate-900 text-white">
        <th className="py-2 px-4 text-right font-bold w-[48px] rounded-tr-md">
          #
        </th>
        <th className="py-2 px-4 text-right font-bold">
          البيان / Description
        </th>
        <th className="py-2 px-4 text-center font-bold w-[88px]">
          الكمية
        </th>
        <th className="py-2 px-4 text-right font-bold w-[120px]">
          سعر الوحدة
        </th>
        <th className="py-2 px-4 text-right font-bold w-[120px] rounded-tl-md">
          الإجمالي
        </th>
      </tr>
    </thead>

    <tbody className="divide-y divide-slate-100">
      {charges.map((c: any, idx: number) => {
        const items = pharmacyMap[c.id] ?? [];
        return (
          <React.Fragment key={c.id}>
            <tr className="odd:bg-white even:bg-slate-50/50">
              <td className="py-2 px-4 text-right text-slate-500 border-l border-slate-100 font-mono">
                {idx + 1}
              </td>
              <td className="py-2 px-4 text-right font-medium text-slate-800">
                {c.serviceItem.name}
                {c.serviceItem.code && (
                  <span className="text-xs text-slate-400 block mt-0.5 font-mono">
                    {c.serviceItem.code}
                  </span>
                )}
              </td>
              <td className="py-2 px-4 text-center text-slate-600 font-mono">
                {c.quantity}
              </td>
              <td className="py-2 px-4 text-right text-slate-600 font-mono">
                {formatMoney(c.unitPrice)}
              </td>
              <td className="py-2 px-4 text-right text-slate-900 font-bold font-mono border-r border-slate-100">
                {formatMoney(c.totalAmount)}
              </td>
            </tr>

            {items.length > 0 && (
              <tr>
                <td colSpan={5} className="bg-slate-50 p-0 border-x border-slate-100">
                  {/* ...nested pharmacy table (كما في كودك) */}
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
    </tbody>

    {/* ==> تذكّر: عدد الأعمدة هنا يجب أن يساوي عدد أعمدة ال thead (5 أعمدة) */}
    <tfoot className="border-t-2 border-slate-900">
      <tr className="bg-slate-50">
        {/* نستخدم colSpan=3 ثم خانتين للمسمى والمبلغ => 3+1+1 = 5 أعمدة */}
        <td colSpan={3}></td>
        <td className="py-2 px-4 text-right font-bold text-slate-600">
          المجموع:
        </td>
        <td className="py-2 px-4 text-right font-bold font-mono text-slate-800">
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
                    -{formatMoney(discount)}
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
        </main>

        {/* Footer */}
        <footer className="mt-auto relative z-10 bg-gradient-to-r from-slate-50 to-emerald-50 border-t border-slate-200 text-center px-8 py-6">
          <div className="text-sm text-slate-600 mb-4 italic bg-white p-3 rounded-lg border border-slate-500" style={{ fontFamily: 'Tajawal, sans-serif' }}>
            نسخة إلكترونية معتمدة
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider" style={{ fontFamily: 'Tajawal, sans-serif' }}>
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
        </footer>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
        
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .min-h-screen {
            min-height: auto !important;
            background: white !important;
          }
          .bg-gradient-to-br {
            background: white !important;
          }
          .shadow-2xl {
            box-shadow: none !important;
          }
          .rounded-2xl {
            border-radius: 0 !important;
          }
          .border {
            border-color: #e2e8f0 !important;
          }
          .border-b-2 {
            border-bottom: 2px solid #10b981 !important;
          }
          .border-t {
            border-top: 1px solid #e2e8f0 !important;
          }
        }
      `}</style>

      <script dangerouslySetInnerHTML={{
        __html: `
        // Auto-print when page loads
        window.onload = function() {
          setTimeout(() => {
            window.print();
          }, 500);
        };
        `
      }} />
    </div>
  );
}
