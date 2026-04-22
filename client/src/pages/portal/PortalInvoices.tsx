import { useEffect, useState } from 'react';
import { portalApi } from '../../api/portalApi';
import { CreditCard, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

export default function PortalInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Payment Modal State
  const [showPayment, setShowPayment] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | string>('');
  const [paymentMethod, setPaymentMethod] = useState('CREDIT_CARD');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const fetchFinancials = () => {
    setLoading(true);
    Promise.all([
      portalApi.get('/financial/invoices').then(r => setInvoices(r.data?.items || r.data || [])),
      portalApi.get('/financial/balance').then(r => setBalance(r.data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchFinancials(); }, []);

  const openPaymentModal = (invoice: any) => {
    setSelectedInvoice(invoice);
    const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    setPaymentAmount(remaining);
    setShowPayment(true);
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || !paymentAmount) return;

    setSubmittingPayment(true);
    try {
      await portalApi.post(`/financial/pay/${selectedInvoice.id}`, {
        amount: Number(paymentAmount),
        paymentMethod,
      });
      toast.success('تمت عملية الدفع بنجاح');
      setShowPayment(false);
      fetchFinancials();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشلت عملية الدفع');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const statusMap: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: 'مسودة', cls: 'status-pending' },
    ISSUED: { label: 'صادرة', cls: 'status-active' },
    PARTIALLY_PAID: { label: 'مدفوعة جزئياً', cls: 'status-pending' },
    PAID: { label: 'مدفوعة', cls: 'status-completed' },
    CANCELLED: { label: 'ملغاة', cls: 'status-cancelled' },
  };

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <h1><CreditCard size={28}/> الفواتير والمدفوعات</h1>
      </div>

      {balance && (
        <div className="portal-balance-card">
          <div>
            <span>الرصيد المستحق</span>
            <h2>{balance.totalOutstanding?.toFixed(3)} {balance.currency}</h2>
          </div>
          <span>{balance.invoiceCount} فواتير</span>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && selectedInvoice && (
        <div className="portal-modal-overlay">
          <div className="portal-modal" style={{ maxWidth: '400px' }}>
            <div className="portal-modal-header">
              <h2>دفع الفاتورة</h2>
              <button onClick={() => setShowPayment(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handlePay} className="portal-form">
              <div className="portal-input-group">
                <label>رقم الفاتورة</label>
                <input type="text" value={`#${selectedInvoice.id}`} disabled />
              </div>
              <div className="portal-input-group">
                <label>المبلغ المراد دفعه</label>
                <input 
                  type="number" 
                  step="0.001"
                  max={Number(selectedInvoice.totalAmount) - Number(selectedInvoice.paidAmount)}
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  required 
                />
              </div>
              <div className="portal-input-group">
                <label>طريقة الدفع</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="CREDIT_CARD">بطاقة ائتمان (Credit Card)</option>
                  <option value="WALLET">محفظة إلكترونية (E-Wallet)</option>
                </select>
              </div>
              <button type="submit" className="portal-submit-btn mt-4" disabled={submittingPayment}>
                {submittingPayment ? <Loader2 className="animate-spin" size={18} /> : 'دفع الآن'}
              </button>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="portal-page-loader"><Loader2 className="animate-spin" size={30}/></div>
      ) : invoices.length === 0 ? (
        <div className="portal-empty"><CreditCard size={48}/><p>لا توجد فواتير</p></div>
      ) : (
        <div className="portal-list">
          {invoices.map((inv: any) => {
            const st = statusMap[inv.status] || { label: inv.status, cls: '' };
            const canPay = ['ISSUED', 'PARTIALLY_PAID'].includes(inv.status);
            
            return (
              <div key={inv.id} className="portal-list-item">
                <div className="portal-list-item-content">
                  <div className="portal-list-item-top">
                    <span className={`portal-status ${st.cls}`}>{st.label}</span>
                    <span className="portal-list-date">{new Date(inv.createdAt).toLocaleDateString('ar-LY')}</span>
                  </div>
                  <div className="portal-invoice-amounts">
                    <span>الإجمالي: <strong>{Number(inv.totalAmount).toFixed(3)} {inv.currency}</strong></span>
                    <span>المدفوع: <strong>{Number(inv.paidAmount).toFixed(3)} {inv.currency}</strong></span>
                  </div>
                </div>
                {canPay && (
                  <button className="portal-primary-btn" style={{ padding: '0.5rem 1rem' }} onClick={() => openPaymentModal(inv)}>
                    دفع الآن
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
