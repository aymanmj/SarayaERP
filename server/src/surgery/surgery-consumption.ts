import { usableStockWhere } from '../inventory/stock-batch-safety';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Money } from '../common/utils/money.util';
import { assertOwnedQuantity } from '../inventory/material-transfer';
import { financialPeriod } from '../accounting/financial-posting';
import { mappedAccount } from '../purchases/purchase-return-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
export type SurgerySupplyInput = {
  hospitalId: number;
  userId: number;
  caseId: number;
  productId: number;
  quantity: string;
  requestId: string;
};
export async function consumeSurgerySupply(
  tx: Prisma.TransactionClient,
  input: SurgerySupplyInput,
  onAudit?: (fields: Record<string, unknown>) => void,
) {
  const { hospitalId, userId, caseId, productId, requestId, quantity } = input;
  if (
    typeof quantity !== 'string' ||
    !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(quantity) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId ?? '',
    ) ||
    ![hospitalId, userId, caseId, productId].every(
      (id) => Number.isInteger(id) && id > 0 && id <= 2147483647,
    )
  )
    throw new BadRequestException('يلزم صنف وكمية دقيقة ومعرف عملية صالح');
  const qty = new Prisma.Decimal(quantity);
  if (qty.lte(0)) throw new BadRequestException('الكمية يجب أن تكون موجبة');
  const requestKey = `surgery-consumable:${hospitalId}:${requestId.toLowerCase()}`;
  const requestFingerprint = createHash('sha256')
    .update(
      JSON.stringify({ userId, caseId, productId, quantity: qty.toFixed(3) }),
    )
    .digest('hex');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} AND "hospitalId"=${hospitalId} FOR SHARE`;
  if (
    !(await tx.user.findFirst({
      where: { id: userId, hospitalId, isActive: true, isDeleted: false },
    }))
  )
    throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
  const existing = await tx.surgeryConsumable.findUnique({
    where: { requestKey },
  });
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint)
      throw new ConflictException('معرف العملية مستخدم لطلب مختلف');
    return existing;
  }
  const identity = await tx.surgeryCase.findFirst({
    where: { id: caseId, hospitalId },
    include: { encounter: true },
  });
  if (!identity || identity.encounter.hospitalId !== hospitalId)
    throw new NotFoundException('العملية غير موجودة ضمن المنشأة');
  const patients = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM "Patient" WHERE id=${identity.encounter.patientId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
  if (patients.length !== 1)
    throw new BadRequestException('المريض خارج المنشأة');
  await tx.$queryRaw`SELECT id FROM "Encounter" WHERE id=${identity.encounterId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "SurgeryCase" WHERE id=${caseId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
  await tx.$queryRaw`SELECT t.id FROM "OperatingTheatre" t JOIN "SurgeryCase" s ON s."theatreId"=t.id WHERE s.id=${caseId} AND s."hospitalId"=${hospitalId} AND t."hospitalId"=${hospitalId} FOR SHARE OF t`;
  const surgery = await tx.surgeryCase.findFirstOrThrow({
    where: { id: caseId, hospitalId },
    include: { encounter: { include: { patient: true } }, theatre: true },
  });
  if (
    surgery.encounterId !== identity.encounterId ||
    surgery.encounter.patientId !== identity.encounter.patientId ||
    surgery.encounter.hospitalId !== hospitalId ||
    surgery.encounter.patient.hospitalId !== hospitalId ||
    !surgery.encounter.patient.isActive ||
    surgery.encounter.patient.isDeleted ||
    surgery.encounter.isDeleted ||
    surgery.encounter.status !== 'OPEN' ||
    surgery.theatre.hospitalId !== hospitalId ||
    !surgery.theatre.isActive ||
    !['SCHEDULED', 'IN_PROGRESS', 'RECOVERY'].includes(surgery.status)
  )
    throw new BadRequestException(
      'العملية أو الحالة أو المريض أو الغرفة غير متاح للصرف',
    );
  const policy = await tx.surgeryWarehousePolicy.findUnique({
    where: { hospitalId },
  });
  if (!policy)
    throw new BadRequestException(
      'يلزم تعيين مصدر مخزون العمليات صراحة قبل الصرف',
    );
  const warehouseId = policy.warehouseId;
  const warehouses = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM "Warehouse" WHERE id=${warehouseId} AND "hospitalId"=${hospitalId} AND "isActive"=true FOR SHARE`;
  if (warehouses.length !== 1)
    throw new BadRequestException('مصدر مخزون العمليات معطل أو خارج المنشأة');
  const rows = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM "Product" WHERE id=${productId} AND "hospitalId"=${hospitalId} AND "isActive"=true AND "isDeleted"=false AND type='SUPPLY' FOR UPDATE`;
  if (rows.length !== 1)
    throw new BadRequestException(
      'هذا المسار للمستلزمات النشطة؛الأدوية تتطلب دورة الصيدلية المعتمدة',
    );
  await tx.$queryRaw`SELECT c.id FROM "ItemCategory" c JOIN "Product" p ON p."categoryId"=c.id WHERE p.id=${productId} AND p."hospitalId"=${hospitalId} AND c."hospitalId"=${hospitalId} FOR SHARE OF c`;
  const product = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    include: { category: true },
  });
  if (
    product.category &&
    (product.category.hospitalId !== hospitalId ||
      !product.category.isActive ||
      product.category.valuationMethod !== 'WEIGHTED_AVERAGE')
  )
    throw new BadRequestException(
      'التقييم مدعوم للمتوسط المرجح ضمن المنشأة فقط',
    );
  if (product.costPrice.lt(0) || product.sellPrice.lt(0))
    throw new BadRequestException('التكلفة أو سعر البيع غير صالح');
  await tx.$queryRaw`SELECT id FROM "ProductStock" WHERE "productId"=${productId} AND "hospitalId"=${hospitalId} ORDER BY id FOR UPDATE`;
  await assertOwnedQuantity(tx, hospitalId, productId, product.stockOnHand);
  const now = new Date();
  const stocks = await tx.productStock.findMany({
    where: {
      ...(await usableStockWhere(tx, hospitalId, productId, now)),
      warehouseId,
      quantity: { gt: 0 },
    },
    orderBy: [
      { expiryDate: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
  const available = stocks.reduce(
    (sum, s) => sum.plus(s.quantity),
    new Prisma.Decimal(0),
  );
  if (available.lt(qty) || product.stockOnHand.lt(qty))
    throw new BadRequestException('رصيد المصدر غير المنتهي غير كاف');
  const next = product.stockOnHand.minus(qty);
  const beforeValue = Money.toDbString(
    Money.multiply(product.costPrice, product.stockOnHand),
  );
  const afterValue = Money.toDbString(Money.multiply(product.costPrice, next));
  const totalCost = Money.toDbString(
    Money.subtractDecimal(beforeValue, afterValue),
  );
  const totalPrice = Money.toDbString(Money.multiply(product.sellPrice, qty));
  const services = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM "ServiceItem" WHERE "hospitalId"=${hospitalId} AND code='SURGERY-CONS' AND "isActive"=true AND "isDeleted"=false AND type='SURGERY' FOR SHARE`;
  if (services.length !== 1)
    throw new BadRequestException(
      'يلزم تهيئة خدمة SURGERY-CONS من نوع العمليات قبل الصرف',
    );
  const { financialYear, period } = await financialPeriod(tx, hospitalId, now);
  const account = async (
    id: number | null | undefined,
    key: 'INVENTORY_SUPPLIES' | 'COGS_SUPPLIES',
    type: 'ASSET' | 'EXPENSE',
  ) => {
    const value = id
      ? await tx.account.findFirst({
          where: { id, hospitalId, isActive: true },
        })
      : await mappedAccount(tx, hospitalId, key);
    if (value)
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id=${value.id} AND "hospitalId"=${hospitalId} FOR SHARE`;
    const current = value
      ? await tx.account.findFirst({
          where: { id: value.id, hospitalId, isActive: true },
        })
      : null;
    if (!current || current.type !== type)
      throw new BadRequestException(
        'حساب المخزون أو تكلفة الاستهلاك غير مناسب',
      );
    return current.id;
  };
  const inventory = await account(
    product.category?.inventoryAccountId,
    'INVENTORY_SUPPLIES',
    'ASSET',
  );
  const expense = await account(
    product.category?.expenseAccountId,
    'COGS_SUPPLIES',
    'EXPENSE',
  );
  const consumable = await tx.surgeryConsumable.create({
    data: {
      surgeryCaseId: caseId,
      productId,
      quantity: qty,
      unitPrice: Money.toDbString(product.sellPrice),
      totalPrice,
      totalCost,
      sourceWarehouseId: warehouseId,
      recordedById: userId,
      requestKey,
      requestFingerprint,
      consumptionVersion: 1,
    },
  });
  let remaining = qty;
  const portions: {
    stock: (typeof stocks)[number];
    quantity: Prisma.Decimal;
  }[] = [];
  for (const stock of stocks) {
    if (remaining.isZero()) break;
    const take = Prisma.Decimal.min(remaining, stock.quantity);
    portions.push({ stock, quantity: take });
    remaining = remaining.minus(take);
  }
  const costs = Money.allocate(
    totalCost,
    portions.map((p) => p.quantity),
  );
  for (const [index, portion] of portions.entries()) {
    const { stock, quantity: take } = portion;
    const change = await tx.productStock.updateMany({
      where: {
        id: stock.id,
        hospitalId,
        version: stock.version,
        quantity: stock.quantity,
      },
      data: { quantity: { decrement: take }, version: { increment: 1 } },
    });
    if (change.count !== 1)
      throw new ConflictException('تغير رصيد التشغيلة أثناء الصرف');
    await tx.stockTransaction.create({
      data: {
        hospitalId,
        warehouseId,
        productId,
        type: 'OUT',
        quantity: take,
        baseQuantity: take,
        unitCost: Money.toDbString(product.costPrice),
        totalCost: costs[index],
        referenceType: 'SURGERY_CONSUMABLE',
        referenceId: consumable.id,
        createdById: userId,
        batchNumber: stock.batchNumber,
        expiryDate: stock.expiryDate,
      },
    });
  }
  const changed = await tx.product.updateMany({
    where: {
      id: productId,
      hospitalId,
      version: product.version,
      stockOnHand: product.stockOnHand,
    },
    data: { stockOnHand: next, version: { increment: 1 } },
  });
  if (changed.count !== 1)
    throw new ConflictException('تغير الرصيد الإجمالي أثناء الصرف');
  await tx.encounterCharge.create({
    data: {
      hospitalId,
      encounterId: surgery.encounterId,
      serviceItemId: services[0].id,
      sourceType: 'SURGERY_CONSUMABLE',
      sourceId: consumable.id,
      quantity: 1,
      unitPrice: totalPrice,
      totalAmount: totalPrice,
    },
  });
  if (Money.decimal(totalCost).gt(0))
    await tx.accountingEntry.create({
      data: {
        hospitalId,
        postingKey: `surgery-consumable:${hospitalId}:${consumable.id}`,
        sourceModule: 'INVENTORY',
        sourceId: consumable.id,
        entryDate: now,
        financialYearId: financialYear.id,
        financialPeriodId: period.id,
        createdById: userId,
        description: `استهلاك مستلزمات عملية #${caseId}`,
        lines: {
          create: [
            { accountId: expense, debit: totalCost, credit: '0.000' },
            { accountId: inventory, debit: '0.000', credit: totalCost },
          ],
        },
      },
    });
  const auditFields = {
    hospitalId,
    userId,
    action: 'DISPENSE_SURGERY_CONSUMABLE',
    entity: 'SurgeryConsumable',
    entityId: consumable.id,
    details: {
      caseId,
      encounterId: surgery.encounterId,
      productId,
      warehouseId,
      quantity: qty.toFixed(3),
      stockBefore: product.stockOnHand.toFixed(3),
      stockAfter: next.toFixed(3),
      totalCost,
      totalPrice,
      requestKey,
      movements: portions.map((p, i) => ({
        stockId: p.stock.id,
        quantity: p.quantity.toFixed(3),
        totalCost: costs[i],
      })),
    },
  };
  await appendChainedAuditInTransaction(tx, auditFields);
  onAudit?.(auditFields);
  return consumable;
}
