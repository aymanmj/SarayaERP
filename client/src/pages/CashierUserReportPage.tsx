// src/pages/CashierUserReportPage.tsx

import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "../api/apiClient";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

type CashierUser = {
  id: number;
  fullName: string;
  username: string;
};

type PaymentSummary = {
  totalAmount: number;
  totalCount: number;
  cashAmount: number;
};

type PaymentByMethod = {
  method: string;
  totalAmount: number;
  count: number;
};

type PaymentRow = {
  id: number;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
  invoiceId: number;
  patient: {
    id: number;
    fullName: string;
    mrn: string;
  } | null;
};

type CashierUserReport = {
  cashier: CashierUser;
  dateFrom: string;
  dateTo: string;
  paymentsSummary: PaymentSummary;
  paymentsByMethod: PaymentByMethod[];
  payments: PaymentRow[];
};

type ClosedShiftInfo = {
  id: number;
  rangeStart: string;
  rangeEnd: string;
  systemCashTotal: number;
  actualCashTotal: number;
  difference: number;
  note?: string | null;
};

function formatDateTime(iso?: string | null, locale: string = "ar") {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(locale === "ar" ? "ar-LY" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(val: number | string | null | undefined) {
  const num = Number(val ?? 0);
  return num.toFixed(3);
}

export default function CashierUserReportPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const today = new Date().toISOString().slice(0, 10);

  const [reportDate, setReportDate] = useState<string>(today);
  const [fromTime, setFromTime] = useState<string>("00:00");
  const [toTime, setToTime] = useState<string>("23:59");

  const [report, setReport] = useState<CashierUserReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // نقدية فعلية في الخزينة عند الإغلاق
  const [actualCash, setActualCash] = useState<string>("");

  // ملاحظات الشفت
  const [note, setNote] = useState<string>("");

  const [closing, setClosing] = useState(false);

  // آخر شفت تم إقفاله في هذه الجلسة
  const [lastClosedShift, setLastClosedShift] =
    useState<ClosedShiftInfo | null>(null);

  const [searchParams] = useSearchParams();

  const [cashierId, setCashierId] = useState<string>("");

  // ✅ دالة جلب التقرير تدعم باراميترات اختيارية (مفيدة عند الدخول من صفحة الشفتات المقفولة)
  const loadReport = async (opts?: {
    date?: string;
    from?: string;
    to?: string;
    cashierId?: string;
  }) => {
    const date = opts?.date ?? reportDate;
    const from = opts?.from ?? fromTime;
    const to = opts?.to ?? toTime;
    const cashier = opts?.cashierId ?? cashierId;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (date) params.append("date", date);
      if (from) params.append("from", from);
      if (to) params.append("to", to);
      if (cashier) params.append("cashierId", cashier);

      const res = await apiClient.get<CashierUserReport>(
        `/cashier/reports/by-cashier?${params.toString()}`
      );
      setReport(res.data);
     
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      if (typeof msg === "string") setError(msg);
      else setError(t("treasury.userReport.toast.loadError", "حدث خطأ أثناء تحميل تقرير الكاشير."));
    } finally {
      setLoading(false);
    }
  };

  // تحميل أولي بالـ defaults (الكاشير الحالي / اليوم الحالي)
  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ عند الدخول من CashierClosedShiftsPage نقرأ الـ query string ونحمّل التقرير مباشرة بناءً عليها
  useEffect(() => {
    const dateParam = searchParams.get("date");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const cashierParam = searchParams.get("cashierId");

    if (!dateParam && !fromParam && !toParam && !cashierParam) return;

    if (dateParam) setReportDate(dateParam);
    if (fromParam) setFromTime(fromParam);
    if (toParam) setToTime(toParam);
    if (cashierParam) setCashierId(cashierParam);

    loadReport({
      date: dateParam || undefined,
      from: fromParam || undefined,
      to: toParam || undefined,
      cashierId: cashierParam || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const shiftLabel =
    report && report.dateFrom && report.dateTo
      ? (() => {
          const from = new Date(report.dateFrom);
          const to = new Date(report.dateTo);
          const datePart = formatDate(report.dateFrom);
          const fromPart = from.toLocaleTimeString(isRtl ? "ar-LY" : "en-US", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const toPart = to.toLocaleTimeString(isRtl ? "ar-LY" : "en-US", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return isRtl 
            ? `${datePart} من ${fromPart} إلى ${toPart}` 
            : `${datePart} from ${fromPart} to ${toPart}`;
        })()
      : null;

  // إجمالي النقدية من النظام + الفارق مع النقدية الفعلية
  const systemCash = report?.paymentsSummary.cashAmount ?? 0;
  const actualCashNum = useMemo(() => Number(actualCash || 0), [actualCash]);
  const cashDiff = useMemo(
    () => actualCashNum - systemCash,
    [actualCashNum, systemCash]
  );

  const handleCloseShift = async () => {
    if (!report) {
      toast.warning(t("treasury.userReport.toast.noReport", "لا يوجد تقرير حالي لإقفاله."));
      return;
    }

    const actual = Number(actualCash || 0);
    if (!actual || actual < 0) {
      toast.warning(t("treasury.userReport.toast.invalidCash", "أدخل قيمة نقدية فعلية صحيحة قبل إقفال الشفت."));
      return;
    }

    const ok = window.confirm(
      t("treasury.userReport.toast.confirmCloseShift", "هل أنت متأكد من إقفال الشفت الحالي وتسجيل هذه القيم؟\nلن يمكنك تعديل هذا الشفت بعد الإقفال.")
    );
    if (!ok) return;

    setClosing(true);
    setError(null);

    try {
      const res = await apiClient.post<ClosedShiftInfo>(
        "/cashier/shifts/close",
        {
          date: reportDate,
          from: fromTime,
          to: toTime,
          actualCash: actual,
          note: note || undefined,
         
        } as any
      );

      const closed = res.data;
      setLastClosedShift(closed);

      toast.success(
        t("treasury.userReport.toast.closeSuccess", "✅ تم إقفال الشفت بنجاح.") + "\n" +
        t("treasury.userReport.toast.systemTotal", "إجمالي النظام: {{amount}} LYD", { amount: formatMoney(closed.systemCashTotal) }) + "\n" +
        t("treasury.userReport.toast.actualTotal", "النقدية الفعلية: {{amount}} LYD", { amount: formatMoney(closed.actualCashTotal) }) + "\n" +
        t("treasury.userReport.toast.difference", "الفرق: {{amount}} LYD", { amount: formatMoney(closed.difference) })
      );

      // تنظيف الحقول بعد الإقفال
      setActualCash("");
      setNote("");

      // إعادة تحميل التقرير لنفس الفترة الحالية
      await loadReport();
     
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.message;
      if (typeof msg === "string") {
        toast.error(msg);
        setError(msg);
      } else {
        toast.error(t("treasury.userReport.toast.closeError", "حدث خطأ أثناء إقفال الشفت."));
        setError(t("treasury.userReport.toast.closeError", "حدث خطأ أثناء إقفال الشفت."));
      }
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-slate-100" dir={isRtl ? "rtl" : "ltr"}>
      {/* العنوان */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            {t("treasury.userReport.title", "تقرير الكاشير حسب المستخدم")}
          </h1>
          <p className="text-sm text-slate-400">
            {t("treasury.userReport.subtitle", "مراجعة الدفعات المسجّلة بواسطة المستخدم (الكاشير) خلال فترة معينة (تاريخ + شفت من/إلى) مع إمكانية إقفال الشفت.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadReport()}
          className="px-3 py-1.5 rounded-full text-xs bg-slate-800 hover:bg-slate-700 text-slate-100"
        >
          {t("treasury.common.refresh", "تحديث التقرير")}
        </button>
      </div>

      {/* فلاتر أعلى الصفحة */}
      <div className="mb-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          {/* التاريخ */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">{t("treasury.userReport.shiftDate", "تاريخ الشفت")}</label>
            <DatePicker
              date={reportDate ? new Date(reportDate) : undefined}
              onChange={(d) => setReportDate(d ? d.toISOString().slice(0, 10) : "")}
              className="bg-slate-900 border-slate-700 h-9 text-xs"
            />
          </div>

          {/* من وقت */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">{t("treasury.userReport.fromHour", "من الساعة")}</label>
            <input
              type="time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            />
          </div>

          {/* إلى وقت */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300">{t("treasury.userReport.toHour", "إلى الساعة")}</label>
            <input
              type="time"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            />
          </div>

          {/* زر تطبيق الفلاتر */}
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={() => loadReport()}
              className="w-full px-3 py-2 rounded-2xl text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {t("treasury.shifts.applyFilter", "تطبيق الفلترة")}
            </button>
            {loading && (
              <span className="mt-1 text-[11px] text-slate-500">
                {t("treasury.common.loading", "جارِ تحميل التقرير...")}
              </span>
            )}
            {error && (
              <span className="mt-1 text-[11px] text-rose-400">{error}</span>
            )}
          </div>
        </div>
      </div>

      {/* محتوى التقرير */}
      {!report ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
          {t("treasury.userReport.noReportData", "لا يوجد تقرير للعرض حالياً.")}
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 overflow-auto pb-4">
          {/* معلومات الكاشير والشفت */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <div className="text-slate-400">{t("treasury.shifts.cashier", "الكاشير")}</div>
              <div className="text-sm font-semibold text-slate-100">
                {report.cashier.fullName}{" "}
                <span className="text-[11px] text-slate-400">
                  ({report.cashier.username})
                </span>
              </div>
            </div>
            <div>
              <div className="text-slate-400">{t("treasury.userReport.periodLabel", "الفترة الزمنية")}</div>
              <div className="text-sm text-slate-100">{shiftLabel ?? "—"}</div>
            </div>
          </div>

          {/* ملخص الأرقام + كرت إقفال الشفت */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
              <div className="text-slate-400 mb-1">{t("treasury.dailyReport.table.count", "عدد الدفعات")}</div>
              <div className="text-2xl font-bold text-slate-100">
                {report.paymentsSummary.totalCount}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
              <div className="text-slate-400 mb-1">{t("treasury.userReport.totalPaymentsLabel", "إجمالي جميع الدفعات")}</div>
              <div className="text-2xl font-bold text-emerald-300">
                {formatMoney(report.paymentsSummary.totalAmount)} {t("treasury.common.lyd", "LYD")}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
              <div className="text-slate-400 mb-1">
                {t("treasury.shifts.totalSystem", "إجمالي النقدية (حسب النظام)")}
              </div>
              <div className="text-2xl font-bold text-amber-300">
                {formatMoney(systemCash)} {t("treasury.common.lyd", "LYD")}
              </div>
            </div>

            {/* كرت إقفال الشفت */}
            <div className="rounded-3xl border border-emerald-700 bg-emerald-950/40 p-4 text-xs flex flex-col gap-2">
              <div className="text-emerald-200 font-semibold mb-1">
                {t("treasury.userReport.closeShiftTitle", "إقفال الشفت الحالي")}
              </div>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="text-emerald-100">
                  {t("treasury.userReport.actualCash", "النقدية الفعلية في الخزينة (عند التسليم)")}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  className="bg-slate-900 border border-emerald-700/70 rounded-2xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/80"
                  placeholder={t("treasury.userReport.actualCashPlaceholder", "مثال: 1234.500")}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] mt-1">
                <span className="text-emerald-100">
                  {t("treasury.userReport.closingNote", "ملاحظات الشفت (اختياري)")}
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="bg-slate-900 border border-emerald-700/70 rounded-2xl px-3 py-2 text-xs min-h-[60px] focus:outline-none focus:ring-2 focus:ring-emerald-500/80"
                  placeholder={t("treasury.userReport.closingNotePlaceholder", "مثال: تم تسليم الخزينة إلى مشرف الصندوق...")}
                />
              </label>

              <div className="flex justify-between text-[11px] text-emerald-100 mt-1">
                <span>{t("treasury.userReport.differenceLabel", "الفرق (فعلي - نظام):")}</span>
                <span
                  className={
                    cashDiff > 0
                      ? "text-emerald-300 font-semibold"
                      : cashDiff < 0
                      ? "text-rose-300 font-semibold"
                      : "text-slate-100 font-semibold"
                  }
                >
                  {formatMoney(cashDiff)} {t("treasury.common.lyd", "LYD")}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCloseShift}
                disabled={closing}
                className="mt-2 px-3 py-2 rounded-2xl text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold"
              >
                {closing ? t("treasury.userReport.closingShift", "جارِ إقفال الشفت...") : t("treasury.userReport.confirmAndClose", "إقفال الشفت وتسجيل التسوية")}
              </button>
            </div>
          </div>

          {/* تجميع حسب طريقة الدفع */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">
              {t("treasury.dailyReport.paymentsByMethod", "إجمالي حسب طريقة الدفع")}
            </h2>
            {report.paymentsByMethod.length === 0 ? (
              <div className="text-slate-500 text-xs">
                {t("treasury.dailyReport.emptyPayments", "لا توجد دفعات في هذه الفترة.")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-right">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="px-2 py-1 text-right">{t("treasury.userReport.method", "طريقة الدفع")}</th>
                      <th className="px-2 py-1 text-right">{t("treasury.dailyReport.table.count", "عدد الدفعات")}</th>
                      <th className="px-2 py-1 text-right">{t("treasury.dailyReport.table.total", "الإجمالي")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.paymentsByMethod.map((row) => (
                      <tr
                        key={row.method}
                        className="border-t border-slate-800"
                      >
                        <td className="px-2 py-1 align-top">
                          <span className="uppercase">{row.method === "CASH" ? t("treasury.methods.CASH", "CASH") : row.method === "CARD" ? t("treasury.methods.CARD", "CARD") : row.method === "TRANSFER" ? t("treasury.methods.TRANSFER", "TRANSFER") : row.method === "INSURANCE" ? t("treasury.methods.INSURANCE", "INSURANCE") : t("treasury.methods.OTHER", "OTHER")}</span>
                        </td>
                        <td className="px-2 py-1 align-top">{row.count}</td>
                        <td className="px-2 py-1 align-top text-emerald-300">
                          {formatMoney(row.totalAmount)} {t("treasury.common.lyd", "LYD")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* جدول تفصيلي بكل الدفعات */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-xs">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">
              {t("treasury.userReport.detailedPayments", "الدفعات التفصيلية خلال الفترة")}
            </h2>
            {report.payments.length === 0 ? (
              <div className="text-slate-500 text-xs">
                {t("treasury.userReport.noPaymentsForCashier", "لا توجد دفعات مسجّلة لهذا الكاشير في هذه الفترة.")}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-[11px] text-right border-separate border-spacing-y-1">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="px-2 py-1 text-right">{t("treasury.userReport.timeHeader", "الوقت")}</th>
                      <th className="px-2 py-1 text-right">{t("treasury.userReport.patient", "المريض")}</th>
                      <th className="px-2 py-1 text-right">{t("treasury.userReport.mrnHeader", "رقم الملف")}</th>
                      <th className="px-2 py-1 text-right">{t("treasury.userReport.invoiceId", "رقم الفاتورة")}</th>
                      <th className="px-2 py-1 text-right">{t("treasury.userReport.method", "طريقة الدفع")}</th>
                      <th className="px-2 py-1 text-right">{t("treasury.userReport.amount", "المبلغ")}</th>
                      <th className="px-2 py-1 text-right">{t("treasury.userReport.reference", "المرجع")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.payments.map((p) => (
                      <tr
                        key={p.id}
                        className="bg-slate-950/70 border border-slate-800 rounded-xl"
                      >
                        <td className="px-2 py-1 align-top">
                          {formatDateTime(p.paidAt, i18n.language)}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {p.patient?.fullName ?? "—"}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {p.patient?.mrn ?? "—"}
                        </td>
                        <td className="px-2 py-1 align-top">#{p.invoiceId}</td>
                        <td className="px-2 py-1 align-top">
                          <span className="uppercase">{p.method === "CASH" ? t("treasury.methods.CASH", "CASH") : p.method === "CARD" ? t("treasury.methods.CARD", "CARD") : p.method === "TRANSFER" ? t("treasury.methods.TRANSFER", "TRANSFER") : p.method === "INSURANCE" ? t("treasury.methods.INSURANCE", "INSURANCE") : t("treasury.methods.OTHER", "OTHER")}</span>
                        </td>
                        <td className="px-2 py-1 align-top text-emerald-300">
                          {formatMoney(p.amount)} {t("treasury.common.lyd", "LYD")}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {p.reference ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* آخر شفت مقفول */}
          {lastClosedShift && (
            <div className="rounded-3xl border border-emerald-700/60 bg-emerald-950/30 p-4 text-xs flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <div className="text-emerald-200 font-semibold">
                  {t("treasury.userReport.lastClosedTitle", "آخر شفت تم إقفاله في هذه الجلسة")}
                </div>
                <div className="text-[11px] text-emerald-300">
                  {t("treasury.userReport.shiftNumberLabel", "رقم الشفت: #")}{lastClosedShift.id}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                <div>
                  <div className="text-emerald-100/80">{t("treasury.userReport.period", "الفترة الزمنية")}</div>
                  <div className="text-[11px] text-slate-100">
                    من {formatDateTime(lastClosedShift.rangeStart, i18n.language)} إلى{" "}
                    {formatDateTime(lastClosedShift.rangeEnd, i18n.language)}
                  </div>
                </div>
                <div>
                  <div className="text-emerald-100/80">
                    {t("treasury.shifts.totalSystem", "إجمالي النظام (نقداً)")}
                  </div>
                  <div className="text-[11px] text-amber-200 font-semibold">
                    {formatMoney(lastClosedShift.systemCashTotal)} {t("treasury.common.lyd", "LYD")}
                  </div>
                </div>
                <div>
                  <div className="text-emerald-100/80">
                    {t("treasury.userReport.actualCash", "النقدية الفعلية (عند التسليم)")}
                  </div>
                  <div className="text-[11px] text-emerald-200 font-semibold">
                    {formatMoney(lastClosedShift.actualCashTotal)} {t("treasury.common.lyd", "LYD")}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center mt-2">
                <div className="text-emerald-100/80">{t("treasury.userReport.differenceLabel", "الفرق (فعلي - نظام)")}</div>
                <div
                  className={
                    lastClosedShift.difference > 0
                      ? "text-emerald-300 font-semibold"
                      : lastClosedShift.difference < 0
                      ? "text-rose-300 font-semibold"
                      : "text-slate-100 font-semibold"
                  }
                >
                  {formatMoney(lastClosedShift.difference)} {t("treasury.common.lyd", "LYD")}
                </div>
              </div>

              {lastClosedShift.note && (
                <div className="mt-2 text-[11px]">
                  <div className="text-emerald-100/80 mb-0.5">
                    {t("treasury.userReport.shiftNoteLabel", "ملاحظة الشفت:")}
                  </div>
                  <div className="text-slate-100">{lastClosedShift.note}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
