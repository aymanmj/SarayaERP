import { useState } from "react";
import { AndrologySurgery } from "../types";

type Props = {
  initialData?: Partial<AndrologySurgery>;
  onSave: (data: Partial<AndrologySurgery>) => void;
  onCancel: () => void;
};

export default function AndrologySurgeryForm({ initialData = {}, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Partial<AndrologySurgery>>({
    spermRetrieved: false,
    ...initialData
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === "checkbox") finalValue = (e.target as HTMLInputElement).checked;
    if (e.target.tagName === 'SELECT' && (value === "true" || value === "false")) {
      finalValue = value === "true";
    }
    setForm((prev) => ({ ...prev, [name]: finalValue }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <h3 className="text-xl font-bold text-orange-400 mb-6">🔪 إجراء جراحي جديد</h3>

        <div className="space-y-6 text-sm">
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="text-slate-400 text-xs mb-1 block">الإجراء الجراحي</label><select name="procedure" value={form.procedure || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500"><option value="">— اختر —</option><option value="TESE">TESE</option><option value="Micro-TESE">Micro-TESE</option><option value="PESA">PESA / MESA</option><option value="Varicocelectomy">دوالي الخصية (Varicocelectomy)</option><option value="Vasectomy Reversal">عكس الربط</option><option value="Other">أخرى</option></select></div>
              <div><label className="text-slate-400 text-xs mb-1 block">تاريخ العملية</label><input type="date" name="surgeryDate" value={form.surgeryDate?.substring(0,10) || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">التقنية الجراحية (Technique)</label><input type="text" name="technique" value={form.technique || ""} placeholder="مثال: Microsurgical Subinguinal" onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">اسم الجراح</label><input type="text" name="surgeonName" value={form.surgeonName || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500" /></div>
            </div>
            
            <div className="mt-4">
              <label className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-950/20 p-3 rounded-xl border border-emerald-900/50 cursor-pointer">
                <input type="checkbox" name="spermRetrieved" checked={!!form.spermRetrieved} onChange={handleChange} className="w-4 h-4" /> 
                هل تم استخراج حيوانات منوية ناجحة؟ (Sperm Retrieved)
              </label>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">النتائج / Findings</label>
              <textarea name="findings" value={form.findings || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[80px] focus:border-orange-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">المضاعفات / Complications</label>
              <textarea name="complications" value={form.complications || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[80px] focus:border-orange-500" />
            </div>
            <div className="md:col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">النتيجة النهائية / Outcome</label>
              <input type="text" name="outcome" value={form.outcome || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-orange-500" />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onCancel} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">إلغاء</button>
          <button onClick={() => onSave(form)} disabled={!form.procedure} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-sm">💾 حفظ العملية</button>
        </div>
      </div>
    </div>
  );
}
