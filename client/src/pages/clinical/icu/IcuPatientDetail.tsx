import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../../api/apiClient';
import { User, Activity, FileText, ArrowRight, BrainCircuit, ArrowLeftRight, Syringe, Monitor, PlusCircle, TrendingUp, Square, Play, StopCircle } from 'lucide-react';
import { DailyAssessmentForm } from './components/DailyAssessmentForm';
import { IcuStepDownModal } from './components/IcuStepDownModal';

/* ═══════════════════════════════════════════════════════
   ICU PATIENT DETAIL — FULL REDESIGN
   Single-file, self-contained dark neon RTL layout.
   All sub-panels are inlined to guarantee consistent styling.
   ═══════════════════════════════════════════════════════ */

export const IcuPatientDetail = () => {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  /* ── state ── */
   
  const [patientData, setPatientData] = useState<any>(null);
   
  const [assessments, setAssessments] = useState<any[]>([]);
   
  const [drips, setDrips] = useState<any[]>([]);
   
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAddDripModal, setShowAddDripModal] = useState(false);
  const [showAddEquipModal, setShowAddEquipModal] = useState(false);

  const [newDrip, setNewDrip] = useState({ medicationName: '', concentration: '', currentRate: '', doseUnit: 'ml/hr' });
  const [newEq, setNewEq] = useState({ equipmentType: 'VENTILATOR', equipmentName: '', dailyRate: '', notes: '' });

  /* ── data fetching ── */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [encounterId]);

  const fetchAll = async () => {
    try {
      const [pRes, aRes, dRes, eRes] = await Promise.all([
        apiClient.get('/icu/patients'),
        apiClient.get(`/icu/assessments/${encounterId}`),
        apiClient.get(`/icu/drips/${encounterId}`),
        apiClient.get(`/icu/equipment/${encounterId}`),
      ]);
       
      setPatientData(pRes.data.find((p: any) => p.encounterId === Number(encounterId)));
      setAssessments(aRes.data);
      setDrips(dRes.data);
      setEquipmentList(eRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  /* ── drip actions ── */
  const startDrip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/icu/drips', { encounterId: Number(encounterId), medicationName: newDrip.medicationName, concentration: newDrip.concentration, currentRate: Number(newDrip.currentRate), doseUnit: newDrip.doseUnit });
      setShowAddDripModal(false);
      setNewDrip({ medicationName: '', concentration: '', currentRate: '', doseUnit: 'ml/hr' });
      fetchAll();
    } catch { alert(t('icu.patientDetail.addDripModal.startFailed', 'فشل بدء الحقن الوريدي')); }
  };
  const titrateDrip = async (id: number, cur: number) => {
    const r = prompt(t('icu.patientDetail.dripActions.enterNewDose', 'أدخل الجرعة الجديدة (الحالية: {{cur}}):', { cur }));
    if (!r) return;
    const newRate = Number(r);
    if (isNaN(newRate)) return alert(t('icu.patientDetail.dripActions.invalidValue', 'قيمة غير صالحة'));
    const reason = prompt(t('icu.patientDetail.dripActions.titrateReason', 'سبب التعديل (اختياري):'));
    try { await apiClient.put(`/icu/drips/${id}/titrate`, { newRate, reason }); fetchAll(); } catch { alert(t('icu.patientDetail.dripActions.titrateFailed', 'فشل التعديل')); }
  };
  const stopDrip = async (id: number) => {
    if (!confirm(t('icu.patientDetail.dripActions.confirmStop', 'هل تريد إيقاف هذا الحقن الوريدي؟'))) return;
    try { await apiClient.put(`/icu/drips/${id}/stop`, {}); fetchAll(); } catch { alert(t('icu.patientDetail.dripActions.stopFailed', 'فشل الإيقاف')); }
  };

  /* ── equipment actions ── */
  const startEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/icu/equipment', { encounterId: Number(encounterId), equipmentType: newEq.equipmentType, equipmentName: newEq.equipmentName, dailyRate: newEq.dailyRate ? Number(newEq.dailyRate) : undefined, notes: newEq.notes });
      setShowAddEquipModal(false);
      setNewEq({ equipmentType: 'VENTILATOR', equipmentName: '', dailyRate: '', notes: '' });
      fetchAll();
    } catch { alert(t('icu.patientDetail.addEquipModal.connectFailed', 'فشل إضافة الجهاز')); }
  };
  const stopEquipment = async (id: number) => {
    if (!confirm(t('icu.patientDetail.equipActions.confirmDisconnect', 'هل تريد فصل هذا الجهاز؟ سيتم إيقاف احتساب الفوترة.'))) return;
    try { await apiClient.put(`/icu/equipment/${id}/stop`); fetchAll(); } catch { alert(t('icu.patientDetail.equipActions.disconnectFailed', 'فشل فصل الجهاز')); }
  };

  /* ── loading ── */
  if (loading) return <div className="flex justify-center items-center h-screen bg-slate-950"><Activity className="w-12 h-12 animate-spin text-sky-500" /></div>;

  const activeEqCount = equipmentList.filter(e => !e.stoppedAt).length;

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="min-h-screen p-5 lg:p-8 max-w-[1400px] mx-auto" dir={isRtl ? 'rtl' : 'ltr'} style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>

      {/* ════════════════ HEADER CARD ════════════════ */}
      <div className="bg-gradient-to-l from-slate-900 via-slate-900 to-slate-950 rounded-2xl border border-slate-800 p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          {/* Patient Info */}
          <div className="flex items-center gap-5">
            <button onClick={() => navigate('/clinical/icu')} className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0">
              <ArrowRight className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 rounded-xl bg-sky-500/10 border-2 border-sky-500/30 text-sky-400 flex items-center justify-center text-2xl font-black shrink-0">
              {patientData?.patient?.fullName?.charAt(0) || <User className="w-7 h-7" />}
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white leading-tight">{patientData?.patient?.fullName || t('icu.patientDetail.patientLabel', 'مريض #{{encounterId}}', { encounterId })}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-[11px] font-bold bg-slate-800 text-slate-400 px-2.5 py-1 rounded-md border border-slate-700 font-mono" dir="ltr">MRN: {patientData?.patient?.mrn || 'N/A'}</span>
                <span className="text-[11px] font-bold bg-sky-950/50 text-sky-400 px-2.5 py-1 rounded-md border border-sky-500/20">{t('icu.patientDetail.bed', 'سرير')} {patientData?.bed?.bedNumber} · {patientData?.bed?.ward?.name}</span>
                <span className="text-[11px] font-bold bg-slate-800 text-slate-500 px-2.5 py-1 rounded-md border border-slate-700">{t('icu.patientDetail.admission', 'الدخول:')} {new Date(patientData?.createdAt).toLocaleDateString(isRtl ? 'ar-LY' : 'en-US')}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowAssessmentModal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-900/30 transition flex items-center gap-2">
              <FileText className="w-4 h-4" /> {t('icu.patientDetail.dailyAssessment', 'التقييم اليومي')}
            </button>
            <button onClick={() => navigate(`/clinical/icu/flowsheet/${encounterId}`)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-bold rounded-xl transition flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" /> {t('icu.patientDetail.flowsheet', 'المخطط السريري')}
            </button>
            <button onClick={() => setShowTransferModal(true)} className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-sm font-bold rounded-xl transition flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" /> {t('icu.patientDetail.stepDown', 'نقل (Step-down)')}
            </button>
          </div>
        </div>
      </div>

      {/* ════════════════ MAIN 2-COL GRID ════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 pb-12">

        {/* ── COL 1: التقييمات (3/5 width) ── */}
        <div className="xl:col-span-3 space-y-6">

          {/* ASSESSMENTS */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center gap-3">
              <BrainCircuit className="w-5 h-5 text-purple-400" />
              <h2 className="text-base font-extrabold text-white">{t('icu.patientDetail.assessments.title', 'التقييمات السابقة')}</h2>
            </div>
            <div className="p-4">
              {assessments.length === 0 ? (
                <div className="py-16 text-center text-slate-600 flex flex-col items-center">
                  <FileText className="w-14 h-14 mb-4 opacity-20" />
                  <p className="text-sm">{t('icu.patientDetail.assessments.empty', 'لا توجد تقييمات يومية مسجلة بعد.')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {assessments.map(a => (
                    <div key={a.id} className="p-5 bg-slate-950/50 rounded-xl border border-slate-800 hover:border-slate-700 transition">
                      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                        <h4 className="font-bold text-white text-sm">{new Date(a.assessmentDate).toLocaleDateString(isRtl ? 'ar-LY' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h4>
                        <div className="flex flex-wrap gap-2">
                          {a.gcsTotal && <span className="text-[11px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 px-2.5 py-1 rounded-lg font-extrabold">GCS: {a.gcsTotal}</span>}
                          {a.sofaScore && <span className="text-[11px] bg-rose-500/15 border border-rose-500/30 text-rose-300 px-2.5 py-1 rounded-lg font-extrabold">SOFA: {a.sofaScore}</span>}
                          {a.apacheIIScore && <span className="text-[11px] bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-lg font-extrabold">APACHE: {a.apacheIIScore}</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <span className="text-slate-500 text-[11px] block mb-1">{t('icu.patientDetail.assessments.respiratorySupport', 'دعم التنفس')}</span>
                          <span className="font-bold text-white text-sm">{a.oxygenDevice?.replace('_',' ')} {a.fio2 ? `(${a.fio2}%)` : ''}</span>
                        </div>
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <span className="text-slate-500 text-[11px] block mb-1">{t('icu.patientDetail.assessments.sedationTarget', 'هدف التخدير')}</span>
                          <span className="font-bold text-white text-sm">{a.sedationTarget || t('icu.patientDetail.assessments.unspecified', 'غير محدد')}</span>
                        </div>
                        <div className="sm:col-span-2 bg-slate-900 p-3 rounded-lg border border-slate-800">
                          <span className="text-slate-500 text-[11px] block mb-1">{t('icu.patientDetail.assessments.dailyGoals', 'الأهداف اليومية')}</span>
                          <span className="font-medium text-slate-300 text-sm leading-relaxed">{a.dailyGoals || t('icu.patientDetail.assessments.unspecified', 'غير محدد')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* EQUIPMENT (card-style instead of table) */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-extrabold text-white">{t('icu.patientDetail.equipment.title', 'الأجهزة الموصولة')}</h2>
                {activeEqCount > 0 && <span className="text-[10px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-md font-bold">{activeEqCount} {t('icu.patientDetail.equipment.inUse', 'قيد الاستخدام')}</span>}
              </div>
              <button onClick={() => setShowAddEquipModal(true)} className="text-sm font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4" /> {t('icu.patientDetail.equipment.add', 'إضافة')}
              </button>
            </div>
            <div className="p-4">
              {equipmentList.length === 0 ? (
                <div className="py-12 text-center text-slate-600 flex flex-col items-center">
                  <Monitor className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">{t('icu.patientDetail.equipment.empty', 'لا يوجد أجهزة موصولة حالياً.')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {equipmentList.map(eq => (
                    <div key={eq.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border transition ${!eq.stoppedAt ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-slate-950/30 border-slate-800'}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        {!eq.stoppedAt && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-bold text-white text-sm truncate">{eq.equipmentType.replace('_', ' ')}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{eq.equipmentName || '—'}</p>
                          <p className="text-[11px] text-slate-600 font-mono mt-0.5" dir="ltr">{new Date(eq.startedAt).toLocaleString(isRtl ? 'ar-LY' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {eq.stoppedAt ? (
                          <span className="text-[11px] text-slate-500 bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 whitespace-nowrap">{t('icu.patientDetail.equipment.disconnected', 'تم الفصل:')} {new Date(eq.stoppedAt).toLocaleString(isRtl ? 'ar-LY' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        ) : (
                          <>
                            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 font-bold whitespace-nowrap">{t('icu.patientDetail.equipment.connected', 'متصل حالياً')}</span>
                            <button onClick={() => stopEquipment(eq.id)} className="text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
                              <StopCircle className="w-3.5 h-3.5" /> {t('icu.patientDetail.equipment.disconnect', 'فصل')}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── COL 2: الأدوية الوريدية (2/5 width) ── */}
        <div className="xl:col-span-2 space-y-6">
          <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Syringe className="w-5 h-5 text-rose-400" />
                <h2 className="text-base font-extrabold text-white">{t('icu.patientDetail.drips.title', 'الأدوية الوريدية المستمرة')}</h2>
              </div>
              <button onClick={() => setShowAddDripModal(true)} className="text-sm font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4" /> {t('icu.patientDetail.drips.add', 'إضافة')}
              </button>
            </div>
            <div className="p-4">
              {drips.length === 0 ? (
                <div className="py-16 text-center text-slate-600 flex flex-col items-center">
                  <Syringe className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">{t('icu.patientDetail.drips.empty', 'لا توجد أدوية وريدية نشطة.')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {drips.map(d => (
                    <div key={d.id} className="bg-slate-950/50 border border-rose-500/15 rounded-xl overflow-hidden hover:border-rose-500/30 transition">
                      {/* Drug header */}
                      <div className="px-5 py-3 border-b border-rose-500/10 bg-rose-500/5 flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-white text-sm" dir="ltr">{d.medicationName}</h4>
                          <p className="text-[11px] text-rose-300/50 mt-0.5">{d.concentration || t('icu.patientDetail.drips.standardConc', 'تركيز اعتيادي')}</p>
                        </div>
                        <span className="relative flex h-2.5 w-2.5 mt-1 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        </span>
                      </div>
                      {/* Rate display */}
                      <div className="px-5 py-5 text-center">
                        <p className="text-4xl font-black text-white" dir="ltr">
                          {d.currentRate} <span className="text-base font-bold text-slate-500">{d.doseUnit}</span>
                        </p>
                        <p className="text-[10px] text-slate-500 mt-2 font-mono" dir="ltr">
                          {t('icu.patientDetail.drips.startedAt', 'البداية:')} {new Date(d.startedAt).toLocaleString(isRtl ? 'ar-LY' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {/* Actions */}
                      <div className="grid grid-cols-2 border-t border-slate-800">
                        <button onClick={() => titrateDrip(d.id, d.currentRate)} className="py-3 text-xs font-bold text-indigo-400 hover:bg-slate-800 transition flex items-center justify-center gap-2 border-l border-slate-800">
                          <TrendingUp className="w-4 h-4" /> {t('icu.patientDetail.drips.titrate', 'تعديل الجرعة')}
                        </button>
                        <button onClick={() => stopDrip(d.id)} className="py-3 text-xs font-bold text-rose-400 hover:bg-slate-800 transition flex items-center justify-center gap-2">
                          <Square className="w-4 h-4" /> {t('icu.patientDetail.drips.stop', 'إيقاف')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ════════════════ MODALS ════════════════ */}

      {/* Assessment modal */}
      {showAssessmentModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-4 pt-10">
          <div className="w-full max-w-5xl">
            <DailyAssessmentForm encounterId={Number(encounterId)} onSuccess={() => { setShowAssessmentModal(false); fetchAll(); }} onCancel={() => setShowAssessmentModal(false)} />
          </div>
        </div>
      )}

      {/* Add Drip modal */}
      {showAddDripModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950">
              <h3 className="font-extrabold text-lg text-white">{t('icu.patientDetail.addDripModal.title', 'إضافة دواء وريدي')}</h3>
              <button onClick={() => setShowAddDripModal(false)} className="text-slate-500 hover:text-white transition text-xl">✕</button>
            </div>
            <form onSubmit={startDrip} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addDripModal.medicationName', 'اسم الدواء')}</label>
                <input required type="text" value={newDrip.medicationName} onChange={e => setNewDrip({...newDrip, medicationName: e.target.value})} className="w-full p-3 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-rose-500 transition text-sm" placeholder="مثال: Norepinephrine" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addDripModal.concentration', 'التركيز (اختياري)')}</label>
                <input type="text" value={newDrip.concentration} onChange={e => setNewDrip({...newDrip, concentration: e.target.value})} className="w-full p-3 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-rose-500 transition text-sm" placeholder="مثال: 4mg/250ml" dir="ltr" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addDripModal.initialDose', 'الجرعة المبدئية')}</label>
                  <input required type="number" step="0.01" value={newDrip.currentRate} onChange={e => setNewDrip({...newDrip, currentRate: e.target.value})} className="w-full p-3 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-rose-500 transition text-sm" placeholder="0.0" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addDripModal.unit', 'الوحدة')}</label>
                  <select value={newDrip.doseUnit} onChange={e => setNewDrip({...newDrip, doseUnit: e.target.value})} className="w-full p-3 bg-slate-950 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-rose-500 transition text-sm" dir="ltr">
                    <option value="ml/hr">ml/hr</option>
                    <option value="mcg/kg/min">mcg/kg/min</option>
                    <option value="mcg/min">mcg/min</option>
                    <option value="mg/hr">mg/hr</option>
                    <option value="units/hr">units/hr</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddDripModal(false)} className="flex-1 py-3 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition text-sm">{t('icu.patientDetail.addDripModal.cancel', 'إلغاء')}</button>
                <button type="submit" className="flex-[2] py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-lg shadow-rose-900/30 transition flex items-center justify-center gap-2 text-sm">
                  <Play className="w-4 h-4 fill-current" /> {t('icu.patientDetail.addDripModal.startInfusion', 'بدء الحقن')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Equipment modal */}
      {showAddEquipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950">
              <h3 className="font-extrabold text-lg text-white">{t('icu.patientDetail.addEquipModal.title', 'إضافة جهاز')}</h3>
              <button onClick={() => setShowAddEquipModal(false)} className="text-slate-500 hover:text-white transition text-xl">✕</button>
            </div>
            <form onSubmit={startEquipment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addEquipModal.equipmentType', 'نوع الجهاز')}</label>
                <select value={newEq.equipmentType} onChange={e => setNewEq({...newEq, equipmentType: e.target.value})} className="w-full p-3 bg-slate-950 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-indigo-500 transition text-sm">
                  <option value="VENTILATOR">{t('icu.patientDetail.addEquipModal.ventilator', 'تنفّس صناعي (Ventilator)')}</option>
                  <option value="CARDIAC_MONITOR">{t('icu.patientDetail.addEquipModal.cardiacMonitor', 'مراقب قلب (Cardiac Monitor)')}</option>
                  <option value="INFUSION_PUMP">{t('icu.patientDetail.addEquipModal.infusionPump', 'مضخة تسريب (Infusion Pump)')}</option>
                  <option value="FEEDING_PUMP">{t('icu.patientDetail.addEquipModal.feedingPump', 'مضخة تغذية (Feeding Pump)')}</option>
                  <option value="DIALYSIS_CRRT">{t('icu.patientDetail.addEquipModal.dialysisCrrt', 'غسيل كلوي (CRRT)')}</option>
                  <option value="ECMO">{t('icu.patientDetail.addEquipModal.ecmo', 'جهاز أكسجة (ECMO)')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addEquipModal.equipmentName', 'اسم / رقم الجهاز (اختياري)')}</label>
                <input type="text" value={newEq.equipmentName} onChange={e => setNewEq({...newEq, equipmentName: e.target.value})} className="w-full p-3 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-indigo-500 transition text-sm" placeholder="مثال: Vent #3" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">{t('icu.patientDetail.addEquipModal.dailyRate', 'التعرفة اليومية (اختياري)')}</label>
                <input type="number" step="0.01" value={newEq.dailyRate} onChange={e => setNewEq({...newEq, dailyRate: e.target.value})} className="w-full p-3 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-indigo-500 transition text-sm" placeholder="0.00" dir="ltr" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddEquipModal(false)} className="flex-1 py-3 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition text-sm">{t('icu.patientDetail.addEquipModal.cancel', 'إلغاء')}</button>
                <button type="submit" className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-900/30 transition flex items-center justify-center gap-2 text-sm">
                  <Monitor className="w-4 h-4" /> {t('icu.patientDetail.addEquipModal.connect', 'توصيل الجهاز')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ICU STEP-DOWN MODAL */}
      <IcuStepDownModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        encounterId={Number(encounterId)}
        patientName={patientData?.patient?.fullName || ''}
        fromBedId={patientData?.bedId}
        currentWardName={patientData?.bed?.ward?.name}
        currentBedNumber={patientData?.bed?.bedNumber}
        onSuccess={() => {
          setShowTransferModal(false);
          navigate('/clinical/icu');
        }}
      />
    </div>
  );
};
