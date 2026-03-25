import React, { useState } from 'react';
import { GcsCalculator } from './GcsCalculator';
import { Activity, BrainCircuit, HeartPulse, Stethoscope, FileText } from 'lucide-react';
import { apiClient } from '../../../../api/apiClient';

interface Props {
  encounterId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export const DailyAssessmentForm = ({ encounterId, onSuccess, onCancel }: Props) => {
  const [loading, setLoading] = useState(false);
  
  // Scores
  const [gcsTotal, setGcsTotal] = useState<number>(0);
  const [gcsEye, setGcsEye] = useState<number>(0);
  const [gcsVerbal, setGcsVerbal] = useState<number>(0);
  const [gcsMotor, setGcsMotor] = useState<number>(0);
  
  const [formData, setFormData] = useState({
    assessmentDate: new Date().toISOString().split('T')[0],
    sofaScore: '',
    apacheIIScore: '',
    rassScore: '',
    painScore: '',
    
    // Sedation
    pupilLeft: 'REACTIVE',
    pupilRight: 'REACTIVE',
    sedationTarget: '',
    
    // Respiratory
    oxygenDevice: 'ROOM_AIR',
    fio2: '',
    
    // Lines/Drains
    centralLine: 'ABSENT',
    arterialLine: 'ABSENT',
    foleyPresent: false,
    
    // Skin
    skinIntegrity: 'INTACT',
    pressureUlcer: 'NONE',
    woundNotes: '',
    
    // Plan
    dailyGoals: '',
    nutritionPlan: '',
    mobilityPlan: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    });
  };

