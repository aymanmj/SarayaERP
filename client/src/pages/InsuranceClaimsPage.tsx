// src/pages/InsuranceClaimsPage.tsx

import { useEffect, useState, useMemo } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

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

// Local formatDate removed

export default function InsuranceClaimsPage() {
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);
  const [claims, setClaims] = useState<ClaimInvoice[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");

  // Selection for Batch Action
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

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

      const res = await apiClient.get<ClaimInvoice[]>("/insurance/claims", {
        params,
      });
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
    const actionName =
      newStatus === "SUBMITTED" ? "إرسال المطالبة" : "تسجيل السداد";
    if (
      !confirm(
        `هل أنت متأكد من ${actionName} لعدد ${selectedIds.length} فاتورة؟`,
      )
    )
      return;

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

  // ✅ دالة الطباعة الجديدة (تفتح نافذة نظيفة للطباعة)
  const handlePrintClaimSheet = () => {
    const itemsToPrint =
      selectedIds.length > 0
        ? claims.filter((c) => selectedIds.includes(c.id))
        : claims; // لو ما اخترش حاجة، اطبع كل القائمة الظاهرة

    if (itemsToPrint.length === 0) {
      toast.warning("لا توجد فواتير للطباعة.");
      return;
    }

    const providerName =
      itemsToPrint[0]?.insuranceProvider?.name || "شركة التأمين";
    const totalClaim = itemsToPrint.reduce(
      (sum, c) => sum + Number(c.insuranceShare),
      0,
    );

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
            <p>تاريخ الطباعة: ${formatDate(new Date())}</p>
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
              ${itemsToPrint
                .map(
                  (item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>#${item.id}</td>
                  <td>${formatDate(item.createdAt)}</td>
                  <td>${item.patient.fullName}</td>
                  <td>${item.patient.insuranceMemberId || "-"}</td>
                  <td>${formatMoney(Number(item.totalAmount))}</td>
                  <td>${formatMoney(Number(item.patientShare))}</td>
                  <td style="font-weight: bold">${formatMoney(
                    Number(item.insuranceShare),
                  )}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
            <tfoot>
               <tr>
                 <td colspan="7" style="text-align: left; font-weight: bold;">الإجمالي الكلي للمطالبة</td>
                 <td style="font-weight: bold; font-size: 14px;">${formatMoney(
                   totalClaim,
                 )} LYD</td>
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
    <div
      className="flex flex-col h-full text-slate-100 p-6 space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold mb-1">إدارة مطالبات التأمين</h1>
          <p className="text-sm text-slate-400">
            متابعة الفواتير المستحقة على شركات التأمين وإصدار المطالبة المالية.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">الشركة</label>
          <select
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm w-48 focus:border-sky-500 outline-none"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            <option value="">كل الشركات</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">حالة المطالبة</label>
          <select
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm w-48 focus:border-sky-500 outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="PENDING">معلقة (لم ترسل)</option>
            <option value="SUBMITTED">تم الإرسال (Submitted)</option>
            <option value="PAID">تم السداد (Paid)</option>
            <option value="REJECTED">مرفوضة (Rejected)</option>
          </select>
        </div>

        <div className="mr-auto flex gap-3 items-center">
          <div className="text-left">
            <div className="text-xs text-slate-400">
              إجمالي المطالبات في القائمة
            </div>
            <div className="text-lg font-bold text-sky-400">
              {formatMoney(totalClaimAmount)} LYD
            </div>
          </div>
        </div>
      </div>

      {/* Actions Bar (When items selected) */}
      {selectedIds.length > 0 && (
        <div className="bg-sky-900/20 border border-sky-500/30 p-3 rounded-xl flex justify-between items-center animate-in fade-in slide-in-from-top-2">
          <div className="text-sm">
            تم تحديد{" "}
            <span className="font-bold text-white">{selectedIds.length}</span>{" "}
            فاتورة (بقيمة:{" "}
            <span className="font-bold text-emerald-400">
              {formatMoney(selectedTotal)}
            </span>
            )
          </div>
          <div className="flex gap-2">
            {statusFilter === "PENDING" && (
              <button
                onClick={() => handleUpdateStatus("SUBMITTED")}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg font-bold shadow-lg"
              >
                ✅ تم إرسال المطالبة للشركة
              </button>
            )}
            {statusFilter === "SUBMITTED" && (
              <button
                onClick={() => handleUpdateStatus("PAID")}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg font-bold shadow-lg"
              >
                💰 تم استلام السداد
              </button>
            )}

            {/* زر الطباعة الحقيقي */}
            <button
              onClick={handlePrintClaimSheet}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg flex items-center gap-2"
            >
              <span>🖨️</span> طباعة كشف المطالبة
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-auto p-4">
        <table className="w-full text-sm text-right">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>
              <th className="w-10 px-3 py-2 text-center">
                <input
                  type="checkbox"
                  onChange={toggleSelectAll}
                  checked={
                    selectedIds.length > 0 &&
                    selectedIds.length === claims.length
                  }
                />
              </th>
              <th className="px-3 py-2">رقم الفاتورة</th>
              <th className="px-3 py-2">التاريخ</th>
              <th className="px-3 py-2">المريض</th>
              <th className="px-3 py-2">رقم العضوية</th>
              <th className="px-3 py-2">الشركة</th>
              <th className="px-3 py-2 text-emerald-400">
                حصة الشركة (المطالبة)
              </th>
              <th className="px-3 py-2 text-slate-500">حصة المريض</th>
              <th className="px-3 py-2">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-slate-500">
                  جارِ التحميل...
                </td>
              </tr>
            )}
            {!loading && claims.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-slate-500">
                  لا توجد مطالبات في هذه القائمة.
                </td>
              </tr>
            )}

            {claims.map((c) => (
              <tr
                key={c.id}
                className={`hover:bg-slate-800/40 ${
                  selectedIds.includes(c.id) ? "bg-sky-900/10" : ""
                }`}
              >
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggleSelect(c.id)}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-slate-300">#{c.id}</td>
                <td className="px-3 py-2">{formatDate(c.createdAt)}</td>
                <td className="px-3 py-2 font-medium text-slate-200">
                  {c.patient.fullName}
                </td>
                <td className="px-3 py-2 text-slate-400 font-mono text-xs">
                  {c.patient.insuranceMemberId || "-"}
                </td>
                <td className="px-3 py-2">{c.insuranceProvider?.name}</td>
                <td className="px-3 py-2 font-bold text-emerald-400">
                  {formatMoney(Number(c.insuranceShare))}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {formatMoney(Number(c.patientShare))}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      c.claimStatus === "SUBMITTED"
                        ? "bg-sky-900/30 text-sky-300"
                        : c.claimStatus === "PAID"
                          ? "bg-emerald-900/30 text-emerald-300"
                          : "bg-amber-900/30 text-amber-300"
                    }`}
                  >
                    {c.claimStatus || "PENDING"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
