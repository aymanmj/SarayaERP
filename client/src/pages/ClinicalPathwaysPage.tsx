import { useEffect, useState } from 'react';
import { apiClient } from '../api/apiClient';
import { toast } from 'sonner';

type ClinicalContentStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'RETIRED';

type PathwayStep = {
  id: number;
  dayNumber: number;
  phase?: string;
  title: string;
  titleAr?: string;
  description?: string;
  expectedOutcome?: string;
  milestones?: string;
  orderSet?: {
    id: number;
    name: string;
    nameAr?: string;
    version?: number;
    status?: ClinicalContentStatus;
    _count?: { items: number };
  };
};

type ClinicalPathway = {
  id: number;
  contentKey: string;
  name: string;
  nameAr?: string;
  description?: string;
  targetDiagnosis?: string;
  expectedLOS?: number;
  version: number;
  status: ClinicalContentStatus;
  isActive: boolean;
  changeSummary?: string;
  reviewNotes?: string;
  steps: PathwayStep[];
  createdBy: { fullName: string };
  submittedBy?: { fullName: string };
  approvedBy?: { fullName: string };
  publishedBy?: { fullName: string };
  _count?: { steps: number; enrollments: number };
};

type Enrollment = {
  id: number;
  pathwayId: number;
  encounterId: number;
  patientId: number;
  status: string;
  currentDay: number;
  enrolledAt: string;
  completedAt?: string;
  notes?: string;
  pathway: ClinicalPathway;
  enrolledBy: { fullName: string };
  variances: any[];
};

const PHASE_COLORS: Record<string, string> = {
  Assessment: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Treatment: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  Monitoring: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  Discharge: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
};

