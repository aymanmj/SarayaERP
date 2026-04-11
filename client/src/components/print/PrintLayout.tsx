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

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    try {
      // استخراج نوع المستند من المسار
      const currentPath = window.location.pathname;

      // التحقق مما إذا كان فاتورة (لديها PDF endpoint)
      const invoiceMatch = currentPath.match(/\/invoices?\/([\d]+)/);
      if (invoiceMatch) {
        const invoiceId = invoiceMatch[1];
        const response = await apiClient.get(`/billing/invoices/${invoiceId}/pdf`, {
          responseType: "blob",
        });
        const url = window.URL.createObjectURL(
          new Blob([response.data], { type: "application/pdf" })
        );
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `invoice-${invoiceId}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        return;
      }

      // لبقية المستندات (إيصال دفع مثلاً) — استخدم طباعة المتصفح
      window.print();
    } catch (err) {
      console.error("Error generating PDF:", err);
      // fallback to browser print
      window.print();
    }
  };

  const handleShare = () => {
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
    <div className="print-page-wrapper">
      {/* Actions Bar (Hidden in Print) */}
      <div className="no-print" style={{
        background: "linear-gradient(to right, #ecfdf5, #f8fafc)",
        borderBottom: "1px solid #a7f3d0",
        padding: "12px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
        marginBottom: "24px",
        borderRadius: "8px",
        maxWidth: pageSize === "A5" ? "148mm" : "210mm",
        width: "100%",
        margin: "0 auto 24px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#dcfce7", color: "#166534", borderRadius: 8,
            padding: "6px 14px", fontSize: 13, fontWeight: 600,
          }}>
            <Printer style={{ width: 16, height: 16 }} />
            معاينة الطباعة
          </div>
          {documentId && (
            <div style={{
              background: "#f1f5f9", color: "#64748b", borderRadius: 8,
              padding: "6px 14px", fontSize: 13, fontFamily: "monospace",
            }}>
              #{documentId}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={handleShare} style={{
            padding: "8px 16px", background: "white", border: "1px solid #d1d5db",
            borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#475569",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            <Share2 style={{ width: 14, height: 14 }} /> مشاركة
          </button>
          <button onClick={handleDownload} style={{
            padding: "8px 16px", background: "#2563eb", border: "none",
            borderRadius: 8, fontSize: 13, fontWeight: 600, color: "white",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            <Download style={{ width: 14, height: 14 }} /> تحميل
          </button>
          <button onClick={handlePrint} style={{
            padding: "8px 20px", background: "#059669", border: "none",
            borderRadius: 8, fontSize: 13, fontWeight: 700, color: "white",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 4px 6px rgba(5, 150, 105, 0.25)",
          }}>
            <Printer style={{ width: 14, height: 14 }} /> طباعة المستند
          </button>
          <button onClick={() => window.history.back()} style={{
            padding: 8, background: "white", border: "1px solid #d1d5db",
            borderRadius: 8, color: "#64748b", cursor: "pointer",
            display: "flex", alignItems: "center",
          }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>

      <div id="print-container" dir="rtl">
        {/* Header */}
        <header className="print-header">
          {/* Watermark */}
          {showWatermark && (
            <div className="print-watermark">{watermarkText}</div>
          )}

          <div className="print-header-inner">
            {/* Organization Info */}
            <div className="print-org-info">
              <h1 className="print-org-name">
                {org?.displayName || "المستشفى المركزي"}
              </h1>
              <div className="print-org-address">
                {org?.address || "العنوان الرئيسي للمنشأة"}
              </div>
              <div className="print-org-contacts">
                {org?.phone && <span>📞 {org.phone}</span>}
                {org?.email && <span>✉️ {org.email}</span>}
                {org?.website && <span>🌐 {org.website}</span>}
              </div>
            </div>

            {/* Logo & Document Title */}
            <div className="print-doc-title-wrapper">
              {org?.logoUrl && (
                <div className="print-logo-box">
                  <img src={org.logoUrl} alt="Logo" className="print-logo-img" />
                </div>
              )}
              <div className="print-doc-title">{title}</div>
              {subtitle && <div className="print-doc-subtitle">{subtitle}</div>}
              {documentId && (
                <div className="print-doc-ref">المرجع: #{documentId}</div>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="print-main">{children}</main>

        {/* Footer */}
        <footer className="print-footer">
          {footerNotes && <div className="print-footer-notes">{footerNotes}</div>}
          <div className="print-footer-meta">
            <span>
              Powered by <strong style={{ color: "#059669" }}>Saraya ERP</strong>
            </span>
            <span>•</span>
            <span>{new Date().toLocaleString("ar-LY")}</span>
            <span>•</span>
            <span>صفحة 1 من 1</span>
          </div>
        </footer>
      </div>

      {/* ── Print Styles ── */}
      <style>{`
        /* ──────────── Screen Styles ──────────── */
        .print-page-wrapper {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc, #f1f5f9);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 32px 0;
          font-family: 'Cairo', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
        }

        #print-container {
          background: white;
          color: #1e293b;
          width: ${pageSize === "A5" ? "148mm" : "210mm"};
          min-height: ${pageSize === "A5" ? "210mm" : "297mm"};
          box-shadow: 0 20px 60px rgba(0,0,0,0.12);
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.3s, box-shadow 0.3s;
        }
        #print-container:hover {
          transform: translateY(-2px);
          box-shadow: 0 24px 70px rgba(0,0,0,0.15);
        }

        .print-header {
          position: relative;
          background: linear-gradient(to right, #ecfdf5, white, #f8fafc);
          border-bottom: 3px solid #059669;
          padding: 32px;
          overflow: hidden;
        }
        .print-watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-15deg);
          font-size: 90px;
          font-weight: 900;
          color: rgba(5, 150, 105, 0.06);
          pointer-events: none;
          user-select: none;
          white-space: nowrap;
        }
        .print-header-inner {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }
        .print-org-info {
          flex: 1;
          text-align: right;
        }
        .print-org-name {
          font-size: 26px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 8px;
          letter-spacing: -0.3px;
        }
        .print-org-address {
          font-size: 13px;
          color: #64748b;
          max-width: 350px;
          line-height: 1.6;
          margin-bottom: 10px;
        }
        .print-org-contacts {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 11px;
          color: #64748b;
        }
        .print-org-contacts span {
          background: #f1f5f9;
          padding: 4px 10px;
          border-radius: 6px;
        }
        .print-doc-title-wrapper {
          text-align: left;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          flex-shrink: 0;
        }
        .print-logo-box {
          margin-bottom: 12px;
          padding: 6px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.06);
        }
        .print-logo-img {
          height: 70px;
          width: auto;
          object-fit: contain;
        }
        .print-doc-title {
          font-size: 28px;
          font-weight: 800;
          color: #064e3b;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }
        .print-doc-subtitle {
          font-size: 13px;
          color: #059669;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .print-doc-ref {
          font-size: 11px;
          color: #94a3b8;
          font-family: monospace;
          background: #f1f5f9;
          padding: 3px 10px;
          border-radius: 4px;
        }

        .print-main {
          flex: 1;
          padding: 24px 32px;
        }

        .print-footer {
          margin-top: auto;
          background: linear-gradient(to right, #f8fafc, #ecfdf5);
          border-top: 1px solid #e2e8f0;
          padding: 20px 32px;
          text-align: center;
        }
        .print-footer-notes {
          font-size: 12px;
          color: #64748b;
          font-style: italic;
          background: white;
          padding: 10px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          margin-bottom: 12px;
        }
        .print-footer-meta {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          font-size: 10px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        /* ──────────── Print Styles ──────────── */
        @media print {
          @page {
            size: ${pageSize};
            margin: 10mm;
          }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-page-wrapper {
            min-height: auto !important;
            background: white !important;
            padding: 0 !important;
          }
          #print-container {
            box-shadow: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            min-height: auto !important;
            transform: none !important;
          }
          .print-header {
            background: white !important;
            border-bottom: 2px solid #059669 !important;
            padding: 16px 20px !important;
          }
          .print-watermark {
            color: rgba(5, 150, 105, 0.04) !important;
          }
          .print-main {
            padding: 12px 20px !important;
          }
          .print-footer {
            background: white !important;
            border-top: 1px solid #cbd5e1 !important;
            padding: 12px 20px !important;
          }
          .print-footer-notes {
            background: #f8fafc !important;
          }
        }
      `}</style>
    </div>
  );
}
