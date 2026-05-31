// src/pages/InvoicesListPage.tsx

// src/pages/InvoicesListPage.tsx

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { HasPermission } from "../components/HasPermission";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

// --- Types ---
interface InvoiceListItem {
  id: number;
  status: string;
  totalAmount: string;
  discountAmount: string;
  paidAmount: string;
  insuranceShare: string;
  patientShare: string;
  claimStatus: string | null;
  currency: string;
  createdAt: string;
  patient: { id: number; fullName: string; mrn: string };
  encounter: { id: number; type: string };
  returns?: { id: number }[]; // ✅ [NEW]
}

interface PaginationMeta {
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface InvoiceListResponse {
    items: InvoiceListItem[];
    meta: PaginationMeta;
}


const statusKeys: Record<string, string> = {
  DRAFT: "treasury.common.draft",
  ISSUED: "treasury.common.issued",
  PARTIALLY_PAID: "treasury.common.partiallyPaid",
  PAID: "treasury.common.paid",
  CANCELLED: "treasury.common.cancelled",
};

export default function InvoicesListPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const navigate = useNavigate();

  // دالة طباعة PDF باستخدام نفس الطريقة المستخدمة في InvoiceDetailsPage
  const handlePrintPdf = async (invoiceId: number) => {
    try {
      // طلب الملف كـ Blob من نفس endpoint المستخدم في InvoiceDetailsPage
      const response = await apiClient.get(`/billing/invoices/${invoiceId}/pdf`, {
        responseType: "blob",
      });

      // إنشاء رابط مؤقت للملف في المتصفح
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));

      // فتح الملف في نافذة جديدة
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("target", "_blank");
      document.body.appendChild(link);
      link.click();

