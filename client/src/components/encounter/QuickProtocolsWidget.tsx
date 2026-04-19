import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { apiClient } from "../../api/apiClient";

export default function QuickProtocolsWidget({
  encounterId,
}: {
  encounterId: number;
}) {
  const [orderSets, setOrderSets] = useState<any[]>([]);
  const [pathways, setPathways] = useState<any[]>([]);
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [enrollingId, setEnrollingId] = useState<number | null>(null);

  useEffect(() => {
    apiClient.get("/order-sets").then((response) => setOrderSets(response.data)).catch(() => {});
    apiClient
      .get("/clinical-pathways")
      .then((response) => setPathways(response.data))
      .catch(() => {});
  }, []);

  const executeOrderSet = async (setId: number, name: string) => {
    if (!confirm(`تأكيد تنفيذ بروتوكول "${name}" بجميع طلباته السريرية لهذه الحالة؟`)) {
      return;
    }

    setExecutingId(setId);
    try {
      await apiClient.post(`/order-sets/${setId}/execute`, { encounterId });
      toast.success("تم الاعتماد وإرسال الطلبات بنجاح");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "تعذر تنفيذ البروتوكول");
    } finally {
      setExecutingId(null);
    }
  };

  const enrollPathway = async (pathwayId: number, name: string) => {
    if (!confirm(`تأكيد إدراج الحالة في المسار العلاجي "${name}"؟`)) {
      return;
    }

    setEnrollingId(pathwayId);
    try {
      await apiClient.post(`/clinical-pathways/${pathwayId}/enroll`, { encounterId });
      toast.success("تم إدراج المريض وبدء المسار العلاجي");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "تعذر الإدراج في المسار");
    } finally {
      setEnrollingId(null);
    }
  };

  if (orderSets.length === 0 && pathways.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-900/80 border border-sky-900/40 p-4 rounded-2xl shadow-[0_0_30px_-5px_rgba(14,165,233,0.15)] relative overflow-hidden mt-4">
      <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl -mx-10 -my-10 pointer-events-none" />

      {orderSets.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-black text-sky-400 mb-3 border-b border-slate-800 pb-2 flex items-center gap-1.5 relative z-10">
            ⚡ أوامر المجموعات (Order Sets)
          </h3>
          <div className="space-y-2 relative z-10 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {orderSets.map((orderSet) => (
              <button
                key={orderSet.id}
                onClick={() => executeOrderSet(orderSet.id, orderSet.nameAr || orderSet.name)}
                disabled={executingId !== null || enrollingId !== null}
                className="w-full relative group bg-slate-950 border border-slate-800 hover:border-sky-500/50 p-3 rounded-xl transition-all text-right disabled:opacity-50"
              >
                <div className="flex justify-between items-center mb-1 gap-3">
                  <div className="text-xs font-bold text-slate-200">
                    {orderSet.nameAr || orderSet.name}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-400">
                    {orderSet.category || "عام"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate max-w-[85%]">
                  {orderSet.description || "تنفيذ الإجراءات المرفقة تلقائيًا"}
                </div>

                <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {executingId === orderSet.id ? <span className="animate-pulse">⏳</span> : "🚀"}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {pathways.length > 0 && (
        <div>
          <h3 className="text-xs font-black text-pink-400 mb-3 border-b border-slate-800 pb-2 flex items-center gap-1.5 relative z-10">
            🛤️ مسارات العلاج (Pathways)
          </h3>
          <div className="space-y-2 relative z-10 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {pathways.map((pathway) => (
              <button
                key={pathway.id}
                onClick={() => enrollPathway(pathway.id, pathway.nameAr || pathway.name)}
                disabled={executingId !== null || enrollingId !== null}
                className="w-full relative group bg-slate-950 border border-slate-800 hover:border-pink-500/50 p-3 rounded-xl transition-all text-right disabled:opacity-50"
              >
                <div className="flex justify-between items-center mb-1 gap-3">
                  <div className="text-xs font-bold text-slate-200">
                    {pathway.nameAr || pathway.name}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-400">
                    LOS: {pathway.expectedLOSDays || "-"}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate max-w-[85%]">
                  {pathway.targetDiagnosis || "خطة علاجية مقسمة على الأيام"}
                </div>

                <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {enrollingId === pathway.id ? <span className="animate-pulse">⏳</span> : "➕"}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-center mt-3 pt-2 border-t border-slate-800 relative z-10 flex flex-col gap-1.5">
        <Link
          to="/order-sets"
          className="text-[10px] text-sky-500 hover:text-sky-400 font-bold transition-colors"
        >
          إدارة محتوى البروتوكولات ←
        </Link>
        <Link
          to="/clinical-pathways"
          className="text-[10px] text-pink-500 hover:text-pink-400 font-bold transition-colors"
        >
          إدارة المسارات السريرية ←
        </Link>
      </div>
    </div>
  );
}
