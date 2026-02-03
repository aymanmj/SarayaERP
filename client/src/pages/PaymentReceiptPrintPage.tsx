import React from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle, CreditCard, Calendar, User, FileText, Building2 } from 'lucide-react';

type EncounterType = "OPD" | "ER" | "IPD";

type Patient = {
  id: number;
  fullName: string;
  mrn: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
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

export default function PaymentReceiptPrintPage() {
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <div className="text-slate-600">جاري تحميل الإيصال...</div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center text-red-600">
          خطأ: {(error as any)?.message}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { payment, invoice, patient, encounter } = data as PaymentReceiptData;
  const isFullyPaid = Number(invoice.remainingAmount) <= 0;

  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="UTF-8" />
        <title>إيصال دفعة #{payment.id}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{
          __html: `
          :root {
            --primary: #0f766e;
            --primary-light: #f0fdfa;
            --danger: #be123c;
            --success: #059669;
            --text: #1e293b;
            --gray: #64748b;
            --border: #e2e8f0;
          }

          body {
            font-family: 'Cairo', sans-serif;
            font-size: 12px;
            color: var(--text);
            line-height: 1.4;
            margin: 0;
            padding: 20px;
            background: white;
            -webkit-print-color-adjust: exact;
          }

          .page-container {
            max-width: 210mm;
            margin: 0 auto;
            background: white;
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
          }

          .header {
            background: linear-gradient(135deg, var(--primary-light), white);
            border-bottom: 2px solid var(--primary);
            padding: 30px 40px;
            text-align: center;
          }

          .doc-title {
            font-size: 28px;
            font-weight: 800;
            color: var(--primary);
            margin: 0 0 5px 0;
            text-transform: uppercase;
          }

          .doc-subtitle {
            font-size: 14px;
            color: var(--gray);
            margin: 0;
          }

          .receipt-id {
            background: var(--primary);
            color: white;
            padding: 6px 16px;
            border-radius: 20px;
            font-family: monospace;
            font-size: 14px;
            font-weight: 700;
            display: inline-block;
            margin-top: 15px;
          }

          .success-icon {
            width: 60px;
            height: 60px;
            background: var(--success);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
          }

          .content {
            padding: 40px;
          }

          .section {
            margin-bottom: 30px;
          }

          .section-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--primary);
            margin: 0 0 15px 0;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
          }

          .info-box {
            background: #f8fafc;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 20px;
          }

          .info-box h4 {
            font-size: 14px;
            font-weight: 700;
            color: var(--text);
            margin: 0 0 15px 0;
            border-bottom: 1px solid var(--border);
            padding-bottom: 8px;
          }

          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
          }

          .info-label {
            color: var(--gray);
          }

          .info-value {
            font-weight: 600;
            color: var(--text);
          }

          .payment-summary {
            background: linear-gradient(135deg, var(--primary-light), #e0f2fe);
            border: 1px solid var(--primary);
            border-radius: 8px;
            padding: 25px;
            text-align: center;
            margin-bottom: 30px;
          }

          .amount {
            font-size: 32px;
            font-weight: 900;
            color: var(--primary);
            margin: 10px 0;
          }

          .payment-method {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            margin-top: 10px;
          }

          .summary-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }

          .summary-table td {
            padding: 12px 8px;
            border-bottom: 1px solid var(--border);
            font-size: 12px;
          }

          .summary-table tr:last-child td {
            border-bottom: none;
          }

          .total-row {
            background: #f8fafc;
            font-weight: 700;
          }

          .total-row td {
            font-size: 14px;
            color: var(--primary);
          }

          .footer {
            background: #f8fafc;
            border-top: 1px solid var(--border);
            padding: 20px 40px;
            text-align: center;
            font-size: 11px;
            color: var(--gray);
          }

  .signatures {
    display: flex;
    justify-content: space-between;
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  .signature-box {
    text-align: center;
    width: 45%;
  }

  .signature-line {
    height: 1px;
    background: var(--border);
    margin-bottom: 8px;
  }

  .signature-text {
    font-size: 10px;
    color: var(--gray);
  }

  @media print {
    body {
      padding: 0;
    }
    .page-container {
      box-shadow: none;
      border: none;
      margin: 0;
    }
  }
  `
}} />
</head>
<body>
  <div className="page-container">
    {/* Header */}
    <div className="header">
      <div className="success-icon">
        <CheckCircle color="white" size={32} />
      </div>
      <h1 className="doc-title">إيصال دفعة</h1>
      <p className="doc-subtitle">Payment Receipt</p>
      <div className="receipt-id">#{payment.id}</div>
    </div>
          <div className="header">
            <div className="success-icon">
              <CheckCircle color="white" size={32} />
            </div>
            <h1 className="doc-title">إيصال دفعة</h1>
            <p className="doc-subtitle">Payment Receipt</p>
            <div className="receipt-id">#{payment.id}</div>
          </div>

          {/* Content */}
          <div className="content">
            {/* Payment Summary */}
            <div className="payment-summary">
              <div className="section-title">
                <CreditCard size={16} />
                تفاصيل الدفعة
              </div>
              <div className="amount">{formatMoney(payment.amount)} {invoice.currency}</div>
              <div className="payment-method">
                <span>{getPaymentMethodIcon(payment.method)}</span>
                {getPaymentMethodLabel(payment.method)}
              </div>
              {payment.reference && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--gray)' }}>
                  المرجع: {payment.reference}
                </div>
              )}
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--gray)' }}>
                {formatDateTime(payment.paidAt)}
              </div>
            </div>

            {/* Info Grid */}
            <div className="info-grid">
              {/* Patient Info */}
              <div className="info-box">
                <h4>
                  <User size={14} />
                  بيانات المريض
                </h4>
                <div className="info-row">
                  <span className="info-label">الاسم:</span>
                  <span className="info-value">{patient?.fullName || "—"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">رقم الملف:</span>
                  <span className="info-value">{patient?.mrn || "—"}</span>
                </div>
                {encounter && (
                  <div className="info-row">
                    <span className="info-label">نوع الزيارة:</span>
                    <span className="info-value">{getEncounterTypeLabel(encounter.type)}</span>
                  </div>
                )}
              </div>

              {/* Invoice Info */}
              <div className="info-box">
                <h4>
                  <FileText size={14} />
                  بيانات الفاتورة
                </h4>
                <div className="info-row">
                  <span className="info-label">رقم الفاتورة:</span>
                  <span className="info-value">#{invoice.id}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">التاريخ:</span>
                  <span className="info-value">{formatDate(invoice.createdAt)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">الحالة:</span>
                  <span className="info-value">
                    {isFullyPaid ? 'مدفوعة بالكامل' : 'مدفوعة جزئياً'}
                  </span>
                </div>
              </div>
            </div>

            {/* Invoice Summary */}
            <div className="section">
              <div className="section-title">
                <Building2 size={16} />
                ملخص الفاتورة
              </div>
              <table className="summary-table">
                <tbody>
                  <tr>
                    <td className="info-label">المبلغ الإجمالي:</td>
                    <td className="info-value">{formatMoney(invoice.totalAmount)} {invoice.currency}</td>
                  </tr>
                  {Number(invoice.discountAmount) > 0 && (
                    <tr>
                      <td className="info-label">الخصم:</td>
                      <td className="info-value" style={{ color: 'var(--danger)' }}>
                        -{formatMoney(invoice.discountAmount)} {invoice.currency}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="info-label">المبلغ الصافي:</td>
                    <td className="info-value">
                      {formatMoney(Number(invoice.totalAmount) - Number(invoice.discountAmount))} {invoice.currency}
                    </td>
                  </tr>
                  <tr>
                    <td className="info-label">المبلغ المدفوع:</td>
                    <td className="info-value" style={{ color: 'var(--success)' }}>
                      {formatMoney(invoice.paidAmount)} {invoice.currency}
                    </td>
                  </tr>
                  <tr className="total-row">
                    <td className="info-label">المبلغ المتبقي:</td>
                    <td className="info-value" style={{ 
                      color: Number(invoice.remainingAmount) > 0 ? 'var(--danger)' : 'var(--success)' 
                    }}>
                      {formatMoney(invoice.remainingAmount)} {invoice.currency}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signatures */}
            <div className="signatures">
              <div className="signature-box">
                <div className="signature-line"></div>
                <div className="signature-text">توقيع المستلم (الكاشير)</div>
              </div>
              <div className="signature-box">
                <div className="signature-line"></div>
                <div className="signature-text">توقيع الدافع (المريض)</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="footer">
            <p>إيصال رسمي معتمد - شكراً لدفعكم</p>
            <p style={{ marginTop: '5px' }}>
              {new Date().toLocaleString("ar-LY")} • صفحة 1 من 1
            </p>
          </div>
        </div>

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
      </body>
    </html>
  );
}
