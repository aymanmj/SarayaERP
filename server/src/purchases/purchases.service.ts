import { financialPeriod } from '../accounting/financial-posting';
import { assertOwnedQuantity } from '../inventory/material-transfer';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
// src/purchases/purchases.service.ts

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import {
  PaymentMethod,
  Prisma,
  PurchaseInvoiceStatus,
  StockTransactionType,
} from '@prisma/client';
import { Money } from '../common/utils/money.util';

type PurchaseInvoiceLineInput = {
  description?: string;
  quantity: number | string;
  unitPrice: number | string;
  expenseAccountId?: number;
  productId?: number;
  inventoryItemId?: number;
  drugItemId?: number;
  batchNumber?: string;
  expiryDate?: Date | string;
};

@Injectable()
export class PurchasesService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  private normalizeInvoiceLines(lines: PurchaseInvoiceLineInput[]) {
    if (!lines?.length || lines.length > 100) {
      throw new BadRequestException(
        'يجب إضافة بند واحد على الأقل وبحد أقصى 100 بند.',
      );
    }

    const seenProductBatch = new Set<string>();
    const normalized = lines.map((l) => {
      const qtyDec = new Prisma.Decimal(l.quantity ?? 0);
      const priceDec = new Prisma.Decimal(l.unitPrice ?? -1);
      if (
        !qtyDec.isFinite() ||
        qtyDec.lte(0) ||
        qtyDec.decimalPlaces() > 3 ||
        qtyDec.gte('1000000000000000') ||
        !priceDec.isFinite() ||
        priceDec.lt(0) ||
        priceDec.decimalPlaces() > 4 ||
        priceDec.gte('1000000000000000')
      ) {
        throw new BadRequestException('الكمية أو السعر غير صالح.');
      }

      const productId =
        l.productId ?? l.drugItemId ?? l.inventoryItemId ?? null;
      if (productId !== null && priceDec.lte(0)) {
        throw new BadRequestException(
          'سعر الصنف المخزني يجب أن يكون أكبر من الصفر.',
        );
      }

      const batchNumber = l.batchNumber?.trim() || null;
      if (batchNumber && batchNumber.length > 100) {
        throw new BadRequestException('رقم التشغيلة يتجاوز الحد المسموح.');
      }

      let expiryDate: Date | null = null;
      if (l.expiryDate) {
        expiryDate =
          l.expiryDate instanceof Date ? l.expiryDate : new Date(l.expiryDate);
        if (!Number.isFinite(expiryDate.getTime())) {
          throw new BadRequestException('تاريخ صلاحية غير صالح.');
        }
        if (productId !== null && expiryDate.getTime() <= Date.now()) {
          throw new BadRequestException('لا يقبل إدخال صنف منتهي الصلاحية.');
        }
      }

      if (productId !== null) {
        const key = `${productId}:${batchNumber ?? 'GENERAL'}`;
        if (seenProductBatch.has(key)) {
          throw new BadRequestException(
            'لا يمكن تكرار نفس الصنف والتشغيلة في الفاتورة الواحدة.',
          );
        }
        seenProductBatch.add(key);
      } else if (!l.description?.trim()) {
        throw new BadRequestException('وصف البند مطلوب للبنود غير المخزنية.');
      }

      const totalAmount = Money.toDbString(Money.multiply(qtyDec, priceDec));
      return {
        description: l.description?.trim() ?? '',
        quantity: qtyDec.toFixed(3),
        unitPrice: Money.toUnitDbString(priceDec),
        totalAmount,
        expenseAccountId: l.expenseAccountId ?? null,
        productId,
        batchNumber,
        expiryDate,
      };
    });

