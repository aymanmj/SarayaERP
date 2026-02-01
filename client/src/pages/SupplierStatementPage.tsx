import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type SupplierLite = {
  id: number;
  name: string;
  code?: string | null;
};

type StatementRow = {
  date: string;
  kind: "INVOICE" | "PAYMENT";
  ref: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;

  // ✅ جديد
  sourceType?: "PURCHASE_INVOICE" | "SUPPLIER_PAYMENT";
  sourceId?: number;
  purchaseInvoiceId?: number | null;
  supplierPaymentId?: number | null;
};

type SupplierStatementResponse = {
  supplier: SupplierLite;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  rows: StatementRow[];
};

// Local formatDate removed

function formatMoney(v: number) {
  return (v ?? 0).toFixed(3);
}

function buildSupplierStatementCsv(data: SupplierStatementResponse): string {
  const lines: string[] = [];

  lines.push("كشف حساب مورد");
  lines.push(`المورد,${data.supplier.name}`);
  if (data.fromDate) lines.push(`من تاريخ,${data.fromDate.slice(0, 10)}`);
  if (data.toDate) lines.push(`إلى تاريخ,${data.toDate.slice(0, 10)}`);
  lines.push("");

  lines.push(
    [
      "التاريخ",
      "النوع",
      "المرجع",
      "الوصف",
      "مدين",
      "دائن",
      "الرصيد (لصالح المورد)",
    ].join(",")
  );

  // صف افتتاحي في التصدير
  lines.push(
    [
      `"${data.fromDate ? data.fromDate.slice(0, 10) : ""}"`,
      `"افتتاحي"`,
      `""`,
      `"الرصيد الافتتاحي"`,
      `0.000`,
      `0.000`,
      (data.openingBalance ?? 0).toFixed(3),
    ].join(",")
  );

  for (const r of data.rows) {
    const dateStr = new Date(r.date).toISOString().slice(0, 10);
    const kindLabel = r.kind === "INVOICE" ? "فاتورة شراء" : "دفعة مورد";
    const esc = (s: string | null | undefined) =>
      `"${(s ?? "").replace(/"/g, '""')}"`;

    lines.push(
      [
        esc(dateStr),
        esc(kindLabel),
        esc(r.ref),
        esc(r.description),
        (r.debit ?? 0).toFixed(3),
        (r.credit ?? 0).toFixed(3),
        (r.balance ?? 0).toFixed(3),
      ].join(",")
    );
  }

  lines.push("");
  lines.push(
    `,,,إجمالي الفواتير,${data.totalDebit.toFixed(
      3
    )},إجمالي الدفعات,${data.totalCredit.toFixed(3)}`
  );
  lines.push(
    `,,,الرصيد النهائي (لصالح المورد),${data.closingBalance.toFixed(3)}`
  );

  return "\uFEFF" + lines.join("\r\n");
}

