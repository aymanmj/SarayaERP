import { useAuth } from "../../hooks/useAuth";
import { useIdempotentPost } from "../../hooks/useIdempotentPost";
import { formatMoney } from "../../utils/money";
import React, { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import { toast } from "sonner";

interface PatientDepositPanelProps {
  patientId: number;
  encounterId?: number;
  patientName?: string;
  onBalanceUpdated?: () => void;
}

interface DepositVoucher {
  id: number;
  code: string | null;
  date: string;
  amount: number | string;
  notes: string | null;
  reference: string | null;
  cashAccount?: { code: string; name: string };
  createdBy?: { fullName: string };
}

interface AppliedPayment {
  id: number;
  amount: number | string;
  paidAt: string;
  reference: string | null;
  invoice: {
    id: number;
    totalAmount: number | string;
    patientShare: number | string;
    status: string;
  };
}

interface DepositBalanceResponse {
  patientId: number;
  totalDeposited: string;
  totalApplied: string;
  totalRefunded: string;
  availableBalance: string;
  deposits: DepositVoucher[];
  appliedPayments: AppliedPayment[];
  refunds: DepositVoucher[];
}

export const PatientDepositPanel: React.FC<PatientDepositPanelProps> = ({
  patientId,
  encounterId,
  patientName,
  onBalanceUpdated,
}) => {
  const auth = useAuth();
  const canManage = auth.hasPermission("billing:manage") || auth.user?.permissions.includes("ADMIN_FULL_ACCESS");
  const request = useIdempotentPost(
    `deposit:${auth.user?.hospitalId}:${auth.user?.id}:${patientId}:${encounterId ?? "all"}`,
  );
  const validAmount = (value: string) =>
    /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(value) && /[1-9]/.test(value);
  const [data, setData] = useState<DepositBalanceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals
  const [showCollectModal, setShowCollectModal] = useState<boolean>(false);
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [showRefundModal, setShowRefundModal] = useState<boolean>(false);
  const [showInterimModal, setShowInterimModal] = useState<boolean>(false);

  // Form states
  const [collectAmount, setCollectAmount] = useState<string>("");
  const [collectMethod, setCollectMethod] = useState<
    "CASH" | "CARD" | "TRANSFER"
  >("CASH");
  const [collectNotes, setCollectNotes] = useState<string>("");

  const [applyInvoiceId, setApplyInvoiceId] = useState<string>("");
  const [applyAmount, setApplyAmount] = useState<string>("");

  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [refundReason, setRefundReason] = useState<string>("");

  const [cutoffDate, setCutoffDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [autoApplyDeposit, setAutoApplyDeposit] = useState<boolean>(true);

  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      const url = encounterId
        ? `/billing/patients/${patientId}/deposits?encounterId=${encounterId}`
        : `/billing/patients/${patientId}/deposits`;
      const res = await apiClient.get<DepositBalanceResponse>(url);
      setData(res.data);
      if (onBalanceUpdated) onBalanceUpdated();
    } catch (err: any) {
      toast.error("فشل تحميل بيانات أمانات المريض");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchBalance();
    }
  }, [patientId, encounterId]);

  const handleCollectDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = collectAmount;
    if (!validAmount(num)) {
      toast.error("يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }

    try {
      setSubmitting(true);
      await request.submit("/billing/deposits", {
        patientId,
        encounterId: encounterId || undefined,
        amount: num,
        method: collectMethod,
        notes: collectNotes || undefined,
      });
      toast.success("تم تسجيل إيداع الأمانات بنجاح");
      setShowCollectModal(false);
      setCollectAmount("");
      setCollectNotes("");
      fetchBalance();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل تسجيل الأمانات");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invId = parseInt(applyInvoiceId);
    if (isNaN(invId) || invId <= 0) {
      toast.error("يرجى تحديد رقم الفاتورة بشكل صحيح");
      return;
    }

    const num = applyAmount || undefined;
    if (num !== undefined && !validAmount(num)) {
      toast.error("يرجى إدخال مبلغ تطبيق صحيح");
      return;
    }

    try {
      setSubmitting(true);
      await request.submit(`/billing/invoices/${invId}/apply-deposit`, {
        invoiceId: invId,
        amount: num,
      });
      toast.success("تم تسوية وتطبيق الأمانات على الفاتورة بنجاح");
      setShowApplyModal(false);
      setApplyInvoiceId("");
      setApplyAmount("");
      fetchBalance();
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || "فشل تطبيق الأمانات على الفاتورة",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefundDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = refundAmount;
    if (!validAmount(num)) {
      toast.error("يرجى إدخال مبلغ استرداد صحيح");
      return;
    }
    if (refundReason.trim().length < 10) {
      toast.error("يرجى توضيح سبب الاسترداد لتوثيق السجل المالي");
      return;
    }

    try {
      setSubmitting(true);
      await request.submit("/billing/deposits/refund", {
        patientId,
        amount: num,
        method: refundMethod,
        reason: refundReason.trim(),
      });
      toast.success("تم تسجيل إذن صرف استرداد الأمانات بنجاح");
      setShowRefundModal(false);
      setRefundAmount("");
      setRefundReason("");
      fetchBalance();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل استرداد الأمانات");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInterimInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encounterId) {
      toast.error("لا يمكن إصدار فاتورة مرحلية بدون تحديد الحالة السريرية");
      return;
    }

    try {
      setSubmitting(true);
      await apiClient.post(
        `/billing/encounters/${encounterId}/interim-invoice`,
        {
          cutoffDate,
          autoApplyDeposit,
        },
      );
      toast.success("تم إنشاء الفاتورة المرحلية بنجاح");
      setShowInterimModal(false);
      fetchBalance();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "فشل إنشاء الفاتورة المرحلية");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-6 text-center text-gray-500 font-sans">
        جاري تحميل رصيد وأمانات المريض...
      </div>
    );
  }

  const hasAvailable = !!data && /[1-9]/.test(data.availableBalance);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6 dir-rtl text-right">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            محفظة وأمانات المريض (Patient Trust & Deposits)
          </h2>
          <p className="text-sm text-gray-500">
            {patientName
              ? `المريض: ${patientName} (ID: ${patientId})`
              : `معرف المريض: #${patientId}`}
            {encounterId && ` • التنويم الحالي: #${encounterId}`}
          </p>
        </div>

        {/* Action Buttons */}
        <fieldset disabled={!canManage || !!request.pending || request.busy} className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCollectModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition"
          >
            + إيداع دفعة / أمانات
          </button>

          {hasAvailable && (
            <>
              <button
                onClick={() => setShowApplyModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
              >
                تطبيق على فاتورة
              </button>
              <button
                onClick={() => setShowRefundModal(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition"
              >
                استرداد فائض الأمانات
              </button>
            </>
          )}

          {encounterId && (
            <button
              onClick={() => setShowInterimModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
            >
              فاتورة مرحلية
            </button>
          )}
        </fieldset>
      </div>

      {request.pending && (
        <aside role="alert">
          لم تُحسم نتيجة الطلب. احتُفظ بالمبلغ والمعرف؛لا تبدأ حركة أخرى أو تغلق
          الصفحة.
          <button
            disabled={request.busy}
            onClick={async () => {
              try {
                await request.retry();
                toast.success("تم تأكيد الطلب؛راجع سجل الحركات");
                setShowCollectModal(false);
                setShowApplyModal(false);
                setShowRefundModal(false);
                void fetchBalance();
              } catch {
                toast.error("لم يتأكد الرد؛أعد المحاولة بالطلب نفسه");
              }
            }}
          >
            إعادة المحاولة بالطلب نفسه
          </button>
        </aside>
      )}
      {/* Balance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="text-sm text-emerald-800 font-medium">
            رصيد أمانات المريض في كل الحالات
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-1">
            {formatMoney(data?.availableBalance, false)}{" "}
            <span className="text-sm font-normal">د.ل</span>
          </div>
          <div className="text-xs text-emerald-700 mt-1">
            محفظة المريض موحدة؛قوائم الحركات أدناه مرشحة بالحالة المحددة
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-sm text-blue-800 font-medium">إجمالي المودع</div>
          <div className="text-2xl font-bold text-blue-900 mt-1">
            {formatMoney(data?.totalDeposited, false)}{" "}
            <span className="text-sm font-normal">د.ل</span>
          </div>
          <div className="text-xs text-blue-700 mt-1">
            إجمالي المقبوضات عبر أذونات القبض
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="text-sm text-purple-800 font-medium">
            المستهلك في الفواتير
          </div>
          <div className="text-2xl font-bold text-purple-900 mt-1">
            {formatMoney(data?.totalApplied, false)}{" "}
            <span className="text-sm font-normal">د.ل</span>
          </div>
          <div className="text-xs text-purple-700 mt-1">
            تمت تسويته كدفعات سداد للفواتير
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-sm text-amber-800 font-medium">
            المسترد للمريض
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-1">
            {formatMoney(data?.totalRefunded, false)}{" "}
            <span className="text-sm font-normal">د.ل</span>
          </div>
          <div className="text-xs text-amber-700 mt-1">
            أذونات صرف مستردة عند الخروج أو الإلغاء
          </div>
        </div>
      </div>

      {/* Tabs / Transactions History */}
      <div className="space-y-4 pt-2">
        <h3 className="text-base font-bold text-gray-800">
          حركات الأمانات والمقبوضات
        </h3>
        {data?.deposits && data.deposits.length > 0 ? (
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-sm text-right text-gray-600">
              <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">رقم الإذن</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">المبلغ</th>
                  <th className="py-3 px-4">الحساب المالي</th>
                  <th className="py-3 px-4">المسؤول</th>
                  <th className="py-3 px-4">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.deposits.map((dep) => (
                  <tr key={dep.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono font-bold text-gray-800">
                      {dep.code || `#${dep.id}`}
                    </td>
                    <td className="py-3 px-4">
                      {new Date(dep.date).toLocaleDateString("ar-LY")}
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-600">
                      {formatMoney(dep.amount)}
                    </td>
                    <td className="py-3 px-4">
                      {dep.cashAccount?.name || "صندوق الخزينة"}
                    </td>
                    <td className="py-3 px-4">
                      {dep.createdBy?.fullName || "-"}
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {dep.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 bg-gray-50 rounded-xl text-center text-gray-500 text-sm">
            لا توجد أمانات مودعة مسجلة لهذا المريض حتى الآن.
          </div>
        )}
      </div>

      {/* Applied Payments History */}
      {data?.appliedPayments && data.appliedPayments.length > 0 && (
        <div className="space-y-4 pt-2">
          <h3 className="text-base font-bold text-gray-800">
            التسويات المطبقة على الفواتير
          </h3>
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-sm text-right text-gray-600">
              <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">رقم الدفعة</th>
                  <th className="py-3 px-4">الفاتورة</th>
                  <th className="py-3 px-4">تاريخ التطبيق</th>
                  <th className="py-3 px-4">المبلغ المخصوم</th>
                  <th className="py-3 px-4">حالة الفاتورة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.appliedPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono font-bold">#{p.id}</td>
                    <td className="py-3 px-4 font-semibold text-blue-600">
                      فاتورة #{p.invoice.id}
                    </td>
                    <td className="py-3 px-4">
                      {new Date(p.paidAt).toLocaleDateString("ar-LY")}
                    </td>
                    <td className="py-3 px-4 font-bold text-purple-600">
                      {formatMoney(p.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                        {p.invoice.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Collect Deposit Modal */}
      {showCollectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-2">
              إيداع دفعة / أمانات مريض
            </h3>
            <form onSubmit={handleCollectDeposit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  المبلغ (د.ل) *
                </label>
                <input
                  disabled={submitting || !!request.pending}
                  type="number"
                  step="0.001"
                  required
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="0.000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  طريقة الدفع *
                </label>
                <select
                  disabled={submitting || !!request.pending}
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="CASH">نقداً (خزينة المستشفى)</option>
                  <option value="CARD">بطاقة مصرفية</option>
                  <option value="TRANSFER">حوالة بنكية</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ملاحظات
                </label>
                <textarea
                  disabled={submitting || !!request.pending}
                  rows={2}
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-sm"
                  placeholder="دفعة تحت الحساب لجراحة / إقامة..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting || !!request.pending}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {submitting ? "جاري الحفظ..." : "تأكيد الإيداع"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Apply Deposit Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-2">
              تطبيق الأمانات لسداد فاتورة
            </h3>
            <p className="text-xs text-gray-500">
              الرصيد المتاح للسداد:{" "}
              <strong className="text-emerald-700">
                {formatMoney(data?.availableBalance, false)} د.ل
              </strong>
            </p>
            <form onSubmit={handleApplyDeposit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  رقم الفاتورة *
                </label>
                <input
                  disabled={submitting || !!request.pending}
                  type="number"
                  required
                  value={applyInvoiceId}
                  onChange={(e) => setApplyInvoiceId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="مثال: 104"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  المبلغ المراد تطبيقه (اتركه فارغاً لسداد كامل المتبقي)
                </label>
                <input
                  disabled={submitting || !!request.pending}
                  type="number"
                  step="0.001"
                  value={applyAmount}
                  onChange={(e) => setApplyAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder={`الحد الأقصى: ${formatMoney(data?.availableBalance, false)}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting || !!request.pending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {submitting ? "جاري التطبيق..." : "تأكيد السداد"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refund Deposit Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-2">
              استرداد فائض الأمانات للمريض
            </h3>
            <p className="text-xs text-gray-500">
              الرصيد المتاح للاسترداد:{" "}
              <strong className="text-amber-700">
                {formatMoney(data?.availableBalance, false)} د.ل
              </strong>
            </p>
            <form onSubmit={handleRefundDeposit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  المبلغ المسترد (د.ل) *
                </label>
                <input
                  disabled={submitting || !!request.pending}
                  type="number"
                  step="0.001"
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-left font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  placeholder="0.000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  طريقة الصرف *
                </label>
                <select
                  disabled={submitting || !!request.pending}
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="CASH">نقداً من الخزينة</option>
                  <option value="TRANSFER">حوالة بنكية مستردة</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  سبب الاسترداد والتوثيق *
                </label>
                <textarea
                  disabled={submitting || !!request.pending}
                  rows={2}
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm"
                  placeholder="تسوية خروج نهائي / إلغاء حجز العملية..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting || !!request.pending}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {submitting ? "جاري الصرف..." : "تأكيد إذن الصرف"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interim Invoicing Modal */}
      {showInterimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 border-b pb-2">
              إصدار فاتورة مرحلية (Interim Billing)
            </h3>
            <p className="text-xs text-gray-500">
              تفوتر جميع بنود الإقامة والفحوصات والأدوية المتراكمة حتى تاريخ
              القطع المحدد، مع إبقاء الحالة مفتوحة.
            </p>
            <form onSubmit={handleCreateInterimInvoice} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  تاريخ القطع (Cutoff Date) *
                </label>
                <input
                  disabled={submitting || !!request.pending}
                  type="date"
                  required
                  value={cutoffDate}
                  onChange={(e) => setCutoffDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  disabled={submitting || !!request.pending}
                  type="checkbox"
                  id="autoApply"
                  checked={autoApplyDeposit}
                  onChange={(e) => setAutoApplyDeposit(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <label
                  htmlFor="autoApply"
                  className="text-sm text-gray-700 cursor-pointer"
                >
                  تطبيق الأمانات المتاحة تلقائياً على الفاتورة المرحلية
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowInterimModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting || !!request.pending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {submitting ? "جاري الإصدار..." : "إصدار الفاتورة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default PatientDepositPanel;
