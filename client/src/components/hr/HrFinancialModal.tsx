// client/src/components/hr/HrFinancialModal.tsx
import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { Money } from "../../utils/money";
import { toast } from "sonner";

type TabKey = "compensation" | "advances" | "deductions" | "settlements";

interface EmployeeCompRow {
  id: number;
  fullName: string;
  username: string;
  payBasis: "MONTHLY" | "HOURLY" | "FIXED_SHIFT";
  basicSalary: string;
  hourlyRate: string;
  fixedShift6hRate: string;
  fixedShift12hRate: string;
  fixedShift24hRate: string;
  isTaxExempt: boolean;
}

interface TaxBracketRow {
  id: number;
  name: string;
  fromAmount: string;
  toAmount: string | null;
  rate: string;
}

interface AdvanceRow {
  id: number;
  advanceNumber: string;
  amount: string;
  installments: number;
  monthlyDeduction: string;
  remainingAmount: string;
  status: string;
  user?: { id: number; fullName: string };
}

interface DeductionRow {
  id: number;
  kind: "DEDUCTION" | "ALLOWANCE";
  category: string;
  title: string;
  amount: string;
  isRecurring: boolean;
  isActive: boolean;
  user?: { id: number; fullName: string };
}

interface SettlementRow {
  id: number;
  settlementNo: string;
  terminationType: string;
  serviceYears: string;
  totalEarnings: string;
  totalDeductions: string;
  netAmount: string;
  isDepartmentCleared: boolean;
  isItCleared: boolean;
  isFinanceCleared: boolean;
  isHrCleared: boolean;
  status: string;
  user?: { id: number; fullName: string };
}

interface EosPreview {
  calculation: {
    serviceYears: string;
    lastMonthAmount: string;
    leaveCompensationAmount: string;
    gratuityAmount: string;
    advancesDeduction: string;
    totalEarnings: string;
    totalDeductions: string;
    netAmount: string;
  };
}

