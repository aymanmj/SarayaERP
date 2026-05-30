import { useState } from "react";
import { SemenAnalysis } from "../types";
import { useTranslation } from "react-i18next";

type Props = {
  initialData?: Partial<SemenAnalysis>;
  onSave: (data: Partial<SemenAnalysis>) => void;
  onCancel: () => void;
};

export default function SemenAnalysisForm({ initialData = {}, onSave, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  
  const [form, setForm] = useState<Partial<SemenAnalysis>>(initialData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
     
    let finalValue: any = value;
    if (type === "number") finalValue = value === "" ? undefined : Number(value);
    setForm((prev) => ({ ...prev, [name]: finalValue }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" dir={isRtl ? "rtl" : "ltr"}>
        <h3 className="text-xl font-bold text-cyan-400 mb-6">{t("andrology.forms.semen.title", "🔬 تحليل سائل منوي جديد (WHO 6th Edition)")}</h3>

        <div className="space-y-6 text-sm">
          {/* Collection & Basic Info */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-violet-400 font-bold mb-3">{t("andrology.forms.semen.sections.collectionAndPhysical", "1. أخذ العينة والخصائص الفيزيائية")}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.abstinenceDays", "فترة الامتناع (أيام)")}</label>
                <input type="number" name="abstinenceDays" value={form.abstinenceDays || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.collectionMethod", "طريقة الجمع")}</label>
                <select name="collectionMethod" value={form.collectionMethod || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500">
                  <option value="">—</option>
                  <option value="MASTURBATION">Masturbation</option>
                  <option value="COITUS_INTERRUPTUS">Coitus Interruptus</option>
                  <option value="SURGICAL">Surgical/TESE</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.volumeMl", "الحجم (ml)")}</label>
                <input type="number" step="0.1" name="volumeMl" value={form.volumeMl || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.ph", "pH")}</label>
                <input type="number" step="0.1" name="ph" value={form.ph || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.color", "اللون")}</label>
                <input type="text" name="color" value={form.color || ""} placeholder={t("andrology.forms.semen.placeholders.color", "Grey/Yellow/Red")} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.viscosity", "اللزوجة")}</label>
                <select name="viscosity" value={form.viscosity || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none">
                  <option value="">—</option>
                  <option value="NORMAL">{t("andrology.forms.semen.options.normal", "طبيعي")}</option>
                  <option value="HIGH">{t("andrology.forms.semen.options.high", "مرتفع")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.liquefaction", "التميع (Liquefaction)")}</label>
                <select name="liquefaction" value={form.liquefaction || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none">
                  <option value="">—</option>
                  <option value="COMPLETE">Complete</option>
                  <option value="INCOMPLETE">Incomplete</option>
                  <option value="DELAYED">Delayed</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.liquefactionMinutes", "زمن التميع (دقيقة)")}</label>
                <input type="number" name="liquefactionMinutes" value={form.liquefactionMinutes || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" />
              </div>
            </div>
          </section>

          {/* Concentration & Motility */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-emerald-400 font-bold mb-3">{t("andrology.forms.semen.sections.concentrationAndMotility", "2. التركيز والحركة")}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.countMilPerMl", "التركيز (مليون/مل)")}</label>
                <input type="number" step="0.1" name="countMilPerMl" value={form.countMilPerMl || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.totalCountMil", "العدد الكلي (مليون)")}</label>
                <input type="number" step="0.1" name="totalCountMil" value={form.totalCountMil || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.progressivePR", "حركة تقدمية PR (%)")}</label>
                <input type="number" step="0.1" name="progressivePR" value={form.progressivePR || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.nonProgressiveNP", "حركة غير تقدمية NP (%)")}</label>
                <input type="number" step="0.1" name="nonProgressiveNP" value={form.nonProgressiveNP || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.immotileIM", "غير متحرك IM (%)")}</label>
                <input type="number" step="0.1" name="immotileIM" value={form.immotileIM || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.vitality", "الحيوية (Vitality %)")}</label>
                <input type="number" step="0.1" name="vitality" value={form.vitality || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" />
              </div>
            </div>
          </section>

          {/* Morphology & Others */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-amber-400 font-bold mb-3">{t("andrology.forms.semen.sections.morphologyAndOthers", "3. الشكل السوي والاختبارات الدقيقة")}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.normalForms", "شكل طبيعي (%)")}</label>
                <input type="number" step="0.1" name="normalForms" value={form.normalForms || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.headDefects", "تشوه الرأس (%)")}</label>
                <input type="number" step="0.1" name="headDefects" value={form.headDefects || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.midpieceDefects", "تشوه القطعة الوسطى (%)")}</label>
                <input type="number" step="0.1" name="midpieceDefects" value={form.midpieceDefects || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.tailDefects", "تشوه الذيل (%)")}</label>
                <input type="number" step="0.1" name="tailDefects" value={form.tailDefects || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.wbcCount", "WBC (مليون/مل)")}</label>
                <input type="number" step="0.1" name="wbcCount" value={form.wbcCount || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.roundCells", "خلايا مدورة (Round Cells)")}</label>
                <input type="number" step="0.1" name="roundCells" value={form.roundCells || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.agglutination", "تراص (Agglutination)")}</label>
                <select name="agglutination" value={form.agglutination || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none">
                  <option value="">—</option>
                  <option value="NONE">{t("andrology.forms.semen.options.none", "لا يوجد")}</option>
                  <option value="MILD">{t("andrology.forms.semen.options.mild", "خفيف")}</option>
                  <option value="MODERATE">{t("andrology.forms.semen.options.moderate", "متوسط")}</option>
                  <option value="SEVERE">{t("andrology.forms.semen.options.severe", "شديد")}</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.dnaFragmentation", "تكسير المادة الوراثية (DFI %)")}</label>
                <input type="number" step="0.1" name="dnaFragmentation" value={form.dnaFragmentation || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.dfiMethod", "طريقة فحص DFI")}</label>
                <select name="dfiMethod" value={form.dfiMethod || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none">
                  <option value="">—</option>
                  <option value="TUNEL">TUNEL</option>
                  <option value="SCD">SCD</option>
                  <option value="SCSA">SCSA</option>
                </select>
              </div>
            </div>
          </section>

          {/* Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.conclusion", "الخلاصة (ستُصنف تلقائياً للـ WHO إذا تركت فارغة)")}</label>
              <textarea name="conclusion" value={form.conclusion || ""} onChange={handleChange} placeholder={t("andrology.forms.semen.placeholders.conclusion", "مثلاً: Severe OAT...")} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[80px] focus:border-cyan-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">{t("andrology.forms.semen.fields.doctorNotes", "ملاحظات الطبيب / المختبر")}</label>
              <textarea name="doctorNotes" value={form.doctorNotes || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[80px] focus:border-cyan-500" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onCancel} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">{t("andrology.common.cancel", "إلغاء")}</button>
          <button onClick={() => onSave(form)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm">
            {t("andrology.forms.semen.buttons.save", "💾 حفظ التحليل")}
          </button>
        </div>
      </div>
    </div>
  );
}
