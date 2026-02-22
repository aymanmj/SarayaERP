import { useState, useEffect } from 'react';
import { apiClient } from '../../api/apiClient';
import { toast } from 'sonner';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AntenatalCare {
  id: number;
  patientId: number;
  lmpDate: string;
  eddDate: string;
  gravida: number;
  para: number;
  bloodGroup?: string;
  rhFactor?: string;
  riskLevel: string;
  riskFactors?: string;
  status: string;
  currentGestationalWeek?: number;
  daysToEDD?: number;
  patient?: { fullName: string; mrn: string; dateOfBirth?: string };
  doctor?: { fullName: string };
  visits: AntenatalVisit[];
}

interface AntenatalVisit {
  id: number;
  visitDate: string;
  gestationalWeek?: number;
  weight?: number;
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  fundalHeight?: number;
  fetalHeartRate?: number;
  fetalMovement?: boolean;
  presentation?: string;
  edema: boolean;
  urineProtein?: string;
  urineGlucose?: string;
  hemoglobin?: number;
  complaints?: string;
  notes?: string;
  nextVisitDate?: string;
}

export default function AntenatalCarePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('patientId');
  const careId = searchParams.get('careId');

  const [care, setCare] = useState<AntenatalCare | null>(null);
  const [cares, setCares] = useState<AntenatalCare[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCareForm, setShowNewCareForm] = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);

  // New Care Form
  const [lmpDate, setLmpDate] = useState('');
  const [gravida, setGravida] = useState(1);
  const [para, setPara] = useState(0);
  const [bloodGroup, setBloodGroup] = useState('');
  const [rhFactor, setRhFactor] = useState('');
  const [riskLevel, setRiskLevel] = useState('LOW');
  const [riskFactors, setRiskFactors] = useState('');

  // Visit Form
  const [visitWeight, setVisitWeight] = useState<number | ''>('');
  const [bpSys, setBpSys] = useState<number | ''>('');
  const [bpDia, setBpDia] = useState<number | ''>('');
  const [fundalHeight, setFundalHeight] = useState<number | ''>('');
  const [fhr, setFhr] = useState<number | ''>('');
  const [fetalMovement, setFetalMovement] = useState(true);
  const [presentation, setPresentation] = useState('');
  const [edema, setEdema] = useState(false);
  const [urineProtein, setUrineProtein] = useState('Nil');
  const [urineGlucose, setUrineGlucose] = useState('Nil');
  const [hemoglobin, setHemoglobin] = useState<number | ''>('');
  const [complaints, setComplaints] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  const [nextVisitDate, setNextVisitDate] = useState('');

  useEffect(() => {
    if (careId) {
      loadCare(Number(careId));
    } else if (patientId) {
      loadPatientCares(Number(patientId));
    }
  }, [careId, patientId]);

  const loadCare = async (id: number) => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/obgyn/anc/${id}`);
      setCare(res.data);
    } catch {
      toast.error('فشل تحميل سجل الحمل');
    } finally {
      setLoading(false);
    }
  };

  const loadPatientCares = async (pid: number) => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/obgyn/anc/patient/${pid}`);
      setCares(res.data);
    } catch {
      toast.error('فشل تحميل سجلات الحمل');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCare = async () => {
    if (!patientId || !lmpDate) return toast.error('يرجى تحديد تاريخ آخر دورة');
    try {
      const res = await apiClient.post('/obgyn/anc', {
        patientId: Number(patientId),
        lmpDate: new Date(lmpDate).toISOString(),
        gravida, para, bloodGroup, rhFactor, riskLevel, riskFactors,
      });
      toast.success('تم تسجيل الحمل بنجاح');
      setShowNewCareForm(false);
      navigate(`/obgyn/anc?careId=${res.data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل تسجيل الحمل');
    }
  };

  const handleAddVisit = async () => {
    if (!care) return;
    try {
      await apiClient.post('/obgyn/anc/visits', {
        antenatalCareId: care.id,
        weight: visitWeight || undefined,
        bloodPressureSys: bpSys || undefined,
        bloodPressureDia: bpDia || undefined,
        fundalHeight: fundalHeight || undefined,
        fetalHeartRate: fhr || undefined,
        fetalMovement,
        presentation: presentation || undefined,
        edema,
        urineProtein, urineGlucose,
        hemoglobin: hemoglobin || undefined,
        complaints: complaints || undefined,
        notes: visitNotes || undefined,
        nextVisitDate: nextVisitDate ? new Date(nextVisitDate).toISOString() : undefined,
      });
      toast.success('تم إضافة زيارة المتابعة');
      setShowVisitForm(false);
      loadCare(care.id);
      // Reset form
      setVisitWeight(''); setBpSys(''); setBpDia(''); setFundalHeight('');
      setFhr(''); setFetalMovement(true); setPresentation(''); setEdema(false);
      setUrineProtein('Nil'); setUrineGlucose('Nil'); setHemoglobin('');
      setComplaints(''); setVisitNotes(''); setNextVisitDate('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إضافة الزيارة');
    }
  };

  const riskColors: Record<string, string> = {
    LOW: 'text-green-400 bg-green-500/10 border-green-500/30',
    MEDIUM: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    HIGH: 'text-red-400 bg-red-500/10 border-red-500/30',
  };

  const statusLabels: Record<string, string> = {
    ACTIVE: 'حمل نشط',
    DELIVERED: 'تمت الولادة',
    MISCARRIAGE: 'إجهاض',
    ECTOPIC: 'حمل خارج الرحم',
    CANCELLED: 'ملغي',
  };

  if (loading) return <div className="p-8 text-center text-slate-400">جاري التحميل...</div>;

  // === Single Care View ===
  if (care) {
    return (
      <div className="container mx-auto p-6 space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">متابعة الحمل</h1>
            <p className="text-slate-400">{care.patient?.fullName} — MRN: {care.patient?.mrn}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate(-1)} className="bg-slate-800 text-slate-200 hover:bg-slate-700">رجوع</Button>
        </div>

        {/* Pregnancy Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-transparent border border-pink-500/30 text-center">
            <CardContent className="p-4">
              <div className="text-3xl font-bold text-pink-400">{care.currentGestationalWeek}</div>
              <div className="text-xs text-slate-400 mt-1">أسبوع الحمل</div>
            </CardContent>
          </Card>
          <Card className="bg-transparent border border-sky-500/30 text-center">
            <CardContent className="p-4">
              <div className="text-xl font-bold text-sky-400">{care.daysToEDD && care.daysToEDD > 0 ? care.daysToEDD : 0}</div>
              <div className="text-xs text-slate-400 mt-1">يوم للولادة</div>
            </CardContent>
          </Card>
          <Card className="bg-transparent border border-slate-700 text-center">
            <CardContent className="p-4">
              <div className="text-xl font-bold text-white">{new Date(care.eddDate).toLocaleDateString('ar-LY')}</div>
              <div className="text-xs text-slate-400 mt-1">تاريخ الولادة المتوقع</div>
            </CardContent>
          </Card>
          <Card className="bg-transparent border border-slate-700 text-center">
            <CardContent className="p-4">
              <div className="text-xl font-bold text-white">G{care.gravida} P{care.para}</div>
              <div className="text-xs text-slate-400 mt-1">التاريخ الولادي</div>
            </CardContent>
          </Card>
          <Card className={`bg-transparent border text-center ${riskColors[care.riskLevel]}`}>
            <CardContent className="p-4">
              <div className="text-xl font-bold">{care.riskLevel === 'LOW' ? 'منخفض' : care.riskLevel === 'MEDIUM' ? 'متوسط' : 'عالي'}</div>
              <div className="text-xs text-slate-400 mt-1">مستوى الخطورة</div>
            </CardContent>
          </Card>
        </div>

        {/* Visits Section */}
        <Card className="bg-transparent border border-slate-700 text-slate-100">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">زيارات المتابعة ({care.visits?.length || 0})</CardTitle>
            {care.status === 'ACTIVE' && (
              <Button onClick={() => setShowVisitForm(!showVisitForm)} className="bg-pink-600 hover:bg-pink-500 text-white">
                {showVisitForm ? 'إلغاء' : '+ زيارة جديدة'}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* New Visit Form */}
            {showVisitForm && (
              <div className="bg-slate-900/60 p-4 rounded-lg border border-pink-500/30 space-y-4">
                <h4 className="font-bold text-pink-400">بيانات الزيارة</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-400">وزن الأم (كجم)</Label>
                    <Input type="number" step="0.1" value={visitWeight} onChange={e => setVisitWeight(e.target.value ? Number(e.target.value) : '')} className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">الضغط الانقباضي</Label>
                    <Input type="number" value={bpSys} onChange={e => setBpSys(e.target.value ? Number(e.target.value) : '')} className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">الضغط الانبساطي</Label>
                    <Input type="number" value={bpDia} onChange={e => setBpDia(e.target.value ? Number(e.target.value) : '')} className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">ارتفاع الرحم (سم)</Label>
                    <Input type="number" step="0.5" value={fundalHeight} onChange={e => setFundalHeight(e.target.value ? Number(e.target.value) : '')} className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">نبض الجنين</Label>
                    <Input type="number" value={fhr} onChange={e => setFhr(e.target.value ? Number(e.target.value) : '')} className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">حركة الجنين</Label>
                    <Select value={fetalMovement ? 'YES' : 'NO'} onValueChange={v => setFetalMovement(v === 'YES')}>
                      <SelectTrigger className="bg-slate-950 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        <SelectItem value="YES" className="focus:bg-slate-800 focus:text-white">نعم</SelectItem>
                        <SelectItem value="NO" className="focus:bg-slate-800 focus:text-white">لا</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">وضع الجنين</Label>
                    <Select value={presentation || 'none'} onValueChange={v => setPresentation(v === 'none' ? '' : v)}>
                      <SelectTrigger className="bg-slate-950 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        <SelectItem value="none" className="focus:bg-slate-800 focus:text-white">—</SelectItem>
                        <SelectItem value="Cephalic" className="focus:bg-slate-800 focus:text-white">رأسي (Cephalic)</SelectItem>
                        <SelectItem value="Breech" className="focus:bg-slate-800 focus:text-white">مقعدي (Breech)</SelectItem>
                        <SelectItem value="Transverse" className="focus:bg-slate-800 focus:text-white">عرضي (Transverse)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">هيموجلوبين (g/dL)</Label>
                    <Input type="number" step="0.1" value={hemoglobin} onChange={e => setHemoglobin(e.target.value ? Number(e.target.value) : '')} className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">بروتين البول</Label>
                    <Select value={urineProtein} onValueChange={setUrineProtein}>
                      <SelectTrigger className="bg-slate-950 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        {['Nil', 'Trace', '+', '++', '+++'].map(v => <SelectItem key={v} value={v} className="focus:bg-slate-800 focus:text-white">{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">نسبة السكر بالبول</Label>
                    <Select value={urineGlucose} onValueChange={setUrineGlucose}>
                      <SelectTrigger className="bg-slate-950 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        {['Nil', 'Trace', '+', '++', '+++'].map(v => <SelectItem key={v} value={v} className="focus:bg-slate-800 focus:text-white">{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">وذمة (Edema)</Label>
                    <Select value={edema ? 'YES' : 'NO'} onValueChange={v => setEdema(v === 'YES')}>
                      <SelectTrigger className="bg-slate-950 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white">
                        <SelectItem value="NO" className="focus:bg-slate-800 focus:text-white">لا</SelectItem>
                        <SelectItem value="YES" className="focus:bg-slate-800 focus:text-white">نعم</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">الزيارة القادمة</Label>
                    <Input type="date" value={nextVisitDate} onChange={e => setNextVisitDate(e.target.value)} className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-400">شكاوى المريضة</Label>
                    <Input value={complaints} onChange={e => setComplaints(e.target.value)} placeholder="أي شكاوى..." className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400">ملاحظات الطبيب</Label>
                    <Input value={visitNotes} onChange={e => setVisitNotes(e.target.value)} placeholder="ملاحظات..." className="bg-slate-950 border-slate-700 text-white" />
                  </div>
                </div>
                <Button onClick={handleAddVisit} className="bg-pink-600 hover:bg-pink-500 text-white w-full">حفظ الزيارة</Button>
              </div>
            )}

            {/* Visits Table */}
            {care.visits && care.visits.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="py-2 px-3 text-right">الأسبوع</th>
                      <th className="py-2 px-3 text-right">التاريخ</th>
                      <th className="py-2 px-3 text-right">الوزن</th>
                      <th className="py-2 px-3 text-right">الضغط</th>
                      <th className="py-2 px-3 text-right">ارتفاع الرحم</th>
                      <th className="py-2 px-3 text-right">نبض الجنين</th>
                      <th className="py-2 px-3 text-right">الحركة</th>
                      <th className="py-2 px-3 text-right">Hb</th>
                      <th className="py-2 px-3 text-right">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {care.visits.map(v => (
                      <tr key={v.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-bold text-pink-400">W{v.gestationalWeek}</td>
                        <td className="py-2 px-3 text-slate-300">{new Date(v.visitDate).toLocaleDateString('ar-LY')}</td>
                        <td className="py-2 px-3 text-white">{v.weight ? `${v.weight} كجم` : '—'}</td>
                        <td className="py-2 px-3 text-white">{v.bloodPressureSys && v.bloodPressureDia ? `${v.bloodPressureSys}/${v.bloodPressureDia}` : '—'}</td>
                        <td className="py-2 px-3 text-white">{v.fundalHeight ? `${v.fundalHeight} سم` : '—'}</td>
                        <td className="py-2 px-3 text-white">{v.fetalHeartRate ? `${v.fetalHeartRate} bpm` : '—'}</td>
                        <td className="py-2 px-3">{v.fetalMovement === true ? <span className="text-green-400">✓</span> : v.fetalMovement === false ? <span className="text-red-400">✗</span> : '—'}</td>
                        <td className="py-2 px-3 text-white">{v.hemoglobin || '—'}</td>
                        <td className="py-2 px-3 text-slate-400 max-w-[200px] truncate">{v.notes || v.complaints || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-slate-500 py-8">لا توجد زيارات متابعة مسجلة بعد.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // === Patient Cares List ===
  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">سجلات الحمل</h1>
        <div className="flex gap-2">
          {patientId && (
            <Button onClick={() => setShowNewCareForm(!showNewCareForm)} className="bg-pink-600 hover:bg-pink-500 text-white">
              {showNewCareForm ? 'إلغاء' : '+ تسجيل حمل جديد'}
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate(-1)} className="bg-slate-800 text-slate-200 hover:bg-slate-700">رجوع</Button>
        </div>
      </div>

      {/* New Care Form */}
      {showNewCareForm && (
        <Card className="bg-transparent border border-pink-500/30 text-slate-100">
          <CardHeader><CardTitle className="text-pink-400">تسجيل حمل جديد</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-slate-400">تاريخ آخر دورة (LMP) *</Label>
                <Input type="date" value={lmpDate} onChange={e => setLmpDate(e.target.value)} className="bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400">عدد مرات الحمل (Gravida)</Label>
                <Input type="number" min={1} value={gravida} onChange={e => setGravida(Number(e.target.value))} className="bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400">الولادات السابقة (Para)</Label>
                <Input type="number" min={0} value={para} onChange={e => setPara(Number(e.target.value))} className="bg-slate-900 border-slate-700 text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400">فصيلة الدم</Label>
                <Select value={bloodGroup || 'none'} onValueChange={v => setBloodGroup(v === 'none' ? '' : v)}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="none" className="focus:bg-slate-800 focus:text-white">—</SelectItem>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => (
                      <SelectItem key={g} value={g} className="focus:bg-slate-800 focus:text-white">{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400">عامل Rh</Label>
                <Select value={rhFactor || 'none'} onValueChange={v => setRhFactor(v === 'none' ? '' : v)}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="none" className="focus:bg-slate-800 focus:text-white">—</SelectItem>
                    <SelectItem value="Positive" className="focus:bg-slate-800 focus:text-white">إيجابي</SelectItem>
                    <SelectItem value="Negative" className="focus:bg-slate-800 focus:text-white">سلبي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400">مستوى الخطورة</Label>
                <Select value={riskLevel} onValueChange={setRiskLevel}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-white">
                    <SelectItem value="LOW" className="focus:bg-slate-800 focus:text-white">منخفض</SelectItem>
                    <SelectItem value="MEDIUM" className="focus:bg-slate-800 focus:text-white">متوسط</SelectItem>
                    <SelectItem value="HIGH" className="focus:bg-slate-800 focus:text-white">عالي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-slate-400">عوامل الخطورة</Label>
                <Input value={riskFactors} onChange={e => setRiskFactors(e.target.value)} placeholder="سكري حمل، ضغط مرتفع..." className="bg-slate-900 border-slate-700 text-white" />
              </div>
            </div>
            <Button onClick={handleCreateCare} className="bg-pink-600 hover:bg-pink-500 text-white w-full font-bold">تسجيل الحمل</Button>
          </CardContent>
        </Card>
      )}

      {/* Cares List */}
      {cares.length > 0 ? (
        <div className="space-y-3">
          {cares.map(c => (
            <Card key={c.id} className={`bg-transparent border cursor-pointer hover:border-pink-500/50 transition-colors ${c.status === 'ACTIVE' ? 'border-pink-500/30' : 'border-slate-700'}`} onClick={() => navigate(`/obgyn/anc?careId=${c.id}`)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`px-3 py-1 rounded-full text-xs font-bold border ${c.status === 'ACTIVE' ? riskColors[c.riskLevel] : 'text-slate-500 bg-slate-800 border-slate-700'}`}>
                    {statusLabels[c.status] || c.status}
                  </div>
                  <div>
                    <div className="text-white font-bold">G{c.gravida} P{c.para}</div>
                    <div className="text-xs text-slate-400">LMP: {new Date(c.lmpDate).toLocaleDateString('ar-LY')} — EDD: {new Date(c.eddDate).toLocaleDateString('ar-LY')}</div>
                  </div>
                </div>
                <div className="text-sm text-slate-400">{(c as any)._count?.visits || 0} زيارات</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !showNewCareForm ? (
        <div className="text-center py-12 text-slate-500">
          <p className="text-lg mb-2">لا توجد سجلات حمل لهذه المريضة.</p>
          {patientId && <Button onClick={() => setShowNewCareForm(true)} className="bg-pink-600 hover:bg-pink-500 text-white">تسجيل حمل جديد</Button>}
        </div>
      ) : null}
    </div>
  );
}
