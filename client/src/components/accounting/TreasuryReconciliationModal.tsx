import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { formatMoney, formatRate } from "../../utils/money";
import { toast } from "sonner";

interface CurrencyItem {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  symbol: string;
  decimalPlaces: number;
  isBase: boolean;
}

interface ExchangeRateItem {
  id: number;
  rate: string;
  inverseRate: string;
  effectiveDate: string;
  source: string;
  referenceNote: string | null;
  isVerified: boolean;
  fromCurrency: CurrencyItem;
  toCurrency: CurrencyItem;
}

interface BankAccountItem {
  id: number;
  bankName: string;
  branchName: string | null;
  accountNumber: string;
  account: { id: number; code: string; name: string };
  currency: { id: number; code: string; symbol: string };
}

interface ReconSessionSummary {
  id: number;
  statementNumber: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceBank: string;
  closingBalanceBank: string;
  bookBalanceAsOfEnd: string;
  reconciledBalance: string;
  differenceAmount: string;
  status: string;
  bankAccount: BankAccountItem;
  items?: Array<{
    id: number;
    reference: string;
    description: string | null;
    direction: string;
    amount: string;
    foreignAmount: string | null;
    exchangeRateUsed: string | null;
    matchStatus: string;
    transactionDate: string;
  }>;
  summary?: {
    totalItemsCount: number;
    unmatchedItemsCount: number;
    matchedItemsCount: number;
    adjustedItemsCount: number;
    depositsInTransit: string;
    outstandingChecks: string;
    isBalanced: boolean;
  };
}

interface FxRevaluationItem {
  id: number;
  asOfDate: string;
  currencyCode: string;
  foreignBalance: string;
  bookBalanceBase: string;
  closingRate: string;
  revaluedBalanceBase: string;
  unrealizedGainLoss: string;
  accountingEntryId: number | null;
  notes?: string | null;
  bankAccount: { id: number; bankName: string; accountNumber: string };
}

interface TreasuryReconciliationModalProps {
  open: boolean;
  onClose: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  CBL_OFFICIAL: "مصرف ليبيا المركزي",
  COMMERCIAL_BANK: "مصرف تجاري",
  MANUAL: "إدخال يدوي",
  API_FEED: "مزود إلكتروني",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "مسودة", cls: "bg-slate-800 text-slate-300 border-slate-700" },
  IN_PROGRESS: {
    label: "قيد التسوية",
    cls: "bg-amber-950/60 text-amber-300 border-amber-500/40",
  },
  PENDING_APPROVAL: {
    label: "بانتظار الاعتماد (4 عيون)",
    cls: "bg-sky-950/60 text-sky-300 border-sky-500/40",
  },
  CLOSED: {
    label: "مغلقة ومعتمدة",
    cls: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40",
  },
};

