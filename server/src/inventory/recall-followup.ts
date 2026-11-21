import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RecallContactAudience,
  RecallContactChannel,
  RecallContactOutcome,
} from '@prisma/client';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';

export async function recalledBatch(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  stockId: number,
) {
  const stock = await tx.productStock.findFirst({
    where: {
      id: stockId,
      hospitalId,
      product: { hospitalId },
      warehouse: { hospitalId },
    },
    select: { productId: true, batchNumber: true },
  });
  const batchNumber = stock?.batchNumber?.trim();
  if (!stock || !batchNumber)
    throw new NotFoundException('التشغيلة غير موجودة');
  const key = { hospitalId, productId: stock.productId, batchNumber };
  const recall = await tx.inventoryBatchRestriction.findUnique({
    where: { hospitalId_productId_batchNumber: key },
  });
  if (recall?.status !== 'RECALLED')
    throw new NotFoundException('لم تسجل حالة استدعاء لهذه التشغيلة');
  return { key, recall };
}

type TraceRow = {
  id: number;
  createdAt: Date;
  quantity: string;
  referenceType: string | null;
  referenceId: number | null;
  sourceWarehouse: string | null;
  targetWarehouse: string | null;
  department: string | null;
  transferStatus: string | null;
  linked: boolean;
  encounterId: number | null;
  patient: string | null;
  mrn: string | null;
  patientTargetId: number | null;
  departmentTargetId: number | null;
  patientOutcome: RecallContactOutcome | null;
  departmentOutcome: RecallContactOutcome | null;
  canRecordSupplierReceipt: boolean;
};

