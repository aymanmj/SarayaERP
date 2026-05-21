import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { procurementApi } from "@/api/procurementApi";
import { apiClient } from "@/api/apiClient";
import { inventoryApi } from "@/api/inventoryApi";

export function CreateGoodsReceiptPage() {
  const navigate = useNavigate();
  const [poId, setPoId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ productId: string; quantity: number; uomId?: string; batchNumber: string; expiryDate: string; productUoms: any[] }[]>([]);
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

  // In a real scenario, selecting a PO would auto-populate items. Here we just have an input for demo.
  // const { data: purchaseOrders } = useQuery(...)

  const addItem = () => {
    setItems([...items, { productId: "", quantity: 1, batchNumber: "", expiryDate: "", productUoms: [] }]);
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

    // Load UOMs if product changes
    if (field === 'productId') {
      const selectedProduct = products.find((p: any) => p.id === Number(value));
      if (selectedProduct) {
        newItems[index].productUoms = selectedProduct.productUoms || [];
        // Auto select base UOM or first UOM
        if (selectedProduct.baseUomId) {
          newItems[index].uomId = String(selectedProduct.baseUomId);
        } else if (selectedProduct.productUoms?.length > 0) {
          newItems[index].uomId = String(selectedProduct.productUoms[0].uomId);
        } else {
          newItems[index].uomId = "";
        }
      }
    }
    
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!poId || !warehouseId) {
      toast.error("يرجى التأكد من رقم أمر الشراء واختيار المستودع المستلم");
      return;
    }

    if (items.length === 0) {
      toast.error("يرجى إضافة صنف واحد على الأقل للاستلام");
      return;
    }

    const invalidItems = items.some(i => !i.productId || i.quantity <= 0 || !i.uomId || !i.batchNumber || !i.expiryDate);
    if (invalidItems) {
      toast.error("يرجى التأكد من اختيار الصنف، الوحدة، الكمية، رقم التشغيلة، وتاريخ الصلاحية لكل سطر");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        poId: Number(poId),
        warehouseId: Number(warehouseId),
        notes: notes || undefined,
        items: items.map(i => ({
          productId: Number(i.productId),
          quantity: Number(i.quantity),
          uomId: Number(i.uomId),
          batchNumber: i.batchNumber,
          expiryDate: new Date(i.expiryDate).toISOString()
        }))
      };

      await procurementApi.createGRN(payload);
      toast.success("تم استلام البضاعة وإدخالها المخزن بنجاح (GRN)");
      navigate(`/inventory/dashboard`); 
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "حدث خطأ أثناء الاستلام");
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
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
               📦
            </div>
            استلام بضاعة (Goods Receipt Note)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            إدخال المواد المستلمة بناءً على أمر شراء مسبق والتأثير المباشر على المخزون والمحاسبة.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/inventory/dashboard")}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-bold transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50"
          >
            {saving ? "جاري الحفظ..." : "تأكيد الاستلام"}
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
                <label className="text-xs font-bold text-slate-400">أمر الشراء المرتبط (PO) <span className="text-rose-400">*</span></label>
                <input
                  type="number"
                  value={poId}
                  onChange={(e) => setPoId(e.target.value)}
                  placeholder="رقم أو معرف الـ PO..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400">المستودع المستلم <span className="text-rose-400">*</span></label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-blue-500 outline-none transition-all"
                >
                  <option value="">اختر المستودع...</option>
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <label className="text-xs font-bold text-slate-400">ملاحظات الاستلام</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات حول حالة البضاعة أو النواقص..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm focus:border-blue-500 outline-none transition-all min-h-[100px] resize-none"
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
                الأصناف المستلمة
              </h2>
              <button
                type="button"
                onClick={addItem}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg text-xs font-bold border border-slate-700 transition-all flex items-center gap-1"
              >
                <span>+</span> إضافة صنف
              </button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-950/50">
                <p className="text-sm">لم يتم إضافة أي أصناف للاستلام</p>
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
                      <th className="px-3 py-3 font-bold rounded-r-xl w-48">الصنف</th>
                      <th className="px-3 py-3 font-bold w-24">الكمية</th>
                      <th className="px-3 py-3 font-bold w-32">الوحدة</th>
                      <th className="px-3 py-3 font-bold w-32">رقم التشغيلة (Batch)</th>
                      <th className="px-3 py-3 font-bold w-40">تاريخ الصلاحية</th>
                      <th className="px-3 py-3 font-bold w-12 text-center rounded-l-xl"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td className="px-2 py-3">
                          <select
                            value={item.productId}
                            onChange={(e) => handleItemChange(index, "productId", e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-2 text-xs focus:border-blue-500 outline-none"
                          >
                            <option value="">الصنف...</option>
                            {products.map((p: any) => (
                              <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ''}{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-3">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-2 text-xs focus:border-blue-500 outline-none text-center"
                          />
                        </td>
                        <td className="px-2 py-3">
                          <select
                            value={item.uomId || ""}
                            onChange={(e) => handleItemChange(index, "uomId", e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-2 text-xs focus:border-blue-500 outline-none"
                            disabled={!item.productId}
                          >
                            <option value="">الوحدة...</option>
                            {item.productUoms?.map((pu: any) => (
                              <option key={pu.id} value={pu.uomId}>
                                {pu.uom?.name || `وحدة #${pu.uomId}`} (معامل {pu.conversionRate})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-3">
                          <input
                            type="text"
                            value={item.batchNumber}
                            onChange={(e) => handleItemChange(index, "batchNumber", e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-2 text-xs focus:border-blue-500 outline-none text-center"
                            placeholder="مثال: BT-123"
                          />
                        </td>
                        <td className="px-2 py-3">
                          <input
                            type="date"
                            value={item.expiryDate}
                            onChange={(e) => handleItemChange(index, "expiryDate", e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 px-2 text-xs focus:border-blue-500 outline-none text-center"
                          />
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
