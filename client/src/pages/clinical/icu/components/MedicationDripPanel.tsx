import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Syringe, PlusCircle, Play, Pause, Square, TrendingUp, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../../api/apiClient';

interface Props {
  encounterId: number;
}

export const MedicationDripPanel = ({ encounterId }: Props) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
   
  const [drips, setDrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDrip, setNewDrip] = useState({
    medicationName: '',
    concentration: '',
    currentRate: '',
    doseUnit: 'ml/hr'
  });

  useEffect(() => {
    fetchDrips();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId]);

  const fetchDrips = async () => {
    try {
      const res = await apiClient.get(`/icu/drips/${encounterId}`);
      setDrips(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startDrip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/icu/drips', {
        encounterId,
        medicationName: newDrip.medicationName,
        concentration: newDrip.concentration,
        currentRate: Number(newDrip.currentRate),
        doseUnit: newDrip.doseUnit
      });
      setShowAddModal(false);
      setNewDrip({ medicationName: '', concentration: '', currentRate: '', doseUnit: 'ml/hr' });
      fetchDrips();
    } catch (err) {
      console.error(err);
      alert(t('icu.patientDetail.addDripModal.startFailed', 'Failed to start drip'));
    }
  };

  const titrateDrip = async (dripId: number, currentRate: number) => {
    const rateStr = prompt(t('icu.patientDetail.dripActions.enterNewDose', 'Enter new rate (current: {{currentRate}}):', { currentRate }));
    if (!rateStr) return;
    const newRate = Number(rateStr);
    if (isNaN(newRate)) return alert(t('icu.patientDetail.dripActions.invalidValue', 'Invalid rate'));

    const reason = prompt(t('icu.patientDetail.dripActions.titrateReason', 'Reason for titration? (optional)'));
    
    try {
      await apiClient.put(`/icu/drips/${dripId}/titrate`, { newRate, reason });
      fetchDrips();
    } catch (err) {
      console.error(err);
      alert(t('icu.patientDetail.dripActions.titrateFailed', 'Failed to titrate'));
    }
  };

  const stopDrip = async (dripId: number) => {
    if (!window.confirm(t('icu.patientDetail.dripActions.confirmStop', 'Are you sure you want to stop this infusion?'))) return;
    const reason = prompt(t('icu.patientDetail.dripActions.titrateReason', 'Reason for stopping? (optional)'));
    
    try {
      await apiClient.put(`/icu/drips/${dripId}/stop`, { reason });
      fetchDrips();
    } catch (err) {
      console.error(err);
      alert(t('icu.patientDetail.dripActions.stopFailed', 'Failed to stop'));
    }
  };

  if (loading) return <div className="p-4 text-center text-slate-500">{t('common.loading', 'جاري تحميل البيانات...')}</div>;

  return (
    <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-950/50">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Syringe className="w-5 h-5 text-rose-400" /> {t('icu.patientDetail.drips.title', 'الأدوية الوريدية المستمرة')}
        </h3>
        <button 
          onClick={() => setShowAddModal(true)} 
          className="px-4 py-2 bg-rose-900/30 text-rose-400 border border-rose-500/30 font-semibold rounded-xl hover:bg-rose-900/50 transition-colors flex items-center gap-2 text-sm shadow-inner"
        >
          <PlusCircle className="w-4 h-4" /> {t('icu.patientDetail.drips.add', 'إضافة دواء')}
        </button>
      </div>

      <div className="p-4">
        {drips.length === 0 ? (
          <div className="text-center p-8 text-slate-500 flex flex-col items-center bg-slate-950/30 rounded-xl border border-dashed border-slate-800">
             <Syringe className="w-12 h-12 text-slate-700 mb-3" />
             <p>{t('icu.patientDetail.drips.empty', 'لا توجد أدوية وريدية مستمرة.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drips.map((drip) => (
              <div key={drip.id} className="border border-rose-500/20 bg-slate-950 rounded-2xl overflow-hidden shadow-sm hover:border-rose-500/40 transition-colors group">
                <div className="p-4 border-b border-rose-500/20 bg-rose-900/10 flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-white tracking-wide truncate pl-2" title={drip.medicationName} dir="ltr">
                      {drip.medicationName}
                    </h4>
                    <p className="text-xs text-rose-200/50 mt-1">{drip.concentration || t('icu.patientDetail.drips.standardConc', 'تركيز اعتيادي')}</p>
                  </div>
                  <span className="flex h-2.5 w-2.5 mt-1.5 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                  </span>
                </div>
                
                <div className="p-5 text-center bg-slate-900/50">
                   <p className="text-4xl font-black text-white my-2 tracking-tighter" dir="ltr">
                     {drip.currentRate} <span className="text-sm font-bold text-slate-500 tracking-wide">{drip.doseUnit}</span>
                   </p>
                   <p className="text-[10px] text-slate-500 mt-2 font-mono">
                     {t('icu.patientDetail.drips.startedAt', 'البداية:')} {new Date(drip.startedAt).toLocaleString(isRtl ? 'ar-LY' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                   </p>
                </div>

                <div className="grid grid-cols-2 border-t border-slate-800 divide-x divide-x-reverse divide-slate-800">
                   <button 
                     onClick={() => titrateDrip(drip.id, drip.currentRate)}
                     className="p-3 text-xs font-bold text-indigo-400 hover:bg-slate-800 transition flex items-center justify-center gap-2"
                   >
                     <TrendingUp className="w-4 h-4" /> {t('icu.patientDetail.drips.titrate', 'تعديل الجرعة')}
                   </button>
                   <button 
                     onClick={() => stopDrip(drip.id)}
                     className="p-3 text-xs font-bold text-rose-400 hover:bg-slate-800 transition flex items-center justify-center gap-2"
                   >
                     <Square className="w-4 h-4" /> {t('icu.patientDetail.drips.stop', 'إيقاف')}
                   </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD DRIP MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-950">
              <h3 className="font-bold text-lg text-white">{t('icu.patientDetail.addDripModal.title', 'إضافة دواء وريدي مستمر')}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
            </div>
            <form onSubmit={startDrip} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addDripModal.medicationName', 'اسم الدواء')}</label>
                <input 
                  required
                  type="text" 
                  value={newDrip.medicationName} 
                  onChange={e => setNewDrip({...newDrip, medicationName: e.target.value})}
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-rose-500 transition-colors"
                  placeholder={t('icu.patientDetail.addDripModal.medicationPlaceholder', 'مثال: Norepinephrine, Propofol...')}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addDripModal.concentration', 'التركيز (اختياري)')}</label>
                <input 
                  type="text" 
                  value={newDrip.concentration} 
                  onChange={e => setNewDrip({...newDrip, concentration: e.target.value})}
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-rose-500 transition-colors"
                  placeholder={t('icu.patientDetail.addDripModal.concentrationPlaceholder', 'مثال: 4mg/250ml')}
                  dir="ltr"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addDripModal.unit', 'وحدة الجرعة')}</label>
                  <select 
                    value={newDrip.doseUnit} 
                    onChange={e => setNewDrip({...newDrip, doseUnit: e.target.value})}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-rose-500 transition-colors"
                    dir="ltr"
                  >
                    <option value="ml/hr">ml/hr</option>
                    <option value="mcg/kg/min">mcg/kg/min</option>
                    <option value="mcg/min">mcg/min</option>
                    <option value="mg/hr">mg/hr</option>
                    <option value="units/hr">units/hr</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addDripModal.initialDose', 'الجرعة المبدئية')}</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={newDrip.currentRate} 
                    onChange={e => setNewDrip({...newDrip, currentRate: e.target.value})}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-rose-500 transition-colors"
                    placeholder="0.0"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="pt-6 flex gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-[2] py-2.5 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors">{t('icu.patientDetail.addDripModal.cancel', 'إلغاء')}</button>
                <button type="submit" className="flex-[3] py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-500 font-bold transition-colors shadow-lg shadow-rose-900/40 flex items-center justify-center gap-2">
                  <Play className="w-4 h-4 fill-current" /> {t('icu.patientDetail.addDripModal.startInfusion', 'بدء الحقن')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
