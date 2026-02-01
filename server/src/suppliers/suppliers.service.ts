import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseInvoiceStatus } from '@prisma/client';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const startOfDayUtc = (d: Date) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

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
      where: { hospitalId, supplierId },
      orderBy: { invoiceDate: 'asc' },
    });

    // كل دفعات المورد
    const payments = await this.prisma.supplierPayment.findMany({
      where: { hospitalId, supplierId },
      orderBy: { paidAt: 'asc' },
    });

    type Row = {
      date: Date;
      kind: 'INVOICE' | 'PAYMENT';
      ref: string;
      description: string;
      debit: number;
      credit: number;

      // ✅ جديد (لـ drill-down)
      sourceType: 'PURCHASE_INVOICE' | 'SUPPLIER_PAYMENT';
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
        debit: Number(inv.netAmount),
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
        credit: Number(pay.amount),

        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: pay.id,
        purchaseInvoiceId: pay.purchaseInvoiceId ?? null,
        supplierPaymentId: pay.id,
      });
    }

    // ترتيب حسب التاريخ ثم النوع (فواتير قبل دفعات في نفس اليوم)
    rows.sort((a, b) => {
      const d = a.date.getTime() - b.date.getTime();
      if (d !== 0) return d;
      return a.kind.localeCompare(b.kind);
    });

    // ✅ حساب الرصيد الافتتاحي + تصفية الفترة
    let openingBalance = 0;
    const periodRows: Row[] = [];

    for (const r of rows) {
      const t = r.date.getTime();

      const inFrom = fromDate ? t >= fromDate.getTime() : true;
      const inTo = toDate ? t <= toDate.getTime() : true;
      const inRange = inFrom && inTo;

      if (!inRange) {
        if (fromDate && t < fromDate.getTime()) {
          openingBalance = openingBalance + r.debit - r.credit;
        }
        continue;
      }

      periodRows.push(r);
    }

    const totalDebit = periodRows.reduce((sum, r) => sum + r.debit, 0);
    const totalCredit = periodRows.reduce((sum, r) => sum + r.credit, 0);

    let running = openingBalance;

    const statementRows = periodRows.map((r) => {
      running = running + r.debit - r.credit;
      return {
        date: r.date.toISOString(),
        kind: r.kind,
        ref: r.ref,
        description: r.description,
        debit: r.debit,
        credit: r.credit,
        balance: running,

        // ✅ تمرير بيانات المصدر للـ UI
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        purchaseInvoiceId: r.purchaseInvoiceId ?? null,
        supplierPaymentId: r.supplierPaymentId ?? null,
      };
    });

    const closingBalance = openingBalance + totalDebit - totalCredit;

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        code: supplier.code,
      },
      fromDate: fromDate ? fromDate.toISOString() : null,
      toDate: toDate ? toDate.toISOString() : null,
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance,
      rows: statementRows,
    };
  }

  // ✅ Aging صحيح حسب asOf (يحسب المدفوعات حتى asOf وليس paidAmount الحالي)
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

    const paidMap = new Map<number, number>();
    for (const g of paidByInvoice) {
      if (g.purchaseInvoiceId == null) continue;
      paidMap.set(g.purchaseInvoiceId, Number(g._sum.amount ?? 0));
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
    const unallocMap = new Map<number, number>();
    for (const u of unallocated) {
      unallocMap.set(u.supplierId, Number(u._sum.amount ?? 0));
    }

    type Buckets = {
      b0_30: number;
      b31_60: number;
      b61_90: number;
      b91_120: number;
      b121_plus: number;
      total: number;
      unallocatedCredit: number;
    };

    const emptyBuckets = (): Buckets => ({
      b0_30: 0,
      b31_60: 0,
      b61_90: 0,
      b91_120: 0,
      b121_plus: 0,
      total: 0,
      unallocatedCredit: 0,
    });

    const bySupplier = new Map<
      number,
      {
        supplierId: number;
        supplierName: string;
        supplierCode: string | null;
        buckets: Buckets;
      }
    >();

    for (const inv of invoices) {
      const net = Number(inv.netAmount ?? 0);
      const paidUpTo = paidMap.get(inv.id) ?? 0;
      const remaining = round3(net - paidUpTo);

      if (remaining <= 0.0001) continue;

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

      const diffMs = asOfDate.getTime() - inv.invoiceDate.getTime();
      if (diffMs < 0) continue;

      const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const b = holder.buckets;

      if (ageDays <= 30) b.b0_30 = round3(b.b0_30 + remaining);
      else if (ageDays <= 60) b.b31_60 = round3(b.b31_60 + remaining);
      else if (ageDays <= 90) b.b61_90 = round3(b.b61_90 + remaining);
      else if (ageDays <= 120) b.b91_120 = round3(b.b91_120 + remaining);
      else b.b121_plus = round3(b.b121_plus + remaining);

      b.total = round3(b.total + remaining);
    }

    // ✅ خصم الدفعات غير المربوطة من الأقدم (تقريب FIFO على مستوى الشرائح)
    for (const holder of bySupplier.values()) {
      let credit = round3(unallocMap.get(holder.supplierId) ?? 0);
      if (credit <= 0.0001) continue;

      holder.buckets.unallocatedCredit = credit;

      const take = (key: keyof Buckets) => {
        const cur = holder.buckets[key] as number;
        if (cur <= 0 || credit <= 0) return;
        const used = Math.min(cur, credit);
        holder.buckets[key] = round3(cur - used) as any;
        credit = round3(credit - used);
      };

      // الأقدم أولاً
      take('b121_plus');
      take('b91_120');
      take('b61_90');
      take('b31_60');
      take('b0_30');

      // حدّث total بعد الخصم
      const b = holder.buckets;
      b.total = round3(b.b0_30 + b.b31_60 + b.b61_90 + b.b91_120 + b.b121_plus);
    }

    const suppliers = Array.from(bySupplier.values())
      .filter(
        (x) => x.buckets.total > 0.0001 || x.buckets.unallocatedCredit > 0.0001,
      )
      .map((x) => ({
        supplierId: x.supplierId,
        supplierName: x.supplierName,
        supplierCode: x.supplierCode,
        ...x.buckets,
      }))
      .sort((a, b) => b.total - a.total);

    const grandTotals = suppliers.reduce(
      (acc, s) => {
        acc.b0_30 = round3(acc.b0_30 + s.b0_30);
        acc.b31_60 = round3(acc.b31_60 + s.b31_60);
        acc.b61_90 = round3(acc.b61_90 + s.b61_90);
        acc.b91_120 = round3(acc.b91_120 + s.b91_120);
        acc.b121_plus = round3(acc.b121_plus + s.b121_plus);
        acc.total = round3(acc.total + s.total);
        acc.unallocatedCredit = round3(
          acc.unallocatedCredit + (s.unallocatedCredit ?? 0),
        );
        return acc;
      },
      {
        b0_30: 0,
        b31_60: 0,
        b61_90: 0,
        b91_120: 0,
        b121_plus: 0,
        total: 0,
        unallocatedCredit: 0,
      },
    );

    return {
      asOf: asOfDate.toISOString(),
      suppliers,
      grandTotals,
    };
  }
}
