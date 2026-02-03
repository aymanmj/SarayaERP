import React from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Download } from 'lucide-react';

export default function InvoicePrintPDFPage() {
  const { id } = useParams();
  const invoiceId = Number(id);

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

  const handlePrintPDF = async () => {
    try {
      // Generate PDF from backend
      const response = await apiClient.get(`/billing/invoices/${invoiceId}/pdf`, {
        responseType: 'blob'
      });
      
      // Create blob URL
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      // Open in new window
      const printWindow = window.open(url, '_blank');
      
      // Wait for PDF to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 1000);
      };
      
      // Clean up
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 10000);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('حدث خطأ في إنشاء ملف PDF');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mx-auto mb-4" />
          <div className="text-slate-600">جاري تحميل الفاتورة...</div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center text-red-600">
          خطأ: {(error as any)?.message}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { invoice } = data;
  const isCreditNote = invoice.type === "CREDIT_NOTE";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Download className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {isCreditNote ? "إشعار دائن" : "فاتورة ضريبية"}
          </h1>
          <p className="text-slate-600">
            المرجع: #{invoice.id}
          </p>
        </div>

        {/* Invoice Info */}
        <div className="bg-slate-50 rounded-lg p-4 mb-6">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">التاريخ:</span>
              <span className="font-medium">{new Date(invoice.createdAt).toLocaleDateString('ar-LY')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الحالة:</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                invoice.status === "PAID" 
                  ? "bg-emerald-100 text-emerald-700" 
                  : "bg-amber-100 text-amber-700"
              }`}>
                {invoice.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">المبلغ:</span>
              <span className="font-bold text-emerald-600">
                {Number(invoice.totalAmount).toLocaleString('ar-LY', {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3
                })} {invoice.currency}
              </span>
            </div>
          </div>
        </div>

        {/* Print Button */}
        <button
          onClick={handlePrintPDF}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" />
          طباعة الفاتورة (PDF)
        </button>

        {/* Instructions */}
        <div className="mt-6 text-xs text-slate-500 text-center">
          سيتم إنشاء ملف PDF احترافي وفتحه في نافذة جديدة للطباعة
        </div>
      </div>
    </div>
  );
}
