// src/pages/inventory/master-data/ProductsMasterDataPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient as api } from '../../../api/apiClient';
import { inventoryApi } from '../../../api/inventoryApi';

const BoxIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22.08V12"/></svg>
);

export function ProductsMasterDataPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'CONSUMABLE',
    categoryId: '',
    baseUomId: '',
    costPrice: '0',
    sellPrice: '0',
    minStock: '0',
    maxStock: '0',
    reorderLevel: '0'
  });

  const { data: products, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['master-products'],
    queryFn: async () => {
      const res = await api.get('/inventory/master-data/products');
      return res.data;
    }
  });

  const { data: categories } = useQuery({
    queryKey: ['item-categories'],
    queryFn: async () => {
      const res = await api.get('/inventory/master-data/categories');
      return res.data;
    }
  });

  const { data: uoms } = useQuery({
    queryKey: ['uoms'],
    queryFn: () => inventoryApi.getUOMs()
  });

  const addProductMut = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formData,
        categoryId: Number(formData.categoryId),
        baseUomId: Number(formData.baseUomId),
        costPrice: Number(formData.costPrice),
        sellPrice: Number(formData.sellPrice),
        minStock: Number(formData.minStock),
        maxStock: Number(formData.maxStock),
        reorderLevel: Number(formData.reorderLevel)
      };
      return api.post('/inventory/master-data/products', payload);
    },
    onSuccess: () => {
      toast.success('تمت إضافة الصنف بنجاح');
      queryClient.invalidateQueries({ queryKey: ['master-products'] });
      setShowAddForm(false);
      setFormData({ name: '', code: '', type: 'CONSUMABLE', categoryId: '', baseUomId: '', costPrice: '0', sellPrice: '0', minStock: '0', maxStock: '0', reorderLevel: '0' });
    },
    onError: () => toast.error('فشل في حفظ الصنف')
  });

  return (
    <div className="space-y-6 p-1">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <span className="p-2 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl text-emerald-400">
              <BoxIcon />
            </span>
            الأصناف الرئيسية (Products Master Data)
          </h1>
          <p className="text-sm text-slate-500 mt-1">إدارة بيانات الأصناف الأساسية وتحديد سياسات المخزون والتكلفة المعيارية.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 font-medium transition-colors"
        >
          + صنف جديد
        </button>
      </div>

      {showAddForm && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="font-semibold text-emerald-400 mb-4">بيانات الصنف الجديد</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">اسم الصنف</label>
              <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">كود الصنف (الباركود أو المعرف)</label>
              <input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">نوع الصنف</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                <option value="CONSUMABLE">مستهلكات طبية</option>
                <option value="DRUG">دواء</option>
                <option value="SERVICE">خدمة</option>
                <option value="ASSET">أصل ثابت</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">فئة الصنف (لتحديد التقييم المحاسبي)</label>
              <select value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                <option value="">-- اختر الفئة --</option>
                { }
                {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.valuationMethod})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">الوحدة الأساسية (الصغرى)</label>
              <select value={formData.baseUomId} onChange={e => setFormData({...formData, baseUomId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                <option value="">-- اختر الوحدة --</option>
                { }
                {uoms?.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">التكلفة المعيارية (الافتراضية)</label>
              <input type="number" step="any" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">الحد الأدنى للمخزون (Min)</label>
              <input type="number" step="any" value={formData.minStock} onChange={e => setFormData({...formData, minStock: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">الحد الأعلى للمخزون (Max)</label>
              <input type="number" step="any" value={formData.maxStock} onChange={e => setFormData({...formData, maxStock: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
            <div className="md:col-span-3 lg:col-span-4 flex justify-end gap-3 mt-2">
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg text-sm">إلغاء</button>
              <button onClick={() => addProductMut.mutate()} disabled={!formData.name || !formData.categoryId || !formData.baseUomId} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-6 py-2 text-sm font-medium">حفظ الصنف</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-700/50 bg-slate-800/50 flex justify-between items-center">
          <h3 className="font-semibold text-slate-200">سجل الأصناف</h3>
        </div>
        <div className="p-4">
          {isLoadingProducts ? (
            <div className="text-center text-slate-500 py-8">جاري التحميل...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-right">
                    <th className="py-3 px-2 font-medium">كود الصنف</th>
                    <th className="py-3 px-2 font-medium">الاسم</th>
                    <th className="py-3 px-2 font-medium">الفئة</th>
                    <th className="py-3 px-2 font-medium text-center">النوع</th>
                    <th className="py-3 px-2 font-medium text-center">الوحدة الأساسية</th>
                    <th className="py-3 px-2 font-medium text-left">التكلفة الحالية</th>
                    <th className="py-3 px-2 font-medium text-center">الرصيد الكلي</th>
                  </tr>
                </thead>
                <tbody>
                  { }
                  {products?.map((p: any) => (
                    <tr key={p.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                      <td className="py-3 px-2 text-slate-400 font-mono">{p.code}</td>
                      <td className="py-3 px-2 font-medium text-slate-200">{p.name}</td>
                      <td className="py-3 px-2 text-slate-300">{p.category?.name || '-'}</td>
                      <td className="py-3 px-2 text-center text-slate-400">{p.type}</td>
                      <td className="py-3 px-2 text-center text-emerald-400 bg-emerald-500/10 rounded">{p.baseUom?.name || '-'}</td>
                      <td className="py-3 px-2 text-left font-mono text-slate-300">{Number(p.costPrice).toFixed(3)}</td>
                      <td className="py-3 px-2 text-center font-mono font-medium text-slate-200">{Number(p.stockOnHand).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
