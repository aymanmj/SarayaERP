import { useTranslation } from "react-i18next";
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getVoucher, Voucher, VoucherType } from '../../services/vouchersService';
import PrintLayout from '../../components/print/PrintLayout';

export default function PrintVoucherPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const { id } = useParams<{ id: string }>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  if (loading) return <div className="p-8 text-center">{t("accounting.vouchers.print.loading", t("accounting.vouchers.print.loading", "جاري التحميل..."))}</div>;
  if (!voucher) return <div className="p-8 text-center text-red-500">{t("accounting.vouchers.print.documentNotFound", t("accounting.vouchers.print.documentNotFound", "سند غير موجود"))}</div>;

  const isReceipt = voucher.type === VoucherType.RECEIPT;
  const title = isReceipt ? t("accounting.vouchers.print.permissionToCollectQadiya", "إذن قبض נقدية") : t("accounting.vouchers.print.permissionToDisburseCash", "إذن صرف نقدية");
  const subtitle = isReceipt ? 'Receipt Voucher' : 'Payment Voucher';

  return (
    <PrintLayout
      title={title}
      subtitle={subtitle}
      documentId={voucher.code}
    >
      <div className="grid grid-cols-2 gap-8 mb-8 text-lg">
        <div className="flex gap-4 items-center">
          <span className="font-bold text-gray-600 w-24">{t("accounting.vouchers.print.bondNumber", t("accounting.vouchers.print.bondNumber", "رقم السند:"))}</span>
          <span className="font-bold text-xl">{voucher.code}</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="font-bold text-gray-600 w-24">{t("accounting.vouchers.print.theDate", t("accounting.vouchers.print.theDate", "التاريخ:"))}</span>
          <span className="font-bold text-xl">{new Date(voucher.date).toLocaleDateString('ar-LY')}</span>
        </div>
        <div className="flex gap-4 items-center border-2 border-gray-300 p-3 rounded bg-gray-50">
          <span className="font-bold text-gray-600 w-24">{t("accounting.vouchers.print.amount", t("accounting.vouchers.print.amount", "المبلغ:"))}</span>
          <span className="font-black text-2xl tracking-wide">{Number(voucher.amount).toFixed(3)} د.ل</span>
        </div>
        <div className="flex gap-4 items-center border-2 border-gray-300 p-3 rounded bg-gray-50">
          <span className="font-bold text-gray-600 w-24">{t("accounting.vouchers.print.referenceNumber", t("accounting.vouchers.print.referenceNumber", "رقم المرجع:"))}</span>
          <span className="font-bold text-xl">{voucher.reference || t("accounting.vouchers.print.nothing", "لا يوجد")}</span>
        </div>
      </div>

      <div className="border-t-2 border-b-2 border-gray-800 py-8 space-y-6 text-xl leading-relaxed">
        <div className="flex">
          <span className="font-bold text-gray-700 w-48 shrink-0">
            {isReceipt ? t("accounting.vouchers.print.weReceivedFromMrs", "استلمنا من السيد/ة:") : t("accounting.vouchers.print.itIsPaidTo", "يُصرف للسيد/ة:")}
          </span>
          <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2">{voucher.payeeOrPayer || '-'}</span>
        </div>

        <div className="flex">
          <span className="font-bold text-gray-700 w-48 shrink-0">{t("accounting.vouchers.print.anAmountOf", t("accounting.vouchers.print.anAmountOf", "مبلغاً وقدره:"))}</span>
          <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2">{Number(voucher.amount).toFixed(3)} دينار ليبي فقط لا غير</span>
        </div>

        <div className="flex">
          <span className="font-bold text-gray-700 w-48 shrink-0">{t("accounting.vouchers.print.accordingToTheStatement", t("accounting.vouchers.print.accordingToTheStatement", "وذلك عن (البيان):"))}</span>
          <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2 whitespace-pre-wrap">{voucher.notes || '-'}</span>
        </div>
        
        <div className="grid grid-cols-2 gap-8 pt-4">
          <div className="flex">
              <span className="font-bold text-gray-700 w-32 shrink-0">{t("accounting.vouchers.print.fundbank", t("accounting.vouchers.print.fundbank", "الصندوق/البنك:"))}</span>
              <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2">{voucher.cashAccount?.name}</span>
          </div>
          <div className="flex">
              <span className="font-bold text-gray-700 w-40 shrink-0">{t("accounting.vouchers.print.settlementAccount", t("accounting.vouchers.print.settlementAccount", "حساب التسوية:"))}</span>
              <span className="flex-1 border-b border-dashed border-gray-400 font-bold px-2">{voucher.account?.name}</span>
          </div>
        </div>
      </div>

      <div className="mt-24 grid grid-cols-3 gap-8 text-center">
        <div>
          <div className="w-48 mx-auto border-b-2 border-gray-400 mb-4 h-16 relative">
            <span className="absolute bottom-2 left-0 right-0 text-gray-400 italic font-bold">{t("accounting.vouchers.print.theSignature", t("accounting.vouchers.print.theSignature", "التوقيع"))}</span>
          </div>
          <p className="font-bold text-gray-700 text-lg">{t("accounting.vouchers.print.recipientsSignature", t("accounting.vouchers.print.recipientsSignature", "توقيع المستلم"))}</p>
        </div>
        <div>
          <div className="w-48 mx-auto border-b-2 border-gray-400 mb-4 h-16 relative">
            <span className="absolute bottom-2 left-0 right-0 text-gray-400 italic font-bold">{t("accounting.vouchers.print.theSignature", t("accounting.vouchers.print.theSignature", "التوقيع"))}</span>
            {voucher.createdBy?.fullName && <span className="absolute bottom-6 left-0 right-0 text-gray-800 font-medium text-sm">{voucher.createdBy.fullName}</span>}
          </div>
          <p className="font-bold text-gray-700 text-lg">{t("accounting.vouchers.print.prepareThePaymentAccountant", t("accounting.vouchers.print.prepareThePaymentAccountant", "أعد الدفعة (المحاسب)"))}</p>
        </div>
        <div>
          <div className="w-48 mx-auto border-b-2 border-gray-400 mb-4 h-16 relative">
            <span className="absolute bottom-2 left-0 right-0 text-gray-400 italic font-bold">{t("accounting.vouchers.print.signatureseal", t("accounting.vouchers.print.signatureseal", "التوقيع / الختم"))}</span>
          </div>
          <p className="font-bold text-gray-700 text-lg">{t("accounting.vouchers.print.managementApproval", t("accounting.vouchers.print.managementApproval", "اعتماد الإدارة"))}</p>
        </div>
      </div>
    </PrintLayout>
  );
}
