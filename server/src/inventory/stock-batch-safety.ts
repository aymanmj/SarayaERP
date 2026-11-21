import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InventoryBatchStatus, Prisma } from '@prisma/client';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { TimeZoneUtils } from '../common/utils/date.util';

export async function usableStockWhere(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  productId: number,
  now = new Date(),
): Promise<Prisma.ProductStockWhereInput> {
  const facility = await tx.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { organization: { select: { timezone: true } } },
  });
  const date = TimeZoneUtils.localDateKey(now, facility.organization?.timezone);
  const blocked = await tx.inventoryBatchRestriction.findMany({
    where: { hospitalId, productId, status: { not: 'RELEASED' } },
    select: { batchNumber: true },
  });
  return {
    hospitalId,
    productId,
    AND: [
      {
        OR: [
          { expiryDate: null },
          { expiryDate: { gt: now } },
          { expiryDate: new Date(`${date}T00:00:00.000Z`) },
        ],
      },
      ...(blocked.length
        ? [
            {
              OR: [
                { batchNumber: null },
                {
                  batchNumber: {
                    notIn: blocked.map(({ batchNumber }) => batchNumber),
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };
}

export async function changeBatchRestriction(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  userId: number,
  stockId: number,
  status: InventoryBatchStatus,
  rawReason: string,
) {
  const reason = rawReason.trim();
  if (reason.length < 5 || reason.length > 1000)
    throw new BadRequestException('يلزم توثيق سبب الإجراء على التشغيلة');

  const stock = await tx.productStock.findFirst({
    where: { hospitalId, id: stockId },
    select: { productId: true, batchNumber: true },
  });
  if (!stock) throw new NotFoundException('التشغيلة غير موجودة في المنشأة');
  const batchNumber = stock.batchNumber?.trim();
  if (!batchNumber || batchNumber.length > 200 || batchNumber === 'GENERAL')
    throw new BadRequestException('يلزم رقم تشغيلة قابل للتتبع');

  const rows = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM "Product" WHERE id = ${stock.productId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
  if (rows.length !== 1)
    throw new NotFoundException('الصنف غير موجود في المنشأة');
  const identity = { hospitalId, productId: stock.productId, batchNumber };
  const where = { hospitalId_productId_batchNumber: identity };
  const current = await tx.inventoryBatchRestriction.findUnique({ where });
  if (current?.status === status) return current;
  if (
    current?.status === 'RECALLED' ||
    (status === 'RELEASED' && current?.status !== 'QUARANTINED')
  )
    throw new ConflictException('هذا الإجراء غير مسموح لحالة التشغيلة الحالية');

  const result = current
    ? await tx.inventoryBatchRestriction.update({
        where,
        data: { status, reason },
      })
    : await tx.inventoryBatchRestriction.create({
        data: { ...identity, status, reason },
      });
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    action: 'INVENTORY_BATCH_SAFETY',
    entity: 'Product',
    entityId: stock.productId,
    details: {
      batchNumber,
      previousStatus: current?.status ?? null,
      status,
      reason,
    },
  });
  return result;
}
