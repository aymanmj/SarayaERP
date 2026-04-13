import React, { useState, useEffect } from 'react';
import { Plus, Check, X, Printer, Edit } from 'lucide-react';
import { getVouchers, createVoucher, updateVoucher, postVoucher, cancelVoucher, Voucher, VoucherType, VoucherStatus } from '../../services/vouchersService';
import VoucherModal from '../../components/vouchers/VoucherModal';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function VouchersListPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<VoucherType>(VoucherType.PAYMENT);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const navigate = useNavigate();

  const fetchVouchers = async () => {
    try {
      setLoading(true);
      const data = await getVouchers({ type: tab });
      setVouchers(data || []);
    } catch (error) {
      toast.error('فشل تحميل السندات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVouchers();
  }, [tab]);

  const handleSaveVoucher = async (data: any) => {
    try {
      if (editingVoucher) {
        await updateVoucher(editingVoucher.id, data);
        toast.success('تم التحديث بنجاح');
      } else {
        await createVoucher(data);
        toast.success('تم حفظ المسودة بنجاح');
      }
      fetchVouchers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء الحفظ');
    }
  };

  const handlePost = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من ترحيل السند؟ لا يمكن تعديله بعد الترحيل، وسيتم تسجيل القيد المحاسبي.')) return;
    try {
      await postVoucher(id);
      toast.success('تم الترحيل بنجاح');
      fetchVouchers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل الترحيل');
    }
  };

  const handleCancel = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من إلغاء هذا السند المُرَحّل؟')) return;
    try {
      await cancelVoucher(id);
      toast.success('تم الإلغاء');
      fetchVouchers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل الإلغاء');
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 text-slate-100">أذونات الصرف والقبض</h1>
          <p className="text-sm text-slate-400">إدارة السندات المالية والقيود المرتبطة بها</p>
        </div>
        <button
          onClick={() => { setEditingVoucher(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-sm text-white transition"
        >
          <Plus className="h-5 w-5" />
          سند جديد
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setTab(VoucherType.PAYMENT)}
            className={`flex-1 py-4 text-center text-sm font-medium transition-colors ${tab === VoucherType.PAYMENT ? 'border-b-2 border-sky-500 text-sky-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
          >
            أذونات الصرف (Payments)
          </button>
          <button
            onClick={() => setTab(VoucherType.RECEIPT)}
            className={`flex-1 py-4 text-center text-sm font-medium transition-colors ${tab === VoucherType.RECEIPT ? 'border-b-2 border-sky-500 text-sky-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
          >
            أذونات القبض (Receipts)
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-8 text-center text-slate-500">جاري التحميل...</div>
        ) : vouchers.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center text-slate-500">
             <p className="mt-4">لا توجد سندات في هذا القسم</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-800/50 border-b border-slate-800 text-slate-400 font-medium whitespace-nowrap">
                <tr>
                  <th className="py-4 px-5">رقم السند</th>
                  <th className="py-4 px-5">التاريخ</th>
                  <th className="py-4 px-5">اسم الحساب المقابل</th>
                  <th className="py-4 px-5">المستفيد / الدافع</th>
                  <th className="py-4 px-5">المبلغ</th>
                  <th className="py-4 px-5">الحالة</th>
                  <th className="py-4 px-5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {vouchers.map((v, i) => (
                  <tr key={v.id} className={`${i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/60'} hover:bg-slate-800/80 transition-colors`}>
                    <td className="py-4 px-5 font-mono text-sky-300">{v.code || 'مسودة'}</td>
                    <td className="py-4 px-5 text-slate-300">{new Date(v.date).toLocaleDateString('ar-LY')}</td>
                    <td className="py-4 px-5 text-slate-200">{v.account?.name}</td>
                    <td className="py-4 px-5 text-slate-300">{v.payeeOrPayer || '-'}</td>
                    <td className="py-4 px-5 font-bold text-amber-100">{Number(v.amount).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} د.ل</td>
                    <td className="py-4 px-5">
                      {v.status === VoucherStatus.DRAFT && <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md text-xs border border-slate-700">مسودة</span>}
                      {v.status === VoucherStatus.POSTED && <span className="bg-emerald-900/30 text-emerald-400 px-2.5 py-1 rounded-md text-xs border border-emerald-800/50">مُرَحّل</span>}
                      {v.status === VoucherStatus.CANCELLED && <span className="bg-rose-900/30 text-rose-400 px-2.5 py-1 rounded-md text-xs border border-rose-800/50">ملغي</span>}
                    </td>
                    <td className="py-4 px-5 flex items-center justify-center gap-3">
                      {v.status === VoucherStatus.DRAFT && (
                        <>
                          <button onClick={() => { setEditingVoucher(v); setIsModalOpen(true); }} className="text-sky-400 hover:text-sky-300 p-2 hover:bg-sky-500/10 rounded" title="تعديل">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button onClick={() => handlePost(v.id)} className="text-emerald-400 hover:text-emerald-300 p-2 hover:bg-emerald-500/10 rounded" title="ترحيل القيد">
                            <Check className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {v.status === VoucherStatus.POSTED && (
                        <>
                          <button onClick={() => navigate(`/accounting/vouchers/${v.id}/print`)} className="text-slate-300 hover:text-white p-2 hover:bg-slate-700 rounded" title="طباعة">
                            <Printer className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleCancel(v.id)} className="text-rose-400 hover:text-rose-300 p-2 hover:bg-rose-500/10 rounded" title="إلغاء">
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <VoucherModal
          isOpen={isModalOpen}
          initialData={editingVoucher}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveVoucher}
        />
      )}
    </div>
  );
}
