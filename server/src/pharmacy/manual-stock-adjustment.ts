import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Money } from '../common/utils/money.util';
import { assertOwnedQuantity } from '../inventory/material-transfer';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { AccountingService } from '../accounting/accounting.service';

export type ManualAdjustment = {
  hospitalId: number;
  userId: number;
  drugItemId: number;
  type: 'IN' | 'ADJUST';
  quantity: number | string;
  batchNumber?: string;
  reason?: string;
  requestId?: string;
  unitCost?: number | string;
  expiryDate?: Date;
};
export async function adjustPharmacyStock(
  tx: Prisma.TransactionClient,
  params: ManualAdjustment,
  source: () => Promise<number>,
  accounting: AccountingService,
  onAudit?: (audit: Record<string, unknown>) => void,
) {
  const { hospitalId, userId, drugItemId } = params;
  if (params.type !== 'ADJUST')
    throw new BadRequestException(
      'التوريد يتطلب مستند شراء واستلام؛هذا المسار للتسوية فقط',
    );
  const text = String(params.quantity);
  const batch = params.batchNumber?.trim();
  const reason = params.reason?.trim();
  if (
    !/^-?(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(text) ||
    !batch ||
    batch.length > 100 ||
    !reason ||
    reason.length < 10 ||
    reason.length > 500 ||
    !params.requestId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      params.requestId,
    ) ||
    params.unitCost !== undefined ||
    params.expiryDate !== undefined
  )
    throw new BadRequestException(
      'يلزم تغير كمية دقيق وتشغيلة وسبب ومعرف عملية؛التكلفة والصلاحية لا تعدلان بالتسوية',
    );
  const delta = new Prisma.Decimal(text);
  if (delta.isZero())
    throw new BadRequestException('تغير الكمية لا يجوز أن يكون صفرًا');
  const requestKey = `pharmacy-adjust:${hospitalId}:${params.requestId.toLowerCase()}`;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        userId,
        drugItemId,
        quantity: delta.toFixed(3),
        batch,
        reason,
      }),
    )
    .digest('hex');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
  if (
    !(await tx.user.findFirst({
      where: { id: userId, hospitalId, isActive: true, isDeleted: false },
    }))
  )
    throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
  const existing = await tx.stockTransaction.findUnique({
    where: { manualRequestKey: requestKey },
  });
  if (existing) {
    if (existing.manualFingerprint !== fingerprint)
      throw new ConflictException('معرف العملية مستخدم لتسوية مختلفة');
    return existing;
  }
  const warehouseId = await source();
  const rows = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM "Product" WHERE id=${drugItemId} AND "hospitalId"=${hospitalId} AND "isActive"=true AND "isDeleted"=false AND type='DRUG' FOR UPDATE`;
  if (rows.length !== 1)
    throw new NotFoundException('الدواء غير متاح ضمن المنشأة');
  const product = await tx.product.findUniqueOrThrow({
    where: { id: drugItemId },
    include: { category: true },
  });
  if (
    product.hospitalId !== hospitalId ||
    (product.category &&
      (product.category.hospitalId !== hospitalId ||
        !product.category.isActive ||
        product.category.valuationMethod !== 'WEIGHTED_AVERAGE'))
  )
    throw new BadRequestException(
      'التسوية مدعومة للأصناف المملوكة بتقييم المتوسط المرجح فقط',
    );
  // Protect the reconciliation snapshot against older writers of batch balances.
  await tx.$queryRaw`SELECT id FROM "ProductStock" WHERE "productId"=${drugItemId} AND "hospitalId"=${hospitalId} ORDER BY id FOR UPDATE`;
  await assertOwnedQuantity(tx, hospitalId, drugItemId, product.stockOnHand);
  const stock = await tx.productStock.findUnique({
    where: {
      warehouseId_productId_batchNumber: {
        warehouseId,
        productId: drugItemId,
        batchNumber: batch,
      },
    },
  });
  if (!stock || stock.hospitalId !== hospitalId)
    throw new NotFoundException(
      'التشغيلة غير موجودة في مصدر الصيدلية؛لا تنشأ تشغيلة بالتسوية',
    );
  if (delta.gt(0) && stock.expiryDate && stock.expiryDate <= new Date())
    throw new BadRequestException(
      'زيادة رصيد منتهي تتطلب دورة حجر ومعالجة مستقلة',
    );
  const nextStock = stock.quantity.plus(delta);
  const nextTotal = product.stockOnHand.plus(delta);
  if (
    nextStock.lt(0) ||
    nextTotal.lt(0) ||
    nextStock.gte('1000000000000000') ||
    nextTotal.gte('1000000000000000')
  )
    throw new BadRequestException('التسوية تتجاوز رصيد أو سعة المخزون');
  if (!product.costPrice.isFinite() || product.costPrice.lt(0))
    throw new BadRequestException('تكلفة الصنف غير صالحة');
  // Difference of posted WAC values carries rounding residuals into the final removal.
  const valuationBefore = Money.toDbString(
    Money.multiply(product.costPrice, product.stockOnHand),
  );
  const valuationAfter = Money.toDbString(
    Money.multiply(product.costPrice, nextTotal),
  );
  const amount = Money.toDbString(
    Money.subtractDecimal(valuationAfter, valuationBefore),
  );
  const changed = await tx.productStock.updateMany({
    where: { id: stock.id, version: stock.version, quantity: stock.quantity },
    data: { quantity: nextStock, version: { increment: 1 } },
  });
  const summary = await tx.product.updateMany({
    where: {
      id: drugItemId,
      hospitalId,
      version: product.version,
      stockOnHand: product.stockOnHand,
    },
    data: { stockOnHand: nextTotal, version: { increment: 1 } },
  });
  if (changed.count !== 1 || summary.count !== 1)
    throw new ConflictException('تغير رصيد الصنف أثناء التسوية');
  const movement = await tx.stockTransaction.create({
    data: {
      hospitalId,
      warehouseId,
      productId: drugItemId,
      type: 'ADJUST',
      quantity: delta,
      baseQuantity: delta,
      unitCost: Money.toDbString(product.costPrice),
      totalCost: amount,
      batchNumber: batch,
      expiryDate: stock.expiryDate,
      referenceType: 'PHARMACY_ADJUSTMENT',
      notes: reason,
      createdById: userId,
      manualRequestKey: requestKey,
      manualFingerprint: fingerprint,
    },
  });
  await accounting.recordPharmacyAdjustmentEntry({
    tx,
    hospitalId,
    userId,
    movementId: movement.id,
    amount,
    inventoryAccountId: product.category?.inventoryAccountId ?? undefined,
  });
  const auditEntry = await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    action: 'ADJUST_PHARMACY_STOCK',
    entity: 'StockTransaction',
    entityId: movement.id,
    details: {
      requestId: params.requestId,
      reason,
      warehouseId,
      productId: drugItemId,
      batchNumber: batch,
      quantity: delta.toFixed(3),
      previousQuantity: stock.quantity.toFixed(3),
      quantityAfter: nextStock.toFixed(3),
      totalCost: amount,
      valuationBefore,
      valuationAfter,
    },
  });
  onAudit?.(auditEntry);
  return movement;
}
