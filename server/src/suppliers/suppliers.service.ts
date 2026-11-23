import { Money, type FinancialDecimal } from '../common/utils/money.util';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseInvoiceStatus } from '@prisma/client';

const endOfDayUtc = (d: Date) => {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
};

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async listSuppliers(hospitalId: number) {
    return this.prisma.supplier.findMany({
      where: { hospitalId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(
    hospitalId: number,
    data: {
      name: string;
      code?: string;
      taxNumber?: string;
      phone?: string;
      email?: string;
      address?: string;
      notes?: string;
    },
  ) {
    return this.prisma.supplier.create({
      data: {
        hospitalId,
        name: data.name,
        code: data.code ?? null,
        taxNumber: data.taxNumber ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        notes: data.notes ?? null,
      },
    });
  }

  async updateSupplier(
    hospitalId: number,
    id: number,
    data: {
      name?: string;
      code?: string;
      taxNumber?: string;
      phone?: string;
      email?: string;
      address?: string;
      notes?: string;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, hospitalId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('المورد غير موجود.');

    return this.prisma.supplier.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code ?? undefined,
        taxNumber: data.taxNumber ?? undefined,
        phone: data.phone ?? undefined,
        email: data.email ?? undefined,
        address: data.address ?? undefined,
        notes: data.notes ?? undefined,
        isActive: data.isActive ?? undefined,
      },
    });
  }

  // ✅ كشف حساب المورد (Opening Balance + Period Rows) وبفلترة حالات الفواتير
  async getSupplierStatement(
    hospitalId: number,
    supplierId: number,
    opts?: { fromDate?: Date; toDate?: Date },
  ) {
    const fromDate = opts?.fromDate ? new Date(opts.fromDate) : null;
    const toDate = opts?.toDate ? new Date(opts.toDate) : null;

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, hospitalId },
    });

    if (!supplier) {
      throw new NotFoundException('المورد غير موجود.');
    }

    // كل فواتير الشراء للمورد
    const invoices = await this.prisma.purchaseInvoice.findMany({
      where: {
        hospitalId,
        supplierId,
        status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    // كل دفعات المورد
    const payments = await this.prisma.supplierPayment.findMany({
      where: { hospitalId, supplierId },
      orderBy: { paidAt: 'asc' },
    });

    const returns = await this.prisma.purchaseReturn.findMany({
      where: {
        hospitalId,
        supplierId,
        status: 'COMPLETED',
        requestKey: { not: null },
        accountingEntryId: { not: null },
      },
      orderBy: { returnDate: 'asc' },
    });
    const unreconciledReturns = await this.prisma.purchaseReturn.findMany({
      where: {
        hospitalId,
        supplierId,
        status: { not: 'CANCELLED' },
        requestKey: null,
      },
      select: {
        id: true,
        purchaseInvoiceId: true,
        status: true,
        totalAmount: true,
      },
    });

    type Row = {
      date: Date;
      kind: 'INVOICE' | 'PAYMENT' | 'RETURN';
      ref: string;
      description: string;
      debit: number;
      credit: number;

      // ✅ جديد (لـ drill-down)
      sourceType: 'PURCHASE_INVOICE' | 'SUPPLIER_PAYMENT' | 'PURCHASE_RETURN';
      sourceId: number;

      // ✅ مفيد للدفعات المرتبطة بفاتورة
      purchaseInvoiceId?: number | null;
      supplierPaymentId?: number | null;
    };

    const rows: Row[] = [];

    // 🔹 فواتير الشراء (مدين = صافي الفاتورة)
    for (const inv of invoices) {
      rows.push({
        date: inv.invoiceDate,
        kind: 'INVOICE',
        ref: inv.invoiceNumber ?? `INV-${inv.id}`,
        description: inv.notes ?? 'فاتورة شراء',
        debit: Money.toDb(inv.netAmount ?? 0),
        credit: 0,

        sourceType: 'PURCHASE_INVOICE',
        sourceId: inv.id,
        purchaseInvoiceId: inv.id,
        supplierPaymentId: null,
      });
    }

    // 🔹 دفعات المورد (دائن = مبلغ الدفع)
    for (const pay of payments) {
      rows.push({
        date: pay.paidAt,
        kind: 'PAYMENT',
        ref: pay.reference ?? `PAY-${pay.id}`,
        description: pay.notes ?? 'دفعة لمورد',
        debit: 0,
        credit: Money.toDb(pay.amount ?? 0),

        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: pay.id,
        purchaseInvoiceId: pay.purchaseInvoiceId ?? null,
        supplierPaymentId: pay.id,
      });
    }

    for (const ret of returns)
      rows.push({
        date: ret.returnDate,
        kind: 'RETURN',
        ref: `RET-${ret.id}`,
        description: ret.reason ?? 'مرتجع مشتريات',
        debit: 0,
        credit: Money.toDb(ret.totalAmount),
        sourceType: 'PURCHASE_RETURN',
        sourceId: ret.id,
        purchaseInvoiceId: ret.purchaseInvoiceId,
        supplierPaymentId: null,
      });

    // ترتيب حسب التاريخ ثم النوع (فواتير قبل دفعات في نفس اليوم)
    rows.sort((a, b) => {
      const d = a.date.getTime() - b.date.getTime();
      if (d !== 0) return d;
      return a.kind.localeCompare(b.kind);
    });

    // ✅ حساب الرصيد الافتتاحي + تصفية الفترة بدقة Money
    let openingBalanceDec: FinancialDecimal = Money.decimal(0);
    const periodRows: Row[] = [];

    for (const r of rows) {
      const t = r.date.getTime();

      const inFrom = fromDate ? t >= fromDate.getTime() : true;
      const inTo = toDate ? t <= toDate.getTime() : true;
      const inRange = inFrom && inTo;

      if (!inRange) {
        if (fromDate && t < fromDate.getTime()) {
          openingBalanceDec = Money.addDecimal(
            openingBalanceDec,
            Money.subtractDecimal(r.debit, r.credit),
          );
        }
        continue;
      }

      periodRows.push(r);
    }

    const totalDebitDec = Money.sumDecimal(...periodRows.map((r) => r.debit));
    const totalCreditDec = Money.sumDecimal(...periodRows.map((r) => r.credit));

    let runningDec: FinancialDecimal = openingBalanceDec;

    const statementRows = periodRows.map((r) => {
      runningDec = Money.addDecimal(
        runningDec,
        Money.subtractDecimal(r.debit, r.credit),
      );
      return {
        date: r.date.toISOString(),
        kind: r.kind,
        ref: r.ref,
        description: r.description,
        debit: r.debit,
        credit: r.credit,
        balance: Money.toDb(runningDec),

        // ✅ تمرير بيانات المصدر للـ UI
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        purchaseInvoiceId: r.purchaseInvoiceId ?? null,
        supplierPaymentId: r.supplierPaymentId ?? null,
      };
    });

    const closingBalanceDec = Money.subtractDecimal(
      Money.addDecimal(openingBalanceDec, totalDebitDec),
      totalCreditDec,
    );

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        code: supplier.code,
      },
      fromDate: fromDate ? fromDate.toISOString() : null,
      toDate: toDate ? toDate.toISOString() : null,
      openingBalance: Money.toDb(openingBalanceDec),
      totalDebit: Money.toDb(totalDebitDec),
      totalCredit: Money.toDb(totalCreditDec),
      closingBalance: Money.toDb(closingBalanceDec),
      rows: statementRows,
      unreconciledReturns,
    };
  }

  // ✅ Aging صحيح حسب asOf (يحسب المدفوعات حتى asOf وليس paidAmount الحالي) بدقة Money
  async getSuppliersAging(hospitalId: number, asOf?: Date) {
    const asOfDate = asOf
      ? endOfDayUtc(new Date(asOf))
      : endOfDayUtc(new Date());

    const invoiceStatuses: PurchaseInvoiceStatus[] = [
      'APPROVED',
      'PARTIALLY_PAID',
      'PAID',
    ];

    const invoices = await this.prisma.purchaseInvoice.findMany({
      where: {
        hospitalId,
        status: { in: invoiceStatuses },
        invoiceDate: { lte: asOfDate }, // ✅ لا نحسب فواتير مستقبلية
      },
      select: {
        id: true,
        supplierId: true,
        invoiceDate: true,
        netAmount: true,
        purchaseReturns: {
          where: {
            status: 'COMPLETED',
            requestKey: { not: null },
            accountingEntryId: { not: null },
            returnDate: { lte: asOfDate },
          },
          select: { totalAmount: true },
        },
        supplier: { select: { id: true, name: true, code: true } },
      },
    });

    const invoiceIds = invoices.map((x) => x.id);
    const paidByInvoice = invoiceIds.length
      ? await this.prisma.supplierPayment.groupBy({
          by: ['purchaseInvoiceId'],
          where: {
            hospitalId,
            purchaseInvoiceId: { in: invoiceIds }, // ✅ excludes null
            paidAt: { lte: asOfDate },
          },
          _sum: { amount: true },
        })
      : [];

    const paidMap = new Map<number, FinancialDecimal>();
    for (const g of paidByInvoice) {
      if (g.purchaseInvoiceId == null) continue;
      paidMap.set(g.purchaseInvoiceId, Money.decimal(g._sum.amount ?? 0));
    }

    // ✅ Credits غير مربوطة بفواتير (اختياري) نخصمها من أقدم الشرائح
    const unallocated = await this.prisma.supplierPayment.groupBy({
      by: ['supplierId'],
      where: {
        hospitalId,
        purchaseInvoiceId: null,
        paidAt: { lte: asOfDate },
      },
      _sum: { amount: true },
    });
    const unallocMap = new Map<number, FinancialDecimal>();
    for (const u of unallocated) {
      unallocMap.set(u.supplierId, Money.decimal(u._sum.amount ?? 0));
    }

    const supplierCredits = new Map<number, FinancialDecimal>();
    type DecimalBuckets = {
      b0_30: FinancialDecimal;
      b31_60: FinancialDecimal;
      b61_90: FinancialDecimal;
      b91_120: FinancialDecimal;
      b121_plus: FinancialDecimal;
      total: FinancialDecimal;
      unallocatedCredit: FinancialDecimal;
      creditBalance: FinancialDecimal;
    };
    type BucketKey = 'b0_30' | 'b31_60' | 'b61_90' | 'b91_120' | 'b121_plus';

    const emptyBuckets = (): DecimalBuckets => ({
      b0_30: Money.decimal(0),
      b31_60: Money.decimal(0),
      b61_90: Money.decimal(0),
      b91_120: Money.decimal(0),
      b121_plus: Money.decimal(0),
      total: Money.decimal(0),
      unallocatedCredit: Money.decimal(0),
      creditBalance: Money.decimal(0),
    });

    const bySupplier = new Map<
      number,
      {
        supplierId: number;
        supplierName: string;
        supplierCode: string | null;
        buckets: DecimalBuckets;
      }
    >();

    for (const inv of invoices) {
      const netDec = Money.decimal(inv.netAmount ?? 0);
      const paidUpToDec = paidMap.get(inv.id) ?? Money.decimal(0);
      const returnedDec = Money.sumDecimal(
        ...inv.purchaseReturns.map((r) => r.totalAmount),
      );
      const remainingDec = Money.subtractDecimal(
        Money.subtractDecimal(netDec, paidUpToDec),
        returnedDec,
      );

      const s = inv.supplier;
      if (!s) continue;

      let holder = bySupplier.get(s.id);
      if (!holder) {
        holder = {
          supplierId: s.id,
          supplierName: s.name,
          supplierCode: s.code ?? null,
          buckets: emptyBuckets(),
        };
        bySupplier.set(s.id, holder);
      }

      if (!remainingDec.gt(0)) {
        if (remainingDec.lt(0)) {
          const prevCredit = supplierCredits.get(s.id) ?? Money.decimal(0);
          supplierCredits.set(
            s.id,
            Money.addDecimal(prevCredit, remainingDec.abs()),
          );
        }
        continue;
      }

      const diffMs = asOfDate.getTime() - inv.invoiceDate.getTime();
      if (diffMs < 0) continue;

      const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const b = holder.buckets;

      if (ageDays <= 30) b.b0_30 = Money.addDecimal(b.b0_30, remainingDec);
      else if (ageDays <= 60)
        b.b31_60 = Money.addDecimal(b.b31_60, remainingDec);
      else if (ageDays <= 90)
        b.b61_90 = Money.addDecimal(b.b61_90, remainingDec);
      else if (ageDays <= 120)
        b.b91_120 = Money.addDecimal(b.b91_120, remainingDec);
      else b.b121_plus = Money.addDecimal(b.b121_plus, remainingDec);

      b.total = Money.addDecimal(b.total, remainingDec);
    }

    // ✅ خصم الدفعات غير المربوطة من الأقدم (تقريب FIFO على مستوى الشرائح) بدقة Money
    for (const holder of bySupplier.values()) {
      let creditDec = Money.addDecimal(
        unallocMap.get(holder.supplierId) ?? Money.decimal(0),
        supplierCredits.get(holder.supplierId) ?? Money.decimal(0),
      );
      if (!creditDec.gt(0)) continue;

      holder.buckets.unallocatedCredit = creditDec;

      const take = (key: BucketKey) => {
        const cur = holder.buckets[key];
        if (!cur.gt(0) || !creditDec.gt(0)) return;
        const used = Money.minDecimal(cur, creditDec);
        holder.buckets[key] = Money.subtractDecimal(cur, used);
        creditDec = Money.subtractDecimal(creditDec, used);
      };

      // الأقدم أولاً
      take('b121_plus');
      take('b91_120');
      take('b61_90');
      take('b31_60');
      take('b0_30');

      holder.buckets.creditBalance = creditDec;
      // حدّث total بعد الخصم
      const b = holder.buckets;
      b.total = Money.sumDecimal(
        b.b0_30,
        b.b31_60,
        b.b61_90,
        b.b91_120,
        b.b121_plus,
      );
    }

    const suppliers = Array.from(bySupplier.values())
      .filter(
        (x) =>
          !Money.isZero(x.buckets.total) ||
          !Money.isZero(x.buckets.unallocatedCredit),
      )
      .map((x) => ({
        supplierId: x.supplierId,
        supplierName: x.supplierName,
        supplierCode: x.supplierCode,
        b0_30: Money.toDb(x.buckets.b0_30),
        b31_60: Money.toDb(x.buckets.b31_60),
        b61_90: Money.toDb(x.buckets.b61_90),
        b91_120: Money.toDb(x.buckets.b91_120),
        b121_plus: Money.toDb(x.buckets.b121_plus),
        total: Money.toDb(x.buckets.total),
        unallocatedCredit: Money.toDb(x.buckets.unallocatedCredit),
        creditBalance: Money.toDb(x.buckets.creditBalance),
      }))
      .sort((a, b) => b.total - a.total);

    const grandTotals = {
      b0_30: Money.sum(...suppliers.map((s) => s.b0_30)),
      b31_60: Money.sum(...suppliers.map((s) => s.b31_60)),
      b61_90: Money.sum(...suppliers.map((s) => s.b61_90)),
      b91_120: Money.sum(...suppliers.map((s) => s.b91_120)),
      b121_plus: Money.sum(...suppliers.map((s) => s.b121_plus)),
      total: Money.sum(...suppliers.map((s) => s.total)),
      unallocatedCredit: Money.sum(
        ...suppliers.map((s) => s.unallocatedCredit),
      ),
      creditBalance: Money.sum(...suppliers.map((s) => s.creditBalance)),
    };

    return {
      asOf: asOfDate.toISOString(),
      suppliers,
      grandTotals,
    };
  }
}
