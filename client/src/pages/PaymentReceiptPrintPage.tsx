// src/pages/PaymentReceiptPrintPage.tsx
// صفحة طباعة مباشرة لإيصال الدفع — تُفتح بدون MainLayout

import { useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { useQuery } from "@tanstack/react-query";
import type { OrganizationSettings } from "../types/organization";
import { Loader2 } from "lucide-react";

type EncounterType = "OPD" | "ER" | "IPD";

type Payment = {
  id: number;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
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

type Patient = {
  id: number;
  fullName: string;
  mrn: string;
};

type PaymentReceiptData = {
  payment: Payment;
  invoice: Invoice;
  patient: Patient | null;
  encounter: { id: number; type: EncounterType } | null;
};

function fmtDateTime(iso?: string | null) {
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

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-LY", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fmtMoney(val: number | string | null | undefined) {
  return Number(val ?? 0).toLocaleString("ar-LY", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function methodLabel(m: string) {
  const map: Record<string, string> = {
    cash: "نقدي",
    card: "بطاقة ائتمان",
    credit_card: "بطاقة ائتمان",
    bank_transfer: "تحويل بنكي",
    check: "شيك",
  };
  return map[m.toLowerCase()] || m;
}

function visitLabel(t: EncounterType) {
  const map: Record<string, string> = {
    OPD: "عيادات خارجية",
    ER: "طوارئ",
    IPD: "تنويم",
  };
  return map[t] || t;
}

export default function PaymentReceiptPrintPage() {
  const { id } = useParams();
  const paymentId = Number(id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["paymentReceipt", paymentId],
    queryFn: async () => {
      const res = await apiClient.get(`/cashier/payments/${paymentId}/receipt`);
      return res.data as PaymentReceiptData;
    },
    enabled: !!paymentId,
    retry: 1,
  });

  const { data: org } = useQuery({
    queryKey: ["organizationSettings"],
    queryFn: async () => {
      const res = await apiClient.get<OrganizationSettings>("/settings/organization");
      return res.data;
    },
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "white" }}>
        <Loader2 style={{ width: 40, height: 40, animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#e11d48", fontWeight: 700 }}>
        تعذر تحميل بيانات الإيصال
      </div>
    );
  }

  const { payment, invoice, patient, encounter } = data;
  const isFullyPaid = Number(invoice.remainingAmount) <= 0;
  const net = Number(invoice.totalAmount) - Number(invoice.discountAmount);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Cairo', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
          font-size: 13px;
          color: #1e293b;
          background: white;
          direction: rtl;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @page {
          size: A4;
          margin: 12mm;
        }

        .receipt-page {
          max-width: 210mm;
          margin: 0 auto;
          padding: 0 24px;
        }

        /* ── Header ── */
        .r-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 3px solid #059669;
          padding-bottom: 20px;
          margin-bottom: 24px;
        }
        .r-org-name { font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
        .r-org-addr { font-size: 12px; color: #64748b; max-width: 300px; line-height: 1.6; }
        .r-org-contacts { font-size: 11px; color: #64748b; margin-top: 8px; display: flex; gap: 12px; }
        .r-doc-title { font-size: 26px; font-weight: 800; color: #064e3b; text-align: left; }
        .r-doc-sub { font-size: 12px; color: #059669; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; text-align: left; }
        .r-doc-ref { font-size: 11px; color: #94a3b8; font-family: monospace; background: #f1f5f9; padding: 3px 10px; border-radius: 4px; display: inline-block; margin-top: 6px; }
        .r-logo { height: 60px; width: auto; object-fit: contain; margin-bottom: 8px; }

        /* ── Success Banner ── */
        .r-success { text-align: center; margin-bottom: 24px; }
        .r-success-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 52px; height: 52px; background: #dcfce7; border-radius: 50%; margin-bottom: 10px;
        }
        .r-success-icon svg { width: 26px; height: 26px; stroke: #16a34a; fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
        .r-success-title { font-size: 20px; font-weight: 800; color: #16a34a; }
        .r-success-sub { font-size: 12px; color: #64748b; }

        /* ── Amount Box ── */
        .r-amount-box {
          background: linear-gradient(135deg, #ecfdf5, #f0f9ff);
          border: 2px solid #10b981;
          border-radius: 10px;
          padding: 20px;
          text-align: center;
          margin-bottom: 20px;
        }
        .r-amount { font-size: 30px; font-weight: 900; color: #059669; }
        .r-currency { font-size: 16px; font-weight: 600; color: #64748b; margin-right: 4px; }
        .r-method-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: white; border: 1px solid #d1d5db; border-radius: 20px;
          padding: 4px 14px; font-size: 12px; color: #475569; margin-top: 8px;
        }

        /* ── Info Grid ── */
        .r-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .r-box { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
        .r-box-header {
          background: #f8fafc; padding: 8px 14px;
          font-weight: 700; font-size: 13px; color: #334155;
          border-bottom: 1px solid #e2e8f0;
        }
        .r-box table { width: 100%; border-collapse: collapse; }
        .r-box th, .r-box td { padding: 8px 14px; text-align: right; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
        .r-box th { color: #64748b; font-weight: 600; white-space: nowrap; }
        .r-box td { color: #1e293b; font-weight: 700; }
        .r-box tr:last-child th, .r-box tr:last-child td { border-bottom: none; }

        /* ── Summary ── */
        .r-summary { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
        .r-summary-row { display: flex; justify-content: space-between; padding: 8px 16px; font-size: 13px; }
        .r-summary-label { color: #64748b; }
        .r-summary-value { font-weight: 700; color: #1e293b; }
        .r-summary-hl { background: #f8fafc; border-top: 1px solid #e2e8f0; }

        /* ── Status Badge ── */
        .r-badge { display: inline-block; padding: 2px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
        .r-badge-paid { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
        .r-badge-partial { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }

        /* ── Notes ── */
        .r-notes {
          text-align: center; font-size: 11px; color: #64748b;
          background: #f8fafc; border-radius: 8px; padding: 12px;
          border: 1px solid #e2e8f0; line-height: 1.8; margin-bottom: 20px;
        }

        /* ── Signatures ── */
        .r-sigs { display: flex; justify-content: space-between; margin-top: 36px; padding-top: 16px; }
        .r-sig { text-align: center; width: 35%; }
        .r-sig-line { border-top: 1px solid #94a3b8; margin-bottom: 6px; }
        .r-sig-label { font-size: 11px; color: #64748b; font-weight: 600; }
        .r-sig-name { font-size: 10px; color: #94a3b8; margin-top: 2px; }

        /* ── Footer ── */
        .r-footer {
          margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0;
          text-align: center; font-size: 10px; color: #94a3b8;
        }

        /* ── Print-only adjustments ── */
        .no-print { display: flex; }
        @media print {
          .no-print { display: none !important; }
          .receipt-page { padding: 0; }
        }

        /* ── Screen-only action bar ── */
        .r-actions {
          max-width: 210mm; margin: 0 auto 16px;
          display: flex; justify-content: flex-end; gap: 8px;
          padding: 12px 24px; background: #f8fafc; border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .r-btn {
          padding: 8px 18px; border: none; border-radius: 8px;
          font-size: 13px; font-weight: 700; cursor: pointer;
          font-family: inherit; display: flex; align-items: center; gap: 6px;
        }
        .r-btn-primary { background: #059669; color: white; }
        .r-btn-secondary { background: white; color: #475569; border: 1px solid #d1d5db; }
      `}</style>

      {/* ── Action Bar ── */}
      <div className="r-actions no-print">
        <button className="r-btn r-btn-secondary" onClick={() => window.history.back()}>
          إغلاق
        </button>
        <button className="r-btn r-btn-primary" onClick={() => window.print()}>
          🖨️ طباعة
        </button>
      </div>

      <div className="receipt-page">
        {/* ── Header ── */}
        <div className="r-header">
          <div>
            <div className="r-org-name">{org?.displayName || "المستشفى"}</div>
            <div className="r-org-addr">{org?.address || ""}</div>
            <div className="r-org-contacts">
              {org?.phone && <span>📞 {org.phone}</span>}
              {org?.email && <span>✉️ {org.email}</span>}
            </div>
          </div>
          <div style={{ textAlign: "left" }}>
            {org?.logoUrl && <img src={org.logoUrl} alt="" className="r-logo" />}
            <div className="r-doc-title">إيصال دفعة</div>
            <div className="r-doc-sub">PAYMENT RECEIPT</div>
            <div className="r-doc-ref">المرجع: #{payment.id}</div>
          </div>
        </div>

        {/* ── Success ── */}
        <div className="r-success">
          <div className="r-success-icon">
            <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <div className="r-success-title">تم استلام الدفعة بنجاح</div>
          <div className="r-success-sub">نشكرك لثقتكم بنا</div>
        </div>

        {/* ── Amount ── */}
        <div className="r-amount-box">
          <div>
            <span className="r-amount">{fmtMoney(payment.amount)}</span>
            <span className="r-currency">{invoice.currency}</span>
          </div>
          <div>
            <span className="r-method-badge">
              {methodLabel(payment.method)} • {fmtDateTime(payment.paidAt)}
            </span>
          </div>
          {payment.reference && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
              رقم المرجع: <strong style={{ fontFamily: "monospace" }}>{payment.reference}</strong>
            </div>
          )}
        </div>

        {/* ── Info Grid ── */}
        <div className="r-grid">
          <div className="r-box">
            <div className="r-box-header">👤 بيانات المريض</div>
            <table>
              <tbody>
                <tr><th>الاسم</th><td>{patient?.fullName || "—"}</td></tr>
                <tr><th>رقم الملف</th><td style={{ fontFamily: "monospace" }}>{patient?.mrn || "—"}</td></tr>
                {encounter && <tr><th>نوع الزيارة</th><td>{visitLabel(encounter.type)}</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="r-box">
            <div className="r-box-header">📄 بيانات الفاتورة</div>
            <table>
              <tbody>
                <tr><th>رقم الفاتورة</th><td style={{ fontFamily: "monospace" }}>#{invoice.id}</td></tr>
                <tr><th>التاريخ</th><td>{fmtDate(invoice.createdAt)}</td></tr>
                <tr>
                  <th>الحالة</th>
                  <td>
                    <span className={`r-badge ${isFullyPaid ? "r-badge-paid" : "r-badge-partial"}`}>
                      {isFullyPaid ? "مدفوعة بالكامل" : "مدفوعة جزئياً"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Summary ── */}
        <div className="r-summary">
          <div className="r-box-header">📊 ملخص الفاتورة</div>
          <div className="r-summary-row">
            <span className="r-summary-label">المبلغ الإجمالي:</span>
            <span className="r-summary-value">{fmtMoney(invoice.totalAmount)} {invoice.currency}</span>
          </div>
          {Number(invoice.discountAmount) > 0 && (
            <div className="r-summary-row">
              <span className="r-summary-label">الخصم:</span>
              <span className="r-summary-value" style={{ color: "#dc2626" }}>
                -{fmtMoney(invoice.discountAmount)} {invoice.currency}
              </span>
            </div>
          )}
          <div className="r-summary-row r-summary-hl">
            <span className="r-summary-label">الصافي:</span>
            <span className="r-summary-value">{fmtMoney(net)} {invoice.currency}</span>
          </div>
          <div className="r-summary-row">
            <span className="r-summary-label">إجمالي المدفوع:</span>
            <span className="r-summary-value" style={{ color: "#059669" }}>
              {fmtMoney(invoice.paidAmount)} {invoice.currency}
            </span>
          </div>
          <div className="r-summary-row r-summary-hl">
            <span className="r-summary-label" style={{ fontWeight: 700 }}>المبلغ المتبقي:</span>
            <span className="r-summary-value" style={{
              fontSize: 18,
              color: Number(invoice.remainingAmount) > 0 ? "#dc2626" : "#059669",
            }}>
              {fmtMoney(invoice.remainingAmount)} {invoice.currency}
            </span>
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="r-notes">
          <div>• هذا الإيصال دليل على الدفعة ولا يعتبر فاتورة ضريبية</div>
          <div>• يرجى الاحتفاظ به للمراجعة والمطالبة</div>
        </div>

        {/* ── Signatures ── */}
        <div className="r-sigs">
          <div className="r-sig">
            <div className="r-sig-line" />
            <div className="r-sig-label">توقيع المستلم (الكاشير)</div>
            {payment.cashierName && <div className="r-sig-name">{payment.cashierName}</div>}
          </div>
          <div className="r-sig">
            <div className="r-sig-line" />
            <div className="r-sig-label">توقيع الدافع (المريض)</div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="r-footer">
          <div>{new Date().toLocaleString("ar-LY")} • Powered by Saraya ERP</div>
        </div>
      </div>
    </>
  );
}
