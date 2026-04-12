// src/pages/PatientStatementPage.tsx

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import PrintLayout from "../components/print/PrintLayout";

type InvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "CANCELLED";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "INSURANCE" | "OTHER";

type PatientLite = {
  id: number;
  fullName: string;
  mrn: string;
};

type InvoiceDto = {
  id: number;
  status: InvoiceStatus;
  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: string;
  encounter: {
    id: number;
    type: string;
  } | null;
};

type PaymentDto = {
  id: number;
  invoiceId: number;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  paidAt: string;
  invoice: {
    id: number;
    createdAt: string;
  } | null;
};

type StatementResponse = {
  patient: PatientLite;
  summary: {
    totalInvoiced: number;
    totalDiscount: number;
    totalPaid: number;
    remaining: number;
  };
  invoices: InvoiceDto[];
  payments: PaymentDto[];
};

type DispensedDrugLite = {
  id: number;
  code: string | null;
  name: string;
  strength: string | null;
  form: string | null;
};

type DispenseItemRow = {
  id: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  dispensedDrug: DispensedDrugLite | null;
  originalDrug: DispensedDrugLite | null;
  isSubstitute: boolean;
};

type DispenseSummary = {
  id: number;
  createdAt: string;
  notes: string | null;
  doctor: { id: number; fullName: string } | null;
  totalAmount: number;
  items: DispenseItemRow[];
};

type StatementRow = {
  date: string;
  kind: "INVOICE" | "PAYMENT";
  ref: string;
  description: string;
  debit: number;
  credit: number;
  balance: number; // الرصيد التراكمي على المريض بعد هذا السطر
};

// encounterId -> list of dispenses from pharmacy
type EncounterDispenseMap = Record<number, DispenseSummary[]>;

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status: InvoiceStatus) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "ISSUED":
      return "صادرة";
    case "PARTIALLY_PAID":
      return "مدفوعة جزئياً";
    case "PAID":
      return "مدفوعة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return status;
  }
}

function formatMethod(method: PaymentMethod) {
  switch (method) {
    case "CASH":
      return "نقداً";
    case "CARD":
      return "بطاقة";
    case "TRANSFER":
      return "حوالة";
    case "INSURANCE":
      return "تأمين";
    default:
      return "أخرى";
  }
}

function formatMoney(value: number) {
  return value.toFixed(3) + " LYD";
}

