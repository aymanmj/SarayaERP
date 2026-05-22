import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/apiClient";
import { inventoryApi, MaterialRequest } from "@/api/inventoryApi";

interface Props {
  request: MaterialRequest;
  onClose: () => void;
  onSuccess: () => void;
}

export function IssueStockModal({ request, onClose, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ productId: number; quantity: number; batchNumber?: string }[]>([]);

  // Fetch settings to know if we should enforce manual batch or auto-FEFO
  const { data: settings } = useQuery({
    queryKey: ['organizationSettings'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/organization');
      return res.data;
    }
  });

  const isAutoFefo = settings?.inventoryAutoFefoAllocation === true;

  useEffect(() => {
    if (request.items) {
      const initialItems = request.items
        .map(item => ({
          productId: item.productId,
          quantity: item.requestedQty - (item.issuedQty || 0),
          batchNumber: "",
        }))
        .filter(item => item.quantity > 0);
      setItems(initialItems);
    }
  }, [request]);

  const handleQuantityChange = (productId: number, val: string) => {
    setItems(prev => prev.map(item => 
      item.productId === productId ? { ...item, quantity: Number(val) } : item
    ));
  };

  const handleBatchChange = (productId: number, val: string) => {
    setItems(prev => prev.map(item => 
      item.productId === productId ? { ...item, batchNumber: val } : item
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payloadItems = items
        .filter(item => item.quantity > 0)
        .map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          batchNumber: item.batchNumber?.trim() || undefined
        }));

      await inventoryApi.issueMaterialRequest(request.id, {
        notes,
        items: payloadItems.length > 0 ? payloadItems : undefined
      });
      
      toast.success("تم صرف المواد بنجاح وإصدار شحنة جديدة");
      onSuccess();
     
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "حدث خطأ أثناء الصرف");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-sky-400">📤</span>
            إصدار شحنة (صرف مواد)
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            ✖
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          <div className="bg-sky-900/10 border border-sky-800/30 rounded-xl p-4">
            <p className="text-sm text-sky-200">
              أنت تقوم بصرف مواد من المستودع <strong>{request.fulfillingWarehouse?.name}</strong> للطلب رقم <strong>{request.requestNumber}</strong>.
            </p>
            {isAutoFefo && (
              <p className="text-xs text-emerald-400 mt-2 font-bold">
                ✓ التخصيص التلقائي (FEFO) مُفعل. سيقوم النظام باختيار التشغيلات (Batches) تلقائياً الأقرب لانتهاء الصلاحية إذا لم تحدد تشغيلة معينة.
              </p>
            )}
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/50">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-bold">الصنف</th>
                  <th className="px-4 py-3 font-bold text-center">المطلوب المتبقي</th>
                  <th className="px-4 py-3 font-bold">الكمية للصرف</th>
                  {!isAutoFefo && <th className="px-4 py-3 font-bold">رقم التشغيلة (Batch)</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-300">
                {request.items?.filter(item => (item.requestedQty - (item.issuedQty || 0)) > 0).map(reqItem => {
                  const stateItem = items.find(i => i.productId === reqItem.productId);
                  const remaining = reqItem.requestedQty - (reqItem.issuedQty || 0);

                  return (
                    <tr key={reqItem.id}>
                      <td className="px-4 py-3 font-bold">{reqItem.product?.name}</td>
                      <td className="px-4 py-3 text-center font-mono text-amber-400 font-bold">{remaining}</td>
                      <td className="px-4 py-3 w-40">
                        <input 
                          type="number"
                          min="0"
                          max={remaining}
                          value={stateItem?.quantity || 0}
                          onChange={(e) => handleQuantityChange(reqItem.productId, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 focus:border-sky-500 outline-none font-mono text-center"
                        />
                      </td>
                      {!isAutoFefo && (
                        <td className="px-4 py-3 w-48">
                           <input 
                              type="text"
                              placeholder="أدخل التشغيلة..."
                              value={stateItem?.batchNumber || ''}
                              onChange={(e) => handleBatchChange(reqItem.productId, e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 focus:border-sky-500 outline-none font-mono text-xs"
                            />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2">
             <label className="text-xs font-bold text-slate-400">ملاحظات الإصدار</label>
             <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات مع الشحنة..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-sky-500 outline-none resize-none h-24"
             />
          </div>
        </div>

        <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-bold transition-colors"
          >
            إلغاء
          </button>
          <button 
            type="button" 
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-900/20 transition-all disabled:opacity-50"
          >
            {submitting ? 'جاري الصرف...' : 'تأكيد الصرف'}
          </button>
        </div>
      </div>
    </div>
  );
}
