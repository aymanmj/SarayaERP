import { usableStockWhere } from './stock-batch-safety';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  MaterialRequestStatus,
  StockIssueStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';

type Tx = Prisma.TransactionClient;
type Item = { productId: number; quantity: number; batchNumber?: string };
export type MaterialTransferParams = {
  hospitalId: number;
  userId: number;
  materialRequestId: number;
  requestKey?: string;
  notes?: string;
  items?: Item[];
};
function bad(message: string): never {
  throw new BadRequestException(message);
}
function quantity(value: number | Prisma.Decimal) {
  const result = new Prisma.Decimal(value);
  if (
    !result.isFinite() ||
    result.lte(0) ||
    result.decimalPlaces() > 3 ||
    result.gte('1000000000000000')
  )
    bad('الكمية موجبة وبحد أقصى ثلاث منازل عشرية وضمن سعة المخزون');
  return result;
}
export async function transferWarehouses(
  tx: Tx,
  hospitalId: number,
  from: number,
  to: number,
) {
  if (from === to) bad('المصدر والوجهة يجب أن يكونا مختلفين');
  const count = await tx.warehouse.count({
    where: { id: { in: [from, to] }, hospitalId, isActive: true },
  });
  if (count !== 2)
    bad('مخزنا المصدر والوجهة يجب أن يكونا نشطين وضمن المنشأة نفسها');
}
export async function validateTransferRequest(
  tx: Tx,
  hospitalId: number,
  items: { productId: number; requestedQty: number; uomId?: number }[],
) {
  if (
    !items.length ||
    new Set(items.map((i) => i.productId)).size !== items.length
  )
    bad('قائمة الأصناف فارغة أو تحتوي أصنافًا مكررة');
  for (const item of items) {
    quantity(item.requestedQty);
    const product = await tx.product.findFirst({
      where: {
        id: item.productId,
        hospitalId,
        isActive: true,
        isDeleted: false,
      },
    });
    if (!product) bad('الصنف غير نشط أو خارج المنشأة');
    if (
      item.uomId &&
      item.uomId !== product.baseUomId &&
      !(await tx.productUOM.findUnique({
        where: {
          productId_uomId: { productId: item.productId, uomId: item.uomId },
        },
      }))
    )
      bad('وحدة القياس غير مرتبطة بالصنف');
  }
}
async function lockProducts(tx: Tx, hospitalId: number, ids: number[]) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const rows = await tx.$queryRaw<
      { id: number }[]
    >`SELECT id FROM "Product" WHERE id=${id} AND "hospitalId"=${hospitalId} FOR UPDATE`;
    if (!rows.length) bad('صنف خارج المنشأة');
  }
}
export async function assertOwnedQuantity(
  tx: Tx,
  hospitalId: number,
  productId: number,
  onHand: Prisma.Decimal,
) {
  const stocks = await tx.productStock.aggregate({
    where: { hospitalId, productId },
    _sum: { quantity: true },
  });
  const transit = await tx.stockIssueItem.aggregate({
    where: {
      productId,
      stockIssue: { hospitalId, transferVersion: 1, status: 'ISSUED' },
    },
    _sum: { issuedQty: true },
  });
  if (
    !(stocks._sum.quantity ?? new Prisma.Decimal(0))
      .plus(transit._sum.issuedQty ?? 0)
      .equals(onHand)
  )
    throw new ConflictException(
      'رصيد الصنف الإجمالي لا يطابق أرصدة المخازن والمواد قيد النقل؛تلزم المطابقة قبل التحويل',
    );
}

