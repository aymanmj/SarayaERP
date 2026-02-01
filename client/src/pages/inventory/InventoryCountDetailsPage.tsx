import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { apiClient as api } from "@/api/apiClient";
import { toast } from "sonner";
import { Loader2, Save, CheckCircle, ArrowLeft, Printer, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

interface InventoryLine {
  id: number;
  productId: number;
  product: { name: string; code: string };
  batchNumber: string;
  expiryDate: string;
  systemQty: number;
  physicalQty: number;
  variance: number;
  costPrice: number;
}

interface InventoryCount {
  id: number;
  date: string;
  status: string; // DRAFT, IN_PROGRESS, REVIEW, POSTED
  type: string;
  warehouseId: number;
  warehouse: { name: string };
  lines: InventoryLine[];
  notes?: string;
  assignedTo?: { fullName: string };
}

export function InventoryCountDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = id === "new";

  const [count, setCount] = useState<InventoryCount | null>(null);
  const [saving, setSaving] = useState(false);

  // New Count State
  const [newCountParams, setNewCountParams] = useState({
    warehouseId: "", 
    type: "FULL",
    notes: "",
  });

  // 1. Fetch Warehouses
  const { data: warehouses = [] } = useQuery({
     queryKey: ['warehouses', user?.hospitalId],
     queryFn: async () => {
         const res = await api.get('/inventory/warehouses');
         return res.data;
     },
     enabled: !!user?.hospitalId
  });

  // Set default warehouse for new count
  useEffect(() => {
     if(isNew && warehouses.length > 0 && !newCountParams.warehouseId) {
         setNewCountParams(prev => ({...prev, warehouseId: warehouses[0].id.toString()}));
     }
  }, [warehouses, isNew, newCountParams.warehouseId]);

  // 2. Fetch Count Details (if not new)
  const { data: fetchedCount, isLoading: loading, refetch: refetchCount } = useQuery({
      queryKey: ['inventoryCount', id],
      queryFn: async () => {
           const hospitalId = user?.hospitalId || 1;
           const res = await api.get(`/inventory/counts/${id}?hospitalId=${hospitalId}`);
           return res.data;
      },
      enabled: !isNew && !!id
  });

  // Sync fetched data to local state for editing (Since we edit physicalQty locally)
  useEffect(() => {
      if(fetchedCount) {
          setCount(fetchedCount);
      }
  }, [fetchedCount]);

  // Alias for manual refresh if needed
  const fetchCount = () => refetchCount();

  const handleCreate = async () => {
    if (!newCountParams.warehouseId) {
        toast.error("يرجى اختيار المخزن");
        return;
    }

    setSaving(true);
    try {
      const hospitalId = user?.hospitalId || 1;
      const payload = {
        hospitalId: Number(hospitalId),
        warehouseId: Number(newCountParams.warehouseId),
        type: newCountParams.type,
        notes: newCountParams.notes,
      };
      
      const res = await api.post("/inventory/counts", payload);
      toast.success("تم إنشاء مسودة الجرد بنجاح");
      navigate(`/inventory/counts/${res.data.id}`);
    } catch (error) {
      toast.error("فشل إنشاء الجرد (تأكد من صحة البيانات)");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLine = async (lineId: number, qty: number) => {
    // Optimistic Update
    setCount((prev) => {
        if (!prev) return null;
        return {
            ...prev,
            lines: prev.lines.map(l => {
                if (l.id === lineId) {
                    const diff = qty - Number(l.systemQty);
                    return { ...l, physicalQty: qty, variance: diff };
                }
                return l;
            })
        }
    });

    try {
        await api.put(`/inventory/counts/lines/${lineId}`, { physicalQty: qty });
    } catch (error) {
        toast.error("فشل تحديث الصنف");
    }
  };

  const handlePost = async () => {
    if (!count) return;
    if (!confirm("هل أنت متأكد من اعتماد هذا الجرد وتحديث الأرصدة؟ لا يمكن التراجع عن هذه العملية.")) return;

    setSaving(true);
    try {
      await api.post(`/inventory/counts/${count.id}/post`);
      toast.success("تم ترحيل الجرد وتحديث المخزون!");
      fetchCount(); // Refresh without args
    } catch (error) {
      toast.error("فشل ترحيل الجرد");
    } finally {
      setSaving(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case "POSTED": return "مرحل";
      case "DRAFT": return "مسودة";
      case "REVIEW": return "مراجعة";
      case "IN_PROGRESS": return "قيد التنفيذ";
      default: return status;
    }
  };

  if (loading) {
      return (
          <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
      );
  }

  if (isNew) {
    return (
      <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-8 max-w-4xl mx-auto" dir="rtl">
        <div className="flex items-center gap-4">
             <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                 <ArrowLeft className="w-6 h-6" />
             </button>
             <div>
                <h1 className="text-3xl font-black text-white tracking-tight">بدء جرد مخزني جديد</h1>
                <p className="text-sm text-slate-400 mt-1">قم بتحديد المخزن ونوع الجرد للبدء في المطابقة الفعلية للأرصدة.</p>
             </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-300">المخزن <span className="text-rose-500">*</span></label>
                    <div className="relative">
                        <select
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all appearance-none"
                            value={newCountParams.warehouseId}
                            onChange={(e) => setNewCountParams(prev => ({ ...prev, warehouseId: e.target.value }))}
                        >
                            <option value="" disabled>اختر المخزن...</option>
                            {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </select>
                         <div className="absolute left-3 top-3.5 pointer-events-none text-slate-500">
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                         </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-300">نوع الجرد <span className="text-rose-500">*</span></label>
                    <div className="relative">
                        <select
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all appearance-none"
                            value={newCountParams.type}
                            onChange={(e) => setNewCountParams(prev => ({ ...prev, type: e.target.value }))}
                        >
                            <option value="FULL">جرد شامل</option>
                            <option value="QUARTERLY">جرد ربع سنوي</option>
                            <option value="SPOT_CHECK">جرد مفاجئ</option>
                        </select>
                         <div className="absolute left-3 top-3.5 pointer-events-none text-slate-500">
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                         </div>
                    </div>
                </div>
            </div>

            <div className="space-y-3 mb-8">
                <label className="text-sm font-medium text-slate-300">ملاحظات / وصف</label>
                <textarea 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all min-h-[100px]"
                    placeholder="اكتب أي ملاحظات إضافية هنا..."
                    value={newCountParams.notes}
                    onChange={(e) => setNewCountParams(prev => ({ ...prev, notes: e.target.value }))}
                />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/50">
                <button
                    onClick={() => navigate(-1)}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-bold border border-slate-700 transition-all"
                >
                    إلغاء
                </button>
                <button
                    onClick={handleCreate}
                    disabled={saving}
                    className="px-8 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-900/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    إنشاء وبدء الجرد
                </button>
            </div>
        </div>
      </div>
    );
  }

  if (!count) return <div className="p-10 text-center text-slate-500">لم يتم العثور على الجرد</div>;

  const isEditable = count.status !== "POSTED";

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
            <button onClick={() => navigate('/inventory/counts')} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                 <ArrowLeft className="w-6 h-6" />
             </button>
            <div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                    جرد #{count.id}
                    <span className={`px-3 py-1 rounded-full text-[10px] md:text-xs font-bold border uppercase tracking-wider ${
                        count.status === "POSTED" 
                        ? "bg-emerald-900/30 text-emerald-400 border-emerald-500/30" 
                        : "bg-amber-900/20 text-amber-400 border-amber-500/30"
                    }`}>
                        {getStatusLabel(count.status)}
                    </span>
                </h1>
                <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                    <span className="text-sky-400 font-medium">{count.warehouse?.name}</span>
                    <span className="text-slate-600">•</span>
                    <span>{formatDate(count.date)}</span>
                    {count.assignedTo && (
                        <>
                            <span className="text-slate-600">•</span>
                            <span className="flex items-center gap-1">
                                بواسطة {count.assignedTo.fullName}
                            </span>
                        </>
                    )}
                </p>
            </div>
        </div>

        <div className="flex gap-3">
            <button 
                onClick={() => window.open(`/inventory/counts/${count.id}/print`, '_blank')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center gap-2"
            >
                <Printer className="w-4 h-4" /> طباعة القائمة
            </button>
           {isEditable && (
             <button
                onClick={handlePost}
                disabled={saving}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2 disabled:opacity-50"
             >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                اعتماد وترحيل الفروقات
             </button>
           )}
        </div>
      </div>

      {/* Warning Box for Review */}
      {count.lines.some(l => Number(l.variance) !== 0) && isEditable && (
          <div className="bg-amber-900/10 border border-amber-500/20 p-4 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                  <h4 className="font-bold text-amber-400 text-sm">تنبيه وجود فروقات</h4>
                  <p className="text-xs text-amber-200/70 mt-1">يوجد فروقات بين الرصيد النظامي والجرد الفعلي للأصناف. عند الاعتماد، سيقوم النظام بإنشاء حركة تسوية مخزنية وتوليد القيد المحاسبي للفارق تلقائياً.</p>
              </div>
          </div>
      )}

      {/* Main Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
              <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4 font-bold w-[30%]">الصنف</th>
                <th className="px-6 py-4 font-bold">التشغيلة / الصلاحية</th>
                <th className="px-6 py-4 font-bold text-center">رصيد النظام</th>
                <th className="px-6 py-4 font-bold text-center w-32">الجرد الفعلي</th>
                <th className="px-6 py-4 font-bold text-center">الفارق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
                {count.lines?.map((line) => (
                    <tr key={line.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                            <div className="font-bold text-slate-200 text-sm mb-1">{line.product?.name}</div>
                            <div className="text-[10px] font-mono text-slate-500 bg-slate-950/50 px-2 py-0.5 rounded w-fit">{line.product?.code}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-400">
                            {line.batchNumber ? (
                                <div className="flex flex-col gap-1">
                                    <span className="text-slate-300 font-mono text-[11px]">BN: {line.batchNumber}</span>
                                    {line.expiryDate && <span className="text-[10px] text-slate-500">Exp: {formatDate(line.expiryDate)}</span>}
                                </div>
                            ) : (
                                <span className="opacity-30">-</span>
                            )}
                        </td>
                        <td className="px-6 py-4 text-center font-mono text-slate-300 font-medium text-sm">
                            {Number(line.systemQty).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-center">
                            {isEditable ? (
                                <input
                                    type="number"
                                    className={`w-24 bg-slate-950 border rounded-lg px-2 py-1.5 text-center font-bold text-sm outline-none transition-all focus:ring-2 focus:ring-sky-500/50
                                        ${Number(line.physicalQty) !== Number(line.systemQty) 
                                            ? "border-amber-500/50 text-amber-400 bg-amber-900/10" 
                                            : "border-slate-700 text-white focus:border-sky-500"}`}
                                    value={line.physicalQty}
                                    onChange={(e) => handleUpdateLine(line.id, parseFloat(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                />
                            ) : (
                                <span className="font-bold text-white text-sm">{Number(line.physicalQty).toFixed(2)}</span>
                            )}
                        </td>
                        <td className="px-6 py-4 text-center">
                            <span className={`px-3 py-1 rounded-lg font-bold font-mono text-xs block w-fit mx-auto ${
                                Number(line.variance) < 0 
                                    ? "bg-rose-900/20 text-rose-400 border border-rose-500/20" 
                                    : Number(line.variance) > 0 
                                        ? "bg-emerald-900/20 text-emerald-400 border border-emerald-500/20" 
                                        : "text-slate-600 opacity-50"
                            }`}>
                                {Number(line.variance) > 0 ? "+" : ""}{Number(line.variance).toFixed(2)}
                            </span>
                        </td>
                    </tr>
                ))}
                {count.lines?.length === 0 && (
                     <tr>
                        <td colSpan={5} className="text-center py-20 text-slate-500">
                          لا توجد أصناف في هذا الجرد.
                        </td>
                      </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

