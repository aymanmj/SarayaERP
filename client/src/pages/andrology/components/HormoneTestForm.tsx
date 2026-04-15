import { useState } from "react";
import { HormoneTest } from "../types";

type Props = {
  initialData?: Partial<HormoneTest>;
  onSave: (data: Partial<HormoneTest>) => void;
  onCancel: () => void;
};

export default function HormoneTestForm({ initialData = {}, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Partial<HormoneTest>>(initialData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === "number") finalValue = value === "" ? undefined : Number(value);
    setForm((prev) => ({ ...prev, [name]: finalValue }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <h3 className="text-xl font-bold text-pink-400 mb-6">🩸 بروفايل هرموني جديد</h3>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm bg-slate-950 p-5 rounded-xl border border-slate-800">
          <div><label className="text-slate-400 text-xs mb-1 block">تاريخ السحب</label><input type="date" name="testDate" value={form.testDate?.substring(0,10) || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">FSH (mIU/mL)</label><input type="number" step="0.01" name="fsh" value={form.fsh || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">LH (mIU/mL)</label><input type="number" step="0.01" name="lh" value={form.lh || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">Total Testosterone (ng/dL)</label><input type="number" step="0.01" name="totalTestosterone" value={form.totalTestosterone || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">Free Testosterone (pg/mL)</label><input type="number" step="0.01" name="freeTestosterone" value={form.freeTestosterone || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">Prolactin (ng/mL)</label><input type="number" step="0.01" name="prolactin" value={form.prolactin || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">Estradiol E2 (pg/mL)</label><input type="number" step="0.01" name="estradiol" value={form.estradiol || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">TSH (mIU/L)</label><input type="number" step="0.01" name="tsh" value={form.tsh || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">Inhibin B (pg/mL)</label><input type="number" step="0.01" name="inhibinB" value={form.inhibinB || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">SHBG (nmol/L)</label><input type="number" step="0.01" name="shbg" value={form.shbg || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
          <div><label className="text-slate-400 text-xs mb-1 block">AMH Male (ng/mL)</label><input type="number" step="0.01" name="amhMale" value={form.amhMale || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-pink-500" /></div>
        </div>

        <div className="mt-4">
          <label className="text-slate-400 text-xs mb-1 block">ملاحظات الطبيب</label>
          <textarea name="notes" value={form.notes || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[80px] focus:border-pink-500" />
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">إلغاء</button>
          <button onClick={() => onSave(form)} className="bg-pink-600 hover:bg-pink-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm">💾 حفظ البروفايل</button>
        </div>
      </div>
    </div>
  );
}
