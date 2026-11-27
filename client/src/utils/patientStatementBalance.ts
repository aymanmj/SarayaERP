import { Money } from "./money";

export type StatementRow = {
  date: string;
  kind: "INVOICE" | "PAYMENT" | "REFUND";
  ref: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

export interface StatementInvoiceInput {
  id: number;
  totalAmount: number | string;
  discountAmount: number | string;
  createdAt: string;
  encounter: {
    id: number;
    type: string;
  } | null;
}

export interface StatementPaymentInput {
  id: number;
  amount: number | string;
  method: string;
  paidAt: string;
  invoice: {
    id: number;
  } | null;
}

export interface StatementRefundInput {
  id: number;
  invoiceId: number;
  paymentId: number;
  amount: number | string;
  method: string;
  executedAt: string;
  executionReference: string;
}

/** Build chronological patient statement ledger rows using exact decimal Money math. */
export function buildStatementRows(params: {
  invoices: StatementInvoiceInput[];
  payments: StatementPaymentInput[];
  refunds?: StatementRefundInput[];
  formatMethod: (method: string) => string;
}): StatementRow[] {
  type BaseRow = Omit<StatementRow, "balance"> & {
    debitText: string;
    creditText: string;
  };
  const tmp: BaseRow[] = [];

  for (const inv of params.invoices) {
    const netDec = Money.decimal(inv.totalAmount ?? 0).minus(
      Money.decimal(inv.discountAmount ?? 0),
    );
    if (netDec.isZero()) continue;
    const netText = Money.toFixed(netDec, 3);
    tmp.push({
      date: inv.createdAt,
      kind: "INVOICE",
      ref: `فاتورة #${inv.id}`,
      description: inv.encounter
        ? `حالة #${inv.encounter.id} – ${inv.encounter.type}`
        : "فاتورة خدمات للمريض",
      debit: Number(netText),
      credit: 0,
      debitText: netText,
      creditText: "0.000",
    });
  }

  for (const p of params.payments) {
    const amountDec = Money.decimal(p.amount ?? 0);
    if (amountDec.isZero()) continue;
    const amountText = Money.toFixed(amountDec, 3);
    const methodText = params.formatMethod(p.method);
    tmp.push({
      date: p.paidAt,
      kind: "PAYMENT",
      ref: `دفعة #${p.id}`,
      description: p.invoice
        ? `سداد على فاتورة #${p.invoice.id} (${methodText})`
        : `دفعة (${methodText})`,
      debit: 0,
      credit: Number(amountText),
      debitText: "0.000",
      creditText: amountText,
    });
  }

  for (const refund of params.refunds ?? []) {
    const refundText = Money.toFixed(refund.amount ?? 0, 3);
    tmp.push({
      date: refund.executedAt,
      kind: "REFUND",
      ref: `استرداد #${refund.id}`,
      description: `صرف للمريض — فاتورة #${refund.invoiceId} / إيصال #${refund.paymentId} (${params.formatMethod(refund.method)}) — ${refund.executionReference}`,
      debit: Number(refundText),
      credit: 0,
      debitText: refundText,
      creditText: "0.000",
    });
  }

  tmp.sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    if (ta !== tb) return ta - tb;
    if (a.kind === b.kind) return 0;
    return a.kind === "INVOICE" ? -1 : 1;
  });

  let running = Money.decimal(0);
  return tmp.map(({ debitText, creditText, ...row }) => {
    running = running
      .plus(Money.decimal(debitText))
      .minus(Money.decimal(creditText));
    const normalized = running.isZero()
      ? 0
      : Number(Money.toFixed(running, 3));
    return {
      ...row,
      balance: normalized,
    };
  });
}