async function recallMovements(
  tx: Prisma.TransactionClient,
  key: { hospitalId: number; productId: number; batchNumber: string },
  showPatient: boolean,
  filter: Prisma.Sql,
) {
  return tx.$queryRaw<TraceRow[]>`
    WITH movements AS (
      SELECT * FROM "StockTransaction" m WHERE m."hospitalId" = ${key.hospitalId} AND m."productId" = ${key.productId}
        AND btrim(m."batchNumber") = ${key.batchNumber}
        AND (m.type = 'OUT' OR m."referenceType" = 'MATERIAL_RECEIVE')
        ${filter}
      ORDER BY m.id DESC LIMIT 51
    )
    SELECT m.id, m."createdAt", m.quantity::text, m."referenceType", m."referenceId",
      COALESCE(origin.name, w.name) AS "sourceWarehouse", destination.name AS "targetWarehouse",
      d.name AS department, si.status::text AS "transferStatus",
      (p.id IS NOT NULL OR mr.id IS NOT NULL OR ret.id IS NOT NULL OR disposal.id IS NOT NULL) AS linked,
      CASE WHEN ${showPatient} AND p.id IS NOT NULL THEN e.id END AS "encounterId",
      CASE WHEN ${showPatient} THEN p."fullName" END AS patient,
      CASE WHEN ${showPatient} THEN p.mrn END AS mrn,
      CASE WHEN ${showPatient} THEN p.id END AS "patientTargetId",
      d.id AS "departmentTargetId",
      patient_contact.outcome AS "patientOutcome", department_contact.outcome AS "departmentOutcome",
      COALESCE(ret.status = 'COMPLETED' AND ret."accountingEntryId" IS NOT NULL
        AND m."referenceId" = ret.id AND m."purchaseInvoiceId" = ret."purchaseInvoiceId"
        AND m.type = 'OUT' AND m.quantity > 0 AND m.quantity = m."baseQuantity", false) AS "canRecordSupplierReceipt"
    FROM movements m
    LEFT JOIN "Warehouse" w ON w.id = m."warehouseId" AND w."hospitalId" = m."hospitalId"
    LEFT JOIN "DispenseRecord" dr ON dr.id = m."dispenseRecordId" AND dr."hospitalId" = m."hospitalId"
      AND m."referenceType" IN ('DISPENSE','DISPENSE_POS')
    LEFT JOIN "Prescription" rx ON rx.id = dr."prescriptionId" AND rx."hospitalId" = m."hospitalId"
    LEFT JOIN "SurgeryConsumable" sc ON m."referenceType" = 'SURGERY_CONSUMABLE'
      AND sc.id = m."referenceId" AND sc."productId" = m."productId"
    LEFT JOIN "SurgeryCase" surgery ON surgery.id = sc."surgeryCaseId" AND surgery."hospitalId" = m."hospitalId"
    LEFT JOIN "LabOrder" l ON m."referenceType" = 'LAB_ORDER' AND l.id = m."referenceId"
    LEFT JOIN "RadiologyOrder" r ON m."referenceType" = 'RADIOLOGY_ORDER' AND r.id = m."referenceId"
    LEFT JOIN "Order" o ON o.id = COALESCE(l."orderId", r."orderId") AND o."hospitalId" = m."hospitalId"
    LEFT JOIN "Encounter" e ON e.id = COALESCE(rx."encounterId", surgery."encounterId", o."encounterId")
      AND e."hospitalId" = m."hospitalId" AND (rx.id IS NULL OR rx."patientId" = e."patientId")
    LEFT JOIN "Patient" p ON p.id = e."patientId" AND p."hospitalId" = m."hospitalId"
    LEFT JOIN "StockIssue" si ON si.id = m."stockIssueId" AND si."hospitalId" = m."hospitalId"
      AND m."referenceType" IN ('MATERIAL_ISSUE','MATERIAL_RECEIVE')
    LEFT JOIN "MaterialRequest" mr ON mr.id = si."materialRequestId" AND mr."hospitalId" = m."hospitalId"
    LEFT JOIN "Warehouse" origin ON origin.id = si."issuedFromId" AND origin."hospitalId" = m."hospitalId"
    LEFT JOIN "Warehouse" destination ON destination.id = mr."requestingWarehouseId" AND destination."hospitalId" = m."hospitalId"
    LEFT JOIN "Department" d ON d.id = COALESCE(mr."fromDepartmentId", e."departmentId") AND d."hospitalId" = m."hospitalId"
    LEFT JOIN "PurchaseReturn" ret ON ret.id = m."purchaseReturnId" AND ret."hospitalId" = m."hospitalId"
      AND m."referenceType" = 'PURCHASE_RETURN'
    LEFT JOIN "InventoryRecallDisposal" disposal ON disposal."movementId" = m.id AND disposal."hospitalId" = m."hospitalId"
      AND disposal.id = m."referenceId" AND disposal.status = 'POSTED' AND m."referenceType" = 'RECALL_DISPOSAL'
    LEFT JOIN LATERAL (
      SELECT c.outcome::text AS outcome FROM "InventoryRecallContact" c WHERE ${showPatient} AND c."hospitalId" = m."hospitalId"
        AND c."productId" = m."productId" AND c."batchNumber" = ${key.batchNumber} AND c.audience = 'PATIENT'
        AND c."targetId" = p.id ORDER BY c.id DESC LIMIT 1
    ) patient_contact ON true
    LEFT JOIN LATERAL (
      SELECT c.outcome::text AS outcome FROM "InventoryRecallContact" c WHERE c."hospitalId" = m."hospitalId"
        AND c."productId" = m."productId" AND c."batchNumber" = ${key.batchNumber} AND c.audience = 'DEPARTMENT'
        AND c."targetId" = d.id ORDER BY c.id DESC LIMIT 1
    ) department_contact ON true
    ORDER BY m.id DESC
  `;
}

