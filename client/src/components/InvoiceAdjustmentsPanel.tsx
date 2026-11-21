import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '../api/apiClient';
import { useAuthStore } from '../stores/authStore';
import { Money } from '../utils/money';

type Adjustment = { id: number; chargeId: number; status: string; kind: string; previousAmount: string; correctedAmount: string; delta: string; insuranceDelta?: string; insuranceOnly?: boolean; partialDispense?: boolean; reason: string; requestedById: number; reviewedById: number | null; reviewReason: string | null; postingEntryId: number | null; snapshot?: { closureReason?: string } };
type AdjustmentData = { items: Adjustment[]; lines: { id: number; totalAmount: string; serviceItem: { name: string } }[]; prescriptionId?: number | null; originalPrescriptionInvoiceId?: number | null; replacementPrescriptionInvoiceId?: number | null; eligible: boolean; eligibleInsuranceCredit?: boolean; insuranceNetCollected?: string | null; claimWithdrawn?: boolean; effectivePatientShare: string; insuredPrescription?: boolean; effectiveInsuranceShare?: string; amountDue: string; patientCredit: string;
  partialDispenseQuote?: { correctedAmount: string; patientShare: string; insurerShare: string; closureReason: string } | null;
};

export function InvoiceAdjustmentsPanel({ invoiceId, onChanged }: { invoiceId: number; onChanged: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const full = !!user?.roles.includes('ADMIN') || !!user?.permissions.includes('ADMIN_FULL_ACCESS');
  const canRequest = full || !!user?.permissions.includes('billing:adjustments:request');
  const canApprove = full || !!user?.permissions.includes('billing:adjustments:approve');
  const [chargeId, setChargeId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const path = `/billing/invoices/${invoiceId}/adjustments`;
  const query = useQuery({ queryKey: ['invoice-adjustments', invoiceId], queryFn: async () => (await apiClient.get<AdjustmentData>(path)).data });
  const prescriptionId = query.data?.prescriptionId;
  const selectedCharge = prescriptionId == null ? chargeId : query.data?.lines[0]?.id;
  const insuranceOnly = query.data?.eligibleInsuranceCredit === true;
  const partial = query.data?.partialDispenseQuote;
  const mutation = useMutation({
    mutationFn: async (action: { type: 'request' | 'approve' | 'reject' | 'cancel'; id?: number }) => {
      if (action.type === 'request') return apiClient.post(path, {
        chargeId: Number(selectedCharge),
        correctedAmount: partial?.correctedAmount ?? (insuranceOnly || prescriptionId == null ? amount : '0.000'),
        reason,
        requestId,
        ...(insuranceOnly && { insuranceOnly: true }),
        ...(partial && { partialDispense: true }),
      });
      return apiClient.post(`${path}/${action.id}/${action.type}`, { reason: reviewReason });
    },
    onSuccess: async () => {
      setRequestId(crypto.randomUUID());
      await Promise.all([
        client.invalidateQueries({ queryKey: ['invoice-adjustments', invoiceId] }),
        client.invalidateQueries({ queryKey: ['invoice-refunds', invoiceId] }),
      ]);
      onChanged();
      toast.success(t('invoiceAdjustments.saved', 'تم حفظ إجراء التسوية'));
    },
    onError: (error: unknown) => { const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message; toast.error(message || t('invoiceAdjustments.failed', 'تعذر حفظ التسوية؛ راجع البيانات وحاول مجددًا')); },
  });
  const resetKey = () => setRequestId(crypto.randomUUID());
  if (query.isPending) return <p>{t('invoiceAdjustments.loading', 'جارٍ تحميل التسويات...')}</p>;
  if (query.isError || !query.data) return <div role="alert">{t('invoiceAdjustments.loadFailed', 'تعذر تحميل التسويات')} <button onClick={() => void query.refetch()}>{t('invoiceAdjustments.retry', 'إعادة المحاولة')}</button></div>;
  const data = query.data;
  const busy = mutation.isPending;
  const hasPartialClosure = partial || data.items.some((item) => item.partialDispense);
  const validAmount = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(amount);
  const validCredit = validAmount && Money.decimal(amount).lt(data.effectiveInsuranceShare ?? '0') &&
    Money.decimal(amount).gte(data.insuranceNetCollected ?? '0') &&
    (!data.claimWithdrawn || Money.decimal(amount).isZero());
  return <section className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
    <h2 className="text-lg font-bold">{prescriptionId == null ? t('invoiceAdjustments.title') : t('invoiceAdjustments.prescriptionTitle', { id: prescriptionId })}</h2>
    {data.originalPrescriptionInvoiceId != null && (
      <Link className="block text-sky-300 underline" to={`/billing/invoices/${data.originalPrescriptionInvoiceId}`}>
        {t('invoiceAdjustments.originalPrescriptionInvoice', { id: data.originalPrescriptionInvoiceId })}
      </Link>
    )}
    {data.replacementPrescriptionInvoiceId != null && (
      <Link className="block text-sky-300 underline" to={`/billing/invoices/${data.replacementPrescriptionInvoiceId}`}>
        {t('invoiceAdjustments.replacementPrescriptionInvoice', { id: data.replacementPrescriptionInvoiceId })}
      </Link>
    )}
    <p className="text-sm text-slate-400">{hasPartialClosure ? t('invoiceAdjustments.partialDispenseScope') : data.insuranceNetCollected != null ? t('invoiceAdjustments.insuranceCreditScope') : prescriptionId == null ? t('invoiceAdjustments.scope') : data.insuredPrescription ? t('invoiceAdjustments.insuredPrescriptionScope') : t('invoiceAdjustments.prescriptionScope')}</p>
    <p>{t('invoiceAdjustments.due', 'المستحق بعد التسويات')}: {data.amountDue} LYD</p>
    <p>{t('invoiceAdjustments.credit', 'رصيد مستحق للمريض — دون افتراض استرداده')}: {data.patientCredit} LYD</p>
    {data.insuredPrescription && <p>{t('invoiceAdjustments.insurerDue')}: {data.effectiveInsuranceShare} LYD</p>}
    {data.insuranceNetCollected != null && <p>{t('invoiceAdjustments.insuranceCollected')} <bdi>{data.insuranceNetCollected}</bdi> LYD</p>}
    {partial && <div className="space-y-1 text-sm">
      <p>{t('invoiceAdjustments.partialQuote', partial)}</p>
      <p>{t('pharmacy.partialClosureReason')} <bdi>{partial.closureReason}</bdi></p>
    </div>}
    {canRequest && (data.eligible || insuranceOnly || partial) && <form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); if (selectedCharge && reason.trim().length >= 5 && (!insuranceOnly || validCredit)) mutation.mutate({ type: 'request' }); }}>
      {prescriptionId == null && <>
        <label>{t('invoiceAdjustments.line', 'البند الأصلي')}<select required value={chargeId} onChange={(event) => { setChargeId(event.target.value); resetKey(); }} className="block bg-slate-800 p-2"><option value="">—</option>{data.lines.map((line) => <option key={line.id} value={line.id}>{line.serviceItem.name} · #{line.id} · {line.totalAmount}</option>)}</select></label>
        <label>{t('invoiceAdjustments.amount', 'المبلغ الصحيح للبند')}<input required inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); resetKey(); }} className="block bg-slate-800 p-2" /></label>
      </>}
      {insuranceOnly && <label>{t('invoiceAdjustments.correctedInsuranceShare')}
        <input required inputMode="decimal" dir="ltr" value={amount} onChange={(event) => { setAmount(event.target.value); resetKey(); }} className="block bg-slate-800 p-2" />
      </label>}
      <label>{t('invoiceAdjustments.reason', 'سبب التصحيح')}<input required minLength={5} maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); resetKey(); }} className="block bg-slate-800 p-2" /></label>
      <button disabled={busy || !selectedCharge || (insuranceOnly ? !validCredit : prescriptionId == null && !validAmount) || reason.trim().length < 5} className="rounded bg-sky-700 p-2 disabled:opacity-50">{partial ? t('invoiceAdjustments.requestPartialCredit') : insuranceOnly ? t('invoiceAdjustments.requestInsuranceCredit') : prescriptionId == null ? t('invoiceAdjustments.request', 'إرسال طلب التصحيح') : t('invoiceAdjustments.requestPrescriptionCancellation')}</button>
    </form>}
    {!data.eligible && !insuranceOnly && !hasPartialClosure && <p>{t('invoiceAdjustments.ineligible', 'هذه الفاتورة تحتاج مراجعة أصل البنود أو نطاق التسوية قبل طلب التصحيح.')}</p>}
    {(canRequest || canApprove) && <label className="block">{t('invoiceAdjustments.reviewReason', 'سبب الاعتماد أو الرفض أو الإلغاء')}<input minLength={5} maxLength={1000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} className="block bg-slate-800 p-2 w-full" /></label>}
    {!data.items.length && <p>{t('invoiceAdjustments.empty', 'لا توجد طلبات تسوية')}</p>}
    {data.items.map((item) => <article key={item.id} className="rounded border border-slate-700 p-3 space-y-2">
      <p>#{item.id} · {item.insuranceOnly ? t('invoiceAdjustments.insuranceCredit') : t(`invoiceAdjustments.kind.${item.kind}`, item.kind)} · {t(`invoiceAdjustments.status.${item.status}`, item.status)}</p>
      <p>{item.previousAmount} → {item.correctedAmount} LYD {!data.insuredPrescription && `(${item.delta})`}</p>
      {data.insuredPrescription && <p>{t('invoiceAdjustments.patientAdjustment')} <bdi>{item.delta}</bdi> LYD · {t('invoiceAdjustments.insurerAdjustment')} <bdi>{item.insuranceDelta}</bdi> LYD</p>}
      {item.partialDispense && item.snapshot?.closureReason && <p>{t('pharmacy.partialClosureReason')} <bdi>{item.snapshot.closureReason}</bdi></p>}
      <p>{item.reason}</p>{item.reviewReason && <p>{item.reviewReason}</p>}
      {item.postingEntryId && <p>{t('invoiceAdjustments.entry', 'القيد المحاسبي')}: #{item.postingEntryId}</p>}
      {item.status === 'PENDING' && <div className="flex gap-3">
        {canApprove && user?.id !== item.requestedById && <><button disabled={busy || reviewReason.trim().length < 5} onClick={() => { if (window.confirm(t('invoiceAdjustments.confirm', 'سيتم ترحيل إشعار مالي وقيد محاسبي دون تغيير أصل الفاتورة. هل تؤكد الاعتماد؟'))) mutation.mutate({ type: 'approve', id: item.id }); }}>{t('invoiceAdjustments.approve', 'اعتماد وترحيل')}</button><button disabled={busy || reviewReason.trim().length < 5} onClick={() => mutation.mutate({ type: 'reject', id: item.id })}>{t('invoiceAdjustments.reject', 'رفض الطلب')}</button></>}
        {canRequest && user?.id === item.requestedById && <button disabled={busy || reviewReason.trim().length < 5} onClick={() => mutation.mutate({ type: 'cancel', id: item.id })}>{t('invoiceAdjustments.cancel', 'إلغاء طلبي')}</button>}
      </div>}
    </article>)}
  </section>;
}
