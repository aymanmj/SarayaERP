// src/pages/PaymentReceiptPage.tsx

import { useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import PrintLayout from "../components/print/PrintLayout";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

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

function getPaymentMethodLabel(method: string) {
  switch (method.toLowerCase()) {
    case "cash":
      return "نقدي";
    case "card":
    case "credit_card":
      return "بطاقة ائتمان";
    case "bank_transfer":
      return "تحويل بنكي";
    case "check":
      return "شيك";
    default:
      return method;
  }
}

function getEncounterTypeLabel(type: EncounterType) {
  switch (type) {
    case "OPD":
      return "عيادات خارجية";
    case "ER":
      return "طوارئ";
    case "IPD":
      return "تنويم";
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
          <div className="text-slate-600 font-medium">
            جاري إعداد إيصال الدفعة...
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-lg border border-rose-200">
          <div className="text-rose-600 font-bold text-center">
            خطأ: {(error as any)?.message}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { payment, invoice, patient, encounter } = data as PaymentReceiptData;
  const isFullyPaid = Number(invoice.remainingAmount) <= 0;
  const netTotal =
    Number(invoice.totalAmount) - Number(invoice.discountAmount);

  return (
    <PrintLayout
      title="إيصال دفعة"
      subtitle="PAYMENT RECEIPT"
      documentId={payment.id}
      footerNotes="إيصال رسمي معتمد — شكراً لدفعكم"
      showWatermark={true}
      watermarkText="PAID"
    >
      {/* ─── Receipt Styles for Print ─── */}
      <style>{`
        .receipt-table {
          width: 100%;
          border-collapse: collapse;
          font-family: 'Cairo', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
        }
        .receipt-table th,
        .receipt-table td {
          padding: 10px 14px;
          text-align: right;
          font-size: 13px;
          border-bottom: 1px solid #e2e8f0;
        }
        .receipt-table th {
          color: #64748b;
          font-weight: 600;
          font-size: 12px;
          white-space: nowrap;
        }
        .receipt-table td {
          color: #1e293b;
          font-weight: 700;
        }
        .receipt-section {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        .receipt-section-header {
          background: #f8fafc;
          padding: 10px 16px;
          font-weight: 700;
          font-size: 14px;
          color: #334155;
          border-bottom: 1px solid #e2e8f0;
        }
        .receipt-amount-box {
          background: linear-gradient(135deg, #ecfdf5, #f0f9ff);
          border: 2px solid #10b981;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          margin-bottom: 20px;
        }
        .receipt-amount-value {
          font-size: 32px;
          font-weight: 900;
          color: #059669;
          letter-spacing: -0.5px;
        }
        .receipt-amount-currency {
          font-size: 16px;
          font-weight: 600;
          color: #64748b;
          margin-right: 6px;
        }
        .receipt-amount-method {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 20px;
          padding: 4px 14px;
          font-size: 12px;
          color: #475569;
          margin-top: 10px;
        }
        .receipt-status {
          display: inline-block;
          padding: 3px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
        }
        .receipt-status-paid {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #bbf7d0;
        }
        .receipt-status-partial {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .receipt-success {
          text-align: center;
          margin-bottom: 24px;
        }
        .receipt-success-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          background: #dcfce7;
          border-radius: 50%;
          margin-bottom: 12px;
        }
        .receipt-success-icon svg {
          width: 28px;
          height: 28px;
          color: #16a34a;
        }
        .receipt-success-title {
          font-size: 20px;
          font-weight: 800;
          color: #16a34a;
          margin-bottom: 4px;
        }
        .receipt-success-subtitle {
          font-size: 13px;
          color: #64748b;
        }
        .receipt-summary-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 16px;
          font-size: 13px;
        }
        .receipt-summary-label {
          color: #64748b;
        }
        .receipt-summary-value {
          font-weight: 700;
          color: #1e293b;
        }
        .receipt-summary-highlight {
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
        }
        .receipt-divider {
          border: none;
          border-top: 1px dashed #cbd5e1;
          margin: 12px 0;
        }
        .receipt-signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          padding-top: 20px;
        }
        .receipt-signature-box {
          text-align: center;
          width: 35%;
        }
        .receipt-signature-line {
          border-top: 1px solid #94a3b8;
          margin-bottom: 6px;
        }
        .receipt-signature-label {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
        }
        .receipt-footer-notes {
          text-align: center;
          font-size: 11px;
          color: #64748b;
          background: #f8fafc;
          border-radius: 8px;
          padding: 12px;
          margin-top: 16px;
          line-height: 1.8;
          border: 1px solid #e2e8f0;
        }
        @media print {
          .receipt-amount-box {
            background: #f0fdf4 !important;
            border: 2px solid #10b981 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-section-header {
            background: #f8fafc !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-success-icon {
            background: #dcfce7 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-status-paid {
            background: #dcfce7 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-status-partial {
            background: #fef3c7 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/* ─── Success Header ─── */}
      <div className="receipt-success">
        <div className="receipt-success-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div className="receipt-success-title">تم استلام الدفعة بنجاح</div>
        <div className="receipt-success-subtitle">نشكرك لثقتكم بنا</div>
      </div>

      {/* ─── Amount Box ─── */}
      <div className="receipt-amount-box">
        <div>
          <span className="receipt-amount-value">
            {formatMoney(payment.amount)}
          </span>
          <span className="receipt-amount-currency">{invoice.currency}</span>
        </div>
        <div>
          <span className="receipt-amount-method">
            {getPaymentMethodLabel(payment.method)} •{" "}
            {formatDateTime(payment.paidAt)}
          </span>
        </div>
        {payment.reference && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "#64748b",
            }}
          >
            رقم المرجع:{" "}
            <strong style={{ fontFamily: "monospace" }}>
              {payment.reference}
            </strong>
          </div>
        )}
      </div>

      {/* ─── Patient & Invoice Info ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* بيانات المريض */}
        <div className="receipt-section">
          <div className="receipt-section-header">👤 بيانات المريض</div>
          <table className="receipt-table">
            <tbody>
              <tr>
                <th>الاسم</th>
                <td>{patient?.fullName || "—"}</td>
              </tr>
              <tr>
                <th>رقم الملف</th>
                <td style={{ fontFamily: "monospace" }}>
                  {patient?.mrn || "—"}
                </td>
              </tr>
              {encounter && (
                <tr>
                  <th>نوع الزيارة</th>
                  <td>{getEncounterTypeLabel(encounter.type)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* بيانات الفاتورة */}
        <div className="receipt-section">
          <div className="receipt-section-header">📄 بيانات الفاتورة</div>
          <table className="receipt-table">
            <tbody>
              <tr>
                <th>رقم الفاتورة</th>
                <td style={{ fontFamily: "monospace" }}>#{invoice.id}</td>
              </tr>
              <tr>
                <th>تاريخ الفاتورة</th>
                <td>{formatDate(invoice.createdAt)}</td>
              </tr>
              <tr>
                <th>الحالة</th>
                <td>
                  <span
                    className={`receipt-status ${isFullyPaid ? "receipt-status-paid" : "receipt-status-partial"}`}
                  >
                    {isFullyPaid ? "مدفوعة بالكامل" : "مدفوعة جزئياً"}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Invoice Summary ─── */}
      <div className="receipt-section">
        <div className="receipt-section-header">📊 ملخص الفاتورة</div>
        <div>
          <div className="receipt-summary-row">
            <span className="receipt-summary-label">المبلغ الإجمالي:</span>
            <span className="receipt-summary-value">
              {formatMoney(invoice.totalAmount)} {invoice.currency}
            </span>
          </div>

          {Number(invoice.discountAmount) > 0 && (
            <div className="receipt-summary-row">
              <span className="receipt-summary-label">الخصم:</span>
              <span
                className="receipt-summary-value"
                style={{ color: "#dc2626" }}
              >
                -{formatMoney(invoice.discountAmount)} {invoice.currency}
              </span>
            </div>
          )}

          <div className="receipt-summary-row receipt-summary-highlight">
            <span className="receipt-summary-label">الصافي:</span>
            <span className="receipt-summary-value">
              {formatMoney(netTotal)} {invoice.currency}
            </span>
          </div>

          <div className="receipt-summary-row">
            <span className="receipt-summary-label">إجمالي المدفوع:</span>
            <span
              className="receipt-summary-value"
              style={{ color: "#059669" }}
            >
              {formatMoney(invoice.paidAmount)} {invoice.currency}
            </span>
          </div>

          <div className="receipt-summary-row receipt-summary-highlight">
            <span
              className="receipt-summary-label"
              style={{ fontWeight: 700 }}
            >
              المبلغ المتبقي:
            </span>
            <span
              className="receipt-summary-value"
              style={{
                fontSize: 18,
                color:
                  Number(invoice.remainingAmount) > 0 ? "#dc2626" : "#059669",
              }}
            >
              {formatMoney(invoice.remainingAmount)} {invoice.currency}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Footer Notes ─── */}
      <div className="receipt-footer-notes">
        <div>• هذا الإيصال دليل على الدفعة ولا يعتبر فاتورة ضريبية</div>
        <div>• يرجى الاحتفاظ به للمراجعة والمطالبة</div>
      </div>

      {/* ─── Signatures ─── */}
      <div className="receipt-signatures">
        <div className="receipt-signature-box">
          <div className="receipt-signature-line" />
          <div className="receipt-signature-label">
            توقيع المستلم (الكاشير)
          </div>
          {payment.cashierName && (
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
              {payment.cashierName}
            </div>
          )}
        </div>
        <div className="receipt-signature-box">
          <div className="receipt-signature-line" />
          <div className="receipt-signature-label">توقيع الدافع (المريض)</div>
        </div>
      </div>
    </PrintLayout>
  );
}
