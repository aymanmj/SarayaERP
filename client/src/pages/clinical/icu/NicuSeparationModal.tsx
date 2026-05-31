// src/pages/clinical/icu/NicuSeparationModal.tsx
import React, { useState } from 'react';
import { apiClient } from '../../../api/apiClient';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface NicuSeparationModalProps {
  isOpen: boolean;
  onClose: () => void;
  motherPatientId: number;
  motherName: string;
  onSuccess: () => void;
}

export const NicuSeparationModal: React.FC<NicuSeparationModalProps> = ({
  isOpen,
  onClose,
  motherPatientId,
  motherName,
  onSuccess
}) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSeparate = async () => {
    setSubmitting(true);
    try {
      const res = await apiClient.post(`/icu/nicu/separate/${motherPatientId}`, {});
      toast.success(t('icu.nicu.success', `تم فتح ملف مستقل للمولود بنجاح برقم: {{mrn}}`, { mrn: res.data.mrn }));
      onSuccess();
      onClose();
     
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || t('icu.nicu.failed', 'فشل عملية فصل ملف المولود'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 backdrop-blur-sm" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            {t('icu.nicu.title', '🍼 فتح ملف طبي منفصل لمولود (NICU Separation)')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white mb-auto h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition-colors">✕</button>
        </div>
        
        <div className="bg-pink-900/10 border border-pink-500/20 p-4 rounded-xl mb-6">
          <p className="text-sm text-slate-300 leading-relaxed">
            {t('icu.nicu.description', 'سيتم إنشاء ملف طبي جديد للمولود وربطه بالأم:')} <span className="font-bold text-pink-400">{motherName}</span>.
          </p>
          <ul className="text-xs text-slate-400 mt-2 list-disc list-inside space-y-1">
            <li>{t('icu.nicu.insuranceCopy', 'سيتم نسخ معلومات التأمين من ملف الأم تلقائياً (إن وجدت).')}</li>
            <li>{t('icu.nicu.guarantorFallback', 'إذا لم يكن هناك تأمين، سيتم تعيين الأم كضامن مالي للمولود.')}</li>
            <li>{t('icu.nicu.mrnInfo', 'رقم الملف الطبي سينشأ تلقائياً ويبدأ بـ NB (Newborn).')}</li>
          </ul>
        </div>

        <div className="flex gap-3 justify-end mt-4">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors"
          >
            {t('icu.nicu.cancel', 'إلغاء')}
          </button>
          
          <button 
            onClick={handleSeparate} 
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-900/20 transition-all flex items-center justify-center min-w-[140px]"
          >
            {submitting ? t('icu.nicu.creating', 'يتم الإنشاء...') : t('icu.nicu.confirm', '👶 تأكيد وفصل الملف')}
          </button>
        </div>
      </div>
    </div>
  );
};
