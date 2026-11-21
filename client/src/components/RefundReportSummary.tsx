import { useTranslation } from "react-i18next";
export type RefundReportFields = {
  refundsSummary?: {
    totalAmount: number;
    cashAmount: number;
    totalCount: number;
  };
  netPaymentsSummary?: { totalAmount: number; cashAmount?: number };
  refunds?: {
    id: number;
    invoiceId: number;
    paymentId: number;
    amount: string | number;
    method: string;
    executedAt: string | null;
    executionReference: string | null;
  }[];
};
export function RefundReportSummary({
  report,
}: {
  report: RefundReportFields;
}) {
  const { t } = useTranslation();
  if (!report.refundsSummary) return null;
  return (
    <section className="rounded-xl border border-slate-700 p-4 space-y-3">
      <h2 className="font-bold">
        {t("refunds.reportTitle", "الاستردادات المثبتة وصافي الحركات")}
      </h2>
      <p>
        {t("refunds.reportTotal", "إجمالي الاسترداد")}:{" "}
        {Number(report.refundsSummary.totalAmount).toFixed(3)} LYD ·{" "}
        {t("refunds.reportCash", "منه نقدي")}:{" "}
        {Number(report.refundsSummary.cashAmount).toFixed(3)} LYD ·{" "}
        {t("refunds.reportNet", "صافي التحصيل بعد الاسترداد")}:{" "}
        {Number(report.netPaymentsSummary?.totalAmount ?? 0).toFixed(3)} LYD
      </p>
      {!!report.refunds?.length && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>{t("refunds.reportRefund", "الاسترداد")}</th>
                <th>{t("refunds.reportInvoice", "الفاتورة / الإيصال")}</th>
                <th>{t("refunds.reportMethod", "الطريقة")}</th>
                <th>{t("refunds.amount", "مبلغ الاسترداد")}</th>
                <th>{t("refunds.reference", "مرجع الصرف أو تأكيد البنك")}</th>
              </tr>
            </thead>
            <tbody>
              {report.refunds.map((row) => (
                <tr key={row.id}>
                  <td>#{row.id}</td>
                  <td>
                    #{row.invoiceId} / #{row.paymentId}
                  </td>
                  <td>{row.method}</td>
                  <td>{Number(row.amount).toFixed(3)}</td>
                  <td>{row.executionReference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
