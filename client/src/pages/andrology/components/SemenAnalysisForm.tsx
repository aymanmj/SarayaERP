import { useState } from "react";
import { SemenAnalysis } from "../types";

type Props = {
  initialData?: Partial<SemenAnalysis>;
  onSave: (data: Partial<SemenAnalysis>) => void;
  onCancel: () => void;
};

export default function SemenAnalysisForm({ initialData = {}, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Partial<SemenAnalysis>>(initialData);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === "number") finalValue = value === "" ? undefined : Number(value);
    setForm((prev) => ({ ...prev, [name]: finalValue }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <h3 className="text-xl font-bold text-cyan-400 mb-6">🔬 تحليل سائل منوي جديد (WHO 6th Edition)</h3>

        <div className="space-y-6 text-sm">
          {/* Collection & Basic Info */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-violet-400 font-bold mb-3">1. أخذ العينة والخصائص الفيزيائية</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="text-slate-400 text-xs mb-1 block">فترة الامتناع (أيام)</label><input type="number" name="abstinenceDays" value={form.abstinenceDays || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">طريقة الجمع</label><select name="collectionMethod" value={form.collectionMethod || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500"><option value="">—</option><option value="MASTURBATION">Masturbation</option><option value="COITUS_INTERRUPTUS">Coitus Interruptus</option><option value="SURGICAL">Surgical/TESE</option></select></div>
              <div><label className="text-slate-400 text-xs mb-1 block">الحجم (ml)</label><input type="number" step="0.1" name="volumeMl" value={form.volumeMl || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">pH</label><input type="number" step="0.1" name="ph" value={form.ph || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">اللون</label><input type="text" name="color" value={form.color || ""} placeholder="Grey/Yellow/Red" onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">اللزوجة</label><select name="viscosity" value={form.viscosity || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"><option value="">—</option><option value="NORMAL">طبيعي</option><option value="HIGH">مرتفع</option></select></div>
              <div><label className="text-slate-400 text-xs mb-1 block">التميع (Liquefaction)</label><select name="liquefaction" value={form.liquefaction || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"><option value="">—</option><option value="COMPLETE">Complete</option><option value="INCOMPLETE">Incomplete</option><option value="DELAYED">Delayed</option></select></div>
              <div><label className="text-slate-400 text-xs mb-1 block">زمن التميع (دقيقة)</label><input type="number" name="liquefactionMinutes" value={form.liquefactionMinutes || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500" /></div>
            </div>
          </section>

          {/* Concentration & Motility */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-emerald-400 font-bold mb-3">2. التركيز والحركة</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="text-slate-400 text-xs mb-1 block">التركيز (مليون/مل)</label><input type="number" step="0.1" name="countMilPerMl" value={form.countMilPerMl || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">العدد الكلي (مليون)</label><input type="number" step="0.1" name="totalCountMil" value={form.totalCountMil || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">حركة تقدمية PR (%)</label><input type="number" step="0.1" name="progressivePR" value={form.progressivePR || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">حركة غير تقدمية NP (%)</label><input type="number" step="0.1" name="nonProgressiveNP" value={form.nonProgressiveNP || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">غير متحرك IM (%)</label><input type="number" step="0.1" name="immotileIM" value={form.immotileIM || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">الحيوية (Vitality %)</label><input type="number" step="0.1" name="vitality" value={form.vitality || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500" /></div>
            </div>
          </section>

          {/* Morphology & Others */}
          <section className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
            <h4 className="text-amber-400 font-bold mb-3">3. الشكل السوي والاختبارات الدقيقة</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="text-slate-400 text-xs mb-1 block">شكل طبيعي (%)</label><input type="number" step="0.1" name="normalForms" value={form.normalForms || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">تشوه الرأس (%)</label><input type="number" step="0.1" name="headDefects" value={form.headDefects || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">تشوه القطعة الوسطى (%)</label><input type="number" step="0.1" name="midpieceDefects" value={form.midpieceDefects || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">تشوه الذيل (%)</label><input type="number" step="0.1" name="tailDefects" value={form.tailDefects || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-500" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">WBC (مليون/مل)</label><input type="number" step="0.1" name="wbcCount" value={form.wbcCount || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">خلايا مدورة (Round Cells)</label><input type="number" step="0.1" name="roundCells" value={form.roundCells || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">تراص (Agglutination)</label><select name="agglutination" value={form.agglutination || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"><option value="">—</option><option value="NONE">لا يوجد</option><option value="MILD">خفيف</option><option value="MODERATE">متوسط</option><option value="SEVERE">شديد</option></select></div>
              <div><label className="text-slate-400 text-xs mb-1 block">تكسير المادة الوراثية (DFI %)</label><input type="number" step="0.1" name="dnaFragmentation" value={form.dnaFragmentation || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none" /></div>
              <div><label className="text-slate-400 text-xs mb-1 block">طريقة فحص DFI</label><select name="dfiMethod" value={form.dfiMethod || ""} onChange={handleChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"><option value="">—</option><option value="TUNEL">TUNEL</option><option value="SCD">SCD</option><option value="SCSA">SCSA</option></select></div>
            </div>
          </section>

          {/* Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">الخلاصة (ستُصنف تلقائياً للـ WHO إذا تركت فارغة)</label>
              <textarea name="conclusion" value={form.conclusion || ""} onChange={handleChange} placeholder="مثلاً: Severe OAT..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[80px] focus:border-cyan-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">ملاحظات الطبيب / المختبر</label>
              <textarea name="doctorNotes" value={form.doctorNotes || ""} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white outline-none min-h-[80px] focus:border-cyan-500" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onCancel} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">إلغاء</button>
          <button onClick={() => onSave(form)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm">💾 حفظ التحليل</button>
        </div>
      </div>
    </div>
  );
}
