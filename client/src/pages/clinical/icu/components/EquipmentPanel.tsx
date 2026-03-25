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

  if (loading) return <div className="p-4 text-center text-slate-500">جاري تحميل البيانات...</div>;

  const activeCount = equipmentList.filter(e => !e.stoppedAt).length;

  return (
    <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 overflow-hidden" dir="rtl">
      <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-950/50">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Monitor className="w-5 h-5 text-indigo-400" /> الأجهزة الموصولة
          {activeCount > 0 && <span className="mr-2 bg-indigo-900/40 text-indigo-300 border border-indigo-500/30 text-[10px] px-2.5 py-1 rounded-lg font-bold tracking-wide">{activeCount} قيد الاستخدام</span>}
        </h3>
        <button 
          onClick={() => setShowAddModal(true)} 
          className="px-4 py-2 bg-indigo-900/30 text-indigo-400 border border-indigo-500/30 font-semibold rounded-xl hover:bg-indigo-900/50 transition-colors flex items-center gap-2 text-sm shadow-inner"
        >
          <PlusCircle className="w-4 h-4" /> إضافة جهاز
        </button>
      </div>

      <div className="p-0 overflow-x-auto">
        {equipmentList.length === 0 ? (
          <div className="text-center p-8 text-slate-500 flex flex-col items-center bg-slate-950/30 m-4 rounded-xl border border-dashed border-slate-800">
             <Monitor className="w-12 h-12 text-slate-700 mb-3" />
             <p>لا يوجد أجهزة موصولة حالياً.</p>
          </div>
        ) : (
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-950 text-slate-400 font-bold text-xs border-b border-slate-800">
              <tr>
                <th className="p-4">نوع الجهاز</th>
                <th className="p-4">التفاصيل</th>
                <th className="p-4">وقت التوصيل</th>
                <th className="p-4">وقت الفصل</th>
                <th className="p-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {equipmentList.map(eq => (
                <tr key={eq.id} className={`${!eq.stoppedAt ? 'bg-indigo-900/10' : 'bg-transparent'} hover:bg-slate-800/50 transition-colors`}>
                  <td className="p-4 font-bold text-white flex items-center gap-2">
                    {!eq.stoppedAt && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] inline-block animate-pulse"></span>}
                    {eq.equipmentType.replace('_', ' ')}
                  </td>
                  <td className="p-4 text-slate-400">{eq.equipmentName || '-'}</td>
                  <td className="p-4 text-slate-400">{new Date(eq.startedAt).toLocaleString('ar-LY', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</td>
                  <td className="p-4 text-slate-400">
                    {eq.stoppedAt ? new Date(eq.stoppedAt).toLocaleString('ar-LY', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : <span className="text-emerald-400 font-bold bg-emerald-900/20 px-2 py-1 rounded tracking-wide border border-emerald-500/20 text-xs">متصل حالياً</span>}
                  </td>
                  <td className="p-4 text-center">
                    {!eq.stoppedAt && (
                      <button 
                        onClick={() => stopEquipment(eq.id)}
                        className="px-3 py-1.5 bg-transparent border border-rose-500/50 text-rose-400 hover:bg-rose-900/30 hover:border-rose-400 rounded-lg flex items-center gap-1.5 font-bold transition-all mx-auto text-xs"
                      >
                        <StopCircle className="w-4 h-4" /> فصل الجهاز
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 max-w-sm w-full rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-950">
              <h3 className="font-bold text-lg text-white">إضافة جهاز</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
            </div>
            <form onSubmit={startEquipment} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">نوع الجهاز</label>
                <select 
                  value={newEq.equipmentType} 
                  onChange={e => setNewEq({...newEq, equipmentType: e.target.value})}
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="VENTILATOR">تنفّس صناعي (Ventilator)</option>
                  <option value="CARDIAC_MONITOR">مراقب قلب (Cardiac Monitor)</option>
                  <option value="INFUSION_PUMP">مضخة تسريب (Infusion Pump)</option>
                  <option value="FEEDING_PUMP">مضخة تغذية (Feeding Pump)</option>
                  <option value="DIALYSIS_CRRT">غسيل كلوي (CRRT / Dialysis)</option>
                  <option value="ECMO">إيكمو (ECMO)</option>
                  <option value="HEATER_COOLER">جهاز تدفئة/تبريد</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">اسم/رقم الجهاز (اختياري)</label>
                <input 
                  type="text" 
                  value={newEq.equipmentName} 
                  onChange={e => setNewEq({...newEq, equipmentName: e.target.value})}
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="مثال: Vent #12"
                />
              </div>
              
              <div className="pt-6 flex gap-3 border-t border-slate-800 mt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors">إلغاء</button>
                <button type="submit" className="flex-[2] py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 font-bold transition-colors shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2">تأكيد الإضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
