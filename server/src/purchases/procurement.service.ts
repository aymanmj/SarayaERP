import { receiveGoods, type ReceiptInput } from './goods-receipt';
import { invoiceReceipts, type ReceiptInvoiceInput } from './receipt-invoice';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { Money } from '../common/utils/money.util';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PRStatus, POStatus, Prisma } from '@prisma/client';

@Injectable()
export class ProcurementService {
  constructor(private prisma: PrismaService) {}

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
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new BadRequestException('يجب إضافة صنف واحد على الأقل لطلب الشراء');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${data.hospitalId}::integer)`;

      const user = await tx.user.findFirst({
        where: {
          id: data.userId,
          hospitalId: data.hospitalId,
          isActive: true,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
      }

      if (data.departmentId !== undefined && data.departmentId !== null) {
        const dept = await tx.department.findFirst({
          where: {
            id: data.departmentId,
            hospitalId: data.hospitalId,
            isActive: true,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!dept) {
          throw new BadRequestException(
            'القسم غير موجود أو غير نشط في المنشأة',
          );
        }
      }

      const uniqueProductIds = [...new Set(data.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: {
          id: { in: uniqueProductIds },
          hospitalId: data.hospitalId,
          isActive: true,
          isDeleted: false,
        },
      });
      if (products.length !== uniqueProductIds.length) {
        throw new BadRequestException('بعض المنتجات غير صالحة أو خارج المنشأة');
      }
      const productMap = new Map(products.map((p) => [p.id, p]));

      const uniqueUomIds = [...new Set(data.items.map((i) => i.uomId))];
      const uoms = await tx.unitOfMeasure.findMany({
        where: {
          id: { in: uniqueUomIds },
          hospitalId: data.hospitalId,
          isActive: true,
        },
      });
      if (uoms.length !== uniqueUomIds.length) {
        throw new BadRequestException(
          'بعض وحدات القياس غير صالحة أو غير نشطة في المنشأة',
        );
      }

      const productUoms = await tx.productUOM.findMany({
        where: {
          OR: data.items.map((i) => ({
            productId: i.productId,
            uomId: i.uomId,
          })),
        },
      });

      const itemsData = data.items.map((i) => {
        const qtyStr = String(i.quantity ?? '');
        if (
          !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(qtyStr) ||
          new Prisma.Decimal(qtyStr).lte(0)
        ) {
          throw new BadRequestException('كمية الصنف في طلب الشراء غير صالحة');
        }
        const qty = new Prisma.Decimal(qtyStr);
        const product = productMap.get(i.productId)!;
        const uom = productUoms.find(
          (pu) => pu.productId === i.productId && pu.uomId === i.uomId,
        );

        let conversionRate = new Prisma.Decimal(1);
        if (uom) {
          conversionRate = uom.conversionRate;
        } else if (
          product.baseUomId !== null &&
          product.baseUomId !== i.uomId
        ) {
          throw new BadRequestException(
            `وحدة القياس غير معرفة للصنف (${product.name})`,
          );
        }

        const baseQty = qty.mul(conversionRate);
        if (
          !baseQty.isFinite() ||
          baseQty.lte(0) ||
          baseQty.decimalPlaces() > 3
        ) {
          throw new BadRequestException(
            'الكمية الأساسية الناتجة تتجاوز دقة المخزون',
          );
        }

        return {
          productId: i.productId,
          uomId: i.uomId,
          quantity: qty.toFixed(3),
          baseQuantity: baseQty.toFixed(3),
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id=${prId} AND "hospitalId"=${hospitalId} FOR UPDATE`;

      const user = await tx.user.findFirst({
        where: {
          id: userId,
          hospitalId,
          isActive: true,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
      }

      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, hospitalId, isActive: true },
        select: { id: true },
      });
      if (!supplier) {
        throw new BadRequestException('المورد غير موجود أو غير نشط في المنشأة');
      }

      const pr = await tx.purchaseRequest.findFirst({
        where: { id: prId, hospitalId },
        include: { items: { include: { product: true, uom: true } } },
      });

      if (!pr) throw new NotFoundException('PR not found');
      if (pr.status === PRStatus.CONVERTED) {
        throw new ConflictException('تم تحويل طلب الشراء إلى أمر شراء مسبقاً');
      }
      if (pr.status !== PRStatus.APPROVED && pr.status !== PRStatus.PENDING) {
        throw new BadRequestException(
          'PR must be PENDING or APPROVED to convert',
        );
      }
      if (!pr.items.length) {
        throw new BadRequestException('لا يمكن تحويل طلب شراء فارغ');
      }

      const poNumber = await this.getNextSequence(tx, hospitalId, 'PO');

      const poItems = pr.items.map((item) => {
        if (
          item.product.hospitalId !== hospitalId ||
          !item.product.isActive ||
          item.product.isDeleted
        ) {
          throw new BadRequestException('أحد أصناف طلب الشراء غير متاح');
        }
        if (
          item.uom &&
          (item.uom.hospitalId !== hospitalId || !item.uom.isActive)
        ) {
          throw new BadRequestException('إحدى وحدات طلب الشراء غير متاحة');
        }
        const conversionRate = item.quantity.gt(0)
          ? item.baseQuantity.div(item.quantity)
          : new Prisma.Decimal(1);
        const uomPrice = Money.toDbString(
          Money.multiply(item.product.costPrice, conversionRate),
        );
        const lineTotal = Money.toDbString(
          Money.multiply(uomPrice, item.quantity),
        );

        return {
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.quantity.toFixed(3),
          baseQuantity: item.baseQuantity.toFixed(3),
          unitPrice: uomPrice,
          totalPrice: lineTotal,
          receivedQuantity: '0.000',
        };
      });

      const totalAmount = Money.toDbString(
        Money.sumPosted(...poItems.map((i) => i.totalPrice)),
      );

      const po = await tx.purchaseOrder.create({
        data: {
          hospitalId,
          poNumber,
          supplierId,
          createdById: userId,
          status: POStatus.SENT,
          totalAmount,
          purchaseRequests: { connect: { id: pr.id } },
          items: { create: poItems },
        },
      });

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
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new BadRequestException('يجب إضافة صنف واحد على الأقل لأمر الشراء');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${data.hospitalId}::integer)`;

      const user = await tx.user.findFirst({
        where: {
          id: data.userId,
          hospitalId: data.hospitalId,
          isActive: true,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
      }

      const supplier = await tx.supplier.findFirst({
        where: {
          id: data.supplierId,
          hospitalId: data.hospitalId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!supplier) {
        throw new BadRequestException('المورد غير موجود أو غير نشط في المنشأة');
      }

      const uniqueProductIds = [...new Set(data.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: {
          id: { in: uniqueProductIds },
          hospitalId: data.hospitalId,
          isActive: true,
          isDeleted: false,
        },
      });
      if (products.length !== uniqueProductIds.length) {
        throw new BadRequestException('بعض المنتجات غير صالحة');
      }
      const productMap = new Map(products.map((p) => [p.id, p]));

      const uniqueUomIds = [...new Set(data.items.map((i) => i.uomId))];
      const uoms = await tx.unitOfMeasure.findMany({
        where: {
          id: { in: uniqueUomIds },
          hospitalId: data.hospitalId,
          isActive: true,
        },
      });
      if (uoms.length !== uniqueUomIds.length) {
        throw new BadRequestException(
          'بعض وحدات القياس غير صالحة أو غير نشطة في المنشأة',
        );
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

      const poItems = data.items.map((item) => {
        const qtyStr = String(item.quantity ?? '');
        const priceStr = String(item.unitPrice ?? '');
        if (
          !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(qtyStr) ||
          new Prisma.Decimal(qtyStr).lte(0) ||
          !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(priceStr) ||
          new Prisma.Decimal(priceStr).lt(0)
        ) {
          throw new BadRequestException('كمية أو سعر بند أمر الشراء غير صالح');
        }
        const qty = new Prisma.Decimal(qtyStr);
        const product = productMap.get(item.productId)!;
        const uom = productUoms.find(
          (pu) => pu.productId === item.productId && pu.uomId === item.uomId,
        );

        let conversionRate = new Prisma.Decimal(1);
        if (uom) {
          conversionRate = uom.conversionRate;
        } else if (
          product.baseUomId !== null &&
          product.baseUomId !== item.uomId
        ) {
          throw new BadRequestException(
            `وحدة القياس غير معرفة للصنف (${product.name})`,
          );
        }

        const baseQty = qty.mul(conversionRate);
        if (
          !baseQty.isFinite() ||
          baseQty.lte(0) ||
          baseQty.decimalPlaces() > 3
        ) {
          throw new BadRequestException(
            'الكمية الأساسية الناتجة تتجاوز دقة المخزون',
          );
        }

        const unitPrice = Money.toDbString(priceStr);
        const lineTotal = Money.toDbString(Money.multiply(unitPrice, qty));

        return {
          productId: item.productId,
          uomId: item.uomId,
          quantity: qty.toFixed(3),
          baseQuantity: baseQty.toFixed(3),
          unitPrice,
          totalPrice: lineTotal,
          receivedQuantity: '0.000',
        };
      });

      const totalAmount = Money.toDbString(
        Money.sumPosted(...poItems.map((i) => i.totalPrice)),
      );

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
  async createGRN(data: ReceiptInput) {
    let committedAudit: Record<string, unknown> | null = null;
    const grn = await this.prisma.$transaction(
      (tx) =>
        receiveGoods(tx, data, (audit) => {
          committedAudit = audit;
        }),
      {
        maxWait: 10000,
        timeout: 20000,
      },
    );
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return grn;
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
  async createInvoiceFromGRN(data: ReceiptInvoiceInput) {
    let committedAudit: Record<string, unknown> | null = null;
    const invoice = await this.prisma.$transaction(
      (tx) =>
        invoiceReceipts(tx, data, (audit) => {
          committedAudit = audit;
        }),
      {
        maxWait: 10000,
        timeout: 20000,
      },
    );
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return invoice;
  }

  async updatePOStatus(
    hospitalId: number,
    userId: number,
    id: number,
    status: POStatus,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id=${id} AND "hospitalId"=${hospitalId} FOR UPDATE`;
      if (
        !(await tx.user.findFirst({
          where: { id: userId, hospitalId, isActive: true, isDeleted: false },
        }))
      )
        throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
      const po = await tx.purchaseOrder.findFirst({
        where: { id, hospitalId },
      });
      if (!po) throw new NotFoundException('أمر الشراء غير موجود');
      if (po.status === status) return po;
      if (
        !(
          (status === 'SENT' && po.status === 'DRAFT') ||
          (status === 'CANCELLED' &&
            ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status))
        )
      )
        throw new BadRequestException(
          'حالة الاستلام يحددها النظام؛لا يجوز تجاوزها أو إعادة فتح أمر مغلق',
        );
      const result = await tx.purchaseOrder.update({
        where: { id },
        data: { status },
      });
      committedAudit = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'CHANGE_PURCHASE_ORDER_STATUS',
        entity: 'PurchaseOrder',
        entityId: id,
        details: { previousStatus: po.status, status },
      });
      return result;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  private async getNextSequence(
    tx: Prisma.TransactionClient,
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
