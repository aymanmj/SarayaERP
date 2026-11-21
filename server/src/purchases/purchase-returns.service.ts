import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { cashTransaction, evidence } from '../cashier/cash-control';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  inventoryKey,
  mappedAccount,
  postPurchaseReturn,
} from './purchase-return-posting';

type ReturnInput = {
  purchaseInvoiceId: number;
  requestId: string;
  reason: string;
  items: {
    productId: number;
    purchaseInvoiceLineId?: number;
    quantity: number;
    description?: string;
  }[];
};
@Injectable()
export class PurchaseReturnsService {
  constructor(private readonly prisma: PrismaService) {}
  async createReturn(hospitalId: number, userId: number, dto: ReturnInput) {
    const reason = evidence(dto.reason);
    if (
      !dto.items.length ||
      dto.items.some(
        (i) =>
          !Number.isFinite(i.quantity) ||
          i.quantity <= 0 ||
          i.quantity > 999999999999.999 ||
          Money.decimal(i.quantity).decimalPlaces() > 3,
      )
    )
      throw new BadRequestException('يلزم بنود بكميات موجبة بدقة ثلاث منازل');
    let committedAudit: Record<string, unknown> | null = null;
    const returnDoc = await cashTransaction(
      this.prisma,
      async (tx) => {
        committedAudit = null;
        await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id=${dto.purchaseInvoiceId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
        const invoice = await tx.purchaseInvoice.findFirst({
          where: { id: dto.purchaseInvoiceId, hospitalId },
          include: {
            lines: { orderBy: { id: 'asc' }, include: { product: true } },
            warehouse: true,
            supplier: true,
          },
        });
        if (!invoice)
          throw new NotFoundException('فاتورة الشراء غير موجودة في المنشأة');
        const requestKey = `purchase-return:${hospitalId}:${dto.purchaseInvoiceId}:${dto.requestId}`;
        const previous = await tx.purchaseReturn.findUnique({
          where: { requestKey },
          include: { lines: true },
        });
        if (previous) {
          if (
            previous.createdById !== userId ||
            previous.reason !== reason ||
            previous.lines.length !== dto.items.length ||
            dto.items.some(
              (i) =>
                !previous.lines.some(
                  (l) =>
                    l.productId === i.productId &&
                    (i.purchaseInvoiceLineId === undefined ||
                      l.purchaseInvoiceLineId === i.purchaseInvoiceLineId) &&
                    Money.eq(l.quantity, i.quantity) &&
                    (l.description ?? '') === (i.description?.trim() ?? ''),
                ),
            )
          )
            throw new ConflictException('معرف المرتجع مستخدم ببيانات مختلفة');
          if (previous.status !== 'COMPLETED' || !previous.accountingEntryId)
            throw new BadRequestException('مرتجع غير مكتمل يحتاج مطابقة');
          return previous;
        }
        if (
          !['APPROVED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status) ||
          !invoice.warehouse ||
          invoice.warehouse.hospitalId !== hospitalId ||
          !invoice.warehouse.isActive ||
          invoice.supplier.hospitalId !== hospitalId
        )
          throw new BadRequestException(
            'يلزم فاتورة معتمدة ومخزن ومورد صحيحان',
          );
        if (
          invoice.currency !== 'LYD' ||
          !Money.isZero(invoice.discountAmount) ||
          !Money.isZero(invoice.vatAmount)
        )
          throw new BadRequestException(
            'المردود الآمن الحالي لفواتير LYD دون خصم أو ضريبة؛يلزم مسار توزيع معتمد للحالات الأخرى',
          );
        if (
          !Money.eq(invoice.totalAmount, invoice.netAmount) ||
          !Money.eq(
            Money.sumDecimal(...invoice.lines.map((l) => l.totalAmount)),
            invoice.totalAmount,
          )
        )
          throw new BadRequestException(
            'إجماليات الفاتورة الأصلية غير متطابقة',
          );
        if (
          await tx.purchaseReturn.count({
            where: {
              hospitalId,
              purchaseInvoiceId: invoice.id,
              status: { not: 'CANCELLED' },
              OR: [{ requestKey: null }, { status: 'DRAFT' }],
            },
          })
        )
          throw new BadRequestException(
            'توجد مردودات قديمة أو غير مكتملة؛يلزم مطابقتها أولاً',
          );
        if (
          await tx.goodsReceipt.count({
            where: { hospitalId, purchaseInvoiceId: invoice.id },
          })
        )
          throw new BadRequestException(
            'الفاتورة مرتبطة بإذن توريد؛يلزم مسار مطابقة التوريد قبل الإرجاع',
          );
        const productIds = [
          ...new Set(
            invoice.lines
              .map((l) => l.productId)
              .filter((id): id is number => id !== null),
          ),
        ].sort((a, b) => a - b);
        for (const id of productIds)
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id} AND "hospitalId"=${hospitalId} FOR UPDATE`;
        const original = invoice.accountingEntryId
          ? await tx.accountingEntry.findFirst({
              where: { id: invoice.accountingEntryId, hospitalId },
              include: { lines: { include: { account: true } } },
            })
          : null;
        if (
          !original ||
          original.sourceId !== invoice.id ||
          original.sourceModule !== 'INVENTORY' ||
          (await tx.accountingEntry.count({
            where: {
              hospitalId,
              sourceModule: 'JOURNAL_REVERSAL',
              sourceId: original.id,
            },
          }))
        )
          throw new BadRequestException(
            'قيد فاتورة الشراء مفقود أو معكوس؛يلزم مطابقة',
          );
        const ap = original.lines.filter((l) => Money.isPositive(l.credit));
        if (
          ap.length !== 1 ||
          !Money.eq(ap[0].credit, invoice.netAmount) ||
          !ap[0].account.isActive ||
          ap[0].account.hospitalId !== hospitalId ||
          ap[0].account.type !== 'LIABILITY'
        )
          throw new BadRequestException('ذمة المورد الأصلية غير متطابقة');
        const accounts = new Map<number, number>();
        const expected = new Map<number, ReturnType<typeof Money.decimal>>();
        for (const line of invoice.lines) {
          if (
            !line.productId ||
            !line.product ||
            line.product.hospitalId !== hospitalId ||
            !Money.eq(
              Money.toDbString(
                Money.decimal(line.quantity).mul(line.unitPrice),
              ),
              line.totalAmount,
            )
          )
            throw new BadRequestException(
              'المرتجع الحالي لبنود مخزنية أصلية موثقة',
            );
          const account = line.expenseAccountId
            ? await tx.account.findFirst({
                where: {
                  id: line.expenseAccountId,
                  hospitalId,
                  isActive: true,
                  type: 'ASSET',
                },
              })
            : await mappedAccount(
                tx,
                hospitalId,
                inventoryKey(line.product.type),
              );
          if (!account || account.type !== 'ASSET')
            throw new BadRequestException('حساب المخزون الأصلي غير صالح');
          accounts.set(line.id, account.id);
          expected.set(
            account.id,
            Money.decimal(expected.get(account.id)).plus(line.totalAmount),
          );
        }
        const debits = original.lines.filter((l) => Money.isPositive(l.debit));
        if (
          debits.length !== expected.size ||
          debits.some(
            (l) =>
              !l.account.isActive ||
              l.account.hospitalId !== hospitalId ||
              !Money.eq(l.debit, expected.get(l.accountId)) ||
              !expected.has(l.accountId),
          )
        )
          throw new BadRequestException(
            'قيد الشراء لا يطابق حسابات المخزون؛يلزم تصحيح معتمد ولا يعاد ترحيله بصمت',
          );
        const selected = dto.items
          .map((item) => {
            const matches = invoice.lines.filter((l) =>
              item.purchaseInvoiceLineId === undefined
                ? l.productId === item.productId
                : l.id === item.purchaseInvoiceLineId &&
                  l.productId === item.productId,
            );
            if (matches.length !== 1)
              throw new BadRequestException(
                'حدد بند الفاتورة الأصلي؛المنتج مكرر أو غير موجود',
              );
            return { item, line: matches[0] };
          })
          .sort(
            (a, b) =>
              a.line.productId! - b.line.productId! || a.line.id - b.line.id,
          );
        if (new Set(selected.map((s) => s.line.id)).size !== selected.length)
          throw new BadRequestException('لا يجوز تكرار البند في الطلب');
        let total = Money.decimal(0);
        const book = new Map<number, Prisma.Decimal>();
        const lines: {
          productId: number;
          purchaseInvoiceLineId: number;
          productStockId: number;
          quantity: string;
          unitPrice: Prisma.Decimal;
          totalAmount: string;
          description: string | null;
        }[] = [];
        const movements: Omit<
          Prisma.StockTransactionUncheckedCreateInput,
          'purchaseReturnId' | 'referenceId'
        >[] = [];
        for (const { item, line } of selected) {
          const qty = Money.toDbString(item.quantity);
          const used = await tx.purchaseReturnLine.aggregate({
            where: {
              purchaseInvoiceLineId: line.id,
              purchaseReturn: { hospitalId, status: 'COMPLETED' },
            },
            _sum: { quantity: true, totalAmount: true },
          });
          if (Money.sumDecimal(used._sum.quantity, qty).gt(line.quantity))
            throw new BadRequestException(
              'الكمية تتجاوز المتبقي من بند الشراء بعد المردودات',
            );
          const product = await tx.product.findFirstOrThrow({
            where: { id: item.productId, hospitalId },
          });
          const allStock = await tx.productStock.aggregate({
            where: { hospitalId, productId: item.productId },
            _sum: { quantity: true },
          });
          if (!Money.eq(allStock._sum.quantity, product.stockOnHand))
            throw new BadRequestException(
              'رصيد الصنف والتشغيلات غير متطابق؛يلزم الجرد والمطابقة',
            );
          const batchNumber = line.batchNumber || 'GENERAL';
          const incoming = await tx.stockTransaction.aggregate({
            where: {
              hospitalId,
              purchaseInvoiceId: invoice.id,
              productId: item.productId,
              warehouseId: invoice.warehouseId,
              type: 'IN',
              referenceType: 'PURCHASE_INVOICE',
              batchNumber,
            },
            _sum: { quantity: true },
          });
          const invoicedBatchQty = Money.sumDecimal(
            ...invoice.lines
              .filter(
                (l) =>
                  l.productId === item.productId &&
                  (l.batchNumber || 'GENERAL') === batchNumber,
              )
              .map((l) => l.quantity),
          );
          if (!Money.eq(incoming._sum.quantity, invoicedBatchQty))
            throw new BadRequestException(
              'سند التوريد الأصلي غير متطابق مع البنود والتشغيلة',
            );
          const stocks = await tx.productStock.findMany({
            where: {
              hospitalId,
              warehouseId: invoice.warehouseId!,
              productId: item.productId,
              batchNumber,
            },
          });
          if (stocks.length !== 1)
            throw new BadRequestException('التشغيلة الأصلية غير محددة');
          const stock = stocks[0];
          if (
            await tx.inventoryRecallDisposal.findFirst({
              where: {
                hospitalId,
                stockId: stock.id,
                status: { in: ['APPROVED', 'EXECUTED'] },
              },
              select: { id: true },
            })
          )
            throw new ConflictException('رصيد التشغيلة محجوز لطلب إتلاف معتمد');
          if (
            line.expiryDate &&
            stock.expiryDate?.getTime() !== line.expiryDate.getTime()
          )
            throw new BadRequestException('تاريخ التشغيلة تغير؛يلزم مطابقة');
          const removed = await tx.productStock.updateMany({
            where: {
              id: stock.id,
              hospitalId,
              version: stock.version,
              quantity: { gte: qty },
            },
            data: { quantity: { decrement: qty }, version: { increment: 1 } },
          });
          if (removed.count !== 1)
            throw new ConflictException(
              'رصيد التشغيلة غير كافٍ أو تغير بالتزامن',
            );
          const productUpdated = await tx.product.updateMany({
            where: {
              id: product.id,
              hospitalId,
              stockOnHand: { gte: qty },
              version: product.version,
            },
            data: {
              stockOnHand: { decrement: qty },
              version: { increment: 1 },
            },
          });
          if (productUpdated.count !== 1)
            throw new ConflictException('رصيد الصنف تغير بالتزامن');
          const previousAllocated = Money.toDbString(
            Money.decimal(line.totalAmount)
              .mul(Money.decimal(used._sum.quantity))
              .div(line.quantity),
          );
          if (!Money.eq(previousAllocated, used._sum.totalAmount))
            throw new BadRequestException(
              'مبالغ المردودات السابقة لا تطابق التوزيع؛يلزم مطابقة',
            );
          const cumulativeValue = Money.toDbString(
            Money.decimal(line.totalAmount)
              .mul(Money.sumDecimal(used._sum.quantity, qty))
              .div(line.quantity),
          );
          const value = Money.toDbString(
            Money.decimal(cumulativeValue).minus(previousAllocated),
          );
          const cost = Money.toDbString(
            Money.decimal(qty).mul(product.costPrice),
          );
          if (Money.isNegative(product.costPrice))
            throw new BadRequestException('تكلفة الصنف غير صالحة');
          if (Money.decimal(cost).gte('1000000000000000'))
            throw new BadRequestException(
              'قيمة تكلفة المرتجع تتجاوز دقة التخزين',
            );
          total = total.plus(value);
          const accountId = accounts.get(line.id)!;
          book.set(
            accountId,
            new Prisma.Decimal(
              Money.toDbString(Money.sumDecimal(book.get(accountId), cost)),
            ),
          );
          lines.push({
            productId: product.id,
            purchaseInvoiceLineId: line.id,
            productStockId: stock.id,
            quantity: qty,
            unitPrice: line.unitPrice,
            totalAmount: value,
            description: item.description?.trim() || null,
          });
          movements.push({
            hospitalId,
            warehouseId: stock.warehouseId,
            productId: product.id,
            type: 'OUT',
            quantity: qty,
            baseQuantity: qty,
            unitCost: product.costPrice,
            totalCost: cost,
            batchNumber,
            expiryDate: stock.expiryDate,
            referenceType: 'PURCHASE_RETURN',
            createdById: userId,
            purchaseInvoiceId: invoice.id,
            notes: reason,
          });
        }
        if (!total.gt(0))
          throw new BadRequestException('قيمة المرتجع يجب أن تكون موجبة');
        const at = new Date();
        const ret = await tx.purchaseReturn.create({
          data: {
            hospitalId,
            supplierId: invoice.supplierId,
            purchaseInvoiceId: invoice.id,
            requestKey,
            reason,
            returnDate: at,
            createdById: userId,
            netAmount: Money.toDbString(total),
            totalAmount: Money.toDbString(total),
            vatAmount: 0,
            status: 'DRAFT',
            lines: { create: lines },
          },
        });
        await tx.stockTransaction.createMany({
          data: movements.map((m) => ({
            ...m,
            createdAt: at,
            purchaseReturnId: ret.id,
            referenceId: ret.id,
          })),
        });
        const entry = await postPurchaseReturn(
          tx,
          hospitalId,
          ret.id,
          userId,
          ap[0].accountId,
          book,
          Money.toDbString(total),
          at,
        );
        const result = await tx.purchaseReturn.update({
          where: { id: ret.id },
          data: { accountingEntryId: entry.id, status: 'COMPLETED' },
          include: { lines: true },
        });
        const auditFields = {
          hospitalId,
          userId,
          entity: 'PurchaseReturn',
          entityId: ret.id,
          action: 'COMPLETE_PURCHASE_RETURN',
          details: {
            purchaseInvoiceId: invoice.id,
            accountingEntryId: entry.id,
            total: Money.toDbString(total),
            reason,
            requestId: dto.requestId,
            lines: lines.map((l) => ({
              lineId: l.purchaseInvoiceLineId,
              stockId: l.productStockId,
              quantity: l.quantity,
            })),
          },
        };
        await appendChainedAuditInTransaction(tx, auditFields);
        committedAudit = auditFields;
        return result;
      },
      { maxWait: 10000, timeout: 30000 },
    );
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return returnDoc;
  }
}
