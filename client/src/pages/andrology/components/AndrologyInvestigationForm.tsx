import { useState } from "react";
import { AndrologyInvestigation } from "../types";
import { useTranslation } from "react-i18next";

type Props = {
  initialData?: Partial<AndrologyInvestigation>;
  onSave: (data: Partial<AndrologyInvestigation>) => void;
  onCancel: () => void;
};

export default function AndrologyInvestigationForm({ initialData = {}, onSave, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  
  const [form, setForm] = useState<Partial<AndrologyInvestigation>>({
    ...initialData
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
        <h3 className="text-xl font-bold text-indigo-400 mb-6">{t("andrology.forms.investigation.title", "🔬 إضافة فحص طبي أو شعاعي")}</h3>

        <div className="space-y-6 text-sm">
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">
                  {t("andrology.forms.investigation.fields.type", "نوع الفحص ")} <span className="text-red-500">*</span>
                </label>
                <select name="type" required value={form.type || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500">
                  <option value="">{t("andrology.forms.investigation.placeholders.selectType", "— اختر نوع الفحص —")}</option>
                  <optgroup label={t("andrology.forms.investigation.groups.imaging", "تصوير وشعاعيات")}>
                    <option value="Scrotal Ultrasound">{t("andrology.forms.investigation.options.scrotalUs", "أشعة تلفزيونية للخصية (Scrotal US)")}</option>
                    <option value="Scrotal Doppler">{t("andrology.forms.investigation.options.scrotalDoppler", "أشعة دوبلر (Scrotal Doppler)")}</option>
                    <option value="TRUS">{t("andrology.forms.investigation.options.trus", "أشعة عبر المستقيم (TRUS)")}</option>
                  </optgroup>
                  <optgroup label={t("andrology.forms.investigation.groups.genetic", "فحوصات وراثية وجينية")}>
                    <option value="Karyotype">{t("andrology.forms.investigation.options.karyotype", "تحليل الكروموسومات (Karyotype)")}</option>
                    <option value="Y-Chrom Microdeletion">{t("andrology.forms.investigation.options.yMicrodeletion", "حذف طفرات الكروموسوم (Y-Microdeletion)")}</option>
                    <option value="CFTR Mutation">{t("andrology.forms.investigation.options.cftr", "طفرات التليف الكيسي (CFTR)")}</option>
                  </optgroup>
                  <optgroup label={t("andrology.forms.investigation.groups.biopsies", "خزعات وعيًنات")}>
                    <option value="Diagnostic Testicular Biopsy">{t("andrology.forms.investigation.options.testicularBiopsy", "خزعة خصية تشخيصية")}</option>
                  </optgroup>
                  <optgroup label={t("andrology.forms.investigation.groups.other", "أخرى")}>
                    <option value="Other">{t("andrology.forms.investigation.options.other", "فحص آخر...")}</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.investigation.fields.date", "تاريخ الفحص")}</label>
                <input type="date" name="investigationDate" value={form.investigationDate?.substring(0,10) || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500" />
              </div>
              <div className="md:col-span-2">
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.investigation.fields.facilityName", "اسم المركز / المختبر (Facility Name)")}</label>
                <input type="text" name="facilityName" value={form.facilityName || ""} placeholder={t("andrology.forms.investigation.placeholders.facilityName", "مثال: مختبر البرج، مستشفى السرايا...")} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500" />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">
                {t("andrology.forms.investigation.fields.findings", "النتائج (Findings) ")} <span className="text-red-500">*</span>
              </label>
              <textarea name="findings" required value={form.findings || ""} placeholder={t("andrology.forms.investigation.placeholders.findings", "اكتب نتائج الفحص التفصيلية هنا...")} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[100px] focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.investigation.fields.interpretation", "الاستنتاج أو التفسير (Interpretation)")}</label>
              <textarea name="interpretation" value={form.interpretation || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none h-[80px] focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.investigation.fields.notes", "ملاحظات الطبيب")}</label>
              <textarea name="notes" value={form.notes || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none h-[80px] focus:border-indigo-500" />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onCancel} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">{t("andrology.common.cancel", "إلغاء")}</button>
          <button onClick={() => onSave(form)} disabled={!form.type || !form.findings} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm">
            {t("andrology.forms.investigation.buttons.save", "💾 حفظ الفحص")}
          </button>
        </div>
      </div>
    </div>
  );
}
