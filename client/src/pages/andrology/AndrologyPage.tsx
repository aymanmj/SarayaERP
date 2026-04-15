import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { PatientInfo, SemenAnalysis, AndrologyVisit, HormoneTest } from "./types";
import SemenAnalysisForm from "./components/SemenAnalysisForm";
import AndrologyVisitForm from "./components/AndrologyVisitForm";
import HormoneTestForm from "./components/HormoneTestForm";

export default function AndrologyPage() {
  const [searchParams] = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  const [patientId, setPatientId] = useState<number | null>(patientIdParam ? Number(patientIdParam) : null);

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [analyses, setAnalyses] = useState<SemenAnalysis[]>([]);
  const [visits, setVisits] = useState<AndrologyVisit[]>([]);
  const [hormones, setHormones] = useState<HormoneTest[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"OVERVIEW" | "SEMEN" | "HORMONES" | "ANDROLOGY">("OVERVIEW");

  // Search
  const [searchMrn, setSearchMrn] = useState("");
  const [searchResults, setSearchResults] = useState<PatientInfo[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);

  // Forms Visibility
  const [showSemenForm, setShowSemenForm] = useState(false);
  const [showAndrologyForm, setShowAndrologyForm] = useState(false);
  const [showHormoneForm, setShowHormoneForm] = useState(false);

  const loadPatientData = useCallback(async (pid: number) => {
    setLoading(true);
    try {
      const [semenRes, visitRes, hormoneRes] = await Promise.all([
        apiClient.get(`/obgyn/fertility/semen-analysis/patient/${pid}`),
        apiClient.get(`/obgyn/fertility/andrology/patient/${pid}`),
        apiClient.get(`/obgyn/fertility/hormone-tests/patient/${pid}`),
      ]);
      setAnalyses(semenRes.data);
      setVisits(visitRes.data);
      setHormones(hormoneRes.data);
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
    setSearching(true);
    try {
      const res = await apiClient.get("/patients", {
        params: { search: searchMrn.trim(), limit: 10 },
      });
      const items = res.data?.items || res.data?.data || [];
      if (items.length === 0) {
        toast.error("لم يتم العثور على أي مريض.");
        setSearchResults([]);
        setShowResults(false);
      } else if (items.length === 1) {
        selectPatient(items[0]);
      } else {
        setSearchResults(items);
        setShowResults(true);
      }
    } catch {
      toast.error("خطأ في البحث.");
    } finally {
      setSearching(false);
    }
  };

  const selectPatient = (p: PatientInfo) => {
    setPatientId(p.id);
    setPatient(p);
    setShowResults(false);
    setSearchResults([]);
    setSearchMrn("");
    loadPatientData(p.id);
  };

  const submitSemenAnalysis = async (data: Partial<SemenAnalysis>) => {
    if (!patientId) return;
    try {
      await apiClient.post("/obgyn/fertility/semen-analysis", { ...data, patientId });
      toast.success("تم حفظ تحليل السائل المنوي بنجاح.");
      setShowSemenForm(false);
      loadPatientData(patientId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "فشل الحفظ.");
    }
  };

  const submitAndrologyVisit = async (data: Partial<AndrologyVisit>) => {
    if (!patientId) return;
    try {
      await apiClient.post("/obgyn/fertility/andrology", { ...data, patientId });
      toast.success("تم حفظ زيارة أمراض الذكورة.");
      setShowAndrologyForm(false);
      loadPatientData(patientId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "فشل الحفظ.");
    }
  };

  const submitHormoneTest = async (data: Partial<HormoneTest>) => {
    if (!patientId) return;
    try {
      await apiClient.post("/obgyn/fertility/hormone-tests", { ...data, patientId });
      toast.success("تم حفظ البروفايل الهرموني بنجاح.");
      setShowHormoneForm(false);
      loadPatientData(patientId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "فشل الحفظ.");
    }
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("ar-LY") : "—";
  const fmtNum = (n?: number | null) => n != null ? Number(n).toFixed(1) : "—";

  return (
    <div className="p-6 space-y-6 text-slate-100 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
          <span className="text-4xl shadow-cyan-500/20 drop-shadow-xl">🧬</span>
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">عيادة أمراض الذكورة والعقم</h1>
          <p className="text-slate-400 mt-1">وحدة المتابعة المتقدمة: تحاليلات متقدمة (WHO 6th Ed)، بروفايل هرموني، ومتابعة سريرية</p>
        </div>
      </div>

      {/* Patient Search / Info */}
      {!patient ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 shadow-xl">
          <h2 className="text-base font-bold text-slate-300 mb-6 flex items-center gap-2">🔍<span className="text-lg">البحث عن المريض</span></h2>
          <div className="relative max-w-2xl">
            <div className="flex gap-4">
              <input
                value={searchMrn}
                onChange={e => setSearchMrn(e.target.value)}
                onKeyDown={e => e.key === "Enter" && searchPatient()}
                placeholder="ابحث بواسطة الاسم، رقم الملف (MRN)، أو رقم الهاتف..."
                className="flex-1 bg-slate-950 border-2 border-slate-700/50 rounded-2xl px-5 py-4 text-sm focus:border-cyan-500 outline-none shadow-inner"
              />
              <button onClick={searchPatient} disabled={searching} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white px-8 py-4 rounded-2xl font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all">
                {searching ? "جاري البحث..." : "بحث الآن"}
              </button>
            </div>
            {/* Search Results Dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-30 max-h-72 overflow-y-auto">
                <div className="p-3 text-[11px] text-slate-500 border-b border-slate-800 px-4 bg-slate-950/50">
                  تم العثور على {searchResults.length} نتيجة — الرجاء الاختيار:
                </div>
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selectPatient(p)}
                    className="w-full text-right px-5 py-4 hover:bg-cyan-900/20 border-b border-slate-800/50 last:border-0 flex items-center gap-4 transition-colors"
                  >
                    <div className="w-10 h-10 bg-cyan-900/40 border border-cyan-500/30 rounded-full flex items-center justify-center text-lg flex-shrink-0 shadow-inner">🧑</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-bold text-white truncate">{p.fullName}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        MRN: <span className="text-cyan-400 font-mono bg-cyan-900/20 px-1.5 py-0.5 rounded">{p.mrn}</span>
                        {p.phone && <span className="mr-4">📞 {p.phone}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-slate-900 to-cyan-950/30 border border-cyan-900/50 rounded-3xl p-6 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-cyan-900/50 border-2 border-cyan-500/40 rounded-full flex items-center justify-center text-2xl shadow-inner shadow-black/50">🧑</div>
            <div>
              <h2 className="text-xl font-bold text-white">{patient.fullName}</h2>
              <div className="flex items-center gap-3 mt-1.5">
                <p className="text-cyan-400 text-xs font-mono bg-cyan-950/50 px-2 py-0.5 rounded-md border border-cyan-900/50">MRN: {patient.mrn}</p>
                {patient.phone && <p className="text-slate-400 text-xs">📞 {patient.phone}</p>}
              </div>
            </div>
          </div>
          <button onClick={() => { setPatient(null); setPatientId(null); setAnalyses([]); setVisits([]); setHormones([]); }} className="text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-4 py-2 rounded-xl transition-colors border border-slate-700">
            🔄 تغيير المريض
          </button>
        </div>
      )}

      {/* Tabs */}
      {patient && (
        <div className="bg-slate-900/40 rounded-3xl p-6 border border-slate-800 shadow-2xl backdrop-blur-sm">
          <div className="flex flex-wrap gap-2 border-b border-slate-800 mb-6">
            <button onClick={() => setTab("OVERVIEW")} className={`px-6 py-3.5 rounded-t-2xl text-sm font-bold transition-all ${tab === "OVERVIEW" ? "bg-slate-800/80 text-white border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.3)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              📊 نظرة عامة
            </button>
            <button onClick={() => setTab("SEMEN")} className={`px-6 py-3.5 rounded-t-2xl text-sm font-bold transition-all ${tab === "SEMEN" ? "bg-slate-800/80 text-emerald-400 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(16,185,129,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              🔬 تحليل السائل المنوي
            </button>
            <button onClick={() => setTab("HORMONES")} className={`px-6 py-3.5 rounded-t-2xl text-sm font-bold transition-all ${tab === "HORMONES" ? "bg-slate-800/80 text-pink-400 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(236,72,153,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              🩸 البروفايل الهرموني
            </button>
            <button onClick={() => setTab("ANDROLOGY")} className={`px-6 py-3.5 rounded-t-2xl text-sm font-bold transition-all ${tab === "ANDROLOGY" ? "bg-slate-800/80 text-cyan-400 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(6,182,212,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              🩺 الزيارات السريرية
            </button>
          </div>

          <div className="min-h-[400px]">
            {/* === OVERVIEW TAB === */}
            {tab === "OVERVIEW" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Summary Card */}
                  <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
                    <h3 className="text-lg font-bold text-white mb-4">الملخص السريري 💡</h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">حالة السائل المنوي (آخر تحليل)</p>
                        <p className="text-sm font-bold text-emerald-400 bg-emerald-950/30 p-2 rounded-lg border border-emerald-900/50">
                          {analyses[0] ? (analyses[0].autoClassification || "لم يُصنف بعد") : "لا يوجد تحليل"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">الوضع الهرموني (آخر فحص)</p>
                        <p className="text-sm font-bold text-pink-400 bg-pink-950/30 p-2 rounded-lg border border-pink-900/50">
                          {hormones[0] ? `FSH: ${fmtNum(hormones[0].fsh)} • T: ${fmtNum(hormones[0].totalTestosterone)}` : "لا يوجد بروفايل"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">آخر تشخيص</p>
                        <p className="text-sm font-bold text-cyan-400 bg-cyan-950/30 p-2 rounded-lg border border-cyan-900/50">
                          {visits[0]?.diagnosis || "لم يحدد بعد"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Highlights */}
                  <div className="md:col-span-2 grid grid-cols-2 gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-center items-center text-center hover:border-slate-700 transition-colors">
                      <div className="text-3xl mb-2">🔬</div>
                      <div className="text-2xl font-black text-white">{analyses.length}</div>
                      <div className="text-xs text-slate-400 mt-1">تحاليل سائل منوي</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-center items-center text-center hover:border-slate-700 transition-colors">
                      <div className="text-3xl mb-2">🩸</div>
                      <div className="text-2xl font-black text-white">{hormones.length}</div>
                      <div className="text-xs text-slate-400 mt-1">فحوصات هرمونية</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-center items-center text-center hover:border-slate-700 transition-colors">
                      <div className="text-3xl mb-2">🩺</div>
                      <div className="text-2xl font-black text-white">{visits.length}</div>
                      <div className="text-xs text-slate-400 mt-1">زيارات مسجلة</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-center items-center text-center hover:border-slate-700 transition-colors">
                      <div className="text-3xl mb-2">❄️</div>
                      <div className="text-2xl font-black text-white">0</div>
                      <div className="text-xs text-slate-400 mt-1">عينات مجمدة (قريباً)</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* === SEMEN ANALYSIS TAB === */}
            {tab === "SEMEN" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                  <h3 className="text-base font-bold text-emerald-400 flex items-center gap-2">📋<span className="mt-0.5">سجل السائل المنوي (WHO 6th Ed)</span></h3>
                  <button onClick={() => setShowSemenForm(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/50 transition-all">
                    ➕ إضافة تحليل جديد
                  </button>
                </div>

                {loading ? (
                  <div className="text-center text-slate-400 py-12">جارِ التحميل...</div>
                ) : analyses.length === 0 ? (
                  <div className="text-center text-slate-500 py-16 bg-slate-900/30 rounded-3xl border border-slate-800/50 border-dashed">
                    <p className="text-5xl mb-4 opacity-50">🧪</p>
                    <p className="font-medium">لا توجد تحاليل سائل منوي مسجلة.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {analyses.map(a => (
                      <div key={a.id} className="bg-slate-900/60 border border-slate-700/60 hover:border-emerald-500/40 rounded-2xl p-6 transition-colors shadow-sm">
                        <div className="flex justify-between items-start mb-5 pb-4 border-b border-slate-800/60">
                          <div>
                            <div className="flex items-center gap-3">
                              <h4 className="text-base font-bold text-white">تاريخ الفحص: {fmtDate(a.sampleDate)}</h4>
                              {a.autoClassification && (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
                                  {a.autoClassification}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-1.5 flex gap-3">
                              {a.abstinenceDays && <span>فترة امتناع: {a.abstinenceDays} أيام</span>}
                              {a.collectionMethod && <span>طريقة الجمع: {a.collectionMethod}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mt-4">
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">الحجم</span><div className="text-white font-bold">{fmtNum(a.volumeMl)} <span className="text-[10px] text-slate-500 font-normal">ml</span></div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">التركيز</span><div className="text-white font-bold">{fmtNum(a.countMilPerMl)} <span className="text-[10px] text-slate-500 font-normal">M/ml</span></div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">الحركة الكلية PR+NP</span><div className="text-white font-bold">{fmtNum(a.totalMotility)} <span className="text-[10px] text-slate-500 font-normal">%</span></div></div>
                          <div className="bg-emerald-950/20 border border-emerald-900/30 p-3.5 rounded-xl shadow-inner"><span className="text-emerald-500 text-xs block mb-1">التقدمية PR</span><div className="text-emerald-400 font-bold">{fmtNum(a.progressivePR)} <span className="text-[10px] text-emerald-500/50 font-normal">%</span></div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">شكل طبيعي (Kruger)</span><div className="text-white font-bold">{fmtNum(a.normalForms)} <span className="text-[10px] text-slate-500 font-normal">%</span></div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">تشوه الرأس</span><div className="text-white font-bold">{fmtNum(a.headDefects)} <span className="text-[10px] text-slate-500 font-normal">%</span></div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">تشوه الذيل</span><div className="text-white font-bold">{fmtNum(a.tailDefects)} <span className="text-[10px] text-slate-500 font-normal">%</span></div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">الحيوية Vitality</span><div className="text-white font-bold">{fmtNum(a.vitality)} <span className="text-[10px] text-slate-500 font-normal">%</span></div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">WBC</span><div className="text-white font-bold">{fmtNum(a.wbcCount)} <span className="text-[10px] text-slate-500 font-normal">M/ml</span></div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">تكسير المادة الوراثية</span><div className="text-amber-400 font-bold">{fmtNum(a.dnaFragmentation)} <span className="text-[10px] text-amber-500/50 font-normal">% DFI</span></div></div>
                        </div>
                        {a.conclusion && <div className="mt-4 text-xs text-amber-200 bg-amber-950/30 border border-amber-500/20 p-3.5 rounded-xl">📌 <span className="font-bold">الحكم/الخلاصة: </span> {a.conclusion}</div>}
                        {a.doctorNotes && <div className="mt-2 text-xs text-slate-300 bg-slate-950/50 border border-slate-800 p-3.5 rounded-xl text-justify leading-relaxed">📝 <span className="font-bold">ملاحظات:</span> {a.doctorNotes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* === HORMONES TAB === */}
            {tab === "HORMONES" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                  <h3 className="text-base font-bold text-pink-400 flex items-center gap-2">🩸<span className="mt-0.5">التتبع الهرموني (Hormonal Profile)</span></h3>
                  <button onClick={() => setShowHormoneForm(true)} className="bg-pink-600 hover:bg-pink-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-pink-900/50 transition-all">
                    ➕ إضافة فحص هرموني
                  </button>
                </div>

                {loading ? (
                  <div className="text-center text-slate-400 py-12">جارِ التحميل...</div>
                ) : hormones.length === 0 ? (
                  <div className="text-center text-slate-500 py-16 bg-slate-900/30 rounded-3xl border border-slate-800/50 border-dashed">
                    <p className="text-5xl mb-4 opacity-50">🩸</p>
                    <p className="font-medium">لا توجد فحوصات هرمونية مسجلة.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto bg-slate-900/60 rounded-2xl border border-slate-700/60 p-1">
                    <table className="w-full text-right text-sm">
                      <thead className="text-xs text-slate-400 bg-slate-950">
                        <tr>
                          <th className="p-4 rounded-tr-xl font-medium">التاريخ</th>
                          <th className="p-4 font-medium text-center">FSH<br/><span className="text-[10px] font-normal text-slate-500">mIU/mL</span></th>
                          <th className="p-4 font-medium text-center">LH<br/><span className="text-[10px] font-normal text-slate-500">mIU/mL</span></th>
                          <th className="p-4 font-medium text-center">Total T<br/><span className="text-[10px] font-normal text-slate-500">ng/dL</span></th>
                          <th className="p-4 font-medium text-center">Free T<br/><span className="text-[10px] font-normal text-slate-500">pg/mL</span></th>
                          <th className="p-4 font-medium text-center">E2<br/><span className="text-[10px] font-normal text-slate-500">pg/mL</span></th>
                          <th className="p-4 font-medium text-center">PRL<br/><span className="text-[10px] font-normal text-slate-500">ng/mL</span></th>
                          <th className="p-4 font-medium text-center">Inhibin B<br/><span className="text-[10px] font-normal text-slate-500">pg/mL</span></th>
                          <th className="p-4 rounded-tl-xl font-medium">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {hormones.map(h => (
                          <tr key={h.id} className="hover:bg-slate-800/30 transition-colors group">
                            <td className="p-4 font-mono text-cyan-400">{fmtDate(h.testDate)}</td>
                            <td className="p-4 text-center font-bold text-white">{fmtNum(h.fsh)}</td>
                            <td className="p-4 text-center font-bold text-white">{fmtNum(h.lh)}</td>
                            <td className="p-4 text-center font-bold text-emerald-400 bg-emerald-900/10 group-hover:bg-emerald-900/30 transition-colors">{fmtNum(h.totalTestosterone)}</td>
                            <td className="p-4 text-center font-medium text-white">{fmtNum(h.freeTestosterone)}</td>
                            <td className="p-4 text-center font-medium text-pink-300">{fmtNum(h.estradiol)}</td>
                            <td className="p-4 text-center font-medium text-amber-300">{fmtNum(h.prolactin)}</td>
                            <td className="p-4 text-center font-medium text-white">{fmtNum(h.inhibinB)}</td>
                            <td className="p-4 text-slate-400 text-xs w-1/4">{h.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* === ANDROLOGY VISITS TAB === */}
            {tab === "ANDROLOGY" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                  <h3 className="text-base font-bold text-cyan-400 flex items-center gap-2">🩺<span className="mt-0.5">زيارات أمراض الذكورة</span></h3>
                  <button onClick={() => setShowAndrologyForm(true)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-cyan-900/50 transition-all">
                    ➕ زيارة جديدة
                  </button>
                </div>

                {visits.length === 0 ? (
                  <div className="text-center text-slate-500 py-16 bg-slate-900/30 rounded-3xl border border-slate-800/50 border-dashed">
                    <p className="text-5xl mb-4 opacity-50">🩺</p>
                    <p className="font-medium">لا توجد زيارات مسجلة.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {visits.map(v => (
                      <div key={v.id} className="bg-slate-900/60 border border-slate-700/60 hover:border-cyan-500/40 rounded-2xl p-6 transition-colors shadow-sm">
                        <div className="flex justify-between mb-4 border-b border-slate-800 pb-3">
                          <h4 className="text-base font-bold text-white flex items-center gap-2">📅 زيارة بتاريخ {fmtDate(v.createdAt)}</h4>
                        </div>
                        
                        {v.chiefComplaint && (
                          <div className="mb-4">
                            <span className="text-slate-500 text-xs block mb-1">الشكوى الرئيسية (Chief Complaint)</span>
                            <div className="text-slate-200 text-sm bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">{v.chiefComplaint}</div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">الدوالي العامة</span><div className="text-amber-400 font-bold">{v.varicoceleGrade || "—"}</div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">الدوالي يمين/يسار</span><div className="text-slate-300 font-bold">R: {v.varicoceleRight || "—"} | L: {v.varicoceleLeft || "—"}</div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">حجم الخصية (ml)</span><div className="text-white font-bold">R: {fmtNum(v.testicularVolR)} | L: {fmtNum(v.testicularVolL)}</div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl shadow-inner"><span className="text-slate-500 text-xs block mb-1">الأسهر</span><div className="text-emerald-400 font-bold">{v.vasPresence || "—"}</div></div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mb-4">
                          {v.erectileDisfunc && <span className="bg-red-950/30 text-red-400 border border-red-900/50 px-3 py-1 rounded-lg text-xs">ضعف انتصاب</span>}
                          {v.ejaculatoryDisfunc && <span className="bg-orange-950/30 text-orange-400 border border-orange-900/50 px-3 py-1 rounded-lg text-xs">اضطراب قذف</span>}
                          {v.smokingHabit && v.smokingHabit !== 'NON_SMOKER' && <span className="bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-lg text-xs">{v.smokingHabit}</span>}
                          {v.bmi && <span className="bg-blue-950/30 text-blue-400 border border-blue-900/50 px-3 py-1 rounded-lg text-xs font-mono">BMI: {fmtNum(v.bmi)}</span>}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {v.diagnosis && <div className="text-sm bg-cyan-950/20 border border-cyan-900/30 p-4 rounded-xl"><span className="text-cyan-500 text-xs block mb-1 font-bold">🎯 التشخيص</span><div className="text-cyan-100">{v.diagnosis}</div></div>}
                          {v.treatmentPlan && <div className="text-sm bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-xl"><span className="text-emerald-500 text-xs block mb-1 font-bold">💊 خطة العلاج</span><div className="text-emerald-100">{v.treatmentPlan}</div></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Render Modals */}
      {showSemenForm && <SemenAnalysisForm onSave={submitSemenAnalysis} onCancel={() => setShowSemenForm(false)} />}
      {showAndrologyForm && <AndrologyVisitForm onSave={submitAndrologyVisit} onCancel={() => setShowAndrologyForm(false)} />}
      {showHormoneForm && <HormoneTestForm onSave={submitHormoneTest} onCancel={() => setShowHormoneForm(false)} />}
    </div>
  );
}
