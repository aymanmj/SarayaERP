// src/pages/inventory/master-data/ItemCategoriesManagementPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient as api } from '../../../api/apiClient';

const BoxIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22.08V12"/></svg>
);

export function ItemCategoriesManagementPage() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    valuationMethod: 'WEIGHTED_AVERAGE',
    inventoryAccountId: '',
    expenseAccountId: '',
    parentId: ''
  });

  const { data: categories, isLoading } = useQuery({
    queryKey: ['item-categories'],
    queryFn: async () => {
      const res = await api.get('/inventory/master-data/categories');
      return res.data;
    }
  });

  const { data: accounts } = useQuery({
    queryKey: ['financial-accounts-for-inventory'],
    queryFn: async () => {
      const res = await api.get('/accounting/accounts');
      return res.data;
    }
  });

  const addCategoryMut = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formData,
        inventoryAccountId: formData.inventoryAccountId ? Number(formData.inventoryAccountId) : null,
        expenseAccountId: formData.expenseAccountId ? Number(formData.expenseAccountId) : null,
        parentId: formData.parentId ? Number(formData.parentId) : null
      };
      return api.post('/inventory/master-data/categories', payload);
    },
    onSuccess: () => {
      toast.success('تمت إضافة الفئة بنجاح');
      queryClient.invalidateQueries({ queryKey: ['item-categories'] });
      setFormData({ name: '', code: '', valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountId: '', expenseAccountId: '', parentId: '' });
    },
    onError: () => toast.error('فشل في حفظ الفئة')
  });

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <span className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl text-indigo-400">
            <BoxIcon />
          </span>
          إدارة فئات الأصناف (Item Categories)
        </h1>
        <p className="text-sm text-slate-500 mt-1">ضبط فئات المخزون وطرق التقييم المحاسبية (Valuation Methods)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-200 mb-4">إضافة فئة جديدة</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">اسم الفئة</label>
              <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" placeholder="مثال: أدوية، مستهلكات" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">كود الفئة</label>
              <input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">الفئة الأب</label>
              <select value={formData.parentId} onChange={e => setFormData({...formData, parentId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                <option value="">-- فئة رئيسية --</option>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <hr className="border-slate-700 my-2" />
            <div>
              <label className="block text-xs text-indigo-400 font-medium mb-1">طريقة تقييم المخزون</label>
              <select value={formData.valuationMethod} onChange={e => setFormData({...formData, valuationMethod: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                <option value="WEIGHTED_AVERAGE">المتوسط المرجح (Weighted Average)</option>
                <option value="FIFO">الوارد أولاً يصرف أولاً (FIFO)</option>
                <option value="LIFO">الوارد أخيراً يصرف أولاً (LIFO)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">حساب المخزون (Asset Account)</label>
              <select value={formData.inventoryAccountId} onChange={e => setFormData({...formData, inventoryAccountId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                <option value="">-- اختر حساب المخزون --</option>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {accounts?.filter((a: any) => a.type === 'ASSET').map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">حساب التكلفة / المصروف (Expense Account)</label>
              <select value={formData.expenseAccountId} onChange={e => setFormData({...formData, expenseAccountId: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                <option value="">-- اختر حساب التكلفة --</option>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {accounts?.filter((a: any) => a.type === 'EXPENSE').map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <button
              onClick={() => addCategoryMut.mutate()}
              disabled={!formData.name || addCategoryMut.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              حفظ الفئة
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-800/30 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-700/50 bg-slate-800/50">
            <h3 className="font-semibold text-slate-200">الفئات الحالية</h3>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="text-center text-slate-500 py-8">جاري التحميل...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-right">
                      <th className="py-3 px-2 font-medium">الاسم</th>
                      <th className="py-3 px-2 font-medium">الكود</th>
                      <th className="py-3 px-2 font-medium">طريقة التقييم</th>
                      <th className="py-3 px-2 font-medium">حساب المخزون</th>
                      <th className="py-3 px-2 font-medium">حساب التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {categories?.map((cat: any) => (
                      <tr key={cat.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                        <td className="py-3 px-2 font-medium text-slate-200">{cat.name}</td>
                        <td className="py-3 px-2 text-slate-400 font-mono">{cat.code || '-'}</td>
                        <td className="py-3 px-2 text-indigo-400">{cat.valuationMethod}</td>
                        <td className="py-3 px-2 text-slate-400">{cat.inventoryAccount?.name || '-'}</td>
                        <td className="py-3 px-2 text-slate-400">{cat.expenseAccount?.name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
