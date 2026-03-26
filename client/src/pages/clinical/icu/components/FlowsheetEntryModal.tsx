import React, { useState } from 'react';
import { apiClient } from '../../../../api/apiClient';
import { X, Save, Activity, HeartPulse, Droplets, Wind, FileText } from 'lucide-react';

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
      const payload: any = { encounterId, shiftName: formData.shiftName };
      const numericFields = ['heartRate', 'bpSystolic', 'bpDiastolic', 'temperature', 'o2Sat', 'respRate', 'gcsScore', 'intakeAmount', 'outputAmount', 'ventFio2', 'ventPeep'];
      numericFields.forEach(field => {
        if (formData[field as keyof typeof formData] !== '') payload[field] = Number(formData[field as keyof typeof formData]);
      });
      const stringFields = ['intakeType', 'outputType', 'ventMode', 'notes'];
      stringFields.forEach(field => {
        if (formData[field as keyof typeof formData] !== '') payload[field] = formData[field as keyof typeof formData];
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

  const inputCls = "w-full p-3 bg-slate-950 border border-slate-700 text-white placeholder-slate-600 rounded-xl focus:outline-none focus:border-sky-500 transition-colors text-sm";
  const labelCls = "block text-xs font-bold text-slate-400 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" dir="rtl">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0">
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-sky-400" /> New Clinical Charting Entry
          </h2>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <form id="vitals-form" onSubmit={handleSubmit} className="space-y-8">

            {/* Shift */}
            <div className="max-w-xs">
              <label className={labelCls}>Shift Name</label>
              <select name="shiftName" value={formData.shiftName} onChange={handleChange} className={inputCls}>
                <option value="MORNING">Morning (08:00 – 16:00)</option>
                <option value="EVENING">Evening (16:00 – 00:00)</option>
                <option value="NIGHT">Night (00:00 – 08:00)</option>
              </select>
            </div>

            <hr className="border-slate-800" />

            {/* Vital Signs */}
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2 mb-4">
                <HeartPulse className="w-5 h-5 text-rose-400" /> Vital Signs
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <label className={labelCls}>Heart Rate (bpm)</label>
                  <input type="number" name="heartRate" value={formData.heartRate} onChange={handleChange} className={inputCls} placeholder="80" dir="ltr" />
                </div>
                <div>
                  <label className={labelCls}>BP Systolic</label>
                  <input type="number" name="bpSystolic" value={formData.bpSystolic} onChange={handleChange} className={inputCls} placeholder="120" dir="ltr" />
                </div>
                <div>
                  <label className={labelCls}>BP Diastolic</label>
                  <input type="number" name="bpDiastolic" value={formData.bpDiastolic} onChange={handleChange} className={inputCls} placeholder="80" dir="ltr" />
                </div>
                <div>
                  <label className={labelCls}>SpO2 (%)</label>
                  <input type="number" name="o2Sat" value={formData.o2Sat} onChange={handleChange} className={inputCls} placeholder="98" dir="ltr" />
                </div>
                <div>
                  <label className={labelCls}>Temp (°C)</label>
                  <input type="number" step="0.1" name="temperature" value={formData.temperature} onChange={handleChange} className={inputCls} placeholder="37.2" dir="ltr" />
                </div>
                <div>
                  <label className={labelCls}>Resp Rate</label>
                  <input type="number" name="respRate" value={formData.respRate} onChange={handleChange} className={inputCls} placeholder="16" dir="ltr" />
                </div>
                <div>
                  <label className={labelCls}>GCS Score (3-15)</label>
                  <input type="number" min="3" max="15" name="gcsScore" value={formData.gcsScore} onChange={handleChange} className={inputCls} placeholder="15" dir="ltr" />
                </div>
              </div>
            </div>

            <hr className="border-slate-800" />

            {/* Fluid Balance */}
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2 mb-4">
                <Droplets className="w-5 h-5 text-blue-400" /> Fluid Balance (I/O)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Intake */}
                <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sky-400 mb-4 pb-2 border-b border-sky-500/20 text-sm">Intake</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Type</label>
                      <input type="text" name="intakeType" value={formData.intakeType} onChange={handleChange} className={inputCls} placeholder="IV, PO" dir="ltr" />
                    </div>
                    <div>
                      <label className={labelCls}>Amount (ml)</label>
                      <input type="number" name="intakeAmount" value={formData.intakeAmount} onChange={handleChange} className={inputCls} placeholder="0" dir="ltr" />
                    </div>
                  </div>
                </div>
                {/* Output */}
                <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-amber-400 mb-4 pb-2 border-b border-amber-500/20 text-sm">Output</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Type</label>
                      <input type="text" name="outputType" value={formData.outputType} onChange={handleChange} className={inputCls} placeholder="Urine, Drain" dir="ltr" />
                    </div>
                    <div>
                      <label className={labelCls}>Amount (ml)</label>
                      <input type="number" name="outputAmount" value={formData.outputAmount} onChange={handleChange} className={inputCls} placeholder="0" dir="ltr" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-slate-800" />

            {/* Ventilator */}
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2 mb-4">
                <Wind className="w-5 h-5 text-emerald-400" /> Ventilator Settings (Optional)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Vent Mode</label>
                  <select name="ventMode" value={formData.ventMode} onChange={handleChange} className={inputCls}>
                    <option value="">-- None --</option>
                    <option value="SIMV">SIMV</option>
                    <option value="AC">A/C</option>
                    <option value="CPAP">CPAP</option>
                    <option value="BIPAP">BiPAP</option>
                    <option value="PSV">PSV</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>FiO2 (%)</label>
                  <input type="number" name="ventFio2" value={formData.ventFio2} onChange={handleChange} className={inputCls} placeholder="40" dir="ltr" />
                </div>
                <div>
                  <label className={labelCls}>PEEP (cmH2O)</label>
                  <input type="number" name="ventPeep" value={formData.ventPeep} onChange={handleChange} className={inputCls} placeholder="5" dir="ltr" />
                </div>
              </div>
            </div>

            {/* Clinical Notes */}
            <div>
              <label className={labelCls}>Nursing / Clinical Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                className={`${inputCls} resize-none`}
                placeholder="Enter any additional observations..."
              />
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex justify-start gap-3 shrink-0">
          <button
            type="submit"
            form="vitals-form"
            disabled={loading}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg shadow-sky-900/30 transition flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? <Activity className="w-5 h-5 animate-pulse" /> : <Save className="w-5 h-5" />}
            Save Entry
          </button>
          <button onClick={onClose} className="px-5 py-2.5 text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 font-bold rounded-xl transition text-sm">
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
};
