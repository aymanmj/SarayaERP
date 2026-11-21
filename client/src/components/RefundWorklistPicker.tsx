import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "../api/apiClient";
import { useAuthStore } from "../stores/authStore";

export function RefundWorklistPicker({
  onSelect,
}: {
  onSelect: (invoiceId: number) => void;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const allowed =
    !!user &&
    (user.roles.includes("ADMIN") ||
      user.permissions.some(
        (permission) =>
          permission === "ADMIN_FULL_ACCESS" ||
          permission.startsWith("cashier:refunds:"),
      ));
  const query = useQuery({
    queryKey: ["refund-worklist"],
    enabled: allowed,
    queryFn: async () =>
      (
        await apiClient.get<
          {
            id: number;
            invoiceId: number;
            amount: string;
            status: string;
            invoice: { patient: { fullName: string; mrn: string } };
          }[]
        >("/cashier/refund-worklist")
      ).data,
  });
  if (!allowed) return null;
  return (
    <section className="rounded border border-slate-700 p-4 space-y-2">
      <h2>{t("refunds.worklist", "طلبات الاسترداد قيد المتابعة")}</h2>
      {query.isError && (
        <button onClick={() => void query.refetch()}>
          {t("refunds.retry", "إعادة المحاولة")}
        </button>
      )}
      {query.data?.map((row) => (
        <button
          className="block p-2"
          key={row.id}
          onClick={() => onSelect(row.invoiceId)}
        >
          #{row.id} · {row.invoice.patient.fullName} · {row.invoice.patient.mrn}{" "}
          · {row.amount} LYD · {t(`refunds.status.${row.status}`, row.status)}
        </button>
      ))}
    </section>
  );
}
