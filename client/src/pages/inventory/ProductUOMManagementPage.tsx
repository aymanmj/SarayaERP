// src/pages/inventory/ProductUOMManagementPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../api/inventoryApi';
import { toast } from 'sonner';

const BoxIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22.08V12"/></svg>
);

const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
);

export function ProductUOMManagementPage() {
  const queryClient = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  
  // Form State
  const [uomId, setUomId] = useState('');
  const [conversionRate, setConversionRate] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ['products-uoms'],
    queryFn: inventoryApi.getProductsWithUoms,
  });

  const { data: uoms } = useQuery({
    queryKey: ['uoms'],
    queryFn: () => inventoryApi.getUOMs(),
  });

  const addUomMut = useMutation({
    mutationFn: () => inventoryApi.addProductUom(selectedProduct.id, {
      uomId: Number(uomId),
      conversionRate: Number(conversionRate),
      isPurchasingUOM: isPurchasing,
      isIssuingUOM: isIssuing
    }),
    onSuccess: () => {
      toast.success('تمت إضافة معامل التحويل بنجاح');
      queryClient.invalidateQueries({ queryKey: ['products-uoms'] });
      setUomId('');
      setConversionRate('');
      setIsPurchasing(false);
      setIsIssuing(false);
    },
    onError: () => toast.error('فشل في حفظ معامل التحويل'),
  });

  const removeUomMut = useMutation({
    mutationFn: (id: number) => inventoryApi.removeProductUom(selectedProduct.id, id),
    onSuccess: () => {
      toast.success('تم حذف معامل التحويل');
      queryClient.invalidateQueries({ queryKey: ['products-uoms'] });
    },
    onError: () => toast.error('فشل الحذف'),
  });

  // Derived selected product from latest query data
  const currentProduct = products?.find((p: any) => p.id === selectedProduct?.id) || null;

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <span className="p-2 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 rounded-xl text-sky-400">
            <BoxIcon />
          </span>
          إدارة الأصناف ومعاملات التحويل
        </h1>
        <p className="text-sm text-slate-500 mt-1">ضبط الوحدات المتعددة وعلاقات التحويل لكل صنف</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products List */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-slate-700/50 bg-slate-800/50">
            <h3 className="font-semibold text-slate-200">الأصناف</h3>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {loadingProducts ? (
              <div className="p-4 text-center text-slate-500">جاري التحميل...</div>
            ) : products?.map((product: any) => (
              <button
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className={`w-full text-right p-3 rounded-xl transition-all ${
                  selectedProduct?.id === product.id
                    ? 'bg-sky-500/10 border border-sky-500/30 text-sky-400'
                    : 'hover:bg-slate-700/30 text-slate-300 border border-transparent'
                }`}
              >
                <div className="font-medium text-sm">{product.name}</div>
                <div className="text-xs mt-1 font-mono opacity-70">
                  {product.code || 'بدون كود'} • الوحدة الأساسية: {product.baseUom?.name || '-'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Product UOMs Details */}
        <div className="lg:col-span-2">
          {currentProduct ? (
            <div className="space-y-6">
              {/* Info Card */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-xl font-bold text-slate-100 mb-2">{currentProduct.name}</h2>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-400">الكود: <span className="font-mono text-slate-200">{currentProduct.code}</span></span>
                  <span className="text-slate-400">الوحدة الصغرى (الأساسية): <span className="font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">{currentProduct.baseUom?.name || 'غير محدد'}</span></span>
                </div>
              </div>

              {/* Add New UOM Conversion */}
              <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-5">
                <h3 className="font-semibold text-sky-400 mb-4 flex items-center gap-2">
                  <LinkIcon /> إضافة وحدة تحويل جديدة
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">الوحدة</label>
                    <select
                      value={uomId}
                      onChange={e => setUomId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                    >
                      <option value="">-- اختر الوحدة --</option>
                      {uoms?.map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">معامل التحويل (تساوي كم من الوحدة الأساسية؟)</label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={conversionRate}
                      onChange={e => setConversionRate(e.target.value)}
                      placeholder="مثال: 10"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={isPurchasing} onChange={e => setIsPurchasing(e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500" />
                      وحدة شراء افتراضية
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={isIssuing} onChange={e => setIsIssuing(e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500" />
                      وحدة صرف افتراضية
                    </label>
                  </div>
                  <div>
                    <button
                      onClick={() => addUomMut.mutate()}
                      disabled={!uomId || !conversionRate || addUomMut.isPending}
                      className="w-full bg-sky-600 hover:bg-sky-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      حفظ التحويل
                    </button>
                  </div>
                </div>
              </div>

              {/* Current Conversions Table */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-700/50 bg-slate-800/50">
                  <h3 className="font-semibold text-slate-200">قائمة وحدات الصنف (المحولة)</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-900/50 text-slate-400">
                      <th className="py-3 px-4 text-right font-medium">الوحدة (UOM)</th>
                      <th className="py-3 px-4 text-right font-medium">المعادل بالوحدة الأساسية</th>
                      <th className="py-3 px-4 text-center font-medium">وحدة شراء؟</th>
                      <th className="py-3 px-4 text-center font-medium">وحدة صرف؟</th>
                      <th className="py-3 px-4 text-center font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentProduct.productUoms?.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          لا توجد وحدات محولة لهذا الصنف.
                        </td>
                      </tr>
                    ) : (
                      currentProduct.productUoms?.map((pu: any) => (
                        <tr key={pu.id} className="border-b border-slate-700/30 hover:bg-slate-700/10">
                          <td className="py-3 px-4 text-slate-200 font-medium">1 {pu.uom?.name}</td>
                          <td className="py-3 px-4 text-emerald-400 font-mono">
                            = {Number(pu.conversionRate)} {currentProduct.baseUom?.name}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {pu.isPurchasingUOM ? <span className="text-emerald-400">نعم</span> : <span className="text-slate-500">-</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {pu.isIssuingUOM ? <span className="text-emerald-400">نعم</span> : <span className="text-slate-500">-</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => { if(confirm('تأكيد الحذف؟')) removeUomMut.mutate(pu.uomId) }}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                            >
                              <TrashIcon />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[600px] border border-dashed border-slate-700/50 rounded-2xl bg-slate-800/10">
              <div className="text-center text-slate-500">
                <BoxIcon />
                <p className="mt-3 text-sm">قم باختيار صنف من القائمة الجانبية لإدارة وحداته</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
