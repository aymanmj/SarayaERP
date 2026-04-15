import { useState } from "react";
import { AndrologyMedication } from "../types";

type Props = {
  initialData?: Partial<AndrologyMedication>;
  onSave: (data: Partial<AndrologyMedication>) => void;
  onCancel: () => void;
};

export default function AndrologyMedicationForm({ initialData = {}, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Partial<AndrologyMedication>>({
    ...initialData
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <h3 className="text-xl font-bold text-violet-400 mb-6">💊 إضافة علاج طبي</h3>

        <div className="space-y-6 text-sm">
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 text-xs mb-1 block">اسم الدواء / المادة الفعالة <span className="text-red-500">*</span></label>
                <input type="text" name="medication" required value={form.medication || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" placeholder="مثال: ClomiPhene Citrate 50mg" />
              </div>
              <div>
                <label className="text-slate-400 text-xs mb-1 block">الفئة الدوائية (Category)</label>
                <select name="category" value={form.category || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500">
                  <option value="">— اختر —</option>
                  <option value="Anti-estrogen">مضادات الاستروجين (Anti-estrogen)</option>
                  <option value="Gonadotropins">هرمونات الجونادوتروبين (Gonadotropins)</option>
                  <option value="Antioxidant">مضادات الأكسدة ومكملات (Antioxidants)</option>
                  <option value="Antibiotic">مضادات حيوية (Antibiotics)</option>
                  <option value="PDE5 Inhibitor">منشطات جنسية (PDE5 Inhibitors)</option>
                  <option value="Other">غير ذلك</option>
                </select>
              </div>
              <div><label className="text-slate-400 text-xs mb-1 block">الجرعة (Dose)</label><input type="text" name="dose" value={form.dose || ""} placeholder="مثال: حبة واحدة" onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">التكرار (Frequency)</label><input type="text" name="frequency" value={form.frequency || ""} placeholder="مثال: مرتين يومياً" onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">تاريخ البدء</label><input type="date" name="startDate" value={form.startDate?.substring(0,10) || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">تاريخ الانتهاء المتوقع</label><input type="date" name="endDate" value={form.endDate?.substring(0,10) || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-violet-500" /></div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">الاستجابة (Clinical Response)</label>
              <textarea name="response" value={form.response || ""} placeholder="التأثير الواضح بعد فترة من العلاج" onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none h-[80px] focus:border-violet-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">الآثار الجانبية (Side Effects)</label>
              <textarea name="sideEffects" value={form.sideEffects || ""} placeholder="أي آثار جانبية تم ملاحظتها" onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none h-[80px] focus:border-violet-500" />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onCancel} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">إلغاء</button>
          <button onClick={() => onSave(form)} disabled={!form.medication} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm">💾 حفظ العلاج</button>
        </div>
      </div>
    </div>
  );
}
