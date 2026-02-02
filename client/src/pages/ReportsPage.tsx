import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from '../api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, addDays, startOfDay } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Report {
  id: number;
  title: string;
  type: string;
  generatedAt: string;
  generatedBy: string;
  period: string;
  data: any;
  status?: 'GENERATED' | 'FAILED' | 'PENDING';
}

interface ReportType {
  id: string;
  name: string;
  description: string;
  category: string;
}

export function ReportsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [selectedReportType, setSelectedReportType] = useState<string>('');
  const [dateRange, setDateRange] = useState({
    from: startOfDay(addDays(new Date(), -30)),
    to: new Date(),
  });
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Fetch report types
  const { data: reportTypes } = useQuery({
    queryKey: ['reportTypes'],
    queryFn: async () => {
      const response = await apiClient.get('/reports/types');
      return response.data;
    },
  });

  // Fetch reports
  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ['reports', selectedReportType, dateRange],
    queryFn: async () => {
      const params = {
        type: selectedReportType,
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      };
      const response = await apiClient.get('/reports', { params });
      return response.data;
    },
  });

  const handleGenerateReport = async (reportType: string) => {
    setSelectedReportType(reportType);
    setShowGenerateModal(true);
  };

  const handleDownloadReport = async (reportId: number) => {
    try {
      const response = await apiClient.get(`/reports/${reportId}/download`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-${reportId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('تم تحميل التقرير بنجاح');
    } catch (error) {
      toast.error('فشل تحميل التقرير');
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'CLINICAL':
        return 'bg-blue-100 text-blue-800';
      case 'FINANCIAL':
        return 'bg-green-100 text-green-800';
      case 'ADMINISTRATIVE':
        return 'bg-purple-100 text-purple-800';
      case 'OPERATIONAL':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'CLINICAL':
        return '🏥';
      case 'FINANCIAL':
        return '💰';
      case 'ADMINISTRATIVE':
        return '⚙️';
      case 'OPERATIONAL':
        return '📊';
      default:
        '📄';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-slate-900">
                📊 التقارير
              </h1>
            </div>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
            >
              📊 إنشاء تقرير جديد
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Report Type Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">نوع التقرير</label>
              <select
                value={selectedReportType}
                onChange={(e) => setSelectedReportType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="">اختر نوع التقرير...</option>
                {reportTypes?.map((type: ReportType) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">نطاق التقرير</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">من تاريخ</label>
                  <input
                    type="date"
                    value={format(dateRange.from, 'yyyy-MM-dd')}
                    onChange={(e) => setDateRange(prev => ({ ...prev, from: new Date(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">إلى تاريخ</label>
                  <input
                    type="date"
                    value={format(dateRange.to, 'yyyy-MM-dd')}
                    onChange={(e) => setDateRange(prev => ({ ...prev, to: new Date(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Quick Generate Button */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">تقرير سريع</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <button
                    onClick={() => handleGenerateReport('FINANCIAL_SUMMARY')}
                    className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    💰 ملخص مالي
                  </button>
                </div>
                <div>
                  <button
                    onClick={() => handleGenerateReport('PATIENT_SUMMARY')}
                    className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    🏥 ملخص المرضى
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              التقارير المتاحة
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    التاريخ
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    العنوان
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    النوع
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    الحالة
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    الإجراءات
                  </th>
                </tr>
              </thead>
              <tbody>
                {reportsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                        <span className="mr-2">جاري التحميل...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reports?.map((report: Report) => (
                    <tr key={report.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {format(new Date(report.generatedAt), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {report.generatedBy}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(report.type)}`}>
                          {getCategoryIcon(report.type)}
                          <span className="ml-1">{report.type}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          report.status === 'GENERATED'
                            ? 'bg-green-100 text-green-800'
                            : report.status === 'FAILED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {report.status === 'GENERATED' ? 'جاهز' : report.status === 'FAILED' ? 'فشل' : 'قيد الإعداد'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleDownloadReport(report.id)}
                            className="text-sky-600 hover:text-sky-800 font-medium"
                          >
                            📥 تحميل
                          </button>
                          <button
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            👁 عرض
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Generate Report Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">إنشاء تقرير</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    اختر نوع التقرير والفترة الزمنية
                  </p>
                </div>
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Report Type Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">نوع التقرير</label>
                <select
                  value={selectedReportType}
                  onChange={(e) => setSelectedReportType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                >
                  {reportTypes?.map((type: ReportType) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">فترة التقرير</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">من</label>
                    <input
                      type="date"
                      value={format(dateRange.from, 'yyyy-MM-dd')}
                      onChange={(e) => setDateRange(prev => ({ ...prev, from: new Date(e.target.value) }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">إلى</label>
                    <input
                      type="date"
                      value={format(dateRange.to, 'yyyy-MM-dd')}
                      onChange={(e) => setDateRange(prev => ({ ...prev, to: new Date(e.target.value) }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={() => {
                  setGenerating(true);
                  // Here you would implement the actual report generation logic
                  setTimeout(() => {
                    setGenerating(false);
                    setShowGenerateModal(false);
                    toast.success('تم إنشاء التقرير بنجاح');
                  }, 2000);
                }}
                disabled={!selectedReportType || generating}
                className="w-full px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {generating ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018 0 0 0 0 0 0 0z"></path>
                    </svg>
                    <span>جاري إنشاء التقرير...</span>
                  </span>
                ) : (
                  'إنشاء التقرير'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
