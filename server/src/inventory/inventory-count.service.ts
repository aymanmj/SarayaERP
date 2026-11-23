import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import {
  InventoryCountStatus,
  InventoryCountType,
  Prisma,
  StockTransactionType,
} from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { assertOwnedQuantity } from './material-transfer';

@Injectable()
export class InventoryCountService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}
  private async actor(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    userId: number,
  ) {
    if (
      !(await tx.user.findFirst({
        where: { id: userId, hospitalId, isActive: true, isDeleted: false },
      }))
    )
      throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
  }
  private async lock(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    id?: number,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
    if (id !== undefined)
      await tx.$queryRaw`SELECT id FROM "InventoryCount" WHERE id=${id} AND "hospitalId"=${hospitalId} FOR UPDATE`;
  }
  private async warehouse(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    id: number,
  ) {
    const rows = await tx.$queryRaw<
      { id: number }[]
    >`SELECT id FROM "Warehouse" WHERE id=${id} AND "hospitalId"=${hospitalId} AND "isActive"=true FOR SHARE`;
    if (rows.length !== 1)
      throw new BadRequestException('المخزن غير نشط أو خارج المنشأة');
  }
  async createDraftCount(params: {
    hospitalId: number;
    warehouseId: number;
    userId: number;
    type: InventoryCountType;
    notes?: string;
  }) {
    const { hospitalId, warehouseId, userId, type, notes } = params;
    if (!['FULL', 'QUARTERLY', 'SPOT_CHECK'].includes(type))
      throw new BadRequestException('نوع الجرد غير صالح');
    let committedAudit: Record<string, unknown> | null = null;
    const createdCount = await this.prisma.$transaction(
      async (tx) => {
        committedAudit = null;
        await this.lock(tx, hospitalId);
        await this.actor(tx, hospitalId, userId);
        await this.warehouse(tx, hospitalId, warehouseId);
        await tx.$queryRaw`SELECT p.id FROM "Product" p WHERE p."hospitalId"=${hospitalId} AND EXISTS (SELECT 1 FROM "ProductStock" s WHERE s."productId"=p.id AND s."warehouseId"=${warehouseId}) ORDER BY p.id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "ProductStock" WHERE "warehouseId"=${warehouseId} AND "hospitalId"=${hospitalId} ORDER BY "productId",id FOR UPDATE`;
        const stocks = await tx.productStock.findMany({
          where: { hospitalId, warehouseId },
          include: { product: true },
          orderBy: { id: 'asc' },
        });
        if (!stocks.length)
          throw new BadRequestException('لا توجد تشغيلات لأخذ لقطة جرد');
        for (const stock of stocks)
          if (
            stock.product.hospitalId !== hospitalId ||
            !stock.quantity.isFinite() ||
            stock.quantity.lt(0) ||
            !stock.product.costPrice.isFinite() ||
            stock.product.costPrice.lt(0)
          )
            throw new BadRequestException(
              'رصيد أو تكلفة أو ملكية صنف غير صالحة',
            );
        const count = await tx.inventoryCount.create({
          data: {
            hospitalId,
            warehouseId,
            assignedToId: userId,
            type,
            status: 'DRAFT',
            notes,
          },
        });
        await tx.inventoryCountLine.createMany({
          data: stocks.map((stock) => ({
            inventoryCountId: count.id,
            productId: stock.productId,
            batchNumber: stock.batchNumber,
            expiryDate: stock.expiryDate,
            systemQty: stock.quantity,
            physicalQty: null,
            variance: 0,
            costPrice: stock.product.costPrice,
            snapshotStockId: stock.id,
            snapshotStockVersion: stock.version,
            snapshotProductVersion: stock.product.version,
          })),
        });
        const auditFields = {
          hospitalId,
          userId,
          action: 'CREATE_INVENTORY_COUNT',
          entity: 'InventoryCount',
          entityId: count.id,
          details: { warehouseId, lineCount: stocks.length },
        };
        await appendChainedAuditInTransaction(tx, auditFields);
        committedAudit = auditFields;
        return count;
      },
      { maxWait: 10000, timeout: 20000 },
    );
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return createdCount;
  }
  async findAll(hospitalId: number) {
    return this.prisma.inventoryCount.findMany({
      where: { hospitalId },
      include: {
        warehouse: { select: { id: true, name: true, isActive: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async getCount(id: number, hospitalId: number) {
    const count = await this.prisma.inventoryCount.findFirst({
      where: { id, hospitalId },
      include: {
        lines: {
          include: {
            product: { select: { id: true, name: true, code: true } },
          },
          orderBy: { id: 'asc' },
        },
        warehouse: { select: { id: true, name: true, isActive: true } },
        assignedTo: { select: { id: true, fullName: true } },
        accountingEntry: { select: { id: true, postingKey: true } },
      },
    });
    if (!count) throw new NotFoundException('الجرد غير موجود ضمن المنشأة');
    return count;
  }
  async updateLine(
    countId: number,
    lineId: number,
    physicalQty: string,
    revision: number,
    userId: number,
    hospitalId: number,
  ) {
    if (
      typeof physicalQty !== 'string' ||
      !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(physicalQty) ||
      !Number.isInteger(revision) ||
      revision < 0
    )
      throw new BadRequestException(
        'العد الفعلي ودقة الكمية أو إصدار البند غير صالحين',
      );
    let committedAudit: Record<string, unknown> | null = null;
    const updatedLine = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await this.lock(tx, hospitalId, countId);
      await this.actor(tx, hospitalId, userId);
      const count = await tx.inventoryCount.findFirst({
        where: { id: countId, hospitalId },
      });
      if (!count) throw new NotFoundException('الجرد غير موجود');
      if (!['DRAFT', 'IN_PROGRESS'].includes(count.status))
        throw new ConflictException('الجرد غير قابل لتعديل العد');
      const line = await tx.inventoryCountLine.findFirst({
        where: { id: lineId, inventoryCountId: countId },
      });
      if (!line) throw new NotFoundException('البند لا يتبع هذا الجرد');
      if (line.revision !== revision)
        throw new ConflictException('تغير العد؛أعد تحميل البند قبل التعديل');
      const physical = new Prisma.Decimal(physicalQty);
      const result = await tx.inventoryCountLine.update({
        where: { id: lineId },
        data: {
          physicalQty: physical,
          variance: physical.minus(line.systemQty),
          revision: { increment: 1 },
          countedAt: new Date(),
          countedById: userId,
        },
      });
      if (count.status === 'DRAFT')
        await tx.inventoryCount.update({
          where: { id: countId },
          data: { status: 'IN_PROGRESS' },
        });
      const auditFields = {
        hospitalId,
        userId,
        action: 'COUNT_INVENTORY_LINE',
        entity: 'InventoryCountLine',
        entityId: lineId,
        details: {
          countId,
          physicalQty,
          previousPhysicalQty: line.physicalQty?.toFixed(3) ?? null,
          revision: result.revision,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return result;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updatedLine;
  }
  async updateStatus(
    id: number,
    status: InventoryCountStatus,
    hospitalId: number,
    userId: number,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updatedCount = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await this.lock(tx, hospitalId, id);
      await this.actor(tx, hospitalId, userId);
      const count = await tx.inventoryCount.findFirst({
        where: { id, hospitalId },
        include: { lines: true },
      });
      if (!count) throw new NotFoundException('الجرد غير موجود');
      const allowed: Partial<
        Record<InventoryCountStatus, InventoryCountStatus[]>
      > = {
        DRAFT: ['CANCELLED'],
        IN_PROGRESS: ['REVIEW', 'CANCELLED'],
        REVIEW: ['IN_PROGRESS', 'CANCELLED'],
      };
      if (!allowed[count.status]?.includes(status))
        throw new ConflictException('انتقال حالة الجرد غير مسموح');
      if (
        status === 'REVIEW' &&
        (!count.lines.length ||
          count.lines.some(
            (l) => l.physicalQty === null || !l.countedById || !l.countedAt,
          ))
      )
        throw new BadRequestException('يلزم عد كل بند صراحةً قبل المراجعة');
      const result = await tx.inventoryCount.update({
        where: { id },
        data: { status },
      });
      const auditFields = {
        hospitalId,
        userId,
        action: 'CHANGE_INVENTORY_COUNT_STATUS',
        entity: 'InventoryCount',
        entityId: id,
        details: { previousStatus: count.status, status },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return result;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updatedCount;
  }
  async postCount(id: number, userId: number, hospitalId: number) {
    let committedAudit: Record<string, unknown> | null = null;
    const postedCount = await this.prisma.$transaction(
      async (tx) => {
        committedAudit = null;
        await this.lock(tx, hospitalId, id);
        await this.actor(tx, hospitalId, userId);
        await tx.$queryRaw`SELECT l.id FROM "InventoryCountLine" l JOIN "InventoryCount" c ON c.id=l."inventoryCountId" WHERE c.id=${id} AND c."hospitalId"=${hospitalId} ORDER BY l.id FOR UPDATE OF l`;
        const count = await tx.inventoryCount.findFirst({
          where: { id, hospitalId },
          include: { lines: { orderBy: { id: 'asc' } } },
        });
        if (!count) throw new NotFoundException('الجرد غير موجود');
        if (count.status === 'POSTED') return count;
        if (
          count.status !== 'REVIEW' ||
          !count.lines.length ||
          count.lines.some(
            (l) => l.physicalQty === null || !l.countedAt || !l.countedById,
          )
        )
          throw new BadRequestException(
            'يلزم استكمال العد وإرسال الجرد للمراجعة',
          );
        if (
          count.assignedToId === userId ||
          count.lines.some((l) => l.countedById === userId)
        )
          throw new BadRequestException('يلزم معتمد مستقل عن منفذ العد');
        await this.warehouse(tx, hospitalId, count.warehouseId);
        const ids = [...new Set(count.lines.map((l) => l.productId))].sort(
          (a, b) => a - b,
        );
        for (const productId of ids)
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${productId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
        for (const productId of ids)
          await tx.$queryRaw`SELECT id FROM "ProductStock" WHERE "productId"=${productId} AND "hospitalId"=${hospitalId} ORDER BY id FOR UPDATE`;
        const stocks = await tx.productStock.findMany({
          where: { hospitalId, warehouseId: count.warehouseId },
        });
        const snapshots = new Set(count.lines.map((l) => l.snapshotStockId));
        if (
          stocks.length !== count.lines.length ||
          stocks.some((s) => !snapshots.has(s.id))
        )
          throw new ConflictException(
            'تغيرت تشغيلات المخزن منذ اللقطة؛ألغِ الجرد وأنشئ لقطة وعدًا جديدين',
          );
        const values: { productId: number; amount: string }[] = [];
        for (const productId of ids) {
          const product = await tx.product.findFirst({
            where: {
              id: productId,
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
          )
            throw new BadRequestException(
              'نوع الصنف أو تصنيفه أو ملكيته لا يدعم هذا الجرد',
            );
          await assertOwnedQuantity(
            tx,
            hospitalId,
            productId,
            product.stockOnHand,
          );
          let running = product.stockOnHand;
          let changed = false;
          for (const line of count.lines.filter(
            (l) => l.productId === productId,
          )) {
            const stock = stocks.find((s) => s.id === line.snapshotStockId);
            if (
              !stock ||
              stock.productId !== productId ||
              stock.batchNumber !== line.batchNumber ||
              stock.version !== line.snapshotStockVersion ||
              !stock.quantity.eq(line.systemQty) ||
              product.version !== line.snapshotProductVersion ||
              !product.costPrice.eq(line.costPrice) ||
              (stock.expiryDate?.getTime() ?? null) !==
                (line.expiryDate?.getTime() ?? null)
            )
              throw new ConflictException(
                'تغير رصيد أو إصدار أو تكلفة بعد لقطة الجرد؛يلزم إلغاؤه وإعادة العد',
              );
            const physical = line.physicalQty!;
            const delta = physical.minus(stock.quantity);
            if (!delta.eq(line.variance))
              throw new ConflictException('فرق العد غير متسق');
            if (delta.isZero()) continue;
            if (
              delta.gt(0) &&
              stock.expiryDate &&
              stock.expiryDate <= new Date()
            )
              throw new BadRequestException(
                'زيادة المنتهي تتطلب معالجة حجر مستقلة',
              );
            const next = running.plus(delta);
            if (next.lt(0) || next.gte('1000000000000000'))
              throw new BadRequestException('الرصيد الناتج غير صالح');
            const amount = Money.toDbString(
              Money.subtractDecimal(
                Money.toDbString(Money.multiply(product.costPrice, next)),
                Money.toDbString(Money.multiply(product.costPrice, running)),
              ),
            );
            const updated = await tx.productStock.updateMany({
              where: {
                id: stock.id,
                version: stock.version,
                quantity: stock.quantity,
              },
              data: { quantity: physical, version: { increment: 1 } },
            });
            if (updated.count !== 1)
              throw new ConflictException('تغير رصيد التشغيلة أثناء الترحيل');
            await tx.stockTransaction.create({
              data: {
                hospitalId,
                warehouseId: count.warehouseId,
                productId,
                type: 'ADJUST',
                quantity: delta,
                baseQuantity: delta,
                unitCost: Money.toUnitDbString(product.costPrice),
                totalCost: amount,
                batchNumber: stock.batchNumber,
                expiryDate: stock.expiryDate,
                referenceType: 'INVENTORY_COUNT',
                referenceId: id,
                createdById: userId,
              },
            });
            values.push({ productId, amount });
            running = next;
            changed = true;
          }
          if (changed) {
            const updated = await tx.product.updateMany({
              where: {
                id: productId,
                hospitalId,
                version: product.version,
                stockOnHand: product.stockOnHand,
              },
              data: { stockOnHand: running, version: { increment: 1 } },
            });
            if (updated.count !== 1)
              throw new ConflictException('تغير الرصيد الإجمالي أثناء الترحيل');
          }
        }
        await this.accounting.recordInventoryAdjustmentEntry({
          inventoryCountId: id,
          hospitalId,
          userId,
          varianceLines: values,
          tx,
        });
        const result = await tx.inventoryCount.update({
          where: { id },
          data: { status: 'POSTED', approvedById: userId },
        });
        const auditFields = {
          hospitalId,
          userId,
          action: 'POST_INVENTORY_COUNT',
          entity: 'InventoryCount',
          entityId: id,
          details: {
            warehouseId: count.warehouseId,
            movementCount: values.length,
          },
        };
        await appendChainedAuditInTransaction(tx, auditFields);
        committedAudit = auditFields;
        return result;
      },
      { maxWait: 10000, timeout: 20000 },
    );
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return postedCount;
  }

  // 6. Dashboard Stats
  async getDashboardStats(hospitalId: number, warehouseId?: number) {
    if (warehouseId !== undefined) {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: warehouseId, hospitalId },
        select: { id: true },
      });
      if (!wh) {
        throw new NotFoundException('المخزن غير موجود ضمن هذه المنشأة');
      }
    }

    const whereBase: Prisma.ProductStockWhereInput = {
      hospitalId,
      ...(warehouseId ? { warehouseId } : {}),
      product: { hospitalId, isDeleted: false },
    };

    const allStocks = await this.prisma.productStock.findMany({
      where: whereBase,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            costPrice: true,
            minStock: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ quantity: 'asc' }, { id: 'asc' }],
    });

    // 1. Total Stock Value (WAC aggregated per product in scope using Money)
    const productTotals = new Map<
      number,
      { costPrice: Prisma.Decimal; quantity: Prisma.Decimal }
    >();
    for (const stock of allStocks) {
      if (stock.quantity.lte(0)) continue;
      const existing = productTotals.get(stock.productId);
      if (existing) {
        existing.quantity = existing.quantity.plus(stock.quantity);
      } else {
        productTotals.set(stock.productId, {
          costPrice: stock.product.costPrice,
          quantity: stock.quantity,
        });
      }
    }

    const productValues = Array.from(productTotals.values()).map((entry) =>
      Money.toDbString(Money.multiply(entry.costPrice, entry.quantity)),
    );
    const totalValueDecimal = Money.sumPosted(...productValues);
    const totalValue = Money.fromPrisma(totalValueDecimal);
    const totalValueText = Money.toDbString(totalValueDecimal);

    // 2. Low Stock Items (Top 5) using configured stock/product minStock (fallback 10)
    const lowStockMatches = allStocks
      .filter((s) => s.product.isActive)
      .map((s) => {
        const limit = s.minStock.gt(0)
          ? s.minStock
          : s.product.minStock.gt(0)
            ? s.product.minStock
            : new Prisma.Decimal(10);
        return { stock: s, limit };
      })
      .filter(({ stock, limit }) => stock.quantity.lte(limit));

    const lowStockCount = lowStockMatches.length;
    const lowStockDisplay = lowStockMatches
      .slice(0, 5)
      .map(({ stock, limit }) => ({
        name: stock.product.name,
        qty: Money.fromPrisma(stock.quantity),
        limit: Money.fromPrisma(limit),
      }));

    // 3. Pending Purchase Orders (Hospital-wide)
    const pendingOrders = await this.prisma.purchaseOrder.count({
      where: {
        hospitalId,
        status: { in: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'] },
      },
    });

    const countWhereBase: Prisma.InventoryCountWhereInput = {
      hospitalId,
      ...(warehouseId ? { warehouseId } : {}),
    };

    // 4. Active Inventory Counts
    const activeCounts = await this.prisma.inventoryCount.count({
      where: {
        ...countWhereBase,
        status: { in: ['DRAFT', 'IN_PROGRESS', 'REVIEW'] },
      },
    });

    // 5. Count Status Distribution
    const countsByStatus = await this.prisma.inventoryCount.groupBy({
      by: ['status'],
      where: countWhereBase,
      _count: { id: true },
    });

    const statusDistribution = countsByStatus.map((s) => ({
      name: s.status,
      value: s._count.id,
    }));

    // Reconstruct 6-month UTC valuation history backwards from current total stock value using Money.
    const now = new Date();
    const monthKeys: string[] = [];
    for (let offset = 5; offset >= 0; offset--) {
      const monthDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
      );
      const key = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
      monthKeys.push(key);
    }
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1, 0, 0, 0, 0),
    );

    const recentTxs = await this.prisma.stockTransaction.findMany({
      where: {
        hospitalId,
        ...(warehouseId ? { warehouseId } : {}),
        createdAt: { gte: windowStart },
      },
      select: {
        type: true,
        quantity: true,
        baseQuantity: true,
        totalCost: true,
        createdAt: true,
      },
    });

    const monthlyNetDelta = new Map<string, ReturnType<typeof Money.decimal>>();
    for (const key of monthKeys) {
      monthlyNetDelta.set(key, Money.decimal(0));
    }

    for (const tx of recentTxs) {
      const d = tx.createdAt;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const existingDelta = monthlyNetDelta.get(key);
      if (!existingDelta) continue;

      const costMagnitude = Money.decimal(tx.totalCost).abs();
      let signedDelta = costMagnitude;

      if (tx.type === StockTransactionType.OUT) {
        signedDelta = costMagnitude.neg();
      } else if (tx.type === StockTransactionType.ADJUST) {
        const baseQty = tx.baseQuantity ?? new Prisma.Decimal(0);
        const rawQty = tx.quantity ?? new Prisma.Decimal(0);
        const isNegative = baseQty.lt(0) || (baseQty.eq(0) && rawQty.lt(0));
        signedDelta = isNegative ? costMagnitude.neg() : costMagnitude;
      }

      monthlyNetDelta.set(key, Money.addDecimal(existingDelta, signedDelta));
    }

    const trendData: Array<{ name: string; value: number; valueText: string }> =
      new Array(monthKeys.length);

    let runningEndValue = Money.decimal(totalValueDecimal);
    for (let i = monthKeys.length - 1; i >= 0; i--) {
      const clamped = runningEndValue.lt(0)
        ? Money.decimal(0)
        : runningEndValue;
      trendData[i] = {
        name: monthKeys[i],
        value: Money.fromPrisma(clamped),
        valueText: Money.toDbString(clamped),
      };
      if (i > 0) {
        const currentMonthDelta =
          monthlyNetDelta.get(monthKeys[i]) ?? Money.decimal(0);
        runningEndValue = Money.subtractDecimal(
          runningEndValue,
          currentMonthDelta,
        );
      }
    }

    return {
      totalProducts: productTotals.size,
      totalValue,
      totalValueText,
      lowStockItems: lowStockDisplay,
      lowStockCount,
      pendingOrders,
      activeCounts,
      statusDistribution,
      stockTrend: trendData,
    };
  }
}
