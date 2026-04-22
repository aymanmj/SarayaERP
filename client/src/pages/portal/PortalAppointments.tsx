/**
 * Patient Portal — Appointments Page & Booking Wizard
 * 
 * View upcoming & past appointments + Book new ones via a step-by-step wizard.
 */

import { useEffect, useState } from 'react';
import { portalApi } from '../../api/portalApi';
import { toast } from 'sonner';
import { Calendar, Plus, X, Loader2, Clock, User, Building2, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';

export default function PortalAppointments() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Wizard State
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Directory Data
  const [departments, setDepartments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  
  // Selection State
  const [selectedDept, setSelectedDept] = useState<number | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [bookingReason, setBookingReason] = useState('');

  const fetchAppointments = () => {
    setLoading(true);
    portalApi.get('/appointments')
      .then(res => setAppointments(res.data?.items || res.data || []))
      .catch(() => toast.error('فشل تحميل المواعيد'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAppointments(); }, []);

  // Wizard Data Fetchers
  const fetchDepartments = async () => {
    setWizardLoading(true);
    try {
      const res = await portalApi.get('/directory/departments');
      setDepartments(res.data || []);
    } catch {
      toast.error('فشل تحميل الأقسام');
    } finally {
      setWizardLoading(false);
    }
  };

  const fetchDoctors = async (deptId: number) => {
    setWizardLoading(true);
    try {
      const res = await portalApi.get(`/directory/doctors?departmentId=${deptId}`);
      setDoctors(res.data || []);
    } catch {
      toast.error('فشل تحميل الأطباء');
    } finally {
      setWizardLoading(false);
    }
  };

  const fetchSlots = async (doctorId: number, date: string) => {
    setWizardLoading(true);
    try {
      const res = await portalApi.get(`/directory/doctors/${doctorId}/slots?date=${date}`);
      setAvailableSlots(res.data || []);
    } catch {
      toast.error('فشل تحميل المواعيد المتاحة');
    } finally {
      setWizardLoading(false);
    }
  };

  const startWizard = () => {
    setWizardStep(1);
    setSelectedDept(null);
    setSelectedDoctor(null);
    setSelectedDate('');
    setSelectedSlot('');
    setBookingReason('');
    setShowWizard(true);
    fetchDepartments();
  };

  const handleNextStep = () => {
    if (wizardStep === 1 && selectedDept) {
      fetchDoctors(selectedDept);
      setWizardStep(2);
    } else if (wizardStep === 2 && selectedDoctor) {
      setWizardStep(3);
    } else if (wizardStep === 3 && selectedSlot) {
      setWizardStep(4);
    }
  };

  const handleBook = async () => {
    setSubmitting(true);
    try {
      await portalApi.post('/appointments/book', {
        doctorId: selectedDoctor,
        scheduledStart: selectedSlot,
        reason: bookingReason || undefined,
      });
      toast.success('تم حجز الموعد بنجاح');
      setShowWizard(false);
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
        <button className="portal-primary-btn" onClick={startWizard}>
          <Plus size={18} /> حجز موعد جديد
        </button>
      </div>

      {/* Booking Wizard Modal */}
      {showWizard && (
        <div className="portal-modal-overlay">
          <div className="portal-modal" style={{ maxWidth: '600px' }}>
            <div className="portal-modal-header">
              <h2>معالج حجز موعد</h2>
              <button onClick={() => setShowWizard(false)}><X size={20} /></button>
            </div>
            
            <div className="wizard-progress">
              <div className={`wizard-step ${wizardStep >= 1 ? 'active' : ''}`}>1. القسم</div>
              <div className={`wizard-step ${wizardStep >= 2 ? 'active' : ''}`}>2. الطبيب</div>
              <div className={`wizard-step ${wizardStep >= 3 ? 'active' : ''}`}>3. الوقت</div>
              <div className={`wizard-step ${wizardStep >= 4 ? 'active' : ''}`}>4. التأكيد</div>
            </div>

            <div className="portal-form" style={{ minHeight: '300px' }}>
              {wizardLoading ? (
                <div className="portal-page-loader"><Loader2 className="animate-spin" size={30} /></div>
              ) : (
                <>
                  {/* STEP 1: Department */}
                  {wizardStep === 1 && (
                    <div className="wizard-grid">
                      {departments.map(dept => (
                        <div 
                          key={dept.id} 
                          className={`wizard-card ${selectedDept === dept.id ? 'selected' : ''}`}
                          onClick={() => setSelectedDept(dept.id)}
                        >
                          <Building2 size={24} />
                          <h3>{dept.name}</h3>
                        </div>
                      ))}
                      {departments.length === 0 && <p className="text-muted">لا توجد أقسام متاحة</p>}
                    </div>
                  )}

                  {/* STEP 2: Doctor */}
                  {wizardStep === 2 && (
                    <div className="wizard-grid">
                      {doctors.map(doc => (
                        <div 
                          key={doc.id} 
                          className={`wizard-card ${selectedDoctor === doc.id ? 'selected' : ''}`}
                          onClick={() => setSelectedDoctor(doc.id)}
                        >
                          <User size={24} />
                          <h3>د. {doc.fullName}</h3>
                          <p>{doc.specialty}</p>
                        </div>
                      ))}
                      {doctors.length === 0 && <p className="text-muted">لا يوجد أطباء متاحين في هذا القسم</p>}
                    </div>
                  )}

                  {/* STEP 3: Date & Slot */}
                  {wizardStep === 3 && (
                    <div className="wizard-date-slot">
                      <div className="portal-input-group">
                        <label>اختر التاريخ</label>
                        <input 
                          type="date" 
                          min={new Date().toISOString().split('T')[0]}
                          value={selectedDate}
                          onChange={(e) => {
                            setSelectedDate(e.target.value);
                            if (e.target.value) fetchSlots(selectedDoctor!, e.target.value);
                          }}
                        />
                      </div>
                      
                      {selectedDate && (
                        <div className="slots-grid">
                          {availableSlots.length > 0 ? availableSlots.map(slot => (
                            <button
                              key={slot.time}
                              className={`slot-btn ${selectedSlot === slot.time ? 'selected' : ''}`}
                              onClick={() => setSelectedSlot(slot.time)}
                            >
                              <Clock size={16} />
                              {new Date(slot.time).toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' })}
                            </button>
                          )) : (
                            <p className="text-muted" style={{ gridColumn: '1 / -1' }}>لا توجد فترات متاحة في هذا اليوم</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 4: Confirm */}
                  {wizardStep === 4 && (
                    <div className="wizard-confirm">
                      <div className="confirm-summary">
                        <CheckCircle2 size={40} className="text-success mb-2" />
                        <h3>ملخص الحجز</h3>
                        <p><strong>الطبيب:</strong> {doctors.find(d => d.id === selectedDoctor)?.fullName}</p>
                        <p><strong>التاريخ والوقت:</strong> {new Date(selectedSlot).toLocaleString('ar-LY')}</p>
                      </div>
                      <div className="portal-input-group mt-4">
                        <label>سبب الزيارة (اختياري)</label>
                        <textarea 
                          value={bookingReason}
                          onChange={e => setBookingReason(e.target.value)}
                          placeholder="مثال: متابعة حالة السكري" 
                          rows={3}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="portal-modal-footer wizard-footer">
              {wizardStep > 1 ? (
                <button 
                  className="portal-secondary-btn" 
                  onClick={() => setWizardStep(wizardStep - 1)}
                  disabled={wizardLoading || submitting}
                >
                  <ChevronRight size={18} /> السابق
                </button>
              ) : <div></div>}

              {wizardStep < 4 ? (
                <button 
                  className="portal-primary-btn" 
                  onClick={handleNextStep}
                  disabled={
                    wizardLoading || 
                    (wizardStep === 1 && !selectedDept) ||
                    (wizardStep === 2 && !selectedDoctor) ||
                    (wizardStep === 3 && !selectedSlot)
                  }
                >
                  التالي <ChevronLeft size={18} />
                </button>
              ) : (
                <button 
                  className="portal-submit-btn" 
                  onClick={handleBook}
                  disabled={submitting || wizardLoading}
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : 'تأكيد الحجز النهائي'}
                </button>
              )}
            </div>
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
