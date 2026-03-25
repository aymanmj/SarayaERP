import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient as api } from '../../../api/apiClient';
import { Activity, Wind, Droplets, BrainCircuit, PlusCircle } from 'lucide-react';
import { FlowsheetEntryModal } from './components/FlowsheetEntryModal';

export const IcuFlowsheet = () => {
  const { encounterId } = useParams<{ encounterId: string }>();
  const [entries, setEntries] = useState<any[]>([]);
  const [ioBalance, setIoBalance] = useState({ totalIntake: 0, totalOutput: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('vitals');
  const [showEntryModal, setShowEntryModal] = useState(false);

  useEffect(() => {
    fetchFlowsheetData();
  }, [encounterId]);

  const fetchFlowsheetData = async () => {
    try {
      const [fsRes, ioRes] = await Promise.all([
        api.get(`/icu/flowsheet/${encounterId}`),
        api.get(`/icu/io-balance/${encounterId}`)
      ]);
      
      if (fsRes.data && fsRes.data.length > 0) {
        setEntries(fsRes.data[0].entries || []);
      } else {
        setEntries([]);
      }
      
      setIoBalance(ioRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-[calc(100vh-200px)]"><Activity className="w-10 h-10 animate-spin text-sky-600" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-sky-500" /> Clinical Flowsheet
          </h1>
          <p className="text-slate-500 text-sm mt-1">Encounter #{encounterId} Timeline</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right mr-4 hidden md:block border-r border-slate-200 dark:border-slate-700 pr-6">
             <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">I/O Balance Target</p>
             <p className={`text-xl font-bold ${ioBalance.balance < 0 ? 'text-amber-500' : 'text-sky-500'}`}>
               {ioBalance.balance > 0 ? '+' : ''}{ioBalance.balance} ml
             </p>
          </div>
          <button 
            onClick={() => setShowEntryModal(true)} 
            className="px-5 py-2.5 bg-sky-600 font-semibold text-white rounded-lg hover:bg-sky-700 transition flex items-center gap-2 shadow-sm"
          >
            <PlusCircle className="w-5 h-5" /> Chart Entry
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-px">
        <button 
          onClick={() => setActiveTab('vitals')}
          className={`px-4 py-2 flex items-center gap-2 font-medium rounded-t-lg transition-colors ${activeTab === 'vitals' ? 'bg-white dark:bg-slate-800 border-t border-l border-r border-slate-200 dark:border-slate-700 text-sky-600 dark:text-sky-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <Activity className="w-4 h-4" /> Vitals
        </button>
        <button 
          onClick={() => setActiveTab('io')}
          className={`px-4 py-2 flex items-center gap-2 font-medium rounded-t-lg transition-colors ${activeTab === 'io' ? 'bg-white dark:bg-slate-800 border-t border-l border-r border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <Droplets className="w-4 h-4" /> Fluid Balance
        </button>
        <button 
          onClick={() => setActiveTab('vent')}
          className={`px-4 py-2 flex items-center gap-2 font-medium rounded-t-lg transition-colors ${activeTab === 'vent' ? 'bg-white dark:bg-slate-800 border-t border-l border-r border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <Wind className="w-4 h-4" /> Ventilator
        </button>
        <button 
          onClick={() => setActiveTab('neuro')}
          className={`px-4 py-2 flex items-center gap-2 font-medium rounded-t-lg transition-colors ${activeTab === 'neuro' ? 'bg-white dark:bg-slate-800 border-t border-l border-r border-slate-200 dark:border-slate-700 text-purple-600 dark:text-purple-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          <BrainCircuit className="w-4 h-4" /> Neuro/GCS
        </button>
      </div>

      {/* Grid Container */}
      <div className="bg-white dark:bg-slate-800 rounded-b-xl rounded-tr-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-4 w-32 bg-slate-100 dark:bg-slate-700/50 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">Parameter / Time</th>
              {entries.map((entry, idx) => (
                <th key={idx} className="p-4 min-w-[120px] text-center border-r border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-center flex-col">
                    <span className="text-xs text-slate-400 font-normal">{new Date(entry.recordedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    <span className="text-sky-600 dark:text-sky-400 text-base">{new Date(entry.recordedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                </th>
              ))}
              {entries.length === 0 && <th className="p-4 text-center text-slate-400 font-normal italic">No entries charting available</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            
            {activeTab === 'vitals' && (
              <>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">Heart Rate</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-3 text-center border-r border-slate-100 dark:border-slate-700/50 font-medium ${e.heartRate < 60 || e.heartRate > 100 ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20' : ''}`}>
                      {e.heartRate || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">BP Systolic</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-3 text-center border-r border-slate-100 dark:border-slate-700/50 ${e.bpSystolic < 90 || e.bpSystolic > 140 ? 'text-amber-500 font-bold' : ''}`}>
                      {e.bpSystolic || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">BP Diastolic</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-3 text-center border-r border-slate-100 dark:border-slate-700/50">
                      {e.bpDiastolic || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">SpO2 (%)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-3 text-center border-r border-slate-100 dark:border-slate-700/50 ${e.o2Sat < 90 ? 'text-rose-500 font-bold' : 'text-sky-600 dark:text-sky-400'}`}>
                      {e.o2Sat || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">Temperature</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-3 text-center border-r border-slate-100 dark:border-slate-700/50 ${e.temperature > 37.5 ? 'text-amber-500 font-bold' : ''}`}>
                      {e.temperature || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">Resp Rate</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-3 text-center border-r border-slate-100 dark:border-slate-700/50">
                      {e.respRate || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
              </>
            )}

            {activeTab === 'io' && (
              <>
                <tr className="bg-sky-50 dark:bg-sky-900/10">
                  <td colSpan={entries.length + 1} className="p-2 px-4 text-xs font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wider sticky left-0">Intake</td>
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700 pl-8">Type</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-3 text-center border-r border-slate-100 dark:border-slate-700/50 text-xs">
                      {e.intakeType || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700 pl-8">Amount (ml)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-3 text-center border-r border-slate-100 dark:border-slate-700/50 font-bold text-sky-600 dark:text-sky-400">
                      {e.intakeAmount || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>

                <tr className="bg-amber-50 dark:bg-amber-900/10 border-t border-slate-200 dark:border-slate-700">
                   <td colSpan={entries.length + 1} className="p-2 px-4 text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider sticky left-0">Output</td>
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700 pl-8">Type</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-3 text-center border-r border-slate-100 dark:border-slate-700/50 text-xs">
                      {e.outputType || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30 border-b-2 border-slate-200 dark:border-slate-700">
                  <td className="p-3 font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700 pl-8">Amount (ml)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-3 text-center border-r border-slate-100 dark:border-slate-700/50 font-bold text-amber-600 dark:text-amber-400">
                      {e.outputAmount || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
              </>
            )}

            {activeTab === 'vent' && (
               <>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">Mode</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-3 text-center border-r border-slate-100 dark:border-slate-700/50 font-bold text-emerald-600 dark:text-emerald-400">
                      {e.ventilatorLog?.mode || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">FiO2 (%)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-3 text-center border-r border-slate-100 dark:border-slate-700/50">
                      {e.ventilatorLog?.fio2 || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30 border-b-2 border-slate-200 dark:border-slate-700">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">PEEP</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-3 text-center border-r border-slate-100 dark:border-slate-700/50">
                      {e.ventilatorLog?.peep || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
               </>
            )}

            {activeTab === 'neuro' && (
              <>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30 border-b-2 border-slate-200 dark:border-slate-700">
                  <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">GCS Score (3-15)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-3 text-center border-r border-slate-100 dark:border-slate-700/50 font-bold ${e.gcsScore < 8 ? 'text-rose-500' : 'text-purple-600 dark:text-purple-400'}`}>
                      {e.gcsScore || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
              </>
            )}

             {/* Bottom row for Notes across all tabs */}
             <tr className="bg-slate-50 dark:bg-slate-800/80">
               <td className="p-3 font-medium text-slate-500 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700">Notes</td>
               {entries.map((e, idx) => (
                 <td key={idx} className="p-3 text-xs text-slate-500 border-r border-slate-200 dark:border-slate-700/50 max-w-[150px] truncate" title={e.notes}>
                   {e.notes || '-'}
                 </td>
               ))}
               {entries.length === 0 && <td></td>}
             </tr>

          </tbody>
        </table>
      </div>

      <FlowsheetEntryModal 
        isOpen={showEntryModal} 
        onClose={() => setShowEntryModal(false)}
        encounterId={Number(encounterId)}
        onSuccess={() => {
          setShowEntryModal(false);
          fetchFlowsheetData();
        }}
      />
    </div>
  );
};
