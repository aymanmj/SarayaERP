import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../../api/apiClient';
import { User, Activity, FileText, ArrowLeft, BrainCircuit } from 'lucide-react';
import { MedicationDripPanel } from './components/MedicationDripPanel';
import { EquipmentPanel } from './components/EquipmentPanel';
import { DailyAssessmentForm } from './components/DailyAssessmentForm';

export const IcuPatientDetail = () => {
  const { encounterId } = useParams<{ encounterId: string }>();
  const navigate = useNavigate();
  const [patientData, setPatientData] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);

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

  if (loading) return <div className="flex justify-center items-center h-screen"><Activity className="w-10 h-10 animate-spin text-sky-600" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <button onClick={() => navigate('/clinical/icu')} className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-600 dark:text-slate-300">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300 flex items-center justify-center font-bold flex-shrink-0 text-2xl">
          {patientData?.patient?.fullName?.charAt(0) || <User />}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">
            {patientData?.patient?.fullName || `Encounter ${encounterId}`}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-slate-500 font-medium">
            <span className="flex items-center gap-1"><span className="text-slate-400">MRN:</span> {patientData?.patient?.mrn || 'N/A'}</span>
            <span className="flex items-center gap-1"><span className="text-slate-400">Bed:</span> {patientData?.bed?.bedNumber || 'N/A'} ({patientData?.bed?.ward?.name})</span>
            <span className="flex items-center gap-1"><span className="text-slate-400">Admitted:</span> {new Date(patientData?.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
           <button 
             onClick={() => setShowAssessmentModal(true)} 
             className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow-sm transition-colors flex items-center gap-2"
           >
             <FileText className="w-4 h-4" /> Daily Assessment
           </button>
           <button 
             onClick={() => navigate(`/clinical/icu/flowsheet/${encounterId}`)} 
             className="px-4 py-2 bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:border-sky-800 dark:text-sky-300 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 font-semibold transition-colors flex items-center gap-2"
           >
             <Activity className="w-4 h-4" /> Go to Flowsheet
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* LEFT COLUMN: History */}
         <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 rounded-t-xl">
                 <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-purple-500" /> Assessment History
                 </h3>
              </div>
              <div className="p-0">
                 {assessments.length === 0 ? (
                    <div className="p-6 text-center text-slate-500">No daily assessments recorded yet.</div>
                 ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                       {assessments.map(acc => (
                         <div key={acc.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                               <h4 className="font-bold text-slate-800 dark:text-slate-200">
                                 {new Date(acc.assessmentDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                               </h4>
                               <div className="flex gap-2">
                                 {acc.gcsTotal && <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-2 py-1 rounded font-bold">GCS: {acc.gcsTotal}</span>}
                                 {acc.sofaScore && <span className="text-xs bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 px-2 py-1 rounded font-bold">SOFA: {acc.sofaScore}</span>}
                                 {acc.apacheIIScore && <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 px-2 py-1 rounded font-bold">APACHE II: {acc.apacheIIScore}</span>}
                               </div>
                            </div>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                               <p><span className="text-slate-500">Respiratory:</span> <span className="font-medium text-slate-700 dark:text-slate-300">{acc.oxygenDevice?.replace('_',' ')} {acc.fio2 ? `(${acc.fio2}%)` : ''}</span></p>
                               <p><span className="text-slate-500">Sedation Goal:</span> <span className="font-medium text-slate-700 dark:text-slate-300">{acc.sedationTarget || 'N/A'}</span></p>
                               <p className="col-span-2"><span className="text-slate-500">Daily Goal:</span> <span className="font-medium text-slate-700 dark:text-slate-300">{acc.dailyGoals || 'N/A'}</span></p>
                            </div>
                         </div>
                       ))}
                    </div>
                 )}
              </div>
            </div>
         </div>

         {/* RIGHT COLUMN: Drips & Equipment */}
         <div className="space-y-6">
            <MedicationDripPanel encounterId={Number(encounterId)} />
            <EquipmentPanel encounterId={Number(encounterId)} />
         </div>
      </div>

      {showAssessmentModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 pt-10">
           <div className="w-full max-w-5xl">
              <DailyAssessmentForm 
                 encounterId={Number(encounterId)} 
                 onSuccess={() => { setShowAssessmentModal(false); fetchData(); }} 
                 onCancel={() => setShowAssessmentModal(false)}
              />
           </div>
        </div>
      )}
    </div>
  );
};
