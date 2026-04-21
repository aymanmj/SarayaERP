import { useEffect, useState } from 'react';
import { portalApi } from '../../api/portalApi';
import { CreditCard, Loader2 } from 'lucide-react';

export default function PortalInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      portalApi.get('/financial/invoices').then(r => setInvoices(r.data?.items || r.data || [])),
      portalApi.get('/financial/balance').then(r => setBalance(r.data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const statusMap: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: 'مسودة', cls: 'status-pending' },
    ISSUED: { label: 'صادرة', cls: 'status-active' },
    PARTIALLY_PAID: { label: 'مدفوعة جزئياً', cls: 'status-pending' },
    PAID: { label: 'مدفوعة', cls: 'status-completed' },
    CANCELLED: { label: 'ملغاة', cls: 'status-cancelled' },
  };

  return (
    <div className="portal-page">
      <div className="portal-page-header"><h1><CreditCard size={28}/> الفواتير والمدفوعات</h1></div>

      {balance && (
        <div className="portal-balance-card">
          <div><span>الرصيد المستحق</span><h2>{balance.totalOutstanding?.toFixed(3)} {balance.currency}</h2></div>
          <span>{balance.invoiceCount} فواتير</span>
        </div>
      )}

      {loading ? <div className="portal-page-loader"><Loader2 className="animate-spin" size={30}/></div> : invoices.length === 0 ? (
        <div className="portal-empty"><CreditCard size={48}/><p>لا توجد فواتير</p></div>
      ) : (
        <div className="portal-list">
          {invoices.map((inv: any) => {
            const st = statusMap[inv.status] || { label: inv.status, cls: '' };
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
