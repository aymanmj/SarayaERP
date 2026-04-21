/**
 * Patient Portal — Appointments Page
 * 
 * View upcoming & past appointments + Book new ones.
 */

import { useEffect, useState } from 'react';
import { portalApi } from '../../api/portalApi';
import { toast } from 'sonner';
import { Calendar, Plus, X, Loader2, Clock, User, Building2 } from 'lucide-react';

export default function PortalAppointments() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingData, setBookingData] = useState({ doctorId: '', scheduledStart: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchAppointments = () => {
    setLoading(true);
    portalApi.get('/appointments')
      .then(res => setAppointments(res.data?.items || res.data || []))
      .catch(() => toast.error('فشل تحميل المواعيد'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAppointments(); }, []);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await portalApi.post('/appointments/book', {
        doctorId: Number(bookingData.doctorId),
        scheduledStart: bookingData.scheduledStart,
        reason: bookingData.reason || undefined,
      });
      toast.success('تم حجز الموعد بنجاح');
      setShowBooking(false);
      setBookingData({ doctorId: '', scheduledStart: '', reason: '' });
      fetchAppointments();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل حجز الموعد');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('هل أنت متأكد من إلغاء هذا الموعد؟')) return;
    try {
      await portalApi.patch(`/appointments/${id}/cancel`);
      toast.success('تم إلغاء الموعد');
      fetchAppointments();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إلغاء الموعد');
    }
  };

  const statusLabels: Record<string, { label: string; className: string }> = {
    REQUESTED: { label: 'بانتظار التأكيد', className: 'status-pending' },
    CONFIRMED: { label: 'مؤكد', className: 'status-confirmed' },
    CHECKED_IN: { label: 'تم الحضور', className: 'status-active' },
    CALLED: { label: 'تم الاستدعاء', className: 'status-active' },
    COMPLETED: { label: 'مكتمل', className: 'status-completed' },
    CANCELLED: { label: 'ملغى', className: 'status-cancelled' },
    NO_SHOW: { label: 'لم يحضر', className: 'status-cancelled' },
  };

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <h1><Calendar size={28} /> المواعيد</h1>
        <button className="portal-primary-btn" onClick={() => setShowBooking(true)}>
          <Plus size={18} /> حجز موعد جديد
        </button>
      </div>

      {/* Booking Modal */}
      {showBooking && (
        <div className="portal-modal-overlay">
          <div className="portal-modal">
            <div className="portal-modal-header">
              <h2>حجز موعد جديد</h2>
              <button onClick={() => setShowBooking(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleBook} className="portal-form">
              <div className="portal-input-group">
                <label>رقم الطبيب (Doctor ID)</label>
                <input type="number" value={bookingData.doctorId}
                  onChange={e => setBookingData({ ...bookingData, doctorId: e.target.value })}
                  required placeholder="أدخل رقم الطبيب" />
              </div>
              <div className="portal-input-group">
                <label>تاريخ ووقت الموعد</label>
                <input type="datetime-local" value={bookingData.scheduledStart}
                  onChange={e => setBookingData({ ...bookingData, scheduledStart: e.target.value })}
                  required />
              </div>
              <div className="portal-input-group">
                <label>سبب الزيارة (اختياري)</label>
                <textarea value={bookingData.reason}
                  onChange={e => setBookingData({ ...bookingData, reason: e.target.value })}
                  placeholder="مثال: متابعة حالة السكري" />
              </div>
              <button type="submit" className="portal-submit-btn" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" size={18} /> : 'تأكيد الحجز'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Appointments List */}
      {loading ? (
        <div className="portal-page-loader"><Loader2 className="animate-spin" size={30} /></div>
      ) : appointments.length === 0 ? (
        <div className="portal-empty">
          <Calendar size={48} />
          <p>لا توجد مواعيد</p>
        </div>
      ) : (
        <div className="portal-list">
          {appointments.map((apt: any) => {
            const status = statusLabels[apt.status] || { label: apt.status, className: '' };
            const canCancel = ['REQUESTED', 'CONFIRMED'].includes(apt.status);
            return (
              <div key={apt.id} className="portal-list-item">
                <div className="portal-list-item-content">
                  <div className="portal-list-item-top">
                    <span className={`portal-status ${status.className}`}>{status.label}</span>
                    <span className="portal-list-date">
                      <Clock size={14} />
                      {new Date(apt.scheduledStart).toLocaleDateString('ar-LY', {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="portal-list-item-details">
                    {apt.doctor && <span><User size={14} /> د. {apt.doctor.fullName}</span>}
                    {apt.department && <span><Building2 size={14} /> {apt.department.name}</span>}
                  </div>
                  {apt.reason && <p className="portal-list-item-note">{apt.reason}</p>}
                </div>
                {canCancel && (
                  <button className="portal-danger-btn" onClick={() => handleCancel(apt.id)}>
                    إلغاء
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
