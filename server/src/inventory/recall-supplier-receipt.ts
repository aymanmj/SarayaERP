import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { recalledBatch } from './recall-followup';

export type SupplierReceiptInput = {
  quantity: string;
  evidenceReference: string;
  receivedBy: string;
  receivedAt: string;
  requestId: string;
};

type ReturnMovement = {
  returnId: number;
  quantity: Prisma.Decimal;
  supplier: string;
};

async function returnMovement(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  stockId: number,
  movementId: number,
  lock = false,
) {
  const { key } = await recalledBatch(tx, hospitalId, stockId);
  const [movement] = await tx.$queryRaw<ReturnMovement[]>`
    SELECT ret.id AS "returnId", m.quantity, s.name AS supplier
    FROM "StockTransaction" m
    JOIN "PurchaseReturn" ret ON ret.id = m."purchaseReturnId" AND ret."hospitalId" = m."hospitalId"
      AND ret.status = 'COMPLETED' AND ret."accountingEntryId" IS NOT NULL
      AND ret."purchaseInvoiceId" = m."purchaseInvoiceId"
    JOIN "Supplier" s ON s.id = ret."supplierId" AND s."hospitalId" = m."hospitalId"
    WHERE m.id = ${movementId} AND m."hospitalId" = ${hospitalId} AND m."productId" = ${key.productId}
      AND btrim(m."batchNumber") = ${key.batchNumber} AND m."referenceType" = 'PURCHASE_RETURN'
      AND m."referenceId" = ret.id AND m.type = 'OUT' AND m.quantity > 0 AND m.quantity = m."baseQuantity"
    ${lock ? Prisma.sql`FOR UPDATE OF m` : Prisma.empty}
  `;
  if (!movement)
    throw new NotFoundException(
      'لا توجد حركة مرتجع مرحّلة مرتبطة بالتشغيلة المستدعاة',
    );
  return movement;
}

async function acknowledgedQuantity(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  movementId: number,
) {
  const quantity = await tx.inventoryRecallSupplierReceipt.aggregate({
    where: { hospitalId, movementId },
    _sum: { quantity: true },
  });
  return quantity._sum.quantity ?? new Prisma.Decimal(0);
}

const supplierReceiptSummary = {
  id: true,
  movementId: true,
  quantity: true,
  evidenceReference: true,
  receivedBy: true,
  receivedAt: true,
  recordedAt: true,
  recordedById: true,
} satisfies Prisma.InventoryRecallSupplierReceiptSelect;

export async function readRecallSupplierReceipts(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  stockId: number,
  movementId: number,
  before?: number,
) {
  const movement = await returnMovement(tx, hospitalId, stockId, movementId);
  const acknowledged = await acknowledgedQuantity(tx, hospitalId, movementId);
  const records = await tx.inventoryRecallSupplierReceipt.findMany({
    where: {
      hospitalId,
      movementId,
      id: before === undefined ? undefined : { lt: before },
    },
    orderBy: { id: 'desc' },
    take: 51,
    select: supplierReceiptSummary,
  });
  return {
    returnId: movement.returnId,
    supplier: movement.supplier,
    returnedQuantity: movement.quantity.toString(),
    acknowledgedQuantity: acknowledged.toString(),
    outstandingQuantity: movement.quantity.minus(acknowledged).toString(),
    records: records.slice(0, 50),
    nextBefore: records.length > 50 ? records[49].id : null,
  };
}

export async function recordRecallSupplierReceipt(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  actorId: number,
  stockId: number,
  movementId: number,
  input: SupplierReceiptInput,
) {
  const evidenceReference = input.evidenceReference.trim();
  const receivedBy = input.receivedBy.trim();
  const receivedAt = new Date(input.receivedAt);
  if (
    !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(input.quantity) ||
    evidenceReference.length < 3 ||
    evidenceReference.length > 200 ||
    receivedBy.length < 2 ||
    receivedBy.length > 200 ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(input.receivedAt) ||
    !Number.isFinite(receivedAt.getTime()) ||
    receivedAt > new Date()
  )
    throw new BadRequestException(
      'يلزم توثيق وقت التسليم ومرجعه والجهة المستلمة والكمية',
    );
  const quantity = new Prisma.Decimal(input.quantity);
  if (!quantity.gt(0))
    throw new BadRequestException('كمية التسليم يجب أن تكون موجبة');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27017, ${hospitalId}::int)`;
  const movement = await returnMovement(
    tx,
    hospitalId,
    stockId,
    movementId,
    true,
  );
  const replay = await tx.inventoryRecallSupplierReceipt.findUnique({
    where: { hospitalId_requestId: { hospitalId, requestId: input.requestId } },
    select: supplierReceiptSummary,
  });
  if (replay) {
    if (
      replay.movementId !== movementId ||
      replay.recordedById !== actorId ||
      replay.evidenceReference !== evidenceReference ||
      replay.receivedBy !== receivedBy ||
      replay.receivedAt.getTime() !== receivedAt.getTime() ||
      !replay.quantity.eq(quantity)
    )
      throw new ConflictException('معرّف الطلب مرتبط بإثبات تسليم آخر');
    return replay;
  }
  if (
    await tx.inventoryRecallSupplierReceipt.findUnique({
      where: {
        movementId_evidenceReference: { movementId, evidenceReference },
      },
      select: { id: true },
    })
  )
    throw new ConflictException('مرجع الإثبات مسجل لهذه الحركة');
  const acknowledged = await acknowledgedQuantity(tx, hospitalId, movementId);
  if (acknowledged.plus(quantity).gt(movement.quantity))
    throw new BadRequestException('كمية التسليم تتجاوز المتبقي من المرتجع');
  const result = await tx.inventoryRecallSupplierReceipt.create({
    data: {
      hospitalId,
      movementId,
      requestId: input.requestId,
      quantity,
      evidenceReference,
      receivedBy,
      receivedAt,
      recordedById: actorId,
    },
    select: supplierReceiptSummary,
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId: actorId,
    action: 'RECORD_RECALL_SUPPLIER_RECEIPT',
    entity: 'InventoryRecallSupplierReceipt',
    entityId: result.id,
    details: {
      movementId,
      purchaseReturnId: movement.returnId,
      quantity: quantity.toString(),
      receivedAt: receivedAt.toISOString(),
    },
  });
  return result;
}
