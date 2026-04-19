import { useEffect, useState } from 'react';
import { apiClient } from '../api/apiClient';
import { toast } from 'sonner';

type OrderSetItemType = 'LAB' | 'RADIOLOGY' | 'MEDICATION' | 'PROCEDURE' | 'NURSING';
type OrderSetStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'RETIRED';

type OrderSetItem = {
  id: number;
  itemType: OrderSetItemType;
  labTest?: { id: number; name: string; arabicName?: string };
  radiologyStudy?: { id: number; name: string; arabicName?: string };
  product?: { id: number; name: string };
  serviceItem?: { id: number; name: string };
  nursingAction?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  priority: string;
  instructions?: string;
  isRequired: boolean;
};

type OrderSet = {
  id: number;
  contentKey: string;
  name: string;
  nameAr?: string;
  description?: string;
  category?: string;
  specialty?: string;
  isActive: boolean;
  version: number;
  status: OrderSetStatus;
  changeSummary?: string;
  reviewNotes?: string;
  items: OrderSetItem[];
  createdBy: { fullName: string };
  submittedBy?: { fullName: string };
  approvedBy?: { fullName: string };
  publishedBy?: { fullName: string };
  _count?: { items: number };
};

const ITEM_TYPE_LABELS: Record<OrderSetItemType, string> = {
  LAB: '🧪 مختبر',
  RADIOLOGY: '📡 أشعة',
  MEDICATION: '💊 دواء',
  PROCEDURE: '🔧 إجراء',
  NURSING: '👩‍⚕️ تمريض',
};

const ITEM_TYPE_COLORS: Record<OrderSetItemType, string> = {
  LAB: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  RADIOLOGY: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  MEDICATION: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  PROCEDURE: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  NURSING: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
};

const PRIORITY_LABELS: Record<string, string> = {
  STAT: '🔴 طارئ',
  URGENT: '🟠 عاجل',
  ROUTINE: '🟢 عادي',
};

