import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";
import { PatientInfo, SemenAnalysis, AndrologyVisit, HormoneTest, AndrologySurgery, AndrologyMedication, AndrologyInvestigation } from "./types";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";

const SemenAnalysisForm = lazy(() => import("./components/SemenAnalysisForm"));
const AndrologyVisitForm = lazy(() => import("./components/AndrologyVisitForm"));
const HormoneTestForm = lazy(() => import("./components/HormoneTestForm"));
const AndrologySurgeryForm = lazy(() => import("./components/AndrologySurgeryForm"));
const AndrologyMedicationForm = lazy(() => import("./components/AndrologyMedicationForm"));
const AndrologyInvestigationForm = lazy(() => import("./components/AndrologyInvestigationForm"));
const AndrologyReportPrint = lazy(() => import("./components/AndrologyReportPrint"));
const CryoBankPanel = lazy(() => import("./components/CryoBankPanel"));

type AndrologyTab =
  | "OVERVIEW"
  | "SEMEN"
  | "HORMONES"
  | "ANDROLOGY"
  | "SURGERY"
  | "MEDICATION"
  | "INVESTIGATION"
  | "CRYO";

function AndrologyPanelFallback({ label = "جارِ تحميل القسم..." }: { label?: string }) {
  return (
    <div className="min-h-[280px] rounded-3xl border border-slate-800 bg-slate-950/40 flex items-center justify-center text-sm text-slate-500">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-500" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function AndrologyPage() {
  const [searchParams] = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  const [patientId, setPatientId] = useState<number | null>(patientIdParam ? Number(patientIdParam) : null);

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [analyses, setAnalyses] = useState<SemenAnalysis[]>([]);
  const [visits, setVisits] = useState<AndrologyVisit[]>([]);
  const [hormones, setHormones] = useState<HormoneTest[]>([]);
  const [surgeries, setSurgeries] = useState<AndrologySurgery[]>([]);
  const [medications, setMedications] = useState<AndrologyMedication[]>([]);
  const [investigations, setInvestigations] = useState<AndrologyInvestigation[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<AndrologyTab>("OVERVIEW");

  // Search
  const [searchMrn, setSearchMrn] = useState("");
  const [searchResults, setSearchResults] = useState<PatientInfo[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);

  // Forms Visibility
  const [showSemenForm, setShowSemenForm] = useState(false);
  const [showAndrologyForm, setShowAndrologyForm] = useState(false);
  const [showHormoneForm, setShowHormoneForm] = useState(false);
  const [showSurgeryForm, setShowSurgeryForm] = useState(false);
  const [showMedicationForm, setShowMedicationForm] = useState(false);
  const [showInvestigationForm, setShowInvestigationForm] = useState(false);
  const [showReportPrint, setShowReportPrint] = useState(false);

  const loadPatientData = useCallback(async (pid: number) => {
    setLoading(true);
    try {
      const [semenRes, visitRes, hormoneRes, surgeryRes, medRes, invRes] = await Promise.all([
        apiClient.get(`/obgyn/fertility/semen-analysis/patient/${pid}`),
        apiClient.get(`/obgyn/fertility/andrology/patient/${pid}`),
        apiClient.get(`/obgyn/fertility/hormone-tests/patient/${pid}`),
        apiClient.get(`/obgyn/fertility/andrology/surgeries/patient/${pid}`),
        apiClient.get(`/obgyn/fertility/andrology/medications/patient/${pid}`),
        apiClient.get(`/obgyn/fertility/andrology/investigations/patient/${pid}`),
      ]);
      setAnalyses(semenRes.data);
      setVisits(visitRes.data);
      setHormones(hormoneRes.data);
      setSurgeries(surgeryRes.data);
      setMedications(medRes.data);
      setInvestigations(invRes.data);
    } catch {
      // Data might not exist yet
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

  const submitSurgery = async (data: Partial<AndrologySurgery>) => {
    if (!patientId) return;
    try {
      await apiClient.post("/obgyn/fertility/andrology/surgeries", { ...data, patientId });
      toast.success("تم حفظ العملية الجراحية بنجاح.");
      setShowSurgeryForm(false);
      loadPatientData(patientId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "فشل الحفظ.");
    }
  };

  const submitMedication = async (data: Partial<AndrologyMedication>) => {
    if (!patientId) return;
    try {
      await apiClient.post("/obgyn/fertility/andrology/medications", { ...data, patientId });
      toast.success("تم حفظ الدواء بنجاح.");
      setShowMedicationForm(false);
      loadPatientData(patientId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "فشل الحفظ.");
    }
  };

  const submitInvestigation = async (data: Partial<AndrologyInvestigation>) => {
    if (!patientId) return;
    try {
      await apiClient.post("/obgyn/fertility/andrology/investigations", { ...data, patientId });
      toast.success("تم حفظ الفحص الطبي بنجاح.");
      setShowInvestigationForm(false);
      loadPatientData(patientId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "فشل الحفظ.");
    }
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("ar-LY") : "—";
  const fmtNum = (n?: number | null) => n != null ? Number(n).toFixed(1) : "—";

  // --- Chart Data Formatting ---
  const formatChartDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate().toString().padStart(2, '0')}`;
  };

  const semenChartData = [...analyses].sort((a,b)=> new Date(a.sampleDate).getTime() - new Date(b.sampleDate).getTime()).map(a => ({
    date: formatChartDate(a.sampleDate),
    count: a.countMilPerMl ? Number(a.countMilPerMl) : 0,
    motility: a.totalMotility ? Number(a.totalMotility) : 0,
  }));

  const hormoneChartData = [...hormones].sort((a,b)=> new Date(a.testDate).getTime() - new Date(b.testDate).getTime()).map(h => ({
    date: formatChartDate(h.testDate),
    FSH: h.fsh ? Number(h.fsh) : 0,
    Testosterone: h.totalTestosterone ? Number(h.totalTestosterone) : 0,
  }));

  const clearPatient = () => {
    setPatient(null); setPatientId(null); setAnalyses([]); setVisits([]); setHormones([]); setSurgeries([]); setMedications([]); setInvestigations([]);
  };

  return (
    <div className="p-6 space-y-6 text-slate-100 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
          <span className="text-4xl shadow-cyan-500/20 drop-shadow-xl">🧬</span>
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">عيادة أمراض الذكورة والعقم</h1>
          <p className="text-slate-400 mt-1">وحدة المتابعة المتقدمة: تحليل وتشخيص، بروفايل هرموني، وجراحات دقيقة</p>
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
          <div className="flex items-center gap-3">
            <button onClick={() => setShowReportPrint(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg border-2 border-blue-400/20 flex items-center gap-2">
              🖨️ التقرير الطبي
            </button>
            <button onClick={clearPatient} className="text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-4 py-2.5 rounded-xl transition-colors border border-slate-700 flex items-center gap-2">
              🔄 مريض آخر
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      {patient && (
        <div className="bg-slate-900/40 rounded-3xl p-6 border border-slate-800 shadow-2xl backdrop-blur-sm">
          <div className="flex flex-wrap gap-2 border-b border-slate-800 mb-6 overflow-x-auto hide-scroll">
            <button onClick={() => setTab("OVERVIEW")} className={`shrink-0 px-5 py-3 rounded-t-2xl text-sm font-bold transition-all ${tab === "OVERVIEW" ? "bg-slate-800/80 text-white border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.3)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              📊 لوحة التحكم
            </button>
            <button onClick={() => setTab("SEMEN")} className={`shrink-0 px-5 py-3 rounded-t-2xl text-sm font-bold transition-all ${tab === "SEMEN" ? "bg-slate-800/80 text-emerald-400 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(16,185,129,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              🔬 السائل المنوي
            </button>
            <button onClick={() => setTab("HORMONES")} className={`shrink-0 px-5 py-3 rounded-t-2xl text-sm font-bold transition-all ${tab === "HORMONES" ? "bg-slate-800/80 text-pink-400 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(236,72,153,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              🩸 الهرمونات
            </button>
            <button onClick={() => setTab("ANDROLOGY")} className={`shrink-0 px-5 py-3 rounded-t-2xl text-sm font-bold transition-all ${tab === "ANDROLOGY" ? "bg-slate-800/80 text-cyan-400 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(6,182,212,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              🩺 الزيارات
            </button>
            <button onClick={() => setTab("SURGERY")} className={`shrink-0 px-5 py-3 rounded-t-2xl text-sm font-bold transition-all ${tab === "SURGERY" ? "bg-slate-800/80 text-orange-400 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(249,115,22,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              🔪 الجراحات
            </button>
            <button onClick={() => setTab("MEDICATION")} className={`shrink-0 px-5 py-3 rounded-t-2xl text-sm font-bold transition-all ${tab === "MEDICATION" ? "bg-slate-800/80 text-violet-400 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(139,92,246,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              💊 الأدوية
            </button>
            <button onClick={() => setTab("INVESTIGATION")} className={`shrink-0 px-5 py-3 rounded-t-2xl text-sm font-bold transition-all ${tab === "INVESTIGATION" ? "bg-slate-800/80 text-indigo-400 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(99,102,241,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              🔬 الفحوصات (Investigations)
            </button>
            <button onClick={() => setTab("CRYO")} className={`shrink-0 px-5 py-3 rounded-t-2xl text-sm font-bold transition-all ${tab === "CRYO" ? "bg-slate-800/80 text-cyan-300 border-t border-x border-slate-700 shadow-[0_-4px_10px_-2px_rgba(103,232,249,0.15)]" : "text-slate-400 hover:bg-slate-800/30 hover:text-slate-200"}`}>
              ❄️ بنك التجميد
            </button>
          </div>

          <div className="min-h-[400px]">
            {/* === OVERVIEW TAB (Dashboard) === */}
            {tab === "OVERVIEW" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {/* Summary Card */}
                  <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden md:col-span-1">
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
                        <p className="text-xs text-slate-400 mb-1">آخر تشخيص سريري</p>
                        <p className="text-sm font-bold text-cyan-400 bg-cyan-950/30 p-2 rounded-lg border border-cyan-900/50">
                          {visits[0]?.diagnosis || "لم يحدد بعد"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">الإجراءات الجراحية</p>
                        <p className="text-sm font-bold text-orange-400 bg-orange-950/30 p-2 rounded-lg border border-orange-900/50">
                          {surgeries.length > 0 ? `${surgeries.length} عملية (آخرها: ${surgeries[0].procedure})` : "لا يوجد تدخلات جراحية"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Charts */}
                  <div className="md:col-span-3 grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* Semen Trend Chart */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                      <h3 className="text-sm font-bold text-emerald-400 mb-4 flex justify-between items-center">
                        <span>📈 مسار السائل المنوي عبر الزمن</span>
                        <span className="text-[10px] text-slate-500 bg-slate-950 px-2 py-1 rounded-md">Concentration vs Motility</span>
                      </h3>
                      {semenChartData.length > 1 ? (
                        <div className="h-48" dir="ltr">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={semenChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickMargin={8} />
                              <YAxis stroke="#64748b" fontSize={11} />
                              <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }} />
                              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                              <Line type="monotone" dataKey="count" name="Concentration (M/ml)" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} />
                              <Line type="monotone" dataKey="motility" name="Motility (%)" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8' }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-48 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                          يتطلب التخطيط البياني تحليلين أو أكثر
                        </div>
                      )}
                    </div>

                    {/* Hormone Trend Chart */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                      <h3 className="text-sm font-bold text-pink-400 mb-4 flex justify-between items-center">
                        <span>📉 التغير الهرموني الكلي</span>
                        <span className="text-[10px] text-slate-500 bg-slate-950 px-2 py-1 rounded-md">FSH vs Testosterone</span>
                      </h3>
                      {hormoneChartData.length > 1 ? (
                        <div className="h-48" dir="ltr">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={hormoneChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickMargin={8} />
                              <YAxis yAxisId="left" stroke="#64748b" fontSize={11} />
                              <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={11} />
                              <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }} />
                              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                              <Line yAxisId="left" type="monotone" dataKey="Testosterone" name="Testosterone (ng/dL)" stroke="#f472b6" strokeWidth={2} dot={{ r: 3 }} />
                              <Line yAxisId="right" type="monotone" dataKey="FSH" name="FSH (mIU/mL)" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-48 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                          يتطلب التخطيط البياني فحصين أو أكثر
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Patient Journey Timeline summary */}
                <div>
                    <h3 className="text-base font-bold text-slate-300 mb-3 flex items-center gap-2">⏱️ التسلسل الزمني السريع للمريض (Timeline)</h3>
                    <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scroll">
                      {medications[0] && (
                        <div className="min-w-[200px] shrink-0 bg-violet-950/20 border border-violet-900/50 p-4 rounded-xl flex items-center gap-3 snap-start">
                          <div className="text-2xl mt-1 opacity-80">💊</div>
                          <div><div className="text-[10px] text-violet-400 font-mono">{fmtDate(medications[0].startDate)}</div><div className="text-sm font-bold text-white truncate max-w-[150px]">{medications[0].medication}</div><div className="text-xs text-slate-400">بدء علاج</div></div>
                        </div>
                      )}
                      {surgeries[0] && (
                        <div className="min-w-[200px] shrink-0 bg-orange-950/20 border border-orange-900/50 p-4 rounded-xl flex items-center gap-3 snap-start">
                          <div className="text-2xl mt-1 opacity-80">🔪</div>
                          <div><div className="text-[10px] text-orange-400 font-mono">{fmtDate(surgeries[0].surgeryDate)}</div><div className="text-sm font-bold text-white truncate max-w-[150px]">{surgeries[0].procedure}</div><div className="text-xs text-slate-400">عملية جراحية</div></div>
                        </div>
                      )}
                      {analyses[0] && (
                        <div className="min-w-[200px] shrink-0 bg-emerald-950/20 border border-emerald-900/50 p-4 rounded-xl flex items-center gap-3 snap-start">
                          <div className="text-2xl mt-1 opacity-80">🔬</div>
                          <div><div className="text-[10px] text-emerald-400 font-mono">{fmtDate(analyses[0].sampleDate)}</div><div className="text-sm font-bold text-white truncate max-w-[150px]">سائل منوي</div><div className="text-xs text-slate-400">{analyses[0].autoClassification?.substring(0,15) || "-"}</div></div>
                        </div>
                      )}
                      {investigations[0] && (
                        <div className="min-w-[200px] shrink-0 bg-indigo-950/20 border border-indigo-900/50 p-4 rounded-xl flex items-center gap-3 snap-start">
                          <div className="text-2xl mt-1 opacity-80">🩻</div>
                          <div><div className="text-[10px] text-indigo-400 font-mono">{fmtDate(investigations[0].investigationDate)}</div><div className="text-sm font-bold text-white truncate max-w-[150px]">{investigations[0].type}</div><div className="text-xs text-slate-400">فحص وتصوير</div></div>
                        </div>
                      )}
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
                        </div>
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
                          <th className="p-4 font-medium text-center">FSH <span className="text-[10px] text-slate-500">mIU</span></th>
                          <th className="p-4 font-medium text-center">LH <span className="text-[10px] text-slate-500">mIU</span></th>
                          <th className="p-4 font-medium text-center">Total T <span className="text-[10px] text-slate-500">ng/dL</span></th>
                          <th className="p-4 font-medium text-center">E2 <span className="text-[10px] text-slate-500">pg/mL</span></th>
                          <th className="p-4 font-medium text-center">PRL <span className="text-[10px] text-slate-500">ng/mL</span></th>
                          <th className="p-4 rounded-tl-xl font-medium">ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {hormones.map(h => (
                          <tr key={h.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-4 font-mono text-cyan-400">{fmtDate(h.testDate)}</td>
                            <td className="p-4 text-center text-white">{fmtNum(h.fsh)}</td>
                            <td className="p-4 text-center text-white">{fmtNum(h.lh)}</td>
                            <td className="p-4 text-center text-emerald-400 font-bold">{fmtNum(h.totalTestosterone)}</td>
                            <td className="p-4 text-center text-pink-300">{fmtNum(h.estradiol)}</td>
                            <td className="p-4 text-center text-amber-300">{fmtNum(h.prolactin)}</td>
                            <td className="p-4 text-slate-400 text-xs w-1/4 truncate max-w-[150px]">{h.notes || "—"}</td>
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
                    <p className="font-medium">لا توجد زيارات مسجلة.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {visits.map(v => (
                      <div key={v.id} className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-6">
                        <div className="mb-4 pb-3 border-b border-slate-800">
                          <h4 className="text-base font-bold text-white">📅 زيارة بتاريخ {fmtDate(v.createdAt)}</h4>
                        </div>
                        {v.chiefComplaint && (
                          <div className="mb-4">
                            <span className="text-slate-500 text-xs block mb-1">الشكوى الرئيسية</span>
                            <div className="text-slate-200 text-sm bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">{v.chiefComplaint}</div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                          <div className="bg-slate-950/80 p-3.5 rounded-xl"><span className="text-slate-500 text-xs mb-1">الدوالي العامة</span><div className="text-amber-400 font-bold">{v.varicoceleGrade || "—"}</div></div>
                          <div className="bg-slate-950/80 p-3.5 rounded-xl"><span className="text-slate-500 text-xs mb-1">الدوالي (يمين / يسار)</span><div className="text-slate-300 font-bold">R: {v.varicoceleRight || "—"} | L: {v.varicoceleLeft || "—"}</div></div>
                        </div>
                        {v.treatmentPlan && <div className="text-sm bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-xl"><span className="text-emerald-500 text-xs font-bold block mb-1">خطة العلاج</span><div>{v.treatmentPlan}</div></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* === SURGERY TAB === */}
            {tab === "SURGERY" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                  <h3 className="text-base font-bold text-orange-400 flex items-center gap-2">🔪<span className="mt-0.5">التدخلات الجراحية والميكروسكوبية</span></h3>
                  <button onClick={() => setShowSurgeryForm(true)} className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-orange-900/50 transition-all">
                    ➕ توثيق جراحة
                  </button>
                </div>
                {surgeries.length === 0 ? (
                  <div className="text-center text-slate-500 py-16 bg-slate-900/30 rounded-3xl border border-slate-800/50 border-dashed">
                    <p className="text-5xl mb-4 opacity-50">🔪</p>
                    <p className="font-medium">لم يتم إجراء عمليات جراحية للمريض.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {surgeries.map(s => (
                      <div key={s.id} className="bg-slate-900/60 border-l-4 border-l-orange-500 border border-slate-700/60 hover:border-orange-500/40 rounded-r-2xl p-6 transition-colors shadow-sm">
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800/60">
                          <div>
                            <h4 className="text-lg font-bold text-white inline-flex items-center gap-2">
                              {s.procedure} 
                              {s.spermRetrieved && <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px] rounded border border-emerald-500/30">✅ نجاح الاستخراج</span>}
                            </h4>
                            <div className="text-xs text-orange-200 mt-1">تاريخ العملية: <span className="font-mono">{fmtDate(s.surgeryDate)}</span></div>
                          </div>
                          {s.surgeonName && <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">الجراح: {s.surgeonName}</div>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-3">
                          {s.technique && <div><span className="text-slate-500 text-xs">التقنية الجراحية:</span> <span className="text-slate-200 block mt-1">{s.technique}</span></div>}
                          {s.findings && <div><span className="text-slate-500 text-xs">نتائج العملية (Findings):</span> <div className="text-slate-300 mt-1 bg-slate-950/50 p-2 rounded-lg text-xs leading-relaxed">{s.findings}</div></div>}
                          {s.outcome && <div className="md:col-span-2"><span className="text-slate-500 text-xs">النتيجة (Outcome):</span> <div className="text-orange-100 font-bold mt-1 bg-orange-950/20 border border-orange-900/30 p-2 rounded-lg text-sm">{s.outcome}</div></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* === MEDICATION TAB === */}
            {tab === "MEDICATION" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                  <h3 className="text-base font-bold text-violet-400 flex items-center gap-2">💊<span className="mt-0.5">الخطة العلاجية الدوائية</span></h3>
                  <button onClick={() => setShowMedicationForm(true)} className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-violet-900/50 transition-all">
                    ➕ إضافة دواء
                  </button>
                </div>
                {medications.length === 0 ? (
                  <div className="text-center text-slate-500 py-16 bg-slate-900/30 rounded-3xl border border-slate-800/50 border-dashed">
                    <p className="text-5xl mb-4 opacity-50">💊</p>
                    <p className="font-medium">لم يتم وصف أدوية للمريض.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {medications.map(m => (
                      <div key={m.id} className="bg-slate-900/60 border border-slate-700/60 hover:bg-slate-800/50 rounded-2xl p-5 transition-colors relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-2 h-full bg-violet-600 rounded-r-2xl"></div>
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-base font-bold text-white">{m.medication}</h4>
                            <div className="text-xs text-violet-300 mt-1">{m.category || "دواء عام"}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-400">البدء: <span className="text-white font-mono">{fmtDate(m.startDate)}</span></div>
                            {m.endDate && <div className="text-xs text-slate-400 mt-1">الانتهاء: <span className="text-white font-mono">{fmtDate(m.endDate)}</span></div>}
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          {m.dose && <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded-md border border-slate-700">جرعة: {m.dose}</span>}
                          {m.frequency && <span className="bg-slate-800 text-slate-200 px-2 py-1 rounded-md border border-slate-700">تكرار: {m.frequency}</span>}
                        </div>
                        {m.response && <div className="mt-4 text-xs bg-emerald-950/20 text-emerald-300 font-medium p-2.5 rounded-xl border border-emerald-900/30">✅ استجابة: {m.response}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* === INVESTIGATIONS TAB === */}
            {tab === "INVESTIGATION" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                  <h3 className="text-base font-bold text-indigo-400 flex items-center gap-2">🔬<span className="mt-0.5">الفحوصات الطبية المتقدمة</span></h3>
                  <button onClick={() => setShowInvestigationForm(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/50 transition-all">
                    ➕ إرفاق فحص جديد
                  </button>
                </div>
                
                {investigations.length === 0 ? (
                  <div className="text-center text-slate-500 py-16 bg-slate-900/30 rounded-3xl border border-slate-800/50 border-dashed">
                    <p className="text-5xl mb-4 opacity-50">🩻</p>
                    <p className="font-medium">لا توجد فحوصات أو صور أشعة مسجلة.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {investigations.map(inv => (
                      <div key={inv.id} className="bg-slate-900/60 border border-slate-700/60 hover:border-indigo-500/40 rounded-2xl p-6 transition-colors shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-2 h-full bg-indigo-500 rounded-r-2xl opacity-50"></div>
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800/60">
                          <div>
                            <h4 className="text-lg font-bold text-white inline-flex items-center gap-2">
                              {inv.type}
                            </h4>
                            <div className="text-xs text-indigo-200 mt-1">تاريخ الفحص: <span className="font-mono">{fmtDate(inv.investigationDate)}</span></div>
                          </div>
                          {inv.facilityName && <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">المختبر: {inv.facilityName}</div>}
                        </div>
                        <div className="space-y-3 text-sm mt-3">
                          <div><span className="text-slate-500 text-xs block mb-1">النتائج الفنية (Findings):</span> <div className="text-slate-200 bg-slate-950/50 p-4 rounded-xl text-sm leading-relaxed border border-slate-800/50 whitespace-pre-wrap">{inv.findings}</div></div>
                          {inv.interpretation && <div><span className="text-slate-500 text-xs block mb-1">التفسير والخلاصة (Interpretation):</span> <div className="text-indigo-100 font-medium mt-1 bg-indigo-950/20 border border-indigo-900/30 p-3 rounded-xl text-sm">{inv.interpretation}</div></div>}
                          <div className="flex gap-4">
                            {inv.normalRange && <div className="text-xs text-slate-400"><span className="text-slate-500">Normal Range:</span> {inv.normalRange}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* === CRYO BANK TAB === */}
            {tab === "CRYO" && patient && (
              <Suspense fallback={<AndrologyPanelFallback label="جارِ تحميل بنك التجميد..." />}>
                <CryoBankPanel patientId={patientId!} patientName={patient.fullName} />
              </Suspense>
            )}

          </div>
        </div>
      )}

      {/* Render Modals */}
      {showSemenForm && (
        <Suspense fallback={<AndrologyPanelFallback label="جارِ تحميل نموذج السائل المنوي..." />}>
          <SemenAnalysisForm onSave={submitSemenAnalysis} onCancel={() => setShowSemenForm(false)} />
        </Suspense>
      )}
      {showAndrologyForm && (
        <Suspense fallback={<AndrologyPanelFallback label="جارِ تحميل نموذج الزيارة..." />}>
          <AndrologyVisitForm onSave={submitAndrologyVisit} onCancel={() => setShowAndrologyForm(false)} />
        </Suspense>
      )}
      {showHormoneForm && (
        <Suspense fallback={<AndrologyPanelFallback label="جارِ تحميل نموذج الهرمونات..." />}>
          <HormoneTestForm onSave={submitHormoneTest} onCancel={() => setShowHormoneForm(false)} />
        </Suspense>
      )}
      {showSurgeryForm && (
        <Suspense fallback={<AndrologyPanelFallback label="جارِ تحميل نموذج الجراحة..." />}>
          <AndrologySurgeryForm onSave={submitSurgery} onCancel={() => setShowSurgeryForm(false)} />
        </Suspense>
      )}
      {showMedicationForm && (
        <Suspense fallback={<AndrologyPanelFallback label="جارِ تحميل نموذج الدواء..." />}>
          <AndrologyMedicationForm onSave={submitMedication} onCancel={() => setShowMedicationForm(false)} />
        </Suspense>
      )}
      {showInvestigationForm && (
        <Suspense fallback={<AndrologyPanelFallback label="جارِ تحميل نموذج الفحوصات..." />}>
          <AndrologyInvestigationForm onSave={submitInvestigation} onCancel={() => setShowInvestigationForm(false)} />
        </Suspense>
      )}
      
      {showReportPrint && patient && (
        <Suspense fallback={<AndrologyPanelFallback label="جارِ تحميل التقرير الطبي..." />}>
          <AndrologyReportPrint 
            patient={patient} 
            analyses={analyses} 
            hormones={hormones} 
            surgeries={surgeries} 
            medications={medications} 
            visits={visits} 
            onClose={() => setShowReportPrint(false)} 
          />
        </Suspense>
      )}
    </div>
  );
}
