import React, { useState, useEffect } from 'react';
import { Monitor, PlusCircle, StopCircle, Receipt } from 'lucide-react';
import { apiClient } from '../../../../api/apiClient';

interface Props {
  encounterId: number;
}

export const EquipmentPanel = ({ encounterId }: Props) => {
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEq, setNewEq] = useState({
    equipmentType: 'VENTILATOR',
    equipmentName: '',
    dailyRate: '',
    notes: ''
  });

  useEffect(() => {
    fetchEquipment();
  }, [encounterId]);

  const fetchEquipment = async () => {
    try {
      const res = await apiClient.get(`/icu/equipment/${encounterId}`);
      setEquipmentList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/icu/equipment', {
        encounterId,
        equipmentType: newEq.equipmentType,
        equipmentName: newEq.equipmentName,
        dailyRate: newEq.dailyRate ? Number(newEq.dailyRate) : undefined,
        notes: newEq.notes
      });
      setShowAddModal(false);
      setNewEq({ equipmentType: 'VENTILATOR', equipmentName: '', dailyRate: '', notes: '' });
      fetchEquipment();
    } catch (err) {
      console.error(err);
      alert('Failed to start equipment tracking');
    }
  };

  const stopEquipment = async (usageId: number) => {
    if (!window.confirm('Stop tracking this equipment? This stops billing counting.')) return;
    try {
      await apiClient.put(`/icu/equipment/${usageId}/stop`);
      fetchEquipment();
    } catch (err) {
      console.error(err);
      alert('Failed to stop');
    }
  };

  if (loading) return <div className="p-4 text-slate-500">Loading equipment...</div>;

  const activeCount = equipmentList.filter(e => !e.stoppedAt).length;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 rounded-t-xl">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Monitor className="w-5 h-5 text-indigo-500" /> Equipment Usage
          {activeCount > 0 && <span className="ml-2 bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{activeCount} Active</span>}
        </h3>
        <button 
          onClick={() => setShowAddModal(true)} 
          className="px-3 py-1.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 font-semibold rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1.5 text-sm"
        >
          <PlusCircle className="w-4 h-4" /> Add Equipment
        </button>
      </div>

      <div className="p-0">
        {equipmentList.length === 0 ? (
          <div className="text-center p-6 text-slate-500 flex flex-col items-center">
             <Monitor className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
             <p>No equipment currently tracked.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 font-medium">
              <tr>
                <th className="p-3 pl-4">Equipment Type</th>
                <th className="p-3">Details</th>
                <th className="p-3">Time Started</th>
                <th className="p-3">Time Stopped</th>
                <th className="p-3">Daily Fee</th>
                <th className="p-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {equipmentList.map(eq => (
                <tr key={eq.id} className={!eq.stoppedAt ? 'bg-indigo-50/30' : ''}>
                  <td className="p-3 pl-4 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    {!eq.stoppedAt && <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>}
                    {eq.equipmentType.replace('_', ' ')}
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{eq.equipmentName || '-'}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{new Date(eq.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">
                    {eq.stoppedAt ? new Date(eq.stoppedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : <span className="text-emerald-500 font-medium tracking-wide">RUNNING</span>}
                  </td>
                  <td className="p-3 font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-slate-400" /> {eq.dailyRate ? `${eq.dailyRate} LYD` : '-'}
                  </td>
                  <td className="p-3 pr-4 text-right">
                    {!eq.stoppedAt && (
                      <button 
                        onClick={() => stopEquipment(eq.id)}
                        className="px-3 py-1 bg-white border border-rose-200 text-rose-600 rounded flex items-center gap-1 hover:bg-rose-50 text-xs font-semibold uppercase tracking-wider ml-auto"
                      >
                        <StopCircle className="w-3.5 h-3.5" /> Stop
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ADD EQUIPMENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 max-w-sm w-full rounded-xl shadow-xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Track Equipment</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <form onSubmit={startEquipment} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Equipment Type</label>
                <select 
                  value={newEq.equipmentType} 
                  onChange={e => setNewEq({...newEq, equipmentType: e.target.value})}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg"
                >
                  <option value="VENTILATOR">Ventilator</option>
                  <option value="CARDIAC_MONITOR">Cardiac Monitor</option>
                  <option value="INFUSION_PUMP">Infusion/Syringe Pump</option>
                  <option value="FEEDING_PUMP">Enteral Feeding Pump</option>
                  <option value="DIALYSIS_CRRT">CRRT / Dialysis</option>
                  <option value="ECMO">ECMO</option>
                  <option value="HEATER_COOLER">Heater/Cooler</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Specific Name/ID (Optional)</label>
                <input 
                  type="text" 
                  value={newEq.equipmentName} 
                  onChange={e => setNewEq({...newEq, equipmentName: e.target.value})}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg"
                  placeholder="e.g. Vent #12, Pump A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Daily Billing Rate (LYD)</label>
                <input 
                  type="number" 
                  value={newEq.dailyRate} 
                  onChange={e => setNewEq({...newEq, dailyRate: e.target.value})}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg"
                  placeholder="e.g. 500"
                />
                <p className="text-xs text-slate-500 mt-1">Leave blank if integrated to ward fee.</p>
              </div>
              
              <div className="pt-2 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700 mt-6">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-slate-600 bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold">Start Tracking</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
