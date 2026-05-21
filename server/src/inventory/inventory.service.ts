// src/inventory/inventory.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockTransactionType, MaterialRequestStatus, StockIssueStatus, Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // فحص تنبيهات المخزون (نقص الكمية + قرب انتهاء الصلاحية)
  async monitorStockLevels(hospitalId: number) {
    // 1. فحص المنتجات التي وصلت لحد الطلب
    const lowStockProducts = await this.prisma.product.findMany({
      where: {
        hospitalId,
        isActive: true,
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
      .filter((p) => Number(p.stockOnHand) <= Number(p.minStock))
      .map((p) => ({
        type: 'LOW_STOCK',
        productId: p.id,
        productName: p.name,
        currentStock: Number(p.stockOnHand),
        minStock: Number(p.minStock),
        message: `الرصيد الحالي (${Number(p.stockOnHand)}) أقل من أو يساوي حد الطلب (${Number(p.minStock)})`,
      }));

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
    return this.prisma.productStock.findMany({
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
  }

  // إجراء تحويل مخزني مع القفل التفاؤلي (Optimistic Locking)
  async transferStock(params: {
    hospitalId: number;
    userId: number;
    fromWarehouseId: number;
    toWarehouseId: number;
    items: { productId: number; quantity: number }[];
    notes?: string;
  }) {
    const { hospitalId, userId, fromWarehouseId, toWarehouseId, items, notes } =
      params;

    if (fromWarehouseId === toWarehouseId) {
      throw new BadRequestException('لا يمكن التحويل لنفس المخزن.');
    }

    if (!items.length) {
      throw new BadRequestException('يجب اختيار صنف واحد على الأقل.');
    }

    return this.prisma.$transaction(async (tx) => {
      const fromWh = await tx.warehouse.findUnique({
        where: { id: fromWarehouseId },
      });
      const toWh = await tx.warehouse.findUnique({
        where: { id: toWarehouseId },
      });

      if (!fromWh || !toWh) {
        throw new NotFoundException('أحد المخازن غير موجود.');
      }

      const transferRefId = Math.floor(Date.now() / 1000);

      for (const item of items) {
        const qty = Number(item.quantity);
        if (qty <= 0) continue;

        const batchNo = 'GENERAL';

        const sourceStock = await tx.productStock.findUnique({
          where: {
            warehouseId_productId_batchNumber: {
              warehouseId: fromWarehouseId,
              productId: item.productId,
              batchNumber: batchNo,
            },
          },
          include: { product: true },
        });

        if (!sourceStock || Number(sourceStock.quantity) < qty) {
          const prodName = sourceStock?.product?.name
            ? sourceStock.product.name
            : ((await tx.product.findUnique({ where: { id: item.productId } }))
                ?.name ?? 'Unknown');

          throw new BadRequestException(
            `رصيد غير كافٍ للمنتج ${prodName} (تشغيلة: ${batchNo}) في المخزن المصدر.`,
          );
        }

        const costPrice = Number(sourceStock.product.costPrice ?? 0);

        // خصم من المصدر مع Optimistic Lock
        const updateResult = await tx.productStock.updateMany({
          where: {
            id: sourceStock.id,
            version: sourceStock.version,
          },
          data: {
            quantity: { decrement: qty },
            version: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            `فشل التحويل: تغير رصيد المنتج "${sourceStock.product.name}" أثناء العملية.`,
          );
        }

        // تسجيل حركة خروج (OUT) - Transfer Out
        await tx.stockTransaction.create({
          data: {
            hospitalId,
            warehouseId: fromWarehouseId,
            productId: item.productId,
            type: StockTransactionType.OUT,
            quantity: qty,
            unitCost: costPrice,
            totalCost: costPrice * qty,
            batchNumber: batchNo,
            expiryDate: sourceStock.expiryDate,
            referenceType: 'TRANSFER_OUT',
            referenceId: transferRefId,
            notes: `تحويل إلى ${toWh.name} - ${notes ?? ''}`,
            createdById: userId,
          },
        });

        // إضافة للمستلم (Upsert)
        await tx.productStock.upsert({
          where: {
            warehouseId_productId_batchNumber: {
              warehouseId: toWarehouseId,
              productId: item.productId,
              batchNumber: batchNo,
            },
          },
          update: {
            quantity: { increment: qty },
          },
          create: {
            hospitalId,
            warehouseId: toWarehouseId,
            productId: item.productId,
            batchNumber: batchNo,
            expiryDate: sourceStock.expiryDate,
            quantity: qty,
            version: 1,
          },
        });

        // تسجيل حركة دخول (IN) - Transfer In
        await tx.stockTransaction.create({
          data: {
            hospitalId,
            warehouseId: toWarehouseId,
            productId: item.productId,
            type: StockTransactionType.IN,
            quantity: qty,
            unitCost: costPrice,
            totalCost: costPrice * qty,
            batchNumber: batchNo,
            expiryDate: sourceStock.expiryDate,
            referenceType: 'TRANSFER_IN',
            referenceId: transferRefId,
            notes: `تحويل من ${fromWh.name} - ${notes ?? ''}`,
            createdById: userId,
          },
        });
      }

      return { success: true, transferRefId };
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
  ): Promise<number> {
    if (!fromUomId || !toUomId || fromUomId === toUomId) {
      return qty;
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { baseUomId: true },
    });

    if (!product) {
      throw new NotFoundException('المنتج غير موجود.');
    }

    // التحويل من UOM المصدر إلى UOM الأساسي للـ product
    let qtyInBase = qty;
    if (fromUomId !== product.baseUomId) {
      const fromConv = await this.prisma.productUOM.findUnique({
        where: { productId_uomId: { productId, uomId: fromUomId } },
      });
      if (!fromConv) {
        throw new BadRequestException('وحدة القياس المصدر غير صالحة لهذا الصنف.');
      }
      qtyInBase = qty * Number(fromConv.conversionRate);
    }

    // التحويل من UOM الأساسي إلى UOM الهدف
    if (toUomId === product.baseUomId) {
      return qtyInBase;
    }

    const toConv = await this.prisma.productUOM.findUnique({
      where: { productId_uomId: { productId, uomId: toUomId } },
    });
    if (!toConv) {
      throw new BadRequestException('وحدة القياس الهدف غير صالحة لهذا الصنف.');
    }
    return qtyInBase / Number(toConv.conversionRate);
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
    items: { productId: number; uomId?: number; requestedQty: number; notes?: string }[];
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

    const reqNumber = `MR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const requireApproval = await this.isApprovalRequired(hospitalId);
    const initialStatus = requireApproval
      ? MaterialRequestStatus.PENDING_APPROVAL
      : MaterialRequestStatus.APPROVED;

    return this.prisma.materialRequest.create({
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
              { requestNumber: { contains: filters.search, mode: 'insensitive' } },
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
            product: { select: { name: true, code: true, baseUom: { select: { name: true } } } },
            uom: { select: { name: true } },
          },
        },
        stockIssues: {
          include: {
            issuedBy: { select: { fullName: true } },
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
      throw new BadRequestException('يمكن فقط اعتماد الطلبات المعلقة للـ Approval.');
    }

    return this.prisma.materialRequest.update({
      where: { id },
      data: {
        status: MaterialRequestStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });
  }

  async rejectMaterialRequest(hospitalId: number, id: number, userId: number, notes?: string) {
    const request = await this.prisma.materialRequest.findFirst({
      where: { id, hospitalId },
    });

    if (!request) {
      throw new NotFoundException('طلب المواد غير موجود.');
    }

    if (request.status !== MaterialRequestStatus.PENDING_APPROVAL) {
      throw new BadRequestException('يمكن فقط رفض الطلبات المعلقة للـ Approval.');
    }

    return this.prisma.materialRequest.update({
      where: { id },
      data: {
        status: MaterialRequestStatus.REJECTED,
        notes: notes ? `${request.notes || ''}\nتم الرفض بواسطة المستخدم ${userId}: ${notes}` : request.notes,
      },
    });
  }

  // ==========================================
  //  صرف واستلام إذن الصرف (Stock Issue / FEFO)
  // ==========================================

  async issueMaterialRequest(params: {
    hospitalId: number;
    userId: number;
    materialRequestId: number;
    notes?: string;
    items?: { productId: number; quantity: number; batchNumber?: string }[];
  }) {
    const { hospitalId, userId, materialRequestId, notes, items } = params;

    return this.prisma.$transaction(async (tx) => {
      const mr = await tx.materialRequest.findFirst({
        where: { id: materialRequestId, hospitalId },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, costPrice: true, baseUomId: true } },
            },
          },
        },
      });

      if (!mr) {
        throw new NotFoundException('طلب المواد غير موجود.');
      }

      if (
        mr.status !== MaterialRequestStatus.APPROVED &&
        mr.status !== MaterialRequestStatus.PARTIALLY_ISSUED
      ) {
        throw new BadRequestException('لا يمكن الصرف لطلب غير معتمد أو تم صرفه بالكامل.');
      }

      const issueNumber = `SI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      // إنشاء مستند إذن الصرف
      const stockIssue = await tx.stockIssue.create({
        data: {
          hospitalId,
          issueNumber,
          materialRequestId,
          issuedFromId: mr.fulfillingWarehouseId,
          issuedById: userId,
          status: StockIssueStatus.ISSUED,
          notes,
        },
      });

      let allCompleted = true;

      for (const reqItem of mr.items) {
        const remainingToIssue = Number(reqItem.requestedQty) - Number(reqItem.issuedQty);
        if (remainingToIssue <= 0) continue;

        let issueQty = remainingToIssue;
        let chosenBatch: string | undefined = undefined;

        if (items) {
          const specific = items.find((i) => i.productId === reqItem.productId);
          if (!specific) {
            allCompleted = false;
            continue;
          }
          issueQty = specific.quantity;
          chosenBatch = specific.batchNumber;
        }

        if (issueQty <= 0) {
          allCompleted = false;
          continue;
        }

        const product = reqItem.product;
        let issueQtyInBase = issueQty;

        // التحويل إلى الوحدة الأساسية
        if (reqItem.uomId && reqItem.uomId !== product.baseUomId) {
          const uomConv = await tx.productUOM.findFirst({
            where: { productId: reqItem.productId, uomId: reqItem.uomId },
          });
          if (!uomConv) {
            throw new BadRequestException(`وحدة القياس المحددة للصنف ${product.name} غير صالحة.`);
          }
          issueQtyInBase = issueQty * Number(uomConv.conversionRate);
        }

        // تخصيص التشغيلات (Batches Allocation)
        let allocations: { batchNumber: string | null; quantity: number; expiryDate: Date | null }[] = [];
        if (chosenBatch) {
          const stock = await tx.productStock.findFirst({
            where: {
              warehouseId: mr.fulfillingWarehouseId,
              productId: reqItem.productId,
              batchNumber: chosenBatch,
            },
          });
          if (!stock || Number(stock.quantity) < issueQtyInBase) {
            throw new BadRequestException(
              `الرصيد غير كافٍ للصنف ${product.name} (التشغيلة: ${chosenBatch}) في المخزن المصدر. المتاح: ${stock?.quantity || 0}`,
            );
          }
          allocations = [
            {
              batchNumber: chosenBatch,
              quantity: issueQtyInBase,
              expiryDate: stock.expiryDate,
            },
          ];
        } else {
          // FEFO
          const stocks = await tx.productStock.findMany({
            where: {
              warehouseId: mr.fulfillingWarehouseId,
              productId: reqItem.productId,
              quantity: { gt: 0 },
            },
            orderBy: [
              { expiryDate: 'asc' },
              { createdAt: 'asc' },
            ],
          });

          let rem = issueQtyInBase;
          for (const st of stocks) {
            if (rem <= 0) break;
            const avail = Number(st.quantity);
            const take = Math.min(avail, rem);
            allocations.push({
              batchNumber: st.batchNumber,
              quantity: take,
              expiryDate: st.expiryDate,
            });
            rem -= take;
          }

          if (rem > 0) {
            throw new BadRequestException(
              `رصيد غير كافٍ للصنف ${product.name} في المخزن المصدر. المطلوب: ${issueQtyInBase} (بالوحدة الأساسية).`,
            );
          }
        }

        // خصم المخزون وإنشاء الحركات
        for (const alloc of allocations) {
          const stock = await tx.productStock.findFirst({
            where: {
              warehouseId: mr.fulfillingWarehouseId,
              productId: reqItem.productId,
              batchNumber: alloc.batchNumber,
            },
          });

          if (!stock) {
            throw new BadRequestException('سجل المخزون غير موجود.');
          }

          const updateResult = await tx.productStock.updateMany({
            where: {
              id: stock.id,
              version: stock.version,
            },
            data: {
              quantity: { decrement: alloc.quantity },
              version: { increment: 1 },
            },
          });

          if (updateResult.count === 0) {
            throw new ConflictException(
              `فشل صرف الصنف "${product.name}": تضارب في المعاملة أثناء تعديل المخزون.`,
            );
          }

          // تسجيل حركة خروج
          const costPrice = Number(product.costPrice || 0);
          await tx.stockTransaction.create({
            data: {
              hospitalId,
              warehouseId: mr.fulfillingWarehouseId,
              productId: reqItem.productId,
              type: StockTransactionType.OUT,
              quantity: alloc.quantity,
              unitCost: costPrice,
              totalCost: costPrice * alloc.quantity,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
              referenceType: 'MATERIAL_ISSUE',
              referenceId: stockIssue.id,
              notes: `صرف لطلب رقم ${mr.requestNumber} - ${notes || ''}`,
              createdById: userId,
            },
          });

          // إنشاء بند إذن الصرف المنصرف
          await tx.stockIssueItem.create({
            data: {
              stockIssueId: stockIssue.id,
              productId: reqItem.productId,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
              issuedQty: new Prisma.Decimal(alloc.quantity),
            },
          });
        }

        // تحديث الكمية المصروفة على بند الطلب الأصلي
        await tx.materialRequestItem.update({
          where: { id: reqItem.id },
          data: {
            issuedQty: { increment: issueQty },
          },
        });

        const updatedReqItem = await tx.materialRequestItem.findUnique({
          where: { id: reqItem.id },
        });

        if (
          updatedReqItem &&
          Number(updatedReqItem.issuedQty) < Number(updatedReqItem.requestedQty)
        ) {
          allCompleted = false;
        }
      }

      // تحديث حالة طلب المواد
      const nextStatus = allCompleted
        ? MaterialRequestStatus.COMPLETED
        : MaterialRequestStatus.PARTIALLY_ISSUED;

      await tx.materialRequest.update({
        where: { id: materialRequestId },
        data: { status: nextStatus },
      });

      return { success: true, stockIssueId: stockIssue.id, issueNumber };
    });
  }

  async receiveStockIssue(hospitalId: number, issueId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const issue = await tx.stockIssue.findFirst({
        where: { id: issueId, hospitalId },
        include: {
          items: true,
          materialRequest: true,
        },
      });

      if (!issue) {
        throw new NotFoundException('إذن الصرف غير موجود.');
      }

      if (issue.status !== StockIssueStatus.ISSUED) {
        throw new BadRequestException('إذن الصرف مسبق الاستلام أو ملغي.');
      }

      for (const item of issue.items) {
        const qty = Number(item.issuedQty);

        // إضافة للمستلم (Upsert)
        const existingStock = await tx.productStock.findFirst({
          where: {
            warehouseId: issue.materialRequest.requestingWarehouseId,
            productId: item.productId,
            batchNumber: item.batchNumber,
          },
        });

        if (existingStock) {
          await tx.productStock.update({
            where: { id: existingStock.id },
            data: { quantity: { increment: qty } },
          });
        } else {
          await tx.productStock.create({
            data: {
              hospitalId,
              warehouseId: issue.materialRequest.requestingWarehouseId,
              productId: item.productId,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              quantity: qty,
              version: 1,
            },
          });
        }

        // الحصول على تكلفة الشراء
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { costPrice: true },
        });
        const costPrice = Number(product?.costPrice || 0);

        // تسجيل حركة دخول
        await tx.stockTransaction.create({
          data: {
            hospitalId,
            warehouseId: issue.materialRequest.requestingWarehouseId,
            productId: item.productId,
            type: StockTransactionType.IN,
            quantity: qty,
            unitCost: costPrice,
            totalCost: costPrice * qty,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            referenceType: 'MATERIAL_RECEIVE',
            referenceId: issue.id,
            notes: `استلام إذن صرف رقم ${issue.issueNumber}`,
            createdById: userId,
          },
        });
      }

      // تحديث حالة إذن الصرف إلى RECEIVED
      await tx.stockIssue.update({
        where: { id: issueId },
        data: {
          status: StockIssueStatus.RECEIVED,
        },
      });

      return { success: true };
    });
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
    const mappings = await this.prisma.serviceItemProduct.findMany({
      where: { serviceItemId, isMandatory: true },
      include: { product: true },
    });

    if (mappings.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const map of mappings) {
        const requiredQty = Number(map.quantity) * multiplier;
        const product = map.product;

        const stocks = await tx.productStock.findMany({
          where: {
            hospitalId,
            warehouseId,
            productId: map.productId,
            quantity: { gt: 0 },
          },
          orderBy: [
            { expiryDate: 'asc' },
            { createdAt: 'asc' },
          ],
        });

        let rem = requiredQty;
        for (const st of stocks) {
          if (rem <= 0) break;
          const avail = Number(st.quantity);
          const take = Math.min(avail, rem);
          
          await tx.productStock.update({
            where: { id: st.id },
            data: { quantity: { decrement: take } },
          });

          await tx.stockTransaction.create({
            data: {
              hospitalId,
              warehouseId,
              productId: map.productId,
              type: StockTransactionType.OUT,
              quantity: take,
              unitCost: Number(product.costPrice || 0),
              totalCost: Number(product.costPrice || 0) * take,
              batchNumber: st.batchNumber,
              expiryDate: st.expiryDate,
              referenceType,
              referenceId,
              notes: `خصم تلقائي لتنفيذ خدمة (Service ID: ${serviceItemId})`,
              createdById: userId,
            },
          });

          rem -= take;
        }

        if (rem > 0) {
          throw new BadRequestException(
            `رصيد غير كافٍ للصنف ${product.name} (ID: ${product.id}) في المستودع لإتمام الخدمة. مطلوب ${rem} إضافية.`,
          );
        }
      }
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
          include: { uom: true }
        }
      },
      orderBy: { name: 'asc' }
    });
  }

  async addProductUom(productId: number, dto: any) {
    return this.prisma.productUOM.upsert({
      where: {
        productId_uomId: {
          productId,
          uomId: dto.uomId,
        }
      },
      update: {
        conversionRate: dto.conversionRate,
        isPurchasingUOM: dto.isPurchasingUOM,
        isIssuingUOM: dto.isIssuingUOM,
      },
      create: {
        productId,
        uomId: dto.uomId,
        conversionRate: dto.conversionRate,
        isPurchasingUOM: dto.isPurchasingUOM || false,
        isIssuingUOM: dto.isIssuingUOM || false,
      }
    });
  }

  async removeProductUom(productId: number, uomId: number) {
    return this.prisma.productUOM.delete({
      where: {
        productId_uomId: {
          productId,
          uomId,
        }
      }
    });
  }
}
