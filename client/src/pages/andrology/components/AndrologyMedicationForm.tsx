import { useState } from "react";
import { AndrologyMedication } from "../types";
import { useTranslation } from "react-i18next";

type Props = {
  initialData?: Partial<AndrologyMedication>;
  onSave: (data: Partial<AndrologyMedication>) => void;
  onCancel: () => void;
};

export default function AndrologyMedicationForm({ initialData = {}, onSave, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [form, setForm] = useState<Partial<AndrologyMedication>>({
    ...initialData
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
        <h3 className="text-xl font-bold text-violet-400 mb-6">{t("andrology.forms.medication.title", "💊 إضافة علاج طبي")}</h3>

        <div className="space-y-6 text-sm">
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">
                  {t("andrology.forms.medication.fields.medication", "اسم الدواء / المادة الفعالة ")} <span className="text-red-500">*</span>
                </label>
                <input type="text" name="medication" required value={form.medication || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" placeholder={t("andrology.forms.medication.placeholders.medication", "مثال: ClomiPhene Citrate 50mg")} />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.medication.fields.category", "الفئة الدوائية (Category)")}</label>
                <select name="category" value={form.category || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500">
                  <option value="">{t("andrology.forms.medication.placeholders.selectCategory", "— اختر —")}</option>
                  <option value="Anti-estrogen">{t("andrology.forms.medication.options.antiEstrogen", "مضادات الاستروجين (Anti-estrogen)")}</option>
                  <option value="Gonadotropins">{t("andrology.forms.medication.options.gonadotropins", "هرمونات الجونادوتروبين (Gonadotropins)")}</option>
                  <option value="Antioxidant">{t("andrology.forms.medication.options.antioxidants", "مضادات الأكسدة ومكملات (Antioxidants)")}</option>
                  <option value="Antibiotic">{t("andrology.forms.medication.options.antibiotics", "مضادات حيوية (Antibiotics)")}</option>
                  <option value="PDE5 Inhibitor">{t("andrology.forms.medication.options.pde5Inhibitors", "منشطات جنسية (PDE5 Inhibitors)")}</option>
                  <option value="Other">{t("andrology.forms.medication.options.other", "غير ذلك")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.medication.fields.dose", "الجرعة (Dose)")}</label>
                <input type="text" name="dose" value={form.dose || ""} placeholder={t("andrology.forms.medication.placeholders.dose", "مثال: حبة واحدة")} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.medication.fields.frequency", "التكرار (Frequency)")}</label>
                <input type="text" name="frequency" value={form.frequency || ""} placeholder={t("andrology.forms.medication.placeholders.frequency", "مثال: مرتين يومياً")} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.medication.fields.startDate", "تاريخ البدء")}</label>
                <input type="date" name="startDate" value={form.startDate?.substring(0,10) || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.medication.fields.endDate", "تاريخ الانتهاء المتوقع")}</label>
                <input type="date" name="endDate" value={form.endDate?.substring(0,10) || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.medication.fields.response", "الاستجابة (Clinical Response)")}</label>
              <textarea name="response" value={form.response || ""} placeholder={t("andrology.forms.medication.placeholders.response", "التأثير الواضح بعد فترة من العلاج")} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none h-[80px] focus:border-violet-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.medication.fields.sideEffects", "الآثار الجانبية (Side Effects)")}</label>
              <textarea name="sideEffects" value={form.sideEffects || ""} placeholder={t("andrology.forms.medication.placeholders.sideEffects", "أي آثار جانبية تم ملاحظتها")} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none h-[80px] focus:border-violet-500" />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onCancel} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">{t("andrology.common.cancel", "إلغاء")}</button>
          <button onClick={() => onSave(form)} disabled={!form.medication} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm">
            {t("andrology.forms.medication.buttons.save", "💾 حفظ العلاج")}
          </button>
        </div>
      </div>
    </div>
  );
}
