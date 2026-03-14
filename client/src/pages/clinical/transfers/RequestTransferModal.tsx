import React, { useState } from 'react';
import { apiClient } from '../../../api/apiClient';
import { toast } from 'sonner';

interface RequestTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  encounterId: number;
  patientName: string;
  fromBedId: number | null;
  onSuccess: () => void;
}

export const RequestTransferModal: React.FC<RequestTransferModalProps> = ({
  isOpen,
  onClose,
  encounterId,
  patientName,
  fromBedId,
  onSuccess
}) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error('يجب كتابة سبب النقل');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/transfers/request', {
        encounterId,
        fromBedId,
        reason,
        notes
      });
      toast.success('تم إرسال طلب النقل إلى العناية/القسم بنجاح');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || 'فشل إرسال طلب النقل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            🚑 طلب نقل مريض (Transfer Request)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        
        <p className="text-sm text-slate-300 mb-6">
          المريض: <span className="text-sky-400 font-semibold">{patientName}</span>
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">سبب النقل (إلزامي) <span className="text-rose-500">*</span></label>
            <input 
              type="text" 
              placeholder="مثال: تدهور في الوعي، حاجة لتنفس صناعي..." 
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1">ملاحظات إضافية (اختياري)</label>
            <textarea 
              rows={3}
              placeholder="أي ملاحظات تفيد فريق العناية/القسم المستقبل..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-8">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors"
          >
            إلغاء
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-sky-600 text-white font-medium hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-900/20 transition-all flex items-center justify-center min-w-[120px]"
          >
            {submitting ? 'يتم الإرسال...' : 'إرسال الطلب'}
          </button>
        </div>
      </div>
    </div>
  );
};
