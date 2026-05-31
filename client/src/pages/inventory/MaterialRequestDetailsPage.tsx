import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { inventoryApi } from "@/api/inventoryApi";
import { formatDate } from "@/lib/utils";
import { IssueStockModal } from "@/components/inventory/IssueStockModal";

export function MaterialRequestDetailsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

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
        <div className="text-sm animate-pulse font-bold">{t("inventory.materialRequest.details.loading", "جاري تحميل تفاصيل الطلب...")}</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-500 min-h-[60vh]">
        <h2 className="text-xl font-bold text-slate-300">{t("inventory.materialRequest.details.notFound", "الطلب غير موجود")}</h2>
        <button onClick={() => navigate('/inventory/material-requests')} className="mt-4 text-sky-400 hover:underline">{t("inventory.materialRequest.details.backToList", "العودة للقائمة")}</button>
      </div>
    );
  }

  const handleApprove = async () => {
    if (!window.confirm(t("inventory.materialRequest.details.confirmApprove", "هل أنت متأكد من اعتماد هذا الطلب؟"))) return;
    setApproving(true);
    try {
      await inventoryApi.approveMaterialRequest(request.id);
      toast.success(t("inventory.materialRequest.details.toast.approveSuccess", "تم اعتماد الطلب بنجاح"));
      refetch();
     
    } catch (err: any) {
      toast.error(err.response?.data?.message || t("inventory.materialRequest.details.toast.approveFailed", "فشل اعتماد الطلب"));
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt(t("inventory.materialRequest.details.rejectReasonPrompt", "سبب الرفض (اختياري):"));
    if (reason === null) return;
    setRejecting(true);
    try {
      await inventoryApi.rejectMaterialRequest(request.id, reason);
      toast.success(t("inventory.materialRequest.details.toast.rejectSuccess", "تم رفض الطلب"));
      refetch();
     
    } catch (err: any) {
      toast.error(err.response?.data?.message || t("inventory.materialRequest.details.toast.rejectFailed", "فشل رفض الطلب"));
    } finally {
      setRejecting(false);
    }
  };

  const handleReceiveStockIssue = async (issueId: number) => {
    if (!window.confirm(t("inventory.materialRequest.details.confirmReceive", "هل أنت متأكد من استلام هذه الشحنة وإضافتها للمخزن؟"))) return;
    try {
      await inventoryApi.receiveStockIssue(issueId);
      toast.success(t("inventory.materialRequest.details.toast.receiveSuccess", "تم استلام الشحنة وإضافتها للمخزون بنجاح"));
      refetch();
     
    } catch (err: any) {
      toast.error(err.response?.data?.message || t("inventory.materialRequest.details.toast.receiveFailed", "فشل استلام الشحنة"));
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case "PENDING_APPROVAL": return t("inventory.materialRequest.status.pending", "بانتظار الاعتماد");
      case "APPROVED": return t("inventory.materialRequest.status.approved", "معتمد - بانتظار الصرف");
      case "REJECTED": return t("inventory.materialRequest.status.rejected", "مرفوض");
      case "PARTIALLY_ISSUED": return t("inventory.materialRequest.status.partial", "مصروف جزئياً");
      case "COMPLETED": return t("inventory.materialRequest.status.completed", "مكتمل");
      case "CANCELLED": return t("inventory.materialRequest.status.cancelled", "ملغى");
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
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-y-auto custom-scrollbar" dir={isRtl ? "rtl" : "ltr"}>
      
      {/* Header */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-black text-white tracking-tight">
              {t("inventory.materialRequest.details.titlePrefix", "طلب مواد #")}{request.requestNumber}
            </h1>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border uppercase ${getStatusColorClass(request.status)}`}>
              {getStatusLabel(request.status)}
            </span>
          </div>
          <p className="text-sm text-slate-400">
            {t("inventory.materialRequest.details.orderDate", "تاريخ الطلب:")} {formatDate(request.createdAt)}
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
                  {rejecting ? t("inventory.materialRequest.details.rejecting", 'جاري الرفض...') : t("inventory.materialRequest.details.rejectBtn", 'رفض الطلب')}
                </button>
                <button 
                  onClick={handleApprove}
                  disabled={approving}
                  className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50"
                >
                  {approving ? t("inventory.materialRequest.details.approving", 'جاري الاعتماد...') : t("inventory.materialRequest.details.approveBtn", 'اعتماد الطلب')}
                </button>
             </>
          )}

          {/* Fulfilling Warehouse Actions (Issue Stock) */}
          {(request.status === 'APPROVED' || request.status === 'PARTIALLY_ISSUED') && hasPermission('inventory:manage') && (
             <button 
               onClick={() => setIsIssueModalOpen(true)}
               className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-900/20 transition-all"
             >
               {t("inventory.materialRequest.details.issueBtn", "صرف المواد")}
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
              {t("inventory.materialRequest.details.requestedItems", "الأصناف المطلوبة")}
            </h2>
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${isRtl ? "text-right" : "text-left"}`}>
                <thead className="text-[10px] uppercase text-slate-500 bg-slate-950/50">
                  <tr>
                    <th className="px-4 py-3 font-bold rounded-r-xl">{t("inventory.materialRequest.details.tableCode", "كود")}</th>
                    <th className="px-4 py-3 font-bold">{t("inventory.materialRequest.details.tableName", "اسم الصنف")}</th>
                    <th className="px-4 py-3 font-bold text-center">{t("inventory.materialRequest.details.tableUnit", "الوحدة")}</th>
                    <th className="px-4 py-3 font-bold text-center">{t("inventory.materialRequest.details.tableRequestedQty", "الكمية المطلوبة")}</th>
                    <th className="px-4 py-3 font-bold text-center">{t("inventory.materialRequest.details.tableIssuedQty", "الكمية المصروفة")}</th>
                    <th className="px-4 py-3 font-bold text-center rounded-l-xl">{t("inventory.materialRequest.details.tableRemainingQty", "المتبقي")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {request.items?.map((item) => (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-sky-400 text-xs">{item.product?.code || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-200">{item.product?.name}</td>
                      <td className="px-4 py-3 text-slate-400 text-center">{item.uom?.name || item.product?.baseUom?.name || t("inventory.materialRequest.details.baseUom", 'الأساسية')}</td>
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
                {t("inventory.materialRequest.details.linkedIssues", "شحنات الصرف المرتبطة")}
              </h2>
              <div className="space-y-4">
                {request.stockIssues.map(issue => (
                  <div key={issue.id} className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sky-400 font-bold">{issue.issueNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${issue.status === 'RECEIVED' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' : 'bg-amber-900/30 text-amber-400 border-amber-500/30'}`}>
                          {issue.status === 'RECEIVED' ? t("inventory.materialRequest.details.receivedStatus", 'مُستلمة') : t("inventory.materialRequest.details.shippedStatus", 'في الطريق (مُصدرة)')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {t("inventory.materialRequest.details.issueDate", "تاريخ الصرف:")} {formatDate(issue.createdAt)} | {t("inventory.materialRequest.details.byLabel", "بواسطة:")} {issue.issuedBy?.fullName || '-'}
                      </div>
                      <div className="text-xs font-mono mt-2 text-slate-300">
                        {t("inventory.materialRequest.details.issuedItemsCount", "{{count}} أصناف مصدرة", { count: issue.items?.length })}
                      </div>
                    </div>
                    <div>
                      {issue.status === 'ISSUED' && hasPermission('inventory:manage') && (
                        <button
                           onClick={() => handleReceiveStockIssue(issue.id)}
                           className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg"
                        >
                           {t("inventory.materialRequest.details.receiveShipmentBtn", "استلام الشحنة (إدخال للمخزن)")}
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
            <h2 className="text-sm font-bold text-slate-200 mb-4 border-b border-slate-800 pb-2">{t("inventory.materialRequest.details.warehouseDetails", "تفاصيل المستودعات")}</h2>
            
            <div className="space-y-4">
              <div>
                <div className="text-[10px] text-slate-500 font-bold mb-1">{t("inventory.materialRequest.details.fulfillingWarehouseLabel", "المستودع المصرف (المُصدّر)")}</div>
                <div className="text-sm font-bold text-white bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                  {request.fulfillingWarehouse?.name}
                </div>
              </div>
              <div className="flex justify-center text-slate-600">
                ⬇️
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold mb-1">{t("inventory.materialRequest.details.requestingWarehouseLabel", "المستودع الطالب (المُستلِم)")}</div>
                <div className="text-sm font-bold text-white bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                  {request.requestingWarehouse?.name}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-200 mb-4 border-b border-slate-800 pb-2">{t("inventory.materialRequest.details.additionalInfo", "معلومات إضافية")}</h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{t("inventory.materialRequest.details.requestedByLabel", "طالب المواد:")}</span>
                <span className="text-slate-200 font-bold">{request.requestedBy?.fullName}</span>
              </div>
              {request.approvedBy && (
                <div className="flex justify-between">
                  <span className="text-slate-500">{t("inventory.materialRequest.details.approvedByLabel", "تم الاعتماد بواسطة:")}</span>
                  <span className="text-slate-200 font-bold">{request.approvedBy.fullName}</span>
                </div>
              )}
              {request.approvedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">{t("inventory.materialRequest.details.approvedDateLabel", "تاريخ الاعتماد:")}</span>
                  <span className="text-slate-200 font-bold text-xs">{formatDate(request.approvedAt)}</span>
                </div>
              )}
            </div>

            {request.notes && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <div className="text-[10px] text-slate-500 font-bold mb-1">{t("inventory.materialRequest.details.notesLabel", "ملاحظات الطلب:")}</div>
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
