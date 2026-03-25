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
    <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-5xl mx-auto overflow-hidden" dir="rtl">
      <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText className="w-6 h-6 text-indigo-400" /> التقييم السريري اليومي
        </h2>
        <div>
          <input 
            type="date" 
            name="assessmentDate" 
            value={formData.assessmentDate}
            onChange={handleChange}
            className="p-2.5 bg-slate-900 border border-slate-700 text-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-10">
        
        {/* Section 1: GCS */}
        <div className="space-y-4">
          <GcsCalculator onChange={handleGcsChange} />
        </div>

        {/* Section 2: Other Scores */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <label className="block text-xs font-bold text-slate-400 mb-2">مؤشر SOFA</label>
            <input type="number" name="sofaScore" value={formData.sofaScore} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-sky-500 transition-colors" placeholder="0-24" min="0" max="24" />
          </div>
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <label className="block text-xs font-bold text-slate-400 mb-2">مؤشر APACHE II</label>
            <input type="number" name="apacheIIScore" value={formData.apacheIIScore} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-sky-500 transition-colors" placeholder="0-71" min="0" max="71" />
          </div>
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <label className="block text-xs font-bold text-slate-400 mb-2">مؤشر RASS</label>
            <input type="number" name="rassScore" value={formData.rassScore} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-sky-500 transition-colors" placeholder="-5 إلى +4" min="-5" max="4" />
          </div>
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <label className="block text-xs font-bold text-slate-400 mb-2">درجة الألم (NRS)</label>
            <input type="number" name="painScore" value={formData.painScore} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-sky-500 transition-colors" placeholder="0-10" min="0" max="10" />
          </div>
        </div>

        <hr className="border-slate-800" />

        {/* Section 3: Sedation & Respiratory */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-5 bg-slate-950/30 p-5 rounded-2xl border border-slate-800">
            <h3 className="font-bold text-white flex items-center gap-2">
               <BrainCircuit className="w-5 h-5 text-purple-400" /> الفحص العصبي (Neurological)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-xs font-bold text-slate-400 mb-2">حدقة العين اليسرى</label>
                 <select name="pupilLeft" value={formData.pupilLeft} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-purple-500 transition-colors text-sm">
                   <option value="REACTIVE">متفاعلة (Reactive)</option>
                   <option value="SLUGGISH">بطيئة (Sluggish)</option>
                   <option value="FIXED">ثابتة (Fixed)</option>
                   <option value="PINPOINT">نقطية (Pinpoint)</option>
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-bold text-slate-400 mb-2">حدقة العين اليمنى</label>
                 <select name="pupilRight" value={formData.pupilRight} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-purple-500 transition-colors text-sm">
                   <option value="REACTIVE">متفاعلة (Reactive)</option>
                   <option value="SLUGGISH">بطيئة (Sluggish)</option>
                   <option value="FIXED">ثابتة (Fixed)</option>
                   <option value="PINPOINT">نقطية (Pinpoint)</option>
                 </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">مستوى التخدير المستهدف (Sedation Goal)</label>
              <input type="text" name="sedationTarget" value={formData.sedationTarget} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-purple-500 transition-colors text-sm" placeholder="مثال: RASS -2 إلى -1" />
            </div>
          </div>

          <div className="space-y-5 bg-slate-950/30 p-5 rounded-2xl border border-slate-800">
            <h3 className="font-bold text-white flex items-center gap-2">
               <Activity className="w-5 h-5 text-emerald-400" /> دعم التنفس (Respiratory)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-xs font-bold text-slate-400 mb-2">الوسيلة</label>
                 <select name="oxygenDevice" value={formData.oxygenDevice} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-sm">
                   <option value="ROOM_AIR">هواء الغرفة (Room Air)</option>
                   <option value="NASAL_CANNULA">قنية أنفية (Nasal Cannula)</option>
                   <option value="FACE_MASK">قناع وجه (Face Mask)</option>
                   <option value="NON_REBREATHER">كمامة خزان (Non-Rebreather)</option>
                   <option value="HIGH_FLOW">تدفق عالي (High Flow Nasal)</option>
                   <option value="CPAP">CPAP</option>
                   <option value="BIPAP">BiPAP</option>
                   <option value="VENTILATOR">تنفّس تنبيب (Ventilator)</option>
                   <option value="TRACHEOSTOMY">شق حنجري (Tracheostomy)</option>
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-bold text-slate-400 mb-2">نسبة الأكسجين - FiO2 (%)</label>
                 <input type="number" name="fio2" value={formData.fio2} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-sm" placeholder="21-100" />
              </div>
            </div>
          </div>
        </div>

        <hr className="border-slate-800" />

        {/* Section 4: Lines, Tubes, Wounds */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="space-y-5 bg-slate-950/30 p-5 rounded-2xl border border-slate-800">
              <h3 className="font-bold text-white">الخطوط والوصلات (Lines & Drains)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-bold text-slate-400 mb-2">القسطرة المركزية (CVC)</label>
                   <select name="centralLine" value={formData.centralLine} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                     <option value="ABSENT">غير موجودة (Absent)</option>
                     <option value="PRESENT_CLEAN">نظيفة (Present & Clean)</option>
                     <option value="PRESENT_DRESSING_NEEDED">تحتاج غيار (Needs Dressing)</option>
                   </select>
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-400 mb-2">القسطرة الشريانية</label>
                   <select name="arterialLine" value={formData.arterialLine} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                     <option value="ABSENT">غير موجودة (Absent)</option>
                     <option value="RADIAL_LEFT">رسغي أيسر (Radial L)</option>
                     <option value="RADIAL_RIGHT">رسغي أيمن (Radial R)</option>
                     <option value="FEMORAL">فخذي (Femoral)</option>
                   </select>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4 bg-slate-900 p-3 rounded-lg border border-slate-800">
                 <input type="checkbox" id="foleyPresent" name="foleyPresent" checked={formData.foleyPresent} onChange={handleChange} className="w-5 h-5 rounded text-indigo-500 bg-slate-950 border-slate-700 focus:ring-indigo-500" />
                 <label htmlFor="foleyPresent" className="text-sm font-bold text-slate-300">يوجد قسطرة بولية (Foley Catheter)</label>
              </div>
           </div>

           <div className="space-y-5 bg-slate-950/30 p-5 rounded-2xl border border-slate-800">
              <h3 className="font-bold text-white">الجلد وتقرحات الفراش (Skin & Ulcers)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-bold text-slate-400 mb-2">الحالة العامة للجلد</label>
                   <select name="skinIntegrity" value={formData.skinIntegrity} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                     <option value="INTACT">سليم (Intact)</option>
                     <option value="FRAGILE">متهتك (Fragile/Tears)</option>
                     <option value="EDEMATOUS">متورم (Edematous)</option>
                     <option value="JAUNDICE">يرقان (Jaundice)</option>
                   </select>
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-400 mb-2">تقرحات الفراش</label>
                   <select name="pressureUlcer" value={formData.pressureUlcer} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                     <option value="NONE">لا توجد</option>
                     <option value="STAGE_1">المرحلة الأولى</option>
                     <option value="STAGE_2">المرحلة الثانية</option>
                     <option value="STAGE_3">المرحلة الثالثة</option>
                     <option value="STAGE_4">المرحلة الرابعة</option>
                     <option value="UNSTAGEABLE">غير قابلة والتصنيف</option>
                   </select>
                </div>
              </div>
              <div>
                 <input type="text" name="woundNotes" value={formData.woundNotes} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder="ملاحظات إضافية حول الجروح..." />
              </div>
           </div>
        </div>

        <hr className="border-slate-800" />

        {/* Section 5: Plan of Care */}
        <div className="space-y-5">
          <h3 className="font-bold text-white text-lg">خطة العناية اليومية (Plan of Care)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">الأهداف الأساسية اليوم</label>
              <textarea name="dailyGoals" value={formData.dailyGoals} onChange={handleChange} rows={3} className="w-full p-4 bg-slate-900 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder="مثال: فصل جهاز التنفس، التخفيف من التخدير..."></textarea>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">خطة التغذية</label>
              <textarea name="nutritionPlan" value={formData.nutritionPlan} onChange={handleChange} rows={3} className="w-full p-4 bg-slate-900 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder="مثال: NPO, TPN, تغذية أنبوبية..."></textarea>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">خطة الحركة (Mobility)</label>
              <textarea name="mobilityPlan" value={formData.mobilityPlan} onChange={handleChange} rows={3} className="w-full p-4 bg-slate-900 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder="مثال: راحة سريرية، الجلوس..."></textarea>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-800">
           <button type="button" onClick={onCancel} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl font-bold transition-colors">
             إلغاء
           </button>
           <button type="submit" disabled={loading} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-900/30 transition-colors flex items-center justify-center gap-2">
             {loading ? <Activity className="w-5 h-5 animate-pulse" /> : <FileText className="w-5 h-5" />}
             اعتماد وحفظ التقييم
           </button>
        </div>

      </form>
    </div>
  );
};
