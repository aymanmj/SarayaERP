import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/api/apiClient";
import PrintLayout from "@/components/print/PrintLayout";
import { formatDate } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface InventoryLine {
  id: number;
  product: { name: string; code: string };
  batchNumber: string | null;
  expiryDate: string | null;
  systemQty: number;
  physicalQty: number | null;
}

interface InventoryCount {
  id: number;
  date: string;
  status: string;
  type: string;
  warehouse: { name: string };
  assignedTo: { fullName: string } | null;
  notes: string | null;
  lines: InventoryLine[];
}

export default function InventoryCountPrintPage() {
  const { id } = useParams();
  const [count, setCount] = useState<InventoryCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchCount();
  }, [id]);

  const fetchCount = async () => {
    try {
      // We might need a specific endpoint for print if we want optimized data, 
      // but the details endpoint should suffice for now.
      // Assuming GET /inventory/counts/:id works and returns typical details structure.
      // We need to pass hospitalId if the backend requires it, or rely on defaults/context.
      // For print, we usually need the full details.
      // Let's try the standard get endpoint.
      // Note: The previous controller work showed `findOne` takes `id` and `@Query('hospitalId')`.
      // We'll assume hospitalId=1 or similar for now if auth context isn't fully setting it,
      // closely matching the DetailsPage logic.
      
      // const hospitalId = 1; // Removed hardcoded check
      const res = await apiClient.get(`/inventory/counts/${id}`);
      setCount(res.data);
    } catch (err) {
      console.error(err);
      setError("فشل تحميل بيانات الجرد");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !count) {
    return (
      <div className="flex h-screen items-center justify-center text-rose-500 font-bold">
        {error || "الجرد غير موجود"}
      </div>
    );
  }

  return (
    <PrintLayout
      title="قائمة جرد مخزني"
      subtitle={count.type === 'FULL' ? 'جرد شامل' : count.type === 'SPOT_CHECK' ? 'جرد مفاجئ' : 'جرد دوري'}
      documentId={count.id}
      footerNotes={count.notes || "يرجى تعبئة عمود الجرد الفعلي بدقة والتوقيع."}
    >
      <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
          <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">بيانات الجرد</div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">التاريخ:</span>
              <span className="font-bold text-slate-900">{formatDate(count.date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الحالة:</span>
              <span className="font-medium">{count.status}</span>
            </div>
             <div className="flex justify-between">
              <span className="text-slate-500">تم الإنشاء بواسطة:</span>
              <span className="font-medium">{count.assignedTo?.fullName || '-'}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
           <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">الموقع / المستودع</div>
           <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">المخزن:</span>
              <span className="font-bold text-slate-900 text-lg">{count.warehouse.name}</span>
            </div>
           </div>
        </div>
      </div>

      <div className="mb-8">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-800">
              <th className="py-2 text-right font-bold text-slate-900 w-12">#</th>
              <th className="py-2 text-right font-bold text-slate-900">كود الصنف</th>
              <th className="py-2 text-right font-bold text-slate-900">اسم الصنف</th>
              <th className="py-2 text-right font-bold text-slate-900">التشغيلة / الصلاحية</th>
              <th className="py-2 text-center font-bold text-slate-900 w-24 bg-slate-100">رصيد النظام</th>
              <th className="py-2 text-center font-bold text-slate-900 w-32 border-r border-slate-300 pr-4">العد الفعلي</th>
              <th className="py-2 text-right font-bold text-slate-900 w-32">ملاحظات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {count.lines.map((line, idx) => (
              <tr key={line.id}>
                <td className="py-3 text-right text-slate-500">{idx + 1}</td>
                <td className="py-3 text-right font-mono text-slate-600 font-bold">{line.product.code}</td>
                <td className="py-3 text-right font-medium text-slate-800">{line.product.name}</td>
                <td className="py-3 text-right text-xs">
                    {line.batchNumber && (
                        <div className="flex flex-col">
                            <span className="font-mono text-slate-600">BN: {line.batchNumber}</span>
                            {line.expiryDate && <span className="text-slate-400">Exp: {formatDate(line.expiryDate)}</span>}
                        </div>
                    )}
                </td>
                <td className="py-3 text-center font-mono font-bold bg-slate-50">{line.systemQty}</td>
                <td className="py-3 border-r border-slate-300">
                    {/* Empty box for writing */}
                    <div className="h-8 border-b border-slate-300 border-dashed w-full"></div>
                </td>
                 <td className="py-3">
                    <div className="h-8 border-b border-slate-200 w-full"></div>
                 </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-8 mt-16 text-center text-sm font-bold text-slate-900">
          <div className="pt-8 border-t border-slate-300">
              توقيع أمين المستودع
          </div>
          <div className="pt-8 border-t border-slate-300">
              توقيع لجنة الجرد
          </div>
          <div className="pt-8 border-t border-slate-300">
              توقيع المدير المالي / الاعتماد
          </div>
      </div>

    </PrintLayout>
  );
}