const STATUS_META: Record<OrderSetStatus, { label: string; className: string }> = {
  DRAFT: { label: 'مسودة', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  IN_REVIEW: { label: 'قيد المراجعة', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  APPROVED: { label: 'معتمد', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  PUBLISHED: { label: 'منشور', className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  RETIRED: { label: 'متقاعد', className: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
};

export default function OrderSetsPage() {
  const [orderSets, setOrderSets] = useState<OrderSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSet, setSelectedSet] = useState<OrderSet | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [workflowBusyId, setWorkflowBusyId] = useState<number | null>(null);
  const [encounterSearchTerm, setEncounterSearchTerm] = useState('');
  const [activeEncounters, setActiveEncounters] = useState<any[]>([]);
  const [selectedEncounter, setSelectedEncounter] = useState<any | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const [builderName, setBuilderName] = useState('');
  const [builderNameAr, setBuilderNameAr] = useState('');
  const [builderDescription, setBuilderDescription] = useState('');
  const [builderCategory, setBuilderCategory] = useState('');
  const [builderSpecialty, setBuilderSpecialty] = useState('');
  const [builderChangeSummary, setBuilderChangeSummary] = useState('');
  const [builderItems, setBuilderItems] = useState<any[]>([]);
  const [newItemType, setNewItemType] = useState<OrderSetItemType>('LAB');
  const [newItemRefId, setNewItemRefId] = useState('');
  const [newItemPriority, setNewItemPriority] = useState('ROUTINE');
  const [newItemInstructions, setNewItemInstructions] = useState('');
  const [newItemNursingAction, setNewItemNursingAction] = useState('');

  const [labTests, setLabTests] = useState<any[]>([]);
  const [radiologyStudies, setRadiologyStudies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [searchFilter, categoryFilter, statusFilter]);

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
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter) params.status = statusFilter;

      const [setsRes, catsRes] = await Promise.all([
        apiClient.get('/order-sets', { params }),
        apiClient.get('/order-sets/categories'),
      ]);
      setOrderSets(setsRes.data);
      setCategories(catsRes.data);
    } catch {
      toast.error('فشل تحميل مجموعات الطلبات');
    } finally {
      setLoading(false);
    }
  };

  const loadBuilderResources = async () => {
    try {
      const [labRes, radRes, prodRes] = await Promise.all([
        apiClient.get('/lab/catalog'),
        apiClient.get('/radiology/catalog'),
        apiClient.get('/pharmacy/catalog', { params: { limit: 500 } }),
      ]);
      setLabTests(labRes.data?.items || labRes.data || []);
      setRadiologyStudies(radRes.data?.items || radRes.data || []);
      setProducts(prodRes.data?.items || prodRes.data || []);
    } catch {
      toast.error('تعذر تحميل مصادر البناء');
    }
  };

  const getItemLabel = (item: OrderSetItem | any) => {
    if (item.labTest) return item.labTest.arabicName || item.labTest.name;
    if (item.radiologyStudy) return item.radiologyStudy.arabicName || item.radiologyStudy.name;
    if (item.product) return item.product.name;
    if (item.serviceItem) return item.serviceItem.name;
    if (item.nursingAction) return item.nursingAction;
    return item._label || 'غير محدد';
  };

  const resetBuilder = () => {
    setBuilderName('');
    setBuilderNameAr('');
    setBuilderDescription('');
    setBuilderCategory('');
    setBuilderSpecialty('');
    setBuilderChangeSummary('');
    setBuilderItems([]);
  };

  const openBuilder = (set?: OrderSet) => {
    if (set) {
      setSelectedSet(set);
      setBuilderName(set.name);
      setBuilderNameAr(set.nameAr || '');
      setBuilderDescription(set.description || '');
      setBuilderCategory(set.category || '');
      setBuilderSpecialty(set.specialty || '');
      setBuilderChangeSummary(set.changeSummary || '');
      setBuilderItems(
        set.items.map((item) => ({
          itemType: item.itemType,
          labTestId: item.labTest?.id,
          radiologyStudyId: item.radiologyStudy?.id,
          productId: item.product?.id,
          serviceItemId: item.serviceItem?.id,
          nursingAction: item.nursingAction,
          priority: item.priority,
          instructions: item.instructions,
          isRequired: item.isRequired,
          _label: getItemLabel(item),
        })),
      );
    } else {
      setSelectedSet(null);
      resetBuilder();
    }
    setShowBuilder(true);
    loadBuilderResources();
  };

  const addBuilderItem = () => {
    const item: any = {
      itemType: newItemType,
      priority: newItemPriority,
      instructions: newItemInstructions || undefined,
      isRequired: true,
    };

    if (newItemType === 'LAB' && newItemRefId) {
      item.labTestId = +newItemRefId;
      const test = labTests.find((t) => t.id === +newItemRefId);
      item._label = test?.arabicName || test?.name || `Test #${newItemRefId}`;
    } else if (newItemType === 'RADIOLOGY' && newItemRefId) {
      item.radiologyStudyId = +newItemRefId;
      const study = radiologyStudies.find((s) => s.id === +newItemRefId);
      item._label = study?.arabicName || study?.name || `Study #${newItemRefId}`;
    } else if (newItemType === 'MEDICATION' && newItemRefId) {
      item.productId = +newItemRefId;
      const prod = products.find((p) => p.id === +newItemRefId);
      item._label = prod?.name || `Product #${newItemRefId}`;
    } else if (newItemType === 'NURSING' && newItemNursingAction.trim()) {
      item.nursingAction = newItemNursingAction;
      item._label = newItemNursingAction;
    } else {
      toast.error('يرجى تحديد العنصر المطلوب');
      return;
    }

    setBuilderItems([...builderItems, item]);
    setNewItemRefId('');
    setNewItemInstructions('');
    setNewItemNursingAction('');
  };

  const removeBuilderItem = (idx: number) => {
    setBuilderItems(builderItems.filter((_, i) => i !== idx));
  };

  const saveOrderSet = async () => {
    if (!builderName.trim()) {
      toast.error('يرجى إدخال اسم المجموعة');
      return;
    }
    if (builderItems.length === 0) {
      toast.error('يرجى إضافة عنصر واحد على الأقل');
      return;
    }

    const payload = {
      name: builderName,
      nameAr: builderNameAr || undefined,
      description: builderDescription || undefined,
      category: builderCategory || undefined,
      specialty: builderSpecialty || undefined,
      changeSummary: builderChangeSummary || undefined,
      items: builderItems.map(({ _label, ...rest }) => rest),
    };

    try {
      let response;
      if (selectedSet) {
        response = await apiClient.put(`/order-sets/${selectedSet.id}`, payload);
        if (response.data?.id !== selectedSet.id) {
          toast.success(`تم إنشاء مسودة جديدة v${response.data?.version ?? '?'} بدل تعديل النسخة الحالية مباشرة`);
        } else {
          toast.success('تم تحديث المسودة بنجاح');
        }
      } else {
        response = await apiClient.post('/order-sets', payload);
        toast.success('تم إنشاء مسودة مجموعة الطلبات بنجاح');
      }
      setShowBuilder(false);
      resetBuilder();
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'فشل حفظ مجموعة الطلبات');
    }
  };

  const executeOrderSet = async () => {
    if (!selectedSet || !selectedEncounter?.id) return;
    setExecuting(true);
    try {
      await apiClient.post(`/order-sets/${selectedSet.id}/execute`, {
        encounterId: selectedEncounter.id,
      });
      toast.success(`تم تنفيذ "${selectedSet.nameAr || selectedSet.name}" بنجاح`, { duration: 8000 });
      setShowExecuteModal(false);
      setSelectedEncounter(null);
      setEncounterSearchTerm('');
      setActiveEncounters([]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'فشل تنفيذ مجموعة الطلبات', { duration: 8000 });
    } finally {
      setExecuting(false);
    }
  };

  const deleteOrderSet = async (id: number) => {
    if (!confirm('هل تريد تعطيل هذه المجموعة؟')) return;
    try {
      await apiClient.delete(`/order-sets/${id}`);
      toast.success('تم تعطيل المجموعة');
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'فشل تعطيل المجموعة');
    }
  };

  const runWorkflowAction = async (
    set: OrderSet,
    endpoint: 'submit-review' | 'approve' | 'reject' | 'publish' | 'retire',
    successMessage: string,
  ) => {
    const notes = window.prompt('أضف ملاحظة مختصرة لهذا الإجراء (اختياري):', '') || undefined;
    setWorkflowBusyId(set.id);
    try {
      await apiClient.post(`/order-sets/${set.id}/${endpoint}`, { notes });
      toast.success(successMessage);
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'فشل تنفيذ الإجراء');
    } finally {
      setWorkflowBusyId(null);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">مجموعات الطلبات الطبية</h1>
          <p className="text-sm text-slate-400">
            إنشاء، مراجعة، اعتماد، ونشر البروتوكولات السريرية قبل استخدامها تشغيليًا
          </p>
        </div>
        <button
          onClick={() => openBuilder()}
          className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 transition-all"
        >
          + إنشاء مجموعة جديدة
        </button>
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <input
          type="text"
          placeholder="بحث بالاسم..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm w-64 focus:border-sky-500 focus:outline-none transition-colors"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">جميع الفئات</option>
          {categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
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
        <span className="text-sm text-slate-400">{orderSets.length} مجموعة</span>
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {orderSets.map((set) => (
            <div
              key={set.id}
              className="bg-slate-900/60 rounded-2xl border border-slate-700/50 p-5 hover:border-sky-500/40 transition-all"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg text-sky-300">{set.nameAr || set.name}</h3>
                  {set.nameAr && <p className="text-xs text-slate-500 mt-0.5">{set.name}</p>}
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] border ${STATUS_META[set.status].className}`}>
                    {STATUS_META[set.status].label}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-700/50 rounded-full text-[10px] text-slate-300">
                    v{set.version}
                  </span>
                  {set.category && (
                    <span className="px-2 py-0.5 bg-slate-700/50 rounded-full text-[10px] text-slate-300">{set.category}</span>
                  )}
                  {set.specialty && (
                    <span className="px-2 py-0.5 bg-sky-700/30 rounded-full text-[10px] text-sky-300">{set.specialty}</span>
                  )}
                </div>
              </div>

              {set.description && (
                <p className="text-xs text-slate-400 mb-3 line-clamp-2">{set.description}</p>
              )}
              {set.changeSummary && (
                <p className="text-[11px] text-slate-500 mb-3 line-clamp-2">آخر تغيير: {set.changeSummary}</p>
              )}

              <div className="flex flex-wrap gap-1.5 mb-4">
                {set.items.slice(0, 6).map((item, idx) => (
                  <span key={idx} className={`px-2 py-0.5 rounded-full text-[10px] border ${ITEM_TYPE_COLORS[item.itemType]}`}>
                    {getItemLabel(item)}
                  </span>
                ))}
                {set.items.length > 6 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-700/50 text-slate-400">
                    +{set.items.length - 6} أخرى
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-700/50 gap-3">
                <span className="text-[11px] text-slate-500">
                  {set.items.length} عنصر • {set.createdBy.fullName}
                </span>
                <div className="flex gap-2 flex-wrap justify-end">
                  {set.status === 'PUBLISHED' && (
                    <button
                      onClick={() => {
                        setSelectedSet(set);
                        setShowExecuteModal(true);
                      }}
                      className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-bold transition-colors"
                    >
                      ▶ تنفيذ
                    </button>
                  )}
                  <button
                    onClick={() => openBuilder(set)}
                    className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded-lg text-xs transition-colors"
                  >
                    {set.status === 'DRAFT' ? 'تعديل' : 'إصدار جديد'}
                  </button>
                  {set.status === 'DRAFT' && (
                    <button
                      disabled={workflowBusyId === set.id}
                      onClick={() => runWorkflowAction(set, 'submit-review', 'تم إرسال المسودة للمراجعة')}
                      className="px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                    >
                      للمراجعة
                    </button>
                  )}
                  {set.status === 'IN_REVIEW' && (
                    <>
                      <button
                        disabled={workflowBusyId === set.id}
                        onClick={() => runWorkflowAction(set, 'approve', 'تم اعتماد الإصدار')}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                      >
                        اعتماد
                      </button>
                      <button
                        disabled={workflowBusyId === set.id}
                        onClick={() => runWorkflowAction(set, 'reject', 'تمت إعادة الإصدار إلى مسودة')}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                      >
                        إرجاع
                      </button>
                    </>
                  )}
                  {set.status === 'APPROVED' && (
                    <>
                      <button
                        disabled={workflowBusyId === set.id}
                        onClick={() => runWorkflowAction(set, 'publish', 'تم نشر الإصدار للاستخدام')}
                        className="px-3 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                      >
                        نشر
                      </button>
                      <button
                        disabled={workflowBusyId === set.id}
                        onClick={() => runWorkflowAction(set, 'reject', 'تمت إعادة الإصدار إلى مسودة')}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-xs transition-colors"
                      >
                        إرجاع
                      </button>
                    </>
                  )}
                  {set.status === 'PUBLISHED' && (
                    <button
                      disabled={workflowBusyId === set.id}
                      onClick={() => runWorkflowAction(set, 'retire', 'تم تقاعد الإصدار المنشور')}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs transition-colors"
                    >
                      تقاعد
                    </button>
                  )}
                  {set.status !== 'PUBLISHED' && (
                    <button
                      onClick={() => deleteOrderSet(set.id)}
                      className="px-3 py-1 bg-red-600/50 hover:bg-red-500 rounded-lg text-xs transition-colors"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {orderSets.length === 0 && (
            <div className="col-span-full text-center py-16 text-slate-400">
              <p className="text-xl mb-2">لا توجد مجموعات طلبات</p>
              <p className="text-sm">ابدأ بإنشاء أول مسودة ثم مررها عبر الاعتماد والنشر</p>
            </div>
          )}
        </div>
      )}

      {showBuilder && (
        <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
            <div>
              <h2 className="text-xl font-black text-white">
                {selectedSet ? 'إدارة إصدار مجموعة الطلبات' : 'بناء مجموعة طلبات جديدة'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {selectedSet
                  ? selectedSet.status === 'DRAFT'
                    ? 'يمكنك تعديل هذه المسودة مباشرة قبل إرسالها للمراجعة'
                    : `سيتم إنشاء مسودة جديدة من الإصدار الحالي v${selectedSet.version} بدل تعديل النسخة الحالية مباشرة`
                  : 'قم ببناء بروتوكول متكامل يضم التحاليل، الأشعة، الأدوية وغيرها قبل اعتماده ونشره'}
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
                onClick={saveOrderSet}
                className="px-8 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition-colors shadow-lg shadow-sky-900/30"
              >
                💾 حفظ المسودة
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            <div className="w-full md:w-1/3 min-w-[320px] bg-slate-900/50 border-l border-slate-800 overflow-y-auto p-6 custom-scrollbar shrink-0">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">⚙️</span>
                الإعدادات الأساسية
              </h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">الاسم الإنجليزي (EN)</label>
                  <input
                    value={builderName}
                    onChange={(e) => setBuilderName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 transition-all outline-none"
                    placeholder="Chest Pain Protocol"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">الاسم العربي (AR)</label>
                  <input
                    value={builderNameAr}
                    onChange={(e) => setBuilderNameAr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 transition-all outline-none"
                    placeholder="بروتوكول ألم الصدر"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">الفئة التصنيفية</label>
                    <input
                      value={builderCategory}
                      onChange={(e) => setBuilderCategory(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 transition-all outline-none"
                      placeholder="القلبية"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">التخصص</label>
                    <input
                      value={builderSpecialty}
                      onChange={(e) => setBuilderSpecialty(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 transition-all outline-none"
                      placeholder="الباطنة"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">وصف البروتوكول</label>
                  <textarea
                    value={builderDescription}
                    onChange={(e) => setBuilderDescription(e.target.value)}
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 transition-all outline-none resize-none"
                    placeholder="وصف مبسط للحالات المستهدفة..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">ملخص التغيير</label>
                  <textarea
                    value={builderChangeSummary}
                    onChange={(e) => setBuilderChangeSummary(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 transition-all outline-none resize-none"
                    placeholder="ما الذي تغير في هذه النسخة؟"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 bg-slate-950 flex flex-col relative overflow-hidden">
              <div className="absolute inset-0 bg-sky-900/5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/10 via-transparent to-transparent pointer-events-none" />

              <div className="p-6 shrink-0 z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">📦</span>
                    عناصر البروتوكول
                  </h3>
                  <span className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-xs font-mono">
                    {builderItems.length} عنصر
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 shadow-lg flex flex-col lg:flex-row gap-4 items-end">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 w-full">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5">النوع</label>
                      <select
                        value={newItemType}
                        onChange={(e) => {
                          setNewItemType(e.target.value as OrderSetItemType);
                          setNewItemRefId('');
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                      >
                        {Object.entries(ITEM_TYPE_LABELS).map(([key, value]) => (
                          <option key={key} value={key}>{value}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5">العنصر من الدليل الطبي</label>
                      {newItemType === 'NURSING' ? (
                        <input
                          value={newItemNursingAction}
                          onChange={(e) => setNewItemNursingAction(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                          placeholder="اكتب إجراء تمريضيًا..."
                        />
                      ) : (
                        <select
                          value={newItemRefId}
                          onChange={(e) => setNewItemRefId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                        >
                          <option value="">-- اختر عنصرًا --</option>
                          {newItemType === 'LAB' && labTests.map((t) => <option key={t.id} value={t.id}>{t.arabicName || t.name}</option>)}
                          {newItemType === 'RADIOLOGY' && radiologyStudies.map((s) => <option key={s.id} value={s.id}>{s.arabicName || s.name}</option>)}
                          {newItemType === 'MEDICATION' && products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5">الأولوية</label>
                      <select
                        value={newItemPriority}
                        onChange={(e) => setNewItemPriority(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                      >
                        {Object.entries(PRIORITY_LABELS).map(([key, value]) => (
                          <option key={key} value={key}>{value}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="w-full lg:w-48 xl:w-64">
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">ملاحظات التنفيذ</label>
                    <input
                      value={newItemInstructions}
                      onChange={(e) => setNewItemInstructions(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                      placeholder="اختياري..."
                    />
                  </div>

                  <button
                    onClick={addBuilderItem}
                    className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition-all whitespace-nowrap shadow-md h-[42px] shrink-0"
                  >
                    + إدراج
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {builderItems.map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-sky-500/30 transition-all group shadow-sm">
                      <div className="flex gap-4 items-center">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm border-2 ${ITEM_TYPE_COLORS[item.itemType as OrderSetItemType]} bg-transparent`}>
                          {item.itemType.substring(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white mb-0.5">{item._label}</div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="text-slate-400">{PRIORITY_LABELS[item.priority] || item.priority}</span>
                            {item.instructions && (
                              <>
                                <span className="text-slate-600">•</span>
                                <span className="text-slate-400 italic max-w-[140px] truncate">{item.instructions}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeBuilderItem(idx)}
                        className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all opacity-50 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {builderItems.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 py-20">
                    <div className="text-5xl mb-4 opacity-50">📋</div>
                    <p className="text-lg font-bold">مساحة عمل خالية</p>
                    <p className="text-sm max-w-sm text-center mt-2">أضف عناصر المختبر أو الأشعة أو الأدوية لبناء المسودة الحالية</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showExecuteModal && selectedSet && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-[0_0_50px_-12px_rgba(14,165,233,0.15)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl -mx-10 -my-10" />

            <h3 className="text-2xl font-black mb-2 text-white">تنفيذ: {selectedSet.nameAr || selectedSet.name}</h3>
            <p className="text-sm text-slate-400 mb-6">
              سيتم إصدار {selectedSet.items.length} طلب من النسخة المنشورة v{selectedSet.version}
            </p>

            <div className="space-y-1.5 mb-5 max-h-40 overflow-y-auto">
              {selectedSet.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] border ${ITEM_TYPE_COLORS[item.itemType]}`}>
                    {ITEM_TYPE_LABELS[item.itemType]}
                  </span>
                  <span>{getItemLabel(item)}</span>
                </div>
              ))}
            </div>

            <div className="mb-8">
              <label className="block text-sm font-bold mb-3 text-slate-300">اختر الحالة النشطة للمريض</label>
              <div className="relative z-10">
                <input
                  type="text"
                  value={encounterSearchTerm}
                  onChange={(e) => {
                    setEncounterSearchTerm(e.target.value);
                    setSelectedEncounter(null);
                    searchEncounters(e.target.value);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all placeholder-slate-500"
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
                          <div className="text-xs text-sky-400 font-mono mt-0.5">#{enc.patient?.mrn}</div>
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

            <div className="flex gap-3 mt-4 relative z-0">
              <button
                onClick={executeOrderSet}
                disabled={executing || !selectedEncounter}
                className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-xl font-bold transition-all shadow-lg shadow-green-900/20 text-white border border-green-500/30"
              >
                {executing ? 'جاري التنفيذ...' : '▶ تنفيذ البروتوكول الآن'}
              </button>
              <button
                onClick={() => {
                  setShowExecuteModal(false);
                  setSelectedEncounter(null);
                  setEncounterSearchTerm('');
                  setActiveEncounters([]);
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