export async function readRecallFollowup(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  userId: number,
  stockId: number,
  showPatient: boolean,
  before?: number,
) {
  const { key, recall } = await recalledBatch(tx, hospitalId, stockId);
  const stockIds = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM "ProductStock" WHERE "hospitalId" = ${hospitalId} AND "productId" = ${key.productId}
      AND btrim("batchNumber") = ${key.batchNumber}
  `;
  const stocks = await tx.productStock.findMany({
    where: {
      id: { in: stockIds.map(({ id }) => id) },
      hospitalId,
      warehouse: { hospitalId },
    },
    select: {
      id: true,
      version: true,
      quantity: true,
      warehouse: { select: { id: true, name: true } },
      recallIsolationChecks: {
        where: { hospitalId },
        orderBy: { id: 'desc' },
        take: 1,
        select: {
          id: true,
          stockVersion: true,
          onHand: true,
          isolatedQuantity: true,
          location: true,
          reason: true,
          recordedAt: true,
          recordedById: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });
  const rows = await recallMovements(
    tx,
    key,
    showPatient,
    before === undefined ? Prisma.empty : Prisma.sql`AND m.id < ${before}`,
  );
  const movements = rows.slice(0, 50);
  if (showPatient && movements.some((row) => row.encounterId !== null)) {
    await appendChainedAuditInTransaction(tx, {
      hospitalId,
      userId,
      action: 'READ_RECALL_PATIENT_TRACE',
      entity: 'Product',
      entityId: key.productId,
      details: {
        batchNumber: key.batchNumber,
        before: before ?? null,
        rows: movements.length,
      },
    });
  }
  return {
    batchNumber: key.batchNumber,
    recalledAt: recall.updatedAt,
    reason: recall.reason,
    canViewPatientIdentity: showPatient,
    stocks: stocks.map(({ recallIsolationChecks, ...stock }) => {
      const check = recallIsolationChecks[0] ?? null;
      const isolationCurrent =
        check?.stockVersion === stock.version &&
        check.onHand.eq(stock.quantity);
      return {
        ...stock,
        latestIsolation: check,
        isolationCurrent,
        unverifiedQuantity: stock.quantity
          .minus(isolationCurrent ? check.isolatedQuantity : 0)
          .toString(),
      };
    }),
    movements: movements.map(
      ({ patientTargetId, departmentTargetId, ...movement }) => ({
        ...movement,
        canContactPatient: patientTargetId !== null,
        canContactDepartment: departmentTargetId !== null,
      }),
    ),
    nextBefore: rows.length > 50 ? movements[49].id : null,
  };
}

export type RecallContactInput = {
  audience: RecallContactAudience;
  outcome: RecallContactOutcome;
  channel: RecallContactChannel;
  note: string;
  requestId: string;
};

async function contactTarget(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  stockId: number,
  movementId: number,
  audience: RecallContactAudience,
  showPatient: boolean,
) {
  if (audience === 'PATIENT' && !showPatient)
    throw new ForbiddenException('يلزم تصريح عرض المرضى لمتابعة إبلاغ المريض');
  const { key } = await recalledBatch(tx, hospitalId, stockId);
  const [movement] = await recallMovements(
    tx,
    key,
    audience === 'PATIENT',
    Prisma.sql`AND m.id = ${movementId}`,
  );
  const targetId =
    audience === 'PATIENT'
      ? movement?.patientTargetId
      : movement?.departmentTargetId;
  if (!targetId)
    throw new NotFoundException(
      'لا توجد جهة مرتبطة بهذه الحركة من التشغيلة المستدعاة',
    );
  return { ...key, audience, targetId };
}

const contactSummary = {
  id: true,
  movementId: true,
  outcome: true,
  channel: true,
  note: true,
  recordedAt: true,
  recordedById: true,
} satisfies Prisma.InventoryRecallContactSelect;

export async function readRecallContacts(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  actorId: number,
  stockId: number,
  movementId: number,
  audience: RecallContactAudience,
  showPatient: boolean,
  before?: number,
) {
  const target = await contactTarget(
    tx,
    hospitalId,
    stockId,
    movementId,
    audience,
    showPatient,
  );
  const records = await tx.inventoryRecallContact.findMany({
    where: { ...target, id: before === undefined ? undefined : { lt: before } },
    orderBy: { id: 'desc' },
    take: 51,
    select: contactSummary,
  });
  if (audience === 'PATIENT') {
    await appendChainedAuditInTransaction(tx, {
      hospitalId,
      userId: actorId,
      action: 'READ_RECALL_CONTACT_HISTORY',
      entity: 'StockTransaction',
      entityId: movementId,
      details: { before: before ?? null, rows: Math.min(records.length, 50) },
    });
  }
  return {
    records: records.slice(0, 50),
    nextBefore: records.length > 50 ? records[49].id : null,
  };
}

export async function recordRecallContact(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  actorId: number,
  stockId: number,
  movementId: number,
  showPatient: boolean,
  input: RecallContactInput,
) {
  const note = input.note.trim();
  if (
    note.length < 5 ||
    note.length > 1000 ||
    (input.audience === 'PATIENT' && input.channel === 'INTERNAL_HANDOFF')
  )
    throw new BadRequestException('يلزم توثيق نتيجة التواصل بقناة ملائمة');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27016, ${hospitalId}::int)`;
  const target = await contactTarget(
    tx,
    hospitalId,
    stockId,
    movementId,
    input.audience,
    showPatient,
  );
  const replay = await tx.inventoryRecallContact.findUnique({
    where: { hospitalId_requestId: { hospitalId, requestId: input.requestId } },
    select: { ...contactSummary, audience: true, targetId: true },
  });
  if (replay) {
    if (
      replay.recordedById !== actorId ||
      replay.movementId !== movementId ||
      replay.audience !== input.audience ||
      replay.targetId !== target.targetId ||
      replay.outcome !== input.outcome ||
      replay.channel !== input.channel ||
      replay.note !== note
    )
      throw new ConflictException('معرّف الطلب مرتبط بمحضر إبلاغ آخر');
    return {
      id: replay.id,
      movementId: replay.movementId,
      outcome: replay.outcome,
      channel: replay.channel,
      note: replay.note,
      recordedAt: replay.recordedAt,
      recordedById: replay.recordedById,
    };
  }
  const previous = await tx.inventoryRecallContact.findFirst({
    where: target,
    orderBy: { id: 'desc' },
    select: { outcome: true },
  });
  if (
    previous?.outcome === 'RESOLVED' ||
    (previous?.outcome === 'NOTIFIED' && input.outcome !== 'RESOLVED') ||
    (input.outcome === 'RESOLVED' && previous?.outcome !== 'NOTIFIED')
  )
    throw new ConflictException(
      'تغيّرت نتيجة المتابعة أو يلزم توثيق الإبلاغ أولًا',
    );
  const result = await tx.inventoryRecallContact.create({
    data: {
      ...target,
      movementId,
      outcome: input.outcome,
      channel: input.channel,
      note,
      recordedById: actorId,
      requestId: input.requestId,
    },
    select: contactSummary,
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId: actorId,
    action: 'RECORD_RECALL_CONTACT',
    entity: 'InventoryRecallContact',
    entityId: result.id,
    details: {
      movementId,
      audience: input.audience,
      outcome: input.outcome,
      channel: input.channel,
    },
  });
  return result;
}