export default function SupplierStatementPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState<SupplierStatementResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fetchStatement = async (opts?: { from?: string; to?: string }) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<SupplierStatementResponse>(
        `/suppliers/${id}/statement`,
        {
          params: {
            from: opts?.from || undefined,
            to: opts?.to || undefined,
          },
        }
      );

      setData(res.data);

      if (res.data.fromDate) setFromDate(res.data.fromDate.slice(0, 10));
      if (res.data.toDate) setToDate(res.data.toDate.slice(0, 10));
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.message || "حدث خطأ أثناء تحميل كشف الحساب."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;

    const qFrom = searchParams.get("from") || "";
    const qTo = searchParams.get("to") || "";

    if (qFrom) setFromDate(qFrom);
    if (qTo) setToDate(qTo);

    fetchStatement({
      from: qFrom || undefined,
      to: qTo || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const safeRows = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows.map((r) => ({
      ...r,
      debit: Number(r.debit ?? 0),
      credit: Number(r.credit ?? 0),
      balance: Number(r.balance ?? 0),
    }));
  }, [data]);

  const handleApply = () => {
    fetchStatement({
      from: fromDate || undefined,
      to: toDate || undefined,
    });
  };

  const handleClear = () => {
    setFromDate("");
    setToDate("");
    fetchStatement();
  };

  const handleExportCsv = () => {
    if (!data) return;
    const csv = buildSupplierStatementCsv(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const today = new Date().toISOString().slice(0, 10);
    const safeName = data.supplier.name.replace(/[^\w\-]+/g, "_");
    a.download = `supplier-statement-${safeName}-${today}.csv`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openDrillDown = (r: StatementRow) => {
    // ✅ افتح تفاصيل فاتورة شراء
    const invoiceId =
      r.kind === "INVOICE" ? r.sourceId : r.purchaseInvoiceId ?? null;

    if (invoiceId) {
      // 👇 غيّر المسار هنا إذا Route عندك مختلف
      const invoicePath = `/purchases/invoices/${invoiceId}`;
      navigate(invoicePath);
      return;
    }

    // دفعة غير مربوطة: ما عندنا صفحة تفاصيل الآن
    alert(
      "هذه الدفعة غير مربوطة بفاتورة شراء، ولا توجد صفحة تفاصيل لها حالياً."
    );
  };

  if (!id) return <div className="text-slate-200">المورد غير محدد.</div>;

  const supplierName = data?.supplier.name ?? "";
  const opening = data?.openingBalance ?? 0;

  return (
    <div className="flex flex-col h-full text-slate-100" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            كشف حساب المورد {supplierName && `- ${supplierName}`}
          </h1>
          <p className="text-sm text-slate-400">
            استعراض الحركات مع إمكانية فتح تفاصيل الفاتورة مباشرة.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data}
            className="px-3 py-1.5 rounded-full text-xs bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            تصدير إلى Excel (CSV)
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700"
          >
            رجوع
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-slate-400 text-xs">جارِ تحميل كشف الحساب...</div>
      )}

      {error && (
        <div className="mb-3 rounded-xl border border-red-500/50 bg-red-900/20 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      )}

      {/* فلاتر التاريخ */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-400">من تاريخ</label>
            <DatePicker
              date={fromDate ? new Date(fromDate) : undefined}
              onChange={(d) => setFromDate(d ? d.toISOString().slice(0, 10) : "")}
              className="border-slate-700 bg-slate-950 h-8 text-xs px-2"
            />
          </div>

          <div className="flex flex-col gap-1 md:ms-3">
            <label className="text-[11px] text-slate-400">إلى تاريخ</label>
            <DatePicker
              date={toDate ? new Date(toDate) : undefined}
              onChange={(d) => setToDate(d ? d.toISOString().slice(0, 10) : "")}
              className="border-slate-700 bg-slate-950 h-8 text-xs px-2"
            />
          </div>

          <button
            type="button"
            onClick={handleClear}
            disabled={loading}
            className="mt-2 md:mt-0 md:ms-3 inline-flex items-center justify-center rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-60"
          >
            تفريغ الفترة
          </button>
        </div>

        <button
          type="button"
          onClick={handleApply}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {loading ? "جاري التحديث..." : "تطبيق الفترة"}
        </button>
      </div>

      {!loading && data && (
        <>
          {/* كروت الملخص */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <div className="text-xs text-slate-400 mb-1">
                الرصيد الافتتاحي
              </div>
              <div className="text-lg font-semibold">
                LYD {formatMoney(opening)}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <div className="text-xs text-slate-400 mb-1">إجمالي الفواتير</div>
              <div className="text-lg font-semibold text-emerald-300">
                LYD {formatMoney(data.totalDebit)}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <div className="text-xs text-slate-400 mb-1">
                إجمالي الدفعات / رصيد نهائي
              </div>
              <div className="text-sm font-semibold text-amber-300">
                دفعات: LYD {formatMoney(data.totalCredit)}
              </div>
              <div className="text-sm font-semibold mt-1">
                الرصيد النهائي (لصالح المورد):{" "}
                <span className="text-sky-300">
                  LYD {formatMoney(data.closingBalance)}
                </span>
              </div>
            </div>
          </div>

          {/* جدول الحركات */}
          <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs overflow-auto">
            {safeRows.length === 0 ? (
              <div className="text-slate-500 text-xs">
                لا توجد حركات على هذا المورد بعد.
              </div>
            ) : (
              <table className="w-full text-[11px] text-right border-separate border-spacing-y-1 min-w-[980px]">
                <thead className="text-slate-400">
                  <tr>
                    <th className="px-2 py-1">التاريخ</th>
                    <th className="px-2 py-1">النوع</th>
                    <th className="px-2 py-1">المرجع</th>
                    <th className="px-2 py-1">الوصف</th>
                    <th className="px-2 py-1">مدين</th>
                    <th className="px-2 py-1">دائن</th>
                    <th className="px-2 py-1">الرصيد</th>
                    <th className="px-2 py-1">تفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {/* صف افتتاحي */}
                  <tr className="bg-slate-900/60 border border-slate-800 rounded-xl">
                    <td className="px-2 py-1">—</td>
                    <td className="px-2 py-1">افتتاحي</td>
                    <td className="px-2 py-1">—</td>
                    <td className="px-2 py-1">الرصيد الافتتاحي</td>
                    <td className="px-2 py-1 text-emerald-300">0.000</td>
                    <td className="px-2 py-1 text-amber-300">0.000</td>
                    <td className="px-2 py-1 text-sky-300">
                      {formatMoney(opening)}
                    </td>
                    <td className="px-2 py-1">—</td>
                  </tr>

                  {safeRows.map((r, idx) => (
                    <tr
                      key={`${idx}-${r.ref}-${r.date}`}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl"
                    >
                      <td className="px-2 py-1 align-top">
                        {formatDate(r.date)}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {r.kind === "INVOICE" ? "فاتورة شراء" : "دفعة مورد"}
                      </td>
                      <td className="px-2 py-1 align-top">{r.ref}</td>
                      <td className="px-2 py-1 align-top max-w-[260px]">
                        <span className="line-clamp-2">{r.description}</span>
                      </td>
                      <td className="px-2 py-1 align-top text-emerald-300">
                        {formatMoney(r.debit)}
                      </td>
                      <td className="px-2 py-1 align-top text-amber-300">
                        {formatMoney(r.credit)}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {formatMoney(r.balance)}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <button
                          type="button"
                          onClick={() => openDrillDown(r)}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px]"
                        >
                          فتح
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
