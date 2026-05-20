import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryApi, MaterialRequestItem } from "@/api/inventoryApi";
import { apiClient } from "@/api/apiClient";

export function CreateMaterialRequestPage() {
  const navigate = useNavigate();
  const [requestingWarehouseId, setRequestingWarehouseId] = useState<string>("");
  const [fulfillingWarehouseId, setFulfillingWarehouseId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ productId: string; requestedQty: number; uomId?: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Load Warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const res = await inventoryApi.getWarehouses();
      return res;
    }
  });

  // Load Products (Simplistic implementation for demo - usually a paginated search or select)
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await apiClient.get('/inventory/products');
      return res.data;
    }
  });

  const addItem = () => {
    setItems([...items, { productId: "", requestedQty: 1 }]);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleItemChange = (index: number, field: string, value: string | number) => {
    const newItems = [...items];
    // @ts-ignore
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!requestingWarehouseId || !fulfillingWarehouseId) {
      toast.error("يرجى اختيار المستودع الطالب والمستودع المصرف");
      return;
    }

    if (requestingWarehouseId === fulfillingWarehouseId) {
      toast.error("لا يمكن أن يكون المستودع الطالب هو نفسه المستودع المصرف");
      return;
    }

    if (items.length === 0) {
      toast.error("يرجى إضافة صنف واحد على الأقل");
      return;
    }

    const invalidItems = items.some(i => !i.productId || i.requestedQty <= 0);
    if (invalidItems) {
      toast.error("يرجى التأكد من اختيار الصنف وتحديد كمية صحيحة لكل سطر");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        requestingWarehouseId: Number(requestingWarehouseId),
        fulfillingWarehouseId: Number(fulfillingWarehouseId),
        notes: notes || undefined,
        items: items.map(i => ({
          productId: Number(i.productId),
          requestedQty: Number(i.requestedQty),
          uomId: i.uomId ? Number(i.uomId) : undefined
        }))
      };

      const res = await inventoryApi.createMaterialRequest(payload);
      toast.success("تم إنشاء طلب المواد بنجاح");
      navigate(`/inventory/material-requests/${res.id}`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "حدث خطأ أثناء إنشاء الطلب");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-y-auto custom-scrollbar" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
               ➕
            </div>
            طلب مواد جديد
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            إنشاء طلب جديد لسحب مواد من المستودع الرئيسي أو مستودع آخر.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/inventory/material-requests")}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-bold transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-900/20 transition-all disabled:opacity-50"
          >
            {saving ? "جاري الحفظ..." : "حفظ الطلب"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-base font-bold text-slate-200 mb-6 border-b border-slate-800 pb-2">
              البيانات الأساسية
            </h2>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400">المستودع الطالب (طالب المواد) <span className="text-rose-400">*</span></label>
                <select
                  value={requestingWarehouseId}
                  onChange={(e) => setRequestingWarehouseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-amber-500 outline-none transition-all"
                >
                  <option value="">اختر المستودع...</option>
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400">المستودع المصرف (المصدر) <span className="text-rose-400">*</span></label>
                <select
                  value={fulfillingWarehouseId}
                  onChange={(e) => setFulfillingWarehouseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-amber-500 outline-none transition-all"
                >
                  <option value="">اختر المستودع...</option>
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <label className="text-xs font-bold text-slate-400">ملاحظات الطلب</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات إضافية للمستودع المصرف..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-amber-500 outline-none transition-all min-h-[100px] resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-slate-200">
                الأصناف المطلوبة
              </h2>
              <button
                type="button"
                onClick={addItem}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-bold border border-slate-700 transition-all flex items-center gap-1"
              >
                <span>+</span> إضافة صنف
              </button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-950/50">
                <p className="text-sm">لم يتم إضافة أي أصناف للطلب</p>
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-3 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all"
                >
                  إضافة الصنف الأول
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="text-[10px] uppercase text-slate-500 bg-slate-950/50">
                    <tr>
                      <th className="px-3 py-3 font-bold rounded-r-xl">الصنف</th>
                      <th className="px-3 py-3 font-bold w-32">الكمية</th>
                      <th className="px-3 py-3 font-bold w-40">الوحدة (UOM)</th>
                      <th className="px-3 py-3 font-bold w-16 text-center rounded-l-xl"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td className="px-2 py-3">
                          <select
                            value={item.productId}
                            onChange={(e) => handleItemChange(index, "productId", e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-2 text-xs focus:border-amber-500 outline-none"
                          >
                            <option value="">اختر الصنف...</option>
                            {products.map((p: any) => (
                              <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ''}{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-3">
                          <input
                            type="number"
                            min="1"
                            value={item.requestedQty}
                            onChange={(e) => handleItemChange(index, "requestedQty", e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-2 text-xs focus:border-amber-500 outline-none text-center"
                          />
                        </td>
                        <td className="px-2 py-3">
                           {/* Simplified for demo: ideally would load product-specific UOMs */}
                          <select
                            value={item.uomId || ""}
                            onChange={(e) => handleItemChange(index, "uomId", e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-2 text-xs focus:border-amber-500 outline-none"
                          >
                            <option value="">الوحدة الأساسية</option>
                            {/* Will be populated dynamically based on selected product in a real scenario */}
                          </select>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="حذف السطر"
                          >
                            ❌
                          </button>
                        </td>
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
