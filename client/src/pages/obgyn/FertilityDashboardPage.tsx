import { useState, useEffect } from 'react';
import { apiClient } from '../../api/apiClient';
import { toast } from 'sonner';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ============ Types ============

interface FertilityCase {
  id: number;
  femalePatientId: number;
  malePatientId?: number;
  infertilityType: string;
  diagnosis?: string;
  durationYears?: number;
  previousTreatments?: string;
  amhLevel?: number;
  fshLevel?: number;
  lhLevel?: number;
  status: string;
  notes?: string;
  createdAt: string;
  femalePatient?: { id: number; fullName: string; mrn: string; dateOfBirth?: string };
  malePatient?: { id: number; fullName: string; mrn: string; dateOfBirth?: string };
  cycles: IVFCycle[];
  semenAnalyses?: any[];
  andrologyVisits?: any[];
  _count?: { cycles: number; semenAnalyses?: number };
}

interface IVFCycle {
  id: number;
  cycleNumber: number;
  cycleType: string;
  protocol?: string;
  startDate: string;
  stimulationDays?: number;
  eggRetrievalDate?: string;
  eggsRetrieved?: number;
  eggsMature?: number;
  eggsFertilized?: number;
  embryosDay3?: number;
  embryosDay5?: number;
  transferDate?: string;
  embryosTransferred?: number;
  embryosFrozen?: number;
  endometrialThickness?: number;
  betaHCGDate?: string;
  betaHCGResult?: number;
  pregnancyResult: string;
  cancelReason?: string;
  notes?: string;
  embryos: any[];
  medications: any[];
}

// ============ Labels ============

const infertilityLabels: Record<string, string> = {
  MALE_FACTOR: 'عامل ذكوري',
  FEMALE_FACTOR: 'عامل أنثوي',
  COMBINED: 'عامل مشترك',
  UNEXPLAINED: 'غير مفسر',
};

const cycleTypeLabels: Record<string, string> = {
  IVF: 'أطفال أنابيب (IVF)',
  ICSI: 'حقن مجهري (ICSI)',
  IUI: 'تلقيح صناعي (IUI)',
  FET: 'نقل أجنة مجمدة (FET)',
  EGG_FREEZING: 'تجميد بويضات',
  NATURAL: 'طبيعي',
};

const resultLabels: Record<string, string> = {
  PENDING: 'في الانتظار',
  POSITIVE: 'إيجابي (حمل) 🎉',
  NEGATIVE: 'سلبي',
  BIOCHEMICAL: 'حمل كيميائي',
  ECTOPIC: 'حمل خارج الرحم',
  MISCARRIAGE: 'إجهاض',
};

const embryoStatusLabels: Record<string, string> = {
  DEVELOPING: 'قيد التطور',
  TRANSFERRED: 'تم الترجيع',
  FROZEN: 'مجمد ❄️',
  THAWED: 'مذاب',
  DISCARDED: 'تم التخلص',
  DONATED: 'تبرع',
};

const statusLabels: Record<string, string> = {
  ACTIVE: 'نشط',
  SUCCESSFUL: 'ناجح 🎉',
  DISCONTINUED: 'متوقف',
  REFERRED: 'محول',
};

// ============ Component ============