    const totalAmount = Money.toDbString(
      Money.sumPosted(...normalized.map((l) => l.totalAmount)),
    );
    return { lineData: normalized, totalAmount };
  }

  async listPurchaseInvoices(hospitalId: number) {
    return this.prisma.purchaseInvoice.findMany({
      where: { hospitalId },
      include: { supplier: true },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async getPurchaseInvoice(hospitalId: number, id: number) {
    const inv = await this.prisma.purchaseInvoice.findFirst({
      where: { id, hospitalId },
      include: {
        supplier: true,
        lines: {
          include: {
            expenseAccount: { select: { id: true, code: true, name: true } },
            product: true,
          },
        },
        payments: true,
        purchaseReturns: {
          where: { status: 'COMPLETED' },
          include: { lines: true },
        },
      },
    });

    if (!inv) throw new NotFoundException('فاتورة الشراء غير موجودة.');
    const verified = inv.purchaseReturns.filter(
      (r) => r.requestKey && r.accountingEntryId,
    );
    return {
      ...inv,
      returnedAmount: Money.toDb(
        Money.sumDecimal(...verified.map((r) => r.totalAmount)),
      ),
      remainingPayable: Money.toDb(
        Money.decimal(inv.netAmount)
          .minus(inv.paidAmount)
          .minus(Money.sumDecimal(...verified.map((r) => r.totalAmount))),
      ),
      lines: inv.lines.map((line) => ({
        ...line,
        remainingReturnQuantity: Money.toDb(
          Money.decimal(line.quantity).minus(
            Money.sumDecimal(
              ...verified.flatMap((r) =>
                r.lines
                  .filter((l) => l.purchaseInvoiceLineId === line.id)
                  .map((l) => l.quantity),
              ),
            ),
          ),
        ),
      })),
    };
  }

  async createPurchaseInvoice(params: {
    hospitalId: number;
    supplierId: number;
    invoiceNumber?: string;
    invoiceDate: Date;
    dueDate?: Date;
    currency?: string;
    discountAmount?: number | string;
    vatAmount?: number | string;
    notes?: string;
    lines: PurchaseInvoiceLineInput[];
    userId: number;
    warehouseId?: number;
  }) {
    const {
      hospitalId,
      supplierId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      currency = 'LYD',
      discountAmount = 0,
      vatAmount = 0,
      notes,
      lines,
      userId,
      warehouseId,
    } = params;

    if (!Number.isFinite(invoiceDate?.getTime())) {
      throw new BadRequestException('تاريخ الفاتورة غير صالح.');
    }
    if (dueDate && !Number.isFinite(dueDate.getTime())) {
      throw new BadRequestException('تاريخ الاستحقاق غير صالح.');
    }
    if (currency !== 'LYD') {
      throw new BadRequestException('العملة المدعومة حاليًا هي LYD فقط.');
    }

    const { lineData, totalAmount } = this.normalizeInvoiceLines(lines);
    const hasInventoryLines = lineData.some((l) => l.productId !== null);
    if (hasInventoryLines && typeof warehouseId !== 'number') {
      throw new BadRequestException('يجب تحديد المخزن المستلم لبنود المخزون.');
    }

    const discountStr = Money.toDbString(discountAmount);
    const vatStr = Money.toDbString(vatAmount);
    if (
      Money.isNegative(discountStr) ||
      Money.isNegative(vatStr) ||
      Money.decimal(discountStr).gt(totalAmount)
    ) {
      throw new BadRequestException('قيمة الخصم أو الضريبة غير صالحة.');
    }
    if (
      hasInventoryLines &&
      (!Money.eq(discountStr, 0) || !Money.eq(vatStr, 0))
    ) {
      throw new BadRequestException(
        'فواتير المخزون المباشرة لا تقبل خصمًا أو ضريبة إجمالية غير موزعة.',
      );
    }

    const netStr = Money.toDbString(
      Money.sumPosted(Money.subtractDecimal(totalAmount, discountStr), vatStr),
    );

    return this.prisma.$transaction(async (tx) => {
      if (
        !(await tx.user.findFirst({
          where: { id: userId, hospitalId, isActive: true, isDeleted: false },
          select: { id: true },
        }))
      ) {
        throw new NotFoundException('المستخدم غير نشط أو خارج المنشأة.');
      }

      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!supplier)
        throw new BadRequestException('المورد غير موجود أو غير نشط.');

      if (typeof warehouseId === 'number') {
        const wh = await tx.warehouse.findFirst({
          where: { id: warehouseId, hospitalId, isActive: true },
          select: { id: true },
        });
        if (!wh) throw new BadRequestException('المخزن غير موجود أو غير نشط.');
      }

      for (const l of lineData) {
        if (l.productId !== null) {
          const product = await tx.product.findFirst({
            where: {
              id: l.productId,
              hospitalId,
              isActive: true,
              isDeleted: false,
            },
            include: { category: true },
          });
          if (
            !product ||
            !['DRUG', 'SUPPLY', 'LAB_REAGENT'].includes(product.type) ||
            (product.category &&
              (product.category.hospitalId !== hospitalId ||
                !product.category.isActive ||
                product.category.valuationMethod !== 'WEIGHTED_AVERAGE'))
          ) {
            throw new BadRequestException(
              'الصنف غير متاح أو تقييمه غير مدعوم.',
            );
          }
        }
        if (l.expenseAccountId !== null) {
          const acc = await tx.account.findFirst({
            where: {
              id: l.expenseAccountId,
              hospitalId,
              isActive: true,
              ...(l.productId !== null ? { type: 'ASSET' as const } : {}),
            },
            select: { id: true },
          });
          if (!acc) {
            throw new BadRequestException(
              'حساب البند غير صالح أو خارج المنشأة.',
            );
          }
        }
      }

      return tx.purchaseInvoice.create({
        data: {
          hospitalId,
          supplierId,
          invoiceNumber: invoiceNumber?.trim() || null,
          invoiceDate,
          dueDate: dueDate ?? null,
          status: PurchaseInvoiceStatus.DRAFT,
          totalAmount,
          discountAmount: discountStr,
          vatAmount: vatStr,
          netAmount: netStr,
          paidAmount: '0.000',
          currency: 'LYD',
          notes: notes?.trim() || null,
          warehouseId: typeof warehouseId === 'number' ? warehouseId : null,
          lines: { create: lineData },
        },
      });
    });
  }

  async approvePurchaseInvoice(params: {
    hospitalId: number;
    purchaseInvoiceId: number;
    userId: number;
  }) {
    const { hospitalId, purchaseInvoiceId, userId } = params;

    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;

      if (
        !(await tx.user.findFirst({
          where: { id: userId, hospitalId, isActive: true, isDeleted: false },
          select: { id: true },
        }))
      ) {
        throw new NotFoundException('المستخدم غير نشط أو خارج المنشأة.');
      }

      await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id=${purchaseInvoiceId} AND "hospitalId"=${hospitalId} FOR UPDATE`;

      const inv = await tx.purchaseInvoice.findFirst({
        where: { id: purchaseInvoiceId, hospitalId },
        include: { lines: { orderBy: { id: 'asc' } } },
      });

      if (!inv) {
        throw new NotFoundException('فاتورة الشراء غير موجودة.');
      }

      if (
        inv.status !== PurchaseInvoiceStatus.DRAFT ||
        inv.accountingEntryId !== null
      ) {
        throw new BadRequestException('الفاتورة غير موجودة أو معتمدة مسبقاً.');
      }

      if (!inv.lines.length) {
        throw new BadRequestException('لا يمكن اعتماد فاتورة شراء فارغة.');
      }

      if (inv.currency !== 'LYD') {
        throw new BadRequestException('العملة غير مدعومة للاعتماد.');
      }

      if (!inv.warehouseId) {
        throw new BadRequestException('يجب تحديد المخزن المستلم في الفاتورة.');
      }

      if (
        !(await tx.supplier.findFirst({
          where: { id: inv.supplierId, hospitalId, isActive: true },
          select: { id: true },
        }))
      ) {
        throw new BadRequestException('المورد غير نشط أو خارج المنشأة.');
      }

      const warehouses = await tx.$queryRaw<
        { id: number }[]
      >`SELECT id FROM "Warehouse" WHERE id=${inv.warehouseId} AND "hospitalId"=${hospitalId} AND "isActive"=true FOR SHARE`;
      if (warehouses.length !== 1) {
        throw new BadRequestException('المخزن غير نشط أو خارج المنشأة.');
      }

      if (
        (await tx.goodsReceipt.count({
          where: { hospitalId, purchaseInvoiceId: inv.id },
        })) > 0 ||
        (await tx.stockTransaction.count({
          where: { hospitalId, purchaseInvoiceId: inv.id },
        })) > 0
      ) {
        throw new BadRequestException(
          'الفاتورة مرتبطة بإذن توريد أو حركات مخزون؛لا يعتمد المخزون مرتين',
        );
      }

      await financialPeriod(tx, hospitalId, inv.invoiceDate);

      const hasInventoryLines = inv.lines.some((l) => l.productId !== null);
      if (
        hasInventoryLines &&
        (!inv.discountAmount.eq(0) ||
          !inv.vatAmount.eq(0) ||
          !inv.netAmount.eq(inv.totalAmount))
      ) {
        throw new BadRequestException(
          'فواتير المخزون المباشرة تتطلب تطابق الإجمالي والصافي دون خصم أو ضريبة.',
        );
      }

      const seenProductBatch = new Set<string>();
      let computedLinesTotal = '0.000';
      for (const line of inv.lines) {
        if (
          !line.quantity.isFinite() ||
          line.quantity.lte(0) ||
          line.quantity.decimalPlaces() > 3 ||
          line.quantity.gte('1000000000000000') ||
          !line.unitPrice.isFinite() ||
          line.unitPrice.lt(0) ||
          (line.productId !== null && line.unitPrice.lte(0)) ||
          line.unitPrice.decimalPlaces() > 4 ||
          line.unitPrice.gte('1000000000000000')
        ) {
          throw new BadRequestException('بيانات كمية أو سعر البند غير صالحة.');
        }
        const expectedLineTotal = Money.toDbString(
          Money.multiply(line.quantity, line.unitPrice),
        );
        if (!Money.eq(line.totalAmount, expectedLineTotal)) {
          throw new BadRequestException(
            'إجمالي بند الفاتورة لا يطابق الكمية × السعر.',
          );
        }
        computedLinesTotal = Money.toDbString(
          Money.sumPosted(computedLinesTotal, expectedLineTotal),
        );
        if (line.productId !== null) {
          const batchKey = `${line.productId}:${line.batchNumber?.trim() || 'GENERAL'}`;
          if (seenProductBatch.has(batchKey)) {
            throw new BadRequestException(
              'لا يمكن تكرار نفس الصنف والتشغيلة في الفاتورة الواحدة.',
            );
          }
          seenProductBatch.add(batchKey);
        }
      }

      if (!Money.eq(inv.totalAmount, computedLinesTotal)) {
        throw new BadRequestException('إجمالي الفاتورة لا يطابق مجموع البنود.');
      }

      const expectedNet = Money.toDbString(
        Money.sumPosted(
          Money.subtractDecimal(inv.totalAmount, inv.discountAmount),
          inv.vatAmount,
        ),
      );
      if (!Money.eq(inv.netAmount, expectedNet)) {
        throw new BadRequestException(
          'صافي الفاتورة لا يطابق المعادلة المالية.',
        );
      }

      const productIds = [
        ...new Set(
          inv.lines
            .map((l) => l.productId)
            .filter((id): id is number => id !== null),
        ),
      ].sort((a, b) => a - b);

      for (const productId of productIds) {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${productId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
      }
      for (const productId of productIds) {
        await tx.$queryRaw`SELECT id FROM "ProductStock" WHERE "productId"=${productId} AND "hospitalId"=${hospitalId} ORDER BY id FOR UPDATE`;
      }

      const residuals: { productId: number; amount: string }[] = [];

      // 2. معالجة كل بند (مخزون + تكلفة مرجحة WAC بدقة Money)
      for (const line of inv.lines) {
        if (line.productId) {
          const product = await tx.product.findFirst({
            where: {
              id: line.productId,
              hospitalId,
              isActive: true,
              isDeleted: false,
            },
            include: { category: true },
          });

          if (
            !product ||
            !['DRUG', 'SUPPLY', 'LAB_REAGENT'].includes(product.type) ||
            (product.category &&
              (product.category.hospitalId !== hospitalId ||
                !product.category.isActive ||
                product.category.valuationMethod !== 'WEIGHTED_AVERAGE'))
          ) {
            throw new BadRequestException('المنتج غير نشط أو تقييمه غير مدعوم');
          }

          if (
            !product.costPrice.isFinite() ||
            product.costPrice.lt(0) ||
            !product.stockOnHand.isFinite() ||
            product.stockOnHand.lt(0)
          ) {
            throw new BadRequestException('رصيد أو تكلفة الصنف غير صالحين');
          }

          await assertOwnedQuantity(
            tx,
            hospitalId,
            product.id,
            product.stockOnHand,
          );

          const batchNo = line.batchNumber?.trim() || 'GENERAL';
          if (batchNo.length > 100) {
            throw new BadRequestException('رقم التشغيلة يتجاوز الحد المسموح.');
          }
          if (line.expiryDate && line.expiryDate.getTime() <= Date.now()) {
            throw new BadRequestException('لا يقبل استلام صنف منتهي الصلاحية.');
          }

          const stock = await tx.productStock.findUnique({
            where: {
              warehouseId_productId_batchNumber: {
                warehouseId: inv.warehouseId,
                productId: product.id,
                batchNumber: batchNo,
              },
            },
          });

          if (
            stock &&
            (stock.hospitalId !== hospitalId ||
              (stock.expiryDate?.getTime() ?? null) !==
                (line.expiryDate?.getTime() ?? null))
          ) {
            throw new ConflictException(
              'التشغيلة موجودة بصلاحية أو ملكية مختلفة',
            );
          }

          if (
            stock &&
            (!stock.quantity.isFinite() ||
              stock.quantity.lt(0) ||
              !stock.unitCost.isFinite() ||
              stock.unitCost.lt(0))
          ) {
            throw new BadRequestException('رصيد أو تكلفة التشغيلة غير صالحين');
          }

          const base = line.quantity;
          const amount = Money.toDbString(line.totalAmount);
          const unitCost = Money.toUnitDbString(line.unitPrice);
          const next = product.stockOnHand.plus(base);

          if (
            next.gte('1000000000000000') ||
            next.lte(0) ||
            (stock && stock.quantity.plus(base).gte('1000000000000000'))
          ) {
            throw new BadRequestException('الرصيد الناتج يتجاوز سعة المخزون');
          }

          const beforeValue = Money.toDbString(
            Money.multiply(product.stockOnHand, product.costPrice),
          );
          const cost = Money.toUnitDbString(
            Money.sumDecimal(beforeValue, amount).div(next.toString()),
          );
          const batchQuantity = (stock?.quantity ?? new Prisma.Decimal(0)).plus(
            base,
          );
          const batchCost = Money.toUnitDbString(
            Money.sumDecimal(
              stock ? Money.multiply(stock.quantity, stock.unitCost) : 0,
              amount,
            ).div(batchQuantity.toString()),
          );

          await tx.productStock.upsert({
            where: {
              warehouseId_productId_batchNumber: {
                warehouseId: inv.warehouseId,
                productId: product.id,
                batchNumber: batchNo,
              },
            },
            update: {
              quantity: { increment: base.toString() },
              unitCost: batchCost,
              version: { increment: 1 },
            },
            create: {
              hospitalId,
              warehouseId: inv.warehouseId,
              productId: product.id,
              quantity: base.toString(),
              unitCost: batchCost,
              batchNumber: batchNo,
              expiryDate: line.expiryDate,
              version: 1,
            },
          });

          const updatedProduct = await tx.product.updateMany({
            where: {
              id: product.id,
              hospitalId,
              version: product.version,
              stockOnHand: product.stockOnHand,
            },
            data: {
              stockOnHand: next,
              costPrice: cost,
              version: { increment: 1 },
            },
          });
          if (updatedProduct.count !== 1) {
            throw new ConflictException('تغير رصيد الصنف أثناء الاعتماد');
          }

          await tx.stockTransaction.create({
            data: {
              hospitalId,
              warehouseId: inv.warehouseId,
              productId: product.id,
              type: StockTransactionType.IN,
              quantity: base.toString(),
              baseQuantity: base.toString(),
              unitCost,
              totalCost: amount,
              batchNumber: batchNo,
              expiryDate: line.expiryDate,
              referenceType: 'PURCHASE_INVOICE',
              referenceId: inv.id,
              createdById: userId,
              purchaseInvoiceId: inv.id,
            },
          });

          residuals.push({
            productId: product.id,
            amount: Money.toDbString(
              Money.subtractDecimal(
                Money.toDbString(Money.multiply(cost, next)),
                Money.sumPosted(beforeValue, amount),
              ),
            ),
          });
        }
      }

      const updated = await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { status: PurchaseInvoiceStatus.APPROVED },
      });

      await this.accounting.recordPurchaseInvoiceEntry({
        purchaseInvoiceId: updated.id,
        hospitalId,
        userId,
        tx,
      });

      const posted = await tx.purchaseInvoice.findUniqueOrThrow({
        where: { id: updated.id },
      });
      if (Money.isPositive(posted.netAmount) && !posted.accountingEntryId) {
        throw new BadRequestException(
          'تعذر إنشاء القيد المحاسبي لفاتورة الشراء.',
        );
      }

      const auditFields = {
        hospitalId,
        userId,
        action: 'APPROVE_PURCHASE_INVOICE',
        entity: 'PurchaseInvoice',
        entityId: posted.id,
        details: {
          supplierId: inv.supplierId,
          warehouseId: inv.warehouseId,
          totalAmount: Money.toDbString(inv.totalAmount),
          netAmount: Money.toDbString(inv.netAmount),
          accountingEntryId: posted.accountingEntryId,
          valuationRoundingResiduals: residuals,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;

      return posted;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
  }

  async updatePurchaseInvoice(params: {
    hospitalId: number;
    purchaseInvoiceId: number;
    userId: number;
    supplierId?: number;
    invoiceNumber?: string;
    invoiceDate: Date;
    dueDate?: Date;
    currency?: string;
    discountAmount?: number | string;
    vatAmount?: number | string;
    notes?: string;
    warehouseId?: number | null;
    lines: PurchaseInvoiceLineInput[];
  }) {
    const {
      hospitalId,
      purchaseInvoiceId,
      userId,
      supplierId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      currency,
      discountAmount = 0,
      vatAmount = 0,
      notes,
      warehouseId,
      lines,
    } = params;

    if (!Number.isFinite(invoiceDate?.getTime())) {
      throw new BadRequestException('تاريخ الفاتورة غير صالح.');
    }
    if (dueDate && !Number.isFinite(dueDate.getTime())) {
      throw new BadRequestException('تاريخ الاستحقاق غير صالح.');
    }

    const { lineData, totalAmount } = this.normalizeInvoiceLines(lines);
    const hasInventoryLines = lineData.some((l) => l.productId !== null);
    const discountStr = Money.toDbString(discountAmount);
    const vatStr = Money.toDbString(vatAmount);

    if (
      Money.isNegative(discountStr) ||
      Money.isNegative(vatStr) ||
      Money.decimal(discountStr).gt(totalAmount)
    ) {
      throw new BadRequestException('قيمة الخصم أو الضريبة غير صالحة.');
    }
    if (
      hasInventoryLines &&
      (!Money.eq(discountStr, 0) || !Money.eq(vatStr, 0))
    ) {
      throw new BadRequestException(
        'فواتير المخزون المباشرة لا تقبل خصمًا أو ضريبة إجمالية غير موزعة.',
      );
    }

    const netStr = Money.toDbString(
      Money.sumPosted(Money.subtractDecimal(totalAmount, discountStr), vatStr),
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        !(await tx.user.findFirst({
          where: { id: userId, hospitalId, isActive: true, isDeleted: false },
          select: { id: true },
        }))
      ) {
        throw new NotFoundException('المستخدم غير نشط أو خارج المنشأة.');
      }

      await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id=${purchaseInvoiceId} AND "hospitalId"=${hospitalId} FOR UPDATE`;

      const inv = await tx.purchaseInvoice.findFirst({
        where: { id: purchaseInvoiceId, hospitalId },
        include: {
          stockTransactions: { select: { id: true } },
          payments: { select: { id: true } },
        },
      });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (
        inv.status !== 'DRAFT' ||
        inv.accountingEntryId !== null ||
        (await tx.purchaseReturn.count({
          where: {
            hospitalId,
            purchaseInvoiceId: inv.id,
            status: { not: 'CANCELLED' },
          },
        })) ||
        (await tx.goodsReceipt.count({
          where: { hospitalId, purchaseInvoiceId: inv.id },
        }))
      )
        throw new BadRequestException('لا تعدل فاتورة معتمدة أو لها مردودات');
      if (inv.stockTransactions.length > 0 || inv.payments.length > 0)
        throw new BadRequestException('Cannot update processed invoice');

      const resolvedCurrency = currency ?? inv.currency;
      if (resolvedCurrency !== 'LYD') {
        throw new BadRequestException('العملة المدعومة حاليًا هي LYD فقط.');
      }

      const resolvedSupplierId = supplierId ?? inv.supplierId;
      if (
        !(await tx.supplier.findFirst({
          where: { id: resolvedSupplierId, hospitalId, isActive: true },
          select: { id: true },
        }))
      ) {
        throw new BadRequestException('المورد غير موجود أو غير نشط.');
      }

      const resolvedWarehouseId =
        warehouseId === undefined ? inv.warehouseId : warehouseId;
      if (hasInventoryLines && typeof resolvedWarehouseId !== 'number') {
        throw new BadRequestException(
          'يجب تحديد المخزن المستلم لبنود المخزون.',
        );
      }
      if (typeof resolvedWarehouseId === 'number') {
        if (
          !(await tx.warehouse.findFirst({
            where: { id: resolvedWarehouseId, hospitalId, isActive: true },
            select: { id: true },
          }))
        ) {
          throw new BadRequestException('المخزن غير موجود أو غير نشط.');
        }
      }

      for (const l of lineData) {
        if (l.productId !== null) {
          const product = await tx.product.findFirst({
            where: {
              id: l.productId,
              hospitalId,
              isActive: true,
              isDeleted: false,
            },
            include: { category: true },
          });
          if (
            !product ||
            !['DRUG', 'SUPPLY', 'LAB_REAGENT'].includes(product.type) ||
            (product.category &&
              (product.category.hospitalId !== hospitalId ||
                !product.category.isActive ||
                product.category.valuationMethod !== 'WEIGHTED_AVERAGE'))
          ) {
            throw new BadRequestException(
              'الصنف غير متاح أو تقييمه غير مدعوم.',
            );
          }
        }
        if (l.expenseAccountId !== null) {
          const acc = await tx.account.findFirst({
            where: {
              id: l.expenseAccountId,
              hospitalId,
              isActive: true,
              ...(l.productId !== null ? { type: 'ASSET' as const } : {}),
            },
            select: { id: true },
          });
          if (!acc) {
            throw new BadRequestException(
              'حساب البند غير صالح أو خارج المنشأة.',
            );
          }
        }
      }

      const invUpdated = await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: {
          supplierId: resolvedSupplierId,
          invoiceNumber: invoiceNumber?.trim() || null,
          invoiceDate,
          dueDate: dueDate ?? null,
          currency: resolvedCurrency,
          discountAmount: discountStr,
          vatAmount: vatStr,
          totalAmount,
          netAmount: netStr,
          notes: notes?.trim() || null,
          warehouseId: resolvedWarehouseId,
          lines: {
            deleteMany: {},
            create: lineData,
          },
        },
      });

      return invUpdated;
    });

    return updated;
  }

  async cancelPurchaseInvoice(params: {
    hospitalId: number;
    purchaseInvoiceId: number;
    userId: number;
    reason?: string;
  }) {
    const { hospitalId, purchaseInvoiceId, userId, reason } = params;
    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id=${purchaseInvoiceId} AND "hospitalId"=${hospitalId} FOR UPDATE`;

      const inv = await tx.purchaseInvoice.findFirst({
        where: { id: purchaseInvoiceId, hospitalId },
        include: {
          stockTransactions: { select: { id: true } },
          payments: { select: { id: true } },
        },
      });
      if (!inv) throw new NotFoundException('فاتورة الشراء غير موجودة.');
      if (
        await tx.purchaseReturn.count({
          where: {
            hospitalId,
            purchaseInvoiceId: inv.id,
            status: { not: 'CANCELLED' },
          },
        })
      )
        throw new BadRequestException('الفاتورة مرتبطة بمردودات');
      if (
        await tx.goodsReceipt.count({
          where: { hospitalId, purchaseInvoiceId: inv.id },
        })
      )
        throw new BadRequestException(
          'فاتورة مرتبطة باستلام تحتاج دورة تصحيح ومطابقة مستقلة؛لا يمكن إلغاؤها من هذا المسار',
        );
      if (inv.stockTransactions.length > 0)
        throw new BadRequestException('لا يمكن إلغاء فاتورة تم توريدها.');
      if (inv.payments.length > 0)
        throw new BadRequestException('لا يمكن إلغاء فاتورة عليها دفعات.');

      const updated = await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: {
          status: PurchaseInvoiceStatus.CANCELLED,
        },
      });

      if (inv.accountingEntryId) {
        await this.accounting.reverseEntry(
          hospitalId,
          inv.accountingEntryId,
          userId,
          reason || `إلغاء فاتورة شراء #${inv.id}`,
          tx,
        );
      }
      return updated;
    });
    return cancelled;
  }

  async recordSupplierPayment(params: {
    hospitalId: number;
    purchaseInvoiceId: number;
    supplierId: number;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    notes?: string;
    userId: number;
  }) {
    const {
      hospitalId,
      purchaseInvoiceId,
      supplierId,
      amount,
      method,
      reference,
      notes,
      userId,
    } = params;
    const paymentAmount = Money.toDb(amount || 0);
    if (paymentAmount <= 0)
      throw new BadRequestException('قيمة الدفعة غير صحيحة');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id=${purchaseInvoiceId} AND "hospitalId"=${hospitalId} FOR UPDATE`;

      const inv = await tx.purchaseInvoice.findFirst({
        where: { id: purchaseInvoiceId, hospitalId, supplierId },
      });
      if (!inv) throw new NotFoundException('فاتورة الشراء غير موجودة.');

      if (
        await tx.purchaseReturn.count({
          where: {
            hospitalId,
            purchaseInvoiceId: inv.id,
            status: { not: 'CANCELLED' },
            requestKey: null,
          },
        })
      )
        throw new BadRequestException('يلزم مطابقة مردودات قديمة قبل السداد');
      await financialPeriod(tx, hospitalId, new Date());
      const net = Money.fromPrisma(inv.netAmount);
      const paid = Money.fromPrisma(inv.paidAmount);
      if (!['APPROVED', 'PARTIALLY_PAID', 'PAID'].includes(inv.status))
        throw new BadRequestException('الفاتورة غير قابلة للسداد');
      const returned = await tx.purchaseReturn.aggregate({
        where: { hospitalId, purchaseInvoiceId: inv.id, status: 'COMPLETED' },
        _sum: { totalAmount: true },
      });
      const remaining = Money.toDb(
        Money.decimal(net)
          .minus(paid)
          .minus(Money.decimal(returned._sum.totalAmount)),
      );

      if (Money.gt(paymentAmount, remaining))
        throw new BadRequestException('قيمة الدفعة أكبر من الرصيد.');

      const payment = await tx.supplierPayment.create({
        data: {
          hospitalId,
          supplierId,
          purchaseInvoiceId,
          amount: paymentAmount,
          method,
          reference: reference || null,
          notes: notes || null,
          createdById: userId,
        },
      });

      const newPaid = Money.toDb(Money.add(paid, paymentAmount));
      const newStatus = Money.gte(newPaid, net)
        ? PurchaseInvoiceStatus.PAID
        : PurchaseInvoiceStatus.PARTIALLY_PAID;

      const updatedInvoice = await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { paidAmount: newPaid, status: newStatus },
      });

      await this.accounting.recordSupplierPaymentEntry({
        supplierPaymentId: payment.id,
        hospitalId,
        userId,
        tx,
      });

      let settledConsignmentsCount = 0;
      let settledAudit: Awaited<
        ReturnType<typeof appendChainedAuditInTransaction>
      > | null = null;

      if (
        newStatus === PurchaseInvoiceStatus.PAID &&
        tx.consignmentConsumption?.updateMany
      ) {
        const settled = await tx.consignmentConsumption.updateMany({
          where: {
            hospitalId,
            purchaseInvoiceId: inv.id,
            supplierBillStatus: 'BILLED',
          },
          data: { supplierBillStatus: 'SETTLED' },
        });
        settledConsignmentsCount = settled.count;
        if (settled.count > 0) {
          settledAudit = await appendChainedAuditInTransaction(tx, {
            hospitalId,
            userId,
            action: 'CONSIGNMENT_CONSUMPTIONS_AUTO_SETTLED',
            entity: 'PurchaseInvoice',
            entityId: inv.id,
            details: {
              supplierPaymentId: payment.id,
              settledCount: settled.count,
              paidAmount: newPaid,
            },
          });
        }
      }

      return {
        invoice: updatedInvoice,
        payment,
        settledConsignmentsCount,
        settledAudit,
      };
    });

    if (result.settledAudit) {
      publishCommittedCriticalAudit(result.settledAudit);
    }
    return {
      invoice: result.invoice,
      payment: result.payment,
      settledConsignmentsCount: result.settledConsignmentsCount,
    };
  }
}
