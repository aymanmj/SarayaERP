import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type LedgerLineDto = {
  date: string;
  entryId: number;
  description?: string;
  debit: number;
  credit: number;
  balance: number;
};

type LedgerResponse = {
  account: {
    id: number;
    code: string;
    name: string;
    type: string;
  };
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  lines: LedgerLineDto[];
};

// Local formatDate removed

function formatNumber(n: number | undefined | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

export default function AccountLedgerPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const accountIdParam = searchParams.get("accountId");
  const [from, setFrom] = useState<string | undefined>(
    searchParams.get("from") ?? undefined
  );
  const [to, setTo] = useState<string | undefined>(
    searchParams.get("to") ?? undefined
  );

  const accountId = accountIdParam ? Number(accountIdParam) : NaN;

  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId || Number.isNaN(accountId)) {
      setError("لم يتم تحديد حساب بشكل صحيح.");
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = { accountId: String(accountId) };
        if (from) params.from = from;
        if (to) params.to = to;

        const res = await apiClient.get<LedgerResponse>("/accounting/ledger", {
          params,
        });

        setData(res.data);

        // تأكيد تزامن الـ URL مع الفلاتر
        setSearchParams(params);
       
      } catch (err: any) {
        console.error(err);
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          "حدث خطأ أثناء تحميل دفتر الأستاذ.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [accountId, from, to, setSearchParams]);

  const account = data?.account;

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-100 text-xs"
          >
            ← رجوع
          </button>
          <div>
            <h1 className="text-2xl font-bold mb-1">دفتر الأستاذ</h1>
            <p className="text-sm text-slate-400">
              استعراض الحركات المحاسبية على حساب محدد مع الرصيد التراكمي.
            </p>
          </div>
        </div>

        {account && (
          <div className="text-right text-sm">
            <div className="font-semibold text-slate-100">{account.name}</div>
            <div className="text-slate-400">
              الكود: {account.code} — النوع: {account.type}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => window.print()}
          className="print:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-500/40"
        >
          <span>🖨️</span>
          <span>طباعة دفتر الأستاذ</span>
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 flex flex-wrap items-end gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">من تاريخ</label>
          <DatePicker
            date={from ? new Date(from) : undefined}
            onChange={(d) => setFrom(d ? d.toISOString().slice(0, 10) : undefined)}
            className="bg-slate-900/70 border-slate-700/60 h-8 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">إلى تاريخ</label>
          <DatePicker
            date={to ? new Date(to) : undefined}
            onChange={(d) => setTo(d ? d.toISOString().slice(0, 10) : undefined)}
            className="bg-slate-900/70 border-slate-700/60 h-8 text-xs"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            // مجرد إعادة setFrom/setTo تكفي لأن useEffect يعتمد عليهم
            setFrom(from ?? undefined);
            setTo(to ?? undefined);
          }}
          className="px-4 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 text-xs text-white"
        >
          تطبيق الفلتر
        </button>

        <button
          type="button"
          onClick={() => {
            setFrom(undefined);
            setTo(undefined);
            setSearchParams({ accountId: String(accountId) });
          }}
          className="px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
        >
          مسح الفلاتر
        </button>
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="mb-4 text-sm text-rose-300 bg-rose-950/40 border border-rose-700/60 rounded-xl px-4 py-2">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          جارِ تحميل البيانات...
        </div>
      )}

      {!loading && !data && !error && (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          لا توجد بيانات متاحة.
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Summary */}
          <div className="space-y-4 xl:col-span-1">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">
                ملخص الحساب
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">الفترة:</span>
                  <span className="text-slate-100">
                    {formatDate(data.fromDate)} — {formatDate(data.toDate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">الرصيد الافتتاحي:</span>
                  <span className="text-sky-300">
                    LYD {formatNumber(data.openingBalance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">إجمالي المدين:</span>
                  <span className="text-emerald-300">
                    LYD {formatNumber(data.totalDebit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">إجمالي الدائن:</span>
                  <span className="text-rose-300">
                    LYD {formatNumber(data.totalCredit)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-2 mt-2">
                  <span className="text-slate-400">الرصيد الختامي:</span>
                  <span className="text-sky-300 font-semibold">
                    LYD {formatNumber(data.closingBalance)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Lines table */}
          <div className="space-y-4 xl:col-span-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">
                حركات الحساب (دفتر الأستاذ)
              </h2>

              {data.lines.length === 0 ? (
                <div className="py-4 text-xs text-slate-500 text-center">
                  لا توجد حركات في هذه الفترة لهذا الحساب.
                </div>
              ) : (
                <div className="overflow-x-auto text-xs">
                  <table className="min-w-full text-right">
                    <thead className="text-[11px] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-2">التاريخ</th>
                        <th className="py-2 px-2">رقم القيد</th>
                        <th className="py-2 px-2">الوصف</th>
                        <th className="py-2 px-2">مدين</th>
                        <th className="py-2 px-2">دائن</th>
                        <th className="py-2 px-2">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((line, idx) => (
                        <tr
                          key={`${line.entryId}-${idx}`}
                          className="border-b border-slate-900/80 hover:bg-slate-900/60"
                        >
                          <td className="py-2 px-2">{formatDate(line.date)}</td>
                          <td className="py-2 px-2">قيد #{line.entryId}</td>
                          <td className="py-2 px-2 text-slate-200 truncate max-w-xs">
                            {line.description || "—"}
                          </td>
                          <td className="py-2 px-2 text-emerald-300">
                            LYD {formatNumber(line.debit)}
                          </td>
                          <td className="py-2 px-2 text-rose-300">
                            LYD {formatNumber(line.credit)}
                          </td>
                          <td className="py-2 px-2 text-sky-300">
                            LYD {formatNumber(line.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
