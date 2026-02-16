// src/purchases/purchases.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import {
  PaymentMethod,
  PurchaseInvoiceStatus,
  StockTransactionType,
  SystemAccountKey,
} from '@prisma/client';

type PurchaseInvoiceLineInput = {
  description?: string;
  quantity: number;
  unitPrice: number;
  expenseAccountId?: number;
  inventoryItemId?: number;
  drugItemId?: number;
  batchNumber?: string;
  expiryDate?: Date;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

@Injectable()
export class PurchasesService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  async listPurchaseInvoices(hospitalId: number) {
    return this.prisma.purchaseInvoice.findMany({
      where: { hospitalId },
      include: { supplier: true },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async getPurchaseInvoice(hospitalId: number, id: number) {
    const inv = await this.prisma.purchaseInvoice.findFirst({
      where: { id, hospitalId },
      include: {
        supplier: true,
        lines: {
          include: {
            expenseAccount: { select: { id: true, code: true, name: true } },
            product: true,
          },
        },
        payments: true,
      },
    });

    if (!inv) throw new NotFoundException('فاتورة الشراء غير موجودة.');
    return inv;
  }

  async createPurchaseInvoice(params: {
    hospitalId: number;
    supplierId: number;
    invoiceNumber?: string;
    invoiceDate: Date;
    dueDate?: Date;
    currency?: string;
    discountAmount?: number;
    vatAmount?: number;
    notes?: string;
    lines: PurchaseInvoiceLineInput[];
    userId: number;
    warehouseId?: number;
  }) {
    const {
      hospitalId,
      supplierId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      currency,
      discountAmount = 0,
      vatAmount = 0,
      notes,
      lines,
      warehouseId,
      userId,
    } = params;

    if (!lines?.length) {
      throw new BadRequestException('يجب إضافة بند واحد على الأقل.');
    }

    await this.accounting.ensureDefaultAccountsForHospital(hospitalId);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, hospitalId },
        select: { id: true },
      });
      if (!supplier) throw new BadRequestException('المورد غير موجود.');

      if (typeof warehouseId === 'number') {
        const wh = await tx.warehouse.findFirst({
          where: { id: warehouseId, hospitalId },
          select: { id: true },
        });
        if (!wh) throw new BadRequestException('المخزن غير موجود.');
      }

      let totalAmount = 0;

      const lineData = lines.map((l) => {
        const qty = Number(l.quantity || 0);
        const price = Number(l.unitPrice || 0);
        if (qty <= 0 || price < 0) {
          throw new BadRequestException('الكمية أو السعر غير صالح.');
        }
        const total = qty * price;
        totalAmount += total;

        const productId = l.drugItemId || l.inventoryItemId || null;

        return {
          description: l.description ?? '',
          quantity: qty,
          unitPrice: price,
          totalAmount: total,
          expenseAccountId: l.expenseAccountId ?? null,
          productId: productId,
          batchNumber: l.batchNumber || null,
          expiryDate: l.expiryDate || null,
        };
      });

      totalAmount = round3(totalAmount);
      const net = round3(totalAmount - discountAmount + vatAmount);

      const created = await tx.purchaseInvoice.create({
        data: {
          hospitalId,
          supplierId,
          invoiceNumber: invoiceNumber ?? null,
          invoiceDate,
          dueDate: dueDate ?? null,
          status: PurchaseInvoiceStatus.DRAFT,
          totalAmount,
          discountAmount,
          vatAmount,
          netAmount: net,
          paidAmount: 0,
          currency: currency ?? 'LYD',
          notes: notes ?? null,
          warehouseId: typeof warehouseId === 'number' ? warehouseId : null,
          lines: { create: lineData },
        },
      });

      return created;
    });

    return invoice;
  }

  async approvePurchaseInvoice(params: {
    hospitalId: number;
    purchaseInvoiceId: number;
    userId: number;
  }) {
    const { hospitalId, purchaseInvoiceId, userId } = params;

    // التأكد من الحسابات النظامية قبل البدء
    await this.accounting.ensureDefaultAccountsForHospital(hospitalId);

    // 👇 1. جلب الفاتورة للتحقق من التاريخ أولاً (خارج الترانزاكشن)
    // نستخدم findFirst بدلاً من findUnique لأن id ليس unique عالمياً بل ضمن المستشفى (إذا كان التصميم multi-tenant)
    // أو للتأكد من الملكية
    const invForCheck = await this.prisma.purchaseInvoice.findFirst({
      where: { id: purchaseInvoiceId, hospitalId },
    });

    // 👇 الفحص الصارم للوجود
    if (!invForCheck) {
      throw new NotFoundException('فاتورة الشراء غير موجودة.');
    }

    // الآن invForCheck مؤكد الوجود، يمكننا الوصول لـ invoiceDate بأمان
    await this.accounting.validateDateInOpenPeriod(
      hospitalId,
      invForCheck.invoiceDate,
    );

    return this.prisma.$transaction(async (tx) => {
      // نعيد جلب الفاتورة مع البنود داخل الترانزاكشن للقفل والتكامل
      const inv = await tx.purchaseInvoice.findFirst({
        where: { id: purchaseInvoiceId, hospitalId },
        include: { lines: true },
      });

      // فحص إضافي (رغم أننا فحصنا بالأعلى، لكن للترانزاكشن)
      if (!inv || inv.status !== PurchaseInvoiceStatus.DRAFT) {
        throw new BadRequestException('الفاتورة غير موجودة أو معتمدة مسبقاً.');
      }

      if (!inv.warehouseId) {
        throw new BadRequestException('يجب تحديد المخزن المستلم في الفاتورة.');
      }

      // 2. معالجة كل بند (مخزون + تكلفة)
      for (const line of inv.lines) {
        if (line.productId) {
          const qtyIn = Number(line.quantity);
          const costIn = Number(line.unitPrice);

          const product = await tx.product.findUnique({
            where: { id: line.productId },
          });

          if (product) {
            const currentStock = Number(product.stockOnHand);
            const currentCost = Number(product.costPrice);

            let newWac = costIn;

            if (currentStock > 0) {
              const totalValueOld = currentStock * currentCost;
              const totalValueNew = qtyIn * costIn;
              newWac = (totalValueOld + totalValueNew) / (currentStock + qtyIn);
            }

            newWac = Math.round(newWac * 1000) / 1000;

            await tx.product.update({
              where: { id: product.id },
              data: {
                stockOnHand: { increment: qtyIn },
                costPrice: newWac,
              },
            });

            const batchNo = line.batchNumber || 'GENERAL';

            await tx.productStock.upsert({
              where: {
                warehouseId_productId_batchNumber: {
                  warehouseId: inv.warehouseId,
                  productId: product.id,
                  batchNumber: batchNo,
                },
              },
              update: {
                quantity: { increment: qtyIn },
                ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
              },
              create: {
                hospitalId,
                warehouseId: inv.warehouseId,
                productId: product.id,
                quantity: qtyIn,
                batchNumber: batchNo,
                expiryDate: line.expiryDate,
                version: 1,
              },
            });

            await tx.stockTransaction.create({
              data: {
                hospitalId,
                warehouseId: inv.warehouseId,
                productId: product.id,
                type: StockTransactionType.IN,
                quantity: qtyIn,
                unitCost: costIn,
                totalCost: qtyIn * costIn,
                batchNumber: batchNo,
                expiryDate: line.expiryDate,
                referenceType: 'PURCHASE_INVOICE',
                referenceId: inv.id,
                createdById: userId,
                purchaseInvoiceId: inv.id,
              },
            });
          }
        }
      }

      const updated = await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { status: PurchaseInvoiceStatus.APPROVED },
      });

      await this.accounting.recordPurchaseInvoiceEntry({
        purchaseInvoiceId: updated.id,
        hospitalId,
        userId,
        tx,
      });

      return updated;
    });
  }

  async updatePurchaseInvoice(params: {
    hospitalId: number;
    purchaseInvoiceId: number;
    userId: number;
    supplierId?: number;
    invoiceNumber?: string;
    invoiceDate: Date;
    dueDate?: Date;
    currency?: string;
    discountAmount?: number;
    vatAmount?: number;
    notes?: string;
    warehouseId?: number | null;
    lines: PurchaseInvoiceLineInput[];
  }) {
    // (نفس الكود السابق مع إضافة batchNumber/expiryDate في create lines)
    const {
      hospitalId,
      purchaseInvoiceId,
      supplierId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      currency,
      discountAmount = 0,
      vatAmount = 0,
      notes,
      warehouseId,
      lines,
    } = params;

    const updated = await this.prisma.$transaction(async (tx) => {
      // ... (validation logic similar to previous)
      const inv = await tx.purchaseInvoice.findFirst({
        where: { id: purchaseInvoiceId, hospitalId },
        include: {
          stockTransactions: { select: { id: true } },
          payments: { select: { id: true } },
        },
      });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.stockTransactions.length > 0)
        throw new BadRequestException('Cannot update processed invoice');

      let totalAmount = 0;
      const lineData = lines.map((l) => {
        const qty = Number(l.quantity || 0);
        const price = Number(l.unitPrice || 0);
        const total = qty * price;
        totalAmount += total;

        return {
          description: l.description ?? '',
          quantity: qty,
          unitPrice: price,
          totalAmount: total,
          expenseAccountId: l.expenseAccountId ?? null,
          productId: l.drugItemId || l.inventoryItemId || null,
          batchNumber: l.batchNumber || null, // ✅
          expiryDate: l.expiryDate || null, // ✅
        };
      });

      totalAmount = round3(totalAmount);
      const net = round3(totalAmount - discountAmount + vatAmount);

      const invUpdated = await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: {
          supplierId: supplierId ?? inv.supplierId,
          invoiceNumber: invoiceNumber ?? null,
          invoiceDate,
          dueDate: dueDate ?? null,
          currency: currency ?? inv.currency,
          discountAmount,
          vatAmount,
          totalAmount,
          netAmount: net,
          notes: notes ?? null,
          warehouseId:
            warehouseId === undefined ? inv.warehouseId : warehouseId,
          lines: {
            deleteMany: {},
            create: lineData,
          },
        },
      });

      return invUpdated;
    });

    return updated;
  }

  async cancelPurchaseInvoice(params: {
    hospitalId: number;
    purchaseInvoiceId: number;
    userId: number;
    reason?: string;
  }) {
    // (نفس الكود السابق تماماً)
    const { hospitalId, purchaseInvoiceId } = params;
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.purchaseInvoice.findFirst({
        where: { id: purchaseInvoiceId, hospitalId },
        include: {
          stockTransactions: { select: { id: true } },
          payments: { select: { id: true } },
        },
      });
      if (!inv) throw new NotFoundException('فاتورة الشراء غير موجودة.');
      if (inv.stockTransactions.length > 0)
        throw new BadRequestException('لا يمكن إلغاء فاتورة تم توريدها.');
      if (inv.payments.length > 0)
        throw new BadRequestException('لا يمكن إلغاء فاتورة عليها دفعات.');

      const updated = await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: {
          status: PurchaseInvoiceStatus.CANCELLED,
          accountingEntryId: null,
        },
      });

      if (inv.accountingEntryId) {
        await tx.accountingEntryLine.deleteMany({
          where: { entryId: inv.accountingEntryId },
        });
        await tx.accountingEntry.delete({
          where: { id: inv.accountingEntryId },
        });
      }
      return updated;
    });
    return cancelled;
  }

  async recordSupplierPayment(params: {
    hospitalId: number;
    purchaseInvoiceId: number;
    supplierId: number;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    notes?: string;
    userId: number;
  }) {
    // (نفس الكود السابق تماماً - لا تغيير)
    const {
      hospitalId,
      purchaseInvoiceId,
      supplierId,
      amount,
      method,
      reference,
      notes,
      userId,
    } = params;
    if (!amount || amount <= 0)
      throw new BadRequestException('قيمة الدفعة غير صحيحة');

    await this.accounting.ensureDefaultAccountsForHospital(hospitalId);

    const result = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.purchaseInvoice.findFirst({
        where: { id: purchaseInvoiceId, hospitalId, supplierId },
      });
      if (!inv) throw new NotFoundException('فاتورة الشراء غير موجودة.');

      const net = Number(inv.netAmount);
      const paid = Number(inv.paidAmount);

      if (amount > net - paid + 0.0001)
        throw new BadRequestException('قيمة الدفعة أكبر من الرصيد.');

      const payment = await tx.supplierPayment.create({
        data: {
          hospitalId,
          supplierId,
          purchaseInvoiceId,
          amount,
          method,
          reference: reference || null,
          notes: notes || null,
          createdById: userId,
        },
      });

      const newPaid = paid + amount;
      const newStatus =
        newPaid >= net - 0.0001
          ? PurchaseInvoiceStatus.PAID
          : PurchaseInvoiceStatus.PARTIALLY_PAID;

      const updatedInvoice = await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { paidAmount: newPaid, status: newStatus },
      });

      await this.accounting.recordSupplierPaymentEntry({
        supplierPaymentId: payment.id,
        hospitalId,
        userId,
        tx,
      });

      return { invoice: updatedInvoice, payment };
    });
    return result;
  }
}
