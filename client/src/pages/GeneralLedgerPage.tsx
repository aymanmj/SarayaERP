// src/pages/GeneralLedgerPage.tsx

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type AccountLite = {
  id: number;
  code: string;
  name: string;
  type?: string;
};

type LedgerLine = {
  id: number;
  entryDate: string;
  description: string | null;
  reference: string | null;
  sourceModule: string | null;
  sourceId: number | null;
  debit: number;
  credit: number;
  balance: number;
};

type LedgerResponse = {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  from: string;
  to: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  lines: LedgerLine[];
};

type SourceModule =
  | "BILLING"
  | "CASHIER"
  | "INVENTORY"
  | "MANUAL"
  | "OPENING"
  | "CLOSING"
  | "PAYROLL";

const SOURCE_MODULES: SourceModule[] = [
  "BILLING",
  "CASHIER",
  "INVENTORY",
  "MANUAL",
  "OPENING",
  "CLOSING",
  "PAYROLL",
];

// Local formatDate removed

function formatDateTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ar-LY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(val: number | string | null | undefined) {
  const num = Number(val ?? 0);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

// تنسيق الرصيد الموقَّع (مدين/دائن)
function formatSignedBalance(val: number | string | null | undefined) {
  const num = Number(val ?? 0);
  const side = num >= 0 ? "مدين" : "دائن";
  const abs = Math.abs(num);
  return `${formatMoney(abs)} ${side}`;
}

function normalizeSourceModule(
  v: string | null | undefined,
): SourceModule | null {
  if (!v) return null;
  const up = v.toUpperCase();
  return SOURCE_MODULES.includes(up as SourceModule)
    ? (up as SourceModule)
    : null;
}

const sourceLabels: Record<SourceModule, string> = {
  BILLING: "الفوترة",
  CASHIER: "الخزينة",
  INVENTORY: "المخزون",
  MANUAL: "قيد يدوي",
  OPENING: "أرصدة افتتاحية",
  CLOSING: "إقفال",
  PAYROLL: "المرتبات",
};

// ✅ تخمين نوع المستند من الوصف (عشان يعالج البيانات القديمة/الملخبطة)
function guessDocKind(ln: LedgerLine): "INVOICE" | "PAYMENT" | null {
  const d = (ln.description ?? "").toLowerCase();

  // كلمات عربية شائعة
  if (d.includes("تحصيل") || d.includes("دفعة") || d.includes("سند قبض"))
    return "PAYMENT";
  if (d.includes("فاتورة")) return "INVOICE";

  return null;
}

function buildFallbackRoute(ln: LedgerLine) {
  const q = new URLSearchParams();
  if (ln.sourceModule) q.set("sourceModule", ln.sourceModule);
  if (ln.sourceId) q.set("sourceId", String(ln.sourceId));
  // ✅ fallback محترم: نفتح شاشة القيود (دفتر اليومية/القيود)
  return `/accounting/entries?${q.toString()}`;
}

// ✅ خريطة موحدة للمسارات (مطابقة لـ Router عندك)
function resolveSourceRoute(ln: LedgerLine): string | null {
  if (!ln.sourceModule || !ln.sourceId) return null;

  const mod = normalizeSourceModule(ln.sourceModule);
  const id = ln.sourceId;

  // 1) لو نعرف نوعه من الوصف → نعطيه أولوية (يعالج البيانات القديمة)
  const kind = guessDocKind(ln);
  if (kind === "INVOICE") return `/billing/invoices/${id}`;
  if (kind === "PAYMENT") return `/payments/${id}/receipt`;

  // 2) وإلا نعتمد على sourceModule كافتراضي
  switch (mod) {
    case "BILLING":
      return `/billing/invoices/${id}`;

    case "CASHIER":
      return `/payments/${id}/receipt`;

    case "OPENING":
      // لو عندك لاحقاً فلترة بالسنة المالية استخدم query
      return `/accounting/opening-balances?financialYearId=${id}`;

    case "CLOSING":
      return `/accounting/year-closing?financialYearId=${id}`;

    case "INVENTORY":
      // حالياً عندك صفحة مشتريات فقط
      return `/purchases/invoices`;

    case "MANUAL":
    case "PAYROLL":
    default:
      return buildFallbackRoute(ln);
  }
}

export default function GeneralLedgerPage() {
  const today = new Date().toISOString().slice(0, 10);
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>(today.slice(0, 8) + "01"); // أول الشهر
  const [toDate, setToDate] = useState<string>(today);

  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchParams] = useSearchParams();

  // // أسماء ودية للمصادر
  // const sourceLabels: Record<string, string> = {
  //   INVENTORY: "المخزون",
  //   BILLING: "الفوترة",
  //   CASHIER_RECEIPT: "سند قبض",
  //   CASHIER_REFUND: "سند صرف",
  //   MANUAL_JOURNAL: "قيد يدوي",
  // };

  // // خريطة مسارات المستندات حسب الـ sourceModule (عدّل المسارات حسب الـ Router عندك)
  // const sourceRoutes: Record<string, (id: number) => string> = {
  //   // فاتورة مشتريات / حركة مخزون
  //   INVENTORY: (id) => `/inventory/documents/${id}`,
  //   // فاتورة مريض / فوترة
  //   BILLING: (id) => `/billing/invoices/${id}`,
  //   // أمثلة أخرى
  //   CASHIER_RECEIPT: (id) => `/cashier/receipts/${id}`,
  //   CASHIER_REFUND: (id) => `/cashier/refunds/${id}`,
  //   MANUAL_JOURNAL: (id) => `/accounting/manual-entries/${id}`,
  // };

  const handleOpenSource = (ln: LedgerLine) => {
    const route = resolveSourceRoute(ln);
    if (!route) return;
    navigate(route);
  };

  // تحميل الحسابات (نفس مصدر شاشة القيد اليدوي)
  const loadAccounts = async () => {
    try {
      const res = await apiClient.get<AccountLite[]>("/accounting/accounts");
      setAccounts(res.data);
    } catch (err: any) {
      console.error(err);
      toast.error("تعذر تحميل قائمة الحسابات.");
    }
  };

  const loadLedger = async () => {
    if (!accountId) {
      toast.warning("اختر حساباً أولاً.");
      return;
    }

    if (!fromDate || !toDate) {
      toast.warning("يرجى تحديد تاريخي البداية والنهاية.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append("accountId", accountId);
      params.append("from", fromDate);
      params.append("to", toDate);

      const res = await apiClient.get<LedgerResponse>(
        `/accounting/ledger?${params.toString()}`,
      );

      setLedger(res.data);
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      if (typeof msg === "string") {
        setError(msg);
        toast.error(msg);
      } else {
        setError("حدث خطأ أثناء تحميل دفتر الأستاذ.");
        toast.error("حدث خطأ أثناء تحميل دفتر الأستاذ.");
      }
    } finally {
      setLoading(false);
    }
  };

  // قراءة بارامترات من روابط أخرى (مثلاً من ميزان المراجعة)
  useEffect(() => {
    const acc = searchParams.get("accountId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (acc) setAccountId(acc);
    if (from) setFromDate(from);
    if (to) setToDate(to);
  }, [searchParams]);

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountInfo = useMemo(
    () =>
      ledger
        ? `${ledger.accountCode} – ${ledger.accountName}`
        : accountId
          ? (() => {
              const acc = accounts.find((a) => a.id === Number(accountId));
              return acc ? `${acc.code} – ${acc.name}` : "";
            })()
          : "",
    [ledger, accounts, accountId],
  );

  return (
    <div className="flex flex-col h-full text-slate-100">
      {/* العنوان */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">دفتر الأستاذ العام</h1>
          <p className="text-sm text-slate-400">
            استعراض حركة حساب محدد خلال فترة زمنية مع رصيد افتتاحي ورصيد تراكمي
            لكل قيد.
          </p>
        </div>
        <button
          type="button"
          onClick={loadLedger}
          className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-100"
        >
          تحديث
        </button>
      </div>

      {/* فلاتر */}
      <div className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 space-y-3 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* اختيار الحساب */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">الحساب</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            >
              <option value="">اختر الحساب...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} – {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* من تاريخ */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">من تاريخ</label>
            <DatePicker
              date={fromDate ? new Date(fromDate) : undefined}
              onChange={(d) => setFromDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-900 border-slate-700 h-9 text-xs"
            />
          </div>

          {/* إلى تاريخ */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">إلى تاريخ</label>
            <DatePicker
              date={toDate ? new Date(toDate) : undefined}
              onChange={(d) => setToDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-900 border-slate-700 h-9 text-xs"
            />
          </div>

          {/* زر */}
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={loadLedger}
              className="w-full px-3 py-2 rounded-2xl text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              تطبيق الفلترة
            </button>
            {loading && (
              <span className="mt-1 text-[11px] text-slate-500">
                جارِ تحميل البيانات...
              </span>
            )}
            {error && (
              <span className="mt-1 text-[11px] text-rose-400">{error}</span>
            )}
          </div>
        </div>
      </div>

      {/* محتوى */}
      {!ledger ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
          اختر حساباً وحدد الفترة الزمنية، ثم اضغط على &quot;تطبيق
          الفلترة&quot;.
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 overflow-auto pb-4 text-xs">
          {/* ملخص أعلى */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col md:flex-row md:justify-between gap-3">
            <div>
              <div className="text-slate-400 mb-1">الحساب</div>
              <div className="text-sm font-semibold text-slate-100">
                {accountInfo}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                الفترة: من {formatDate(ledger.from)} إلى {formatDate(ledger.to)}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2">
                <div className="text-slate-400">الرصيد الافتتاحي</div>
                <div className="text-sm font-semibold text-slate-100">
                  {formatSignedBalance(ledger.openingBalance)} LYD
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2">
                <div className="text-slate-400">إجمالي المدين</div>
                <div className="text-sm font-semibold text-emerald-300">
                  {formatMoney(ledger.totalDebit)} LYD
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2">
                <div className="text-slate-400">إجمالي الدائن</div>
                <div className="text-sm font-semibold text-amber-300">
                  {formatMoney(ledger.totalCredit)} LYD
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2">
                <div className="text-slate-400">الرصيد الختامي</div>
                <div className="text-sm font-semibold text-slate-100">
                  {formatSignedBalance(ledger.closingBalance)} LYD
                </div>
              </div>
            </div>
          </div>

          {/* جدول الحركة */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">
              حركة الحساب خلال الفترة
            </h2>

            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-[11px] text-right border-separate border-spacing-y-1">
                <thead className="text-slate-400">
                  <tr>
                    <th className="px-2 py-1 text-right">التاريخ</th>
                    <th className="px-2 py-1 text-right">الوصف / البيان</th>
                    <th className="px-2 py-1 text-right">المرجع</th>
                    <th className="px-2 py-1 text-right">مدين</th>
                    <th className="px-2 py-1 text-right">دائن</th>
                    <th className="px-2 py-1 text-right">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {/* سطر الرصيد الافتتاحي */}
                  <tr className="bg-slate-950/90 border border-slate-800 rounded-xl">
                    <td className="px-2 py-1 align-top">
                      {formatDate(ledger.from)}
                    </td>
                    <td className="px-2 py-1 align-top text-slate-300">
                      رصيد افتتاحي
                    </td>
                    <td className="px-2 py-1 align-top">—</td>
                    <td className="px-2 py-1 align-top">—</td>
                    <td className="px-2 py-1 align-top">—</td>
                    <td className="px-2 py-1 align-top font-semibold text-slate-100">
                      {formatSignedBalance(ledger.openingBalance)} LYD
                    </td>
                  </tr>

                  {ledger.lines.map((ln) => (
                    <tr
                      key={ln.id}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl"
                    >
                      <td className="px-2 py-1 align-top">
                        {formatDateTime(ln.entryDate)}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {ln.description ?? "—"}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <div>{ln.reference ?? "—"}</div>
                        {ln.sourceModule && ln.sourceId && (
                          <button
                            type="button"
                            onClick={() => handleOpenSource(ln)}
                            className="mt-0.5 text-[10px] text-emerald-400 hover:underline"
                          >
                            {normalizeSourceModule(ln.sourceModule)
                              ? sourceLabels[
                                  normalizeSourceModule(ln.sourceModule)!
                                ]
                              : ln.sourceModule}{" "}
                            #{ln.sourceId}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-1 align-top text-emerald-300">
                        {ln.debit ? `${formatMoney(ln.debit)} LYD` : "—"}
                      </td>
                      <td className="px-2 py-1 align-top text-amber-300">
                        {ln.credit ? `${formatMoney(ln.credit)} LYD` : "—"}
                      </td>
                      <td className="px-2 py-1 align-top font-semibold text-slate-100">
                        {formatSignedBalance(ln.balance)} LYD
                      </td>
                    </tr>
                  ))}

                  {ledger.lines.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-2 py-4 text-center text-slate-500"
                      >
                        لا توجد قيود مسجّلة لهذا الحساب في الفترة المحددة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