export default function FertilityDashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patientId');
  const caseId = searchParams.get('caseId');

  const [fertCase, setFertCase] = useState<FertilityCase | null>(null);
  const [cases, setCases] = useState<FertilityCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCaseForm, setShowNewCaseForm] = useState(false);
  const [showNewCycleForm, setShowNewCycleForm] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<IVFCycle | null>(null);

  // Case Form
  const [malePatientId, setMalePatientId] = useState<number | ''>('');
  const [malePatientInfo, setMalePatientInfo] = useState<{ fullName: string; mrn: string } | null>(null);
  const [maleSearch, setMaleSearch] = useState('');
  const [maleSearchResults, setMaleSearchResults] = useState<any[]>([]);
  const [showMaleResults, setShowMaleResults] = useState(false);
  const [infertilityType, setInfertilityType] = useState('UNEXPLAINED');
  const [diagnosis, setDiagnosis] = useState('');
  const [durationYears, setDurationYears] = useState<number | ''>('');
  const [amhLevel, setAmhLevel] = useState<number | ''>('');
  const [fshLevel, setFshLevel] = useState<number | ''>('');

  // Cycle Form
  const [cycleType, setCycleType] = useState('ICSI');
  const [protocol, setProtocol] = useState('');
  const [startDate, setStartDate] = useState('');

  useEffect(() => {
    if (caseId) loadCase(Number(caseId));
    else if (patientId) loadPatientCases(Number(patientId));
    else loadActiveCases();
  }, [caseId, patientId]);

  const loadCase = async (id: number) => {
    try { setLoading(true); const res = await apiClient.get(`/obgyn/fertility/cases/${id}`); setFertCase(res.data); } 
    catch { toast.error('فشل تحميل ملف العقم'); } 
    finally { setLoading(false); }
  };

  const loadPatientCases = async (pid: number) => {
    try { setLoading(true); const res = await apiClient.get(`/obgyn/fertility/cases/patient/${pid}`); setCases(res.data); } 
    catch { toast.error('فشل تحميل سجلات العقم'); } 
    finally { setLoading(false); }
  };

  const loadActiveCases = async () => {
    try { setLoading(true); const res = await apiClient.get('/obgyn/fertility/cases'); setCases(res.data); } 
    catch { toast.error('فشل تحميل الحالات'); } 
    finally { setLoading(false); }
  };

  const searchMalePatient = async (query: string) => {
    setMaleSearch(query);
    if (query.trim().length < 2) {
      setMaleSearchResults([]);
      setShowMaleResults(false);
      return;
    }
    try {
      const res = await apiClient.get('/patients', { params: { search: query.trim(), limit: 8 } });
      const items = res.data?.items || [];
      setMaleSearchResults(items);
      setShowMaleResults(items.length > 0);
    } catch { /* ignore */ }
  };

  const selectMalePatient = (p: any) => {
    setMalePatientId(p.id);
    setMalePatientInfo({ fullName: p.fullName, mrn: p.mrn });
    setMaleSearch('');
    setMaleSearchResults([]);
    setShowMaleResults(false);
  };

  const clearMalePatient = () => {
    setMalePatientId('');
    setMalePatientInfo(null);
    setMaleSearch('');
  };

  const handleCreateCase = async () => {
    if (!patientId) return toast.error('يرجى تحديد المريضة');
    try {
      const res = await apiClient.post('/obgyn/fertility/cases', {
        femalePatientId: Number(patientId),
        malePatientId: malePatientId || undefined,
        infertilityType, diagnosis, durationYears: durationYears || undefined,
        amhLevel: amhLevel || undefined, fshLevel: fshLevel || undefined,
      });
      toast.success('تم فتح ملف العقم بنجاح');
      setShowNewCaseForm(false);
      navigate(`/obgyn/fertility?caseId=${res.data.id}`);
    } catch (err: any) { toast.error(err.response?.data?.message || 'فشل إنشاء الملف'); }
  };

  const handleCreateCycle = async () => {
    if (!fertCase || !startDate) return toast.error('يرجى تحديد تاريخ البدء');
    try {
      await apiClient.post('/obgyn/fertility/cycles', {
        fertilityCaseId: fertCase.id, cycleType, protocol: protocol || undefined,
        startDate: new Date(startDate).toISOString(),
      });
      toast.success('تم بدء دورة علاجية جديدة');
      setShowNewCycleForm(false);
      loadCase(fertCase.id);
    } catch (err: any) { toast.error(err.response?.data?.message || 'فشل إنشاء الدورة'); }
  };

  const resultColors: Record<string, string> = {
    PENDING: 'text-slate-400 bg-slate-800 border-slate-600',
    POSITIVE: 'text-green-400 bg-green-900/30 border-green-500/40',
    NEGATIVE: 'text-red-400 bg-red-900/20 border-red-500/30',
    BIOCHEMICAL: 'text-amber-400 bg-amber-900/20 border-amber-500/30',
    ECTOPIC: 'text-red-400 bg-red-900/20 border-red-500/30',
    MISCARRIAGE: 'text-red-400 bg-red-900/20 border-red-500/30',
  };

  if (loading) return <div className="p-8 text-center text-slate-400">جاري التحميل...</div>;

  // === Case Detail View ===
  if (fertCase) {
    return (
      <div className="container mx-auto p-6 space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              🧬 ملف العقم والحقن المجهري
            </h1>
            <p className="text-slate-400">
              👩 {fertCase.femalePatient?.fullName || '—'} (MRN: {fertCase.femalePatient?.mrn})
              {fertCase.malePatient && <> — 👨 {fertCase.malePatient.fullName} (MRN: {fertCase.malePatient.mrn})</>}
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate(-1)} className="bg-slate-800 text-slate-200 hover:bg-slate-700">رجوع</Button>
        </div>

        {/* Case Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-transparent border border-violet-500/30 text-center">
            <CardContent className="p-4">
              <div className="text-lg font-bold text-violet-400">{infertilityLabels[fertCase.infertilityType]}</div>
              <div className="text-xs text-slate-400 mt-1">نوع العقم</div>
            </CardContent>
          </Card>
          <Card className="bg-transparent border border-slate-700 text-center">
            <CardContent className="p-4">
              <div className="text-xl font-bold text-white">{fertCase.durationYears || '—'} سنة</div>
              <div className="text-xs text-slate-400 mt-1">مدة عدم الإنجاب</div>
            </CardContent>
          </Card>
          <Card className="bg-transparent border border-sky-500/30 text-center">
            <CardContent className="p-4">
              <div className="text-xl font-bold text-sky-400">{fertCase.cycles?.length || 0}</div>
              <div className="text-xs text-slate-400 mt-1">الدورات العلاجية</div>
            </CardContent>
          </Card>
          <Card className="bg-transparent border border-slate-700 text-center">
            <CardContent className="p-4">
              <div className={`text-lg font-bold ${fertCase.status === 'SUCCESSFUL' ? 'text-green-400' : 'text-white'}`}>
                {statusLabels[fertCase.status]}
              </div>
              <div className="text-xs text-slate-400 mt-1">الحالة</div>
            </CardContent>
          </Card>
        </div>

        {/* Couple Info & Lab Results */}
        <Card className="bg-transparent border border-slate-700 text-slate-100">
          <CardHeader><CardTitle className="text-white">البيانات التشخيصية</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-slate-400">الزوجة:</span> <span className="text-white font-bold">{fertCase.femalePatient?.fullName || '—'}</span></div>
              <div><span className="text-slate-400">الزوج:</span> <span className="text-white font-bold">{fertCase.malePatient?.fullName || 'غير مربوط'}</span></div>
              <div><span className="text-slate-400">AMH:</span> <span className="text-white font-bold">{fertCase.amhLevel || '—'} ng/mL</span></div>
              <div><span className="text-slate-400">FSH:</span> <span className="text-white font-bold">{fertCase.fshLevel || '—'} mIU/mL</span></div>
              <div className="col-span-2"><span className="text-slate-400">التشخيص:</span> <span className="text-white">{fertCase.diagnosis || '—'}</span></div>
              <div><span className="text-slate-400">تحاليل سائل منوي:</span> <span className="text-cyan-400 font-bold">{fertCase.semenAnalyses?.length || 0}</span></div>
              <div><span className="text-slate-400">زيارات ذكورة:</span> <span className="text-cyan-400 font-bold">{fertCase.andrologyVisits?.length || 0}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Cycles */}
        <Card className="bg-transparent border border-slate-700 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">الدورات العلاجية</CardTitle>
            {fertCase.status === 'ACTIVE' && (
              <Button onClick={() => setShowNewCycleForm(!showNewCycleForm)} className="bg-violet-600 hover:bg-violet-500 text-white">
                {showNewCycleForm ? 'إلغاء' : '+ دورة جديدة'}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {showNewCycleForm && (
              <div className="bg-slate-900/60 p-4 rounded-lg border border-violet-500/30 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-400">نوع الدورة</Label>
                    <Select value={cycleType} onValueChange={setCycleType}>
                      <SelectTrigger className="bg-slate-950 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        {Object.entries(cycleTypeLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="focus:bg-slate-800 focus:text-white">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">البروتوكول</Label>
                    <Select value={protocol || 'none'} onValueChange={v => setProtocol(v === 'none' ? '' : v)}>
                      <SelectTrigger className="bg-slate-950 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        <SelectItem value="none" className="focus:bg-slate-800 focus:text-white">—</SelectItem>
                        <SelectItem value="Long" className="focus:bg-slate-800 focus:text-white">Long Protocol</SelectItem>
                        <SelectItem value="Short" className="focus:bg-slate-800 focus:text-white">Short Protocol</SelectItem>
                        <SelectItem value="Antagonist" className="focus:bg-slate-800 focus:text-white">Antagonist</SelectItem>
                        <SelectItem value="Natural" className="focus:bg-slate-800 focus:text-white">Natural</SelectItem>
                        <SelectItem value="Mini-stim" className="focus:bg-slate-800 focus:text-white">Mini-stim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">تاريخ البدء</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                </div>
                <Button onClick={handleCreateCycle} className="bg-violet-600 hover:bg-violet-500 text-white w-full">بدء الدورة</Button>
              </div>
            )}

            {fertCase.cycles && fertCase.cycles.length > 0 ? (
              <div className="space-y-3">
                {fertCase.cycles.map(cycle => (
                  <div 
                    key={cycle.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedCycle?.id === cycle.id ? 'border-violet-500 bg-violet-950/20' : 'border-slate-700 hover:border-violet-500/40'
                    }`}
                    onClick={() => setSelectedCycle(selectedCycle?.id === cycle.id ? null : cycle)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="bg-violet-600 text-white text-xs px-2 py-1 rounded-full font-bold">#{cycle.cycleNumber}</span>
                        <span className="text-white font-bold">{cycleTypeLabels[cycle.cycleType] || cycle.cycleType}</span>
                        {cycle.protocol && <span className="text-slate-400 text-xs">({cycle.protocol})</span>}
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold border ${resultColors[cycle.pregnancyResult]}`}>
                        {resultLabels[cycle.pregnancyResult]}
                      </div>
                    </div>
                    
                    <div className="flex gap-4 mt-2 text-xs text-slate-400">
                      <span>بدأت: {new Date(cycle.startDate).toLocaleDateString('ar-LY')}</span>
                      {cycle.eggsRetrieved != null && <span>بويضات: <b className="text-sky-400">{cycle.eggsRetrieved}</b></span>}
                      {cycle.eggsFertilized != null && <span>مخصبة: <b className="text-green-400">{cycle.eggsFertilized}</b></span>}
                      {cycle.embryosTransferred != null && <span>مرجعة: <b className="text-pink-400">{cycle.embryosTransferred}</b></span>}
                      {cycle.embryosFrozen != null && <span>مجمدة: <b className="text-cyan-400">{cycle.embryosFrozen}</b> ❄️</span>}
                    </div>

                    {/* Expanded Cycle Details */}
                    {selectedCycle?.id === cycle.id && (
                      <div className="mt-4 space-y-3 border-t border-slate-700 pt-3">
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
                          {[
                            { label: 'أيام التحفيز', value: cycle.stimulationDays },
                            { label: 'بويضات ناضجة', value: cycle.eggsMature },
                            { label: 'أجنة يوم 3', value: cycle.embryosDay3 },
                            { label: 'أجنة يوم 5', value: cycle.embryosDay5 },
                            { label: 'سماكة البطانة', value: cycle.endometrialThickness ? `${cycle.endometrialThickness} مم` : null },
                            { label: 'Beta HCG', value: cycle.betaHCGResult },
                          ].map((item, idx) => (
                            <div key={idx} className="bg-slate-900/50 p-2 rounded-lg">
                              <div className="text-white font-bold">{item.value ?? '—'}</div>
                              <div className="text-[10px] text-slate-500">{item.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Embryos */}
                        {cycle.embryos && cycle.embryos.length > 0 && (
                          <div>
                            <h5 className="text-xs text-slate-400 font-bold mb-1">الأجنة:</h5>
                            <div className="flex gap-2 flex-wrap">
                              {cycle.embryos.map((e: any) => (
                                <span key={e.id} className={`px-2 py-1 rounded text-xs border ${
                                  e.status === 'FROZEN' ? 'border-cyan-500/40 bg-cyan-900/20 text-cyan-400' :
                                  e.status === 'TRANSFERRED' ? 'border-pink-500/40 bg-pink-900/20 text-pink-400' :
                                  'border-slate-600 bg-slate-800 text-slate-300'
                                }`}>
                                  #{e.embryoNumber} — D{e.day} {e.grade || ''} ({embryoStatusLabels[e.status] || e.status})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Medications */}
                        {cycle.medications && cycle.medications.length > 0 && (
                          <div>
                            <h5 className="text-xs text-slate-400 font-bold mb-1">الأدوية:</h5>
                            <div className="flex gap-2 flex-wrap">
                              {cycle.medications.map((m: any) => (
                                <span key={m.id} className="px-2 py-1 rounded text-xs border border-amber-500/30 bg-amber-900/10 text-amber-300">
                                  💊 {m.medicationName} — {m.dose} {m.route ? `(${m.route})` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-500 py-6">لا توجد دورات علاجية مسجلة بعد.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // === Cases List View ===
  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">🧬 الحقن المجهري وعلاج العقم</h1>
        <div className="flex gap-2">
          {patientId && (
            <Button onClick={() => setShowNewCaseForm(!showNewCaseForm)} className="bg-violet-600 hover:bg-violet-500 text-white">
              {showNewCaseForm ? 'إلغاء' : '+ فتح ملف جديد'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate(-1)} className="bg-slate-800 text-slate-200 hover:bg-slate-700">رجوع</Button>
        </div>
      </div>

      {showNewCaseForm && (
        <Card className="bg-transparent border border-violet-500/30 text-slate-100">
          <CardHeader><CardTitle className="text-violet-400">فتح ملف عقم جديد</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1 relative md:col-span-2">
                <Label className="text-slate-400">ملف الزوج (اختياري) — ابحث بالاسم أو رقم الملف</Label>
                {malePatientInfo ? (
                  <div className="flex items-center gap-2 bg-slate-900 border border-emerald-500/30 rounded-lg px-3 py-2">
                    <span className="text-emerald-400">👨</span>
                    <span className="text-white font-bold text-sm flex-1">{malePatientInfo.fullName}</span>
                    <span className="text-xs text-slate-400 font-mono">MRN: {malePatientInfo.mrn}</span>
                    <button type="button" onClick={clearMalePatient} className="text-red-400 hover:text-red-300 text-xs bg-slate-800 px-2 py-1 rounded">✕ إزالة</button>
                  </div>
                ) : (
                  <Input
                    value={maleSearch}
                    onChange={e => searchMalePatient(e.target.value)}
                    placeholder="ابحث عن الزوج بالاسم أو رقم الملف أو الهاتف..."
                    className="bg-slate-900 border-slate-700 text-white"
                    autoComplete="off"
                  />
                )}
                {showMaleResults && maleSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-600 rounded-xl shadow-2xl z-40 max-h-48 overflow-y-auto">
                    {maleSearchResults.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectMalePatient(p)}
                        className="w-full text-right px-3 py-2.5 hover:bg-violet-900/20 border-b border-slate-800/50 last:border-0 flex items-center gap-2 transition-colors text-sm"
                      >
                        <span className="text-lg">👨</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-bold truncate">{p.fullName}</div>
                          <div className="text-[10px] text-slate-400">MRN: <span className="text-violet-400 font-mono">{p.mrn}</span>{p.phone && <span className="mr-2">📞 {p.phone}</span>}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400">نوع العقم</Label>
                <Select value={infertilityType} onValueChange={setInfertilityType}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    {Object.entries(infertilityLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="focus:bg-slate-800 focus:text-white">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400">مدة عدم الإنجاب (سنوات)</Label>
                <Input type="number" value={durationYears} onChange={e => setDurationYears(e.target.value ? Number(e.target.value) : '')} className="bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400">AMH (ng/mL)</Label>
                <Input type="number" step="0.01" value={amhLevel} onChange={e => setAmhLevel(e.target.value ? Number(e.target.value) : '')} className="bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400">FSH (mIU/mL)</Label>
                <Input type="number" step="0.01" value={fshLevel} onChange={e => setFshLevel(e.target.value ? Number(e.target.value) : '')} className="bg-slate-900 border-slate-700 text-white" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-slate-400">التشخيص</Label>
              <Input value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="التشخيص التفصيلي..." className="bg-slate-900 border-slate-700 text-white" />
            </div>
            <Button onClick={handleCreateCase} className="bg-violet-600 hover:bg-violet-500 text-white w-full font-bold">فتح الملف</Button>
          </CardContent>
        </Card>
      )}

      {cases.length > 0 ? (
        <div className="space-y-3">
          {cases.map(c => (
            <Card key={c.id} className={`bg-transparent border cursor-pointer hover:border-violet-500/50 transition-colors ${c.status === 'ACTIVE' ? 'border-violet-500/30' : 'border-slate-700'}`} onClick={() => navigate(`/obgyn/fertility?caseId=${c.id}`)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">🧬</span>
                  <div>
                    <div className="text-white font-bold">👩 {c.femalePatient?.fullName || `ملف #${c.id}`} {c.malePatient && <span className="text-slate-400 font-normal">+ 👨 {c.malePatient.fullName}</span>}</div>
                    <div className="text-xs text-slate-400">
                      {infertilityLabels[c.infertilityType]} — {c.durationYears ? `${c.durationYears} سنة` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{c._count?.cycles || 0} دورات</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${c.status === 'ACTIVE' ? 'text-violet-400 bg-violet-900/20 border-violet-500/30' : 'text-slate-500 bg-slate-800 border-slate-700'}`}>
                    {statusLabels[c.status]}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !showNewCaseForm ? (
        <div className="text-center py-12 text-slate-500">
          <p className="text-lg mb-2">{patientId ? 'لا توجد ملفات عقم لهذه المريضة.' : 'لا توجد حالات نشطة.'}</p>
          {patientId && <Button onClick={() => setShowNewCaseForm(true)} className="bg-violet-600 hover:bg-violet-500 text-white">فتح ملف عقم جديد</Button>}
        </div>
      ) : null}
    </div>
  );
}