export type RecallIsolationInput = {
  stockVersion: number;
  isolatedQuantity: string;
  location: string;
  reason: string;
  requestId: string;
};

export async function recordRecallIsolation(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  userId: number,
  stockId: number,
  input: RecallIsolationInput,
) {
  const { key } = await recalledBatch(tx, hospitalId, stockId);
  const location = input.location.trim();
  const reason = input.reason.trim();
  if (
    location.length < 2 ||
    reason.length < 5 ||
    !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(input.isolatedQuantity)
  )
    throw new BadRequestException('يلزم موقع العزل وسبب الإجراء وكمية صحيحة');
  const quantity = new Prisma.Decimal(input.isolatedQuantity);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27015, ${hospitalId}::int)`;
  await tx.$queryRaw`SELECT id FROM "Product" WHERE "hospitalId" = ${hospitalId} AND id = ${key.productId} FOR UPDATE`;
  const replay = await tx.inventoryRecallIsolation.findUnique({
    where: { hospitalId_requestId: { hospitalId, requestId: input.requestId } },
  });
  if (replay) {
    if (
      replay.stockId !== stockId ||
      replay.recordedById !== userId ||
      replay.stockVersion !== input.stockVersion ||
      replay.location !== location ||
      replay.reason !== reason ||
      !replay.isolatedQuantity.eq(quantity)
    )
      throw new ConflictException('معرّف الطلب مرتبط بإثبات عزل آخر');
    return replay;
  }
  const stock = await tx.productStock.findFirstOrThrow({
    where: { hospitalId, productId: key.productId, id: stockId },
  });
  if (stock.batchNumber?.trim() !== key.batchNumber)
    throw new ConflictException('تغيرت هوية التشغيلة');
  if (stock.version !== input.stockVersion)
    throw new ConflictException(
      'تغيّر الرصيد؛ حدّث بيانات التشغيلة قبل تسجيل العزل',
    );
  if (quantity.gt(stock.quantity))
    throw new BadRequestException('الكمية المعزولة تتجاوز الرصيد الدفتري');
  const result = await tx.inventoryRecallIsolation.create({
    data: {
      hospitalId,
      stockId,
      recordedById: userId,
      requestId: input.requestId,
      stockVersion: stock.version,
      onHand: stock.quantity,
      isolatedQuantity: quantity,
      location,
      reason,
    },
  });
  await appendChainedAuditInTransaction(tx, {
    hospitalId,
    userId,
    action: 'RECORD_RECALL_ISOLATION',
    entity: 'InventoryRecallIsolation',
    entityId: result.id,
    details: {
      stockId,
      productId: key.productId,
      batchNumber: key.batchNumber,
      stockVersion: stock.version,
      onHand: stock.quantity.toString(),
      isolatedQuantity: quantity.toString(),
      location,
      reason,
    },
  });
  return result;
}
