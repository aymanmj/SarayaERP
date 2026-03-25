import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../../api/apiClient';
import { User, Activity, FileText, ArrowLeft, BrainCircuit, ArrowLeftRight } from 'lucide-react';
import { MedicationDripPanel } from './components/MedicationDripPanel';
import { EquipmentPanel } from './components/EquipmentPanel';
import { DailyAssessmentForm } from './components/DailyAssessmentForm';
import { RequestTransferModal } from '../transfers/RequestTransferModal';

export const IcuPatientDetail = () => {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const [patientData, setPatientData] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, [encounterId]);

  const fetchData = async () => {
    try {
      // In a real scenario, this would fetch specific patient info. For now, fetch all ICU patients and filter.
      // Or use the assessment history and equipment history.
      const [patientsRes, assessmentsRes] = await Promise.all([
        apiClient.get('/icu/patients'),
        apiClient.get(`/icu/assessments/${encounterId}`)
      ]);
      const currentPatient = patientsRes.data.find((p: any) => p.encounterId === Number(encounterId));
      setPatientData(currentPatient);
      setAssessments(assessmentsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-screen bg-slate-950"><Activity className="w-10 h-10 animate-spin text-sky-500" /></div>;

  return (
    <div className="p-4 md:p-6 lg:max-w-7xl mx-auto space-y-6 text-slate-100 min-h-screen" dir="rtl">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-sky-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center gap-4 z-10">
          <button 
            onClick={() => navigate('/clinical/icu')} 
            className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5 rotate-180" />
          </button>
          
          <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 text-sky-400 flex items-center justify-center font-bold text-3xl shadow-inner shadow-sky-900/20 shrink-0">
            {patientData?.patient?.fullName?.charAt(0) || <User className="w-8 h-8" />}
          </div>
          
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-white mb-2">
              {patientData?.patient?.fullName || `ملف المريض #${encounterId}`}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300">
              <span className="bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800 px-3">
                <span className="text-slate-500 font-mono tracking-wider" dir="ltr">{patientData?.patient?.mrn || 'N/A'}</span>
              </span>
              <span className="bg-sky-900/30 text-sky-400 px-2.5 py-1 rounded-md border border-sky-500/20">
                سرير {patientData?.bed?.bedNumber || 'N/A'} ({patientData?.bed?.ward?.name})
              </span>
              <span className="bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800 text-slate-400 font-mono" dir="ltr">
                {new Date(patientData?.createdAt).toLocaleDateString('en-GB')} الدخول
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 w-full lg:w-auto z-10">
           <button 
             onClick={() => setShowAssessmentModal(true)} 
             className="flex-1 lg:flex-none px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center gap-2"
           >
             <FileText className="w-4 h-4" /> التقييم اليومي
           </button>
           <button 
             onClick={() => navigate(`/clinical/icu/flowsheet/${encounterId}`)} 
             className="flex-1 lg:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2"
           >
             <Activity className="w-4 h-4 text-sky-400" /> المخطط السريري
           </button>
           <button 
             onClick={() => setShowTransferModal(true)} 
             className="flex-1 lg:flex-none px-4 py-2.5 bg-rose-900/30 hover:bg-rose-900/50 border border-rose-500/30 text-rose-400 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
           >
             <ArrowLeftRight className="w-4 h-4" /> نقل (Step-down)
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
         {/* RIGHT COLUMN (RTL): History */}
         <div className="space-y-6">
            <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 overflow-hidden">
              <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-950/50">
                 <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-purple-400" /> التقييمات السابقة
                 </h3>
              </div>
              
              <div className="p-0">
                 {assessments.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                       <FileText className="w-12 h-12 opacity-20 mb-4" />
                       <p>لا توجد تقييمات يومية مسجلة بعد.</p>
                    </div>
                 ) : (
                    <div className="divide-y divide-slate-800/50 p-3">
                       {assessments.map(acc => (
                         <div key={acc.id} className="p-4 bg-slate-950/30 rounded-xl border border-transparent hover:border-slate-800 transition-colors mb-3 last:mb-0">
                            <div className="flex justify-between items-start mb-4">
                               <h4 className="font-bold text-white text-sm">
                                 {new Date(acc.assessmentDate).toLocaleDateString('ar-LY', { weekday: 'long', month: 'long', day: 'numeric' })}
                               </h4>
                               <div className="flex flex-wrap justify-end gap-2">
                                 {acc.gcsTotal && <span className="text-xs bg-indigo-900/40 border border-indigo-500/30 text-indigo-300 px-2.5 py-1 rounded-lg font-bold tracking-wide">GCS: {acc.gcsTotal}</span>}
                                 {acc.sofaScore && <span className="text-xs bg-rose-900/40 border border-rose-500/30 text-rose-300 px-2.5 py-1 rounded-lg font-bold tracking-wide">SOFA: {acc.sofaScore}</span>}
                                 {acc.apacheIIScore && <span className="text-xs bg-amber-900/40 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-lg font-bold tracking-wide">APACHE II: {acc.apacheIIScore}</span>}
                               </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-4 text-xs">
                               <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                                  <span className="text-slate-500 block mb-1">دعم التنفس:</span> 
                                  <span className="font-bold text-slate-300">{acc.oxygenDevice?.replace('_',' ')} {acc.fio2 ? `(${acc.fio2}%)` : ''}</span>
                               </div>
                               <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                                  <span className="text-slate-500 block mb-1">هدف التخدير:</span> 
                                  <span className="font-bold text-slate-300">{acc.sedationTarget || 'غير محدد'}</span>
                               </div>
                               <div className="md:col-span-2 bg-slate-900 p-3 rounded-lg border border-slate-800">
                                  <span className="text-slate-500 block mb-1">الأهداف اليومية للحالة:</span> 
                                  <span className="font-medium text-slate-300 leading-relaxed">{acc.dailyGoals || 'غير محدد'}</span>
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                 )}
              </div>
            </div>
         </div>

         {/* LEFT COLUMN (RTL): Drips & Equipment */}
         <div className="space-y-6">
            <MedicationDripPanel encounterId={Number(encounterId)} />
            <EquipmentPanel encounterId={Number(encounterId)} />
         </div>
      </div>

      {showAssessmentModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-4 pt-10" dir="ltr">
           <div className="w-full max-w-5xl">
              <DailyAssessmentForm 
                 encounterId={Number(encounterId)} 
                 onSuccess={() => { setShowAssessmentModal(false); fetchData(); }} 
                 onCancel={() => setShowAssessmentModal(false)}
              />
           </div>
        </div>
      )}

      {/* STEP DOWN TRANSFER MODAL */}
      <RequestTransferModal 
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        encounterId={Number(encounterId)}
        patientName={patientData?.patient?.fullName || ''}
        fromBedId={patientData?.bedId}
        onSuccess={() => {
           setShowTransferModal(false);
           navigate('/clinical/icu');
        }}
      />
    </div>
  );
};
