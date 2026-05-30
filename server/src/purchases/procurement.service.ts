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
    items: { productId: number; uomId: number; quantity: number }[];
    notes?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // التحقق من المنتجات ووحدات القياس
      const productIds = data.items.map((i) => i.productId);
      const count = await tx.product.count({
        where: { id: { in: productIds }, hospitalId: data.hospitalId },
      });
      if (count !== productIds.length)
        throw new BadRequestException('بعض المنتجات غير صالحة');

      const productUoms = await tx.productUOM.findMany({
        where: {
          OR: data.items.map((i) => ({
            productId: i.productId,
            uomId: i.uomId,
          })),
        },
      });

      const itemsData = data.items.map((i) => {
        const uom = productUoms.find(
          (pu) => pu.productId === i.productId && pu.uomId === i.uomId,
        );
        const conversionRate = uom ? Number(uom.conversionRate) : 1;
        return {
          productId: i.productId,
          uomId: i.uomId,
          quantity: i.quantity,
          baseQuantity: i.quantity * conversionRate,
        };
      });

      const prNumber = await this.getNextSequence(tx, data.hospitalId, 'PR');

      return tx.purchaseRequest.create({
        data: {
          hospitalId: data.hospitalId,
          requestNumber: prNumber,
          requestedById: data.userId,
          departmentId: data.departmentId,
          status: PRStatus.PENDING,
          notes: data.notes,
          items: {
            create: itemsData,
          },
        },
      });
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

      const poNumber = await this.getNextSequence(tx, hospitalId, 'PO');

      // حساب الإجمالي المبدئي (بناءً على التكلفة الحالية للمنتج)
      let totalAmount = 0;
      const poItems = pr.items.map((item) => {
        const unitPriceBase = Number(item.product.costPrice); // السعر الأساسي المتوقع للوحدة الصغرى
        const conversionRate =
          Number(item.quantity) > 0
            ? Number(item.baseQuantity) / Number(item.quantity)
            : 1;
        const uomPrice = unitPriceBase * conversionRate;
        const lineTotal = uomPrice * Number(item.quantity);
        totalAmount += lineTotal;

        return {
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.quantity,
          baseQuantity: item.baseQuantity,
          unitPrice: uomPrice,
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
  // 2b. Direct Purchase Order (PO) - أمر شراء مباشر
  // ==========================================
  async createPODirect(data: {
    hospitalId: number;
    userId: number;
    supplierId: number;
    notes?: string;
    items: {
      productId: number;
      uomId: number;
      quantity: number;
      unitPrice: number;
    }[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const productIds = data.items.map((i) => i.productId);
      const count = await tx.product.count({
        where: { id: { in: productIds }, hospitalId: data.hospitalId },
      });
      if (count !== productIds.length) {
        throw new BadRequestException('بعض المنتجات غير صالحة');
      }

      const productUoms = await tx.productUOM.findMany({
        where: {
          OR: data.items.map((i) => ({
            productId: i.productId,
            uomId: i.uomId,
          })),
        },
      });

      const poNumber = await this.getNextSequence(tx, data.hospitalId, 'PO');
      let totalAmount = 0;

      const poItems = data.items.map((item) => {
        const uom = productUoms.find(
          (pu) => pu.productId === item.productId && pu.uomId === item.uomId,
        );
        const conversionRate = uom ? Number(uom.conversionRate) : 1;
        const baseQty = item.quantity * conversionRate;
        const lineTotal = item.unitPrice * item.quantity;
        totalAmount += lineTotal;

        return {
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.quantity,
          baseQuantity: baseQty,
          unitPrice: item.unitPrice,
          totalPrice: lineTotal,
          receivedQuantity: 0,
        };
      });

      const po = await tx.purchaseOrder.create({
        data: {
          hospitalId: data.hospitalId,
          poNumber,
          supplierId: data.supplierId,
          createdById: data.userId,
          status: POStatus.SENT,
          totalAmount,
          notes: data.notes,
          items: { create: poItems },
        },
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
      uomId: number;
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
      if (!po || po.hospitalId !== data.hospitalId) {
        throw new NotFoundException(
          'أمر الشراء غير موجود أو غير تابع لهذه المؤسسة',
        );
      }

      // التحقق من أن المستودع تابع لنفس المستشفى
      const warehouse = await tx.warehouse.findFirst({
        where: { id: data.warehouseId, hospitalId: data.hospitalId },
      });
      if (!warehouse) {
        throw new BadRequestException(
          'المستودع المحدد غير موجود أو غير تابع لهذه المؤسسة',
        );
      }

      // التحقق من أن جميع المنتجات تابعة لنفس المستشفى
      const productIds = data.items.map((i) => i.productId);
      const productsCount = await tx.product.count({
        where: {
          id: { in: productIds },
          hospitalId: data.hospitalId,
        },
      });
      if (productsCount !== productIds.length) {
        throw new BadRequestException(
          'بعض المنتجات غير صالحة أو غير تابعة لهذه المؤسسة',
        );
      }

      // جلب معاملات التحويل للوحدات
      const productUoms = await tx.productUOM.findMany({
        where: {
          OR: data.items.map((i) => ({
            productId: i.productId,
            uomId: i.uomId,
          })),
        },
      });

      const receivedItemsData = data.items.map((i) => {
        const uom = productUoms.find(
          (pu) => pu.productId === i.productId && pu.uomId === i.uomId,
        );
        const conversionRate = uom ? Number(uom.conversionRate) : 1;
        return {
          ...i,
          baseQuantity: i.quantity * conversionRate,
        };
      });

      // 1. إنشاء سجل GRN
      const grnNumber = await this.getNextSequence(tx, data.hospitalId, 'GRN');
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
            create: receivedItemsData.map((i) => ({
              productId: i.productId,
              uomId: i.uomId,
              quantity: i.quantity,
              baseQuantity: i.baseQuantity,
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
      for (const receivedItem of receivedItemsData) {
        // البحث عن السعر في الـ PO (لتقييم المخزون بالتكلفة المتفق عليها)
        const poItem = po.items.find(
          (i) => i.productId === receivedItem.productId,
        );
        const unitCost = Number(poItem?.unitPrice ?? 0); // التكلفة للوحدة الكبيرة
        const baseUnitCost =
          receivedItem.baseQuantity > 0
            ? (unitCost * receivedItem.quantity) / receivedItem.baseQuantity
            : 0;
        const lineValue = unitCost * receivedItem.quantity;
        totalGrnValue += lineValue;

        // أ) تحديث المخزون (ProductStock) بالوحدة الصغرى
        await tx.productStock.upsert({
          where: {
            warehouseId_productId_batchNumber: {
              warehouseId: data.warehouseId,
              productId: receivedItem.productId,
              batchNumber: receivedItem.batchNumber,
            },
          },
          update: { quantity: { increment: receivedItem.baseQuantity } },
          create: {
            hospitalId: data.hospitalId,
            warehouseId: data.warehouseId,
            productId: receivedItem.productId,
            batchNumber: receivedItem.batchNumber,
            expiryDate: receivedItem.expiryDate,
            quantity: receivedItem.baseQuantity,
            unitCost: baseUnitCost,
          },
        });

        // ب) تحديث المنتج الرئيسي (StockOnHand & Cost)
        // (يمكن هنا تطبيق Weighted Average Cost، للتبسيط سنستخدم التكلفة للوحدة الصغرى)
        await tx.product.update({
          where: { id: receivedItem.productId },
          data: {
            stockOnHand: { increment: receivedItem.baseQuantity },
            costPrice: baseUnitCost, // تحديث التكلفة للوحدة الصغرى
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
            uomId: receivedItem.uomId,
            baseQuantity: receivedItem.baseQuantity,
            unitCost: baseUnitCost, // نسجل التكلفة الأساسية هنا
            totalCost: lineValue,
            batchNumber: receivedItem.batchNumber,
            expiryDate: receivedItem.expiryDate,
            referenceType: 'GRN',
            referenceId: grn.id,
            createdById: data.userId,
          },
        });

        // د) تحديث الكمية المستلمة في الـ PO بوحدة الـ PO
        if (poItem) {
          // يمكن أن تكون وحدة الـ GRN مختلفة عن وحدة الـ PO، لذلك نحسب النسبة ونعكسها لوحدة PO
          const poConversionRate =
            Number(poItem.quantity) > 0
              ? Number(poItem.baseQuantity) / Number(poItem.quantity)
              : 1;
          const receivedQtyInPoUom =
            receivedItem.baseQuantity / poConversionRate;

          await tx.purchaseOrderItem.update({
            where: { id: poItem.id },
            data: { receivedQuantity: { increment: receivedQtyInPoUom } },
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

  private async getNextSequence(
    tx: any,
    hospitalId: number,
    prefix: 'PR' | 'PO' | 'GRN',
  ): Promise<string> {
    await tx.$executeRaw`SELECT 1 FROM "Hospital" WHERE id = ${hospitalId} FOR UPDATE`;

    let lastNumber: string | null = null;
    if (prefix === 'PR') {
      const last = await tx.purchaseRequest.findFirst({
        where: { hospitalId },
        orderBy: { id: 'desc' },
        select: { requestNumber: true },
      });
      lastNumber = last?.requestNumber || null;
    } else if (prefix === 'PO') {
      const last = await tx.purchaseOrder.findFirst({
        where: { hospitalId },
        orderBy: { id: 'desc' },
        select: { poNumber: true },
      });
      lastNumber = last?.poNumber || null;
    } else if (prefix === 'GRN') {
      const last = await tx.goodsReceipt.findFirst({
        where: { hospitalId },
        orderBy: { id: 'desc' },
        select: { grnNumber: true },
      });
      lastNumber = last?.grnNumber || null;
    }

    let nextVal = 1;
    if (lastNumber) {
      const parts = lastNumber.split('-');
      const suffix = parts[parts.length - 1];
      const parsed = parseInt(suffix, 10);
      if (!isNaN(parsed)) {
        nextVal = parsed + 1;
      }
    }

    return `${prefix}-${String(nextVal).padStart(6, '0')}`;
  }
}
