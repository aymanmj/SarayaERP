import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiClient } from '../api/apiClient';

export type LegacyBedTransfer = {
  id: number;
  createdAt: string;
  fromBed: { bedNumber: string };
  toBed: { bedNumber: string };
  requestedUser?: { fullName: string };
  transferReason: string;
  status: string;
};

export function LegacyBedTransfers({ transfers, canApprove, canCancel, activeAdmission, onChanged }: {
  transfers: LegacyBedTransfer[];
  canApprove: boolean;
  canCancel: boolean;
  activeAdmission: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const act = async (transfer: LegacyBedTransfer, action: 'execute' | 'cancel') => {
    if (busy) return;
    if (action === 'execute' && !window.confirm(t('admissions.legacyTransfer.confirm', 'سيتم تحديث موقع المريض وإخلاء سرير المصدر. هل تؤكد تنفيذ النقل الفعلي؟'))) return;
    setBusy(true);
    try {
      const path = action === 'cancel' ? `/admissions/bed-transfer/${transfer.id}/cancel`
        : transfer.status === 'APPROVED' ? `/admissions/bed-transfer/${transfer.id}/complete`
        : `/admissions/transfers/${transfer.id}/approve`;
      await apiClient.post(path);
      await onChanged();
      toast.success(t('admissions.legacyTransfer.saved', 'تم تحديث طلب النقل'));
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message || t('admissions.legacyTransfer.failed', 'تعذر تحديث طلب النقل. أعد تحميل البيانات وحاول مجددًا.'));
    } finally {
      setBusy(false);
    }
  };
  if (!transfers.length) return <p className="p-6">{t('admissions.legacyTransfer.empty', 'لا توجد طلبات نقل أسرّة لهذا الدخول')}</p>;
  return <div className="space-y-3">{transfers.map((transfer) => {
    const pending = ['REQUESTED', 'APPROVED'].includes(transfer.status);
    return <article key={transfer.id} className="rounded-xl border border-slate-700 p-4 space-y-2">
      <p>{transfer.fromBed.bedNumber} → {transfer.toBed.bedNumber}</p>
      <p>{transfer.transferReason}</p>
      <p>{transfer.requestedUser?.fullName} · {t(`admissions.legacyTransfer.status.${transfer.status}`, transfer.status)}</p>
      {pending && <div className="flex gap-3">
        {canApprove && activeAdmission && <button disabled={busy} onClick={() => void act(transfer, 'execute')} className="rounded bg-sky-700 px-4 py-2 disabled:opacity-50">{t('admissions.legacyTransfer.execute', 'اعتماد وتنفيذ النقل')}</button>}
        {canCancel && <button disabled={busy} onClick={() => void act(transfer, 'cancel')} className="rounded bg-slate-700 px-4 py-2 disabled:opacity-50">{t('admissions.legacyTransfer.cancel', 'إلغاء طلب النقل')}</button>}
      </div>}
    </article>;
  })}</div>;
}
