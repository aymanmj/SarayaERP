// src/pages/BalanceSheetPage.tsx

import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "CONTRA_ASSET"
  | "CONTRA_REVENUE";

type BalanceSheetAccount = {
  accountId: number;
  code: string;
  name: string;
  type: AccountType;
  balance: number; // مدين - دائن
};

type Section = {
  total: number;
  accounts: BalanceSheetAccount[];
};

type BalanceSheetResponse = {
  asOfDate: string;
  assets: Section;
  liabilities: Section;
  equity: Section;
  totals: {
    assets: number;
    liabilitiesAndEquity: number;
    difference: number;
  };
};

function formatDateInput(d: Date) {
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}LYD ${abs.toFixed(3)}`;
}

export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState<string>(formatDateInput(new Date()));
  const [data, setData] = useState<BalanceSheetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const res = await apiClient.get<BalanceSheetResponse>(
        "/accounting/balance-sheet",
        {
          params: { asOfDate },
        }
      );

      setData(res.data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      setError(
        typeof msg === "string"
          ? msg
          : "حدث خطأ أثناء جلب بيانات الميزانية العمومية."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // تحميل أولي
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assetsTotal = data?.totals.assets ?? 0;
  const liabEqTotal = data?.totals.liabilitiesAndEquity ?? 0;
  const diff = data?.totals.difference ?? 0;

  // 🔗 فتح دفتر الأستاذ لحساب من داخل الميزانية
  function openLedgerFor(acc: BalanceSheetAccount) {
    const params = new URLSearchParams();
    params.set("accountId", String(acc.accountId));

    if (asOfDate) {
      // من بداية السنة نفسها (1/1) إلى تاريخ الميزانية
      const year = asOfDate.slice(0, 4);
      const fromDate = `${year}-01-01`;
      params.set("from", fromDate);
      params.set("to", asOfDate);
    }

    navigate(`/accounting/ledger?${params.toString()}`);
  }

  return (
    <div className="p-6 space-y-6 text-slate-100">
      {/* العنوان والشريط العلوي */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">الميزانية العمومية</h1>
          <p className="text-sm text-gray-400">
            استعراض المركز المالي للمنشأة حتى تاريخ معيّن.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            حتى تاريخ:{" "}
            <span className="font-semibold">
              {formatDate(asOfDate)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-300">حتى تاريخ:</label>
            <DatePicker
              date={asOfDate ? new Date(asOfDate) : undefined}
              onChange={(d) => setAsOfDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-gray-900 border-gray-700 h-9 text-sm px-2 text-gray-100"
            />
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-sm text-white disabled:opacity-60"
          >
            {loading ? "جارِ التحديث..." : "تحديث"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-500/40"
          >
            <span>🖨️</span>
            <span>طباعة الميزانية</span>
          </button>
        </div>
      </div>

      {/* كروت الملخص */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-sm text-gray-400">إجمالي الأصول</p>
          <p className="mt-2 text-xl font-semibold text-emerald-400">
            {formatMoney(assetsTotal)}
          </p>
        </div>

        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-sm text-gray-400">
            إجمالي الالتزامات + حقوق الملكية
          </p>
          <p className="mt-2 text-xl font-semibold text-emerald-400">
            {formatMoney(liabEqTotal)}
          </p>
        </div>

        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-sm text-gray-400">الفرق (يجب أن يكون 0)</p>
          <p
            className={
              "mt-2 text-xl font-semibold " +
              (Math.abs(diff) < 0.001 ? "text-emerald-400" : "text-red-400")
            }
          >
            {formatMoney(diff)}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* الجداول الرئيسية */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* الأصول */}
        <div className="rounded-2xl bg-gray-900 border border-gray-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h2 className="font-semibold text-gray-100">الأصول</h2>
            <span className="text-sm text-emerald-400 font-semibold">
              {formatMoney(assetsTotal)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-900/60 border-b border-gray-800">
                <tr>
                  <th className="px-4 py-2 text-right text-gray-400">
                    رقم الحساب
                  </th>
                  <th className="px-4 py-2 text-right text-gray-400">
                    اسم الحساب
                  </th>
                  <th className="px-4 py-2 text-right text-gray-400">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {data?.assets.accounts.map((acc) => (
                  <tr
                    key={acc.accountId}
                    onClick={() => openLedgerFor(acc)}
                    className="border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer"
                  >
                    <td className="px-4 py-2 text-right text-emerald-300">
                      {acc.code}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-200">
                      {acc.name}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-300">
                      {formatMoney(acc.balance)}
                    </td>
                  </tr>
                ))}
                {data && data.assets.accounts.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-4 text-center text-gray-500"
                    >
                      لا توجد أرصدة أصول مسجلة حتى هذا التاريخ.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* الالتزامات وحقوق الملكية */}
        <div className="space-y-6">
          {/* الالتزامات */}
          <div className="rounded-2xl bg-gray-900 border border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h2 className="font-semibold text-gray-100">الالتزامات</h2>
              <span className="text-sm text-emerald-400 font-semibold">
                {formatMoney(-(data?.liabilities.total ?? 0))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900/60 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-right text-gray-400">
                      رقم الحساب
                    </th>
                    <th className="px-4 py-2 text-right text-gray-400">
                      اسم الحساب
                    </th>
                    <th className="px-4 py-2 text-right text-gray-400">
                      الرصيد
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.liabilities.accounts.map((acc) => (
                    <tr
                      key={acc.accountId}
                      onClick={() => openLedgerFor(acc)}
                      className="border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer"
                    >
                      <td className="px-4 py-2 text-right text-emerald-300">
                        {acc.code}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-200">
                        {acc.name}
                      </td>
                      <td className="px-4 py-2 text-right text-emerald-300">
                        {formatMoney(-acc.balance)}
                      </td>
                    </tr>
                  ))}
                  {data && data.liabilities.accounts.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-4 text-center text-gray-500"
                      >
                        لا توجد التزامات مسجلة حتى هذا التاريخ.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* حقوق الملكية */}
          <div className="rounded-2xl bg-gray-900 border border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h2 className="font-semibold text-gray-100">حقوق الملكية</h2>
              <span className="text-sm text-emerald-400 font-semibold">
                {formatMoney(-(data?.equity.total ?? 0))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900/60 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-right text-gray-400">
                      رقم الحساب
                    </th>
                    <th className="px-4 py-2 text-right text-gray-400">
                      اسم الحساب
                    </th>
                    <th className="px-4 py-2 text-right text-gray-400">
                      الرصيد
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.equity.accounts.map((acc) => (
                    <tr
                      key={acc.accountId}
                      onClick={() => openLedgerFor(acc)}
                      className="border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer"
                    >
                      <td className="px-4 py-2 text-right text-emerald-300">
                        {acc.code}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-200">
                        {acc.name}
                      </td>
                      <td className="px-4 py-2 text-right text-emerald-300">
                        {formatMoney(-acc.balance)}
                      </td>
                    </tr>
                  ))}
                  {data && data.equity.accounts.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-4 text-center text-gray-500"
                      >
                        لا توجد أرصدة لحقوق الملكية حتى هذا التاريخ.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* إجمالي الالتزامات + حقوق الملكية */}
          <div className="rounded-2xl bg-gray-900 border border-gray-800 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-300">
              إجمالي الالتزامات + حقوق الملكية
            </span>
            <span className="text-sm font-semibold text-emerald-400">
              {formatMoney(liabEqTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