export async function issueMaterialTransfer(
  db: PrismaService,
  params: MaterialTransferParams,
  existingTx?: Tx,
  onAudit?: (audit: Record<string, unknown>) => void,
) {
  const { hospitalId, userId, materialRequestId, items, notes, requestKey } =
    params;
  if (
    !requestKey ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestKey,
    )
  )
    bad('يلزم مفتاح UUID للعملية لمنع تكرار الصرف');
  if (
    items &&
    (!items.length ||
      new Set(items.map((i) => i.productId)).size !== items.length)
  )
    bad('قائمة الصرف فارغة أو مكررة');
  items?.forEach((i) => quantity(i.quantity));
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        materialRequestId,
        items: items
          ? [...items].sort((a, b) => a.productId - b.productId)
          : null,
        notes: notes ?? '',
      }),
    )
    .digest('hex');
  let committedAudit: Record<string, unknown> | null = null;
  const execute = async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
    await tx.$queryRaw`SELECT id FROM "MaterialRequest" WHERE id=${materialRequestId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
    const replay = await tx.stockIssue.findFirst({
      where: { hospitalId, requestKey },
    });
    if (replay) {
      if (
        replay.requestFingerprint !== fingerprint ||
        replay.issuedById !== userId
      )
        throw new ConflictException('مفتاح العملية مستخدم لصرف آخر');
      return {
        success: true,
        stockIssueId: replay.id,
        issueNumber: replay.issueNumber,
      };
    }
    const mr = await tx.materialRequest.findFirst({
      where: { id: materialRequestId, hospitalId },
      include: { items: true },
    });
    if (!mr) throw new NotFoundException('طلب المواد غير موجود');
    if (
      !(['APPROVED', 'PARTIALLY_ISSUED'] as MaterialRequestStatus[]).includes(
        mr.status,
      )
    )
      bad('الطلب غير معتمد أو صرف بالكامل');
    await transferWarehouses(
      tx,
      hospitalId,
      mr.fulfillingWarehouseId,
      mr.requestingWarehouseId,
    );
    if (new Set(mr.items.map((i) => i.productId)).size !== mr.items.length)
      bad('طلب ذو أصناف مكررة؛أعد إنشاءه');
    if (items?.some((i) => !mr.items.some((r) => r.productId === i.productId)))
      bad('الصرف يحتوي صنفًا غير مطلوب');
    await lockProducts(
      tx,
      hospitalId,
      mr.items.map((i) => i.productId),
    );
    // UUID replaces the old four-digit random number and gives a durable operation reference.
    const issue = await tx.stockIssue.create({
      data: {
        hospitalId,
        materialRequestId,
        issuedFromId: mr.fulfillingWarehouseId,
        issuedById: userId,
        issueNumber: `SI-${randomUUID()}`,
        transferVersion: 1,
        requestKey,
        requestFingerprint: fingerprint,
        notes,
      },
    });
    let count = 0;
    for (const line of mr.items) {
      const selected = items?.find((i) => i.productId === line.productId);
      if (items && !selected) continue;
      const remaining = line.requestedQty.minus(line.issuedQty);
      if (remaining.lte(0)) {
        if (selected) bad('الصنف صرف بالكامل');
        else continue;
      }
      const qty = quantity(selected?.quantity ?? remaining);
      if (qty.gt(remaining)) bad('الكمية المصروفة تتجاوز المتبقي من الطلب');
      const product = await tx.product.findFirst({
        where: {
          id: line.productId,
          hospitalId,
          isActive: true,
          isDeleted: false,
        },
        include: { category: true },
      });
      if (!product) bad('الصنف غير نشط أو محذوف أو خارج المنشأة');
      // Current bounded contract: global weighted average; other valuation engines remain separate work.
      if (
        product.category &&
        product.category.valuationMethod !== 'WEIGHTED_AVERAGE'
      )
        bad(
          'التحويل الحالي يدعم المتوسط المرجح؛تلزم تهيئة محرك طبقات التقييم للطرق الأخرى',
        );
      await assertOwnedQuantity(
        tx,
        hospitalId,
        product.id,
        product.stockOnHand,
      );
      let factor = new Prisma.Decimal(1);
      if (line.uomId && line.uomId !== product.baseUomId) {
        const conversion = await tx.productUOM.findUnique({
          where: {
            productId_uomId: { productId: product.id, uomId: line.uomId },
          },
        });
        if (!conversion || conversion.conversionRate.lte(0))
          bad('تحويل وحدة قياس غير صالح');
        factor = conversion.conversionRate;
      }
      const base = quantity(qty.mul(factor));
      if (product.costPrice.lt(0)) bad('تكلفة الصنف غير صالحة');
      const stocks = await tx.productStock.findMany({
        where: {
          ...(await usableStockWhere(tx, hospitalId, product.id)),
          warehouseId: mr.fulfillingWarehouseId,
          quantity: { gt: 0 },
          ...(selected?.batchNumber
            ? { batchNumber: selected.batchNumber }
            : {}),
        },
        orderBy: [
          { expiryDate: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });
      let needed = base;
      for (const stock of stocks) {
        if (needed.lte(0)) break;
        if (!stock.batchNumber || stock.unitCost.lt(0))
          bad('يلزم معرف تشغيلة وتكلفة سليمة قبل التحويل');
        const take = Prisma.Decimal.min(stock.quantity, needed);
        const changed = await tx.productStock.updateMany({
          where: {
            id: stock.id,
            hospitalId,
            version: stock.version,
            quantity: { gte: take },
          },
          data: { quantity: { decrement: take }, version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            'تغير رصيد التشغيلة؛أعد المحاولة بالمفتاح نفسه',
          );
        const total = take.mul(product.costPrice).toDecimalPlaces(3);
        await tx.stockIssueItem.create({
          data: {
            stockIssueId: issue.id,
            productId: product.id,
            batchNumber: stock.batchNumber,
            expiryDate: stock.expiryDate,
            issuedQty: take,
            baseQuantity: take,
            unitCost: product.costPrice,
            totalCost: total,
            batchUnitCost: stock.unitCost,
          },
        });
        await tx.stockTransaction.create({
          data: {
            hospitalId,
            warehouseId: mr.fulfillingWarehouseId,
            productId: product.id,
            stockIssueId: issue.id,
            type: 'OUT',
            quantity: take,
            baseQuantity: take,
            unitCost: product.costPrice,
            totalCost: total,
            batchNumber: stock.batchNumber,
            expiryDate: stock.expiryDate,
            referenceType: 'MATERIAL_ISSUE',
            referenceId: issue.id,
            createdById: userId,
          },
        });
        needed = needed.minus(take);
      }
      if (needed.gt(0)) bad('رصيد التشغيلات السليمة غير المنتهية غير كافٍ');
      await tx.materialRequestItem.update({
        where: { id: line.id },
        data: { issuedQty: { increment: qty } },
      });
      count++;
    }
    if (!count) bad('لا يوجد مقدار متبقٍ للصرف');
    const lines = await tx.materialRequestItem.findMany({
      where: { materialRequestId },
    });
    await tx.materialRequest.update({
      where: { id: materialRequestId },
      data: {
        status: lines.every((i) => i.issuedQty.eq(i.requestedQty))
          ? 'COMPLETED'
          : 'PARTIALLY_ISSUED',
      },
    });
    const auditEntry = await appendChainedAuditInTransaction(tx, {
      hospitalId,
      userId,
      action: 'ISSUE_INTERNAL_TRANSFER',
      entity: 'StockIssue',
      entityId: issue.id,
      details: { materialRequestId, requestKey },
    });
    if (onAudit) onAudit(auditEntry);
    else committedAudit = auditEntry;
    return {
      success: true,
      stockIssueId: issue.id,
      issueNumber: issue.issueNumber,
    };
  };
  if (existingTx) return execute(existingTx);
  const outcome = await db.$transaction(execute, {
    maxWait: 10000,
    timeout: 20000,
  });
  if (committedAudit) publishCommittedCriticalAudit(committedAudit);
  return outcome;
}

export async function receiveMaterialTransfer(
  db: PrismaService,
  hospitalId: number,
  issueId: number,
  userId: number,
  existingTx?: Tx,
  onAudit?: (audit: Record<string, unknown>) => void,
) {
  let committedAudit: Record<string, unknown> | null = null;
  const execute = async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
    await tx.$queryRaw`SELECT id FROM "StockIssue" WHERE id=${issueId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
    const issue = await tx.stockIssue.findFirst({
      where: { id: issueId, hospitalId },
      include: { items: true, materialRequest: true },
    });
    if (!issue) throw new NotFoundException('إذن الصرف غير موجود');
    if (
      issue.transferVersion !== 1 ||
      !issue.items.length ||
      issue.items.some(
        (i) =>
          i.unitCost === null ||
          i.totalCost === null ||
          i.batchUnitCost === null,
      )
    )
      throw new ConflictException(
        'إذن دون بيانات التحويل المثبتة؛أعد إنشاء العملية في بيئة التطوير',
      );
    if (issue.status === StockIssueStatus.RECEIVED) return { success: true };
    await transferWarehouses(
      tx,
      hospitalId,
      issue.issuedFromId,
      issue.materialRequest.requestingWarehouseId,
    );
    if (
      issue.materialRequest.hospitalId !== hospitalId ||
      issue.issuedFromId !== issue.materialRequest.fulfillingWarehouseId
    )
      bad('مصدر الإذن لا يطابق طلب المواد');
    await lockProducts(
      tx,
      hospitalId,
      issue.items.map((i) => i.productId),
    );
    const products = await tx.product.findMany({
      where: { hospitalId, id: { in: issue.items.map((i) => i.productId) } },
    });
    for (const product of products)
      await assertOwnedQuantity(
        tx,
        hospitalId,
        product.id,
        product.stockOnHand,
      );
    for (const item of issue.items) {
      const unitCost = item.unitCost!;
      const batchCost = item.batchUnitCost!;
      if (!item.batchNumber || !item.baseQuantity.eq(item.issuedQty))
        bad('بيانات تشغيلة الإذن غير سليمة');
      const out = await tx.stockTransaction.findMany({
        where: {
          hospitalId,
          stockIssueId: issueId,
          productId: item.productId,
          batchNumber: item.batchNumber,
          type: 'OUT',
        },
      });
      if (
        out.length !== 1 ||
        !out[0].quantity.eq(item.issuedQty) ||
        !out[0].totalCost.eq(item.totalCost!) ||
        !out[0].unitCost.eq(unitCost)
      )
        throw new ConflictException('تكلفة الإذن أو كمية الخروج غير متطابقة');
      const existing = await tx.productStock.findUnique({
        where: {
          warehouseId_productId_batchNumber: {
            warehouseId: issue.materialRequest.requestingWarehouseId,
            productId: item.productId,
            batchNumber: item.batchNumber,
          },
        },
      });
      if (
        existing &&
        (existing.hospitalId !== hospitalId ||
          existing.expiryDate?.getTime() !== item.expiryDate?.getTime() ||
          (existing.quantity.gt(0) && !existing.unitCost.eq(batchCost)))
      )
        throw new ConflictException(
          'التشغيلة في الوجهة مختلفة الصلاحية أو التكلفة؛تلزم المطابقة',
        );
      await tx.productStock.upsert({
        where: {
          warehouseId_productId_batchNumber: {
            warehouseId: issue.materialRequest.requestingWarehouseId,
            productId: item.productId,
            batchNumber: item.batchNumber,
          },
        },
        update: {
          quantity: { increment: item.issuedQty },
          unitCost: batchCost,
          version: { increment: 1 },
        },
        create: {
          hospitalId,
          warehouseId: issue.materialRequest.requestingWarehouseId,
          productId: item.productId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantity: item.issuedQty,
          unitCost: batchCost,
        },
      });
      await tx.stockTransaction.create({
        data: {
          hospitalId,
          warehouseId: issue.materialRequest.requestingWarehouseId,
          productId: item.productId,
          stockIssueId: issueId,
          type: 'IN',
          quantity: item.issuedQty,
          baseQuantity: item.issuedQty,
          unitCost,
          totalCost: item.totalCost!,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          referenceType: 'MATERIAL_RECEIVE',
          referenceId: issueId,
          createdById: userId,
        },
      });
    }
    await tx.stockIssue.update({
      where: { id: issueId },
      data: { status: 'RECEIVED' },
    });
    const auditEntry = await appendChainedAuditInTransaction(tx, {
      hospitalId,
      userId,
      action: 'RECEIVE_INTERNAL_TRANSFER',
      entity: 'StockIssue',
      entityId: issueId,
      details: { items: issue.items.length },
    });
    if (onAudit) onAudit(auditEntry);
    else committedAudit = auditEntry;
    return { success: true };
  };
  if (existingTx) return execute(existingTx);
  const outcome = await db.$transaction(execute, {
    maxWait: 10000,
    timeout: 20000,
  });
  if (committedAudit) publishCommittedCriticalAudit(committedAudit);
  return outcome;
}

