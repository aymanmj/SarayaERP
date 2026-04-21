import { useEffect, useState } from 'react';
import { portalApi } from '../../api/portalApi';
import { toast } from 'sonner';
import { Pill, Loader2, Clock, CheckCircle, XCircle, Package } from 'lucide-react';

export default function PortalRefills() {
  const [refills, setRefills] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchRefills = () => { portalApi.get('/refills').then(r => setRefills(r.data?.items || r.data || [])).catch(()=>{}).finally(()=>setLoading(false)); };
  const fetchMeds = () => { portalApi.get('/medical/medications').then(r => setMeds(r.data || [])).catch(()=>{}); };

  useEffect(() => { fetchRefills(); fetchMeds(); }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await portalApi.post('/refills', { prescriptionId: Number(selectedPrescription), notes: notes || undefined });
      toast.success('تم إرسال طلب التجديد');
      setShowRequest(false); setSelectedPrescription(''); setNotes('');
      fetchRefills();
    } catch (err: any) { toast.error(err.response?.data?.message || 'فشل الطلب'); }
    finally { setSubmitting(false); }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('إلغاء هذا الطلب؟')) return;
    try { await portalApi.delete(`/refills/${id}`); toast.success('تم الإلغاء'); fetchRefills(); }
    catch (err: any) { toast.error(err.response?.data?.message || 'فشل الإلغاء'); }
  };

  const statusMap: Record<string, { label: string; icon: any; cls: string }> = {
    PENDING: { label: 'قيد المراجعة', icon: Clock, cls: 'status-pending' },
    APPROVED: { label: 'تمت الموافقة', icon: CheckCircle, cls: 'status-confirmed' },
    DENIED: { label: 'مرفوض', icon: XCircle, cls: 'status-cancelled' },
    DISPENSED: { label: 'تم الصرف', icon: Package, cls: 'status-completed' },
  };

  const activeMeds = meds.filter((m: any) => m.status === 'ACTIVE');

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <h1><Pill size={28}/> تجديد الوصفات</h1>
        <button className="portal-primary-btn" onClick={() => setShowRequest(true)}>طلب تجديد</button>
      </div>

      {showRequest && (
        <div className="portal-modal-overlay"><div className="portal-modal">
          <div className="portal-modal-header"><h2>طلب تجديد وصفة</h2><button onClick={() => setShowRequest(false)}>✕</button></div>
          <form onSubmit={handleRequest} className="portal-form">
            <div className="portal-input-group"><label>اختر الوصفة</label>
              <select value={selectedPrescription} onChange={e => setSelectedPrescription(e.target.value)} required>
                <option value="">-- اختر وصفة نشطة --</option>
                {activeMeds.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.items?.map((i:any)=>i.product?.name).join(', ')} — د. {m.doctor?.fullName}</option>
                ))}
              </select>
            </div>
            <div className="portal-input-group"><label>ملاحظات (اختياري)</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}/></div>
            <button type="submit" className="portal-submit-btn" disabled={submitting}>{submitting ? <Loader2 className="animate-spin" size={18}/> : 'إرسال الطلب'}</button>
          </form>
        </div></div>
      )}

      {loading ? <div className="portal-page-loader"><Loader2 className="animate-spin" size={30}/></div> : refills.length === 0 ? (
        <div className="portal-empty"><Pill size={48}/><p>لا توجد طلبات تجديد</p></div>
      ) : (
        <div className="portal-list">
          {refills.map((r: any) => {
            const st = statusMap[r.status] || { label: r.status, icon: Clock, cls: '' };
            const Icon = st.icon;
            return (
              <div key={r.id} className="portal-list-item">
                <div className="portal-list-item-content">
                  <div className="portal-list-item-top">
                    <span className={`portal-status ${st.cls}`}><Icon size={14}/> {st.label}</span>
                    <span className="portal-list-date">{new Date(r.createdAt).toLocaleDateString('ar-LY')}</span>
                  </div>
                  <h4>{r.prescription?.items?.map((i:any)=>i.product?.name).join(', ')}</h4>
                  <p className="portal-card-sub">د. {r.prescription?.doctor?.fullName}</p>
                  {r.reviewNotes && <p className="portal-list-item-note">ملاحظات المراجع: {r.reviewNotes}</p>}
                  {r.notes && <p className="portal-list-item-note">ملاحظاتك: {r.notes}</p>}
                </div>
                {r.status === 'PENDING' && <button className="portal-danger-btn" onClick={() => handleCancel(r.id)}>إلغاء</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
