import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { inventoryApi } from "@/api/inventoryApi";
import { formatDate } from "@/lib/utils";
import { IssueStockModal } from "@/components/inventory/IssueStockModal";

export function MaterialRequestDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user, hasPermission } = useAuth();
  
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

  const { data: request, isLoading, refetch } = useQuery({
    queryKey: ['materialRequest', id],
    queryFn: async () => {
      return await inventoryApi.getMaterialRequestById(Number(id));
    },
    enabled: !!id
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-500 min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mb-4"></div>
        <div className="text-sm animate-pulse font-bold">جاري تحميل تفاصيل الطلب...</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-500 min-h-[60vh]">
        <h2 className="text-xl font-bold text-slate-300">الطلب غير موجود</h2>
        <button onClick={() => navigate('/inventory/material-requests')} className="mt-4 text-sky-400 hover:underline">العودة للقائمة</button>
      </div>
    );
  }

  const handleApprove = async () => {
    if (!window.confirm("هل أنت متأكد من اعتماد هذا الطلب؟")) return;
    setApproving(true);
    try {
      await inventoryApi.approveMaterialRequest(request.id);
      toast.success("تم اعتماد الطلب بنجاح");
      refetch();
     
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل اعتماد الطلب");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt("سبب الرفض (اختياري):");
    if (reason === null) return;
    setRejecting(true);
    try {
      await inventoryApi.rejectMaterialRequest(request.id, reason);
      toast.success("تم رفض الطلب");
      refetch();
     
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل رفض الطلب");
    } finally {
      setRejecting(false);
    }
  };

  const handleReceiveStockIssue = async (issueId: number) => {
    if (!window.confirm("هل أنت متأكد من استلام هذه الشحنة وإضافتها للمخزن؟")) return;
    try {
      await inventoryApi.receiveStockIssue(issueId);
      toast.success("تم استلام الشحنة وإضافتها للمخزون بنجاح");
      refetch();
     
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل استلام الشحنة");
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case "PENDING_APPROVAL": return "بانتظار الاعتماد";
      case "APPROVED": return "معتمد - بانتظار الصرف";
      case "REJECTED": return "مرفوض";
      case "PARTIALLY_ISSUED": return "مصروف جزئياً";
      case "COMPLETED": return "مكتمل";
      case "CANCELLED": return "ملغى";
      default: return status;
    }
  };

  const getStatusColorClass = (status: string) => {
      switch(status) {
          case "PENDING_APPROVAL": return "bg-amber-900/30 text-amber-400 border-amber-500/30";
          case "APPROVED": return "bg-sky-900/30 text-sky-400 border-sky-500/30";
          case "REJECTED": return "bg-rose-900/30 text-rose-400 border-rose-500/30";
          case "PARTIALLY_ISSUED": return "bg-violet-900/30 text-violet-400 border-violet-500/30";
          case "COMPLETED": return "bg-emerald-900/30 text-emerald-400 border-emerald-500/30";
          case "CANCELLED": return "bg-slate-800 text-slate-400 border-slate-700";
          default: return "bg-slate-800 text-slate-400 border-slate-700";
      }
  };

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-y-auto custom-scrollbar" dir="rtl">
      
      {/* Header */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-black text-white tracking-tight">
              طلب مواد #{request.requestNumber}
            </h1>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border uppercase ${getStatusColorClass(request.status)}`}>
              {getStatusLabel(request.status)}
            </span>
          </div>
          <p className="text-sm text-slate-400">
            تاريخ الطلب: {formatDate(request.createdAt)}
          </p>
        </div>
        
        <div className="flex gap-2">
          {/* Manager Actions (Approve/Reject) */}
          {request.status === 'PENDING_APPROVAL' && hasPermission('inventory:manage') && (
             <>
               <button 
                 onClick={handleReject}
                 disabled={rejecting}
                 className="px-4 py-2 bg-rose-900/40 text-rose-400 hover:bg-rose-900/60 border border-rose-800 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
               >
                 {rejecting ? 'جاري الرفض...' : 'رفض الطلب'}
               </button>
               <button 
                 onClick={handleApprove}
                 disabled={approving}
                 className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50"
               >
                 {approving ? 'جاري الاعتماد...' : 'اعتماد الطلب'}
               </button>
             </>
          )}

          {/* Fulfilling Warehouse Actions (Issue Stock) */}
          {(request.status === 'APPROVED' || request.status === 'PARTIALLY_ISSUED') && hasPermission('inventory:manage') && (
             <button 
               onClick={() => setIsIssueModalOpen(true)}
               className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-900/20 transition-all"
             >
               صرف المواد
             </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-200 mb-4 flex items-center gap-2">
              <span className="text-amber-400">📦</span>
              الأصناف المطلوبة
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="text-[10px] uppercase text-slate-500 bg-slate-950/50">
                  <tr>
                    <th className="px-4 py-3 font-bold rounded-r-xl">كود</th>
                    <th className="px-4 py-3 font-bold">اسم الصنف</th>
                    <th className="px-4 py-3 font-bold text-center">الوحدة</th>
                    <th className="px-4 py-3 font-bold text-center">الكمية المطلوبة</th>
                    <th className="px-4 py-3 font-bold text-center">الكمية المصروفة</th>
                    <th className="px-4 py-3 font-bold text-center rounded-l-xl">المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {request.items?.map((item) => (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-sky-400 text-xs">{item.product?.code || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-200">{item.product?.name}</td>
                      <td className="px-4 py-3 text-slate-400 text-center">{item.uom?.name || item.product?.baseUom?.name || 'الأساسية'}</td>
                      <td className="px-4 py-3 font-mono text-amber-400 text-center font-bold">{item.requestedQty}</td>
                      <td className="px-4 py-3 font-mono text-emerald-400 text-center font-bold">{item.issuedQty || 0}</td>
                      <td className="px-4 py-3 font-mono text-slate-300 text-center font-bold">{item.requestedQty - (item.issuedQty || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stock Issues History */}
          {(request.stockIssues && request.stockIssues.length > 0) && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-200 mb-4 flex items-center gap-2">
                <span className="text-sky-400">🚚</span>
                شحنات الصرف المرتبطة
              </h2>
              <div className="space-y-4">
                {request.stockIssues.map(issue => (
                  <div key={issue.id} className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sky-400 font-bold">{issue.issueNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${issue.status === 'RECEIVED' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-amber-900/30 text-amber-400 border-amber-500/30'}`}>
                          {issue.status === 'RECEIVED' ? 'مُستلمة' : 'في الطريق (مُصدرة)'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        تاريخ الصرف: {formatDate(issue.createdAt)} | بواسطة: {issue.issuedBy?.fullName || '-'}
                      </div>
                      <div className="text-xs font-mono mt-2 text-slate-300">
                        {issue.items?.length} أصناف مصدرة
                      </div>
                    </div>
                    <div>
                      {issue.status === 'ISSUED' && hasPermission('inventory:manage') && (
                        <button
                           onClick={() => handleReceiveStockIssue(issue.id)}
                           className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg"
                        >
                           استلام الشحنة (إدخال للمخزن)
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-200 mb-4 border-b border-slate-800 pb-2">تفاصيل المستودعات</h2>
            
            <div className="space-y-4">
              <div>
                <div className="text-[10px] text-slate-500 font-bold mb-1">المستودع المصرف (المُصدّر)</div>
                <div className="text-sm font-bold text-white bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                  {request.fulfillingWarehouse?.name}
                </div>
              </div>
              <div className="flex justify-center text-slate-600">
                ⬇️
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold mb-1">المستودع الطالب (المُستلِم)</div>
                <div className="text-sm font-bold text-white bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                  {request.requestingWarehouse?.name}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-200 mb-4 border-b border-slate-800 pb-2">معلومات إضافية</h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">طالب المواد:</span>
                <span className="text-slate-200 font-bold">{request.requestedBy?.fullName}</span>
              </div>
              {request.approvedBy && (
                <div className="flex justify-between">
                  <span className="text-slate-500">تم الاعتماد بواسطة:</span>
                  <span className="text-slate-200 font-bold">{request.approvedBy.fullName}</span>
                </div>
              )}
              {request.approvedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">تاريخ الاعتماد:</span>
                  <span className="text-slate-200 font-bold text-xs">{formatDate(request.approvedAt)}</span>
                </div>
              )}
            </div>

            {request.notes && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <div className="text-[10px] text-slate-500 font-bold mb-1">ملاحظات الطلب:</div>
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg">
                  {request.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isIssueModalOpen && (
        <IssueStockModal 
          request={request}
          onClose={() => setIsIssueModalOpen(false)}
          onSuccess={() => {
            setIsIssueModalOpen(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