export function HrFinancialModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>("compensation");
  const [loading, setLoading] = useState(false);

  const [employees, setEmployees] = useState<EmployeeCompRow[]>([]);
  const [brackets, setBrackets] = useState<TaxBracketRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [deductions, setDeductions] = useState<DeductionRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);

  // Pay Basis form
  const [compUserId, setCompUserId] = useState("");
  const [payBasis, setPayBasis] = useState<"MONTHLY" | "HOURLY" | "FIXED_SHIFT">("MONTHLY");
  const [hourlyRate, setHourlyRate] = useState("50");
  const [shift12Rate, setShift12Rate] = useState("150");

  // Advance form
  const [advUserId, setAdvUserId] = useState("");
  const [advAmount, setAdvAmount] = useState("1500");
  const [advInstallments, setAdvInstallments] = useState("3");
  const [advReason, setAdvReason] = useState("");

  // Deduction / Allowance form
  const [dedUserId, setDedUserId] = useState("");
  const [dedKind, setDedKind] = useState<"DEDUCTION" | "ALLOWANCE">("DEDUCTION");
  const [dedCategory, setDedCategory] = useState("SOCIAL_SECURITY");
  const [dedTitle, setDedTitle] = useState("");
  const [dedAmount, setDedAmount] = useState("150");

  // EOS form
  const [eosUserId, setEosUserId] = useState("");
  const [eosDate, setEosDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eosType, setEosType] = useState("TERMINATION");
  const [eosPreview, setEosPreview] = useState<EosPreview | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [empRes, brRes, advRes, dedRes, stlRes] = await Promise.all([
        apiClient.get("/hr/financial/employees-compensation"),
        apiClient.get("/hr/financial/tax-brackets"),
        apiClient.get("/hr/financial/advances"),
        apiClient.get("/hr/financial/deductions"),
        apiClient.get("/hr/financial/settlements"),
      ]);
      setEmployees(Array.isArray(empRes.data) ? empRes.data : []);
      setBrackets(Array.isArray(brRes.data) ? brRes.data : []);
      setAdvances(Array.isArray(advRes.data) ? advRes.data : []);
      setDeductions(Array.isArray(dedRes.data) ? dedRes.data : []);
      setSettlements(Array.isArray(stlRes.data) ? stlRes.data : []);
    } catch {
      toast.error("تعذّر تحميل بيانات الحوكمة المالية للموارد البشرية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleSaveCompensation = async () => {
    if (!compUserId) {
      toast.error("اختر الموظف أولاً");
      return;
    }
    try {
      await apiClient.patch(`/hr/financial/employees/${compUserId}/compensation`, {
        payBasis,
        hourlyRate: Number(hourlyRate || 0),
        fixedShift12hRate: Number(shift12Rate || 0),
      });
      toast.success("تم حفظ تصنيف الصرف بنجاح");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل تحديث تصنيف الصرف");
    }
  };

  const handleCreateAdvance = async () => {
    if (!advUserId || !advAmount) {
      toast.error("أدخل الموظف ومبلغ السلفة");
      return;
    }
    try {
      await apiClient.post("/hr/financial/advances", {
        userId: Number(advUserId),
        amount: Number(advAmount),
        installments: Number(advInstallments || 1),
        reason: advReason || undefined,
      });
      toast.success("تم تسجيل طلب السلفة بنجاح");
      setAdvReason("");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل تسجيل السلفة");
    }
  };

  const handleApproveAdvance = async (id: number) => {
    try {
      await apiClient.post(`/hr/financial/advances/${id}/approve`, {
        postAccounting: true,
        paymentMethod: "CASH",
      });
      toast.success("تم اعتماد وصرف السلفة محاسبيًا");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "تعذّر اعتماد السلفة");
    }
  };

  const handleCreateDeduction = async () => {
    if (!dedUserId || !dedTitle.trim() || !dedAmount) {
      toast.error("أكمل بيانات البند المالي");
      return;
    }
    try {
      await apiClient.post("/hr/financial/deductions", {
        userId: Number(dedUserId),
        kind: dedKind,
        category: dedCategory,
        title: dedTitle.trim(),
        amount: Number(dedAmount),
        isRecurring: true,
        effectiveFrom: new Date().toISOString(),
      });
      toast.success("تم حفظ بند الاستقطاع/البدل بنجاح");
      setDedTitle("");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل الحفظ");
    }
  };

  const handlePreviewEos = async () => {
    if (!eosUserId || !eosDate) {
      toast.error("أدخل معرّف الموظف وتاريخ نهاية الخدمة");
      return;
    }
    try {
      const res = await apiClient.post("/hr/financial/settlements/preview", {
        userId: Number(eosUserId),
        effectiveDate: `${eosDate}T00:00:00.000Z`,
        terminationType: eosType,
      });
      setEosPreview(res.data as EosPreview);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل احتساب معاينة نهاية الخدمة");
    }
  };

  const handleCreateEosDraft = async () => {
    if (!eosUserId || !eosDate) return;
    try {
      await apiClient.post("/hr/financial/settlements", {
        userId: Number(eosUserId),
        effectiveDate: `${eosDate}T00:00:00.000Z`,
        terminationType: eosType,
      });
      toast.success("تم إنشاء مسودة مخالصة نهاية الخدمة");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل إنشاء مسودة المخالصة");
    }
  };

  const handleApproveSettlement = async (id: number) => {
    try {
      await apiClient.post(`/hr/financial/settlements/${id}/approve`, {
        postAccounting: true,
      });
      toast.success("تم اعتماد المخالصة وتقفيل السلف وإنهاء الخدمة");
      await loadAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "فشل اعتماد المخالصة");
    }
  };

  const monthlyPreview =
    Number(advAmount) > 0 && Number(advInstallments) >= 1
      ? Money.toFixed(Money.decimal(advAmount).div(Number(advInstallments)))
      : "0.000";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="السلف والاستقطاعات وتصنيف الصرف ونهاية الخدمة"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6 text-slate-100 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-sky-300">
              💼 حوكمة الرواتب: تصنيفات الصرف والسلف والاستقطاعات ونهاية الخدمة (CAP11)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              دعم كامل للراتب الشهري والساعات ومقطوعية الورديات والشرائح الضريبية والسلف ومخالصة نهاية الخدمة بـ 4 عيون.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs"
          >
            إغلاق
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => setTab("compensation")}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${tab === "compensation" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            1. تصنيف الصرف والضرائب ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("advances")}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${tab === "advances" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            2. السلف والقروض ({advances.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("deductions")}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${tab === "deductions" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            3. الاستقطاعات والبدلات ({deductions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("settlements")}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${tab === "settlements" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            4. تصفية نهاية الخدمة ({settlements.length})
          </button>
        </div>

        {loading && <div className="text-xs text-slate-400">جاري التحميل...</div>}

        {tab === "compensation" && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                placeholder="معرّف الموظف (User ID)"
                value={compUserId}
                onChange={(e) => setCompUserId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <select
                value={payBasis}
                onChange={(e) => setPayBasis(e.target.value as "MONTHLY" | "HOURLY" | "FIXED_SHIFT")}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              >
                <option value="MONTHLY">مرتب شهري (MONTHLY)</option>
                <option value="HOURLY">نظام الساعات (HOURLY)</option>
                <option value="FIXED_SHIFT">مقطوعية ورديات (FIXED_SHIFT)</option>
              </select>
              <input
                placeholder="أجر الساعة (LYD)"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <input
                placeholder="مقطوعية وردية 12س (LYD)"
                value={shift12Rate}
                onChange={(e) => setShift12Rate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={handleSaveCompensation}
                className="md:col-span-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white"
              >
                حفظ تصنيف الصرف للموظف
              </button>
            </div>
            <div className="text-xs text-slate-400">
              الشرائح الضريبية الفعالة: {brackets.length}
            </div>
          </div>
        )}

        {tab === "advances" && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                placeholder="معرّف الموظف (للسلفة)"
                value={advUserId}
                onChange={(e) => setAdvUserId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <input
                placeholder="مبلغ السلفة"
                value={advAmount}
                onChange={(e) => setAdvAmount(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <input
                placeholder="عدد الأقساط"
                value={advInstallments}
                onChange={(e) => setAdvInstallments(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <div className="text-xs flex items-center text-amber-300 font-mono">
                القسط الشهري: {monthlyPreview} LYD
              </div>
              <input
                placeholder="سبب السلفة..."
                value={advReason}
                onChange={(e) => setAdvReason(e.target.value)}
                className="md:col-span-3 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={handleCreateAdvance}
                className="py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white"
              >
                تسجيل طلب سلفة
              </button>
            </div>

            <div className="space-y-2">
              {advances.map((a) => (
                <div
                  key={a.id}
                  className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold">
                      {a.advanceNumber} — {a.user?.fullName ?? `#${a.id}`}
                    </div>
                    <div className="text-slate-400 font-mono">
                      المبلغ: {Money.toFixed(a.amount)} | المتبقي: {Money.toFixed(a.remainingAmount)} | القسط: {Money.toFixed(a.monthlyDeduction)} ({a.status})
                    </div>
                  </div>
                  {a.status === "PENDING" && (
                    <button
                      type="button"
                      onClick={() => handleApproveAdvance(a.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                    >
                      اعتماد وصرف السلفة (4 عيون)
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "deductions" && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                placeholder="معرّف الموظف (للاستقطاع)"
                value={dedUserId}
                onChange={(e) => setDedUserId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <select
                value={dedKind}
                onChange={(e) => setDedKind(e.target.value as "DEDUCTION" | "ALLOWANCE")}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              >
                <option value="DEDUCTION">استقطاع</option>
                <option value="ALLOWANCE">بدل / علاوة</option>
              </select>
              <select
                value={dedCategory}
                onChange={(e) => setDedCategory(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              >
                <option value="SOCIAL_SECURITY">ضمان اجتماعي</option>
                <option value="HEALTH_INSURANCE">تأمين صحي</option>
                <option value="PENALTY">جزاء إداري</option>
                <option value="SPECIALTY">علاوة تخصص</option>
                <option value="ON_CALL">بدل استدعاء</option>
              </select>
              <input
                placeholder="عنوان البند"
                value={dedTitle}
                onChange={(e) => setDedTitle(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <input
                placeholder="المبلغ"
                value={dedAmount}
                onChange={(e) => setDedAmount(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={handleCreateDeduction}
                className="md:col-span-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white"
              >
                إضافة بند دوري للرواتب
              </button>
            </div>
          </div>
        )}

        {tab === "settlements" && (
          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                placeholder="معرّف الموظف (نهاية الخدمة)"
                value={eosUserId}
                onChange={(e) => setEosUserId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <input
                type="date"
                value={eosDate}
                onChange={(e) => setEosDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              />
              <select
                value={eosType}
                onChange={(e) => setEosType(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs"
              >
                <option value="TERMINATION">إنهاء خدمة</option>
                <option value="RESIGNATION">استقالة</option>
                <option value="END_OF_CONTRACT">انتهاء عقد</option>
                <option value="RETIREMENT">تقاعد</option>
                <option value="DISCIPLINARY">فصل تأديبي</option>
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePreviewEos}
                  className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-bold"
                >
                  معاينة الحساب
                </button>
                <button
                  type="button"
                  onClick={handleCreateEosDraft}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                >
                  إنشاء مسودة
                </button>
              </div>
            </div>

            {eosPreview && (
              <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-xl p-4 text-xs grid grid-cols-2 md:grid-cols-4 gap-2 font-mono">
                <div>مدة الخدمة: {eosPreview.calculation.serviceYears} سنة</div>
                <div>مكافأة نهاية الخدمة: {eosPreview.calculation.gratuityAmount}</div>
                <div>بدل الإجازات: {eosPreview.calculation.leaveCompensationAmount}</div>
                <div>خصم السلف: {eosPreview.calculation.advancesDeduction}</div>
                <div className="col-span-2 md:col-span-4 text-emerald-300 font-bold">
                  الصافي المستحق: {eosPreview.calculation.netAmount} LYD
                </div>
              </div>
            )}

            <div className="space-y-2">
              {settlements.map((s) => (
                <div
                  key={s.id}
                  className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold">
                      {s.settlementNo} — {s.user?.fullName ?? `#${s.id}`} ({s.status})
                    </div>
                    <div className="text-slate-400 font-mono">
                      المستحقات: {Money.toFixed(s.totalEarnings)} | الخصومات: {Money.toFixed(s.totalDeductions)} | الصافي: {Money.toFixed(s.netAmount)}
                    </div>
                  </div>
                  {s.status === "DRAFT" && (
                    <button
                      type="button"
                      onClick={() => handleApproveSettlement(s.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                    >
                      اعتماد وتنفيذ المخالصة
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
