import { useState } from "react";
import { AndrologyVisit } from "../types";
import { useTranslation } from "react-i18next";

type Props = {
  initialData?: Partial<AndrologyVisit>;
  onSave: (data: Partial<AndrologyVisit>) => void;
  onCancel: () => void;
};

export default function AndrologyVisitForm({ initialData = {}, onSave, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [form, setForm] = useState<Partial<AndrologyVisit>>({
    erectileDisfunc: false,
    ejaculatoryDisfunc: false,
    retrogradeEjac: false,
    prematureEjac: false,
    cryptorchidismHistory: false,
    orchitisHistory: false,
    inguinalSurgery: false,
    chemotherapy: false,
    radiationExposure: false,
    gynecomastia: false,
    ...initialData
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
     
    let finalValue: any = value;
    if (type === "number") finalValue = value === "" ? undefined : Number(value);
    if (type === "checkbox") finalValue = (e.target as HTMLInputElement).checked;
    
    // special handling for boolean selects
    if (e.target.tagName === 'SELECT' && (value === "true" || value === "false")) {
      finalValue = value === "true";
    }

    setForm((prev) => ({ ...prev, [name]: finalValue }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
        <h3 className="text-xl font-bold text-cyan-400 mb-6">{t("andrology.forms.visit.title", "🩺 زيارة أمراض الذكورة (التاريخ الطبي المتقدم)")}</h3>

        <div className="space-y-6 text-sm">
          
          {/* History */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-blue-400 font-bold mb-3">{t("andrology.forms.visit.sections.complaintAndInfertility", "1. الشكوى الرئيسية وتاريخ العقم")}</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.chiefComplaint", "الشكوى الرئيسية")}</label>
                <input type="text" name="chiefComplaint" value={form.chiefComplaint || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.infertilityMonths", "مدة العقم (أشهر)")}</label>
                <input type="number" name="infertilityMonths" value={form.infertilityMonths || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.previousPregnancies", "عدد مرات الحمل السابق")}</label>
                <input type="number" name="previousPregnancies" value={form.previousPregnancies || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.coitalFrequency", "معدل الجماع الأسبوعي")}</label>
                <input type="text" name="coitalFrequency" value={form.coitalFrequency || ""} placeholder={t("andrology.forms.visit.placeholders.coitalFrequency", "مثال: 2-3 مرات")} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
            </div>
          </section>

          {/* Sexual Function */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-pink-400 font-bold mb-3">{t("andrology.forms.visit.sections.custom_sexualFunction", "2. الوظيفة الجنسية")}</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.erectileDisfunc", "ضعف الانتصاب")}</label>
                <select name="erectileDisfunc" value={form.erectileDisfunc?.toString()} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500">
                  <option value="false">{t("andrology.common.no", "لا")}</option>
                  <option value="true">{t("andrology.common.yes", "نعم")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.ejaculatoryDisfunc", "اضطراب القذف")}</label>
                <select name="ejaculatoryDisfunc" value={form.ejaculatoryDisfunc?.toString()} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500">
                  <option value="false">{t("andrology.common.no", "لا")}</option>
                  <option value="true">{t("andrology.common.yes", "نعم")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.prematureEjac", "سرعة القذف")}</label>
                <select name="prematureEjac" value={form.prematureEjac?.toString()} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500">
                  <option value="false">{t("andrology.common.no", "لا")}</option>
                  <option value="true">{t("andrology.common.yes", "نعم")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.retrogradeEjac", "قذف ارتجاعي")}</label>
                <select name="retrogradeEjac" value={form.retrogradeEjac?.toString()} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500">
                  <option value="false">{t("andrology.common.no", "لا")}</option>
                  <option value="true">{t("andrology.common.yes", "نعم")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.libidoLevel", "الرغبة الجنسية")}</label>
                <select name="libidoLevel" value={form.libidoLevel || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500">
                  <option value="">—</option>
                  <option value="NORMAL">{t("andrology.forms.visit.options.libidoNormal", "طبيعية")}</option>
                  <option value="LOW">{t("andrology.forms.visit.options.libidoLow", "منخفضة")}</option>
                  <option value="ABSENT">{t("andrology.forms.visit.options.libidoAbsent", "معدومة")}</option>
                </select>
              </div>
            </div>
          </section>

          {/* Medical & Lifestyle History */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-violet-400 font-bold mb-3">{t("andrology.forms.visit.sections.medicalLifestyleHistory", "3. التاريخ المرضي والجراحي وأسلوب حياة المريض")}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="checkbox" name="cryptorchidismHistory" checked={!!form.cryptorchidismHistory} onChange={handleChange} /> 
                  {t("andrology.forms.visit.fields.cryptorchidismHistory", " خصية معلقة (سابقاً)")}
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="checkbox" name="orchitisHistory" checked={!!form.orchitisHistory} onChange={handleChange} /> 
                  {t("andrology.forms.visit.fields.orchitisHistory", " التهاب خصية")}
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="checkbox" name="inguinalSurgery" checked={!!form.inguinalSurgery} onChange={handleChange} /> 
                  {t("andrology.forms.visit.fields.inguinalSurgery", " جراحة إربية")}
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="checkbox" name="chemotherapy" checked={!!form.chemotherapy} onChange={handleChange} /> 
                  {t("andrology.forms.visit.fields.chemotherapy", " علاج كيميائي")}
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="checkbox" name="radiationExposure" checked={!!form.radiationExposure} onChange={handleChange} /> 
                  {t("andrology.forms.visit.fields.radiationExposure", " تعرض إشعاعي")}
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.smokingHabit", "التدخين")}</label>
                <select name="smokingHabit" value={form.smokingHabit || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500">
                  <option value="">—</option>
                  <option value="NON_SMOKER">{t("andrology.forms.visit.options.smokingNon", "غير مدخن")}</option>
                  <option value="SMOKER">{t("andrology.forms.visit.options.smokingSmoker", "مدخن")}</option>
                  <option value="EX_SMOKER">{t("andrology.forms.visit.options.smokingEx", "مدخن سابق")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.alcoholUse", "الكحول")}</label>
                <select name="alcoholUse" value={form.alcoholUse || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500">
                  <option value="">—</option>
                  <option value="NONE">{t("andrology.common.no", "لا")}</option>
                  <option value="OCCASIONAL">{t("andrology.forms.visit.options.alcoholOccasional", "أحياناً")}</option>
                  <option value="REGULAR">{t("andrology.forms.visit.options.alcoholRegular", "بانتظام")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.occupationalExposure", "التعرض المهني (حرارة/مواد)")}</label>
                <input type="text" name="occupationalExposure" value={form.occupationalExposure || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.medicalConditions", "الأمراض المزمنة")}</label>
                <input type="text" name="medicalConditions" value={form.medicalConditions || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.surgicalHistory", "عمليات جراحية أخرى")}</label>
                <input type="text" name="surgicalHistory" value={form.surgicalHistory || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.currentMedications", "الأمراض الحالية")}</label>
                <input type="text" name="currentMedications" value={form.currentMedications || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
            </div>
          </section>

          {/* Physical Exam */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-yellow-400 font-bold mb-3">{t("andrology.forms.visit.sections.physicalExam", "4. الفحص السريري")}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.bmi", "مؤشر كتلة الجسم BMI")}</label>
                <input type="number" step="0.1" name="bmi" value={form.bmi || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.varicoceleGrade", "الدوالي (الدرجة العامة)")}</label>
                <select name="varicoceleGrade" value={form.varicoceleGrade || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none">
                  <option value="">—</option>
                  <option value="NONE">{t("andrology.forms.visit.options.varicoceleNone", "لا يوجد")}</option>
                  <option value="GRADE_I">{t("andrology.forms.visit.options.varicoceleGrade1", "درجة 1")}</option>
                  <option value="GRADE_II">{t("andrology.forms.visit.options.varicoceleGrade2", "درجة 2")}</option>
                  <option value="GRADE_III">{t("andrology.forms.visit.options.varicoceleGrade3", "درجة 3")}</option>
                  <option value="BILATERAL">{t("andrology.forms.visit.options.varicoceleBilateral", "جهتين")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.testicularVolR", "حجم الخصية اليمنى (ml)")}</label>
                <input type="number" step="0.1" name="testicularVolR" value={form.testicularVolR || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.testicularVolL", "حجم الخصية اليسرى (ml)")}</label>
                <input type="number" step="0.1" name="testicularVolL" value={form.testicularVolL || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.testisConsistency", "قوام الخصية")}</label>
                <select name="testisConsistency" value={form.testisConsistency || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none">
                  <option value="">—</option>
                  <option value="NORMAL">{t("andrology.forms.visit.options.consistencyNormal", "طبيعي")}</option>
                  <option value="SOFT">{t("andrology.forms.visit.options.consistencySoft", "رخو")}</option>
                  <option value="ATROPHIC">{t("andrology.forms.visit.options.consistencyAtrophic", "ضامر")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.vasPresence", "الأسهر (Vas Deferens)")}</label>
                <select name="vasPresence" value={form.vasPresence || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none">
                  <option value="">—</option>
                  <option value="PRESENT">{t("andrology.forms.visit.options.vasPresent", "موجود")}</option>
                  <option value="ABSENT">{t("andrology.forms.visit.options.vasAbsent", "غير موجود (CBAVD)")}</option>
                  <option value="PARTIAL">{t("andrology.forms.visit.options.vasPartial", "جزئي")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.epididymalFindings", "فحص البربخ")}</label>
                <input type="text" name="epididymalFindings" value={form.epididymalFindings || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" />
              </div>
              <div>
                <label className="flex items-center gap-2 text-slate-300 mt-6">
                  <input type="checkbox" name="gynecomastia" checked={!!form.gynecomastia} onChange={handleChange} /> 
                  {t("andrology.forms.visit.fields.gynecomastia", " تثدي (Gynecomastia)")}
                </label>
              </div>
            </div>
          </section>

          {/* Conclusion */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.diagnosis", "التشخيص النهائي")}</label>
              <textarea name="diagnosis" value={form.diagnosis || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[80px] focus:border-cyan-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.visit.fields.treatmentPlan", "خطة العلاج المتفق عليها")}</label>
              <textarea name="treatmentPlan" value={form.treatmentPlan || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[80px] focus:border-cyan-500" />
            </div>
          </div>
          
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onCancel} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">{t("andrology.common.cancel", "إلغاء")}</button>
          <button onClick={() => onSave(form)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm">
            {t("andrology.forms.visit.buttons.save", "💾 حفظ الزيارة السريرية")}
          </button>
        </div>
      </div>
    </div>
  );
}