  const handleGcsChange = (total: number, eye: number, verbal: number, motor: number) => {
    setGcsTotal(total);
    setGcsEye(eye);
    setGcsVerbal(verbal);
    setGcsMotor(motor);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = {
        encounterId,
        assessmentDate: formData.assessmentDate,
        gcsTotal: gcsTotal || null,
        gcsEye: gcsEye || null,
        gcsVerbal: gcsVerbal || null,
        gcsMotor: gcsMotor || null,
        sofaScore: formData.sofaScore ? Number(formData.sofaScore) : null,
        apacheIIScore: formData.apacheIIScore ? Number(formData.apacheIIScore) : null,
        rassScore: formData.rassScore ? Number(formData.rassScore) : null,
        painScore: formData.painScore ? Number(formData.painScore) : null,
        fio2: formData.fio2 ? Number(formData.fio2) : null,
        
        pupilLeft: formData.pupilLeft,
        pupilRight: formData.pupilRight,
        sedationTarget: formData.sedationTarget,
        oxygenDevice: formData.oxygenDevice,
        centralLine: formData.centralLine,
        arterialLine: formData.arterialLine,
        foleyPresent: formData.foleyPresent,
        skinIntegrity: formData.skinIntegrity,
        pressureUlcer: formData.pressureUlcer,
        woundNotes: formData.woundNotes,
        dailyGoals: formData.dailyGoals,
        nutritionPlan: formData.nutritionPlan,
        mobilityPlan: formData.mobilityPlan
      };

      await apiClient.post('/icu/assessments', payload);
      onSuccess();
    } catch (err) {
      console.error(err);
      alert('Failed to save assessment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 max-w-5xl mx-auto">
      <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/80 rounded-t-xl">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" /> Daily Clinical Assessment
        </h2>
        <div>
          <input 
            type="date" 
            name="assessmentDate" 
            value={formData.assessmentDate}
            onChange={handleChange}
            className="p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm"
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-8">
        
        {/* Section 1: GCS */}
        <div className="space-y-4">
          <GcsCalculator onChange={handleGcsChange} />
        </div>

        {/* Section 2: Other Scores */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">SOFA Score</label>
            <input type="number" name="sofaScore" value={formData.sofaScore} onChange={handleChange} className="w-full p-2.5 bg-white border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:ring-2 focus:ring-sky-500" placeholder="0-24" min="0" max="24" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">APACHE II Score</label>
            <input type="number" name="apacheIIScore" value={formData.apacheIIScore} onChange={handleChange} className="w-full p-2.5 bg-white border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:ring-2 focus:ring-sky-500" placeholder="0-71" min="0" max="71" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">RASS Score</label>
            <input type="number" name="rassScore" value={formData.rassScore} onChange={handleChange} className="w-full p-2.5 bg-white border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:ring-2 focus:ring-sky-500" placeholder="-5 to +4" min="-5" max="4" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Pain Score (NRS)</label>
            <input type="number" name="painScore" value={formData.painScore} onChange={handleChange} className="w-full p-2.5 bg-white border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:ring-2 focus:ring-sky-500" placeholder="0-10" min="0" max="10" />
          </div>
        </div>

        <hr className="border-slate-200 dark:border-slate-700" />

        {/* Section 3: Sedation & Respiratory */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
               <BrainCircuit className="w-4 h-4 text-purple-500" /> Neurological View
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-xs font-medium text-slate-500 mb-1">Left Pupil</label>
                 <select name="pupilLeft" value={formData.pupilLeft} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm">
                   <option value="REACTIVE">Reactive</option>
                   <option value="SLUGGISH">Sluggish</option>
                   <option value="FIXED">Fixed</option>
                   <option value="PINPOINT">Pinpoint</option>
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-medium text-slate-500 mb-1">Right Pupil</label>
                 <select name="pupilRight" value={formData.pupilRight} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm">
                   <option value="REACTIVE">Reactive</option>
                   <option value="SLUGGISH">Sluggish</option>
                   <option value="FIXED">Fixed</option>
                   <option value="PINPOINT">Pinpoint</option>
                 </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sedation Target Goal</label>
              <input type="text" name="sedationTarget" value={formData.sedationTarget} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm" placeholder="e.g. RASS -2 to -1" />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
               {/* Note: I'm just substituting lungs since apparently Lungs is not exported */}
               <Activity className="w-4 h-4 text-emerald-500" /> Respiratory Support
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-xs font-medium text-slate-500 mb-1">Oxygen Device</label>
                 <select name="oxygenDevice" value={formData.oxygenDevice} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm">
                   <option value="ROOM_AIR">Room Air</option>
                   <option value="NASAL_CANNULA">Nasal Cannula</option>
                   <option value="FACE_MASK">Face Mask</option>
                   <option value="NON_REBREATHER">Non-Rebreather</option>
                   <option value="HIGH_FLOW">High Flow Nasal</option>
                   <option value="CPAP">CPAP</option>
                   <option value="BIPAP">BiPAP</option>
                   <option value="VENTILATOR">Ventilator (Invasive)</option>
                   <option value="TRACHEOSTOMY">Tracheostomy</option>
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-medium text-slate-500 mb-1">Current FiO2 (%)</label>
                 <input type="number" name="fio2" value={formData.fio2} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm" placeholder="21-100" />
              </div>
            </div>
          </div>
        </div>

        <hr className="border-slate-200 dark:border-slate-700" />

        {/* Section 4: Lines, Tubes, Wounds */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="space-y-4 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Lines and Drains</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-medium text-slate-500 mb-1">Central Line (CVC)</label>
                   <select name="centralLine" value={formData.centralLine} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm">
                     <option value="ABSENT">Absent</option>
                     <option value="PRESENT_CLEAN">Present & Clean</option>
                     <option value="PRESENT_DRESSING_NEEDED">Needs Dressing Change</option>
                   </select>
                </div>
                <div>
                   <label className="block text-xs font-medium text-slate-500 mb-1">Arterial Line</label>
                   <select name="arterialLine" value={formData.arterialLine} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm">
                     <option value="ABSENT">Absent</option>
                     <option value="RADIAL_LEFT">Radial Left</option>
                     <option value="RADIAL_RIGHT">Radial Right</option>
                     <option value="FEMORAL">Femoral</option>
                   </select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                 <input type="checkbox" id="foleyPresent" name="foleyPresent" checked={formData.foleyPresent} onChange={handleChange} className="w-4 h-4 rounded text-sky-600" />
                 <label htmlFor="foleyPresent" className="text-sm font-medium text-slate-700 dark:text-slate-300">Foley Catheter Present</label>
              </div>
           </div>

           <div className="space-y-4 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Skin Integrity</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-medium text-slate-500 mb-1">General Skin Status</label>
                   <select name="skinIntegrity" value={formData.skinIntegrity} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm">
                     <option value="INTACT">Intact</option>
                     <option value="FRAGILE">Fragile/Tears</option>
                     <option value="EDEMATOUS">Edematous</option>
                     <option value="JAUNDICE">Jaundice</option>
                   </select>
                </div>
                <div>
                   <label className="block text-xs font-medium text-slate-500 mb-1">Pressure Ulcer</label>
                   <select name="pressureUlcer" value={formData.pressureUlcer} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm">
                     <option value="NONE">None</option>
                     <option value="STAGE_1">Stage 1</option>
                     <option value="STAGE_2">Stage 2</option>
                     <option value="STAGE_3">Stage 3</option>
                     <option value="STAGE_4">Stage 4</option>
                     <option value="UNSTAGEABLE">Unstageable</option>
                   </select>
                </div>
              </div>
              <div>
                 <input type="text" name="woundNotes" value={formData.woundNotes} onChange={handleChange} className="w-full p-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm" placeholder="Any additional wound notes..." />
              </div>
           </div>
        </div>

        <hr className="border-slate-200 dark:border-slate-700" />

        {/* Section 5: Plan of Care */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-lg">Daily Plan of Care</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Primary Goals Today</label>
              <textarea name="dailyGoals" value={formData.dailyGoals} onChange={handleChange} rows={3} className="w-full p-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500" placeholder="Extubation? Titrate drips? Mobilize?"></textarea>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Nutrition Plan</label>
              <textarea name="nutritionPlan" value={formData.nutritionPlan} onChange={handleChange} rows={3} className="w-full p-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500" placeholder="NPO, TPN, Enteral feeds..."></textarea>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Mobility Plan</label>
              <textarea name="mobilityPlan" value={formData.mobilityPlan} onChange={handleChange} rows={3} className="w-full p-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500" placeholder="Bed rest, dangle on edge, chair..."></textarea>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
           <button type="button" onClick={onCancel} className="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium">
             Cancel
           </button>
           <button type="submit" disabled={loading} className="px-8 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-colors flex items-center gap-2">
             {loading ? <Activity className="w-4 h-4 animate-pulse" /> : <FileText className="w-4 h-4" />}
             Submit Assessment
           </button>
        </div>

      </form>
    </div>
  );
};
