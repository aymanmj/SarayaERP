import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../../utils/api'; // Assume api module exists

export const IcuFlowsheet = () => {
  const { encounterId } = useParams<{ encounterId: string }>();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlowsheet();
  }, [encounterId]);

  const fetchFlowsheet = async () => {
    try {
      const res = await api.get(`/icu/flowsheet/${encounterId}`);
      // Mapping API response shape assuming res.data is an array of Flowsheets
      if (res.data && res.data.length > 0) {
        setEntries(res.data[0].entries || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addVitals = async () => {
    try {
      await api.post('/icu/flowsheet', {
        encounterId: Number(encounterId),
        shiftName: 'MORNING', // Just illustrative defaults
        heartRate: Math.floor(Math.random() * (120 - 60 + 1) + 60),
        bpSystolic: 120,
        bpDiastolic: 80,
        intakeAmount: 100,
        outputAmount: 50
      });
      fetchFlowsheet();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading Flowsheet...</div>;

  return (
    <div className="p-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">ICU Clinical Flowsheet</h1>
        <button onClick={addVitals} className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">
          + Target Entry (15m Interval)
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow overflow-x-auto border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-200 dark:border-slate-600">
            <tr>
              <th className="p-3">Time</th>
              <th className="p-3">HR</th>
              <th className="p-3">BP (Sys/Dia)</th>
              <th className="p-3">Temp</th>
              <th className="p-3">O2 Sat</th>
              <th className="p-3">Intake (ml)</th>
              <th className="p-3">Output (ml)</th>
              <th className="p-3">GCS</th>
              <th className="p-3">Vent Mode</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500">No chart entries for this shift.</td>
              </tr>
            ) : (
              entries.map((e, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="p-3 font-medium">{new Date(e.recordedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                  <td className={`p-3 font-bold ${e.heartRate < 60 || e.heartRate > 100 ? 'text-red-500' : ''}`}>{e.heartRate || '-'}</td>
                  <td className="p-3">{e.bpSystolic ? `${e.bpSystolic}/${e.bpDiastolic}` : '-'}</td>
                  <td className="p-3">{e.temperature || '-'}</td>
                  <td className="p-3">{e.o2Sat || '-'}</td>
                  <td className="p-3 text-sky-600 dark:text-sky-400 font-semibold">{e.intakeAmount || '-'}</td>
                  <td className="p-3 text-amber-600 dark:text-amber-400 font-semibold">{e.outputAmount || '-'}</td>
                  <td className="p-3">{e.gcsScore || '-'}</td>
                  <td className="p-3">{e.ventilatorLog?.mode || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
