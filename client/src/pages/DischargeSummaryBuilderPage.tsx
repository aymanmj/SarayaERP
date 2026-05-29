import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiClient } from "../api/apiClient";
import { useAuthStore } from "../stores/authStore";
import { useTranslation } from "react-i18next";

export const DischargeSummaryBuilderPage = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      toast.error(t("dischargeSummary.draftLoadFailed", "فشل تحميل مسودة الخروج"));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (signOff: boolean = false) => {
    if (!summary) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const isNew = summary.isDraft;
      const payload = {
        ...formData,
        admissionId: Number(admissionId),
        encounterId: summary.encounterId,
        hospitalId: user?.hospitalId,
      };

      const res = await apiClient.post(`/discharge-summary`, payload);
      toast.success(signOff ? t("dischargeSummary.signSuccess", "تم اعتماد نموذج الخروج بنجاح") : t("dischargeSummary.saveSuccess", "تم حفظ المسودة بنجاح"));
      
      if (signOff && res.data?.id) {
          await apiClient.post(`/discharge-summary/${res.data.id}/sign`, {});
          toast.success(t("dischargeSummary.signDoubleSuccess", "تم توقيع النموذج وختمه إلكترونياً!"));
      }
      
      loadDraft(); // reload to get updated status
     
    } catch (e: any) {
      toast.error(e.response?.data?.message || t("dischargeSummary.saveFailed", "فشل الحفظ"));
    }
  };

  const calculateCDIScore = () => {
      let score = 0;
      const total = 6;
      if (formData.admissionDiagnosis?.trim().length > 5) score++;
      if (formData.dischargeDiagnosis?.trim().length > 5) score++;
      if (formData.hospitalCourse?.trim().length > 20) score++;
      if (formData.followUpInstructions?.trim().length > 5) score++;
      if (formData.warningSignsToWatch?.trim().length > 5) score++;
      if (summary?.dischargeMedications?.length > 0) score++;
      
      return Math.round((score / total) * 100);
  };

  if (loading) return <div className="p-8 text-center text-white">{t("common.loading")}</div>;
  if (!summary) return <div className="p-8 text-center text-red-400">{t("dischargeSummary.noAdmissionData")}</div>;

  const isSigned = !!summary.completedAt;
  const cdiScore = calculateCDIScore();

  return (
    <div className="bg-slate-950 min-h-screen p-6 text-slate-100" dir={isRtl ? "rtl" : "ltr"}>
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-end border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t("dischargeSummary.title")}</h1>
            <p className="text-slate-400">
               {t("dischargeSummary.summaryDetails", { admissionId, lengthOfStay: summary.lengthOfStay, defaultValue: "دخول رقم: {{admissionId}} | مدة الإقامة: {{lengthOfStay}} يوم | حالة النموذج:" })} {isSigned ? <span className="text-emerald-400 font-bold">{t("dischargeSummary.signedStatus")}</span> : <span className="text-amber-400">{t("dischargeSummary.draftStatus")}</span>}
            </p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => navigate(-1)} className="px-4 py-2 border border-slate-700 bg-slate-900 rounded-lg hover:bg-slate-800 transition">
               {t("dischargeSummary.backBtn")}
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
               <span className="font-bold text-lg mb-1">{t("dischargeSummary.cdi.score", { score: cdiScore, defaultValue: "مؤشر اكتمال التوثيق (CDI Score): {{score}}%" })}</span>
               <span className="text-sm opacity-80">
                 {cdiScore < 100 ? t("dischargeSummary.cdi.incomplete") : t("dischargeSummary.cdi.perfect")}
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
              <h3 className="text-xl font-bold mb-4 border-b border-slate-700 pb-2 text-sky-300">{t("dischargeSummary.clinicalSummaryTitle")}</h3>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">{t("dischargeSummary.admissionDiag")}</label>
                <textarea 
                  value={formData.admissionDiagnosis} 
                  onChange={e => setFormData({...formData, admissionDiagnosis: e.target.value})}
                  disabled={isSigned}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-sky-500" rows={3} 
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t("dischargeSummary.dischargeDiag")}</label>
                <textarea 
                  value={formData.dischargeDiagnosis} 
                  onChange={e => setFormData({...formData, dischargeDiagnosis: e.target.value})}
                  disabled={isSigned}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-sky-500" rows={3} 
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t("dischargeSummary.hospitalCourse")}</label>
                <textarea 
                  value={formData.hospitalCourse} 
                  onChange={e => setFormData({...formData, hospitalCourse: e.target.value})}
                  disabled={isSigned}
                  placeholder={t("dischargeSummary.hospitalCoursePlaceholder")}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-sky-500" rows={5} 
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t("dischargeSummary.significantFindings")}</label>
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
              <h3 className="text-xl font-bold mb-4 border-b border-slate-700 pb-2 text-emerald-300">{t("dischargeSummary.planTitle")}</h3>

              <div>
                <label className="block text-sm text-slate-400 mb-1">{t("dischargeSummary.warningSigns")}</label>
                <textarea 
                  value={formData.warningSignsToWatch} 
                  onChange={e => setFormData({...formData, warningSignsToWatch: e.target.value})}
                  disabled={isSigned}
                  placeholder={t("dischargeSummary.warningSignsPlaceholder")}
                  className="w-full bg-slate-950 border border-rose-900/50 rounded-lg p-3 outline-none focus:border-rose-500" rows={3} 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm text-slate-400 mb-1">{t("dischargeSummary.followupInstructions")}</label>
                    <textarea 
                      value={formData.followUpInstructions} 
                      onChange={e => setFormData({...formData, followUpInstructions: e.target.value})}
                      disabled={isSigned}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-emerald-500" rows={2} 
                    />
                 </div>
                 <div>
                    <label className="block text-sm text-slate-400 mb-1">{t("dischargeSummary.followupDate")}</label>
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
                    <label className="block text-sm text-slate-400 mb-1">{t("dischargeSummary.activity")}</label>
                    <textarea 
                      value={formData.activityRestrictions} 
                      onChange={e => setFormData({...formData, activityRestrictions: e.target.value})}
                      disabled={isSigned}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 outline-none focus:border-emerald-500" rows={2} 
                    />
                 </div>
                 <div>
                    <label className="block text-sm text-slate-400 mb-1">{t("dischargeSummary.diet")}</label>
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
                 <h4 className="text-sm font-bold text-slate-300 mb-2">{t("dischargeSummary.dischargeMeds")}</h4>
                 <ul className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    { }
                    {summary.dischargeMedications?.map((m: any, idx: number) => (
                      <li key={idx} className="flex gap-2 text-sm text-slate-400">💊 {m.text}</li>
                    ))}
                    {!summary.dischargeMedications?.length && <li className="text-sm text-slate-500 italic">{t("dischargeSummary.noDischargeMeds")}</li>}
                 </ul>
              </div>

            </div>
         </div>
      </div>
    </div>
  );
};
