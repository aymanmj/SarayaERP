import React, { useState, useEffect } from 'react';
import { Syringe, PlusCircle, Play, Pause, Square, TrendingUp, AlertCircle } from 'lucide-react';
import { apiClient } from '../../../../api/apiClient';

interface Props {
  encounterId: number;
}

export const MedicationDripPanel = ({ encounterId }: Props) => {
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
      alert('Failed to start drip');
    }
  };

  const titrateDrip = async (dripId: number, currentRate: number) => {
    const rateStr = prompt(`Enter new rate (current: ${currentRate}):`);
    if (!rateStr) return;
    const newRate = Number(rateStr);
    if (isNaN(newRate)) return alert('Invalid rate');

    const reason = prompt('Reason for titration? (optional)');
    
    try {
      await apiClient.put(`/icu/drips/${dripId}/titrate`, { newRate, reason });
      fetchDrips();
    } catch (err) {
      console.error(err);
      alert('Failed to titrate');
    }
  };

  const stopDrip = async (dripId: number) => {
    if (!window.confirm('Are you sure you want to stop this infusion?')) return;
    const reason = prompt('Reason for stopping? (optional)');
    
    try {
      await apiClient.put(`/icu/drips/${dripId}/stop`, { reason });
      fetchDrips();
    } catch (err) {
      console.error(err);
      alert('Failed to stop');
    }
  };

  if (loading) return <div className="p-4 text-slate-500">Loading drips...</div>;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 rounded-t-xl">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Syringe className="w-5 h-5 text-rose-500" /> Active Continuous Infusions
        </h3>
        <button 
          onClick={() => setShowAddModal(true)} 
          className="px-3 py-1.5 bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 font-semibold rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors flex items-center gap-1.5 text-sm"
        >
          <PlusCircle className="w-4 h-4" /> Start Infusion
        </button>
      </div>

      <div className="p-4">
        {drips.length === 0 ? (
          <div className="text-center p-6 text-slate-500 flex flex-col items-center">
             <Syringe className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
             <p>No active continuous infusions.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drips.map((drip) => (
              <div key={drip.id} className="border border-rose-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="p-3 border-b border-rose-100 dark:border-slate-700 bg-rose-50/50 dark:bg-slate-800 flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 truncate pr-2" title={drip.medicationName}>
                      {drip.medicationName}
                    </h4>
                    <p className="text-xs text-slate-500">{drip.concentration || 'Standard Conc.'}</p>
                  </div>
                  <span className="flex h-2.5 w-2.5 mt-1 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                </div>
                
                <div className="p-4 text-center">
                   <p className="text-3xl font-black text-slate-800 dark:text-white my-2">
                     {drip.currentRate} <span className="text-sm font-semibold text-slate-500 tracking-wide">{drip.doseUnit}</span>
                   </p>
                   <p className="text-xs text-slate-400 mt-1">
                     Started: {new Date(drip.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                   </p>
                </div>

                <div className="grid grid-cols-2 border-t border-slate-100 dark:border-slate-700 divide-x divide-slate-100 dark:divide-slate-700">
                   <button 
                     onClick={() => titrateDrip(drip.id, drip.currentRate)}
                     className="p-2.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition flex items-center justify-center gap-1.5"
                   >
                     <TrendingUp className="w-4 h-4" /> Titrate
                   </button>
                   <button 
                     onClick={() => stopDrip(drip.id)}
                     className="p-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition flex items-center justify-center gap-1.5"
                   >
                     <Square className="w-4 h-4" /> Stop
                   </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD DRIP MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 max-w-md w-full rounded-xl shadow-xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Start Continuous Infusion</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <form onSubmit={startDrip} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Medication Name</label>
                <input 
                  required
                  type="text" 
                  value={newDrip.medicationName} 
                  onChange={e => setNewDrip({...newDrip, medicationName: e.target.value})}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg"
                  placeholder="e.g. Norepinephrine, Propofol..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Concentration (Optional)</label>
                <input 
                  type="text" 
                  value={newDrip.concentration} 
                  onChange={e => setNewDrip({...newDrip, concentration: e.target.value})}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg"
                  placeholder="e.g. 4mg/250ml"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Initial Rate</label>
                  <input 
                    required
                    type="number" 
                    step="0.01"
                    value={newDrip.currentRate} 
                    onChange={e => setNewDrip({...newDrip, currentRate: e.target.value})}
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg"
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dose Unit</label>
                  <select 
                    value={newDrip.doseUnit} 
                    onChange={e => setNewDrip({...newDrip, doseUnit: e.target.value})}
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg"
                  >
                    <option value="ml/hr">ml/hr</option>
                    <option value="mcg/kg/min">mcg/kg/min</option>
                    <option value="mcg/min">mcg/min</option>
                    <option value="mg/hr">mg/hr</option>
                    <option value="units/hr">units/hr</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-slate-600 bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 flex items-center gap-2">
                  <Play className="w-4 h-4" /> Start Drip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
