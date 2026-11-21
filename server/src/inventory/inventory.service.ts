import { ConsumptionFailure } from './consumption-failure';
import {
  readRecallSupplierReceipts,
  recordRecallSupplierReceipt,
  type SupplierReceiptInput,
} from './recall-supplier-receipt';
import { changeBatchRestriction, usableStockWhere } from './stock-batch-safety';
import {
  readRecallFollowup,
  readRecallContacts,
  recordRecallContact,
  type RecallContactInput,
  recordRecallIsolation,
  type RecallIsolationInput,
} from './recall-followup';
import { Money } from '../common/utils/money.util';
import {
  captureConsumptionMaterials,
  readConsumptionMaterials,
} from './consumption-snapshot';
// src/inventory/inventory.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  StockTransactionType,
  InventoryBatchStatus,
  RecallContactAudience,
  ProductType,
  MaterialRequestStatus,
  Prisma,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import {
  issueMaterialTransfer,
  directMaterialTransfer,
  receiveMaterialTransfer,
  transferWarehouses,
  validateTransferRequest,
} from './material-transfer';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
  ) {}

  // فحص تنبيهات المخزون (نقص الكمية + قرب انتهاء الصلاحية)
  async monitorStockLevels(hospitalId: number) {
    // 1. فحص المنتجات التي وصلت لحد الطلب
    const lowStockProducts = await this.prisma.product.findMany({
      where: {
        hospitalId,
        isActive: true,
        isDeleted: false,
        minStock: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        stockOnHand: true,
        minStock: true,
      },
    });

    const lowStockAlerts = lowStockProducts
      .filter((p) => p.stockOnHand.lte(p.minStock))
      .map((p) => {
        const currentStock = Money.fromPrisma(p.stockOnHand);
        const minStock = Money.fromPrisma(p.minStock);
        return {
          type: 'LOW_STOCK',
          productId: p.id,
          productName: p.name,
          currentStock,
          minStock,
          message: `الرصيد الحالي (${currentStock}) أقل من أو يساوي حد الطلب (${minStock})`,
        };
      });

    // 2. فحص المواد قريبة انتهاء الصلاحية (خلال 3 أشهر)
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    const expiringBatches = await this.prisma.productStock.findMany({
      where: {
        hospitalId,
        quantity: { gt: 0 },
        expiryDate: {
          lte: threeMonthsFromNow,
          gte: new Date(),
        },
      },
      include: {
        product: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });

    const expiryAlerts = expiringBatches.map((b) => ({
      type: 'EXPIRY_SOON',
      productId: b.productId,
      productName: b.product.name,
      warehouseName: b.warehouse.name,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      daysRemaining: Math.ceil(
        (new Date(b.expiryDate!).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      ),
    }));

    // 3. فحص المواد المنتهية الصلاحية (Expired)
    const expiredBatches = await this.prisma.productStock.findMany({
      where: {
        hospitalId,
        quantity: { gt: 0 },
        expiryDate: { lt: new Date() },
      },
      include: {
        product: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });

    const expiredAlerts = expiredBatches.map((b) => ({
      type: 'EXPIRED',
      productId: b.productId,
      productName: b.product.name,
      warehouseName: b.warehouse.name,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      message: 'المنتج منتهي الصلاحية!',
    }));

    return {
      lowStock: lowStockAlerts,
      expiringSoon: expiryAlerts,
      expired: expiredAlerts,
    };
  }

  async listWarehouses(hospitalId: number) {
    return this.prisma.warehouse.findMany({
      where: { hospitalId, isActive: true },
      select: { id: true, name: true, code: true },
    });
  }

  async getWarehouseStock(
    hospitalId: number,
    warehouseId: number,
    search?: string,
  ) {
    const stocks = await this.prisma.productStock.findMany({
      where: {
        hospitalId,
        warehouseId,
        product: search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ],
            }
          : undefined,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
            sellPrice: true,
            costPrice: true,
            strength: true,
            form: true,
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
    });
    const restrictions = await this.prisma.inventoryBatchRestriction.findMany({
      where: {
        hospitalId,
        status: { not: 'RELEASED' },
        productId: { in: [...new Set(stocks.map((stock) => stock.productId))] },
      },
      select: {
        productId: true,
        batchNumber: true,
        status: true,
        reason: true,
      },
    });
    const byBatch = new Map(
      restrictions.map((record) => [
        `${record.productId}:${record.batchNumber}`,
        record,
      ]),
    );
    return stocks.map((stock) => ({
      ...stock,
      batchRestriction:
        byBatch.get(`${stock.productId}:${stock.batchNumber?.trim()}`) ?? null,
    }));
  }

  changeBatchRestriction(
    hospitalId: number,
    actorId: number,
    stockId: number,
    status: InventoryBatchStatus,
    reason: string,
  ) {
    return this.prisma.$transaction((tx) =>
      changeBatchRestriction(tx, hospitalId, actorId, stockId, status, reason),
    );
  }

  recallFollowup(
    hospitalId: number,
    actorId: number,
    stockId: number,
    showPatient: boolean,
    before?: number,
  ) {
    return this.prisma.$transaction((tx) =>
      readRecallFollowup(tx, hospitalId, actorId, stockId, showPatient, before),
    );
  }

  recordRecallIsolation(
    hospitalId: number,
    actorId: number,
    stockId: number,
    input: RecallIsolationInput,
  ) {
    return this.prisma.$transaction((tx) =>
      recordRecallIsolation(tx, hospitalId, actorId, stockId, input),
    );
  }

  recallContacts(
    hospitalId: number,
    actorId: number,
    stockId: number,
    movementId: number,
    audience: RecallContactAudience,
    showPatient: boolean,
    before?: number,
  ) {
    return this.prisma.$transaction((tx) =>
      readRecallContacts(
        tx,
        hospitalId,
        actorId,
        stockId,
        movementId,
        audience,
        showPatient,
        before,
      ),
    );
  }

  recordRecallContact(
    hospitalId: number,
    actorId: number,
    stockId: number,
    movementId: number,
    showPatient: boolean,
    input: RecallContactInput,
  ) {
    return this.prisma.$transaction((tx) =>
      recordRecallContact(
        tx,
        hospitalId,
        actorId,
        stockId,
        movementId,
        showPatient,
        input,
      ),
    );
  }

  recallSupplierReceipts(
    hospitalId: number,
    stockId: number,
    movementId: number,
    before?: number,
  ) {
    return this.prisma.$transaction(
      (tx) =>
        readRecallSupplierReceipts(tx, hospitalId, stockId, movementId, before),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  recordRecallSupplierReceipt(
    hospitalId: number,
    actorId: number,
    stockId: number,
    movementId: number,
    input: SupplierReceiptInput,
  ) {
    return this.prisma.$transaction((tx) =>
      recordRecallSupplierReceipt(
        tx,
        hospitalId,
        actorId,
        stockId,
        movementId,
        input,
      ),
    );
  }

  async transferStock(params: {
    hospitalId: number;
    userId: number;
    fromWarehouseId: number;
    toWarehouseId: number;
    requestKey?: string;
    items: { productId: number; quantity: number }[];
    notes?: string;
  }) {
    return directMaterialTransfer(this.prisma, params);
  }

  async getInTransit(hospitalId: number) {
    return this.prisma.stockIssue.findMany({
      where: { hospitalId, status: 'ISSUED', transferVersion: 1 },
      include: {
        items: true,
        issuedFrom: { select: { id: true, name: true } },
        materialRequest: {
          select: {
            id: true,
            requestNumber: true,
            requestingWarehouseId: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });
  }
  // ==========================================
  //  إعدادات الاعتماد وصلاحية وحدات القياس
  // ==========================================

  async isApprovalRequired(hospitalId: number): Promise<boolean> {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
      select: { organizationId: true },
    });
    if (!hospital || !hospital.organizationId) {
      return false;
    }
    const setting = await this.prisma.orgSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: hospital.organizationId,
          key: 'require_material_request_approval',
        },
      },
    });
    return setting ? setting.value === 'true' : false;
  }

  async convertQuantity(
    productId: number,
    qty: number,
    fromUomId: number | null,
    toUomId: number | null,
    hospitalId?: number,
  ): Promise<number> {
    if (!Number.isFinite(qty) || qty < 0) {
      throw new BadRequestException('الكمية المطلوب تحويلها غير صالحة.');
    }
    if (!fromUomId || !toUomId || fromUomId === toUomId) {
      return Number(new Prisma.Decimal(qty).toDecimalPlaces(3));
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        isDeleted: false,
        ...(hospitalId !== undefined ? { hospitalId } : {}),
      },
      select: { baseUomId: true, hospitalId: true },
    });

    if (!product) {
      throw new NotFoundException('المنتج غير موجود.');
    }

    // التحويل من UOM المصدر إلى UOM الأساسي للـ product
    let qtyInBase = new Prisma.Decimal(qty);
    if (fromUomId !== product.baseUomId) {
      const fromConv = await this.prisma.productUOM.findUnique({
        where: { productId_uomId: { productId, uomId: fromUomId } },
        include: { uom: { select: { hospitalId: true, isActive: true } } },
      });
      if (
        !fromConv ||
        fromConv.uom.hospitalId !== product.hospitalId ||
        !fromConv.uom.isActive ||
        fromConv.conversionRate.lte(0)
      ) {
        throw new BadRequestException(
          'وحدة القياس المصدر غير صالحة لهذا الصنف.',
        );
      }
      qtyInBase = qtyInBase.mul(fromConv.conversionRate);
    }

    // التحويل من UOM الأساسي إلى UOM الهدف
    if (toUomId === product.baseUomId) {
      return Number(qtyInBase.toDecimalPlaces(3));
    }

    const toConv = await this.prisma.productUOM.findUnique({
      where: { productId_uomId: { productId, uomId: toUomId } },
      include: { uom: { select: { hospitalId: true, isActive: true } } },
    });
    if (
      !toConv ||
      toConv.uom.hospitalId !== product.hospitalId ||
      !toConv.uom.isActive ||
      toConv.conversionRate.lte(0)
    ) {
      throw new BadRequestException('وحدة القياس الهدف غير صالحة لهذا الصنف.');
    }
    return Number(qtyInBase.div(toConv.conversionRate).toDecimalPlaces(3));
  }

  // ==========================================
  //  دورة حياة طلب المواد (Material Request)
  // ==========================================

  async createMaterialRequest(params: {
    hospitalId: number;
    userId: number;
    requestingWarehouseId: number;
    fulfillingWarehouseId: number;
    fromDepartmentId?: number;
    notes?: string;
    items: {
      productId: number;
      uomId?: number;
      requestedQty: number;
      notes?: string;
    }[];
  }) {
    const {
      hospitalId,
      userId,
      requestingWarehouseId,
      fulfillingWarehouseId,
      fromDepartmentId,
      notes,
      items,
    } = params;

    if (requestingWarehouseId === fulfillingWarehouseId) {
      throw new BadRequestException('لا يمكن طلب تحويل بين نفس المخزن.');
    }

    if (!items || items.length === 0) {
      throw new BadRequestException('يجب إضافة صنف واحد على الأقل.');
    }

    const requireApproval = await this.isApprovalRequired(hospitalId);
    const initialStatus = requireApproval
      ? MaterialRequestStatus.PENDING_APPROVAL
      : MaterialRequestStatus.APPROVED;

    return this.prisma.$transaction(async (tx) => {
      await transferWarehouses(
        tx,
        hospitalId,
        fulfillingWarehouseId,
        requestingWarehouseId,
      );
      await validateTransferRequest(tx, hospitalId, items);
      if (
        fromDepartmentId &&
        !(await tx.department.findFirst({
          where: { id: fromDepartmentId, hospitalId },
        }))
      )
        throw new BadRequestException('القسم خارج المنشأة');
      const reqNumber = await this.getNextSequence(tx, hospitalId, 'MR');

      return tx.materialRequest.create({
        data: {
          hospitalId,
          requestNumber: reqNumber,
          requestingWarehouseId,
          fulfillingWarehouseId,
          fromDepartmentId: fromDepartmentId || null,
          requestedById: userId,
          status: initialStatus,
          notes,
          approvedById: requireApproval ? null : userId,
          approvedAt: requireApproval ? null : new Date(),
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              uomId: item.uomId || null,
              requestedQty: new Prisma.Decimal(item.requestedQty),
              notes: item.notes,
            })),
          },
        },
        include: {
          items: {
            include: {
              product: { select: { name: true, code: true } },
              uom: { select: { name: true } },
            },
          },
          requestingWarehouse: { select: { name: true } },
          fulfillingWarehouse: { select: { name: true } },
        },
      });
    });
  }

  async getMaterialRequests(
    hospitalId: number,
    filters: { status?: MaterialRequestStatus; search?: string },
  ) {
    return this.prisma.materialRequest.findMany({
      where: {
        hospitalId,
        status: filters.status || undefined,
        OR: filters.search
          ? [
              {
                requestNumber: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },
              { notes: { contains: filters.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: {
        requestingWarehouse: { select: { name: true } },
        fulfillingWarehouse: { select: { name: true } },
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMaterialRequestById(hospitalId: number, id: number) {
    const req = await this.prisma.materialRequest.findFirst({
      where: { id, hospitalId },
      include: {
        requestingWarehouse: { select: { name: true } },
        fulfillingWarehouse: { select: { name: true } },
        requestedBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                code: true,
                baseUom: { select: { name: true } },
              },
            },
            uom: { select: { name: true } },
          },
        },
        stockIssues: {
          include: {
            issuedBy: { select: { fullName: true } },
            items: true,
          },
        },
      },
    });

    if (!req) {
      throw new NotFoundException('طلب المواد غير موجود.');
    }

    return req;
  }

  async approveMaterialRequest(hospitalId: number, id: number, userId: number) {
    const request = await this.prisma.materialRequest.findFirst({
      where: { id, hospitalId },
    });

    if (!request) {
      throw new NotFoundException('طلب المواد غير موجود.');
    }

    if (request.status !== MaterialRequestStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'يمكن فقط اعتماد الطلبات المعلقة للـ Approval.',
      );
    }

    const changed = await this.prisma.materialRequest.updateMany({
      where: { id, hospitalId, status: MaterialRequestStatus.PENDING_APPROVAL },
      data: {
        status: MaterialRequestStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });
    if (changed.count !== 1)
      throw new ConflictException('تغيرت حالة الطلب أثناء الاعتماد');
    return this.prisma.materialRequest.findFirstOrThrow({
      where: { id, hospitalId },
    });
  }

  async rejectMaterialRequest(
    hospitalId: number,
    id: number,
    userId: number,
    notes?: string,
  ) {
    const request = await this.prisma.materialRequest.findFirst({
      where: { id, hospitalId },
    });

    if (!request) {
      throw new NotFoundException('طلب المواد غير موجود.');
    }

    if (request.status !== MaterialRequestStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'يمكن فقط رفض الطلبات المعلقة للـ Approval.',
      );
    }

    const changed = await this.prisma.materialRequest.updateMany({
      where: { id, hospitalId, status: MaterialRequestStatus.PENDING_APPROVAL },
      data: {
        status: MaterialRequestStatus.REJECTED,
        notes: notes
          ? `${request.notes || ''}\nتم الرفض بواسطة المستخدم ${userId}: ${notes}`
          : request.notes,
      },
    });
    if (changed.count !== 1)
      throw new ConflictException('تغيرت حالة الطلب أثناء الرفض');
    return this.prisma.materialRequest.findFirstOrThrow({
      where: { id, hospitalId },
    });
  }

  // ==========================================
  //  صرف واستلام إذن الصرف (Stock Issue / FEFO)
  // ==========================================

  async issueMaterialRequest(params: {
    hospitalId: number;
    userId: number;
    materialRequestId: number;
    requestKey?: string;
    notes?: string;
    items?: { productId: number; quantity: number; batchNumber?: string }[];
  }) {
    return issueMaterialTransfer(this.prisma, params);
  }

  async receiveStockIssue(hospitalId: number, issueId: number, userId: number) {
    return receiveMaterialTransfer(this.prisma, hospitalId, issueId, userId);
  }
  // --- Phase 3: Auto-deplete service materials ---
  async autoDepleteServiceMaterials(
    hospitalId: number,
    serviceItemId: number,
    warehouseId: number,
    multiplier: number,
    userId: number,
    referenceId: number,
    referenceType: string,
  ) {
    if (!Number.isFinite(multiplier) || multiplier <= 0)
      throw new BadRequestException('معامل الاستهلاك يجب أن يكون موجبًا');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      const identity = {
        hospitalId,
        serviceItemId,
        referenceType,
        referenceId,
      };
      const existing = await tx.serviceMaterialConsumption.findUnique({
        where: { hospitalId_serviceItemId_referenceType_referenceId: identity },
      });
      if (
        existing &&
        (existing.userId !== userId ||
          (existing.warehouseId !== null &&
            existing.warehouseId !== warehouseId) ||
          !existing.multiplier.eq(multiplier))
      )
        throw new ConflictException('مرجع الاستهلاك مستخدم بحمولة مختلفة');
      if (existing?.status === 'COMPLETED') return;
      const operation =
        existing ??
        (await tx.serviceMaterialConsumption.create({
          data: {
            ...identity,
            userId,
            warehouseId,
            multiplier,
            materialsSnapshot: await captureConsumptionMaterials(
              tx,
              hospitalId,
              serviceItemId,
            ),
            snapshotVersion: 1,
          },
        }));
      if (
        !(await tx.serviceItem.findFirst({
          where: { id: serviceItemId, hospitalId },
        }))
      )
        throw new BadRequestException('الخدمة خارج المنشأة');
      if (
        !(await tx.warehouse.findFirst({
          where: { id: warehouseId, hospitalId, isActive: true },
        }))
      )
        throw new ConsumptionFailure('WAREHOUSE_UNAVAILABLE');
      if (operation.snapshotVersion !== 1)
        throw new ConflictException('عملية دون تعريف مواد مثبت؛تلزم المراجعة');
      const mappings = readConsumptionMaterials(operation.materialsSnapshot);

      if (mappings.length === 0) {
        await tx.serviceMaterialConsumption.update({
          where: { id: operation.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            warehouseId,
            error: null,
          },
        });
        return;
      }

      for (const id of [...new Set(mappings.map((m) => m.productId))].sort(
        (a, b) => a - b,
      )) {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id} AND "hospitalId"=${hospitalId} FOR UPDATE`;
      }
      // خريطة لتجميع التكاليف لكل فئة من حساب المخزون والمصروفات
      const categoryCostMap = new Map<
        string,
        {
          inventoryAccountId: number | null;
          expenseAccountId: number | null;
          totalCost: Prisma.Decimal;
        }
      >();

      for (const map of mappings) {
        const requiredQty = map.quantity.mul(multiplier);
        if (
          !requiredQty.isFinite() ||
          requiredQty.lte(0) ||
          requiredQty.decimalPlaces() > 3
        )
          throw new BadRequestException('كمية الاستهلاك تتجاوز دقة المخزون');
        const product = await tx.product.findFirst({
          where: {
            id: map.productId,
            hospitalId,
            isActive: true,
            isDeleted: false,
          },
          include: { category: true },
        });
        if (!product)
          throw new BadRequestException('الصنف خارج المنشأة أو غير نشط');
        if (!product.costPrice.isFinite() || product.costPrice.lt(0))
          throw new ConsumptionFailure('COST_INVALID');
        const inventoryAccountId = product.category?.inventoryAccountId || null;
        const expenseAccountId = product.category?.expenseAccountId || null;
        for (const [id, type] of [
          [inventoryAccountId, 'ASSET'],
          [expenseAccountId, 'EXPENSE'],
        ] as const) {
          if (
            id &&
            !(await tx.account.findFirst({
              where: { id, hospitalId, isActive: true, type },
            }))
          )
            throw new ConsumptionFailure('ACCOUNT_MAPPING_INVALID');
        }
        const key = `${inventoryAccountId || 'null'}-${expenseAccountId || 'null'}`;

        const stocks = await tx.productStock.findMany({
          where: {
            ...(await usableStockWhere(tx, hospitalId, map.productId)),
            warehouseId,
            quantity: { gt: 0 },
          },
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        });

        let rem = requiredQty;
        for (const st of stocks) {
          if (rem.lte(0)) break;
          const take = Prisma.Decimal.min(st.quantity, rem);

          const changed = await tx.productStock.updateMany({
            where: {
              id: st.id,
              hospitalId,
              version: st.version,
              quantity: { gte: take },
            },
            data: { quantity: { decrement: take }, version: { increment: 1 } },
          });
          if (changed.count !== 1)
            throw new ConflictException('تغير رصيد التشغيلة أثناء الاستهلاك');

          const unitCost = product.costPrice;
          const totalCost = new Prisma.Decimal(
            Money.toDbString(Money.multiply(product.costPrice, take)),
          );

          await tx.stockTransaction.create({
            data: {
              hospitalId,
              warehouseId,
              productId: map.productId,
              type: StockTransactionType.OUT,
              quantity: take,
              baseQuantity: take,
              unitCost,
              totalCost,
              batchNumber: st.batchNumber,
              expiryDate: st.expiryDate,
              referenceType,
              referenceId,
              notes: `خصم تلقائي لتنفيذ خدمة (Service ID: ${serviceItemId})`,
              createdById: userId,
            },
          });

          // تجميع تكاليف الصنف للفئة الخاصة به
          const existing = categoryCostMap.get(key) || {
            inventoryAccountId,
            expenseAccountId,
            totalCost: new Prisma.Decimal(0),
          };
          existing.totalCost = existing.totalCost.plus(totalCost);
          categoryCostMap.set(key, existing);

          rem = rem.minus(take);
        }

        if (rem.gt(0)) {
          throw new ConsumptionFailure('STOCK_INSUFFICIENT');
        }
        const changedProduct = await tx.product.updateMany({
          where: {
            id: product.id,
            hospitalId,
            stockOnHand: { gte: requiredQty },
          },
          data: {
            stockOnHand: { decrement: requiredQty },
            version: { increment: 1 },
          },
        });
        if (changedProduct.count !== 1)
          throw new ConsumptionFailure('SUMMARY_INSUFFICIENT');
      }

      // تسجيل القيود المحاسبية للتكلفة
      for (const [_, data] of categoryCostMap) {
        if (data.totalCost.gt(0)) {
          try {
            await this.accountingService.recordCogsEntry({
              sourceId: referenceId,
              hospitalId,
              userId,
              totalCost: data.totalCost,
              module: 'INVENTORY',
              tx,
              inventoryAccountId: data.inventoryAccountId,
              expenseAccountId: data.expenseAccountId,
            });
          } catch {
            throw new ConsumptionFailure('ACCOUNTING_POSTING_FAILED');
          }
        }
      }
      await tx.serviceMaterialConsumption.update({
        where: { id: operation.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          warehouseId,
          error: null,
        },
      });
    });
  }

  // ==========================================
  // Product UOM Management
  // ==========================================
  async getProductsWithUoms(hospitalId: number) {
    return this.prisma.product.findMany({
      where: { hospitalId, isActive: true, isDeleted: false },
      include: {
        baseUom: true,
        productUoms: {
          include: { uom: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async addProductUom(
    hospitalId: number,
    productId: number,
    dto: {
      uomId?: number | string;
      conversionRate?: number | string;
      isPurchasingUOM?: boolean;
      isIssuingUOM?: boolean;
    },
  ) {
    const uomId = Number(dto?.uomId);
    const rateStr = String(dto?.conversionRate ?? '');
    if (
      !Number.isInteger(uomId) ||
      uomId <= 0 ||
      !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(rateStr) ||
      new Prisma.Decimal(rateStr).lte(0)
    ) {
      throw new BadRequestException(
        'بيانات وحدة القياس أو معامل التحويل غير صالحة.',
      );
    }
    const conversionRate = new Prisma.Decimal(rateStr);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${productId} AND "hospitalId"=${hospitalId} FOR UPDATE`;

      const product = await tx.product.findFirst({
        where: { id: productId, hospitalId, isDeleted: false },
      });
      if (!product) {
        throw new NotFoundException('الصنف غير موجود في هذه المنشأة.');
      }

      const uom = await tx.unitOfMeasure.findFirst({
        where: { id: uomId, hospitalId, isActive: true },
      });
      if (!uom) {
        throw new BadRequestException(
          'وحدة القياس غير موجودة أو غير نشطة في هذه المنشأة.',
        );
      }

      if (product.baseUomId === uomId && !conversionRate.eq(1)) {
        throw new BadRequestException(
          'معامل التحويل للوحدة الأساسية للصنف يجب أن يساوي 1.',
        );
      }

      const existing = await tx.productUOM.findUnique({
        where: { productId_uomId: { productId, uomId } },
      });

      if (existing && !existing.conversionRate.eq(conversionRate)) {
        const [mrRefs, siRefs, prRefs, poRefs, grnRefs, stRefs] =
          await Promise.all([
            tx.materialRequestItem.count({ where: { productId, uomId } }),
            tx.stockIssueItem.count({ where: { productId, uomId } }),
            tx.purchaseRequestItem.count({ where: { productId, uomId } }),
            tx.purchaseOrderItem.count({ where: { productId, uomId } }),
            tx.goodsReceiptItem.count({ where: { productId, uomId } }),
            tx.stockTransaction.count({ where: { productId, uomId } }),
          ]);
        if (mrRefs + siRefs + prRefs + poRefs + grnRefs + stRefs > 0) {
          throw new ConflictException(
            'لا يمكن تعديل معامل التحويل لوحدة مستخدمة في طلبات أو أوامر أو حركات مخزنية؛ أنشئ وحدة جديدة.',
          );
        }
      }

      const isPurchasingUOM = Boolean(dto?.isPurchasingUOM);
      const isIssuingUOM = Boolean(dto?.isIssuingUOM);

      if (isPurchasingUOM) {
        await tx.productUOM.updateMany({
          where: { productId, uomId: { not: uomId } },
          data: { isPurchasingUOM: false },
        });
      }
      if (isIssuingUOM) {
        await tx.productUOM.updateMany({
          where: { productId, uomId: { not: uomId } },
          data: { isIssuingUOM: false },
        });
      }

      return tx.productUOM.upsert({
        where: {
          productId_uomId: {
            productId,
            uomId,
          },
        },
        update: {
          conversionRate: conversionRate.toFixed(3),
          isPurchasingUOM,
          isIssuingUOM,
        },
        create: {
          productId,
          uomId,
          conversionRate: conversionRate.toFixed(3),
          isPurchasingUOM,
          isIssuingUOM,
        },
      });
    });
  }

  async removeProductUom(hospitalId: number, productId: number, uomId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${productId} AND "hospitalId"=${hospitalId} FOR UPDATE`;

      const product = await tx.product.findFirst({
        where: { id: productId, hospitalId, isDeleted: false },
      });
      if (!product) {
        throw new NotFoundException('الصنف غير موجود في هذه المنشأة.');
      }

      const existing = await tx.productUOM.findUnique({
        where: { productId_uomId: { productId, uomId } },
      });
      if (!existing) {
        throw new NotFoundException('معامل التحويل غير موجود لهذا الصنف.');
      }

      const [mrRefs, siRefs, prRefs, poRefs, grnRefs, stRefs] =
        await Promise.all([
          tx.materialRequestItem.count({ where: { productId, uomId } }),
          tx.stockIssueItem.count({ where: { productId, uomId } }),
          tx.purchaseRequestItem.count({ where: { productId, uomId } }),
          tx.purchaseOrderItem.count({ where: { productId, uomId } }),
          tx.goodsReceiptItem.count({ where: { productId, uomId } }),
          tx.stockTransaction.count({ where: { productId, uomId } }),
        ]);
      if (mrRefs + siRefs + prRefs + poRefs + grnRefs + stRefs > 0) {
        throw new ConflictException(
          'لا يمكن حذف معامل التحويل لأنه مستخدم في طلبات أو أوامر أو حركات مخزنية.',
        );
      }

      return tx.productUOM.delete({
        where: {
          productId_uomId: {
            productId,
            uomId,
          },
        },
      });
    });
  }

  // ==========================================
  // Master Data
  // ==========================================
  async getItemCategories(hospitalId: number) {
    return this.prisma.itemCategory.findMany({
      where: { hospitalId, isActive: true },
      include: {
        inventoryAccount: true,
        expenseAccount: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createItemCategory(hospitalId: number, dto: Record<string, unknown>) {
    const name = typeof dto?.name === 'string' ? dto.name.trim() : '';
    const code =
      typeof dto?.code === 'string' && dto.code.trim()
        ? dto.code.trim().toUpperCase()
        : null;
    if (!name || name.length > 200) {
      throw new BadRequestException('اسم الفئة مطلوب ويجب ألا يتجاوز 200 حرف.');
    }

    const valuationMethod = dto?.valuationMethod || 'WEIGHTED_AVERAGE';
    if (valuationMethod !== 'WEIGHTED_AVERAGE') {
      throw new BadRequestException(
        'طريقة تقييم المخزون المعتمدة في النظام حالياً هي المتوسط المرجح (WEIGHTED_AVERAGE) فقط.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.itemCategory.findUnique({
        where: { hospitalId_name: { hospitalId, name } },
      });
      if (existing) {
        throw new ConflictException(
          'فئة بهذا الاسم موجودة مسبقاً في هذه المنشأة.',
        );
      }

      const parentId =
        dto?.parentId !== undefined &&
        dto?.parentId !== null &&
        dto?.parentId !== ''
          ? Number(dto.parentId)
          : null;
      if (parentId !== null) {
        if (!Number.isInteger(parentId) || parentId <= 0) {
          throw new BadRequestException('معرف الفئة الأب غير صالح.');
        }
        const parent = await tx.itemCategory.findFirst({
          where: { id: parentId, hospitalId, isActive: true },
        });
        if (!parent) {
          throw new BadRequestException(
            'الفئة الأب غير موجودة أو غير نشطة في هذه المنشأة.',
          );
        }
      }

      const inventoryAccountId =
        dto?.inventoryAccountId !== undefined &&
        dto?.inventoryAccountId !== null &&
        dto?.inventoryAccountId !== ''
          ? Number(dto.inventoryAccountId)
          : null;
      if (inventoryAccountId !== null) {
        if (!Number.isInteger(inventoryAccountId) || inventoryAccountId <= 0) {
          throw new BadRequestException('معرف حساب المخزون غير صالح.');
        }
        const invAccount = await tx.account.findFirst({
          where: {
            id: inventoryAccountId,
            hospitalId,
            isActive: true,
            type: 'ASSET',
          },
        });
        if (!invAccount) {
          throw new BadRequestException(
            'حساب المخزون يجب أن يكون حساب أصول (ASSET) نشطاً ضمن نفس المنشأة.',
          );
        }
      }

      const expenseAccountId =
        dto?.expenseAccountId !== undefined &&
        dto?.expenseAccountId !== null &&
        dto?.expenseAccountId !== ''
          ? Number(dto.expenseAccountId)
          : null;
      if (expenseAccountId !== null) {
        if (!Number.isInteger(expenseAccountId) || expenseAccountId <= 0) {
          throw new BadRequestException('معرف حساب التكلفة غير صالح.');
        }
        const expAccount = await tx.account.findFirst({
          where: {
            id: expenseAccountId,
            hospitalId,
            isActive: true,
            type: 'EXPENSE',
          },
        });
        if (!expAccount) {
          throw new BadRequestException(
            'حساب التكلفة/المصروف يجب أن يكون حساب مصروفات (EXPENSE) نشطاً ضمن نفس المنشأة.',
          );
        }
      }

      return tx.itemCategory.create({
        data: {
          hospitalId,
          name,
          code,
          valuationMethod: 'WEIGHTED_AVERAGE',
          inventoryAccountId,
          expenseAccountId,
          parentId,
        },
      });
    });
  }

  async getMasterProducts(hospitalId: number) {
    return this.prisma.product.findMany({
      where: { hospitalId, isDeleted: false },
      include: {
        category: true,
        baseUom: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createProduct(hospitalId: number, dto: Record<string, unknown>) {
    const name = typeof dto?.name === 'string' ? dto.name.trim() : '';
    const code =
      typeof dto?.code === 'string' ? dto.code.trim().toUpperCase() : '';
    if (!name || !code || name.length > 200 || code.length > 100) {
      throw new BadRequestException('اسم وكود الصنف مطلوبان وبطول صالح.');
    }

    const rawType = typeof dto?.type === 'string' ? dto.type.trim() : 'SUPPLY';
    const normalizedType = rawType === 'CONSUMABLE' ? 'SUPPLY' : rawType;
    if (
      !['DRUG', 'SUPPLY', 'ASSET', 'LAB_REAGENT', 'OTHER'].includes(
        normalizedType,
      )
    ) {
      throw new BadRequestException('نوع الصنف غير صالح.');
    }

    const decimalInput = (value: unknown) => {
      if (value === undefined || value === null) return '0';
      if (typeof value !== 'string' && typeof value !== 'number')
        throw new BadRequestException('يلزم مقدار عشري صالح');
      return String(value);
    };
    const costPriceStr = decimalInput(dto?.costPrice);
    const sellPriceStr = decimalInput(dto?.sellPrice);
    const minStockStr = decimalInput(dto?.minStock);
    if (
      !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(costPriceStr) ||
      !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(sellPriceStr) ||
      !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(minStockStr)
    ) {
      throw new BadRequestException(
        'التكلفة وسعر البيع والحد الأدنى للمخزون يجب أن تكون قيماً غير سالبة بدقة لا تتجاوز 3 منازل عشرية.',
      );
    }

    const minStockDec = new Prisma.Decimal(minStockStr);
    let maxStockDec: Prisma.Decimal | null = null;
    if (
      dto?.maxStock !== undefined &&
      dto?.maxStock !== null &&
      dto?.maxStock !== ''
    ) {
      const maxStockStr = decimalInput(dto.maxStock);
      if (!/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(maxStockStr)) {
        throw new BadRequestException('الحد الأعلى للمخزون غير صالح.');
      }
      const parsedMax = new Prisma.Decimal(maxStockStr);
      if (parsedMax.gt(0)) {
        if (parsedMax.lt(minStockDec)) {
          throw new BadRequestException(
            'الحد الأعلى للمخزون لا يمكن أن يكون أقل من الحد الأدنى.',
          );
        }
        maxStockDec = parsedMax;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { hospitalId_code: { hospitalId, code } },
      });
      if (existing) {
        throw new ConflictException('كود الصنف مستخدم مسبقاً في هذه المنشأة.');
      }

      const categoryId =
        dto?.categoryId !== undefined &&
        dto?.categoryId !== null &&
        dto?.categoryId !== ''
          ? Number(dto.categoryId)
          : null;
      if (categoryId !== null) {
        if (!Number.isInteger(categoryId) || categoryId <= 0) {
          throw new BadRequestException('معرف فئة الصنف غير صالح.');
        }
        const category = await tx.itemCategory.findFirst({
          where: { id: categoryId, hospitalId, isActive: true },
        });
        if (!category) {
          throw new BadRequestException(
            'فئة الصنف غير موجودة أو غير نشطة في هذه المنشأة.',
          );
        }
      }

      const baseUomId =
        dto?.baseUomId !== undefined &&
        dto?.baseUomId !== null &&
        dto?.baseUomId !== ''
          ? Number(dto.baseUomId)
          : null;
      if (baseUomId !== null) {
        if (!Number.isInteger(baseUomId) || baseUomId <= 0) {
          throw new BadRequestException('معرف الوحدة الأساسية غير صالح.');
        }
        const uom = await tx.unitOfMeasure.findFirst({
          where: { id: baseUomId, hospitalId, isActive: true },
        });
        if (!uom) {
          throw new BadRequestException(
            'الوحدة الأساسية غير موجودة أو غير نشطة في هذه المنشأة.',
          );
        }
      }

      const expenseAccountId =
        dto?.expenseAccountId !== undefined &&
        dto?.expenseAccountId !== null &&
        dto?.expenseAccountId !== ''
          ? Number(dto.expenseAccountId)
          : null;
      if (expenseAccountId !== null) {
        if (!Number.isInteger(expenseAccountId) || expenseAccountId <= 0) {
          throw new BadRequestException('معرف حساب المصروف غير صالح.');
        }
        const expAccount = await tx.account.findFirst({
          where: {
            id: expenseAccountId,
            hospitalId,
            isActive: true,
            type: 'EXPENSE',
          },
        });
        if (!expAccount) {
          throw new BadRequestException(
            'حساب المصروف للصنف يجب أن يكون حساب مصروفات (EXPENSE) نشطاً ضمن نفس المنشأة.',
          );
        }
      }

      return tx.product.create({
        data: {
          hospitalId,
          name,
          code,
          type: normalizedType as ProductType,
          categoryId,
          baseUomId,
          expenseAccountId,
          costPrice: Money.toDbString(costPriceStr),
          sellPrice: Money.toDbString(sellPriceStr),
          minStock: minStockDec.toFixed(3),
          maxStock: maxStockDec ? maxStockDec.toFixed(3) : null,
        },
      });
    });
  }

  async getUOMs(hospitalId: number) {
    return this.prisma.unitOfMeasure.findMany({
      where: { hospitalId },
      orderBy: { name: 'asc' },
    });
  }

  async createUOM(hospitalId: number, dto: Record<string, unknown>) {
    const code =
      typeof dto?.code === 'string' ? dto.code.trim().toUpperCase() : '';
    const name = typeof dto?.name === 'string' ? dto.name.trim() : '';
    if (!code || !name || code.length > 50 || name.length > 100) {
      throw new BadRequestException('رمز واسم وحدة القياس مطلوبان وبطول صالح.');
    }

    const existing = await this.prisma.unitOfMeasure.findUnique({
      where: { hospitalId_code: { hospitalId, code } },
    });
    if (existing) {
      throw new ConflictException(
        'رمز وحدة القياس موجود مسبقاً في هذه المنشأة.',
      );
    }

    return this.prisma.unitOfMeasure.create({
      data: {
        hospitalId,
        code,
        name,
        isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
      },
    });
  }

  async updateUOM(hospitalId: number, id: number, dto: any) {
    const existing = await this.prisma.unitOfMeasure.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('وحدة القياس غير موجودة في هذه المنشأة.');
    }

    const code =
      dto?.code !== undefined
        ? String(dto.code).trim().toUpperCase()
        : existing.code;
    const name =
      dto?.name !== undefined ? String(dto.name).trim() : existing.name;
    if (!code || !name || code.length > 50 || name.length > 100) {
      throw new BadRequestException('رمز واسم وحدة القياس مطلوبان وبطول صالح.');
    }

    if (code !== existing.code) {
      const dup = await this.prisma.unitOfMeasure.findUnique({
        where: { hospitalId_code: { hospitalId, code } },
      });
      if (dup && dup.id !== id) {
        throw new ConflictException(
          'رمز وحدة القياس موجود مسبقاً في هذه المنشأة.',
        );
      }
    }

    const nextActive =
      dto?.isActive !== undefined ? Boolean(dto.isActive) : existing.isActive;
    if (existing.isActive && !nextActive) {
      const [activeBaseProducts, openPOs, openPRs, openMRs] = await Promise.all(
        [
          this.prisma.product.count({
            where: {
              hospitalId,
              baseUomId: id,
              isActive: true,
              isDeleted: false,
            },
          }),
          this.prisma.purchaseOrderItem.count({
            where: {
              uomId: id,
              purchaseOrder: {
                hospitalId,
                status: { in: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'] },
              },
            },
          }),
          this.prisma.purchaseRequestItem.count({
            where: {
              uomId: id,
              purchaseRequest: {
                hospitalId,
                status: { in: ['PENDING', 'APPROVED'] },
              },
            },
          }),
          this.prisma.materialRequestItem.count({
            where: {
              uomId: id,
              materialRequest: {
                hospitalId,
                status: {
                  in: [
                    'DRAFT',
                    'PENDING_APPROVAL',
                    'APPROVED',
                    'PARTIALLY_ISSUED',
                  ],
                },
              },
            },
          }),
        ],
      );
      if (activeBaseProducts + openPOs + openPRs + openMRs > 0) {
        throw new ConflictException(
          'لا يمكن تعطيل وحدة قياس مرتبطة بأصناف نشطة أو طلبات مفتوحة.',
        );
      }
    }

    return this.prisma.unitOfMeasure.update({
      where: { id },
      data: {
        code,
        name,
        isActive: nextActive,
      },
    });
  }

  async deleteUOM(hospitalId: number, id: number) {
    const existing = await this.prisma.unitOfMeasure.findFirst({
      where: { id, hospitalId },
    });
    if (!existing) {
      throw new NotFoundException('وحدة القياس غير موجودة في هذه المنشأة.');
    }

    const [
      productsCount,
      productUomsCount,
      mrItemsCount,
      siItemsCount,
      prItemsCount,
      poItemsCount,
      grnItemsCount,
      stCount,
    ] = await Promise.all([
      this.prisma.product.count({ where: { baseUomId: id } }),
      this.prisma.productUOM.count({ where: { uomId: id } }),
      this.prisma.materialRequestItem.count({ where: { uomId: id } }),
      this.prisma.stockIssueItem.count({ where: { uomId: id } }),
      this.prisma.purchaseRequestItem.count({ where: { uomId: id } }),
      this.prisma.purchaseOrderItem.count({ where: { uomId: id } }),
      this.prisma.goodsReceiptItem.count({ where: { uomId: id } }),
      this.prisma.stockTransaction.count({ where: { uomId: id } }),
    ]);

    if (
      productsCount +
        productUomsCount +
        mrItemsCount +
        siItemsCount +
        prItemsCount +
        poItemsCount +
        grnItemsCount +
        stCount >
      0
    ) {
      throw new ConflictException(
        'لا يمكن حذف وحدة القياس لأنها مرتبطة بأصناف أو طلبات أو حركات مخزنية.',
      );
    }

    return this.prisma.unitOfMeasure.delete({
      where: { id },
    });
  }

  private async getNextSequence(
    tx: any,
    hospitalId: number,
    prefix: 'MR',
  ): Promise<string> {
    await tx.$executeRaw`SELECT 1 FROM "Hospital" WHERE id = ${hospitalId} FOR UPDATE`;

    const last = await tx.materialRequest.findFirst({
      where: { hospitalId, requestNumber: { startsWith: 'MR-' } },
      orderBy: { id: 'desc' },
      select: { requestNumber: true },
    });
    const lastNumber = last?.requestNumber || null;

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
