import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GcsCalculator } from './GcsCalculator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Activity, BrainCircuit, HeartPulse, Stethoscope, FileText } from 'lucide-react';
import { apiClient } from '../../../../api/apiClient';

interface Props {
  encounterId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export const DailyAssessmentForm = ({ encounterId, onSuccess, onCancel }: Props) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
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
      alert(t('icu.assessment.saveFailed', 'فشل حفظ التقييم'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 max-w-5xl mx-auto overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText className="w-6 h-6 text-indigo-400" /> {t('icu.assessment.title', 'التقييم السريري اليومي')}
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
            <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.scores.sofa', 'مؤشر SOFA')}</label>
            <input type="number" name="sofaScore" value={formData.sofaScore} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-sky-500 transition-colors" placeholder="0-24" min="0" max="24" />
          </div>
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.scores.apache', 'مؤشر APACHE II')}</label>
            <input type="number" name="apacheIIScore" value={formData.apacheIIScore} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-sky-500 transition-colors" placeholder="0-71" min="0" max="71" />
          </div>
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.scores.rass', 'مؤشر RASS')}</label>
            <input type="number" name="rassScore" value={formData.rassScore} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-sky-500 transition-colors" placeholder="-5 إلى +4" min="-5" max="4" />
          </div>
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.scores.pain', 'درجة الألم (NRS)')}</label>
            <input type="number" name="painScore" value={formData.painScore} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-sky-500 transition-colors" placeholder="0-10" min="0" max="10" />
          </div>
        </div>

        <hr className="border-slate-800" />

        {/* Section 3: Sedation & Respiratory */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-5 bg-slate-950/30 p-5 rounded-2xl border border-slate-800">
            <h3 className="font-bold text-white flex items-center gap-2">
               <BrainCircuit className="w-5 h-5 text-purple-400" /> {t('icu.assessment.neuro.title', 'الفحص العصبي (Neurological)')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.neuro.pupilLeft', 'حدقة العين اليسرى')}</label>
                 <select name="pupilLeft" value={formData.pupilLeft} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-purple-500 transition-colors text-sm">
                   <option value="REACTIVE">{t('icu.assessment.neuro.reactive', 'متفاعلة (Reactive)')}</option>
                   <option value="SLUGGISH">{t('icu.assessment.neuro.sluggish', 'بطيئة (Sluggish)')}</option>
                   <option value="FIXED">{t('icu.assessment.neuro.fixed', 'ثابتة (Fixed)')}</option>
                   <option value="PINPOINT">{t('icu.assessment.neuro.pinpoint', 'نقطية (Pinpoint)')}</option>
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.neuro.pupilRight', 'حدقة العين اليمنى')}</label>
                 <select name="pupilRight" value={formData.pupilRight} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-purple-500 transition-colors text-sm">
                   <option value="REACTIVE">{t('icu.assessment.neuro.reactive', 'متفاعلة (Reactive)')}</option>
                   <option value="SLUGGISH">{t('icu.assessment.neuro.sluggish', 'بطيئة (Sluggish)')}</option>
                   <option value="FIXED">{t('icu.assessment.neuro.fixed', 'ثابتة (Fixed)')}</option>
                   <option value="PINPOINT">{t('icu.assessment.neuro.pinpoint', 'نقطية (Pinpoint)')}</option>
                 </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.neuro.sedationGoal', 'مستوى التخدير المستهدف (Sedation Goal)')}</label>
              <input type="text" name="sedationTarget" value={formData.sedationTarget} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-purple-500 transition-colors text-sm" placeholder={t('icu.assessment.neuro.sedationPlaceholder', 'مثال: RASS -2 إلى -1')} />
            </div>
          </div>

          <div className="space-y-5 bg-slate-950/30 p-5 rounded-2xl border border-slate-800">
            <h3 className="font-bold text-white flex items-center gap-2">
               <Activity className="w-5 h-5 text-emerald-400" /> {t('icu.assessment.respiratory.title', 'دعم التنفس (Respiratory)')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.respiratory.device', 'الوسيلة')}</label>
                 <select name="oxygenDevice" value={formData.oxygenDevice} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-sm">
                   <option value="ROOM_AIR">{t('icu.assessment.respiratory.roomAir', 'هواء الغرفة (Room Air)')}</option>
                   <option value="NASAL_CANNULA">{t('icu.assessment.respiratory.nasalCannula', 'قنية أنفية (Nasal Cannula)')}</option>
                   <option value="FACE_MASK">{t('icu.assessment.respiratory.faceMask', 'قناع وجه (Face Mask)')}</option>
                   <option value="NON_REBREATHER">{t('icu.assessment.respiratory.nonRebreather', 'كمامة خزان (Non-Rebreather)')}</option>
                   <option value="HIGH_FLOW">{t('icu.assessment.respiratory.highFlow', 'تدفق عالي (High Flow Nasal)')}</option>
                   <option value="CPAP">{t('icu.assessment.respiratory.cpap', 'CPAP')}</option>
                   <option value="BIPAP">{t('icu.assessment.respiratory.bipap', 'BiPAP')}</option>
                   <option value="VENTILATOR">{t('icu.assessment.respiratory.ventilator', 'تنفّس تنبيب (Ventilator)')}</option>
                   <option value="TRACHEOSTOMY">{t('icu.assessment.respiratory.tracheostomy', 'شق حنجري (Tracheostomy)')}</option>
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.respiratory.fio2', 'نسبة الأكسجين - FiO2 (%)')}</label>
                 <input type="number" name="fio2" value={formData.fio2} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-sm" placeholder="21-100" />
              </div>
            </div>
          </div>
        </div>

        <hr className="border-slate-800" />

        {/* Section 4: Lines, Tubes, Wounds */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="space-y-5 bg-slate-950/30 p-5 rounded-2xl border border-slate-800">
              <h3 className="font-bold text-white">{t('icu.assessment.lines.title', 'الخطوط والوصلات (Lines & Drains)')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.lines.cvc', 'القسطرة المركزية (CVC)')}</label>
                   <select name="centralLine" value={formData.centralLine} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                     <option value="ABSENT">{t('icu.assessment.lines.absent', 'غير موجودة (Absent)')}</option>
                     <option value="PRESENT_CLEAN">{t('icu.assessment.lines.presentClean', 'نظيفة (Present & Clean)')}</option>
                     <option value="PRESENT_DRESSING_NEEDED">{t('icu.assessment.lines.needsDressing', 'تحتاج غيار (Needs Dressing)')}</option>
                   </select>
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.lines.arterial', 'القسطرة الشريانية')}</label>
                   <select name="arterialLine" value={formData.arterialLine} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                     <option value="ABSENT">{t('icu.assessment.lines.absentArterial', 'غير موجودة (Absent)')}</option>
                     <option value="RADIAL_LEFT">{t('icu.assessment.lines.radialLeft', 'رسغي أيسر (Radial L)')}</option>
                     <option value="RADIAL_RIGHT">{t('icu.assessment.lines.radialRight', 'رسغي أيمن (Radial R)')}</option>
                     <option value="FEMORAL">{t('icu.assessment.lines.femoral', 'فخذي (Femoral)')}</option>
                   </select>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4 bg-slate-900 p-3 rounded-lg border border-slate-800">
                 <input type="checkbox" id="foleyPresent" name="foleyPresent" checked={formData.foleyPresent} onChange={handleChange} className="w-5 h-5 rounded text-indigo-500 bg-slate-950 border-slate-700 focus:ring-indigo-500" />
                 <label htmlFor="foleyPresent" className="text-sm font-bold text-slate-300">{t('icu.assessment.lines.foley', 'يوجد قسطرة بولية (Foley Catheter)')}</label>
              </div>
           </div>

           <div className="space-y-5 bg-slate-950/30 p-5 rounded-2xl border border-slate-800">
              <h3 className="font-bold text-white">{t('icu.assessment.skin.title', 'الجلد وتقرحات الفراش (Skin & Ulcers)')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.skin.integrity', 'الحالة العامة للجلد')}</label>
                   <select name="skinIntegrity" value={formData.skinIntegrity} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                     <option value="INTACT">{t('icu.assessment.skin.intact', 'سليم (Intact)')}</option>
                     <option value="FRAGILE">{t('icu.assessment.skin.fragile', 'متهتك (Fragile/Tears)')}</option>
                     <option value="EDEMATOUS">{t('icu.assessment.skin.edematous', 'متورم (Edematous)')}</option>
                     <option value="JAUNDICE">{t('icu.assessment.skin.jaundice', 'يرقان (Jaundice)')}</option>
                   </select>
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.skin.pressureUlcer', 'تقرحات الفراش')}</label>
                   <select name="pressureUlcer" value={formData.pressureUlcer} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                     <option value="NONE">{t('icu.assessment.skin.ulcerNone', 'لا توجد')}</option>
                     <option value="STAGE_1">{t('icu.assessment.skin.ulcerStage1', 'المرحلة الأولى')}</option>
                     <option value="STAGE_2">{t('icu.assessment.skin.ulcerStage2', 'المرحلة الثانية')}</option>
                     <option value="STAGE_3">{t('icu.assessment.skin.ulcerStage3', 'المرحلة الثالثة')}</option>
                     <option value="STAGE_4">{t('icu.assessment.skin.ulcerStage4', 'المرحلة الرابعة')}</option>
                     <option value="UNSTAGEABLE">{t('icu.assessment.skin.ulcerUnstageable', 'غير قابلة والتصنيف')}</option>
                   </select>
                </div>
              </div>
              <div>
                 <input type="text" name="woundNotes" value={formData.woundNotes} onChange={handleChange} className="w-full p-3 bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder={t('icu.assessment.skin.woundNotes', 'ملاحظات إضافية حول الجروح...')} />
              </div>
           </div>
        </div>

        <hr className="border-slate-800" />

        {/* Section 5: Plan of Care */}
        <div className="space-y-5">
          <h3 className="font-bold text-white text-lg">{t('icu.assessment.plan.title', 'خطة العناية اليومية (Plan of Care)')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.plan.dailyGoals', 'الأهداف الأساسية اليوم')}</label>
              <textarea name="dailyGoals" value={formData.dailyGoals} onChange={handleChange} rows={3} className="w-full p-4 bg-slate-900 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder={t('icu.assessment.plan.dailyGoalsPlaceholder', 'مثال: فصل جهاز التنفس، التخفيف من التخدير...')}></textarea>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.plan.nutritionPlan', 'خطة التغذية')}</label>
              <textarea name="nutritionPlan" value={formData.nutritionPlan} onChange={handleChange} rows={3} className="w-full p-4 bg-slate-900 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder={t('icu.assessment.plan.nutritionPlaceholder', 'مثال: NPO, TPN, تغذية أنبوبية...')}></textarea>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">{t('icu.assessment.plan.mobilityPlan', 'خطة الحركة (Mobility)')}</label>
              <textarea name="mobilityPlan" value={formData.mobilityPlan} onChange={handleChange} rows={3} className="w-full p-4 bg-slate-900 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder={t('icu.assessment.plan.mobilityPlaceholder', 'مثال: راحة سريرية، الجلوس...')}></textarea>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-800">
           <button type="button" onClick={onCancel} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl font-bold transition-colors">
             {t('icu.assessment.cancel', 'إلغاء')}
           </button>
           <button type="submit" disabled={loading} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-900/30 transition-colors flex items-center justify-center gap-2">
             {loading ? <Activity className="w-5 h-5 animate-pulse" /> : <FileText className="w-5 h-5" />}
             {t('icu.assessment.submit', 'اعتماد وحفظ التقييم')}
           </button>
        </div>

      </form>
    </div>
  );
};
