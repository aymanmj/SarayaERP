import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { financialPeriod } from '../accounting/financial-posting';
import { mappedAccount } from './purchase-return-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
export type ReceiptInvoiceInput = {
  hospitalId: number;
  userId: number;
  supplierId: number;
  grnIds: number[];
  invoiceNumber: string;
  invoiceDate: Date;
  vatAmount?: number;
  discountAmount?: number;
};
export async function invoiceReceipts(
  tx: Prisma.TransactionClient,
  data: ReceiptInvoiceInput,
) {
  if (
    !data.grnIds.length ||
    data.grnIds.length > 100 ||
    new Set(data.grnIds).size !== data.grnIds.length ||
    data.grnIds.some((id) => !Number.isInteger(id) || id < 1) ||
    !data.invoiceNumber?.trim() ||
    data.invoiceNumber.trim().length > 100 ||
    !Number.isFinite(data.invoiceDate.getTime()) ||
    !Money.eq(data.vatAmount ?? 0, 0) ||
    !Money.eq(data.discountAmount ?? 0, 0)
  )
    throw new BadRequestException(
      'تتطلب الفوترة أذونات فريدة ورقمًا وتاريخًا صالحين؛الضريبة والخصم يحتاجان مسار مطابقة مستقل',
    );
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
    throw new NotFoundException('المستخدم غير متاح');
  if (
    !(await tx.supplier.findFirst({
      where: {
        id: data.supplierId,
        hospitalId: data.hospitalId,
        isActive: true,
      },
    }))
  )
    throw new BadRequestException('المورد غير متاح ضمن المنشأة');
  const ids = [...data.grnIds].sort((a, b) => a - b);
  for (const id of ids)
    await tx.$queryRaw`SELECT id FROM "GoodsReceipt" WHERE id=${id} AND "hospitalId"=${data.hospitalId} FOR UPDATE`;
  const grns = await tx.goodsReceipt.findMany({
    where: { id: { in: ids }, hospitalId: data.hospitalId },
    include: { items: true, purchaseOrder: true },
  });
  if (
    grns.length !== ids.length ||
    grns.some(
      (g) =>
        g.status !== 'COMPLETED' ||
        g.receiptVersion !== 1 ||
        g.purchaseOrder?.hospitalId !== data.hospitalId ||
        g.purchaseOrder?.supplierId !== data.supplierId ||
        !g.items.length ||
        g.items.some(
          (i) =>
            i.totalCost === null || i.unitCost === null || i.unitPrice === null,
        ),
    )
  )
    throw new BadRequestException(
      'أذونات الاستلام أو موردها أو لقطات قيمتها غير مؤهلة للفوترة',
    );
  if (grns.some((g) => g.purchaseInvoiceId !== null)) {
    const invoiceId = grns[0].purchaseInvoiceId;
    if (!invoiceId || grns.some((g) => g.purchaseInvoiceId !== invoiceId))
      throw new ConflictException('بعض الأذونات مفوترة مسبقًا');
    const existing = await tx.purchaseInvoice.findFirst({
      where: { id: invoiceId, hospitalId: data.hospitalId },
      include: { goodsReceipts: { select: { id: true } } },
    });
    if (
      !existing ||
      existing.status !== 'APPROVED' ||
      existing.supplierId !== data.supplierId ||
      existing.invoiceNumber !== data.invoiceNumber.trim() ||
      existing.invoiceDate.getTime() !== data.invoiceDate.getTime() ||
      existing.goodsReceipts.length !== ids.length ||
      existing.goodsReceipts.some((g) => !ids.includes(g.id))
    )
      throw new ConflictException('الأذونات مرتبطة بطلب فوترة مختلف');
    return tx.purchaseInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  }
  const { financialYear, period } = await financialPeriod(
    tx,
    data.hospitalId,
    data.invoiceDate,
  );
  const total = Money.toDbString(
    Money.sumPosted(...grns.flatMap((g) => g.items.map((i) => i.totalCost!))),
  );
  const invoice = await tx.purchaseInvoice.create({
    data: {
      hospitalId: data.hospitalId,
      supplierId: data.supplierId,
      invoiceNumber: data.invoiceNumber.trim(),
      invoiceDate: data.invoiceDate,
      status: 'APPROVED',
      totalAmount: total,
      netAmount: total,
      vatAmount: '0.000',
      discountAmount: '0.000',
      paidAmount: '0.000',
      currency: 'LYD',
      goodsReceipts: { connect: ids.map((id) => ({ id })) },
      lines: {
        create: grns.flatMap((g) =>
          g.items.map((i) => ({
            description: `GRN #${g.id}`,
            productId: i.productId,
            quantity: i.baseQuantity,
            unitPrice: i.unitCost!,
            totalAmount: i.totalCost!,
            batchNumber: i.batchNumber,
            expiryDate: i.expiryDate,
          })),
        ),
      },
    },
  });
  if (Money.isPositive(total)) {
    const suspense = await mappedAccount(tx, data.hospitalId, 'GRN_SUSPENSE');
    const payable = await mappedAccount(
      tx,
      data.hospitalId,
      'PAYABLE_SUPPLIERS',
    );
    if (suspense.type !== 'LIABILITY' || payable.type !== 'LIABILITY')
      throw new BadRequestException(
        'حسابا الوسيط وذمة المورد يجب أن يكونا التزامين',
      );
    await tx.accountingEntry.create({
      data: {
        hospitalId: data.hospitalId,
        financialYearId: financialYear.id,
        financialPeriodId: period.id,
        entryDate: data.invoiceDate,
        sourceModule: 'PROCUREMENT_INV',
        sourceId: invoice.id,
        postingKey: `grn-invoice:${data.hospitalId}:${invoice.id}`,
        createdById: data.userId,
        purchaseInvoice: { connect: { id: invoice.id } },
        lines: {
          create: [
            { accountId: suspense.id, debit: total, credit: '0.000' },
            { accountId: payable.id, debit: '0.000', credit: total },
          ],
        },
      },
    });
  }
  await appendChainedAuditInTransaction(tx, {
    hospitalId: data.hospitalId,
    userId: data.userId,
    action: 'INVOICE_GOODS_RECEIPTS',
    entity: 'PurchaseInvoice',
    entityId: invoice.id,
    details: { grnIds: ids, totalAmount: total, supplierId: data.supplierId },
  });
  return tx.purchaseInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
}
