/**
 * Patient Portal — Dashboard
 * 
 * Single-call summary view with cards for:
 * - Next appointment, Lab results, Balance, Messages, Refills
 * - Allergies + Insurance summary
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../../api/portalApi';
import { usePortalAuthStore } from '../../stores/portalAuthStore';
import {
  Calendar, FlaskConical, CreditCard, MessageSquare,
  Pill, AlertTriangle, Shield, Activity, Loader2
} from 'lucide-react';

export default function PortalDashboard() {
  const navigate = useNavigate();
  const { patient } = usePortalAuthStore();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.get('/medical/dashboard')
      .then(res => setDashboard(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="portal-page-loader">
        <Loader2 className="animate-spin" size={40} />
        <p>جارِ تحميل البيانات...</p>
      </div>
    );
  }

  const d = dashboard;

  return (
    <div className="portal-dashboard">
      {/* Welcome */}
      <div className="portal-welcome">
        <h1>مرحباً، {patient?.fullName} 👋</h1>
        <p>إليك ملخص حالتك الصحية</p>
      </div>

      {/* Summary Cards */}
      <div className="portal-cards-grid">
        {/* Next Appointment */}
        <div className="portal-card clickable" onClick={() => navigate('/portal/appointments')}>
          <div className="portal-card-icon" style={{ background: 'linear-gradient(135deg, #06b6d4, #0284c7)' }}>
            <Calendar size={24} />
          </div>
          <div className="portal-card-body">
            <h3>الموعد القادم</h3>
            {d?.nextAppointment ? (
              <>
                <p className="portal-card-value">
                  {new Date(d.nextAppointment.scheduledStart).toLocaleDateString('ar-LY', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </p>
                <p className="portal-card-sub">
                  د. {d.nextAppointment.doctor?.fullName}
                  {d.nextAppointment.department && ` — ${d.nextAppointment.department.name}`}
                </p>
              </>
            ) : (
              <p className="portal-card-empty">لا توجد مواعيد قادمة</p>
            )}
          </div>
        </div>

        {/* Lab Results */}
        <div className="portal-card clickable" onClick={() => navigate('/portal/records')}>
          <div className="portal-card-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
            <FlaskConical size={24} />
          </div>
          <div className="portal-card-body">
            <h3>آخر التحاليل</h3>
            {d?.recentLabResults?.length > 0 ? (
              <ul className="portal-card-list">
                {d.recentLabResults.map((lab: any, i: number) => (
                  <li key={i}>{lab.test?.name}</li>
                ))}
              </ul>
            ) : (
              <p className="portal-card-empty">لا توجد نتائج حديثة</p>
            )}
          </div>
        </div>

        {/* Financial */}
        <div className="portal-card clickable" onClick={() => navigate('/portal/invoices')}>
          <div className="portal-card-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            <CreditCard size={24} />
          </div>
          <div className="portal-card-body">
            <h3>الرصيد المالي</h3>
            <p className="portal-card-value">
              {d?.financial?.outstandingBalance?.toFixed(3)} {d?.financial?.currency}
            </p>
            <p className="portal-card-sub">
              {d?.financial?.unpaidInvoices} فواتير غير مدفوعة
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="portal-card clickable" onClick={() => navigate('/portal/messages')}>
          <div className="portal-card-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <MessageSquare size={24} />
          </div>
          <div className="portal-card-body">
            <h3>المراسلات</h3>
            <p className="portal-card-value">
              {d?.messaging?.unreadCount || 0}
            </p>
            <p className="portal-card-sub">رسائل غير مقروءة</p>
          </div>
        </div>

        {/* Refills */}
        <div className="portal-card clickable" onClick={() => navigate('/portal/refills')}>
          <div className="portal-card-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #db2777)' }}>
            <Pill size={24} />
          </div>
          <div className="portal-card-body">
            <h3>تجديد الوصفات</h3>
            <p className="portal-card-value">
              {d?.refills?.pendingCount || 0}
            </p>
            <p className="portal-card-sub">طلبات معلقة</p>
          </div>
        </div>

        {/* Active Medications */}
        <div className="portal-card">
          <div className="portal-card-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
            <Activity size={24} />
          </div>
          <div className="portal-card-body">
            <h3>الأدوية النشطة</h3>
            <p className="portal-card-value">{d?.activeMedications || 0}</p>
            <p className="portal-card-sub">وصفة نشطة</p>
          </div>
        </div>
      </div>

      {/* Bottom Row: Allergies + Insurance */}
      <div className="portal-info-row">
        {/* Allergies */}
        <div className="portal-info-card">
          <div className="portal-info-header">
            <AlertTriangle size={18} className="text-amber-400" />
            <h4>الحساسية</h4>
          </div>
          {d?.allergies?.length > 0 ? (
            <div className="portal-tags">
              {d.allergies.map((a: any, i: number) => (
                <span key={i} className={`portal-tag ${a.severity === 'HIGH' ? 'danger' : a.severity === 'MODERATE' ? 'warning' : 'info'}`}>
                  {a.allergen}
                </span>
              ))}
            </div>
          ) : (
            <p className="portal-info-empty">لا توجد حساسية مسجلة</p>
          )}
        </div>

        {/* Insurance */}
        <div className="portal-info-card">
          <div className="portal-info-header">
            <Shield size={18} className="text-emerald-400" />
            <h4>التأمين</h4>
          </div>
          {d?.insurance ? (
            <div>
              <p className="portal-info-value">{d.insurance.provider}</p>
              <p className="portal-info-sub">{d.insurance.plan}</p>
            </div>
          ) : (
            <p className="portal-info-empty">لا يوجد تأمين مسجل</p>
          )}
        </div>
      </div>
    </div>
  );
}
