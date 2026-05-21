import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "../../../api/apiClient";
import { inventoryApi } from "../../../api/inventoryApi";

interface POItem {
  productId: string;
  uomId: string;
  quantity: number;
  unitPrice: number;
  productUoms: any[];
}

export function CreatePurchaseOrderPage() {
  const navigate = useNavigate();
  const [supplierId, setSupplierId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Load active suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await apiClient.get('/procurement/suppliers');
      return res.data;
    }
  });

  // Load products with their UOMs
  const { data: products = [] } = useQuery({
    queryKey: ['products-with-uoms'],
    queryFn: inventoryApi.getProductsWithUoms
  });

  const addItem = () => {
    setItems([...items, { productId: "", uomId: "", quantity: 1, unitPrice: 0, productUoms: [] }]);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleItemChange = (index: number, field: keyof POItem, value: any) => {
    const newItems = [...items];
    if (field === 'productId') {
      const selectedProduct = products.find((p: any) => p.id === Number(value));
      newItems[index].productId = value;
      newItems[index].unitPrice = selectedProduct ? Number(selectedProduct.costPrice || 0) : 0;
      newItems[index].productUoms = selectedProduct?.productUoms || [];
      
      // Auto select base UOM or first UOM
      if (selectedProduct?.baseUomId) {
        newItems[index].uomId = String(selectedProduct.baseUomId);
      } else if (selectedProduct?.productUoms?.length > 0) {
        newItems[index].uomId = String(selectedProduct.productUoms[0].uomId);
      } else {
        newItems[index].uomId = "";
      }
    } else {
      (newItems[index] as any)[field] = value;
    }
    setItems(newItems);
  };

  const calculateGrandTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supplierId) {
      toast.error("يرجى اختيار المورد");
      return;
    }

    if (items.length === 0) {
      toast.error("يرجى إضافة صنف واحد على الأقل");
      return;
    }

    const invalidItems = items.some(i => !i.productId || i.quantity <= 0 || !i.uomId || i.unitPrice < 0);
    if (invalidItems) {
      toast.error("يرجى التأكد من ملء جميع خانات الأصناف بشكل صحيح");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplierId: Number(supplierId),
        notes: notes || undefined,
        items: items.map(i => ({
          productId: Number(i.productId),
          uomId: Number(i.uomId),
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        }))
      };

      const res = await apiClient.post('/procurement/orders', payload);
      toast.success("تم إنشاء أمر الشراء المباشر بنجاح");
      navigate(`/purchases/orders/${res.data.id}`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "حدث خطأ أثناء إنشاء أمر الشراء");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 text-slate-100 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <span className="p-2 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            </span>
            أمر شراء مباشر جديد
          </h1>
          <p className="text-sm text-slate-400 mt-1">إنشاء أمر شراء جديد وإرساله للمورد مباشرة دون الحاجة لطلب شراء مسبق.</p>
        </div>
        <button
          onClick={() => navigate('/purchases/orders')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-all"
        >
          رجوع للقائمة
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Details Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                المورد <span className="text-rose-400">*</span>
              </label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all"
              >
                <option value="">-- اختر المورد --</option>
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.contactName || "لا يوجد جهة اتصال"})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">ملاحظات</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="تفاصيل إضافية أو شروط لأمر الشراء..."
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all resize-none"
              />
            </div>
          </div>
        </div>

        {/* Items Table Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
            <h3 className="font-semibold text-slate-200 text-sm">أصناف أمر الشراء</h3>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all shadow-lg shadow-blue-600/10"
            >
              + إضافة صنف
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-900/50 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-semibold w-1/3">اسم الصنف</th>
                  <th className="py-3 px-4 font-semibold">وحدة القياس</th>
                  <th className="py-3 px-4 font-semibold text-center w-24">الكمية</th>
                  <th className="py-3 px-4 font-semibold text-center w-32">سعر الوحدة</th>
                  <th className="py-3 px-4 font-semibold text-left w-32">الإجمالي</th>
                  <th className="py-3 px-4 text-center w-16">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      لا توجد أصناف مضافة حالياً. انقر على "إضافة صنف" للبدء.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/20">
                      <td className="py-3 px-4">
                        <select
                          required
                          value={item.productId}
                          onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-blue-500 outline-none"
                        >
                          <option value="">-- اختر الصنف --</option>
                          {products.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.code || "بدون كود"})</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          required
                          value={item.uomId}
                          onChange={(e) => handleItemChange(idx, 'uomId', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-blue-500 outline-none"
                        >
                          <option value="">-- الوحدة --</option>
                          {item.productUoms.map((pu: any) => (
                            <option key={pu.uomId} value={pu.uomId}>{pu.uom?.name || "وحدة"}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          required
                          min="1"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                          className="w-full text-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 focus:border-blue-500 outline-none font-mono"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          required
                          min="0"
                          step="any"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', Number(e.target.value))}
                          className="w-full text-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 focus:border-blue-500 outline-none font-mono"
                        />
                      </td>
                      <td className="py-3 px-4 font-mono text-left text-emerald-400 font-semibold">
                        {(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })} د.ل
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Grand Total Bar */}
          <div className="bg-slate-900/60 p-4 border-t border-slate-800 flex justify-between items-center text-sm font-semibold">
            <span className="text-slate-400">إجمالي قيمة أمر الشراء:</span>
            <span className="text-xl text-emerald-400 font-mono">{calculateGrandTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })} د.ل</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/purchases/orders')}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-all"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
          >
            {saving ? "جاري الحفظ..." : "حفظ وإرسال الأمر"}
          </button>
        </div>
      </form>
    </div>
  );
}
