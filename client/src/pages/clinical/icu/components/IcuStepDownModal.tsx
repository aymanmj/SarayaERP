import React, { useState, useEffect } from 'react';
import { apiClient } from '../../../../api/apiClient';
import { ArrowLeftRight, Bed, CheckCircle2, Activity, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  encounterId: number;
  patientName: string;
  fromBedId?: number;
  currentWardName?: string;
  currentBedNumber?: string;
  onSuccess: () => void;
}

/**
 * ICU Step-Down Modal
 * ───────────────────
 * Allows transferring a patient from ICU to a regular inpatient ward
 * in a single streamlined flow:
 *   1. Select target ward → bed
 *   2. Enter clinical reason
 *   3. System chains: requestTransfer → allocateBed → confirmArrival
 */
export const IcuStepDownModal = ({ isOpen, onClose, encounterId, patientName, fromBedId, currentWardName, currentBedNumber, onSuccess }: Props) => {
  const [step, setStep] = useState<'form' | 'processing' | 'done' | 'error'>('form');
  const [wardTree, setWardTree] = useState<any[]>([]);
  const [selectedBedId, setSelectedBedId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchWards();
      setStep('form');
      setSelectedBedId('');
      setReason('');
      setNotes('');
      setErrorMsg('');
    }
  }, [isOpen]);

  const fetchWards = async () => {
    try {
      const res = await apiClient.get('/beds/tree');
      // Filter OUT ICU wards — we only want regular inpatient wards
      const regularWards = res.data.filter((w: any) =>
        w.type !== 'ICU' && !w.name.includes('عناية') && !w.name.includes('ICU')
      );
      setWardTree(regularWards);
    } catch (err) {
      console.error(err);
    }
  };

  const availableBeds = wardTree.flatMap(w =>
    w.rooms.flatMap((r: any) =>
      r.beds
        .filter((b: any) => b.status === 'AVAILABLE')
        .map((b: any) => ({
          id: b.id,
          label: `${w.name} — سرير ${b.bedNumber}${r.roomNumber ? ` (غرفة ${r.roomNumber})` : ''}`
        }))
    )
  );

  const handleStepDown = async () => {
    if (!reason.trim()) return alert('يجب إدخال سبب النقل');
    if (!selectedBedId) return alert('يجب اختيار سرير في القسم المستقبل');

    setStep('processing');
    try {
      // Step 1: Create transfer request
      setStatusText('إنشاء طلب النقل...');
      const transferRes = await apiClient.post('/transfers/request', {
        encounterId,
        fromBedId,
        reason,
        notes
      });
      const transferId = transferRes.data.id;

      // Step 2: Allocate the target bed
      setStatusText('تخصيص السرير في القسم الجديد...');
      await apiClient.patch(`/transfers/${transferId}/allocate`, {
        toBedId: Number(selectedBedId)
      });

      // Step 3: Confirm arrival (complete transfer)
      setStatusText('تأكيد النقل وتحديث السجلات...');
      await apiClient.patch(`/transfers/${transferId}/arrive`);

      setStep('done');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.response?.data?.message || 'فشلت عملية النقل. يرجى المحاولة مرة أخرى.');
      setStep('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4" dir="rtl">
      <div className="bg-slate-900 border border-slate-700 max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950">
          <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-amber-400" /> نقل المريض من العناية (Step-down)
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition text-xl">✕</button>
        </div>

        {/* FORM STATE */}
        {step === 'form' && (
          <div className="p-6 space-y-5">
            {/* Patient info banner */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center text-xl font-black shrink-0">
                {patientName?.charAt(0) || '?'}
              </div>
              <div>
                <p className="font-bold text-white text-sm">{patientName}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  الموقع الحالي: {currentWardName || 'العناية المركزة'} — سرير {currentBedNumber || 'N/A'}
                </p>
              </div>
            </div>

            {/* Target bed selection */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">
                <Bed className="w-4 h-4 inline-block ml-1 text-emerald-400" />
                اختر السرير في القسم المستقبل <span className="text-rose-400">*</span>
              </label>
              {availableBeds.length === 0 ? (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-xl text-sm flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  لا توجد أسرّة متاحة في الأقسام العادية حالياً.
                </div>
              ) : (
                <select
                  value={selectedBedId}
                  onChange={e => setSelectedBedId(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-emerald-500 transition text-sm"
                >
                  <option value="">— اختر السرير —</option>
                  {availableBeds.map(b => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">سبب النقل <span className="text-rose-400">*</span></label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="مثال: استقرار الحالة، إمكانية التنفس التلقائي..."
                className="w-full p-3 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-amber-500 transition text-sm"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">ملاحظات إضافية (اختياري)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="تعليمات للقسم المستقبل..."
                className="w-full p-3 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-amber-500 transition text-sm resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-3 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition text-sm">إلغاء</button>
              <button
                onClick={handleStepDown}
                disabled={!selectedBedId || !reason.trim()}
                className="flex-[2] py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-amber-900/30 transition flex items-center justify-center gap-2 text-sm"
              >
                <ArrowLeftRight className="w-4 h-4" /> تنفيذ النقل
              </button>
            </div>
          </div>
        )}

        {/* PROCESSING STATE */}
        {step === 'processing' && (
          <div className="p-12 flex flex-col items-center justify-center gap-4">
            <Activity className="w-12 h-12 text-amber-400 animate-spin" />
            <p className="text-white font-bold text-sm">{statusText}</p>
            <p className="text-slate-500 text-xs">الرجاء الانتظار...</p>
          </div>
        )}

        {/* SUCCESS STATE */}
        {step === 'done' && (
          <div className="p-12 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-white font-bold text-lg">تم النقل بنجاح ✓</p>
            <p className="text-slate-400 text-sm text-center leading-relaxed">
              تم نقل المريض <span className="text-sky-400 font-semibold">{patientName}</span> من العناية المركزة إلى القسم الجديد بنجاح.
              <br />تم تحديث السرير والسجلات تلقائياً.
            </p>
            <button
              onClick={() => { onClose(); onSuccess(); }}
              className="mt-4 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-900/30 transition text-sm"
            >
              العودة للوحة العناية
            </button>
          </div>
        )}

        {/* ERROR STATE */}
        {step === 'error' && (
          <div className="p-12 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/15 border-2 border-rose-500/40 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-rose-400" />
            </div>
            <p className="text-white font-bold text-lg">فشلت العملية</p>
            <p className="text-slate-400 text-sm text-center">{errorMsg}</p>
            <div className="flex gap-3 mt-4">
              <button onClick={onClose} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition text-sm">إغلاق</button>
              <button onClick={() => setStep('form')} className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition text-sm">المحاولة مرة أخرى</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
