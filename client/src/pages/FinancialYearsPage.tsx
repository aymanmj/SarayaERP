// src/pages/FinancialYearsPage.tsx

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type FinancialYearStatus = "DRAFT" | "OPEN" | "CLOSED";

type FinancialYear = {
  id: number;
  name: string;
  code: string;
  startDate: string;
  endDate: string;
  status: FinancialYearStatus;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
};

type FinancialPeriod = {
  id: number;
  financialYearId: number;
  periodIndex: number;
  periodCode: string;
  monthStartDate: string;
  monthEndDate: string;
  numberOfDays: number;
  payrollStartDate?: string | null;
  payrollEndDate?: string | null;
  isOpen: boolean;
};

type FinancialYearLite = {
  id: number;
  name: string;
  code?: string | null;
  startDate: string;
  endDate: string;
  status: FinancialYearStatus;
  isCurrent: boolean;
};

type AutoOpeningResult = {
  fromFinancialYearId: number;
  fromFinancialYearCode: string | null;
  toFinancialYearId: number;
  toFinancialYearCode: string | null;
  openingEntryId: number;
  totalDebit: number;
  totalCredit: number;
  linesCount: number;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

// Local formatDate removed

export default function FinancialYearsPage() {
  // قائمة السنوات
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [loadingYears, setLoadingYears] = useState(false);

  // الفترات للسنة المختارة
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);

  // نموذج إنشاء سنة جديدة
  const [yearNumber, setYearNumber] = useState<number>(
    new Date().getFullYear(),
  );
  const [yearName, setYearName] = useState<string>(
    "السنة المالية " + new Date().getFullYear(),
  );
  const [description, setDescription] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [generatingPeriods, setGeneratingPeriods] = useState(false);
  const [updatingYear, setUpdatingYear] = useState(false);

  const [openingLoadingId, setOpeningLoadingId] = useState<number | null>(null);

  async function handleGenerateOpeningForYear(fy: FinancialYearLite) {
    if (fy.status !== "OPEN") {
      toast.error("يمكن توليد الأرصدة الافتتاحية فقط لسنة مالية مفتوحة.");
      return;
    }

    const label =
      (fy.code && fy.code.trim().length > 0 ? fy.code : fy.name) || `#${fy.id}`;

    const ok = window.confirm(
      `هل أنت متأكد أنك تريد توليد الأرصدة الافتتاحية تلقائيًا للسنة ${label} من آخر سنة مغلقة قبلها؟`,
    );
    if (!ok) return;

    try {
      setOpeningLoadingId(fy.id);

      // لو حاب تمرر entryDate واضح:
      // const body = { entryDate: `${fy.startDate.substring(0, 10)}` };
      const body = {};

      const res = await apiClient.post<ApiResponse<AutoOpeningResult>>(
        `/accounting/financial-years/${fy.id}/generate-opening-from-last`,
        body,
      );

      if (!res.data.success || !res.data.data) {
        const msg =
          res.data.error?.message ||
          "فشل في توليد الأرصدة الافتتاحية تلقائيًا.";
        toast.error(msg);
        return;
      }

      const r = res.data.data;

      const fromLabel =
        r.fromFinancialYearCode || `السنة #${r.fromFinancialYearId.toString()}`;
      const toLabel =
        r.toFinancialYearCode || `السنة #${r.toFinancialYearId.toString()}`;

      toast.success(
        `تم توليد الأرصدة الافتتاحية بنجاح من ${fromLabel} إلى ${toLabel}.
رقم القيد الافتتاحي: ${r.openingEntryId}
إجمالي مدين: ${r.totalDebit.toFixed(3)}
إجمالي دائن: ${r.totalCredit.toFixed(3)}`,
      );

      // 🔄 إعادة تحميل السنوات (في حال تغيّر شيء في الحالة مستقبلاً)
      await fetchYears();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        "حدث خطأ أثناء توليد الأرصدة الافتتاحية.";
      toast.error(msg);
    } finally {
      setOpeningLoadingId(null);
    }
  }

  // ----- تحميل السنوات -----
  const fetchYears = async () => {
    setLoadingYears(true);
    try {
      const res = await apiClient.get<FinancialYear[]>("/financial-years");
      setYears(res.data);

      // لو ما فيش سنة مختارة، نختار الحالية أو أول سنة
      if (!selectedYearId && res.data.length > 0) {
        const current = res.data.find((y) => y.isCurrent);
        setSelectedYearId((current ?? res.data[0]).id);
      }
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل السنوات المالية.");
    } finally {
      setLoadingYears(false);
    }
  };

  useEffect(() => {
    fetchYears();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedYear = useMemo(
    () => years.find((y) => y.id === selectedYearId) ?? null,
    [years, selectedYearId],
  );

  const currentYear = useMemo(
    () => years.find((y) => y.isCurrent) ?? null,
    [years],
  );

  // ----- تحميل الفترات لسنة معينة -----
  const fetchPeriods = async (yearId: number) => {
    setLoadingPeriods(true);
    try {
      const res = await apiClient.get<FinancialPeriod[]>(
        `/financial-years/${yearId}/periods`,
      );
      setPeriods(res.data);
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحميل الفترات المالية.");
    } finally {
      setLoadingPeriods(false);
    }
  };

  // عند تغيير السنة المختارة
  useEffect(() => {
    if (selectedYearId) {
      fetchPeriods(selectedYearId);
    } else {
      setPeriods([]);
    }
  }, [selectedYearId]);

  // ----- إنشاء سنة مالية جديدة -----
  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      toast.error("يجب تحديد تاريخ البداية والنهاية للسنة المالية.");
      return;
    }

    setCreating(true);
    try {
      await apiClient.post("/financial-years", {
        year: yearNumber,
        name: yearName || undefined,
        description: description || undefined,
        startDate,
        endDate,
      });

      toast.success("تم حفظ السنة المالية بنجاح.");
      setDescription("");
      setStartDate("");
      setEndDate("");
      await fetchYears();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      if (Array.isArray(msg)) toast.error(msg.join("\n"));
      else if (typeof msg === "string") toast.error(msg);
      else toast.error("حدث خطأ أثناء حفظ السنة المالية.");
    } finally {
      setCreating(false);
    }
  };

  // ----- تعيين سنة حالية -----
  const handleSetCurrentYear = async (yearId: number) => {
    setUpdatingYear(true);
    try {
      await apiClient.patch(`/financial-years/${yearId}/status`, {
        isCurrent: true,
      });
      toast.success("تم تعيين السنة الحالية بنجاح.");
      await fetchYears();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تعيين السنة الحالية.");
    } finally {
      setUpdatingYear(false);
    }
  };

  // ----- إغلاق سنة مالية -----
  const handleCloseYear = async (yearId: number) => {
    setUpdatingYear(true);
    try {
      await apiClient.patch(`/financial-years/${yearId}/status`, {
        status: "CLOSED",
      });
      toast.success("تم إغلاق السنة المالية.");
      await fetchYears();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء إغلاق السنة المالية.");
    } finally {
      setUpdatingYear(false);
    }
  };

  // ----- توليد الفترات للشهور -----
  const handleGeneratePeriods = async () => {
    if (!selectedYear) {
      toast.error("اختر سنة مالية أولاً.");
      return;
    }
    setGeneratingPeriods(true);
    try {
      await apiClient.post(
        `/financial-years/${selectedYear.id}/generate-periods`,
      );
      toast.success("تم إنشاء الفترات (الأشهر) بنجاح.");
      await fetchPeriods(selectedYear.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      if (typeof msg === "string") toast.error(msg);
      else toast.error("حدث خطأ أثناء إنشاء الفترات.");
    } finally {
      setGeneratingPeriods(false);
    }
  };

  // ----- فتح / إغلاق فترة -----
  const togglePeriodOpen = async (p: FinancialPeriod) => {
    try {
      if (p.isOpen) {
        await apiClient.patch(`/financial-years/periods/${p.id}/close`);
        toast.success("تم إغلاق الفترة المالية.");
      } else {
        await apiClient.patch(`/financial-years/periods/${p.id}/open`);
        toast.success("تم فتح الفترة المالية.");
      }
      if (selectedYear) {
        await fetchPeriods(selectedYear.id);
      }
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تحديث حالة الفترة.");
    }
  };

  // ================== واجهة المستخدم ==================
  return (
    <div className="h-full flex flex-col text-slate-100">
      {/* العنوان العلوي */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">السنوات المالية</h1>
          <p className="text-sm text-slate-400">
            إدارة السنوات المالية والفترات (الأشهر) المرتبطة بها، كأساس للجرد
            والمرتبات والتقارير المالية.
          </p>
        </div>

        {currentYear && (
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-slate-400">السنة الحالية:</span>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/70 text-xs text-emerald-300">
              {formatDate(currentYear.startDate)} –{" "}
              {formatDate(currentYear.endDate)}
            </span>
          </div>
        )}
      </div>

      {/* الشبكة الرئيسية */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* عمود إنشاء سنة جديدة */}
        <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 flex flex-col">
          <h2 className="text-lg font-semibold mb-4">إنشاء سنة مالية جديدة</h2>

          <form onSubmit={handleCreateYear} className="space-y-3 text-sm">
            {/* السنة */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">السنة</label>
              <input
                type="number"
                min={1900}
                max={2100}
                value={yearNumber}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setYearNumber(val);
                  setYearName(`السنة المالية ${val}`);
                }}
                className="bg-slate-900/70 border border-slate-700 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              />
            </div>

            {/* اسم السنة */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">
                اسم السنة (اختياري)
              </label>
              <input
                type="text"
                value={yearName}
                onChange={(e) => setYearName(e.target.value)}
                placeholder="مثال: السنة المالية 2025"
                className="bg-slate-900/70 border border-slate-700 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              />
            </div>

            {/* الوصف */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-300">
                وصف / ملاحظات (اختياري)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="مثال: بداية تطبيق النظام الجديد، ملاحظات خاصة بالجرد..."
                className="bg-slate-900/70 border border-slate-700 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              />
            </div>

            {/* التواريخ */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">تاريخ البداية</label>
                <DatePicker
                  date={startDate ? new Date(startDate) : undefined}
                  onChange={(d) => setStartDate(d ? d.toISOString().slice(0, 10) : "")}
                  className="bg-slate-900/70 border-slate-700 h-9 px-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">تاريخ النهاية</label>
                <DatePicker
                  date={endDate ? new Date(endDate) : undefined}
                  onChange={(d) => setEndDate(d ? d.toISOString().slice(0, 10) : "")}
                  className="bg-slate-900/70 border-slate-700 h-9 px-2 text-sm"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <p className="text-[11px] text-slate-500 max-w-xs">
                لاحقًا يمكن ربط كل الحركات المالية (فواتير، مرتبات، جرد...)
                بالسنة المالية والفترات (الأشهر) لضمان دورة محاسبية مكتملة.
              </p>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-60"
              >
                {creating ? "جارِ الحفظ..." : "حفظ السنة المالية"}
              </button>
            </div>
          </form>
        </div>

        {/* عمود السنوات والفترات */}
        <div className="flex flex-col gap-4">
          {/* قائمة السنوات */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                السنوات المالية المسجّلة
              </h2>
              {loadingYears && (
                <span className="text-[11px] text-slate-500">
                  جارِ تحميل السنوات...
                </span>
              )}
            </div>

            {years.length === 0 ? (
              <div className="py-8 text-sm text-slate-500 text-center">
                لا توجد سنوات مالية مسجلة بعد.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {years.map((y) => (
                  <div
                    key={y.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedYearId(y.id)}
                    className={`w-full text-right border rounded-2xl px-3 py-2 transition ${
                      selectedYearId === y.id
                        ? "border-sky-500 bg-sky-950/40"
                        : "border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer"
                    }`}
                  >
                    <div className="flex flex-wrap justify-between gap-2 items-center">
                      <div>
                        <div className="text-sm font-semibold">
                          {y.name}{" "}
                          <span className="text-[11px] text-slate-400">
                            ({y.code})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {formatDate(y.startDate)} – {formatDate(y.endDate)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 items-center">
                        {/* حالة السنة */}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] border ${
                            y.status === "OPEN"
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/70"
                              : y.status === "DRAFT"
                                ? "bg-amber-500/10 text-amber-300 border-amber-500/70"
                                : "bg-rose-500/10 text-rose-300 border-rose-500/70"
                          }`}
                        >
                          {y.status === "OPEN"
                            ? "مفتوحة"
                            : y.status === "DRAFT"
                              ? "مسودة"
                              : "مغلقة"}
                        </span>

                        {y.isCurrent && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-sky-500/10 text-sky-300 border border-sky-500/70">
                            سنة حالية
                          </span>
                        )}

                        {/* الأزرار */}
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedYearId(y.id);
                            }}
                            className="px-2 py-1 rounded-full bg-slate-800 text-[11px] hover:bg-slate-700"
                          >
                            الفترات / الأشهر
                          </button>

                          {!y.isCurrent && (
                            <button
                              type="button"
                              disabled={updatingYear}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleSetCurrentYear(y.id);
                              }}
                              className="px-2 py-1 rounded-full bg-emerald-600 text-[11px] hover:bg-emerald-500 disabled:opacity-50"
                            >
                              تعيين سنة حالية
                            </button>
                          )}

                          {y.status === "OPEN" && (
                            <>
                              {/* زر توليد الأرصدة الافتتاحية */}
                              <button
                                type="button"
                                disabled={openingLoadingId === y.id}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleGenerateOpeningForYear(y);
                                }}
                                className="px-2 py-1 rounded-full bg-sky-600 text-[11px] hover:bg-sky-500 disabled:opacity-50"
                              >
                                {openingLoadingId === y.id
                                  ? "جارِ توليد الأرصدة..."
                                  : "توليد أرصدة افتتاحية"}
                              </button>

                              {/* زر إغلاق السنة */}
                              <button
                                type="button"
                                disabled={updatingYear}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleCloseYear(y.id);
                                }}
                                className="px-2 py-1 rounded-full bg-rose-600 text-[11px] hover:bg-rose-500 disabled:opacity-50"
                              >
                                إغلاق السنة
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* الفترات للسنة المختارة */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">
                  الفترات (الأشهر) للسنة المالية
                </h2>
                <p className="text-[12px] text-slate-400 mt-0.5">
                  {selectedYear
                    ? `السنة المختارة: ${selectedYear.name} (${formatDate(
                        selectedYear.startDate,
                      )} – ${formatDate(selectedYear.endDate)})`
                    : "اختر سنة مالية من الجدول أعلاه لعرض الفترات."}
                </p>
              </div>

              {selectedYear && (
                <button
                  type="button"
                  onClick={handleGeneratePeriods}
                  disabled={generatingPeriods || periods.length > 0}
                  className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs disabled:opacity-50"
                >
                  {generatingPeriods
                    ? "جارِ إنشاء الفترات..."
                    : periods.length === 0
                      ? "توليد فترات السنة"
                      : "تم إنشاء الفترات"}
                </button>
              )}
            </div>

            {!selectedYear ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                لم يتم اختيار سنة مالية بعد.
              </div>
            ) : loadingPeriods ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                جارِ تحميل الفترات المالية...
              </div>
            ) : periods.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                لم يتم إنشاء أي فترات بعد لهذه السنة المالية.
              </div>
            ) : (
              <div className="flex-1 overflow-auto mt-2">
                <table className="w-full text-xs border-separate border-spacing-y-1">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="text-right px-2 py-1">#</th>
                      <th className="text-right px-2 py-1">الفترة</th>
                      <th className="text-right px-2 py-1">التاريخ</th>
                      <th className="text-right px-2 py-1">أيام</th>
                      <th className="text-right px-2 py-1">الرواتب / البصمة</th>
                      <th className="text-right px-2 py-1">الحالة</th>
                      <th className="text-right px-2 py-1">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => (
                      <tr
                        key={p.id}
                        className="bg-slate-900/70 border border-slate-800 rounded-xl"
                      >
                        <td className="px-2 py-1 align-top">{p.periodIndex}</td>
                        <td className="px-2 py-1 align-top">
                          <div className="font-semibold text-slate-100">
                            {p.periodCode}
                          </div>
                        </td>
                        <td className="px-2 py-1 align-top text-[11px]">
                          {formatDate(p.monthStartDate)} –{" "}
                          {formatDate(p.monthEndDate)}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {p.numberOfDays}
                        </td>
                        <td className="px-2 py-1 align-top text-[11px] text-slate-400">
                          {p.payrollStartDate && p.payrollEndDate ? (
                            <>
                              {formatDate(p.payrollStartDate)} –{" "}
                              {formatDate(p.payrollEndDate)}
                            </>
                          ) : (
                            "نفس فترة الشهر"
                          )}
                        </td>
                        <td className="px-2 py-1 align-top">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] border ${
                              p.isOpen
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/70"
                                : "bg-rose-500/10 text-rose-300 border-rose-500/70"
                            }`}
                          >
                            {p.isOpen ? "مفتوحة" : "مغلقة"}
                          </span>
                        </td>
                        <td className="px-2 py-1 align-top">
                          <button
                            type="button"
                            onClick={() => togglePeriodOpen(p)}
                            className="px-2 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-[11px]"
                          >
                            {p.isOpen ? "إغلاق الفترة" : "فتح الفترة"}
                          </button>
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
    </div>
  );
}
