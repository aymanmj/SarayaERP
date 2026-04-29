import React, { useEffect, useState, useMemo } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { ShieldCheck, FileText, CheckCircle2, XCircle, Printer, RefreshCw, AlertCircle, Building2, Upload, Loader2 } from "lucide-react";
import { FeatureGuard } from "@/components/FeatureGuard";

type InsuranceProvider = {
  id: number;
  name: string;
};

type ClaimInvoice = {
  id: number;
  invoiceNumber: string | null;
  createdAt: string;
  totalAmount: number;
  insuranceShare: number;
  patientShare: number;
  claimStatus: string | null;
  rejectionReason?: string | null;
  patient: {
    fullName: string;
    mrn: string;
    insuranceMemberId: string | null;
  };
  insuranceProvider: {
    name: string;
  };
};

function formatMoney(v: number) {
  return v.toFixed(3);
}

export default function InsuranceClaimsPage() {
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);
  const [claims, setClaims] = useState<ClaimInvoice[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");

  // Selection for Batch Action
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Rejection Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // NPHIES State
  const [nphiesLoading, setNphiesLoading] = useState(false);

  // Load Providers
  useEffect(() => {
    apiClient.get<InsuranceProvider[]>("/insurance/providers").then((res) => {
      setProviders(res.data);
    });
  }, []);

  // Load Claims
  const loadClaims = async () => {
    setLoading(true);
    try {
      const params: any = { status: statusFilter };
      if (selectedProvider) params.providerId = selectedProvider;

      const res = await apiClient.get<ClaimInvoice[]>("/insurance/claims", { params });
      setClaims(res.data);
      setSelectedIds([]); // Reset selection
    } catch (err) {
      toast.error("فشل تحميل المطالبات.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, statusFilter]);

  // Handle Selection
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === claims.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(claims.map((c) => c.id));
    }
  };

  // Actions
  const handleUpdateStatus = async (newStatus: string) => {
    if (selectedIds.length === 0) return;
    const actionName = newStatus === "SUBMITTED" ? "إرسال المطالبة" : "تسجيل السداد";
    if (!confirm(`هل أنت متأكد من ${actionName} لعدد ${selectedIds.length} فاتورة؟`)) return;

    try {
      await apiClient.post("/insurance/claims/update-status", {
        invoiceIds: selectedIds,
        status: newStatus,
      });
      toast.success("تم تحديث الحالة بنجاح.");
      loadClaims();
    } catch (err) {
      toast.error("فشل التحديث.");
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      toast.warning("يرجى إدخال سبب الرفض");
      return;
    }
    
    try {
      await apiClient.post("/insurance/claims/update-status", {
        invoiceIds: selectedIds,
        status: "REJECTED",
        rejectionReason: rejectionReason,
      });
      toast.success("تم تسجيل الرفض بنجاح.");
      setShowRejectModal(false);
      setRejectionReason("");
      loadClaims();
    } catch (err) {
      toast.error("فشل التحديث.");
    }
  };

  // === NPHIES: Submit eClaims ===
  const handleNphiesSubmit = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`هل تريد رفع ${selectedIds.length} مطالبة إلى منصة نفيس (NPHIES)؟`)) return;

    setNphiesLoading(true);
    let accepted = 0;
    let rejected = 0;

    for (const id of selectedIds) {
      try {
        const res = await apiClient.post(`/integration/nphies/claims/${id}/submit`);
        if (res.data?.accepted) {
          accepted++;
        } else {
          rejected++;
        }
      } catch {
        rejected++;
      }
    }

    setNphiesLoading(false);

    if (accepted > 0 && rejected === 0) {
      toast.success(`✅ تم رفع ${accepted} مطالبة بنجاح إلى NPHIES`);
    } else if (accepted > 0 && rejected > 0) {
      toast.warning(`⚠️ تم قبول ${accepted} ورفض ${rejected} مطالبة`);
    } else {
      toast.error(`❌ فشل رفع جميع المطالبات (${rejected})`);
    }

    loadClaims();
  };

  // Print Logic
  const handlePrintClaimSheet = () => {
    const itemsToPrint = selectedIds.length > 0
      ? claims.filter((c) => selectedIds.includes(c.id))
      : claims;

    if (itemsToPrint.length === 0) {
      toast.warning("لا توجد فواتير للطباعة.");
      return;
    }

    const providerName = itemsToPrint[0]?.insuranceProvider?.name || "شركة التأمين";
    const totalClaim = itemsToPrint.reduce((sum, c) => sum + Number(c.insuranceShare), 0);

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("يرجى السماح بالنوافذ المنبثقة (Popups) للطباعة.");
      return;
    }

    const htmlContent = `
      <html dir="rtl" lang="ar">
        <head>
          <title>كشف مطالبة مالية</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
            h1, h2 { text-align: center; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: right; }
            th { background-color: #f0f0f0; }
            .header { margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .summary { margin-top: 20px; text-align: left; font-size: 14px; font-weight: bold; }
            .footer { margin-top: 50px; display: flex; justify-content: space-between; }
            @media print { 
                @page { size: A4; margin: 10mm; }
                button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>كشف مطالبة مالية</h1>
            <h2>${providerName}</h2>
            <p>تاريخ الطباعة: ${formatDate(new Date().toISOString())}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px">#</th>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>اسم المريض</th>
                <th>رقم العضوية</th>
                <th>إجمالي الفاتورة</th>
                <th>حصة المريض</th>
                <th>المطالبة (حصة الشركة)</th>
              </tr>
            </thead>
            <tbody>
              ${itemsToPrint.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>#${item.id}</td>
                  <td>${formatDate(item.createdAt)}</td>
                  <td>${item.patient.fullName}</td>
                  <td>${item.patient.insuranceMemberId || "-"}</td>
                  <td>${formatMoney(Number(item.totalAmount))}</td>
                  <td>${formatMoney(Number(item.patientShare))}</td>
                  <td style="font-weight: bold">${formatMoney(Number(item.insuranceShare))}</td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
               <tr>
                 <td colspan="7" style="text-align: left; font-weight: bold;">الإجمالي الكلي للمطالبة</td>
                 <td style="font-weight: bold; font-size: 14px;">${formatMoney(totalClaim)} LYD</td>
               </tr>
            </tfoot>
          </table>

          <div class="footer">
            <div>توقيع المحاسب: ....................</div>
            <div>الختم:</div>
            <div>استلام الشركة: ....................</div>
          </div>
          
          <script>
            window.print();
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const totalClaimAmount = useMemo(() => {
    return claims.reduce((sum, c) => sum + Number(c.insuranceShare), 0);
  }, [claims]);

  const selectedTotal = useMemo(() => {
    return claims
      .filter((c) => selectedIds.includes(c.id))
      .reduce((sum, c) => sum + Number(c.insuranceShare), 0);
  }, [claims, selectedIds]);

  return (
    <div className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6 overflow-hidden" dir="rtl" data-testid="insurance-claims-page">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl -mx-20 -my-20 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            إدارة مطالبات التأمين (RCM)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            متابعة الفواتير المستحقة، إدارة المطالبات المرفوضة، وتجهيز ملفات NPHIES.
          </p>
        </div>
      </div>

      {/* Filters & Stats */}
      <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-wrap gap-6 items-end relative overflow-hidden">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
            <Building2 className="w-4 h-4" /> شركة التأمين
          </label>
          <select
            className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm w-56 focus:border-sky-500 outline-none transition-colors"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            <option value="">-- عرض كل الشركات --</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-400 flex items-center gap-1">
            <FileText className="w-4 h-4" /> حالة المطالبة
          </label>
          <select
            className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm w-56 focus:border-sky-500 outline-none transition-colors"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="PENDING">⏳ معلقة (لم ترسل)</option>
            <option value="SUBMITTED">📤 تم الإرسال (Submitted)</option>
            <option value="PAID">💰 تم السداد (Paid)</option>
            <option value="REJECTED">❌ مرفوضة (Rejected)</option>
          </select>
        </div>

        <div className="mr-auto flex gap-4 items-center bg-slate-950 p-3 rounded-xl border border-slate-800 shadow-inner">
          <div className="p-2 bg-sky-900/20 text-sky-400 rounded-lg">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">
              إجمالي المطالبات الظاهرة
            </div>
            <div className="text-xl font-black text-sky-400 tracking-tight">
              {formatMoney(totalClaimAmount)} <span className="text-sm font-bold text-slate-500">LYD</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Bar (When items selected) */}
      <div className={`transition-all duration-300 ease-in-out origin-top overflow-hidden ${selectedIds.length > 0 ? 'opacity-100 max-h-24' : 'opacity-0 max-h-0'}`}>
        <div className="bg-sky-900/20 border border-sky-500/30 p-4 rounded-2xl flex justify-between items-center shadow-[0_0_20px_-5px_rgba(14,165,233,0.15)]">
          <div className="text-sm text-slate-300">
            تم تحديد <span className="font-black text-white text-lg bg-sky-500/20 px-2 py-0.5 rounded-lg mx-1">{selectedIds.length}</span> مطالبة 
            بقيمة إجمالية <span className="font-black text-emerald-400 text-lg mx-1">{formatMoney(selectedTotal)}</span> LYD
          </div>
          <div className="flex gap-2">
            {statusFilter === "PENDING" && (
              <button
                onClick={() => handleUpdateStatus("SUBMITTED")}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> إرسال المطالبة للشركة
              </button>
            )}
            {statusFilter === "PENDING" && (
              <FeatureGuard feature="INSURANCE_INTEGRATION">
                <button
                  onClick={handleNphiesSubmit}
                  disabled={nphiesLoading}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2"
                >
                  {nphiesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  رفع إلى نفيس (NPHIES)
                </button>
              </FeatureGuard>
            )}
            {statusFilter === "SUBMITTED" && (
              <>
                <button
                  onClick={() => handleUpdateStatus("PAID")}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> تسجيل كسداد
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="px-4 py-2 bg-rose-900/50 hover:bg-rose-900/80 border border-rose-500/30 text-rose-300 hover:text-white text-sm rounded-xl font-bold transition-colors flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> رفض المطالبات
                </button>
              </>
            )}

            {statusFilter === "REJECTED" && (
              <button
                onClick={() => handleUpdateStatus("PENDING")}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> إعادة تقديم المطالبة
              </button>
            )}

            <button
              onClick={handlePrintClaimSheet}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-500 text-sm rounded-xl font-bold transition-colors flex items-center gap-2"
            >
              <Printer className="w-4 h-4 text-slate-400" /> طباعة كشف التجميع
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col relative">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-sm text-right">
            <thead className="text-slate-400 bg-slate-900/80 sticky top-0 z-10 backdrop-blur-md border-b border-slate-800">
              <tr>
                <th className="w-12 px-4 py-4 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500/20"
                    onChange={toggleSelectAll}
                    checked={selectedIds.length > 0 && selectedIds.length === claims.length}
                  />
                </th>
                <th className="px-4 py-4 font-bold">رقم الفاتورة</th>
                <th className="px-4 py-4 font-bold">التاريخ</th>
                <th className="px-4 py-4 font-bold">المريض</th>
                <th className="px-4 py-4 font-bold">رقم العضوية</th>
                <th className="px-4 py-4 font-bold">شركة التأمين</th>
                <th className="px-4 py-4 font-bold text-sky-400">المطالبة (حصة الشركة)</th>
                <th className="px-4 py-4 font-bold text-slate-500">حصة المريض</th>
                <th className="px-4 py-4 font-bold">حالة RCM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center py-20 text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-10 h-10 rounded-full border-4 border-sky-500/30 border-t-sky-500 animate-spin mb-3"></div>
                      <span className="animate-pulse">جاري سحب بيانات المطالبات...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && claims.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-20 text-slate-500">
                    <div className="flex flex-col items-center justify-center bg-slate-900/50 w-full rounded-xl border border-dashed border-slate-700 max-w-md mx-auto p-10">
                      <ShieldCheck className="w-16 h-16 text-slate-600 mb-4 opacity-30" />
                      <p>لا توجد مطالبات تأمينية تطابق معايير البحث.</p>
                    </div>
                  </td>
                </tr>
              )}

              {claims.map((c) => (
                <tr
                  key={c.id}
                  className={`hover:bg-slate-800/60 transition-colors ${
                    selectedIds.includes(c.id) ? "bg-sky-900/10" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500/20"
                      checked={selectedIds.includes(c.id)}
                      onChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300">#{c.id}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 font-bold text-slate-200">
                    {c.patient.fullName}
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs bg-slate-950 rounded-lg inline-block mt-2 mb-2 ml-4">
                    {c.patient.insuranceMemberId || "غير مسجل"}
                  </td>
                  <td className="px-4 py-3">{c.insuranceProvider?.name}</td>
                  <td className="px-4 py-3 font-black text-sky-400 text-base tracking-tight">
                    {formatMoney(Number(c.insuranceShare))}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-500">
                    {formatMoney(Number(c.patientShare))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                        c.claimStatus === "SUBMITTED"
                          ? "bg-sky-900/20 text-sky-400 border-sky-500/30"
                          : c.claimStatus === "PAID"
                            ? "bg-emerald-900/20 text-emerald-400 border-emerald-500/30"
                            : c.claimStatus === "REJECTED"
                              ? "bg-rose-900/20 text-rose-400 border-rose-500/30"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {c.claimStatus === "SUBMITTED" ? "تم الإرسال" :
                       c.claimStatus === "PAID" ? "تم السداد" :
                       c.claimStatus === "REJECTED" ? "مرفوضة" : "معلقة"}
                    </span>
                    {c.claimStatus === "REJECTED" && c.rejectionReason && (
                      <div className="text-[10px] text-rose-400/80 mt-1 max-w-[150px] truncate" title={c.rejectionReason}>
                        السبب: {c.rejectionReason}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-0 w-full max-w-md shadow-[0_0_40px_-10px_rgba(225,29,72,0.3)] animate-in zoom-in-95 overflow-hidden">
            <div className="p-5 border-b border-slate-800 bg-slate-900/50 flex items-center gap-3">
              <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl">
                <XCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-rose-400">رفض المطالبات التأمينية</h3>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                سيتم تغيير حالة <span className="font-bold text-white">{selectedIds.length}</span> مطالبات إلى <span className="text-rose-400 font-bold">"مرفوضة"</span>. 
                يرجى تدوين سبب الرفض الوارد من شركة التأمين ليتم مراجعته في قسم دورة الإيرادات (RCM).
              </p>
              
              <label className="block text-xs font-bold text-slate-400 mb-2">سبب الرفض (إلزامي)</label>
              <textarea
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none text-slate-100 min-h-[120px] resize-none"
                placeholder="أدخل الرمز أو التبرير (مثال: الخدمة غير مشمولة بالوثيقة)..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-xl transition-colors border border-slate-700 hover:border-slate-600"
              >
                إلغاء التراجع
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectionReason.trim()}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-xl shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" /> تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
