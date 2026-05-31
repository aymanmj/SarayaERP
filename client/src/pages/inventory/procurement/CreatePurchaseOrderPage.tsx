import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

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
      toast.error(t("inventory.purchaseOrder.create.toast.selectSupplier", "يرجى اختيار المورد"));
      return;
    }

    if (items.length === 0) {
      toast.error(t("inventory.materialRequest.create.toast.noItems", "يرجى إضافة صنف واحد على الأقل"));
      return;
    }

    const invalidItems = items.some(i => !i.productId || i.quantity <= 0 || !i.uomId || i.unitPrice < 0);
    if (invalidItems) {
      toast.error(t("inventory.purchaseOrder.create.toast.invalidItems", "يرجى التأكد من ملء جميع خانات الأصناف بشكل صحيح"));
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
      toast.success(t("inventory.purchaseOrder.create.toast.success", "تم إنشاء أمر الشراء المباشر بنجاح"));
      navigate(`/purchases/orders/${res.data.id}`);
     
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || t("inventory.purchaseOrder.create.toast.error", "حدث خطأ أثناء إنشاء أمر الشراء"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 text-slate-100 max-w-6xl mx-auto" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <span className="p-2 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-xl text-blue-400">
               🛒
            </span>
            {t("inventory.purchaseOrder.create.title", "أمر شراء مباشر جديد")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t("inventory.purchaseOrder.create.subtitle", "إنشاء أمر شراء جديد وإرساله للمورد مباشرة دون الحاجة لطلب شراء مسبق.")}</p>
        </div>
        <button
          onClick={() => navigate('/purchases/orders')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-all"
        >
          {t("inventory.purchaseOrder.create.backBtn", "رجوع للقائمة")}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Details Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">
                {t("inventory.purchaseOrder.create.supplier", "المورد")} <span className="text-rose-400">*</span>
              </label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all"
              >
                <option value="">{t("inventory.purchaseOrder.create.selectSupplier", "-- اختر المورد --")}</option>
                { }
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.contactName || t("inventory.purchaseOrder.create.noContact", "لا يوجد جهة اتصال")})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">{t("inventory.purchaseOrder.create.notesLabel", "ملاحظات")}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("inventory.purchaseOrder.create.notesPlaceholder", "تفاصيل إضافية أو شروط لأمر الشراء...")}
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none transition-all resize-none"
              />
            </div>
          </div>
        </div>

        {/* Items Table Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
            <h3 className="font-semibold text-slate-200 text-sm">{t("inventory.purchaseOrder.create.poItems", "أصناف أمر الشراء")}</h3>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all shadow-lg shadow-blue-600/10"
            >
              + {t("inventory.purchaseOrder.create.addItemBtn", "إضافة صنف")}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className={`w-full text-sm ${isRtl ? "text-right" : "text-left"}`}>
              <thead className="bg-slate-900/50 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-semibold w-1/3">{t("inventory.purchaseOrder.create.tableName", "اسم الصنف")}</th>
                  <th className="py-3 px-4 font-semibold">{t("inventory.purchaseOrder.create.uomLabel", "وحدة القياس")}</th>
                  <th className="py-3 px-4 font-semibold text-center w-24">{t("inventory.warehouse.tableQuantity", "الكمية")}</th>
                  <th className="py-3 px-4 font-semibold text-center w-32">{t("inventory.purchaseOrder.create.unitPriceLabel", "سعر الوحدة")}</th>
                  <th className={`py-3 px-4 font-semibold w-32 ${isRtl ? "text-left" : "text-right"}`}>{t("inventory.purchaseOrder.create.totalLabel", "الإجمالي")}</th>
                  <th className="py-3 px-4 text-center w-16">{t("inventory.purchaseOrder.create.actionLabel", "إجراء")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      {t("inventory.purchaseOrder.create.emptyItems", "لا توجد أصناف مضافة حالياً. انقر على \"إضافة صنف\" للبدء.")}
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
                          <option value="">{t("inventory.purchaseOrder.create.selectProduct", "-- اختر الصنف --")}</option>
                          { }
                          {products.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.code || t("inventory.purchaseOrder.create.noCode", "بدون كود")})</option>
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
                          <option value="">{t("inventory.purchaseOrder.create.selectUom", "-- الوحدة --")}</option>
                          { }
                          {item.productUoms.map((pu: any) => (
                            <option key={pu.uomId} value={pu.uomId}>{pu.uom?.name || t("inventory.purchaseOrder.create.unit", "وحدة")}</option>
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
                      <td className={`py-3 px-4 font-mono text-emerald-400 font-semibold ${isRtl ? "text-left" : "text-right"}`}>
                        {(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })} {t("inventory.currencyDinar", "د.ل")}
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
            <span className="text-slate-400">{t("inventory.purchaseOrder.create.grandTotalLabel", "إجمالي قيمة أمر الشراء:")}</span>
            <span className="text-xl text-emerald-400 font-mono">{calculateGrandTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })} {t("inventory.currencyDinar", "د.ل")}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/purchases/orders')}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-all"
          >
            {t("common.cancel", "إلغاء")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
          >
            {saving ? t("common.saving", "جاري الحفظ...") : t("inventory.purchaseOrder.create.submitBtn", "حفظ وإرسال الأمر")}
          </button>
        </div>
      </form>
    </div>
  );
}