const STATUS_META: Record<ClinicalContentStatus, { label: string; className: string }> = {
  DRAFT: { label: 'مسودة', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  IN_REVIEW: { label: 'قيد المراجعة', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  APPROVED: { label: 'معتمد', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  PUBLISHED: { label: 'منشور', className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  RETIRED: { label: 'متقاعد', className: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
};

export default function ClinicalPathwaysPage() {
  const [pathways, setPathways] = useState<ClinicalPathway[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pathways' | 'enrollments'>('pathways');
  const [selectedPathway, setSelectedPathway] = useState<ClinicalPathway | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [enrollmentDetail, setEnrollmentDetail] = useState<Enrollment | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [workflowBusyId, setWorkflowBusyId] = useState<number | null>(null);

  const [bName, setBName] = useState('');
  const [bNameAr, setBNameAr] = useState('');
  const [bDescription, setBDescription] = useState('');
  const [bDiagnosis, setBDiagnosis] = useState('');
  const [bLOS, setBLOS] = useState('');
  const [bChangeSummary, setBChangeSummary] = useState('');
  const [bSteps, setBSteps] = useState<any[]>([]);

  const [enrolling, setEnrolling] = useState(false);
  const [enrollNotes, setEnrollNotes] = useState('');
  const [encounterSearchTerm, setEncounterSearchTerm] = useState('');
  const [activeEncounters, setActiveEncounters] = useState<any[]>([]);
  const [selectedEncounter, setSelectedEncounter] = useState<any | null>(null);

  const [orderSets, setOrderSets] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [searchFilter, statusFilter]);

  const searchEncounters = async (q: string) => {
    if (q.length < 2) {
      setActiveEncounters([]);
      return;
    }
    try {
      const res = await apiClient.get('/encounters', { params: { search: q, status: 'OPEN', limit: 10 } });
      setActiveEncounters(res.data?.items || res.data || []);
    } catch {
      setActiveEncounters([]);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { scope: 'all' };
      if (searchFilter) params.search = searchFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await apiClient.get('/clinical-pathways', { params });
      setPathways(res.data);
    } catch {
      toast.error('فشل تحميل المسارات العلاجية');
    } finally {
      setLoading(false);
    }
  };

  const loadOrderSets = async () => {
    try {
      const res = await apiClient.get('/order-sets');
      setOrderSets(res.data);
    } catch {
      setOrderSets([]);
    }
  };

  const resetBuilder = () => {
    setBName('');
    setBNameAr('');
    setBDescription('');
    setBDiagnosis('');
    setBLOS('');
    setBChangeSummary('');
    setBSteps([]);
  };

  const openBuilder = (pathway?: ClinicalPathway) => {
    if (pathway) {
      setSelectedPathway(pathway);
      setBName(pathway.name);
      setBNameAr(pathway.nameAr || '');
      setBDescription(pathway.description || '');
      setBDiagnosis(pathway.targetDiagnosis || '');
      setBLOS(pathway.expectedLOS?.toString() || '');
      setBChangeSummary(pathway.changeSummary || '');
      setBSteps(
        pathway.steps.map((step) => ({
          dayNumber: step.dayNumber,
          phase: step.phase || '',
          title: step.title,
          titleAr: step.titleAr || '',
          description: step.description || '',
          orderSetId: step.orderSet?.id || '',
          expectedOutcome: step.expectedOutcome || '',
          milestones: step.milestones || '',
        })),
      );
    } else {
      setSelectedPathway(null);
      resetBuilder();
    }
    setShowBuilder(true);
    loadOrderSets();
  };

  const addStep = () => {
    const nextDay = bSteps.length > 0 ? Math.max(...bSteps.map((step) => step.dayNumber)) + 1 : 0;
    setBSteps([
      ...bSteps,
      {
        dayNumber: nextDay,
        phase: '',
        title: '',
        titleAr: '',
        description: '',
        orderSetId: '',
        expectedOutcome: '',
        milestones: '',
      },
    ]);
  };

  const updateStep = (idx: number, field: string, value: any) => {
    const updated = [...bSteps];
    updated[idx][field] = value;
    setBSteps(updated);
  };

  const removeStep = (idx: number) => {
    setBSteps(bSteps.filter((_, i) => i !== idx));
  };

  const savePathway = async () => {
    if (!bName.trim()) {
      toast.error('يرجى إدخال اسم المسار العلاجي');
      return;
    }
    if (bSteps.length === 0) {
      toast.error('يرجى إضافة خطوة واحدة على الأقل');
      return;
    }

    const payload = {
      name: bName,
      nameAr: bNameAr || undefined,
      description: bDescription || undefined,
      targetDiagnosis: bDiagnosis || undefined,
      expectedLOS: bLOS ? +bLOS : undefined,
      changeSummary: bChangeSummary || undefined,
      steps: bSteps.map((step, idx) => ({
        ...step,
        orderSetId: step.orderSetId ? +step.orderSetId : undefined,
        sortOrder: idx,
      })),
    };

    try {
      let response;
      if (selectedPathway) {
        response = await apiClient.put(`/clinical-pathways/${selectedPathway.id}`, payload);
        if (response.data?.id !== selectedPathway.id) {
          toast.success(`تم إنشاء مسودة جديدة v${response.data?.version ?? '?'} بدل تعديل النسخة الحالية مباشرة`);
        } else {
          toast.success('تم تحديث مسودة المسار بنجاح');
        }
      } else {
        response = await apiClient.post('/clinical-pathways', payload);
        toast.success('تم إنشاء مسودة المسار العلاجي بنجاح');
      }
      setShowBuilder(false);
      resetBuilder();
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'فشل حفظ المسار العلاجي');
    }
  };

  const enrollPatient = async () => {
    if (!selectedPathway || !selectedEncounter?.id) return;
    setEnrolling(true);
    try {
      await apiClient.post(`/clinical-pathways/${selectedPathway.id}/enroll`, {
        encounterId: selectedEncounter.id,
        notes: enrollNotes || undefined,
      });
      toast.success(`تم تسجيل المريض في "${selectedPathway.nameAr || selectedPathway.name}" بنجاح`);
      setShowEnrollModal(false);
      setSelectedEncounter(null);
      setEncounterSearchTerm('');
      setEnrollNotes('');
      setActiveEncounters([]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'فشل التسجيل');
    } finally {
      setEnrolling(false);
    }
  };

  const deletePathway = async (id: number) => {
    if (!confirm('هل تريد تعطيل هذا المسار العلاجي؟')) return;
    try {
      await apiClient.delete(`/clinical-pathways/${id}`);
      toast.success('تم تعطيل المسار');
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'فشل تعطيل المسار');
    }
  };

  const runWorkflowAction = async (
    pathway: ClinicalPathway,
    endpoint: 'submit-review' | 'approve' | 'reject' | 'publish' | 'retire',
    successMessage: string,
  ) => {
    const notes = window.prompt('أضف ملاحظة مختصرة لهذا الإجراء (اختياري):', '') || undefined;
    setWorkflowBusyId(pathway.id);
    try {
      await apiClient.post(`/clinical-pathways/${pathway.id}/${endpoint}`, { notes });
      toast.success(successMessage);
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'فشل تنفيذ الإجراء');
    } finally {
      setWorkflowBusyId(null);
    }
  };

  const viewPathwayDetail = (pathway: ClinicalPathway) => {
    setSelectedPathway(pathway);
    setShowDetail(true);
  };

  const groupStepsByDay = (steps: PathwayStep[]) => {
    const grouped: Record<number, PathwayStep[]> = {};
    for (const step of steps) {
      if (!grouped[step.dayNumber]) grouped[step.dayNumber] = [];
      grouped[step.dayNumber].push(step);
    }
    return Object.entries(grouped).sort(([a], [b]) => +a - +b);
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">المسارات العلاجية</h1>
          <p className="text-sm text-slate-400">
            إدارة المسارات السريرية عبر المسودة والمراجعة والاعتماد والنشر
          </p>
        </div>
        <button
          onClick={() => openBuilder()}
          className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 transition-all"
        >
          + مسار علاجي جديد
        </button>
      </div>

      <div className="flex gap-1 p-1 bg-slate-900/50 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('pathways')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'pathways' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          المسارات العلاجية
        </button>
        <button
          onClick={() => setActiveTab('enrollments')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'enrollments' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          تسجيلات المرضى
        </button>
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <input
          type="text"
          placeholder="بحث بالاسم أو التشخيص..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm w-64 focus:border-sky-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_META).map(([status, meta]) => (
            <option key={status} value={status}>{meta.label}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      )}

      {!loading && activeTab === 'pathways' && (
        <div className="space-y-5">
          {pathways.map((pathway) => (
            <div key={pathway.id} className="bg-slate-900/60 rounded-2xl border border-slate-700/50 p-5 hover:border-sky-500/40 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-sky-300">{pathway.nameAr || pathway.name}</h3>
                  {pathway.nameAr && <p className="text-xs text-slate-500">{pathway.name}</p>}
                  {pathway.description && <p className="text-sm text-slate-400 mt-1">{pathway.description}</p>}
                  {pathway.changeSummary && <p className="text-[11px] text-slate-500 mt-2">{pathway.changeSummary}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] border ${STATUS_META[pathway.status].className}`}>
                    {STATUS_META[pathway.status].label}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-400">v{pathway.version}</span>
                  {pathway.targetDiagnosis && (
                    <span className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-full text-xs border border-rose-500/30">
                      🏥 {pathway.targetDiagnosis}
                    </span>
                  )}
                  {pathway.expectedLOS && (
                    <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs border border-amber-500/30">
                      🗓 {pathway.expectedLOS} يوم
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                {groupStepsByDay(pathway.steps).map(([day, steps]) => (
                  <div key={day} className="flex-shrink-0 bg-slate-800/80 rounded-xl border border-slate-700/50 p-3 min-w-[180px]">
                    <div className="text-xs font-bold text-sky-400 mb-2">اليوم {day}</div>
                    {steps.map((step, idx) => (
                      <div key={idx} className="mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {step.phase && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] border ${PHASE_COLORS[step.phase] || 'bg-slate-600/30 text-slate-300 border-slate-500/30'}`}>
                              {step.phase}
                            </span>
                          )}
                          <span className="text-xs text-slate-300">{step.titleAr || step.title}</span>
                        </div>
                        {step.orderSet && (
                          <span className="text-[10px] text-emerald-400 mr-4">
                            📦 {step.orderSet.nameAr || step.orderSet.name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                <span className="text-[11px] text-slate-500">
                  {pathway.steps.length} خطوة • {pathway._count?.enrollments || 0} تسجيل • {pathway.createdBy.fullName}
                </span>
                <div className="flex gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => viewPathwayDetail(pathway)}
                    className="px-3 py-1 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs transition-colors"
                  >
                    عرض التفاصيل
                  </button>
                  {pathway.status === 'PUBLISHED' && (
                    <button
                      onClick={() => {
                        setSelectedPathway(pathway);
                        setShowEnrollModal(true);
                      }}
                      className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-bold transition-colors"
                    >
                      📋 تسجيل مريض
                    </button>
                  )}
                  <button
                    onClick={() => openBuilder(pathway)}
                    className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded-lg text-xs transition-colors"
                  >
                    {pathway.status === 'DRAFT' ? 'تعديل' : 'إصدار جديد'}
                  </button>
                  {pathway.status === 'DRAFT' && (
                    <button
                      disabled={workflowBusyId === pathway.id}
                      onClick={() => runWorkflowAction(pathway, 'submit-review', 'تم إرسال المسودة للمراجعة')}
                      className="px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                    >
                      للمراجعة
                    </button>
                  )}
                  {pathway.status === 'IN_REVIEW' && (
                    <>
                      <button
                        disabled={workflowBusyId === pathway.id}
                        onClick={() => runWorkflowAction(pathway, 'approve', 'تم اعتماد الإصدار')}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                      >
                        اعتماد
                      </button>
                      <button
                        disabled={workflowBusyId === pathway.id}
                        onClick={() => runWorkflowAction(pathway, 'reject', 'تمت إعادة الإصدار إلى مسودة')}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                      >
                        إرجاع
                      </button>
                    </>
                  )}
                  {pathway.status === 'APPROVED' && (
                    <>
                      <button
                        disabled={workflowBusyId === pathway.id}
                        onClick={() => runWorkflowAction(pathway, 'publish', 'تم نشر الإصدار للاستخدام')}
                        className="px-3 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                      >
                        نشر
                      </button>
                      <button
                        disabled={workflowBusyId === pathway.id}
                        onClick={() => runWorkflowAction(pathway, 'reject', 'تمت إعادة الإصدار إلى مسودة')}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                      >
                        إرجاع
                      </button>
                    </>
                  )}
                  {pathway.status === 'PUBLISHED' && (
                    <button
                      disabled={workflowBusyId === pathway.id}
                      onClick={() => runWorkflowAction(pathway, 'retire', 'تم تقاعد الإصدار المنشور')}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs transition-colors"
                    >
                      تقاعد
                    </button>
                  )}
                  {pathway.status !== 'PUBLISHED' && (
                    <button
                      onClick={() => deletePathway(pathway.id)}
                      className="px-3 py-1 bg-red-600/50 hover:bg-red-500 rounded-lg text-xs transition-colors"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {pathways.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <p className="text-xl mb-2">لا توجد مسارات علاجية</p>
              <p className="text-sm">ابدأ بإنشاء أول مسار ثم مرره عبر المراجعة والاعتماد والنشر</p>
            </div>
          )}
        </div>
      )}

      {!loading && activeTab === 'enrollments' && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-xl mb-2">تسجيلات المرضى</p>
          <p className="text-sm">لعرض تفاصيل التسجيلات انتقل إلى الحالة المرضية أو شغّل لوحة متابعة منفصلة لاحقًا</p>
          {enrollmentDetail && <div className="hidden">{enrollmentDetail.id}</div>}
        </div>
      )}

      {showBuilder && (
        <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
            <div>
              <h2 className="text-xl font-black text-white">
                {selectedPathway ? 'إدارة إصدار المسار العلاجي' : 'بناء مسار علاجي جديد'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {selectedPathway
                  ? selectedPathway.status === 'DRAFT'
                    ? 'يمكنك تعديل هذه المسودة مباشرة قبل إرسالها للمراجعة'
                    : `سيتم إنشاء مسودة جديدة من الإصدار الحالي v${selectedPathway.version} بدل تعديل النسخة الحالية مباشرة`
                  : 'قم ببناء رحلة علاجية معيارية قبل اعتمادها ونشرها'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBuilder(false);
                  resetBuilder();
                }}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors font-bold border border-slate-700"
              >
                إلغاء التغييرات
              </button>
              <button
                onClick={savePathway}
                className="px-8 py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-bold transition-colors shadow-lg shadow-pink-900/30"
              >
                💾 حفظ المسودة
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col xl:flex-row">
            <div className="w-full xl:w-[400px] bg-slate-900/50 border-l border-slate-800 overflow-y-auto p-6 custom-scrollbar shrink-0">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center">⚙️</span>
                الإعدادات الأساسية
              </h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">الاسم الإنجليزي (EN)</label>
                  <input
                    value={bName}
                    onChange={(e) => setBName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500 transition-all"
                    placeholder="Pneumonia Pathway"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">الاسم العربي (AR)</label>
                  <input
                    value={bNameAr}
                    onChange={(e) => setBNameAr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500 transition-all"
                    placeholder="مسار الالتهاب الرئوي"
                  />
                </div>

                <div className="bg-rose-900/10 border border-rose-500/20 rounded-2xl p-5">
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">التشخيص المستهدف</label>
                    <input
                      value={bDiagnosis}
                      onChange={(e) => setBDiagnosis(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-rose-500 transition-all"
                      placeholder="J18.9 - Pneumonia"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">مدة الإقامة المتوقعة</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={bLOS}
                        onChange={(e) => setBLOS(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-500 transition-all pl-12"
                        placeholder="5"
                      />
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">أيام</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">الوصف العلمي</label>
                  <textarea
                    value={bDescription}
                    onChange={(e) => setBDescription(e.target.value)}
                    rows={5}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500 transition-all resize-none"
                    placeholder="نطاق المسار والأهداف العامة..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">ملخص التغيير</label>
                  <textarea
                    value={bChangeSummary}
                    onChange={(e) => setBChangeSummary(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500 transition-all resize-none"
                    placeholder="ما الذي تغير في هذه النسخة؟"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 bg-slate-950 flex flex-col relative overflow-hidden">
              <div className="absolute inset-0 bg-pink-900/5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-pink-900/10 via-transparent to-transparent pointer-events-none" />

              <div className="p-6 shrink-0 z-10 flex justify-between items-end border-b border-slate-800/50 pb-4">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                    <span className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">🛤️</span>
                    الخطوات والمراحل الزمنية
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 mr-10">إضافة الإجراءات ومجموعات الطلبات موزعة حسب الأيام والمراحل العلاجية.</p>
                </div>
                <button
                  onClick={addStep}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-900/30 transition-all h-[42px] whitespace-nowrap"
                >
                  + خطوة جديدة
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar z-10 relative">
                {bSteps.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500">
                    <div className="text-6xl mb-4 opacity-50">⏳</div>
                    <p className="text-xl font-bold text-white mb-2">المسار لم يبدأ بعد</p>
                    <p className="text-sm max-w-sm text-center">أضف اليوم الأول والخطوات الأساسية لبدء بناء المسار العلاجي</p>
                  </div>
                ) : (
                  <div className="max-w-4xl mx-auto space-y-6">
                    {bSteps.map((step, idx) => (
                      <div key={idx} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm relative group hover:border-slate-700 transition-all">
                        {idx !== bSteps.length - 1 && (
                          <div className="absolute top-[100%] right-10 w-0.5 h-6 bg-slate-800 z-0" />
                        )}

                        <div className="flex justify-between items-center mb-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-300 font-bold flex items-center justify-center text-lg border-2 border-slate-700">
                              {step.dayNumber}
                            </div>
                            <div>
                              <h4 className="font-bold text-sky-400">اليوم {step.dayNumber}</h4>
                            </div>
                          </div>
                          <button
                            onClick={() => removeStep(idx)}
                            className="text-white hover:bg-red-500 bg-slate-800 w-8 h-8 rounded-lg flex items-center justify-center transition-all opacity-30 group-hover:opacity-100 shadow-sm shrink-0"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 ml-4 pl-4 border-l-2 border-slate-800">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">اليوم</label>
                            <input
                              type="number"
                              value={step.dayNumber}
                              onChange={(e) => updateStep(idx, 'dayNumber', +e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-pink-500 font-mono text-center"
                            />
                          </div>

                          <div className="md:col-span-4">
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">المرحلة</label>
                            <select
                              value={step.phase}
                              onChange={(e) => updateStep(idx, 'phase', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-pink-500"
                            >
                              <option value="">بدون مرحلة مخصصة</option>
                              <option value="Assessment">التقييم</option>
                              <option value="Treatment">العلاج</option>
                              <option value="Monitoring">المتابعة</option>
                              <option value="Discharge">الخروج</option>
                            </select>
                          </div>

                          <div className="md:col-span-6">
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">ربط بمجموعة طلبات منشورة</label>
                            <select
                              value={step.orderSetId}
                              onChange={(e) => updateStep(idx, 'orderSetId', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-pink-500 text-sky-300 font-bold"
                            >
                              <option value="">بدون</option>
                              {orderSets.map((set: any) => (
                                <option key={set.id} value={set.id}>
                                  📦 {set.nameAr || set.name} (v{set.version})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-6">
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">اسم الإجراء</label>
                            <input
                              value={step.title}
                              onChange={(e) => updateStep(idx, 'title', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-pink-500"
                              placeholder="Cardiology Monitoring"
                            />
                          </div>

                          <div className="md:col-span-6">
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">الهدف المتوقع</label>
                            <input
                              value={step.expectedOutcome}
                              onChange={(e) => updateStep(idx, 'expectedOutcome', e.target.value)}
                              className="w-full bg-emerald-950/20 border border-emerald-900/50 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500 text-emerald-400 placeholder-emerald-900"
                              placeholder="استقرار العلامات الحيوية"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showDetail && selectedPathway && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-slate-600">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold">{selectedPathway.nameAr || selectedPathway.name}</h3>
                {selectedPathway.description && <p className="text-sm text-slate-400 mt-1">{selectedPathway.description}</p>}
              </div>
              <button onClick={() => setShowDetail(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="flex gap-3 mb-6 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[10px] border ${STATUS_META[selectedPathway.status].className}`}>
                {STATUS_META[selectedPathway.status].label}
              </span>
              <span className="px-2 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-400">v{selectedPathway.version}</span>
              {selectedPathway.targetDiagnosis && (
                <span className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-full text-xs border border-rose-500/30">
                  🏥 {selectedPathway.targetDiagnosis}
                </span>
              )}
              {selectedPathway.expectedLOS && (
                <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs border border-amber-500/30">
                  🗓 مدة الإقامة المتوقعة: {selectedPathway.expectedLOS} يوم
                </span>
              )}
            </div>

            <div className="space-y-4">
              {groupStepsByDay(selectedPathway.steps).map(([day, steps]) => (
                <div key={day} className="relative">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-sky-600 rounded-full flex items-center justify-center font-bold text-sm">
                      {day}
                    </div>
                    <h4 className="font-semibold text-sky-300">اليوم {day}</h4>
                  </div>
                  <div className="mr-5 border-r-2 border-slate-700 pr-5 space-y-3 pb-4">
                    {steps.map((step, idx) => (
                      <div key={idx} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                        <div className="flex items-center gap-2 mb-2">
                          {step.phase && (
                            <span className={`px-2 py-0.5 rounded text-[10px] border ${PHASE_COLORS[step.phase] || 'bg-slate-600/30 text-slate-300 border-slate-500/30'}`}>
                              {step.phase}
                            </span>
                          )}
                          <span className="font-medium">{step.titleAr || step.title}</span>
                        </div>
                        {step.description && <p className="text-xs text-slate-400 mb-2">{step.description}</p>}
                        {step.expectedOutcome && (
                          <p className="text-xs text-emerald-400">🎯 الهدف: {step.expectedOutcome}</p>
                        )}
                        {step.orderSet && (
                          <p className="text-xs text-amber-400 mt-1">
                            📦 مجموعة الطلبات: {step.orderSet.nameAr || step.orderSet.name}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showEnrollModal && selectedPathway && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-[0_0_50px_-12px_rgba(236,72,153,0.15)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl -mx-10 -my-10" />

            <h3 className="text-2xl font-black mb-2 text-white">تسجيل حالة في مسار علاجي</h3>
            <p className="text-sm text-slate-400 mb-6">مسار: {selectedPathway.nameAr || selectedPathway.name}</p>

            <div className="space-y-6 mb-8">
              <div>
                <label className="block text-sm font-bold mb-3 text-slate-300">بحث عن الحالة النشطة</label>
                <div className="relative z-10">
                  <input
                    type="text"
                    value={encounterSearchTerm}
                    onChange={(e) => {
                      setEncounterSearchTerm(e.target.value);
                      setSelectedEncounter(null);
                      searchEncounters(e.target.value);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition-all placeholder-slate-500"
                    placeholder="ابحث بالاسم أو رقم MRN..."
                  />

                  {activeEncounters.length > 0 && !selectedEncounter && (
                    <div className="absolute w-full top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl max-h-56 overflow-y-auto shadow-2xl py-1 z-50 custom-scrollbar">
                      {activeEncounters.map((enc: any) => (
                        <button
                          key={enc.id}
                          onClick={() => {
                            setSelectedEncounter(enc);
                            setEncounterSearchTerm(`${enc.patient?.fullName || 'غير معروف'} - ${enc.patient?.mrn || ''}`);
                            setActiveEncounters([]);
                          }}
                          className="w-full px-4 py-3 hover:bg-slate-700/50 transition-colors flex justify-between items-center border-b border-slate-700/30 last:border-0 rounded-lg mx-1 w-[calc(100%-8px)]"
                        >
                          <div className="text-right">
                            <div className="font-bold text-sm text-slate-100">{enc.patient?.fullName || 'مريض غير معروف'}</div>
                            <div className="text-xs text-pink-400 font-mono mt-0.5">#{enc.patient?.mrn}</div>
                          </div>
                          <div className="text-left bg-slate-900/50 px-2 py-1.5 rounded-lg border border-slate-700/50">
                            <div className="text-[10px] text-slate-300 font-bold">{enc.department?.name || 'بدون قسم'} • {enc.type}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">🩺 {enc.doctor?.fullName || 'بدون طبيب'}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-slate-300">ملاحظات سريرية (اختياري)</label>
                <textarea
                  value={enrollNotes}
                  onChange={(e) => setEnrollNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-pink-500 outline-none transition-all resize-none"
                  placeholder="اكتب ملاحظاتك هنا..."
                />
              </div>
            </div>

            <div className="flex gap-3 relative z-0">
              <button
                onClick={enrollPatient}
                disabled={enrolling || !selectedEncounter}
                className="flex-1 py-3 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-xl font-bold transition-all shadow-lg shadow-pink-900/20 text-white border border-pink-500/30"
              >
                {enrolling ? 'جاري التسجيل...' : '📋 تسجيل وبدء المسار'}
              </button>
              <button
                onClick={() => {
                  setShowEnrollModal(false);
                  setSelectedEncounter(null);
                  setEncounterSearchTerm('');
                  setActiveEncounters([]);
                  setEnrollNotes('');
                }}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors font-semibold border border-slate-700 text-slate-300"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
