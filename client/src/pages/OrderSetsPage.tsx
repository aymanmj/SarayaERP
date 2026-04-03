import { useEffect, useState } from 'react';
import { apiClient } from '../api/apiClient';
import { toast } from 'sonner';

type OrderSetItemType = 'LAB' | 'RADIOLOGY' | 'MEDICATION' | 'PROCEDURE' | 'NURSING';

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
  name: string;
  nameAr?: string;
  description?: string;
  category?: string;
  specialty?: string;
  isActive: boolean;
  items: OrderSetItem[];
  createdBy: { fullName: string };
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

export default function OrderSetsPage() {
  const [orderSets, setOrderSets] = useState<OrderSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSet, setSelectedSet] = useState<OrderSet | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executeEncounterId, setExecuteEncounterId] = useState('');
  const [executing, setExecuting] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  // Builder state
  const [builderName, setBuilderName] = useState('');
  const [builderNameAr, setBuilderNameAr] = useState('');
  const [builderDescription, setBuilderDescription] = useState('');
  const [builderCategory, setBuilderCategory] = useState('');
  const [builderSpecialty, setBuilderSpecialty] = useState('');
  const [builderItems, setBuilderItems] = useState<any[]>([]);
  const [newItemType, setNewItemType] = useState<OrderSetItemType>('LAB');
  const [newItemRefId, setNewItemRefId] = useState('');
  const [newItemPriority, setNewItemPriority] = useState('ROUTINE');
  const [newItemInstructions, setNewItemInstructions] = useState('');
  const [newItemNursingAction, setNewItemNursingAction] = useState('');

  // Available lab tests, radiology studies, products
  const [labTests, setLabTests] = useState<any[]>([]);
  const [radiologyStudies, setRadiologyStudies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => { loadData(); }, [searchFilter, categoryFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (searchFilter) params.search = searchFilter;
      if (categoryFilter) params.category = categoryFilter;

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
        apiClient.get('/labs/tests'),
        apiClient.get('/radiology/studies'),
        apiClient.get('/pharmacy/products', { params: { limit: 200 } }),
      ]);
      setLabTests(labRes.data || []);
      setRadiologyStudies(radRes.data || []);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.items || []);
    } catch (err) {
      console.error('Error loading builder resources:', err);
    }
  };

  const openBuilder = (set?: OrderSet) => {
    if (set) {
      setBuilderName(set.name);
      setBuilderNameAr(set.nameAr || '');
      setBuilderDescription(set.description || '');
      setBuilderCategory(set.category || '');
      setBuilderSpecialty(set.specialty || '');
      setBuilderItems(set.items.map(item => ({
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
      })));
      setSelectedSet(set);
    } else {
      resetBuilder();
      setSelectedSet(null);
    }
    setShowBuilder(true);
    loadBuilderResources();
  };

  const resetBuilder = () => {
    setBuilderName(''); setBuilderNameAr(''); setBuilderDescription('');
    setBuilderCategory(''); setBuilderSpecialty(''); setBuilderItems([]);
  };

  const getItemLabel = (item: OrderSetItem) => {
    if (item.labTest) return item.labTest.arabicName || item.labTest.name;
    if (item.radiologyStudy) return item.radiologyStudy.arabicName || item.radiologyStudy.name;
    if (item.product) return item.product.name;
    if (item.serviceItem) return item.serviceItem.name;
    if (item.nursingAction) return item.nursingAction;
    return 'غير محدد';
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
      const test = labTests.find(t => t.id === +newItemRefId);
      item._label = test?.arabicName || test?.name || `Test #${newItemRefId}`;
    } else if (newItemType === 'RADIOLOGY' && newItemRefId) {
      item.radiologyStudyId = +newItemRefId;
      const study = radiologyStudies.find(s => s.id === +newItemRefId);
      item._label = study?.arabicName || study?.name || `Study #${newItemRefId}`;
    } else if (newItemType === 'MEDICATION' && newItemRefId) {
      item.productId = +newItemRefId;
      const prod = products.find(p => p.id === +newItemRefId);
      item._label = prod?.name || `Product #${newItemRefId}`;
    } else if (newItemType === 'NURSING') {
      item.nursingAction = newItemNursingAction;
      item._label = newItemNursingAction || 'إجراء تمريض';
    } else {
      toast.error('يرجى تحديد العنصر المطلوب');
      return;
    }

    setBuilderItems([...builderItems, item]);
    setNewItemRefId(''); setNewItemInstructions(''); setNewItemNursingAction('');
  };

  const removeBuilderItem = (idx: number) => {
    setBuilderItems(builderItems.filter((_, i) => i !== idx));
  };

  const saveOrderSet = async () => {
    if (!builderName.trim()) { toast.error('يرجى إدخال اسم المجموعة'); return; }
    if (builderItems.length === 0) { toast.error('يرجى إضافة عنصر واحد على الأقل'); return; }

    const payload = {
      name: builderName,
      nameAr: builderNameAr || undefined,
      description: builderDescription || undefined,
      category: builderCategory || undefined,
      specialty: builderSpecialty || undefined,
      items: builderItems.map(({ _label, ...rest }) => rest),
    };

    try {
      if (selectedSet) {
        await apiClient.put(`/order-sets/${selectedSet.id}`, payload);
        toast.success('تم تحديث مجموعة الطلبات بنجاح');
      } else {
        await apiClient.post('/order-sets', payload);
        toast.success('تم إنشاء مجموعة الطلبات بنجاح');
      }
      setShowBuilder(false);
      resetBuilder();
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'فشل حفظ مجموعة الطلبات');
    }
  };

  const executeOrderSet = async () => {
    if (!selectedSet || !executeEncounterId) return;
    setExecuting(true);
    try {
      const result = await apiClient.post(`/order-sets/${selectedSet.id}/execute`, {
        encounterId: +executeEncounterId,
      });
      toast.success(`تم تنفيذ "${selectedSet.nameAr || selectedSet.name}" بنجاح — ${result.data.total} طلب`, { duration: 8000 });
      setShowExecuteModal(false);
      setExecuteEncounterId('');
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
      loadData();
    } catch { toast.error('فشل تعطيل المجموعة'); }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">مجموعات الطلبات الطبية</h1>
          <p className="text-sm text-slate-400">
            قوالب جاهزة لطلبات المختبر والأشعة والأدوية — يتم تنفيذها بضغطة واحدة
          </p>
        </div>
        <button
          onClick={() => openBuilder()}
          className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-500/20 transition-all"
        >
          + إنشاء مجموعة جديدة
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
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
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-slate-400">{orderSets.length} مجموعة</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      )}

      {/* Order Sets Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {orderSets.map(set => (
            <div key={set.id} className="bg-slate-900/60 rounded-2xl border border-slate-700/50 p-5 hover:border-sky-500/40 transition-all group">
              {/* Header */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg text-sky-300">{set.nameAr || set.name}</h3>
                  {set.nameAr && <p className="text-xs text-slate-500 mt-0.5">{set.name}</p>}
                </div>
                <div className="flex gap-1">
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

              {/* Items preview */}
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

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                <span className="text-[11px] text-slate-500">
                  {set.items.length} عنصر • {set.createdBy.fullName}
                </span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setSelectedSet(set); setShowExecuteModal(true); }}
                    className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-bold transition-colors"
                  >
                    ▶ تنفيذ
                  </button>
                  <button
                    onClick={() => openBuilder(set)}
                    className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded-lg text-xs transition-colors"
                  >
                     تعديل
                  </button>
                  <button
                    onClick={() => deleteOrderSet(set.id)}
                    className="px-3 py-1 bg-red-600/50 hover:bg-red-500 rounded-lg text-xs transition-colors"
                  >
                    حذف
                  </button>
                </div>
              </div>
            </div>
          ))}

          {orderSets.length === 0 && (
            <div className="col-span-full text-center py-16 text-slate-400">
              <p className="text-xl mb-2">لا توجد مجموعات طلبات</p>
              <p className="text-sm">قم بإنشاء أول مجموعة طلبات لتسريع عملية الطلب الطبي</p>
            </div>
          )}
        </div>
      )}

      {/* ==================== Builder Modal ==================== */}
      {showBuilder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-slate-600">
            <h3 className="text-xl font-bold mb-5">{selectedSet ? 'تعديل مجموعة الطلبات' : 'إنشاء مجموعة طلبات جديدة'}</h3>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium mb-1">الاسم (EN)</label>
                <input value={builderName} onChange={e => setBuilderName(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Chest Pain Workup" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الاسم (AR)</label>
                <input value={builderNameAr} onChange={e => setBuilderNameAr(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="بروتوكول ألم الصدر" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الفئة</label>
                <input value={builderCategory} onChange={e => setBuilderCategory(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Cardiology" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">التخصص</label>
                <input value={builderSpecialty} onChange={e => setBuilderSpecialty(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="Cardiology" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">الوصف</label>
                <textarea value={builderDescription} onChange={e => setBuilderDescription(e.target.value)} rows={2}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="وصف مختصر لمجموعة الطلبات..." />
              </div>
            </div>

            {/* Current Items */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold mb-2">العناصر ({builderItems.length})</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {builderItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${ITEM_TYPE_COLORS[item.itemType as OrderSetItemType]}`}>
                        {ITEM_TYPE_LABELS[item.itemType as OrderSetItemType]}
                      </span>
                      <span className="text-sm">{item._label}</span>
                      <span className="text-[10px] text-slate-400">{PRIORITY_LABELS[item.priority] || item.priority}</span>
                    </div>
                    <button onClick={() => removeBuilderItem(idx)} className="text-red-400 hover:text-red-300 text-sm">✕</button>
                  </div>
                ))}
                {builderItems.length === 0 && <p className="text-sm text-slate-500 text-center py-4">لم يتم إضافة عناصر بعد</p>}
              </div>
            </div>

            {/* Add Item */}
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 mb-5">
              <h4 className="text-sm font-semibold mb-3">إضافة عنصر</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs mb-1">النوع</label>
                  <select value={newItemType} onChange={e => { setNewItemType(e.target.value as OrderSetItemType); setNewItemRefId(''); }}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(ITEM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1">العنصر</label>
                  {newItemType === 'NURSING' ? (
                    <input value={newItemNursingAction} onChange={e => setNewItemNursingAction(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="إجراء التمريض..." />
                  ) : (
                    <select value={newItemRefId} onChange={e => setNewItemRefId(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm">
                      <option value="">اختر...</option>
                      {newItemType === 'LAB' && labTests.map(t => <option key={t.id} value={t.id}>{t.arabicName || t.name}</option>)}
                      {newItemType === 'RADIOLOGY' && radiologyStudies.map(s => <option key={s.id} value={s.id}>{s.arabicName || s.name}</option>)}
                      {newItemType === 'MEDICATION' && products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs mb-1">الأولوية</label>
                  <select value={newItemPriority} onChange={e => setNewItemPriority(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs mb-1">تعليمات (اختياري)</label>
                  <input value={newItemInstructions} onChange={e => setNewItemInstructions(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" placeholder="تعليمات إضافية..." />
                </div>
                <button onClick={addBuilderItem}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm font-bold transition-colors whitespace-nowrap">
                  + إضافة
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={saveOrderSet}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 rounded-xl font-bold transition-colors">
                {selectedSet ? 'حفظ التعديلات' : 'إنشاء المجموعة'}
              </button>
              <button onClick={() => { setShowBuilder(false); resetBuilder(); }}
                className="px-6 py-2.5 bg-slate-600 hover:bg-slate-500 rounded-xl transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Execute Modal ==================== */}
      {showExecuteModal && selectedSet && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-lg border border-slate-600">
            <h3 className="text-xl font-bold mb-2">تنفيذ: {selectedSet.nameAr || selectedSet.name}</h3>
            <p className="text-sm text-slate-400 mb-5">سيتم إصدار {selectedSet.items.length} طلب تلقائياً للحالة المحددة</p>

            {/* Items preview */}
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

            <div className="mb-5">
              <label className="block text-sm font-medium mb-2">رقم الحالة (Encounter ID)</label>
              <input
                type="number"
                value={executeEncounterId}
                onChange={e => setExecuteEncounterId(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                placeholder="أدخل رقم الحالة المرضية..."
              />
            </div>

            <div className="flex gap-3">
              <button onClick={executeOrderSet} disabled={executing || !executeEncounterId}
                className="px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-xl font-bold transition-colors">
                {executing ? 'جاري التنفيذ...' : '▶ تنفيذ الآن'}
              </button>
              <button onClick={() => { setShowExecuteModal(false); setExecuteEncounterId(''); }}
                className="px-6 py-2.5 bg-slate-600 hover:bg-slate-500 rounded-xl transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