export async function directMaterialTransfer(
  db: PrismaService,
  params: {
    hospitalId: number;
    userId: number;
    fromWarehouseId: number;
    toWarehouseId: number;
    requestKey?: string;
    notes?: string;
    items: Item[];
  },
) {
  const {
    hospitalId,
    userId,
    fromWarehouseId,
    toWarehouseId,
    requestKey,
    notes,
    items,
  } = params;
  if (
    !requestKey ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestKey,
    )
  )
    bad('يلزم مفتاح UUID للعملية');
  const fingerprint =
    'DIRECT:' +
    createHash('sha256')
      .update(
        JSON.stringify({
          fromWarehouseId,
          toWarehouseId,
          notes: notes ?? '',
          items: [...items].sort((a, b) => a.productId - b.productId),
        }),
      )
      .digest('hex');
  const committedAudits: Record<string, unknown>[] = [];
  const outcome = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      const replay = await tx.stockIssue.findFirst({
        where: { hospitalId, requestKey },
      });
      if (replay) {
        if (
          replay.requestFingerprint !== fingerprint ||
          replay.issuedById !== userId ||
          replay.status !== 'RECEIVED'
        )
          throw new ConflictException('مفتاح العملية مستخدم لتحويل آخر');
        return { success: true, transferRefId: replay.id };
      }
      const hospital = await tx.hospital.findUniqueOrThrow({
        where: { id: hospitalId },
        select: { organizationId: true },
      });
      if (hospital.organizationId) {
        const setting = await tx.orgSetting.findUnique({
          where: {
            organizationId_key: {
              organizationId: hospital.organizationId,
              key: 'require_material_request_approval',
            },
          },
        });
        if (setting?.value === 'true')
          bad(
            'التحويل المباشر غير متاح عند اشتراط اعتماد طلب المواد؛استخدم دورة الطلب والاعتماد',
          );
      }
      await transferWarehouses(tx, hospitalId, fromWarehouseId, toWarehouseId);
      await validateTransferRequest(
        tx,
        hospitalId,
        items.map((i) => ({
          productId: i.productId,
          requestedQty: i.quantity,
        })),
      );
      const mr = await tx.materialRequest.create({
        data: {
          hospitalId,
          requestNumber: `DT-${randomUUID()}`,
          requestingWarehouseId: toWarehouseId,
          fulfillingWarehouseId: fromWarehouseId,
          requestedById: userId,
          approvedById: userId,
          approvedAt: new Date(),
          status: 'APPROVED',
          notes,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              requestedQty: i.quantity,
            })),
          },
        },
      });
      const collectAudit = (entry: Record<string, unknown>) => {
        committedAudits.push(entry);
      };
      const issued = await issueMaterialTransfer(
        db,
        {
          hospitalId,
          userId,
          materialRequestId: mr.id,
          requestKey,
          notes,
          items,
        },
        tx,
        collectAudit,
      );
      await receiveMaterialTransfer(
        db,
        hospitalId,
        issued.stockIssueId,
        userId,
        tx,
        collectAudit,
      );
      await tx.stockIssue.update({
        where: { id: issued.stockIssueId },
        data: { requestFingerprint: fingerprint },
      });
      return { success: true, transferRefId: issued.stockIssueId };
    },
    { maxWait: 10000, timeout: 20000 },
  );
  for (const entry of committedAudits) publishCommittedCriticalAudit(entry);
  return outcome;
}
