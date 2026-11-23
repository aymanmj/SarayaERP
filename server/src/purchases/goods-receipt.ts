import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Money } from '../common/utils/money.util';
import { financialPeriod } from '../accounting/financial-posting';
import { inventoryKey, mappedAccount } from './purchase-return-posting';
import { assertOwnedQuantity } from '../inventory/material-transfer';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';

export type ReceiptInput = {
  hospitalId: number;
  userId: number;
  poId: number;
  warehouseId: number;
  requestId?: string;
  notes?: string;
  items: {
    purchaseOrderItemId?: number;
    productId: number;
    uomId: number;
    quantity: number | string;
    batchNumber: string;
    expiryDate: Date | string;
  }[];
};
export async function receiveGoods(
  tx: Prisma.TransactionClient,
  data: ReceiptInput,
  onAudit?: (audit: Record<string, unknown>) => void,
) {
  if (
    !data.requestId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.requestId,
    ) ||
    !data.items.length ||
    data.items.length > 100 ||
    new Set(data.items.map((i) => i.purchaseOrderItemId)).size !==
      data.items.length
  )
    throw new BadRequestException('يلزم معرف عملية وقائمة بنود طلب فريدة');
  const items = data.items
    .map((i) => {
      if (
        !i.purchaseOrderItemId ||
        !Number.isInteger(i.purchaseOrderItemId) ||
        !i.batchNumber?.trim() ||
        i.batchNumber.trim().length > 100 ||
        !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(String(i.quantity)) ||
        new Prisma.Decimal(i.quantity).lte(0)
      )
        throw new BadRequestException('بيانات بند الاستلام غير صالحة');
      const date = new Date(i.expiryDate);
      if (!Number.isFinite(date.getTime()))
        throw new BadRequestException('تاريخ صلاحية غير صالح');
      return {
        ...i,
        purchaseOrderItemId: i.purchaseOrderItemId,
        quantity: new Prisma.Decimal(i.quantity).toFixed(3),
        batchNumber: i.batchNumber.trim(),
        expiryDate: date.toISOString(),
      };
    })
    .sort((a, b) => a.purchaseOrderItemId - b.purchaseOrderItemId);
  if (data.notes && data.notes.trim().length > 500)
    throw new BadRequestException('ملاحظات الاستلام تتجاوز الحد');
  const requestKey = `grn:${data.hospitalId}:${data.requestId.toLowerCase()}`;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        userId: data.userId,
        poId: data.poId,
        warehouseId: data.warehouseId,
        notes: data.notes?.trim() ?? '',
        items,
      }),
    )
    .digest('hex');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${data.hospitalId}::integer)`;
  if (
    !(await tx.user.findFirst({
      where: {
        id: data.userId,
        hospitalId: data.hospitalId,
        isActive: true,
        isDeleted: false,
      },
    }))
  )
    throw new NotFoundException('المستخدم غير نشط أو خارج المنشأة');
  const existing = await tx.goodsReceipt.findUnique({ where: { requestKey } });
  if (existing) {
    if (existing.requestFingerprint !== fingerprint)
      throw new ConflictException('معرف الاستلام مستخدم لطلب مختلف');
    return existing;
  }
  await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id=${data.poId} AND "hospitalId"=${data.hospitalId} FOR UPDATE`;
  const po = await tx.purchaseOrder.findFirst({
    where: { id: data.poId, hospitalId: data.hospitalId },
    include: { items: true },
  });
  if (!po) throw new NotFoundException('أمر الشراء غير موجود ضمن المنشأة');
  if (!['SENT', 'PARTIALLY_RECEIVED'].includes(po.status))
    throw new BadRequestException('حالة أمر الشراء لا تسمح بالاستلام');
  if (
    !(await tx.supplier.findFirst({
      where: { id: po.supplierId, hospitalId: data.hospitalId, isActive: true },
    }))
  )
    throw new BadRequestException('مورد أمر الشراء غير نشط أو خارج المنشأة');
  const warehouses = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM "Warehouse" WHERE id=${data.warehouseId} AND "hospitalId"=${data.hospitalId} AND "isActive"=true FOR SHARE`;
  if (warehouses.length !== 1)
    throw new BadRequestException('المخزن غير نشط أو خارج المنشأة');
  const prior = await tx.goodsReceiptItem.findMany({
    where: {
      goodsReceipt: {
        purchaseOrderId: po.id,
        hospitalId: data.hospitalId,
        status: 'COMPLETED',
      },
    },
    include: { goodsReceipt: { select: { receiptVersion: true } } },
  });
  if (prior.some((p) => p.goodsReceipt.receiptVersion !== 1))
    throw new ConflictException(
      'الاستلام السابق يحتاج مطابقة قبل استلام إضافي',
    );
  const productIds = [...new Set(items.map((i) => i.productId))].sort(
    (a, b) => a - b,
  );
  for (const id of productIds)
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id} AND "hospitalId"=${data.hospitalId} FOR UPDATE`;
  for (const id of productIds)
    await tx.$queryRaw`SELECT id FROM "ProductStock" WHERE "productId"=${id} AND "hospitalId"=${data.hospitalId} ORDER BY id FOR UPDATE`;
  const { financialYear, period } = await financialPeriod(
    tx,
    data.hospitalId,
    new Date(),
  );
  const suspense = await mappedAccount(tx, data.hospitalId, 'GRN_SUSPENSE');
  if (suspense.type !== 'LIABILITY')
    throw new BadRequestException('حساب وسيط الاستلام يجب أن يكون التزامًا');
  const grn = await tx.goodsReceipt.create({
    data: {
      hospitalId: data.hospitalId,
      purchaseOrderId: po.id,
      warehouseId: data.warehouseId,
      receivedById: data.userId,
      status: 'COMPLETED',
      notes: data.notes?.trim(),
      receiptVersion: 1,
      requestKey,
      requestFingerprint: fingerprint,
    },
  });
  await tx.goodsReceipt.update({
    where: { id: grn.id },
    data: { grnNumber: `GRN-${String(grn.id).padStart(8, '0')}` },
  });
  const debits = new Map<number, string>();
  const residuals: { productId: number; amount: string }[] = [];
  let total = '0.000';
  for (const item of items) {
    const order = po.items.find((l) => l.id === item.purchaseOrderItemId);
    if (
      !order ||
      order.productId !== item.productId ||
      order.uomId !== item.uomId
    )
      throw new BadRequestException(
        'الاستلام يجب أن يطابق بند أمر الشراء ووحدته',
      );
    if (
      !(await tx.unitOfMeasure.findFirst({
        where: { id: item.uomId, hospitalId: data.hospitalId, isActive: true },
      }))
    )
      throw new BadRequestException('وحدة طلب غير نشطة أو خارج المنشأة');
    const quantity = new Prisma.Decimal(item.quantity);
    if (
      order.quantity.lte(0) ||
      order.baseQuantity.lte(0) ||
      order.unitPrice.lt(0) ||
      order.receivedQuantity.lt(0) ||
      quantity.plus(order.receivedQuantity).gt(order.quantity)
    )
      throw new BadRequestException(
        'تجاوز كمية أمر الشراء أو بياناته غير صالحة',
      );
    const previous = prior.filter((p) => p.purchaseOrderItemId === order.id);
    if (
      !previous
        .reduce((a, p) => a.plus(p.quantity), new Prisma.Decimal(0))
        .eq(order.receivedQuantity) ||
      previous.some(
        (p) =>
          !p.unitPrice?.eq(order.unitPrice) ||
          !Money.multiply(p.quantity, order.baseQuantity)
            .div(order.quantity)
            .eq(p.baseQuantity),
      )
    )
      throw new ConflictException(
        'تغير سعر أو تحويل أمر الشراء بعد الاستلام؛تلزم المطابقة',
      );
    const base = Money.multiply(quantity, order.baseQuantity).div(
      order.quantity,
    );
    if (
      !base.isFinite() ||
      base.lte(0) ||
      base.decimalPlaces() > 3 ||
      base.gte('1000000000000000')
    )
      throw new BadRequestException(
        'الكمية الأساسية لا تقبل التمثيل بدقة المخزون',
      );
    if (new Date(item.expiryDate) <= new Date())
      throw new BadRequestException('لا يقبل استلام منتهي الصلاحية');
    const product = await tx.product.findFirst({
      where: {
        id: item.productId,
        hospitalId: data.hospitalId,
        isActive: true,
        isDeleted: false,
      },
      include: { category: true },
    });
    if (
      !product ||
      !['DRUG', 'SUPPLY', 'LAB_REAGENT'].includes(product.type) ||
      (product.category &&
        (product.category.hospitalId !== data.hospitalId ||
          !product.category.isActive ||
          product.category.valuationMethod !== 'WEIGHTED_AVERAGE'))
    )
      throw new BadRequestException('الصنف غير متاح أو تقييمه غير مدعوم');
    if (
      !product.costPrice.isFinite() ||
      product.costPrice.lt(0) ||
      !product.stockOnHand.isFinite() ||
      product.stockOnHand.lt(0)
    )
      throw new BadRequestException('رصيد أو تكلفة الصنف غير صالحين');
    await assertOwnedQuantity(
      tx,
      data.hospitalId,
      product.id,
      product.stockOnHand,
    );
    const amount = Money.toDbString(
      Money.subtractDecimal(
        Money.toDbString(
          Money.multiply(
            order.unitPrice,
            order.receivedQuantity.plus(quantity),
          ),
        ),
        Money.toDbString(
          Money.multiply(order.unitPrice, order.receivedQuantity),
        ),
      ),
    );
    const unitCost = Money.toUnitDbString(Money.decimal(amount).div(base));
    const stock = await tx.productStock.findUnique({
      where: {
        warehouseId_productId_batchNumber: {
          warehouseId: data.warehouseId,
          productId: product.id,
          batchNumber: item.batchNumber,
        },
      },
    });
    if (
      stock &&
      (stock.hospitalId !== data.hospitalId ||
        (stock.expiryDate?.getTime() ?? null) !==
          new Date(item.expiryDate).getTime())
    )
      throw new ConflictException('التشغيلة موجودة بصلاحية أو ملكية مختلفة');
    if (
      stock &&
      (!stock.quantity.isFinite() ||
        stock.quantity.lt(0) ||
        !stock.unitCost.isFinite() ||
        stock.unitCost.lt(0))
    )
      throw new BadRequestException('رصيد أو تكلفة التشغيلة غير صالحين');
    const next = product.stockOnHand.plus(base.toString());
    if (
      next.gte('1000000000000000') ||
      next.lte(0) ||
      (stock && stock.quantity.plus(base.toString()).gte('1000000000000000'))
    )
      throw new BadRequestException('الرصيد الناتج يتجاوز سعة المخزون');
    const beforeValue = Money.toDbString(
      Money.multiply(product.stockOnHand, product.costPrice),
    );
    const cost = Money.toUnitDbString(
      Money.sumDecimal(beforeValue, amount).div(next.toString()),
    );
    const batchQuantity = (stock?.quantity ?? new Prisma.Decimal(0)).plus(
      base.toString(),
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
          warehouseId: data.warehouseId,
          productId: product.id,
          batchNumber: item.batchNumber,
        },
      },
      create: {
        hospitalId: data.hospitalId,
        warehouseId: data.warehouseId,
        productId: product.id,
        batchNumber: item.batchNumber,
        expiryDate: new Date(item.expiryDate),
        quantity: base.toString(),
        unitCost: batchCost,
      },
      update: {
        quantity: { increment: base.toString() },
        unitCost: batchCost,
        version: { increment: 1 },
      },
    });
    const updated = await tx.product.updateMany({
      where: {
        id: product.id,
        hospitalId: data.hospitalId,
        version: product.version,
        stockOnHand: product.stockOnHand,
      },
      data: { stockOnHand: next, costPrice: cost, version: { increment: 1 } },
    });
    if (updated.count !== 1)
      throw new ConflictException('تغير الرصيد أثناء الاستلام');
    await tx.goodsReceiptItem.create({
      data: {
        goodsReceiptId: grn.id,
        purchaseOrderItemId: order.id,
        productId: product.id,
        uomId: item.uomId,
        quantity,
        baseQuantity: base.toString(),
        batchNumber: item.batchNumber,
        expiryDate: new Date(item.expiryDate),
        unitPrice: Money.toUnitDbString(order.unitPrice),
        unitCost,
        totalCost: amount,
      },
    });
    await tx.stockTransaction.create({
      data: {
        hospitalId: data.hospitalId,
        warehouseId: data.warehouseId,
        productId: product.id,
        type: 'IN',
        quantity,
        uomId: item.uomId,
        baseQuantity: base.toString(),
        unitCost,
        totalCost: amount,
        batchNumber: item.batchNumber,
        expiryDate: new Date(item.expiryDate),
        referenceType: 'GRN',
        referenceId: grn.id,
        createdById: data.userId,
      },
    });
    await tx.purchaseOrderItem.update({
      where: { id: order.id },
      data: { receivedQuantity: { increment: quantity } },
    });
    const inventory = product.category?.inventoryAccountId
      ? await tx.account.findFirst({
          where: {
            id: product.category.inventoryAccountId,
            hospitalId: data.hospitalId,
            isActive: true,
          },
        })
      : await mappedAccount(tx, data.hospitalId, inventoryKey(product.type));
    if (!inventory || inventory.type !== 'ASSET')
      throw new BadRequestException('حساب مخزون غير صالح');
    debits.set(
      inventory.id,
      Money.toDbString(Money.sumPosted(debits.get(inventory.id) ?? 0, amount)),
    );
    total = Money.toDbString(Money.sumPosted(total, amount));
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
  if (Money.isPositive(total))
    await tx.accountingEntry.create({
      data: {
        hospitalId: data.hospitalId,
        financialYearId: financialYear.id,
        financialPeriodId: period.id,
        entryDate: new Date(),
        sourceModule: 'PROCUREMENT_GRN',
        sourceId: grn.id,
        postingKey: `grn:${data.hospitalId}:${grn.id}`,
        createdById: data.userId,
        goodsReceipt: { connect: { id: grn.id } },
        lines: {
          create: [
            ...Array.from(debits, ([accountId, debit]) => ({
              accountId,
              debit,
              credit: '0.000',
            })),
            { accountId: suspense.id, debit: '0.000', credit: total },
          ],
        },
      },
    });
  const remaining = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: po.id },
  });
  await tx.purchaseOrder.update({
    where: { id: po.id },
    data: {
      status: remaining.every((i) => i.receivedQuantity.eq(i.quantity))
        ? 'COMPLETED'
        : 'PARTIALLY_RECEIVED',
    },
  });
  const auditEntry = await appendChainedAuditInTransaction(tx, {
    hospitalId: data.hospitalId,
    userId: data.userId,
    action: 'RECEIVE_PURCHASE_ORDER',
    entity: 'GoodsReceipt',
    entityId: grn.id,
    details: {
      poId: po.id,
      warehouseId: data.warehouseId,
      totalAmount: total,
      requestId: data.requestId,
      valuationRoundingResiduals: residuals,
    },
  });
  onAudit?.(auditEntry);
  return tx.goodsReceipt.findUniqueOrThrow({ where: { id: grn.id } });
}