      // تنظيف الذاكرة
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error(t("treasury.invoicesList.toast.pdfLoadError", "فشل تحميل ملف الـ PDF. تأكد من إعدادات السيرفر."));
    }
  };

  // --- States ---
  // --- Search & Pagination ---
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Debounce Effect
  useEffect(() => {
    const timer = setTimeout(() => {
        setDebouncedSearch(search);
        setPage(1); // Reset page on search change
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Query
  const { data, isLoading: loading, isError, refetch } = useQuery<InvoiceListResponse>({
      queryKey: ['invoices', page, debouncedSearch, statusFilter],
      queryFn: async () => {
          const res = await apiClient.get<InvoiceListResponse>("/billing/invoices", {
            params: {
              page,
              limit: 15,
              search: debouncedSearch || undefined,
              status: statusFilter || undefined,
            },
          });
          return res.data;
      },
      placeholderData: keepPreviousData,
  });

  useEffect(() => {
      if (isError) {
          toast.error(t("treasury.invoicesList.toast.loadError", "فشل تحميل قائمة الفواتير"));
      }
  }, [isError]);

  const invoices = data?.items || [];
  const meta = data?.meta;

   
  const formatMoney = (val: any) => Number(val || 0).toFixed(3);

  return (
    <div
      className="flex flex-col h-full text-slate-100 p-4 md:p-6 space-y-6"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            سجل الفواتير
          </h1>
          <p className="text-sm text-slate-400">
            {t("treasury.invoicesList.subtitle", "إدارة المطالبات المالية، التحصيل، وحالات التأمين.")}
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex-1 min-w-[250px] relative group">
          <span className="absolute inset-y-0 right-4 flex items-center text-slate-500 group-focus-within:text-sky-400">
            🔍
          </span>
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-12 pl-4 py-2.5 text-sm focus:border-sky-500 outline-none transition-all"
            placeholder={t("treasury.invoicesList.placeholder", "البحث باسم المريض أو رقم الملف أو رقم الفاتورة...")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="w-48">
          <select
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-sky-500"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("treasury.invoicesList.filterStatus", "الحالة: الكل")}</option>
            <option value="ISSUED">{t("treasury.common.issued", "صادرة")}</option>
            <option value="PARTIALLY_PAID">{t("treasury.common.partiallyPaid", "مدفوعة جزئياً")}</option>
            <option value="PAID">{t("treasury.common.paid", "مدفوعة")}</option>
            <option value="CANCELLED">{t("treasury.common.cancelled", "ملغاة")}</option>
          </select>
        </div>

        <button
          onClick={() => refetch()}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold border border-slate-700 transition-all"
        >
          تحديث
        </button>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-950/50 text-slate-500 sticky top-0 backdrop-blur z-10">
              <tr className="text-[10px] uppercase tracking-widest border-b border-slate-800">
                <th className="px-6 py-4 font-bold">{t("treasury.invoicesList.table.id", "رقم الفاتورة")}</th>
                <th className="px-6 py-4 font-bold">{t("treasury.invoicesList.table.patient", "المريض")}</th>
                <th className="px-6 py-4 font-bold">{t("treasury.invoicesList.table.date", "تاريخ الإصدار")}</th>
                <th className="px-6 py-4 font-bold">{t("treasury.invoicesList.table.total", "إجمالي الفاتورة")}</th>
                <th className="px-6 py-4 font-bold">{t("treasury.invoicesList.table.typeStatus", "النوع / الحالة")}</th>
                <th className="px-6 py-4 font-bold text-center">{t("treasury.invoicesList.table.paid", "تم دفعه")}</th>
                <th className="px-6 py-4 font-bold text-center">{t("treasury.invoicesList.table.remaining", "المتبقي")}</th>
                <th className="px-6 py-4 font-bold text-center">{t("treasury.invoicesList.table.actions", "الإجراءات")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-20 text-slate-500 animate-pulse"
                  >
                    {t("treasury.invoicesList.loading", "جارِ تحميل الفواتير...")}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="px-6 py-4 font-mono text-sky-400 font-bold">
                      #{inv.id}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-100">
                        {inv.patient?.fullName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {inv.patient?.mrn}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {formatDate(inv.createdAt)}
                    </td>
                    <td className="px-6 py-4 font-mono text-white font-semibold">
                      {formatMoney(inv.totalAmount)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-emerald-400 font-bold">
                        P: {formatMoney(inv.paidAmount)}
                      </div>
                      {Number(inv.insuranceShare) > 0 && (
                        <div className="text-purple-400 text-[10px]">
                          I: {formatMoney(inv.insuranceShare)} (
                          {inv.claimStatus || "PENDING"})
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[9px] font-black border uppercase
                            ${
                              inv.returns && inv.returns.length > 0
                                ? "bg-rose-900/30 text-rose-400 border-rose-500/30 line-through opacity-70"
                                : inv.status === "PAID"
                                ? "bg-emerald-900/30 text-emerald-400 border-emerald-500/30"
                                : inv.status === "PARTIALLY_PAID"
                                ? "bg-amber-900/20 text-amber-400 border-amber-500/30"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                      >
                        {inv.returns && inv.returns.length > 0 ? t("treasury.invoicesList.creditNote", "MERGED / REFUNDED") : t(statusKeys[inv.status] || inv.status, inv.status)}
                      </span>
                      {inv.returns && inv.returns.length > 0 && (
                        <div className="text-[9px] text-rose-400 font-bold mt-1">
                          {t("treasury.invoicesList.creditNote", "تم الإرجاع")}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() =>
                            navigate(`/billing/invoices/${inv.id}`)
                          }
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] transition-all border border-slate-700"
                        >
                          التفاصيل
                        </button>
                        <button
                          onClick={() => handlePrintPdf(inv.id)}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-bold shadow-lg transition-all"
                        >
                          طباعة ⎙
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-6 py-4 flex justify-between items-center text-xs">
          <div className="text-slate-500">
            {t("treasury.invoicesList.table.total", "إجمالي الفواتير")}:{" "}
            <span className="text-white font-bold">
              {meta?.totalCount ?? 0}
            </span>
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex gap-2">
              <button
                disabled={page === 1 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl disabled:opacity-20 hover:text-sky-400 transition-colors"
              >
                السابق
              </button>

              <div className="flex items-center px-4 text-slate-400">
                {t("patients.paginationPage", "صفحة")} <span className="text-sky-400 font-bold mx-1">{page}</span>{" "}
                {t("patients.paginationOf", "من")}{" "}
                <span className="text-white font-bold mx-1">
                  {meta?.totalPages || 1}
                </span>
              </div>

              <button
                disabled={page >= (meta?.totalPages || 1) || loading}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl disabled:opacity-20 hover:text-sky-400 transition-colors"
              >
                التالي
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
