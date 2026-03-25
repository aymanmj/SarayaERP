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
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Activity className="w-8 h-8 text-sky-400" /> السجل السريري (Flowsheet)
          </h1>
          <p className="text-slate-400 text-sm mt-1 flex items-center gap-2">
            <span>تسلسل زمني للمريض رقم:</span> <span className="text-sky-400 font-bold">#{encounterId}</span>
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center hidden md:block border-l border-slate-800 pl-6">
             <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">توازن السوائل (I/O)</p>
             <p className={`text-2xl font-black ${ioBalance.balance < 0 ? 'text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]'}`}>
               <span dir="ltr">{ioBalance.balance > 0 ? '+' : ''}{ioBalance.balance} ml</span>
             </p>
          </div>
          <button 
            onClick={() => setShowEntryModal(true)} 
            className="px-6 py-3 bg-sky-600 font-bold text-white rounded-xl hover:bg-sky-500 transition-colors flex items-center gap-2 shadow-lg shadow-sky-900/40"
          >
            <PlusCircle className="w-5 h-5" /> إدراج قراءة جديدة
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-px">
        <button 
          onClick={() => setActiveTab('vitals')}
          className={`px-5 py-3 flex items-center gap-2 font-bold rounded-t-xl transition-colors ${activeTab === 'vitals' ? 'bg-slate-900 border-t border-l border-r border-slate-800 text-sky-400' : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'}`}
        >
          <Activity className="w-4 h-4" /> العلامات الحيوية
        </button>
        <button 
          onClick={() => setActiveTab('io')}
          className={`px-5 py-3 flex items-center gap-2 font-bold rounded-t-xl transition-colors ${activeTab === 'io' ? 'bg-slate-900 border-t border-l border-r border-slate-800 text-blue-400' : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'}`}
        >
          <Droplets className="w-4 h-4" /> توازن السوائل
        </button>
        <button 
          onClick={() => setActiveTab('vent')}
          className={`px-5 py-3 flex items-center gap-2 font-bold rounded-t-xl transition-colors ${activeTab === 'vent' ? 'bg-slate-900 border-t border-l border-r border-slate-800 text-emerald-400' : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'}`}
        >
          <Wind className="w-4 h-4" /> التنفس الصناعي
        </button>
        <button 
          onClick={() => setActiveTab('neuro')}
          className={`px-5 py-3 flex items-center gap-2 font-bold rounded-t-xl transition-colors ${activeTab === 'neuro' ? 'bg-slate-900 border-t border-l border-r border-slate-800 text-purple-400' : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'}`}
        >
          <BrainCircuit className="w-4 h-4" /> الأعصاب
        </button>
      </div>

      {/* Grid Container */}
      <div className="bg-slate-900 rounded-b-xl rounded-tl-xl shadow-xl border border-slate-800 overflow-x-auto custom-scrollbar">
        <table className="w-full text-right text-sm whitespace-nowrap">
          <thead className="bg-slate-950 text-slate-300 font-bold sticky top-0 border-b border-slate-800">
            <tr>
              <th className="p-4 w-40 bg-slate-950 sticky right-0 z-10 border-l border-slate-800 border-b border-slate-800 drop-shadow-md">المؤشر / الوقت</th>
              {entries.map((entry, idx) => (
                <th key={idx} className="p-4 min-w-[120px] text-center border-l border-slate-800 border-b border-slate-800">
                  <div className="flex items-center justify-center flex-col gap-1">
                    <span className="text-xs text-slate-500 font-bold">{new Date(entry.recordedAt).toLocaleDateString('ar-LY', { month: 'short', day: 'numeric' })}</span>
                    <span className="text-sky-400 text-base drop-shadow-[0_0_8px_rgba(56,189,248,0.5)] bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-800">{new Date(entry.recordedAt).toLocaleTimeString('ar-LY', {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                </th>
              ))}
              {entries.length === 0 && <th className="p-4 text-center text-slate-500 font-bold border-b border-slate-800">لا توجد قراءات حتى الآن</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            
            {activeTab === 'vitals' && (
              <>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">نبض القلب (HR)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-4 text-center border-l border-slate-800 font-bold text-lg ${e.heartRate < 60 || e.heartRate > 100 ? 'text-rose-400 bg-rose-950/20' : 'text-slate-300'}`}>
                      {e.heartRate || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">ضغط الدم الانقباضي</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-4 text-center border-l border-slate-800 font-bold text-lg ${e.bpSystolic < 90 || e.bpSystolic > 140 ? 'text-amber-400 bg-amber-950/20' : 'text-slate-300'}`}>
                      {e.bpSystolic || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">ضغط الدم الانبساطي</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-4 text-center border-l border-slate-800 font-bold text-lg text-slate-300">
                      {e.bpDiastolic || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">الأكسجين (SpO2 %)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-4 text-center border-l border-slate-800 font-bold text-lg ${e.o2Sat < 90 ? 'text-rose-400 bg-rose-950/20 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'text-sky-400'}`}>
                      {e.o2Sat || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">الحرارة (Temp)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-4 text-center border-l border-slate-800 font-bold text-lg ${e.temperature > 37.5 ? 'text-amber-400 bg-amber-950/20' : 'text-slate-300'}`}>
                      {e.temperature || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">معدل التنفس (RR)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-4 text-center border-l border-slate-800 font-bold text-lg text-slate-300">
                      {e.respRate || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
              </>
            )}

            {activeTab === 'io' && (
              <>
                <tr className="bg-sky-950/20">
                  <td colSpan={entries.length + 1} className="p-3 px-5 text-sm font-bold text-sky-400 sticky right-0">المدخلات (Intake)</td>
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors border-t border-slate-800">
                  <td className="p-4 font-bold text-slate-400 bg-slate-950 sticky right-0 z-10 border-l border-slate-800 pr-10">النوع</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-4 text-center border-l border-slate-800 text-slate-300">
                      {e.intakeType || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-400 bg-slate-950 sticky right-0 z-10 border-l border-slate-800 pr-10">الكمية (ml)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-4 text-center border-l border-slate-800 font-bold text-lg text-sky-400">
                      {e.intakeAmount || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>

                <tr className="bg-amber-950/20 border-t border-b border-slate-800">
                   <td colSpan={entries.length + 1} className="p-3 px-5 text-sm font-bold text-amber-500 sticky right-0">المخرجات (Output)</td>
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-400 bg-slate-950 sticky right-0 z-10 border-l border-slate-800 pr-10">النوع</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-4 text-center border-l border-slate-800 text-slate-300">
                      {e.outputType || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors border-b-2 border-slate-800">
                  <td className="p-4 font-bold text-slate-400 bg-slate-950 sticky right-0 z-10 border-l border-slate-800 pr-10">الكمية (ml)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-4 text-center border-l border-slate-800 font-bold text-lg text-amber-500">
                      {e.outputAmount || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
              </>
            )}

            {activeTab === 'vent' && (
               <>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">وضع التنفس (Mode)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-4 text-center border-l border-slate-800 font-bold text-lg text-emerald-400 uppercase tracking-wider">
                      {e.ventilatorLog?.mode || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">FiO2 (%)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-4 text-center border-l border-slate-800 font-bold text-lg text-slate-300">
                      {e.ventilatorLog?.fio2 || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
                <tr className="hover:bg-slate-800/50 transition-colors border-b-2 border-slate-800">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">PEEP</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className="p-4 text-center border-l border-slate-800 font-bold text-lg text-slate-300">
                      {e.ventilatorLog?.peep || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
               </>
            )}

            {activeTab === 'neuro' && (
              <>
                <tr className="hover:bg-slate-800/50 transition-colors border-b-2 border-slate-800">
                  <td className="p-4 font-bold text-slate-300 bg-slate-950 sticky right-0 z-10 border-l border-slate-800">مقياس الغيبوبة (GCS Score)</td>
                  {entries.map((e, idx) => (
                    <td key={idx} className={`p-4 text-center border-l border-slate-800 font-bold text-lg ${e.gcsScore < 8 ? 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.5)]'}`}>
                      {e.gcsScore || '-'}
                    </td>
                  ))}
                  {entries.length === 0 && <td></td>}
                </tr>
              </>
            )}

             {/* Bottom row for Notes across all tabs */}
             <tr className="bg-slate-950">
               <td className="p-4 font-bold text-slate-500 sticky right-0 z-10 border-l border-slate-800">ملاحظات</td>
               {entries.map((e, idx) => (
                 <td key={idx} className="p-4 text-xs font-medium text-slate-400 border-l border-slate-800 whitespace-pre-wrap leading-relaxed max-w-[200px]" title={e.notes}>
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
