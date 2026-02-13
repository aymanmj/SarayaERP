import { useState, useEffect } from 'react';
import { apiClient } from '../../api/apiClient';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObstetricHistoryCard } from './ObstetricHistoryCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { Textarea } from '@/components/ui/textareaarea'; // Check if this exists, fallback to textarea HTML

export default function DeliveryRegistrationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const encounterId = searchParams.get('encounterId');

  const [loading, setLoading] = useState(false);
  const [encounter, setEncounter] = useState<any>(null);
  
  // Form State
  const [deliveryMethod, setDeliveryMethod] = useState('NVD');
  const [babyCount, setBabyCount] = useState(1);
  const [babies, setBabies] = useState<any[]>([{ 
      gender: 'MALE', 
      weight: '', 
      birthTime: new Date().toISOString().slice(0, 16),
      apgarScore1: '',
      apgarScore5: ''
  }]);
  
  // Clinical Details
  const [placentaDelivery, setPlacentaDelivery] = useState('SPONTANEOUS');
  const [episiotomy, setEpisiotomy] = useState(false);
  const [perinealTear, setPerinealTear] = useState('NONE');
  const [bloodLoss, setBloodLoss] = useState<number | ''>('');
  const [notes, setNotes] = useState('');


  useEffect(() => {
    if (encounterId) {
      loadEncounter(encounterId);
    }
  }, [encounterId]);

  const loadEncounter = async (id: string) => {
    try {
      const res = await apiClient.get(`/encounters/${id}`);
      setEncounter(res.data);
    } catch (err) {
      toast.error('فشل تحميل بيانات الزيارة');
    }
  };

  const updateBaby = (index: number, field: string, value: any) => {
    const newBabies = [...babies];
    newBabies[index] = { ...newBabies[index], [field]: value };
    setBabies(newBabies);
  };

  const handleBabyCountChange = (count: number) => {
    setBabyCount(count);
    const newBabies = [...babies];
    if (count > babies.length) {
       for (let i = babies.length; i < count; i++) {
           newBabies.push({
               gender: 'MALE', 
               weight: '', 
               birthTime: new Date().toISOString().slice(0, 16),
               apgarScore1: '',
               apgarScore5: ''
           });
       }
    } else {
        newBabies.splice(count);
    }
    setBabies(newBabies);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encounterId) return toast.error('رقم الزيارة مفقود');

    setLoading(true);
    try {
        const payload = {
            encounterId: Number(encounterId),
            deliveryMethod,
            babyCount,
            placentaDelivery,
            episiotomy,
            perinealTear,
            bloodLoss: bloodLoss ? Number(bloodLoss) : undefined,
            notes,
            babies: babies.map(b => ({
                ...b,
                weight: b.weight ? Number(b.weight) : undefined,
                apgarScore1: b.apgarScore1 ? Number(b.apgarScore1) : undefined,
                apgarScore5: b.apgarScore5 ? Number(b.apgarScore5) : undefined,
                birthTime: new Date(b.birthTime).toISOString(),
            }))
        };

        await apiClient.post('/obgyn/deliveries', payload);
        toast.success('تم تسجيل الولادة بنجاح');
        navigate(`/encounters/${encounterId}`);
    } catch (err: any) {
        toast.error(err.response?.data?.message || 'فشل تسجيل الولادة');
    } finally {
        setLoading(false);
    }
  };

  if (!encounterId) return <div className="p-8 text-center text-red-500">يجب تحديد رقم الزيارة (Encounter ID) للبدء.</div>;

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">تسجيل ولادة جديدة via Saraya</h1>
        <Button 
            variant="secondary" 
            onClick={() => navigate(-1)}
            className="bg-slate-800 text-slate-200 hover:bg-slate-700"
        >
            رجوع
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient Info & History */}
        <div className="space-y-6">
            {encounter && (
                <Card className="bg-transparent border border-slate-700 text-slate-100">
                    <CardHeader>
                        <CardTitle className="text-white">بيانات المريضة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold text-sky-400">{encounter.patient?.fullName}</div>
                        <div className="text-sm text-slate-400">MRN: {encounter.patient?.mrn}</div>
                    </CardContent>
                </Card>
            )}
            
            {encounter && <ObstetricHistoryCard patientId={encounter.patientId} editable={true} />}
        </div>

        {/* Delivery Form */}
        <div className="lg:col-span-2">
            <Card className="bg-transparent border border-slate-700 text-slate-100">
                <CardHeader>
                    <CardTitle className="text-white">تفاصيل الولادة</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        
                        {/* Delivery Method */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-slate-400">طريقة الولادة</Label>
                                <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                        <SelectItem value="NVD" className="focus:bg-slate-800 focus:text-white">ولادة طبيعية (NVD)</SelectItem>
                                        <SelectItem value="ASSISTED_NVD" className="focus:bg-slate-800 focus:text-white">ولادة مساعدة (Assisted)</SelectItem>
                                        <SelectItem value="CS_ELECTIVE" className="focus:bg-slate-800 focus:text-white">قيصرية اختيارية</SelectItem>
                                        <SelectItem value="CS_EMERGENCY" className="focus:bg-slate-800 focus:text-white">قيصرية طارئة</SelectItem>
                                        <SelectItem value="VBAC" className="focus:bg-slate-800 focus:text-white">ولادة طبيعية بعد قيصرية (VBAC)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-slate-400">توصيل المشيمة</Label>
                                <Select value={placentaDelivery} onValueChange={setPlacentaDelivery}>
                                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                        <SelectItem value="SPONTANEOUS" className="focus:bg-slate-800 focus:text-white">تلقائي</SelectItem>
                                        <SelectItem value="MANUAL" className="focus:bg-slate-800 focus:text-white">يدوي</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-slate-400">شق العجان (Episiotomy)</Label>
                                <Select value={episiotomy ? 'YES' : 'NO'} onValueChange={(v) => setEpisiotomy(v === 'YES')}>
                                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                        <SelectItem value="NO" className="focus:bg-slate-800 focus:text-white">لا</SelectItem>
                                        <SelectItem value="YES" className="focus:bg-slate-800 focus:text-white">نعم</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-400">تمزق العجان (Perineal Tear)</Label>
                                <Select value={perinealTear} onValueChange={setPerinealTear}>
                                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                        <SelectItem value="NONE" className="focus:bg-slate-800 focus:text-white">لا يوجد</SelectItem>
                                        <SelectItem value="DEGREE_1" className="focus:bg-slate-800 focus:text-white">درجة 1</SelectItem>
                                        <SelectItem value="DEGREE_2" className="focus:bg-slate-800 focus:text-white">درجة 2</SelectItem>
                                        <SelectItem value="DEGREE_3" className="focus:bg-slate-800 focus:text-white">درجة 3</SelectItem>
                                        <SelectItem value="DEGREE_4" className="focus:bg-slate-800 focus:text-white">درجة 4</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label className="text-slate-400">فقدان الدم (مل)</Label>
                                <Input 
                                    type="number" 
                                    value={bloodLoss} 
                                    onChange={e => setBloodLoss(e.target.value === '' ? '' : Number(e.target.value))} 
                                    placeholder="مثلاً 500" 
                                    className="bg-slate-900 border-slate-700 text-white"
                                />
                            </div>
                        </div>


                        {/* Babies Section */}
                        <div className="border-t border-slate-800 pt-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg text-white">بيانات المواليد</h3>
                                <div className="flex items-center gap-2">
                                    <Label className="text-slate-400">عدد المواليد: </Label>
                                    <Input 
                                        type="number" 
                                        min={1} 
                                        max={5} 
                                        value={babyCount} 
                                        onChange={e => handleBabyCountChange(Number(e.target.value))}
                                        className="w-20 bg-slate-900 border-slate-700 text-white"
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                {babies.map((baby, index) => (
                                    <div key={index} className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                                        <h4 className="font-semibold mb-2 text-pink-400">مولود #{index + 1}</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-slate-400">الجنس</Label>
                                                <Select value={baby.gender} onValueChange={(v) => updateBaby(index, 'gender', v)}>
                                                    <SelectTrigger className="bg-slate-950 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                                        <SelectItem value="MALE" className="focus:bg-slate-800 focus:text-white">ذكر</SelectItem>
                                                        <SelectItem value="FEMALE" className="focus:bg-slate-800 focus:text-white">أنثى</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-slate-400">الوزن (كجم)</Label>
                                                <Input 
                                                    type="number" 
                                                    step="0.01" 
                                                    value={baby.weight} 
                                                    onChange={(e) => updateBaby(index, 'weight', e.target.value)}
                                                    className="bg-slate-950 border-slate-700 text-white"
                                                />
                                            </div>
                                             <div className="space-y-1 col-span-2 md:col-span-1">
                                                <Label className="text-slate-400">وقت الولادة</Label>
                                                <Input 
                                                    type="datetime-local" 
                                                    value={baby.birthTime} 
                                                    onChange={(e) => updateBaby(index, 'birthTime', e.target.value)}
                                                    className="bg-slate-950 border-slate-700 text-white"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-slate-400">Apgar 1m</Label>
                                                <Input 
                                                    type="number" 
                                                    max={10}
                                                    value={baby.apgarScore1} 
                                                    onChange={(e) => updateBaby(index, 'apgarScore1', e.target.value)}
                                                    className="bg-slate-950 border-slate-700 text-white"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-slate-400">Apgar 5m</Label>
                                                <Input 
                                                    type="number" 
                                                    max={10}
                                                    value={baby.apgarScore5} 
                                                    onChange={(e) => updateBaby(index, 'apgarScore5', e.target.value)}
                                                    className="bg-slate-950 border-slate-700 text-white"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-400">ملاحظات إضافية</Label>
                            <Input 
                                value={notes} 
                                onChange={e => setNotes(e.target.value)} 
                                placeholder="أي مضاعفات أو ملاحظات أخرى..." 
                                className="bg-slate-900 border-slate-700 text-white"
                            />
                        </div>

                        <div className="flex justify-end gap-4 pt-4 border-t border-slate-800">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                onClick={() => navigate(-1)}
                                className="text-slate-400 hover:text-white hover:bg-slate-800"
                            >
                                إلغاء
                            </Button>
                            <Button type="submit" disabled={loading} className="w-40 bg-pink-600 hover:bg-pink-500 text-white font-bold">
                                {loading ? 'جاري الحفظ...' : 'حفظ وتسجيل الولادة'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
