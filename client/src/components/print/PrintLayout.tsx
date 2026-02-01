import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api/apiClient';
import type { OrganizationSettings } from '../../types/organization';

interface PrintLayoutProps {
  title: string;
  subtitle?: string;
  documentId?: string | number;
  children: React.ReactNode;
  footerNotes?: string;
  pageSize?: 'A4' | 'A5'; // Added prop
}

export default function PrintLayout({
  title,
  subtitle,
  documentId,
  children,
  footerNotes,
  pageSize = 'A4', // Default to A4
}: PrintLayoutProps) {
  const [org, setOrg] = useState<OrganizationSettings | null>(null);

  useEffect(() => {
    apiClient
      .get<OrganizationSettings>('/settings/organization')
      .then((res) => setOrg(res.data))
      .catch((err) => console.error('Failed to load org settings', err));
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 flex justify-center py-8 print:bg-white print:p-0 print:m-0">
      <div
        id="print-container"
        className={`bg-white text-slate-900 shadow-2xl rounded-sm p-8 flex flex-col print:shadow-none print:w-full print:h-auto print:rounded-none
          ${pageSize === 'A5' ? 'w-[148mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'}
        `}
        dir="rtl"
      >
        {/* Actions Bar (Hidden in Print) */}
        <div className="no-print flex justify-between items-center mb-8 border-b pb-4 border-slate-100">
          <div className="text-sm text-slate-400">معاينة الطباعة</div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium shadow-sm transition-colors flex items-center gap-2"
            >
              <span>🖨</span>
              <span>طباعة المستند</span>
            </button>
            <button
              onClick={() => window.close()}
              className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md font-medium shadow-sm transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>

        {/* Header */}
        <header className="flex justify-between items-start border-b-2 border-emerald-600 pb-6 mb-6">
          {/* Organization Info */}
          <div className="text-right space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">
              {org?.displayName || 'المستشفى المركزي'}
            </h1>
            <div className="text-sm text-slate-500 max-w-[300px] leading-relaxed">
              {org?.address || 'العنوان الرئيسي للمنشأة'}
            </div>
            <div className="flex gap-4 text-xs text-slate-500 mt-2">
              {org?.phone && (
                <div className="flex items-center gap-1">
                  <span>📞</span> {org.phone}
                </div>
              )}
              {org?.email && (
                <div className="flex items-center gap-1">
                  <span>✉️</span> {org.email}
                </div>
              )}
            </div>
          </div>

          {/* Logo & Document Title */}
          <div className="text-left flex flex-col items-end">
            {org?.logoUrl && (
              <img
                src={org.logoUrl}
                alt="Logo"
                className="h-16 w-auto object-contain mb-3"
              />
            )}
            <div className="text-3xl font-bold text-emerald-900 uppercase tracking-wide">
              {title}
            </div>
            {subtitle && (
              <div className="text-sm text-emerald-600 font-medium uppercase tracking-wider">
                {subtitle}
              </div>
            )}
            {documentId && (
              <div className="text-xs text-slate-400 mt-1 font-mono">
                Ref: #{documentId}
              </div>
            )}
          </div>
        </header>

        {/* content */}
        <main className="flex-grow">{children}</main>

        {/* Footer */}
        <footer className="mt-auto pt-6 border-t border-slate-200 text-center">
          {footerNotes && (
            <div className="text-sm text-slate-600 mb-4 italic">
              {footerNotes}
            </div>
          )}
          
          <div className="flex justify-center items-center gap-8 text-[10px] text-slate-400 uppercase tracking-widest">
            <span>Powered by Saraya ERP</span>
            <span>•</span>
            <span>{new Date().toLocaleString('en-US')}</span>
            <span>•</span>
            <span>Page 1 of 1</span>
          </div>
        </footer>
      </div>

      <style>{`
        @media print {
          @page {
            size: ${pageSize};
            margin: 0;
          }
          body {
            background: white;
            -webkit-print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          #print-container {
            box-shadow: none;
            width: 100%;
            margin: 0;
            padding: ${pageSize === 'A5' ? '5mm' : '10mm'}; 
          }
        }
      `}</style>
    </div>
  );
}
