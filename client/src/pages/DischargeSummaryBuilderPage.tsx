import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useAuthStore } from "../stores/authStore";

export const DischargeSummaryBuilderPage = () => {
  const { admissionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({
    admissionDiagnosis: '',
    dischargeDiagnosis: '',
    hospitalCourse: '',
    significantFindings: '',
    followUpInstructions: '',
    followUpDate: '',
    activityRestrictions: '',
    dietInstructions: '',
    warningSignsToWatch: '',
  });

  useEffect(() => {
    if (admissionId) loadDraft();
  }, [admissionId]);

  const loadDraft = async () => {
    try {
      const res = await apiClient.get(`/discharge-summary/admission/${admissionId}`);
      setSummary(res.data);
      if (res.data) {
        setFormData({
          admissionDiagnosis: res.data.admissionDiagnosis || '',
          dischargeDiagnosis: res.data.dischargeDiagnosis || '',
          hospitalCourse: res.data.hospitalCourse || '',
          significantFindings: res.data.significantFindings || '',
          followUpInstructions: res.data.followUpInstructions || '',
          followUpDate: res.data.followUpDate ? new Date(res.data.followUpDate).toISOString().split('T')[0] : '',
          activityRestrictions: res.data.activityRestrictions || '',
          dietInstructions: res.data.dietInstructions || '',
          warningSignsToWatch: res.data.warningSignsToWatch || '',
        });
      }
    } catch (e: any) {
      toast.error("فشل تحميل مسودة الخروج");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (signOff: boolean = false) => {
    if (!summary) return;
    try {
      const isNew = summary.isDraft;
      const payload = {
        ...formData,
        admissionId: Number(admissionId),
        encounterId: summary.encounterId,
        hospitalId: user?.hospitalId,
      };

      const res = await apiClient.post(`/discharge-summary`, payload);
      toast.success(signOff ? "تم اعتماد نموذج الخروج بنجاح" : "تم حفظ المسودة بنجاح");
      
      if (signOff && res.data?.id) {
          await apiClient.post(`/discharge-summary/${res.data.id}/sign`, {});
          toast.success("تم توقيع النموذج وختمه إلكترونياً!");
      }
      
      loadDraft(); // reload to get updated status
    } catch (e: any) {
      toast.error(e.response?.data?.message || "فشل الحفظ");
    }
  };

  const calculateCDIScore = () => {
      let score = 0;
      let total = 6;
      if (formData.admissionDiagnosis?.trim().length > 5) score++;
      if (formData.dischargeDiagnosis?.trim().length > 5) score++;
      if (formData.hospitalCourse?.trim().length > 20) score++;
      if (formData.followUpInstructions?.trim().length > 5) score++;
      if (formData.warningSignsToWatch?.trim().length > 5) score++;
      if (summary?.dischargeMedications?.length > 0) score++;
      
      return Math.round((score / total) * 100);
  };

  if (loading) return <div className="p-8 text-center text-white">جارِ التحميل...</div>;
  if (!summary) return <div className="p-8 text-center text-red-400">بيانات التنويم غير متوفرة لإنشاء ملخص.</div>;

  const isSigned = !!summary.completedAt;
  const cdiScore = calculateCDIScore();

  return (
    <div className="bg-slate-950 min-h-screen p-6 text-slate-100" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-end border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">ملخص الدخول والخروج (Discharge Summary)</h1>
            <p className="text-slate-400">
               دخول رقم: {admissionId} | مدة الإقامة: {summary.lengthOfStay} يوم | حالة النموذج: {isSigned ? <span className="text-emerald-400 font-bold">مُعتمد ومُغلق 🔒</span> : <span className="text-amber-400">مسودة 📝</span>}
            </p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => navigate(-1)} className="px-4 py-2 border border-slate-700 bg-slate-900 rounded-lg hover:bg-slate-800 transition">
               رجوع
             </button>
             {!isSigned && (
               <button onClick={() => handleSave(false)} className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition shadow cursor-pointer">
                 حفظ كمسودة
               </button>
             )}
             {!isSigned && cdiScore >= 80 && (
               <button onClick={() => handleSave(true)} className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 font-bold transition shadow cursor-pointer">
                 اعتماد وتوقيع (Sign Off)
               </button>
             )}
          </div>
        </header>

         {/* CDI Indicator */}
         {!isSigned && (
           <div className={`p-4 rounded-xl flex items-center justify-between border ${cdiScore >= 80 ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-200' : 'bg-amber-900/20 border-amber-500/30 text-amber-200'}`}>
             <div className="flex flex-col">
               <span className="font-bold text-lg mb-1">مؤشر اكتمال التوثيق (CDI Score): {cdiScore}%</span>
               <span className="text-sm opacity-80">
                 {cdiScore < 100 ? "يرجى تعبئة الحقول الأساسية ومسار العلاج للوصول لـ 100% لضمان الجودة الطبية والمالية." : "التوثيق مثالي."}
               </span>
             </div>
             <div className="text-4xl">
                {cdiScore >= 80 ? '🌟' : '⚠️'}
             </div>
           </div>
         )}

         {/* Form Sections */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Clinical Summary */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-xl font-bold mb-4 border-b border-slate-700 pb-2 text-sky-300">الملخص السريري</h3>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">تشخيص الدخول (Admission Diagnosis)</label>
                <textarea 
                  value={formData.admissionDiagnosis} 
                  onChange={e => setFormData({...formData, admissionDiagnosis: e.target.value})}
                  disabled={isSigned}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-sky-500" rows={3} 
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">التشخيص النهائي (Discharge Diagnosis)</label>
                <textarea 
                  value={formData.dischargeDiagnosis} 
                  onChange={e => setFormData({...formData, dischargeDiagnosis: e.target.value})}
                  disabled={isSigned}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-sky-500" rows={3} 
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">مسار العلاج بالمستشفى (Hospital Course)</label>
                <textarea 
                  value={formData.hospitalCourse} 
                  onChange={e => setFormData({...formData, hospitalCourse: e.target.value})}
                  disabled={isSigned}
                  placeholder="وصف لحالة المريض خلال فترة الإقامة واستجابته للعلاج..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-sky-500" rows={5} 
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">نتائج وتوصيات ملحوظة (Significant Findings)</label>
                <textarea 
                  value={formData.significantFindings} 
                  onChange={e => setFormData({...formData, significantFindings: e.target.value})}
                  disabled={isSigned}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-sky-500" rows={3} 
                />
              </div>
            </div>

            {/* Discharge Plan & FollowUp */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4 flex flex-col">
              <h3 className="text-xl font-bold mb-4 border-b border-slate-700 pb-2 text-emerald-300">خطة الخروج والمتابعة</h3>

              <div>
                <label className="block text-sm text-slate-400 mb-1">علامات الخطر المنذرة (Warning Signs)</label>
                <textarea 
                  value={formData.warningSignsToWatch} 
                  onChange={e => setFormData({...formData, warningSignsToWatch: e.target.value})}
                  disabled={isSigned}
                  placeholder="متى يجب على المريض مراجعة الطوارئ..."
                  className="w-full bg-slate-950 border border-rose-900/50 rounded-lg p-3 outline-none focus:border-rose-500" rows={3} 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm text-slate-400 mb-1">تعليمات المتابعة</label>
                    <textarea 
                      value={formData.followUpInstructions} 
                      onChange={e => setFormData({...formData, followUpInstructions: e.target.value})}
                      disabled={isSigned}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-emerald-500" rows={2} 
                    />
                 </div>
                 <div>
                    <label className="block text-sm text-slate-400 mb-1">موعد المراجعة المقترح</label>
                    <input 
                      type="date"
                      value={formData.followUpDate} 
                      onChange={e => setFormData({...formData, followUpDate: e.target.value})}
                      disabled={isSigned}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-emerald-500" 
                    />
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm text-slate-400 mb-1">قيود الحركة (Activity)</label>
                    <textarea 
                      value={formData.activityRestrictions} 
                      onChange={e => setFormData({...formData, activityRestrictions: e.target.value})}
                      disabled={isSigned}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-emerald-500" rows={2} 
                    />
                 </div>
                 <div>
                    <label className="block text-sm text-slate-400 mb-1">النظام الغذائي (Diet)</label>
                    <textarea 
                      value={formData.dietInstructions} 
                      onChange={e => setFormData({...formData, dietInstructions: e.target.value})}
                      disabled={isSigned}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-emerald-500" rows={2} 
                    />
                 </div>
              </div>

              {/* Medications Table Preview */}
              <div className="mt-4 flex-1">
                 <h4 className="text-sm font-bold text-slate-300 mb-2">أدوية الخروج (منسُوخة من الوصفات):</h4>
                 <ul className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    {summary.dischargeMedications?.map((m: any, idx: number) => (
                      <li key={idx} className="flex gap-2 text-sm text-slate-400">💊 {m.text}</li>
                    ))}
                    {!summary.dischargeMedications?.length && <li className="text-sm text-slate-500 italic">لا توجد أدوية خروج مسجلة.</li>}
                 </ul>
              </div>

            </div>
         </div>
      </div>
    </div>
  );
};
