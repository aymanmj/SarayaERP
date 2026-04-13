import React, { useState, useEffect } from 'react';
import { Plus, Search, Check, X, Printer, Edit } from 'lucide-react';
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
    <div className="p-6" dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">أذونات الصرف والقبض</h1>
          <p className="text-gray-500">إدارة السندات المالية والقيود المرتبطة بها</p>
        </div>
        <button
          onClick={() => { setEditingVoucher(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition"
        >
          <Plus className="h-5 w-5" />
          سند جديد
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab(VoucherType.PAYMENT)}
            className={`flex-1 py-4 text-center font-medium ${tab === VoucherType.PAYMENT ? 'border-b-2 border-primary-500 text-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700'}`}
          >
            أذونات الصرف (Payments)
          </button>
          <button
            onClick={() => setTab(VoucherType.RECEIPT)}
            className={`flex-1 py-4 text-center font-medium ${tab === VoucherType.RECEIPT ? 'border-b-2 border-primary-500 text-primary-600 bg-primary-50' : 'text-gray-500 hover:text-gray-700'}`}
          >
            أذونات القبض (Receipts)
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-500">جاري التحميل...</div>
        ) : vouchers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">لا توجد سندات في هذا القسم</div>
        ) : (
          <table className="w-full text-right">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th className="py-3 px-4">رقم السند</th>
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">اسم الحساب المقابل</th>
                <th className="py-3 px-4">المستفيد / الدافع</th>
                <th className="py-3 px-4">المبلغ</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4 w-32 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map(v => (
                <tr key={v.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">{v.code || 'مسودة'}</td>
                  <td className="py-3 px-4">{new Date(v.date).toLocaleDateString('ar-LY')}</td>
                  <td className="py-3 px-4">{v.account?.name}</td>
                  <td className="py-3 px-4">{v.payeeOrPayer || '-'}</td>
                  <td className="py-3 px-4 font-bold text-gray-900">{Number(v.amount).toFixed(3)}</td>
                  <td className="py-3 px-4">
                    {v.status === VoucherStatus.DRAFT && <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs">مسودة</span>}
                    {v.status === VoucherStatus.POSTED && <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs">مُرَحّل</span>}
                    {v.status === VoucherStatus.CANCELLED && <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs">ملغي</span>}
                  </td>
                  <td className="py-3 px-4 flex items-center justify-center gap-2">
                    {v.status === VoucherStatus.DRAFT && (
                      <>
                        <button onClick={() => { setEditingVoucher(v); setIsModalOpen(true); }} className="text-gray-500 hover:text-blue-600" title="تعديل">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => handlePost(v.id)} className="text-gray-500 hover:text-green-600" title="ترحيل القيد">
                          <Check className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {v.status === VoucherStatus.POSTED && (
                      <>
                        <button onClick={() => navigate(`/accounting/vouchers/${v.id}/print`)} className="text-gray-500 hover:text-gray-800" title="طباعة">
                          <Printer className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleCancel(v.id)} className="text-gray-500 hover:text-red-600" title="إلغاء">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
