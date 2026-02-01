import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import {
  PRStatus,
  POStatus,
  GRNStatus,
  StockTransactionType,
  SystemAccountKey,
  AccountingSourceModule,
  Prisma,
} from '@prisma/client';

@Injectable()
export class ProcurementService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  // ==========================================
  // 1. Purchase Request (PR) - طلب الشراء
  // ==========================================
  async createPR(data: {
    hospitalId: number;
    userId: number;
    departmentId?: number;
    items: { productId: number; quantity: number }[];
    notes?: string;
  }) {
    // التحقق من المنتجات
    const productIds = data.items.map((i) => i.productId);
    const count = await this.prisma.product.count({
      where: { id: { in: productIds }, hospitalId: data.hospitalId },
    });
    if (count !== productIds.length)
      throw new BadRequestException('بعض المنتجات غير صالحة');

    const prNumber = `PR-${Date.now()}`; // يفضل استخدام sequence حقيقي

    return this.prisma.purchaseRequest.create({
      data: {
        hospitalId: data.hospitalId,
        requestNumber: prNumber,
        requestedById: data.userId,
        departmentId: data.departmentId,
        status: PRStatus.PENDING,
        notes: data.notes,
        items: {
          create: data.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        },
      },
    });
  }

  // ==========================================
  // 2. Purchase Order (PO) - أمر الشراء
  // ==========================================
  async createPOFromPR(
    hospitalId: number,
    userId: number,
    prId: number,
    supplierId: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const pr = await tx.purchaseRequest.findUnique({
        where: { id: prId },
        include: { items: { include: { product: true } } },
      });

      if (!pr || pr.hospitalId !== hospitalId)
        throw new NotFoundException('PR not found');
      if (pr.status !== PRStatus.APPROVED && pr.status !== PRStatus.PENDING) {
        throw new BadRequestException(
          'PR must be PENDING or APPROVED to convert',
        );
      }

      const poNumber = `PO-${Date.now()}`;

      // حساب الإجمالي المبدئي (بناءً على التكلفة الحالية للمنتج)
      let totalAmount = 0;
      const poItems = pr.items.map((item) => {
        const unitPrice = Number(item.product.costPrice); // السعر المتوقع
        const lineTotal = unitPrice * Number(item.quantity);
        totalAmount += lineTotal;

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: unitPrice,
          totalPrice: lineTotal,
          receivedQuantity: 0,
        };
      });

      const po = await tx.purchaseOrder.create({
        data: {
          hospitalId,
          poNumber,
          supplierId,
          createdById: userId,
          status: POStatus.SENT,
          totalAmount,
          purchaseRequests: { connect: { id: pr.id } }, // ربط
          items: { create: poItems },
        },
      });

      // تحديث حالة الـ PR
      await tx.purchaseRequest.update({
        where: { id: pr.id },
        data: { status: PRStatus.CONVERTED, purchaseOrderId: po.id },
      });

      return po;
    });
  }

  // ==========================================
  // 3. Goods Receipt Note (GRN) - استلام المخزون
  // ==========================================
  /**
   * استلام بضاعة بناءً على أمر شراء.
   * التأثير:
   * 1. زيادة رصيد المخزن (Stock).
   * 2. تسجيل حركة مخزنية (IN).
   * 3. قيد محاسبي: من ح/ المخزون -> إلى ح/ وسيط المشتريات (GRN Suspense).
   */
  async createGRN(data: {
    hospitalId: number;
    userId: number;
    poId: number;
    warehouseId: number;
    items: {
      productId: number;
      quantity: number;
      batchNumber: string;
      expiryDate: Date;
    }[];
    notes?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id: data.poId },
        include: { items: true },
      });
      if (!po) throw new NotFoundException('PO not found');

      // 1. إنشاء سجل GRN
      const grnNumber = `GRN-${Date.now()}`;
      const grn = await tx.goodsReceipt.create({
        data: {
          hospitalId: data.hospitalId,
          grnNumber,
          purchaseOrderId: data.poId,
          warehouseId: data.warehouseId,
          receivedById: data.userId,
          status: GRNStatus.COMPLETED, // نفترض أنه استلام نهائي فوراً
          notes: data.notes,
          items: {
            create: data.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              batchNumber: i.batchNumber,
              expiryDate: i.expiryDate,
            })),
          },
        },
      });

      // إعدادات المحاسبة
      const { fy, period } = await this.accounting.getOpenPeriodForDate(
        data.hospitalId,
        new Date(),
      );
      const inventoryAccountRef = await this.accounting.getSystemAccountOrThrow(
        data.hospitalId,
        SystemAccountKey.INVENTORY_DRUGS,
      ); // تبسيط: نفترض كلها أدوية حالياً، يجب تحسينها حسب نوع المنتج
      const suspenseAccountRef = await this.accounting.getSystemAccountOrThrow(
        data.hospitalId,
        SystemAccountKey.GRN_SUSPENSE,
      );

      let totalGrnValue = 0;

      // 2. معالجة كل صنف
      for (const receivedItem of data.items) {
        // البحث عن السعر في الـ PO (لتقييم المخزون بالتكلفة المتفق عليها)
        const poItem = po.items.find(
          (i) => i.productId === receivedItem.productId,
        );
        const unitCost = Number(poItem?.unitPrice ?? 0); // لو غير موجود، صفر أو سعر المنتج الحالي
        const lineValue = unitCost * receivedItem.quantity;
        totalGrnValue += lineValue;

        // أ) تحديث المخزون (ProductStock)
        await tx.productStock.upsert({
          where: {
            warehouseId_productId_batchNumber: {
              warehouseId: data.warehouseId,
              productId: receivedItem.productId,
              batchNumber: receivedItem.batchNumber,
            },
          },
          update: { quantity: { increment: receivedItem.quantity } },
          create: {
            hospitalId: data.hospitalId,
            warehouseId: data.warehouseId,
            productId: receivedItem.productId,
            batchNumber: receivedItem.batchNumber,
            expiryDate: receivedItem.expiryDate,
            quantity: receivedItem.quantity,
          },
        });

        // ب) تحديث المنتج الرئيسي (StockOnHand & Cost)
        // (يمكن هنا تطبيق Weighted Average Cost، للتبسيط سنستخدم آخر سعر شراء)
        await tx.product.update({
          where: { id: receivedItem.productId },
          data: {
            stockOnHand: { increment: receivedItem.quantity },
            costPrice: unitCost, // تحديث التكلفة
          },
        });

        // ج) تسجيل حركة المخزون
        await tx.stockTransaction.create({
          data: {
            hospitalId: data.hospitalId,
            warehouseId: data.warehouseId,
            productId: receivedItem.productId,
            type: StockTransactionType.IN,
            quantity: receivedItem.quantity,
            unitCost: unitCost,
            totalCost: lineValue,
            batchNumber: receivedItem.batchNumber,
            expiryDate: receivedItem.expiryDate,
            referenceType: 'GRN',
            referenceId: grn.id,
            createdById: data.userId,
          },
        });

        // د) تحديث الكمية المستلمة في الـ PO
        if (poItem) {
          await tx.purchaseOrderItem.update({
            where: { id: poItem.id },
            data: { receivedQuantity: { increment: receivedItem.quantity } },
          });
        }
      }

      // 3. القيد المحاسبي (Accrual)
      if (totalGrnValue > 0) {
        await tx.accountingEntry.create({
          data: {
            hospitalId: data.hospitalId,
            financialYearId: fy.id,
            financialPeriodId: period.id,
            entryDate: new Date(),
            sourceModule: AccountingSourceModule.PROCUREMENT_GRN,
            sourceId: grn.id,
            description: `استلام مخزني GRN #${grnNumber} - أمر شراء #${po.poNumber}`,
            createdById: data.userId,
            lines: {
              create: [
                {
                  accountId: inventoryAccountRef.id, // مدين: المخزون
                  debit: totalGrnValue,
                  credit: 0,
                  description: 'زيادة المخزون (استلام)',
                },
                {
                  accountId: suspenseAccountRef.id, // دائن: وسيط المشتريات
                  debit: 0,
                  credit: totalGrnValue,
                  description: 'استحقاق مورد (وسيط)',
                },
              ],
            },
          },
        });
      }

      return grn;
    });
  }

  // ==========================================
  // 4. Purchase Invoice - الفاتورة المالية
  // ==========================================
  /**
   * إنشاء فاتورة شراء بناءً على GRNs.
   * القيد:
   * من ح/ وسيط المشتريات (لإغلاق الحساب المؤقت)
   * من ح/ الضريبة (إن وجدت)
   * إلى ح/ المورد
   */
  async createInvoiceFromGRN(data: {
    hospitalId: number;
    userId: number;
    supplierId: number;
    grnIds: number[];
    invoiceNumber: string; // رقم فاتورة المورد
    invoiceDate: Date;
    vatAmount?: number;
    discountAmount?: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // جلب الـ GRNs للتأكد من القيم
      const grns = await tx.goodsReceipt.findMany({
        where: {
          id: { in: data.grnIds },
          hospitalId: data.hospitalId,
          purchaseInvoiceId: null, // لم تفوتر بعد
        },
        include: { items: true, purchaseOrder: { include: { items: true } } },
      });

      if (grns.length !== data.grnIds.length) {
        throw new BadRequestException(
          'بعض أذونات الاستلام غير موجودة أو مفوترة مسبقاً.',
        );
      }

      // حساب قيمة الفاتورة بناءً على الكميات المستلمة * أسعار أمر الشراء
      let subTotal = 0;

      for (const grn of grns) {
        // نحتاج لحساب قيمة كل GRN
        // (في نظام متقدم، قد يختلف سعر الفاتورة عن سعر الـ PO، وهنا ينشأ Variance Account)
        // للتبسيط: نفترض تطابق الأسعار
        for (const grnItem of grn.items) {
          const poItem = grn.purchaseOrder?.items.find(
            (i) => i.productId === grnItem.productId,
          );
          const price = Number(poItem?.unitPrice ?? 0);
          subTotal += Number(grnItem.quantity) * price;
        }
      }

      const vat = data.vatAmount || 0;
      const discount = data.discountAmount || 0;
      const netTotal = subTotal + vat - discount;

      // إنشاء الفاتورة
      const invoice = await tx.purchaseInvoice.create({
        data: {
          hospitalId: data.hospitalId,
          supplierId: data.supplierId,
          invoiceNumber: data.invoiceNumber,
          invoiceDate: data.invoiceDate,
          status: 'APPROVED', // تعتبر معتمدة لأنها مبنية على GRN
          totalAmount: subTotal,
          vatAmount: vat,
          discountAmount: discount,
          netAmount: netTotal,
          // ربط الـ GRNs
          goodsReceipts: { connect: data.grnIds.map((id) => ({ id })) },
        },
      });

      // القيد المحاسبي
      const { fy, period } = await this.accounting.getOpenPeriodForDate(
        data.hospitalId,
        data.invoiceDate,
      );
      const suspenseAcc = await this.accounting.getSystemAccountOrThrow(
        data.hospitalId,
        SystemAccountKey.GRN_SUSPENSE,
      );
      const supplierAcc = await this.accounting.getSystemAccountOrThrow(
        data.hospitalId,
        SystemAccountKey.PAYABLE_SUPPLIERS,
      );
      // const vatAcc = ... (لو مفعل الضريبة)

      await tx.accountingEntry.create({
        data: {
          hospitalId: data.hospitalId,
          financialYearId: fy.id,
          financialPeriodId: period.id,
          entryDate: data.invoiceDate,
          sourceModule: AccountingSourceModule.PROCUREMENT_INV,
          sourceId: invoice.id,
          description: `فاتورة شراء #${data.invoiceNumber} - إغلاق وسيط`,
          createdById: data.userId,
          lines: {
            create: [
              {
                accountId: suspenseAcc.id, // مدين: إغلاق الوسيط
                debit: subTotal,
                credit: 0,
              },
              {
                accountId: supplierAcc.id, // دائن: المورد
                debit: 0,
                credit: netTotal, // (شامل الضريبة والخصم - يجب ضبط القيد بدقة للضريبة والخصم)
              },
              // هنا يجب إضافة سطور للضريبة والخصم ليتوازن القيد إذا وجدت قيم
            ],
          },
        },
      });

      return invoice;
    });
  }
}
