// src/pages/clinical/transfers/HandoverNoteModal.tsx
import React, { useState } from 'react';
import { apiClient } from '../../../api/apiClient';
import { toast } from 'sonner';

interface HandoverNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  transferId: number;
  patientName: string;
  onSuccess: () => void;
  existingData?: {
    situation: string;
    background: string;
    assessment: string;
    recommendation: string;
  };
}

export const HandoverNoteModal: React.FC<HandoverNoteModalProps> = ({
  isOpen,
  onClose,
  transferId,
  patientName,
  onSuccess,
  existingData
}) => {
  const [situation, setSituation] = useState(existingData?.situation || '');
  const [background, setBackground] = useState(existingData?.background || '');
  const [assessment, setAssessment] = useState(existingData?.assessment || '');
  const [recommendation, setRecommendation] = useState(existingData?.recommendation || '');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (isSigned: boolean) => {
    if (isSigned && (!situation || !background || !assessment || !recommendation)) {
      toast.error('يجب تعبئة جميع حقول (SBAR) قبل التوقيع الاعتماد.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post(`/transfers/${transferId}/handover`, {
        situation,
        background,
        assessment,
        recommendation,
        isSigned
      });
      toast.success(isSigned ? 'تم توقيع ملاحظات التسليم بنجاح' : 'تم حفظ مسودة ملاحظات التسليم');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || 'فشل حفظ الملاحظات');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-slate-800 shrink-0">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              📝 نموذج تسليم مريض (SBAR Handover)
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              المريض: <span className="text-emerald-400 font-semibold">{patientName}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white mb-auto h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition-colors">✕</button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5 text-sm">
          <div className="bg-rose-900/10 border border-rose-500/20 p-4 rounded-xl">
            <label className="font-semibold text-rose-400 block mb-2 flex items-center gap-2">
              <span>S - Situation (الموقف الحالي)</span>
            </label>
            <textarea 
              rows={2}
              placeholder="وصف موجز للمشكلة الحالية وسبب دخول المريض..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
              value={situation}
              onChange={e => setSituation(e.target.value)}
            />
          </div>
          
          <div className="bg-sky-900/10 border border-sky-500/20 p-4 rounded-xl">
            <label className="font-semibold text-sky-400 block mb-2 flex items-center gap-2">
              <span>B - Background (الخلفية المرضية)</span>
            </label>
            <textarea 
              rows={3}
              placeholder="التاريخ المرضي المحدث، العمليات السابقة، الأدوية، التحاليل..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
              value={background}
              onChange={e => setBackground(e.target.value)}
            />
          </div>

          <div className="bg-amber-900/10 border border-amber-500/20 p-4 rounded-xl">
            <label className="font-semibold text-amber-400 block mb-2 flex items-center gap-2">
              <span>A - Assessment (التقييم)</span>
            </label>
            <textarea 
              rows={3}
              placeholder="تقييمك الطبي الحالي ورأيك بعد الفحص السريري والمؤشرات..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              value={assessment}
              onChange={e => setAssessment(e.target.value)}
            />
          </div>

          <div className="bg-emerald-900/10 border border-emerald-500/20 p-4 rounded-xl">
            <label className="font-semibold text-emerald-400 block mb-2 flex items-center gap-2">
              <span>R - Recommendation (التوصية)</span>
            </label>
            <textarea 
              rows={2}
              placeholder="ما هي الخطوات المطلوبة أو التوصيات للقسم المستقبل؟"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
              value={recommendation}
              onChange={e => setRecommendation(e.target.value)}
            />
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 shrink-0 bg-slate-950 flex gap-3 justify-end rounded-b-2xl">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors"
          >
            إلغاء
          </button>
          
          <button 
            onClick={() => handleSave(false)} 
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-slate-700 text-slate-200 font-medium hover:bg-slate-600 border border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? '...' : '💾 حفظ مسودة'}
          </button>

          <button 
            onClick={() => handleSave(true)} 
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-center min-w-[140px]"
          >
            {submitting ? 'يتم الحفظ...' : '✍️ اعتماد وتوقيع'}
          </button>
        </div>
      </div>
    </div>
  );
};
