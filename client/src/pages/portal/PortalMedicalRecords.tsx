/**
 * Patient Portal — Medical Records Page
 * 
 * Tabbed view of: Vitals, Lab Results, Medications, Allergies, Diagnoses, Encounters
 */

import { useEffect, useState } from 'react';
import { portalApi } from '../../api/portalApi';
import { FileText, Activity, FlaskConical, Pill, AlertTriangle, Stethoscope, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'vitals' | 'labs' | 'medications' | 'allergies' | 'diagnoses' | 'encounters';

const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: 'vitals', label: 'العلامات الحيوية', icon: Activity },
  { key: 'labs', label: 'نتائج التحاليل', icon: FlaskConical },
  { key: 'medications', label: 'الأدوية', icon: Pill },
  { key: 'allergies', label: 'الحساسية', icon: AlertTriangle },
  { key: 'diagnoses', label: 'التشخيصات', icon: Stethoscope },
  { key: 'encounters', label: 'الزيارات', icon: FileText },
];

export default function PortalMedicalRecords() {
  const [activeTab, setActiveTab] = useState<Tab>('vitals');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const endpoints: Record<Tab, string> = {
    vitals: '/medical/vitals',
    labs: '/medical/lab-results',
    medications: '/medical/medications',
    allergies: '/medical/allergies',
    diagnoses: '/medical/diagnoses',
    encounters: '/medical/encounters',
  };

  useEffect(() => {
    setLoading(true);
    portalApi.get(endpoints[activeTab])
      .then(res => setData(res.data?.items || res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTab]);

  const handleDownloadPdf = (item: any) => {
    // Simulated PDF Download using print window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('يرجى السماح بالنوافذ المنبثقة (Pop-ups)');
      return;
    }
    
    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>نتيجة تحليل - ${item.test?.name || 'تحليل'}</title>
          <style>
            body { font-family: 'Tajawal', system-ui, sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #2B5E7D; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { color: #2B5E7D; margin: 0; }
            .info-table { width: 100%; margin-bottom: 30px; border-collapse: collapse; }
            .info-table td { padding: 10px; border: 1px solid #ddd; }
            .info-table td.label { font-weight: bold; background-color: #f9fafb; width: 30%; }
            .result-box { padding: 20px; border: 1px solid #2B5E7D; border-radius: 8px; background-color: #f0f7fb; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>مستشفى السرايا التخصصي</h1>
            <h2>تقرير نتيجة تحليل طبي</h2>
          </div>
          <table class="info-table">
            <tr><td class="label">اسم التحليل</td><td>${item.test?.name || 'غير محدد'}</td></tr>
            <tr><td class="label">تاريخ النتيجة</td><td>${new Date(item.createdAt).toLocaleDateString('ar-LY')}</td></tr>
            <tr><td class="label">حالة النتيجة</td><td>${item.resultStatus === 'FINAL' ? 'نهائية' : 'مبدئية'}</td></tr>
          </table>
          <div class="result-box">
            <h3 style="margin-top:0">النتيجة:</h3>
            <p>${item.resultValue || 'تم إرفاق النتيجة في النظام.'}</p>
            ${item.referenceRange ? `<p><small>المعدل الطبيعي: ${item.referenceRange}</small></p>` : ''}
            ${item.notes ? `<p><strong>ملاحظات:</strong> ${item.notes}</p>` : ''}
          </div>
          <div class="footer">
            <p>هذا التقرير صادر إلكترونياً من بوابة المريض - نظام السرايا الطبي</p>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <h1><FileText size={28} /> السجلات الطبية</h1>
      </div>

      {/* Tabs */}
      <div className="portal-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`portal-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="portal-page-loader"><Loader2 className="animate-spin" size={30} /></div>
      ) : data.length === 0 ? (
        <div className="portal-empty">
          <FileText size={48} />
          <p>لا توجد سجلات</p>
        </div>
      ) : (
        <div className="portal-list">
          {data.map((item: any, i: number) => (
            <div key={item.id || i} className="portal-list-item">
              <div className="portal-list-item-content">
                {activeTab === 'vitals' && (
                  <>
                    <div className="portal-list-item-top">
                      <span className="portal-list-date">{new Date(item.createdAt).toLocaleDateString('ar-LY')}</span>
                    </div>
                    <div className="portal-vitals-grid">
                      {item.temperature && <span>🌡 {item.temperature}°C</span>}
                      {item.heartRate && <span>❤️ {item.heartRate} bpm</span>}
                      {item.bpSystolic && <span>🩸 {item.bpSystolic}/{item.bpDiastolic}</span>}
                      {item.o2Saturation && <span>💨 {item.o2Saturation}%</span>}
                    </div>
                  </>
                )}
                {activeTab === 'labs' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                    <div>
                      <h4>{item.test?.name || 'تحليل'}</h4>
                      <p className="portal-card-sub">{item.resultStatus === 'FINAL' ? 'نتيجة نهائية' : 'مبدئية'}</p>
                    </div>
                    {item.resultStatus === 'FINAL' && (
                      <button 
                        className="portal-secondary-btn" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}
                        onClick={() => handleDownloadPdf(item)}
                      >
                        <Download size={16} /> تحميل PDF
                      </button>
                    )}
                  </div>
                )}
                {activeTab === 'medications' && (
                  <>
                    <h4>{item.items?.map((i: any) => i.product?.name).join(', ') || 'وصفة'}</h4>
                    <p className="portal-card-sub">
                      د. {item.doctor?.fullName} — {new Date(item.createdAt).toLocaleDateString('ar-LY')}
                    </p>
                    <span className={`portal-status ${item.status === 'ACTIVE' ? 'status-active' : 'status-completed'}`}>
                      {item.status === 'ACTIVE' ? 'نشطة' : 'منتهية'}
                    </span>
                  </>
                )}
                {activeTab === 'allergies' && (
                  <>
                    <h4>{item.allergen}</h4>
                    <span className={`portal-tag ${item.severity === 'HIGH' ? 'danger' : 'warning'}`}>
                      {item.severity === 'HIGH' ? 'شديدة' : item.severity === 'MODERATE' ? 'متوسطة' : 'خفيفة'}
                    </span>
                    {item.reaction && <p className="portal-card-sub">{item.reaction}</p>}
                  </>
                )}
                {activeTab === 'diagnoses' && (
                  <>
                    <h4>{item.description || item.code || 'تشخيص'}</h4>
                    <p className="portal-card-sub">{new Date(item.createdAt).toLocaleDateString('ar-LY')}</p>
                  </>
                )}
                {activeTab === 'encounters' && (
                  <>
                    <div className="portal-list-item-top">
                      <span className={`portal-status ${item.status === 'OPEN' ? 'status-active' : 'status-completed'}`}>
                        {item.status === 'OPEN' ? 'مفتوحة' : item.status === 'COMPLETED' ? 'مكتملة' : item.status}
                      </span>
                      <span className="portal-list-date">{new Date(item.createdAt).toLocaleDateString('ar-LY')}</span>
                    </div>
                    <div className="portal-list-item-details">
                      {item.doctor && <span>د. {item.doctor.fullName}</span>}
                      {item.department && <span>{item.department.name}</span>}
                    </div>
                    {item.chiefComplaint && <p className="portal-list-item-note">{item.chiefComplaint}</p>}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
