// src/pages/andrology/AndrologyPage.tsx

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

type SemenAnalysis = {
  id: number;
  patientId: number;
  sampleDate: string;
  abstinenceDays?: number;
  volumeMl?: number;
  ph?: number;
  countMilPerMl?: number;
  totalCountMil?: number;
  progressivePR?: number;
  nonProgressiveNP?: number;
  immotileIM?: number;
  normalForms?: number;
  vitality?: number;
  wbcCount?: number;
  agglutination?: string;
  viscosity?: string;
  liquefaction?: string;
  conclusion?: string;
  doctorNotes?: string;
};

type AndrologyVisit = {
  id: number;
  patientId: number;
  erectileDisfunc: boolean;
  smokingHabit?: string;
  varicoceleGrade?: string;
  testicularVol?: string;
  fshLevel?: number;
  lhLevel?: number;
  testosterone?: number;
  prolactin?: number;
  diagnosis?: string;
  treatmentPlan?: string;
  createdAt: string;
};

type PatientInfo = { id: number; fullName: string; mrn: string };

export default function AndrologyPage() {
  const [searchParams] = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  const [patientId, setPatientId] = useState<number | null>(patientIdParam ? Number(patientIdParam) : null);

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [analyses, setAnalyses] = useState<SemenAnalysis[]>([]);
  const [visits, setVisits] = useState<AndrologyVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"SEMEN" | "ANDROLOGY">("SEMEN");

  // Search
  const [searchMrn, setSearchMrn] = useState("");

  // Semen Analysis Form
  const [showSemenForm, setShowSemenForm] = useState(false);
  const [semenForm, setSemenForm] = useState<Partial<SemenAnalysis>>({});

  // Andrology Visit Form
  const [showAndrologyForm, setShowAndrologyForm] = useState(false);
  const [andrologyForm, setAndrologyForm] = useState<Partial<AndrologyVisit>>({});

  const loadPatientData = useCallback(async (pid: number) => {
    setLoading(true);
    try {
      const [semenRes, visitRes] = await Promise.all([
        apiClient.get(`/obgyn/fertility/semen-analysis/patient/${pid}`),
        apiClient.get(`/obgyn/fertility/andrology/patient/${pid}`),
      ]);
      setAnalyses(semenRes.data);
      setVisits(visitRes.data);
    } catch {
      // Patient may not have data yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (patientId) {
      apiClient.get(`/patients/${patientId}`).then(r => setPatient(r.data)).catch(() => {});
      loadPatientData(patientId);
    }
  }, [patientId, loadPatientData]);

  const searchPatient = async () => {
    if (!searchMrn.trim()) return;
    try {
      const res = await apiClient.get(`/patients?search=${searchMrn.trim()}`);
      const patients = res.data?.data || res.data;
      if (patients?.length > 0) {
        const p = patients[0];
        setPatientId(p.id);
        setPatient(p);
        loadPatientData(p.id);
      } else {
        toast.error("لم يتم العثور على المريض.");
      }
    } catch {
      toast.error("خطأ في البحث.");
    }
  };

  const submitSemenAnalysis = async () => {
    if (!patientId) return;
    try {
      await apiClient.post("/obgyn/fertility/semen-analysis", { ...semenForm, patientId });
      toast.success("تم حفظ تحليل السائل المنوي بنجاح.");
      setShowSemenForm(false);
      setSemenForm({});
      loadPatientData(patientId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "فشل الحفظ.");
    }
  };

  const submitAndrologyVisit = async () => {
    if (!patientId) return;
    try {
      await apiClient.post("/obgyn/fertility/andrology", { ...andrologyForm, patientId });
      toast.success("تم حفظ زيارة أمراض الذكورة.");
      setShowAndrologyForm(false);
      setAndrologyForm({});
      loadPatientData(patientId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "فشل الحفظ.");
    }
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("ar-LY") : "—";
  const fmtNum = (n?: number | null) => n != null ? Number(n).toFixed(1) : "—";

  return (
    <div className="p-6 space-y-6 text-slate-100 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
          <span className="text-3xl">🧬</span>
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">عيادة أمراض الذكورة والعقم</h1>
          <p className="text-slate-400 text-sm">تحاليل السائل المنوي • الفحوصات الهرمونية • التشخيص والعلاج</p>
        </div>
      </div>

      {/* Patient Search / Info */}
      {!patient ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-300 mb-4">🔍 البحث عن المريض</h2>
          <div className="flex gap-3">
            <input
              value={searchMrn}
              onChange={e => setSearchMrn(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchPatient()}
              placeholder="اسم المريض أو رقم الملف..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none"
            />
            <button onClick={searchPatient} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-xl font-bold text-sm">
              بحث
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/80 border border-cyan-900/30 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-cyan-900/30 border border-cyan-500/30 rounded-full flex items-center justify-center text-xl">🧑</div>
            <div>
              <h2 className="text-lg font-bold text-white">{patient.fullName}</h2>
              <p className="text-cyan-400 text-xs font-mono">MRN: {patient.mrn}</p>
            </div>
          </div>
          <button onClick={() => { setPatient(null); setPatientId(null); setAnalyses([]); setVisits([]); }} className="text-xs text-slate-400 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg">
            🔄 تغيير المريض
          </button>
        </div>
      )}

      {/* Tabs */}
      {patient && (
        <>
          <div className="flex gap-2 border-b border-slate-800 pb-1">
            <button onClick={() => setTab("SEMEN")} className={`px-5 py-3 rounded-t-xl text-sm font-medium transition-all ${tab === "SEMEN" ? "bg-slate-800 text-cyan-400 border-t border-x border-slate-700" : "text-slate-400 hover:text-slate-200"}`}>
              🔬 تحليل السائل المنوي
            </button>
            <button onClick={() => setTab("ANDROLOGY")} className={`px-5 py-3 rounded-t-xl text-sm font-medium transition-all ${tab === "ANDROLOGY" ? "bg-slate-800 text-cyan-400 border-t border-x border-slate-700" : "text-slate-400 hover:text-slate-200"}`}>
              🩺 زيارات أمراض الذكورة
            </button>
          </div>

          {/* === SEMEN ANALYSIS TAB === */}
          {tab === "SEMEN" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-cyan-400">📋 سجل التحاليل</h3>
                <button onClick={() => setShowSemenForm(true)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                  ➕ تحليل جديد
                </button>
              </div>

              {loading ? (
                <div className="text-center text-slate-400 py-12">جارِ التحميل...</div>
              ) : analyses.length === 0 ? (
                <div className="text-center text-slate-500 py-12 bg-slate-900/50 rounded-2xl border border-slate-800">
                  <p className="text-4xl mb-3">🧪</p>
                  <p>لا توجد تحاليل سائل منوي مسجلة لهذا المريض.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {analyses.map(a => (
                    <div key={a.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-cyan-500/30 transition-colors">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="text-sm font-bold text-white">تحليل بتاريخ {fmtDate(a.sampleDate)}</h4>
                        {a.abstinenceDays && <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-1 rounded">فترة الامتناع: {a.abstinenceDays} أيام</span>}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">الحجم</span><div className="text-white font-bold mt-1">{fmtNum(a.volumeMl)} ml</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">التركيز</span><div className="text-white font-bold mt-1">{fmtNum(a.countMilPerMl)} مليون/مل</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">الحركة التقدمية (PR)</span><div className="text-emerald-400 font-bold mt-1">{fmtNum(a.progressivePR)}%</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">الشكل الطبيعي</span><div className="text-white font-bold mt-1">{fmtNum(a.normalForms)}%</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">الحيوية</span><div className="text-white font-bold mt-1">{fmtNum(a.vitality)}%</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">WBC</span><div className="text-white font-bold mt-1">{fmtNum(a.wbcCount)}</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">pH</span><div className="text-white font-bold mt-1">{fmtNum(a.ph)}</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">التراص</span><div className="text-white font-bold mt-1">{a.agglutination || "—"}</div></div>
                      </div>
                      {a.conclusion && <div className="mt-3 text-xs text-amber-300 bg-amber-900/20 border border-amber-500/20 p-3 rounded-xl">📌 {a.conclusion}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Semen Form Modal */}
              {showSemenForm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-bold text-cyan-400 mb-6">🔬 تحليل سائل منوي جديد (WHO 6th Ed.)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">فترة الامتناع (أيام)</label>
                        <input type="number" value={semenForm.abstinenceDays || ""} onChange={e => setSemenForm(p => ({ ...p, abstinenceDays: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">الحجم (ml)</label>
                        <input type="number" step="0.1" value={semenForm.volumeMl || ""} onChange={e => setSemenForm(p => ({ ...p, volumeMl: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">pH</label>
                        <input type="number" step="0.1" value={semenForm.ph || ""} onChange={e => setSemenForm(p => ({ ...p, ph: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">التركيز (مليون/مل)</label>
                        <input type="number" step="0.01" value={semenForm.countMilPerMl || ""} onChange={e => setSemenForm(p => ({ ...p, countMilPerMl: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">العدد الكلي (مليون)</label>
                        <input type="number" step="0.01" value={semenForm.totalCountMil || ""} onChange={e => setSemenForm(p => ({ ...p, totalCountMil: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">الحركة التقدمية PR (%)</label>
                        <input type="number" step="0.1" value={semenForm.progressivePR || ""} onChange={e => setSemenForm(p => ({ ...p, progressivePR: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">غير تقدمية NP (%)</label>
                        <input type="number" step="0.1" value={semenForm.nonProgressiveNP || ""} onChange={e => setSemenForm(p => ({ ...p, nonProgressiveNP: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">الشكل الطبيعي (%)</label>
                        <input type="number" step="0.1" value={semenForm.normalForms || ""} onChange={e => setSemenForm(p => ({ ...p, normalForms: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">الحيوية (%)</label>
                        <input type="number" step="0.1" value={semenForm.vitality || ""} onChange={e => setSemenForm(p => ({ ...p, vitality: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">WBC (مليون/مل)</label>
                        <input type="number" step="0.1" value={semenForm.wbcCount || ""} onChange={e => setSemenForm(p => ({ ...p, wbcCount: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">التراص</label>
                        <select value={semenForm.agglutination || ""} onChange={e => setSemenForm(p => ({ ...p, agglutination: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none">
                          <option value="">—</option>
                          <option value="None">لا يوجد</option>
                          <option value="Mild">خفيف</option>
                          <option value="Moderate">متوسط</option>
                          <option value="Severe">شديد</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">اللزوجة</label>
                        <select value={semenForm.viscosity || ""} onChange={e => setSemenForm(p => ({ ...p, viscosity: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none">
                          <option value="">—</option>
                          <option value="Normal">طبيعي</option>
                          <option value="High">مرتفع</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="text-slate-400 text-xs mb-1 block">الحكم / الخلاصة</label>
                      <textarea value={semenForm.conclusion || ""} onChange={e => setSemenForm(p => ({ ...p, conclusion: e.target.value }))} placeholder="مثلاً: Oligoasthenoteratozoospermia..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-cyan-500 outline-none min-h-[60px]" />
                    </div>
                    <div className="mt-4">
                      <label className="text-slate-400 text-xs mb-1 block">ملاحظات الطبيب</label>
                      <textarea value={semenForm.doctorNotes || ""} onChange={e => setSemenForm(p => ({ ...p, doctorNotes: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-cyan-500 outline-none min-h-[60px]" />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                      <button onClick={() => setShowSemenForm(false)} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">إلغاء</button>
                      <button onClick={submitSemenAnalysis} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm">💾 حفظ التحليل</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === ANDROLOGY VISITS TAB === */}
          {tab === "ANDROLOGY" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-cyan-400">🩺 الزيارات السريرية</h3>
                <button onClick={() => setShowAndrologyForm(true)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                  ➕ زيارة جديدة
                </button>
              </div>

              {visits.length === 0 ? (
                <div className="text-center text-slate-500 py-12 bg-slate-900/50 rounded-2xl border border-slate-800">
                  <p className="text-4xl mb-3">🩺</p>
                  <p>لا توجد زيارات مسجلة لعيادة أمراض الذكورة.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visits.map(v => (
                    <div key={v.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-cyan-500/30 transition-colors">
                      <div className="flex justify-between mb-3">
                        <h4 className="text-sm font-bold text-white">زيارة بتاريخ {fmtDate(v.createdAt)}</h4>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">FSH</span><div className="text-white font-bold mt-1">{fmtNum(v.fshLevel)} mIU/mL</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">LH</span><div className="text-white font-bold mt-1">{fmtNum(v.lhLevel)} mIU/mL</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">Testosterone</span><div className="text-white font-bold mt-1">{fmtNum(v.testosterone)} ng/dL</div></div>
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">Prolactin</span><div className="text-white font-bold mt-1">{fmtNum(v.prolactin)} ng/mL</div></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        {v.varicoceleGrade && <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">الدوالي</span><div className="text-amber-400 font-bold mt-1">{v.varicoceleGrade}</div></div>}
                        {v.testicularVol && <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">حجم الخصية</span><div className="text-white font-bold mt-1">{v.testicularVol}</div></div>}
                        <div className="bg-slate-950 p-3 rounded-xl"><span className="text-slate-500">ض. جنسي</span><div className={`font-bold mt-1 ${v.erectileDisfunc ? "text-red-400" : "text-emerald-400"}`}>{v.erectileDisfunc ? "نعم" : "لا"}</div></div>
                      </div>
                      {v.diagnosis && <div className="mt-3 text-xs text-amber-300 bg-amber-900/20 border border-amber-500/20 p-3 rounded-xl">📌 التشخيص: {v.diagnosis}</div>}
                      {v.treatmentPlan && <div className="mt-2 text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-500/20 p-3 rounded-xl">💊 خطة العلاج: {v.treatmentPlan}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Andrology Visit Form Modal */}
              {showAndrologyForm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-bold text-cyan-400 mb-6">🩺 زيارة أمراض ذكورة جديدة</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">درجة الدوالي</label>
                        <select value={andrologyForm.varicoceleGrade || ""} onChange={e => setAndrologyForm(p => ({ ...p, varicoceleGrade: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none">
                          <option value="">لا يوجد</option>
                          <option value="Grade I">Grade I</option>
                          <option value="Grade II">Grade II</option>
                          <option value="Grade III">Grade III</option>
                          <option value="Bilateral">Bilateral</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">حجم الخصية</label>
                        <input value={andrologyForm.testicularVol || ""} onChange={e => setAndrologyForm(p => ({ ...p, testicularVol: e.target.value }))} placeholder="مثلاً: R:15ml L:12ml" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">ضعف جنسي</label>
                        <select value={andrologyForm.erectileDisfunc ? "true" : "false"} onChange={e => setAndrologyForm(p => ({ ...p, erectileDisfunc: e.target.value === "true" }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none">
                          <option value="false">لا</option>
                          <option value="true">نعم</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">التدخين</label>
                        <select value={andrologyForm.smokingHabit || ""} onChange={e => setAndrologyForm(p => ({ ...p, smokingHabit: e.target.value }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none">
                          <option value="">غير محدد</option>
                          <option value="Non-Smoker">غير مدخن</option>
                          <option value="Smoker">مدخن</option>
                          <option value="Ex-Smoker">مدخن سابق</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">FSH (mIU/mL)</label>
                        <input type="number" step="0.01" value={andrologyForm.fshLevel || ""} onChange={e => setAndrologyForm(p => ({ ...p, fshLevel: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">LH (mIU/mL)</label>
                        <input type="number" step="0.01" value={andrologyForm.lhLevel || ""} onChange={e => setAndrologyForm(p => ({ ...p, lhLevel: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">Testosterone (ng/dL)</label>
                        <input type="number" step="0.01" value={andrologyForm.testosterone || ""} onChange={e => setAndrologyForm(p => ({ ...p, testosterone: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="text-slate-400 text-xs mb-1 block">Prolactin (ng/mL)</label>
                        <input type="number" step="0.01" value={andrologyForm.prolactin || ""} onChange={e => setAndrologyForm(p => ({ ...p, prolactin: Number(e.target.value) }))} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:border-cyan-500 outline-none" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="text-slate-400 text-xs mb-1 block">التشخيص</label>
                      <textarea value={andrologyForm.diagnosis || ""} onChange={e => setAndrologyForm(p => ({ ...p, diagnosis: e.target.value }))} placeholder="مثلاً: Azoospermia, Varicocele Grade III..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-cyan-500 outline-none min-h-[60px]" />
                    </div>
                    <div className="mt-4">
                      <label className="text-slate-400 text-xs mb-1 block">خطة العلاج</label>
                      <textarea value={andrologyForm.treatmentPlan || ""} onChange={e => setAndrologyForm(p => ({ ...p, treatmentPlan: e.target.value }))} placeholder="مثلاً: Varicocelectomy, Clomiphene Citrate..." className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-cyan-500 outline-none min-h-[60px]" />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                      <button onClick={() => setShowAndrologyForm(false)} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm">إلغاء</button>
                      <button onClick={submitAndrologyVisit} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm">💾 حفظ الزيارة</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
