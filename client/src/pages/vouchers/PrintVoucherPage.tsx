import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getVoucher, Voucher, VoucherType } from '../../services/vouchersService';
import PrintLayout from '../../components/print/PrintLayout';

export default function PrintVoucherPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      getVoucher(Number(id))
        .then(setVoucher)
        .catch(() => alert('فشل تحميل السند'))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) return <div className="p-8 text-center">جاري التحميل...</div>;
  if (!voucher) return <div className="p-8 text-center text-red-500">سند غير موجود</div>;

  const isReceipt = voucher.type === VoucherType.RECEIPT;
  const title = isReceipt ? 'إذن قبض נقدية' : 'إذن صرف نقدية';
  const subtitle = isReceipt ? 'Receipt Voucher' : 'Payment Voucher';

  return (
    <PrintLayout
      title={title}
      subtitle={subtitle}
      documentId={voucher.code}
    >
      <div className="grid grid-cols-2 gap-8 mb-8 text-lg">
        <div className="flex gap-4 items-center">
          <span className="font-bold text-gray-600 w-24">رقم السند:</span>
          <span className="font-bold text-xl">{voucher.code}</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="font-bold text-gray-600 w-24">التاريخ:</span>
          <span className="font-bold text-xl">{new Date(voucher.date).toLocaleDateString('ar-LY')}</span>
        </div>
        <div className="flex gap-4 items-center border-2 border-gray-300 p-3 rounded bg-gray-50">
          <span className="font-bold text-gray-600 w-24">المبلغ:</span>
          <span className="font-black text-2xl tracking-wide">{Number(voucher.amount).toFixed(3)} د.ل</span>
        </div>
        <div className="flex gap-4 items-center border-2 border-gray-300 p-3 rounded bg-gray-50">
          <span className="font-bold text-gray-600 w-24">رقم المرجع:</span>
          <span className="font-bold text-xl">{voucher.reference || 'لا يوجد'}</span>
        </div>
      </div>

      <div className="border-t-2 border-b-2 border-gray-800 py-8 space-y-6 text-xl leading-relaxed">
        <div className="flex">
          <span className="font-bold text-gray-700 w-48 shrink-0">
            {isReceipt ? 'استلمنا من السيد/ة:' : 'يُصرف للسيد/ة:'}
          </span>
          <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2">{voucher.payeeOrPayer || '-'}</span>
        </div>

        <div className="flex">
          <span className="font-bold text-gray-700 w-48 shrink-0">مبلغاً وقدره:</span>
          <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2">{Number(voucher.amount).toFixed(3)} دينار ليبي فقط لا غير</span>
        </div>

        <div className="flex">
          <span className="font-bold text-gray-700 w-48 shrink-0">وذلك عن (البيان):</span>
          <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2 whitespace-pre-wrap">{voucher.notes || '-'}</span>
        </div>
        
        <div className="grid grid-cols-2 gap-8 pt-4">
          <div className="flex">
              <span className="font-bold text-gray-700 w-32 shrink-0">الصندوق/البنك:</span>
              <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2">{voucher.cashAccount?.name}</span>
          </div>
          <div className="flex">
              <span className="font-bold text-gray-700 w-40 shrink-0">حساب التسوية:</span>
              <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2">{voucher.account?.name}</span>
          </div>
        </div>
      </div>

      <div className="mt-24 grid grid-cols-3 gap-8 text-center">
        <div>
          <div className="w-48 mx-auto border-b-2 border-gray-400 mb-4 h-16 relative">
            <span className="absolute bottom-2 left-0 right-0 text-gray-400 italic font-bold">التوقيع</span>
          </div>
          <p className="font-bold text-gray-700 text-lg">توقيع المستلم</p>
        </div>
        <div>
          <div className="w-48 mx-auto border-b-2 border-gray-400 mb-4 h-16 relative">
            <span className="absolute bottom-2 left-0 right-0 text-gray-400 italic font-bold">التوقيع</span>
            {voucher.createdBy?.fullName && <span className="absolute bottom-6 left-0 right-0 text-gray-800 font-medium text-sm">{voucher.createdBy.fullName}</span>}
          </div>
          <p className="font-bold text-gray-700 text-lg">أعد الدفعة (المحاسب)</p>
        </div>
        <div>
          <div className="w-48 mx-auto border-b-2 border-gray-400 mb-4 h-16 relative">
            <span className="absolute bottom-2 left-0 right-0 text-gray-400 italic font-bold">التوقيع / الختم</span>
          </div>
          <p className="font-bold text-gray-700 text-lg">اعتماد الإدارة</p>
        </div>
      </div>
    </PrintLayout>
  );
}