export function TreasuryReconciliationModal({
  open,
  onClose,
}: TreasuryReconciliationModalProps) {
  const [activeTab, setActiveTab] = useState<"fx" | "recon" | "reval">("fx");
  const [loading, setLoading] = useState(false);

  // Currencies & FX
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([]);
  const [rates, setRates] = useState<ExchangeRateItem[]>([]);
  const [newCurrCode, setNewCurrCode] = useState("");
  const [newCurrNameAr, setNewCurrNameAr] = useState("");
  const [newCurrNameEn, setNewCurrNameEn] = useState("");
  const [newCurrSymbol, setNewCurrSymbol] = useState("");
  const [newCurrDecimals, setNewCurrDecimals] = useState(3);
  const [newCurrIsBase, setNewCurrIsBase] = useState(false);

  const [fromCurrencyId, setFromCurrencyId] = useState<string>("");
  const [toCurrencyId, setToCurrencyId] = useState<string>("");
  const [rateValue, setRateValue] = useState("");
  const [rateDate, setRateDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [rateSource, setRateSource] = useState("CBL_OFFICIAL");

  // Converter
  const [convFrom, setConvFrom] = useState("");
  const [convTo, setConvTo] = useState("");
  const [convAmount, setConvAmount] = useState("100.000");
  const [convResult, setConvResult] = useState<{
    convertedAmount: string;
    rateUsed: string;
    triangulated: boolean;
    source: string;
  } | null>(null);

  // Bank Reconciliation
  const [bankAccounts, setBankAccounts] = useState<BankAccountItem[]>([]);
  const [sessions, setSessions] = useState<ReconSessionSummary[]>([]);
  const [selectedSession, setSelectedSession] =
    useState<ReconSessionSummary | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // CSV / SWIFT MT940 Statement File Import
  const [importFormat, setImportFormat] = useState<"CSV" | "MT940">("CSV");
  const [importContent, setImportContent] = useState("");

  // FX Revaluation Runs
  const [revaluations, setRevaluations] = useState<FxRevaluationItem[]>([]);
  const [revalBankAccountId, setRevalBankAccountId] = useState("");
  const [revalForeignBalance, setRevalForeignBalance] = useState("");
  const [revalAsOfDate, setRevalAsOfDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [revalNotes, setRevalNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [currRes, rateRes, bankRes, sessRes, revalRes] = await Promise.all([
        apiClient.get<CurrencyItem[]>("/accounting/treasury/currencies"),
        apiClient.get<ExchangeRateItem[]>("/accounting/treasury/exchange-rates"),
        apiClient.get<BankAccountItem[]>("/accounting/treasury/bank-accounts"),
        apiClient.get<ReconSessionSummary[]>(
          "/accounting/treasury/reconciliations",
        ),
        apiClient.get<FxRevaluationItem[]>(
          "/accounting/treasury/fx-revaluations",
        ),
      ]);
      setCurrencies(currRes.data || []);
      setRates(rateRes.data || []);
      setBankAccounts(bankRes.data || []);
      setSessions(sessRes.data || []);
      setRevaluations(revalRes.data || []);
    } catch {
      toast.error("تعذر تحميل بيانات العملات والتسوية البنكية");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadData();
    }
  }, [open, loadData]);

  const loadSessionDetail = async (sessionId: number) => {
    try {
      const res = await apiClient.get<ReconSessionSummary>(
        `/accounting/treasury/reconciliations/${sessionId}`,
      );
      setSelectedSession(res.data);
    } catch {
      toast.error("تعذر تحميل تفاصيل جلسة التسوية");
    }
  };

  if (!open) return null;

  const handleCreateCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction("create-currency");
    try {
      await apiClient.post("/accounting/treasury/currencies", {
        code: newCurrCode.trim().toUpperCase(),
        nameAr: newCurrNameAr.trim(),
        nameEn: newCurrNameEn.trim(),
        symbol: newCurrSymbol.trim(),
        decimalPlaces: Number(newCurrDecimals),
        isBase: newCurrIsBase,
      });
      toast.success("تم تسجيل العملة بنجاح");
      setNewCurrCode("");
      setNewCurrNameAr("");
      setNewCurrNameEn("");
      setNewCurrSymbol("");
      setNewCurrIsBase(false);
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر تسجيل العملة";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRecordRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction("create-rate");
    try {
      await apiClient.post("/accounting/treasury/exchange-rates", {
        fromCurrencyId: Number(fromCurrencyId),
        toCurrencyId: Number(toCurrencyId),
        rate: rateValue.trim(),
        effectiveDate: `${rateDate}T00:00:00.000Z`,
        source: rateSource,
      });
      toast.success("تم تسجيل سعر الصرف بدقة 6 خانات عشرية");
      setRateValue("");
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر تسجيل سعر الصرف";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleVerifyRate = async (rateId: number) => {
    setBusyAction(`verify-rate-${rateId}`);
    try {
      await apiClient.post(
        `/accounting/treasury/exchange-rates/${rateId}/verify`,
      );
      toast.success("تم اعتماد سعر الصرف برقابة 4 عيون");
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر اعتماد سعر الصرف";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleConvert = async () => {
    if (!convFrom || !convTo || !convAmount) return;
    setBusyAction("convert");
    try {
      const res = await apiClient.post("/accounting/treasury/convert", {
        fromCode: convFrom,
        toCode: convTo,
        amount: convAmount.trim(),
      });
      setConvResult(res.data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "لا يوجد سعر صرف فعال لهذا الزوج";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleAutoMatch = async (sessionId: number) => {
    setBusyAction(`automatch-${sessionId}`);
    try {
      const res = await apiClient.post<{
        matchedCount: number;
        session: ReconSessionSummary;
      }>(`/accounting/treasury/reconciliations/${sessionId}/auto-match`, {
        dateToleranceDays: 3,
      });
      toast.success(`تمت مطابقة ${res.data.matchedCount} حركة تلقائيًا`);
      setSelectedSession(res.data.session);
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذرت المطابقة التلقائية";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePostBankChargeAdjustment = async (itemId: number) => {
    setBusyAction(`adjust-${itemId}`);
    try {
      const res = await apiClient.post<{ session: ReconSessionSummary }>(
        `/accounting/treasury/reconciliations/items/${itemId}/adjust`,
        { adjustmentType: "BANK_CHARGES" },
      );
      toast.success("تم ترحيل قيد عمولة بنكية ومطابقة البند");
      setSelectedSession(res.data.session);
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر ترحيل قيد التسوية";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSubmitSession = async (sessionId: number) => {
    setBusyAction(`submit-${sessionId}`);
    try {
      const res = await apiClient.post<ReconSessionSummary>(
        `/accounting/treasury/reconciliations/${sessionId}/submit`,
      );
      toast.success("تم تقديم جلسة التسوية للاعتماد (4 عيون)");
      setSelectedSession(res.data);
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر تقديم جلسة التسوية";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleApproveCloseSession = async (sessionId: number) => {
    setBusyAction(`approve-${sessionId}`);
    try {
      const res = await apiClient.post<ReconSessionSummary>(
        `/accounting/treasury/reconciliations/${sessionId}/approve-close`,
      );
      toast.success("تم اعتماد وإغلاق جلسة التسوية البنكية نهائيًا");
      setSelectedSession(res.data);
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر اعتماد وإغلاق التسوية";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleStatementFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportContent(text);
    if (
      file.name.toLowerCase().endsWith(".sta") ||
      file.name.toLowerCase().endsWith(".mt940") ||
      text.includes(":61:")
    ) {
      setImportFormat("MT940");
    } else {
      setImportFormat("CSV");
    }
  };

  const handleImportStatementFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !importContent.trim()) return;
    setBusyAction(`import-file-${selectedSession.id}`);
    try {
      const res = await apiClient.post<{
        importedCount: number;
        session: ReconSessionSummary;
      }>(
        `/accounting/treasury/reconciliations/${selectedSession.id}/import-file`,
        {
          format: importFormat,
          content: importContent,
        },
      );
      toast.success(
        `تم استيراد ${res.data.importedCount} حركة من ملف ${importFormat} بنجاح`,
      );
      setImportContent("");
      setSelectedSession(res.data.session);
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر تحليل أو استيراد ملف كشف البنك";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunFxRevaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revalBankAccountId || !revalForeignBalance.trim()) return;
    setBusyAction("run-fx-reval");
    try {
      await apiClient.post("/accounting/treasury/fx-revaluations", {
        bankAccountId: Number(revalBankAccountId),
        foreignBalance: revalForeignBalance.trim(),
        asOfDate: `${revalAsOfDate}T00:00:00.000Z`,
        notes: revalNotes.trim() || undefined,
      });
      toast.success(
        "تم تنفيذ إعادة تقييم فروق العملة وترحيل قيد الفروق غير المحققة بنجاح",
      );
      setRevalForeignBalance("");
      setRevalNotes("");
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "تعذر تنفيذ إعادة تقييم فروق العملة";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      dir="rtl"
      role="dialog"
      aria-label="العملات وأسعار الصرف والتسوية البنكية"
    >
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-black text-white">
              إدارة العملات وأسعار الصرف (DECIMAL 19,6) والتسوية البنكية العامة
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              دفتر أسعار الصرف التاريخي غير القابل للحذف والمطابقة البنكية مع قيود التسوية ورقابة 4 عيون
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("fx")}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                activeTab === "fx"
                  ? "bg-sky-600 border-sky-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              العملات وأسعار الصرف ({rates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("recon")}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                activeTab === "recon"
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              التسوية البنكية ({sessions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("reval")}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                activeTab === "reval"
                  ? "bg-amber-600 border-amber-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              إعادة التقييم ({revaluations.length})
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
            >
              إغلاق
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-center py-6 text-sm text-slate-400">
            جاري تحميل بيانات الخزينة...
          </div>
        )}

        {!loading && activeTab === "fx" && (
          <div className="space-y-6">
            {/* Currencies & Add Currency */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <form
                onSubmit={handleCreateCurrency}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3"
              >
                <h3 className="text-sm font-bold text-sky-300">
                  إضافة عملة جديدة (ISO 4217)
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <input
                    value={newCurrCode}
                    onChange={(e) => setNewCurrCode(e.target.value)}
                    placeholder="الرمز (LYD / USD / EUR)"
                    maxLength={3}
                    required
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                  />
                  <input
                    value={newCurrSymbol}
                    onChange={(e) => setNewCurrSymbol(e.target.value)}
                    placeholder="الرمز المختصر (د.ل / $)"
                    required
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                  />
                  <input
                    value={newCurrNameAr}
                    onChange={(e) => setNewCurrNameAr(e.target.value)}
                    placeholder="الاسم بالعربية"
                    required
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                  />
                  <input
                    value={newCurrNameEn}
                    onChange={(e) => setNewCurrNameEn(e.target.value)}
                    placeholder="English Name"
                    required
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                  />
                  <input
                    type="number"
                    min={0}
                    max={4}
                    value={newCurrDecimals}
                    onChange={(e) => setNewCurrDecimals(Number(e.target.value))}
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                    title="عدد الخانات العشرية"
                  />
                  <label className="flex items-center gap-2 px-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={newCurrIsBase}
                      onChange={(e) => setNewCurrIsBase(e.target.checked)}
                    />
                    عملة أساسية للمنشأة
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={busyAction === "create-currency"}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white"
                >
                  حفظ العملة
                </button>
              </form>

              <form
                onSubmit={handleRecordRate}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3"
              >
                <h3 className="text-sm font-bold text-emerald-300">
                  تسجيل سعر صرف تاريخي (دقة 6 خانات عشرية)
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <select
                    value={fromCurrencyId}
                    onChange={(e) => setFromCurrencyId(e.target.value)}
                    required
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                  >
                    <option value="">من عملة...</option>
                    {currencies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.nameAr}
                      </option>
                    ))}
                  </select>
                  <select
                    value={toCurrencyId}
                    onChange={(e) => setToCurrencyId(e.target.value)}
                    required
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                  >
                    <option value="">إلى عملة...</option>
                    {currencies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.nameAr}
                      </option>
                    ))}
                  </select>
                  <input
                    value={rateValue}
                    onChange={(e) => setRateValue(e.target.value)}
                    placeholder="سعر الصرف مثل 4.825500"
                    required
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
                  />
                  <input
                    type="date"
                    value={rateDate}
                    onChange={(e) => setRateDate(e.target.value)}
                    required
                    className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                  />
                  <select
                    value={rateSource}
                    onChange={(e) => setRateSource(e.target.value)}
                    className="col-span-2 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                  >
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={busyAction === "create-rate"}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                >
                  تسجيل سعر الصرف
                </button>
              </form>
            </div>

            {/* Instant Currency Converter */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 flex flex-wrap items-center gap-3 text-xs">
              <span className="font-bold text-slate-300">حاسبة التحويل الفوري:</span>
              <input
                value={convAmount}
                onChange={(e) => setConvAmount(e.target.value)}
                className="w-28 rounded-xl bg-slate-950 border border-slate-700 px-3 py-1.5 font-mono"
              />
              <select
                value={convFrom}
                onChange={(e) => setConvFrom(e.target.value)}
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-1.5"
              >
                <option value="">من</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
              <span>←</span>
              <select
                value={convTo}
                onChange={(e) => setConvTo(e.target.value)}
                className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-1.5"
              >
                <option value="">إلى</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleConvert}
                disabled={busyAction === "convert"}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-white"
              >
                تحويل
              </button>
              {convResult && (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 font-mono">
                  الناتج: {convResult.convertedAmount} {convTo} (السعر{" "}
                  {formatRate(convResult.rateUsed)}
                  {convResult.triangulated ? " — تثليث عبر العملة الأساسية" : ""})
                </div>
              )}
            </div>

            {/* Exchange Rates Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-3">الزوج</th>
                    <th className="p-3">سعر الصرف (6dp)</th>
                    <th className="p-3">السعر العكسي (6dp)</th>
                    <th className="p-3">المصدر</th>
                    <th className="p-3">تاريخ السريان</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {rates.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/50">
                      <td className="p-3 font-bold text-white">
                        {r.fromCurrency.code} / {r.toCurrency.code}
                      </td>
                      <td className="p-3 font-mono text-emerald-300">
                        {formatRate(r.rate)}
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {formatRate(r.inverseRate)}
                      </td>
                      <td className="p-3">
                        {SOURCE_LABELS[r.source] || r.source}
                      </td>
                      <td className="p-3 font-mono">
                        {r.effectiveDate.slice(0, 10)}
                      </td>
                      <td className="p-3">
                        {r.isVerified ? (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                            معتمد (4 عيون)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-950/60 text-amber-300 border border-amber-500/40">
                            بانتظار الاعتماد
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {!r.isVerified && (
                          <button
                            type="button"
                            onClick={() => handleVerifyRate(r.id)}
                            disabled={busyAction === `verify-rate-${r.id}`}
                            className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold"
                          >
                            اعتماد السعر
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500">
                        لا توجد أسعار صرف مسجلة بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && activeTab === "recon" && (
          <div className="space-y-6">
            {/* Bank Accounts Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {bankAccounts.map((ba) => (
                <div
                  key={ba.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-1"
                >
                  <div className="text-sm font-bold text-white">
                    {ba.bankName}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {ba.accountNumber} ({ba.currency.code})
                  </div>
                  <div className="text-[11px] text-sky-400">
                    حساب الأستاذ العام: {ba.account.code} - {ba.account.name}
                  </div>
                </div>
              ))}
              {bankAccounts.length === 0 && (
                <div className="col-span-3 text-center text-xs text-slate-500 py-4 border border-dashed border-slate-800 rounded-2xl">
                  لا توجد حسابات بنكية مرتبطة بدليل الحسابات بعد
                </div>
              )}
            </div>

            {/* Reconciliation Sessions List */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-3">رقم الكشف</th>
                    <th className="p-3">المصرف</th>
                    <th className="p-3">رصيد كشف البنك</th>
                    <th className="p-3">الرصيد الدفتري (GL)</th>
                    <th className="p-3">الرصيد المسوّى</th>
                    <th className="p-3">الفرق</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {sessions.map((s) => {
                    const st = STATUS_LABELS[s.status] || {
                      label: s.status,
                      cls: "bg-slate-800 text-slate-300",
                    };
                    const isZeroDiff = s.differenceAmount === "0.000";
                    return (
                      <tr key={s.id} className="hover:bg-slate-900/50">
                        <td className="p-3 font-mono font-bold text-white">
                          {s.statementNumber}
                        </td>
                        <td className="p-3">{s.bankAccount.bankName}</td>
                        <td className="p-3 font-mono">
                          {formatMoney(s.closingBalanceBank)}
                        </td>
                        <td className="p-3 font-mono">
                          {formatMoney(s.bookBalanceAsOfEnd)}
                        </td>
                        <td className="p-3 font-mono">
                          {formatMoney(s.reconciledBalance)}
                        </td>
                        <td
                          className={`p-3 font-mono font-bold ${
                            isZeroDiff ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {formatMoney(s.differenceAmount)}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-lg border ${st.cls}`}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="p-3 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => loadSessionDetail(s.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                          >
                            تفاصيل
                          </button>
                          {(s.status === "DRAFT" ||
                            s.status === "IN_PROGRESS") && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleAutoMatch(s.id)}
                                disabled={busyAction === `automatch-${s.id}`}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                              >
                                مطابقة تلقائية
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSubmitSession(s.id)}
                                disabled={busyAction === `submit-${s.id}`}
                                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold"
                              >
                                تقديم للاعتماد
                              </button>
                            </>
                          )}
                          {s.status === "PENDING_APPROVAL" && (
                            <button
                              type="button"
                              onClick={() => handleApproveCloseSession(s.id)}
                              disabled={busyAction === `approve-${s.id}`}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                            >
                              اعتماد وإغلاق (4 عيون)
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        لا توجد جلسات تسوية بنكية مسجلة بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Selected Session Items Detail */}
            {selectedSession && (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-white">
                    بنود كشف البنك: {selectedSession.statementNumber}
                  </h4>
                  {selectedSession.summary && (
                    <div className="text-xs text-slate-300 flex gap-3">
                      <span>
                        إيداعات بالطريق:{" "}
                        <strong className="font-mono">
                          {formatMoney(selectedSession.summary.depositsInTransit)}
                        </strong>
                      </span>
                      <span>
                        صكوك معلقة:{" "}
                        <strong className="font-mono">
                          {formatMoney(selectedSession.summary.outstandingChecks)}
                        </strong>
                      </span>
                      <span>
                        غير مطابق: {selectedSession.summary.unmatchedItemsCount}
                      </span>
                    </div>
                  )}
                </div>
                {/* Import CSV / SWIFT MT940 Bank Statement File */}
                {selectedSession.status !== "CLOSED" && (
                  <form
                    onSubmit={handleImportStatementFile}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-sky-300">
                        استيراد ملف كشف الحساب البنكي (CSV / SWIFT MT940)
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label="تنسيق الملف"
                          value={importFormat}
                          onChange={(e) =>
                            setImportFormat(e.target.value as "CSV" | "MT940")
                          }
                          className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1"
                        >
                          <option value="CSV">CSV</option>
                          <option value="MT940">SWIFT MT940</option>
                        </select>
                        <input
                          type="file"
                          accept=".csv,.txt,.sta,.mt940"
                          onChange={(e) => void handleStatementFileSelected(e)}
                          className="text-[11px] text-slate-300"
                        />
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={importContent}
                      onChange={(e) => setImportContent(e.target.value)}
                      placeholder="الصق محتوى CSV (date,reference,description,debit,credit) أو SWIFT MT940 (:61:/:86:)..."
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 font-mono text-[11px]"
                    />
                    <button
                      type="submit"
                      disabled={
                        !importContent.trim() ||
                        busyAction === `import-file-${selectedSession.id}`
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold disabled:opacity-50"
                    >
                      استيراد الحركات من الملف
                    </button>
                  </form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2">التاريخ</th>
                        <th className="p-2">المرجع</th>
                        <th className="p-2">البيان</th>
                        <th className="p-2">الاتجاه</th>
                        <th className="p-2">المبلغ</th>
                        <th className="p-2">الحالة</th>
                        <th className="p-2">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {(selectedSession.items || []).map((item) => (
                        <tr key={item.id}>
                          <td className="p-2 font-mono">
                            {item.transactionDate.slice(0, 10)}
                          </td>
                          <td className="p-2 font-mono">{item.reference}</td>
                          <td className="p-2">{item.description || "—"}</td>
                          <td className="p-2">
                            {item.direction === "CREDIT" ? "إيداع دائن" : "سحب مدين"}
                          </td>
                          <td className="p-2 font-mono">
                            {formatMoney(item.amount)}
                          </td>
                          <td className="p-2">{item.matchStatus}</td>
                          <td className="p-2">
                            {item.matchStatus === "UNMATCHED" &&
                              selectedSession.status !== "CLOSED" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePostBankChargeAdjustment(item.id)
                                  }
                                  disabled={busyAction === `adjust-${item.id}`}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                                >
                                  ترحيل كعمولة بنكية
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === "reval" && (
          <div className="space-y-6">
            <form
              onSubmit={handleRunFxRevaluation}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3"
            >
              <h3 className="text-sm font-bold text-amber-300">
                تنفيذ إعادة تقييم فروق العملة غير المحققة (Period-End FX Revaluation)
              </h3>
              <p className="text-[11px] text-slate-400">
                يُقارن الرصيد الأجنبي بسعر الإقفال المعتمد (6dp) مع الرصيد الدفتري بالأستاذ العام ويرحّل قيد فروق العملة تلقائيًا على حساب 400950.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                <select
                  aria-label="الحساب البنكي الأجنبي"
                  value={revalBankAccountId}
                  onChange={(e) => setRevalBankAccountId(e.target.value)}
                  required
                  className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                >
                  <option value="">اختر الحساب البنكي...</option>
                  {bankAccounts.map((ba) => (
                    <option key={ba.id} value={ba.id}>
                      {ba.bankName} ({ba.currency.code}) — {ba.accountNumber}
                    </option>
                  ))}
                </select>
                <input
                  value={revalForeignBalance}
                  onChange={(e) => setRevalForeignBalance(e.target.value)}
                  placeholder="الرصيد بالعملة الأجنبية (مثل 10000.000)"
                  required
                  className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 font-mono"
                />
                <input
                  type="date"
                  value={revalAsOfDate}
                  onChange={(e) => setRevalAsOfDate(e.target.value)}
                  required
                  className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                />
                <input
                  value={revalNotes}
                  onChange={(e) => setRevalNotes(e.target.value)}
                  placeholder="ملاحظة الإقفال (اختياري)"
                  className="rounded-xl bg-slate-950 border border-slate-700 px-3 py-2"
                />
              </div>
              <button
                type="submit"
                disabled={busyAction === "run-fx-reval"}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white"
              >
                تشغيل إعادة التقييم وترحيل القيد
              </button>
            </form>

            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="p-3">تاريخ الإقفال</th>
                    <th className="p-3">المصرف</th>
                    <th className="p-3">العملة والرصيد الأجنبي</th>
                    <th className="p-3">سعر الإقفال (6dp)</th>
                    <th className="p-3">الدفتري (GL)</th>
                    <th className="p-3">بعد التقييم</th>
                    <th className="p-3">فروق غير محققة</th>
                    <th className="p-3">القيد المحاسبي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {revaluations.map((rv) => {
                    const isLoss = rv.unrealizedGainLoss.startsWith("-");
                    return (
                      <tr key={rv.id} className="hover:bg-slate-900/50">
                        <td className="p-3 font-mono">
                          {rv.asOfDate.slice(0, 10)}
                        </td>
                        <td className="p-3 font-bold text-white">
                          {rv.bankAccount.bankName}
                        </td>
                        <td className="p-3 font-mono">
                          {formatMoney(rv.foreignBalance)} {rv.currencyCode}
                        </td>
                        <td className="p-3 font-mono text-sky-300">
                          {formatRate(rv.closingRate)}
                        </td>
                        <td className="p-3 font-mono">
                          {formatMoney(rv.bookBalanceBase)}
                        </td>
                        <td className="p-3 font-mono">
                          {formatMoney(rv.revaluedBalanceBase)}
                        </td>
                        <td
                          className={`p-3 font-mono font-bold ${
                            isLoss ? "text-rose-400" : "text-emerald-400"
                          }`}
                        >
                          {formatMoney(rv.unrealizedGainLoss)}
                        </td>
                        <td className="p-3 font-mono text-slate-300">
                          {rv.accountingEntryId
                            ? `GL #${rv.accountingEntryId}`
                            : "لا يوجد فرق"}
                        </td>
                      </tr>
                    );
                  })}
                  {revaluations.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        لا توجد عمليات إعادة تقييم عملات مسجلة بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