export default function PatientStatementPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const patientId = Number(id);

  const [data, setData] = useState<StatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pharmacyDispenses, setPharmacyDispenses] =
    useState<EncounterDispenseMap>({});
  const [loadingPharmacy, setLoadingPharmacy] = useState(false);

  async function loadPharmacyDispensesForInvoices(invoices: InvoiceDto[]) {
    // نستخرج كل encounterId من الفواتير
    const encounterIds = Array.from(
      new Set(
        invoices
          .map((inv) => inv.encounter?.id)
          .filter((id): id is number => typeof id === "number")
      )
    );

    if (encounterIds.length === 0) {
      setPharmacyDispenses({});
      return;
    }

    try {
      setLoadingPharmacy(true);

      const results: EncounterDispenseMap = {};

      // نعمل طلب لكل Encounter
      await Promise.all(
        encounterIds.map(async (encId) => {
          try {
            const res = await apiClient.get<DispenseSummary[]>(
              `/pharmacy/encounters/${encId}/dispenses-summary`
            );
            results[encId] = res.data;
          } catch (err) {
            console.error(
              "error loading pharmacy dispenses for encounter",
              encId,
              err
            );
          }
        })
      );

      setPharmacyDispenses(results);
    } finally {
      setLoadingPharmacy(false);
    }
  }
  useEffect(() => {
    if (!patientId || Number.isNaN(patientId)) {
      setError("رقم المريض غير صحيح.");
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<StatementResponse>(
          `/cashier/patients/${patientId}/statement`
        );
        setData(res.data);

        // ⭐ بعد تحميل كشف الحساب، نحمل صرف الصيدلية لكل الـ encounters الموجودة في الفواتير
        if (res.data.invoices && res.data.invoices.length > 0) {
          loadPharmacyDispensesForInvoices(res.data.invoices);
        } else {
          setPharmacyDispenses({});
        }
      } catch (err: any) {
        console.error(err);
        const msg = err?.response?.data?.message;
        if (typeof msg === "string") setError(msg);
        else setError("حدث خطأ أثناء تحميل كشف حساب المريض.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [patientId]);

  const summary = data?.summary;
  const patient = data?.patient;

  const statementRows = useMemo<StatementRow[]>(() => {
    if (!data) return [];

    type BaseRow = Omit<StatementRow, "balance">;
    const tmp: BaseRow[] = [];

    // 🧾 الفواتير = مدين على المريض
    for (const inv of data.invoices) {
      const total = Number(inv.totalAmount ?? 0);
      const discount = Number(inv.discountAmount ?? 0);
      const netAmount = total - discount; // الصافي المستحق على المريض

      if (netAmount === 0) continue;

      tmp.push({
        date: inv.createdAt,
        kind: "INVOICE",
        ref: `فاتورة #${inv.id}`,
        description: inv.encounter
          ? `حالة #${inv.encounter.id} – ${inv.encounter.type}`
          : "فاتورة خدمات للمريض",
        debit: netAmount,
        credit: 0,
      });
    }

    // 💵 الدفعات = دائن (تسديد من المريض)
    for (const p of data.payments) {
      const amount = Number(p.amount ?? 0);
      if (amount === 0) continue;

      tmp.push({
        date: p.paidAt,
        kind: "PAYMENT",
        ref: `دفعة #${p.id}`,
        description: p.invoice
          ? `سداد على فاتورة #${p.invoice.id} (${formatMethod(p.method)})`
          : `دفعة (${formatMethod(p.method)})`,
        debit: 0,
        credit: amount,
      });
    }

    // ⏱️ ترتيب زمني (الفواتير قبل الدفعات إذا في نفس اللحظة)
    tmp.sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      if (ta !== tb) return ta - tb;
      if (a.kind === b.kind) return 0;
      return a.kind === "INVOICE" ? -1 : 1;
    });

    // 🧮 حساب الرصيد المتحرك (على المريض)
    let running = 0;
    return tmp.map((row) => {
      running += row.debit - row.credit;
      return { ...row, balance: running };
    });
  }, [data]);

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
            <h1 className="text-2xl font-bold mb-1">كشف حساب المريض</h1>
            <p className="text-sm text-slate-400">
              عرض الفواتير والدفعات والرصيد المتبقي للمريض.
            </p>
          </div>
        </div>

        {patient && (
          <div className="text-center text-sm">
            <div className="font-semibold text-slate-100">
              {patient.fullName}
            </div>
            <div className="text-slate-400">ملف: {patient.mrn}</div>
          </div>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="print:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-500/40"
        >
          <span>🖨️</span>
          <span>طباعة كشف الحساب</span>
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
          {/* ملخص الحساب */}
          <div className="space-y-4 xl:col-span-1">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">
                ملخص الحساب
              </h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-3">
                  <div className="text-xs text-slate-400 mb-1">
                    إجمالي المفوتر
                  </div>
                  <div className="text-lg font-semibold text-sky-300">
                    LYD {summary?.totalInvoiced.toFixed(3) ?? "0.000"}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-3">
                  <div className="text-xs text-slate-400 mb-1">
                    إجمالي الخصومات
                  </div>
                  <div className="text-lg font-semibold text-amber-300">
                    LYD {summary?.totalDiscount.toFixed(3) ?? "0.000"}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-3">
                  <div className="text-xs text-slate-400 mb-1">
                    إجمالي المدفوع
                  </div>
                  <div className="text-lg font-semibold text-emerald-300">
                    LYD {summary?.totalPaid.toFixed(3) ?? "0.000"}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-900/70 border border-slate-700/60 p-3">
                  <div className="text-xs text-slate-400 mb-1">
                    الرصيد المتبقي
                  </div>
                  <div className="text-lg font-semibold text-rose-300">
                    LYD {summary?.remaining.toFixed(3) ?? "0.000"}
                  </div>
                </div>
              </div>
            </div>

            {patient && (
              <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                <h2 className="text-sm font-semibold text-slate-200 mb-3">
                  بيانات المريض
                </h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">الاسم:</span>
                    <span className="text-slate-100">{patient.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">رقم الملف:</span>
                    <span className="text-slate-100">{patient.mrn}</span>
                  </div>
                  {/* <div className="mt-3 text-xs text-slate-400">
                    لاحقاً يمكن إضافة رابط لعرض سجل الزيارات الكامل للمريض.
                  </div> */}
                </div>
              </div>
            )}
          </div>

          {/* الفواتير + الدفعات */}
          <div className="space-y-4 xl:col-span-2">
            {/* جدول الفواتير */}
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">
                الفواتير
              </h2>

              {data.invoices.length === 0 ? (
                <div className="py-4 text-xs text-slate-500 text-center">
                  لا توجد فواتير مسجلة لهذا المريض.
                </div>
              ) : (
                <div className="overflow-x-auto text-xs">
                  <table className="min-w-full text-right">
                    <thead className="text-[11px] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-2">#</th>
                        <th className="py-2 px-2">التاريخ</th>
                        <th className="py-2 px-2">الحالة</th>
                        <th className="py-2 px-2">الحالة الطبية</th>
                        <th className="py-2 px-2">الإجمالي</th>
                        <th className="py-2 px-2">الخصم</th>
                        <th className="py-2 px-2">المدفوع</th>
                        <th className="py-2 px-2">المتبقي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className="border-b border-slate-900/80 hover:bg-slate-900/60"
                        >
                          <td className="py-2 px-2">فاتورة #{inv.id}</td>
                          <td className="py-2 px-2">
                            {formatDateTime(inv.createdAt)}
                          </td>
                          <td className="py-2 px-2 text-slate-200">
                            {formatStatus(inv.status)}
                          </td>
                          <td className="py-2 px-2 text-slate-300">
                            {inv.encounter
                              ? `حالة #${inv.encounter.id} – ${inv.encounter.type}`
                              : "—"}
                          </td>
                          <td className="py-2 px-2 text-sky-300">
                            LYD {inv.totalAmount.toFixed(3)}
                          </td>
                          <td className="py-2 px-2 text-amber-300">
                            LYD {inv.discountAmount.toFixed(3)}
                          </td>
                          <td className="py-2 px-2 text-emerald-300">
                            LYD {inv.paidAmount.toFixed(3)}
                          </td>
                          <td className="py-2 px-2 text-rose-300">
                            LYD {inv.remainingAmount.toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* جدول الدفعات */}
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">
                الدفعات
              </h2>

              {data.payments.length === 0 ? (
                <div className="py-4 text-xs text-slate-500 text-center">
                  لا توجد دفعات مسجلة لهذا المريض.
                </div>
              ) : (
                <div className="overflow-x-auto text-xs">
                  <table className="min-w-full text-right">
                    <thead className="text-[11px] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-2">#</th>
                        <th className="py-2 px-2">التاريخ</th>
                        <th className="py-2 px-2">الفاتورة</th>
                        <th className="py-2 px-2">المبلغ</th>
                        <th className="py-2 px-2">طريقة الدفع</th>
                        <th className="py-2 px-2">المرجع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-slate-900/80 hover:bg-slate-900/60"
                        >
                          <td className="py-2 px-2">دفعة #{p.id}</td>
                          <td className="py-2 px-2">
                            {formatDateTime(p.paidAt)}
                          </td>
                          <td className="py-2 px-2">
                            {p.invoice
                              ? `فاتورة #${p.invoice.id}`
                              : `فاتورة #${p.invoiceId}`}
                          </td>
                          <td className="py-2 px-2 text-emerald-300">
                            LYD {p.amount.toFixed(3)}
                          </td>
                          <td className="py-2 px-2 text-slate-200">
                            {formatMethod(p.method)}
                          </td>
                          <td className="py-2 px-2 text-slate-300">
                            {p.reference || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* جدول كشف الحركة المالية برصيد متحرك */}
            <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">
                سجل الحركة المالية (فواتير ودفعات برصيد متحرك)
              </h2>

              {statementRows.length === 0 ? (
                <div className="py-4 text-xs text-slate-500 text-center">
                  لا توجد حركات مالية مسجلة على هذا المريض.
                </div>
              ) : (
                <div className="overflow-x-auto text-xs">
                  <table className="min-w-full text-right">
                    <thead className="text-[11px] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-2">التاريخ</th>
                        <th className="py-2 px-2">النوع</th>
                        <th className="py-2 px-2">المرجع</th>
                        <th className="py-2 px-2">الوصف</th>
                        <th className="py-2 px-2">مدين</th>
                        <th className="py-2 px-2">دائن</th>
                        <th className="py-2 px-2">الرصيد (على المريض)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-slate-900/80 hover:bg-slate-900/60"
                        >
                          <td className="py-2 px-2">
                            {formatDateTime(row.date)}
                          </td>
                          <td className="py-2 px-2 text-slate-200">
                            {row.kind === "INVOICE" ? "فاتورة" : "دفعة"}
                          </td>
                          <td className="py-2 px-2 text-slate-300">
                            {row.ref}
                          </td>
                          <td className="py-2 px-2 text-slate-300 max-w-xs">
                            <span className="line-clamp-2">
                              {row.description}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-emerald-300">
                            {row.debit ? formatMoney(row.debit) : "—"}
                          </td>
                          <td className="py-2 px-2 text-amber-300">
                            {row.credit ? formatMoney(row.credit) : "—"}
                          </td>
                          <td className="py-2 px-2 text-sky-300 font-semibold">
                            {formatMoney(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ================================================================== */}
            {/* الأدوية المصروفة من الصيدلية لكل زيارة مرتبطة بفواتير هذا المريض */}
            {/* ================================================================== */}
            <div className="mt-8 rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <h2 className="font-semibold text-slate-100 text-base">
                  الأدوية المصروفة من الصيدلية (حسب الزيارات)
                </h2>
                <span className="text-xs text-slate-400">
                  {loadingPharmacy
                    ? "جارِ تحميل بيانات الصيدلية..."
                    : `عدد الزيارات التي تحتوي على صرف أدوية: ${
                        Object.keys(pharmacyDispenses).length
                      }`}
                </span>
              </div>

              {loadingPharmacy && (
                <div className="px-4 py-6 text-center text-slate-400 text-sm">
                  جارِ تحميل بيانات الصيدلية...
                </div>
              )}

              {!loadingPharmacy &&
                Object.keys(pharmacyDispenses).length === 0 && (
                  <div className="px-4 py-6 text-center text-slate-500 text-sm">
                    لا توجد عمليات صرف أدوية مسجلة للزيارات المرتبطة بهذا
                    المريض.
                  </div>
                )}

              {!loadingPharmacy &&
                Object.entries(pharmacyDispenses).map(
                  ([encounterId, dispenses]) => (
                    <div
                      key={encounterId}
                      className="border-b border-slate-800 last:border-b-0"
                    >
                      <div className="px-4 py-2 bg-slate-900/80 text-xs text-slate-300 flex items-center justify-between">
                        <div>
                          <span>زيارة رقم: {encounterId}</span>
                        </div>
                        <div className="text-emerald-300">
                          إجمالي قيمة الأدوية لهذه الزيارة:{" "}
                          {formatMoney(
                            dispenses.reduce((sum, d) => sum + d.totalAmount, 0)
                          )}
                        </div>
                      </div>

                      {dispenses.map((d) => (
                        <div key={d.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <div>
                              <span>رقم صرف: {d.id}</span>
                              <span className="mx-2">•</span>
                              <span>
                                التاريخ: {formatDateTime(d.createdAt)}
                              </span>
                              {d.doctor && (
                                <>
                                  <span className="mx-2">•</span>
                                  <span>الطبيب: {d.doctor.fullName}</span>
                                </>
                              )}
                            </div>
                            <div className="text-emerald-300 font-semibold">
                              إجمالي قيمة هذه العملية:{" "}
                              {formatMoney(d.totalAmount)}
                            </div>
                          </div>

                          {d.notes && (
                            <div className="text-xs text-slate-200">
                              ملاحظات الصيدلية: {d.notes}
                            </div>
                          )}

                          <div className="overflow-x-auto mt-2">
                            <table className="min-w-full text-[11px]">
                              <thead className="bg-slate-900/80 border border-slate-800">
                                <tr>
                                  <th className="px-2 py-1 text-right text-slate-400">
                                    الدواء المصروف
                                  </th>
                                  <th className="px-2 py-1 text-right text-slate-400">
                                    بديل عن
                                  </th>
                                  <th className="px-2 py-1 text-right text-slate-400">
                                    الكمية
                                  </th>
                                  <th className="px-2 py-1 text-right text-slate-400">
                                    سعر الوحدة
                                  </th>
                                  <th className="px-2 py-1 text-right text-slate-400">
                                    الإجمالي
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.items.map((it) => (
                                  <tr
                                    key={it.id}
                                    className="border-b border-slate-800/60 last:border-b-0"
                                  >
                                    <td className="px-2 py-1 text-right text-slate-100">
                                      {it.dispensedDrug?.name ?? "-"}
                                      {it.dispensedDrug?.strength
                                        ? ` (${it.dispensedDrug.strength})`
                                        : ""}
                                      {it.dispensedDrug?.code && (
                                        <span className="text-[10px] text-slate-400 ml-1">
                                          [{it.dispensedDrug.code}]
                                        </span>
                                      )}
                                      {it.isSubstitute && (
                                        <span className="ml-1 text-[10px] text-amber-300">
                                          (بديل)
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1 text-right text-slate-300">
                                      {it.isSubstitute && it.originalDrug
                                        ? `${it.originalDrug.name}${
                                            it.originalDrug.strength
                                              ? ` (${it.originalDrug.strength})`
                                              : ""
                                          }`
                                        : "-"}
                                    </td>
                                    <td className="px-2 py-1 text-right text-slate-200">
                                      {it.quantity.toFixed(3)}
                                    </td>
                                    <td className="px-2 py-1 text-right text-slate-200">
                                      {it.unitPrice.toFixed(3)}
                                    </td>
                                    <td className="px-2 py-1 text-right text-slate-100">
                                      {it.totalAmount.toFixed(3)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
