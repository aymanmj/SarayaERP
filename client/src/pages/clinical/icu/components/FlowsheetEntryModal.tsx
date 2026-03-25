import React, { useState } from 'react';
import { apiClient } from '../../../../api/apiClient';
import { X, Save, Activity, HeartPulse, Droplets, Wind } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  encounterId: number;
  onSuccess: () => void;
}

export const FlowsheetEntryModal = ({ isOpen, onClose, encounterId, onSuccess }: Props) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    shiftName: 'MORNING',
    heartRate: '',
    bpSystolic: '',
    bpDiastolic: '',
    temperature: '',
    o2Sat: '',
    respRate: '',
    gcsScore: '',
    intakeType: '',
    intakeAmount: '',
    outputType: '',
    outputAmount: '',
    ventMode: '',
    ventFio2: '',
    ventPeep: '',
    notes: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Convert empty strings to null/undefined or numbers
      const payload: any = {
        encounterId,
        shiftName: formData.shiftName
      };

      const numericFields = ['heartRate', 'bpSystolic', 'bpDiastolic', 'temperature', 'o2Sat', 'respRate', 'gcsScore', 'intakeAmount', 'outputAmount', 'ventFio2', 'ventPeep'];
      
      numericFields.forEach(field => {
        if (formData[field as keyof typeof formData] !== '') {
          payload[field] = Number(formData[field as keyof typeof formData]);
        }
      });

      const stringFields = ['intakeType', 'outputType', 'ventMode', 'notes'];
      stringFields.forEach(field => {
        if (formData[field as keyof typeof formData] !== '') {
          payload[field] = formData[field as keyof typeof formData];
        }
      });

      await apiClient.post('/icu/flowsheet', payload);
      onSuccess();
    } catch (err) {
      console.error(err);
      alert('Failed to save flowsheet entry');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-4xl rounded-2xl shadow-xl flex flex-col md:max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-sky-600" /> 
            New Clinical Charting Entry
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Area */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          <form id="vitals-form" onSubmit={handleSubmit} className="space-y-8">
            
            {/* Shift Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Shift Name</label>
                <select 
                  name="shiftName" 
                  value={formData.shiftName} 
                  onChange={handleChange}
                  className="w-full p-2.5 bg-white border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                >
                  <option value="MORNING">Morning (08:00 - 16:00)</option>
                  <option value="EVENING">Evening (16:00 - 00:00)</option>
                  <option value="NIGHT">Night (00:00 - 08:00)</option>
                </select>
              </div>
            </div>

            <hr className="border-slate-200 dark:border-slate-700" />

            {/* Vital Signs */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
                <HeartPulse className="w-5 h-5 text-rose-500" /> Vital Signs
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Heart Rate (bpm)</label>
                  <input type="number" name="heartRate" value={formData.heartRate} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. 80" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">BP Systolic</label>
                  <input type="number" name="bpSystolic" value={formData.bpSystolic} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. 120" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">BP Diastolic</label>
                  <input type="number" name="bpDiastolic" value={formData.bpDiastolic} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. 80" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">SpO2 (%)</label>
                  <input type="number" name="o2Sat" value={formData.o2Sat} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. 98" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Temp (°C)</label>
                  <input type="number" step="0.1" name="temperature" value={formData.temperature} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. 37.2" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Resp Rate</label>
                  <input type="number" name="respRate" value={formData.respRate} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. 16" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">GCS Score (3-15)</label>
                  <input type="number" min="3" max="15" name="gcsScore" value={formData.gcsScore} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. 15" />
                </div>
              </div>
            </div>

            <hr className="border-slate-200 dark:border-slate-700" />

            {/* I/O Balance */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
                <Droplets className="w-5 h-5 text-blue-500" /> Fluid Balance (I/O)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-700/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                
                {/* Intake */}
                <div>
                  <h4 className="font-medium text-sky-700 dark:text-sky-400 mb-3 border-b border-sky-200 dark:border-sky-800/50 pb-2">Intake</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Type</label>
                      <input type="text" name="intakeType" value={formData.intakeType} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. IV, PO" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Amount (ml)</label>
                      <input type="number" name="intakeAmount" value={formData.intakeAmount} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="0" />
                    </div>
                  </div>
                </div>

                {/* Output */}
                <div>
                  <h4 className="font-medium text-amber-700 dark:text-amber-400 mb-3 border-b border-amber-200 dark:border-amber-800/50 pb-2">Output</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Type</label>
                      <input type="text" name="outputType" value={formData.outputType} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. Urine, Drain" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Amount (ml)</label>
                      <input type="number" name="outputAmount" value={formData.outputAmount} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="0" />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <hr className="border-slate-200 dark:border-slate-700" />

            {/* Ventilator Settings */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-4">
                <Wind className="w-5 h-5 text-emerald-500" /> Ventilator Settings (Optional)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Vent Mode</label>
                  <select name="ventMode" value={formData.ventMode} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg">
                    <option value="">-- None --</option>
                    <option value="SIMV">SIMV</option>
                    <option value="AC">A/C</option>
                    <option value="CPAP">CPAP</option>
                    <option value="BIPAP">BiPAP</option>
                    <option value="PSV">PSV</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">FiO2 (%)</label>
                  <input type="number" name="ventFio2" value={formData.ventFio2} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. 40" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">PEEP (cmH2O)</label>
                  <input type="number" name="ventPeep" value={formData.ventPeep} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg" placeholder="e.g. 5" />
                </div>
              </div>
            </div>

            {/* Clinical Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nursing/Clinical Notes</label>
              <textarea 
                name="notes" 
                value={formData.notes} 
                onChange={handleChange}
                rows={3} 
                className="w-full p-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:ring-2 focus:ring-sky-500"
                placeholder="Enter any additional observations..."
              ></textarea>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button 
            type="submit" 
            form="vitals-form"
            disabled={loading}
            className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Activity className="w-5 h-5 animate-pulse" /> : <Save className="w-5 h-5" />}
            Save Entry
          </button>
        </div>

      </div>
    </div>
  );
};
