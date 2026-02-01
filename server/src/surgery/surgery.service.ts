import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SurgeryStatus,
  SurgeryRole,
  StockTransactionType,
  ChargeSource,
} from '@prisma/client';

@Injectable()
export class SurgeryService {
  private readonly logger = new Logger(SurgeryService.name);
  constructor(private prisma: PrismaService) {}

  // --------------------------------------------------------
  // 🏥 Helper: تحديد مخزون العمليات
  // --------------------------------------------------------
  private async getOTWarehouseId(hospitalId: number): Promise<number> {
    // نبحث عن مخزون يحمل اسم "عمليات" أو "Operations" أو "OT"
    const wh = await this.prisma.warehouse.findFirst({
      where: {
        hospitalId,
        isActive: true,
        OR: [
          { name: { contains: 'Operation', mode: 'insensitive' } },
          { name: { contains: 'OT', mode: 'insensitive' } },
          { name: { contains: 'عمليات', mode: 'insensitive' } },
        ],
      },
    });

    if (wh) return wh.id;

    // إذا لم نجد، نستخدم أول مخزن متاح (مع التحذير) أو نمنع العملية
    // للأمان سنمنع العملية لتجبار الإعداد الصحيح
    throw new BadRequestException(
      'لم يتم العثور على "مخزن عمليات" معرف في النظام. يرجى إنشاء مخزن باسم "Operations Store" أو "مخزون العمليات".',
    );
  }

  // --------------------------------------------------------
  // 1. التعريفات (غرف العمليات)
  // --------------------------------------------------------
  async getTheatres(hospitalId: number) {
    return this.prisma.operatingTheatre.findMany({
      where: { hospitalId, isActive: true },
    });
  }

  async createTheatre(hospitalId: number, name: string) {
    return this.prisma.operatingTheatre.create({
      data: { hospitalId, name },
    });
  }

  // --------------------------------------------------------
  // 2. حجز وجدولة عملية (Booking)
  // --------------------------------------------------------
  async scheduleSurgery(params: {
    hospitalId: number;
    encounterId: number;
    theatreId: number;
    surgeryName: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    serviceItemId?: number; // لربطها بسعر الخدمة (Package Price)
    surgeonId?: number; // الجراح الأساسي (اختياري مبدئياً)
  }) {
    const { hospitalId, encounterId, theatreId, scheduledStart, scheduledEnd } =
      params;

    // التحقق من تضارب المواعيد (بسيط)
    const conflict = await this.prisma.surgeryCase.findFirst({
      where: {
        hospitalId,
        theatreId,
        status: { not: 'CANCELLED' },
        OR: [
          {
            scheduledStart: { lt: scheduledEnd },
            scheduledEnd: { gt: scheduledStart },
          },
        ],
      },
    });

    if (conflict) {
      throw new BadRequestException('غرفة العمليات مشغولة في هذا التوقيت.');
    }

    const surgery = await this.prisma.surgeryCase.create({
      data: {
        hospitalId,
        encounterId,
        theatreId,
        surgeryName: params.surgeryName,
        serviceItemId: params.serviceItemId,
        scheduledStart,
        scheduledEnd,
        status: SurgeryStatus.SCHEDULED,
      },
    });

    // إذا تم تحديد جراح، نضيفه للطاقم فوراً
    if (params.surgeonId) {
      await this.addTeamMember(
        hospitalId,
        surgery.id,
        params.surgeonId,
        SurgeryRole.SURGEON,
      );
    }

    return surgery;
  }

  async getSurgeryCases(hospitalId: number, date?: Date) {
    const where: any = { hospitalId };
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.scheduledStart = { gte: start, lte: end };
    }

    return this.prisma.surgeryCase.findMany({
      where,
      include: {
        // ✅ [تصحيح] جلب المريض من خلال Encounter بدلاً من طلبه مباشرة
        encounter: {
          include: {
            patient: {
              select: { fullName: true, mrn: true },
            },
          },
        },
        theatre: true,
        team: {
          include: {
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  async getCaseDetails(hospitalId: number, caseId: number) {
    return this.prisma.surgeryCase.findFirst({
      where: { id: caseId, hospitalId },
      include: {
        encounter: { include: { patient: true } },
        theatre: true,
        team: { include: { user: true } },
        consumables: { include: { product: true } },
        serviceItem: true,
      },
    });
  }

  // --------------------------------------------------------
  // 3. إدارة الحالة (Start / End)
  // --------------------------------------------------------
  async updateStatus(
    hospitalId: number,
    caseId: number,
    status: SurgeryStatus,
  ) {
    const data: any = { status };
    if (status === SurgeryStatus.IN_PROGRESS) {
      data.actualStart = new Date();
    } else if (status === SurgeryStatus.COMPLETED) {
      data.actualEnd = new Date();
    }

    // عند الاكتمال، يمكننا هنا إضافة "رسوم العملية" (Professional Fee) للفاتورة إذا لم تضف مسبقاً

    return this.prisma.surgeryCase.update({
      where: { id: caseId, hospitalId },
      data,
    });
  }

  // --------------------------------------------------------
  // 4. إدارة الطاقم (Team)
  // --------------------------------------------------------
  async addTeamMember(
    hospitalId: number,
    caseId: number,
    userId: number,
    role: SurgeryRole,
    commissionAmount?: number,
  ) {
    return this.prisma.surgeryTeam.create({
      data: {
        surgeryCaseId: caseId,
        userId,
        role,
        commissionAmount: commissionAmount ? commissionAmount : null,
      },
    });
  }

  async removeTeamMember(id: number) {
    return this.prisma.surgeryTeam.delete({ where: { id } });
  }

  // --------------------------------------------------------
  // 5. استهلاك المواد (Consumables) من مخزن العمليات
  // --------------------------------------------------------
  async addConsumable(params: {
    hospitalId: number;
    userId: number; // المستخدم الذي سجل الحركة
    caseId: number;
    productId: number;
    quantity: number;
  }) {
    const { hospitalId, userId, caseId, productId, quantity } = params;

    // 1. تحديد مخزن العمليات
    const otWarehouseId = await this.getOTWarehouseId(hospitalId);

    return this.prisma.$transaction(async (tx) => {
      // 2. 🛡️ حجز الأرصدة ومنع التضارب (Pessimistic Locking)
      // نستخدم FEFO: الصرف من الأقرب انتهاءً أولاً
      const stocks = await tx.$queryRaw<any[]>`
        SELECT id, quantity, "batchNumber", "expiryDate"
        FROM "ProductStock"
        WHERE "warehouseId" = ${otWarehouseId} 
          AND "productId" = ${productId} 
          AND "quantity" > 0
        ORDER BY "expiryDate" ASC, "createdAt" ASC
        FOR UPDATE
      `;

      const totalAvail = stocks.reduce((acc, s) => acc + Number(s.quantity), 0);

      if (totalAvail < quantity) {
        throw new BadRequestException(
          `الكمية غير متوفرة في مخزن العمليات لهذا الصنف. المتاح: ${totalAvail}, المطلوب: ${quantity}`,
        );
      }

      // 3. جلب بيانات المنتج للحصول على الأسعار والتكلفة
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product)
        throw new NotFoundException('المنتج غير موجود في قاعدة البيانات');

      let remainingQty = quantity;
      let totalUsageCost = 0;

      // 4. الخصم من التشغيلات بناءً على الحجز الصارم (FEFO)
      for (const stock of stocks) {
        if (remainingQty <= 0) break;

        const availableInBatch = Number(stock.quantity);
        const take = Math.min(remainingQty, availableInBatch);

        // أ) تحديث رصيد التشغيلة في المخزن
        await tx.productStock.update({
          where: { id: stock.id },
          data: { quantity: { decrement: take } },
        });

        // ب) تسجيل حركة مخزنية تفصيلية لكل تشغيلة
        await tx.stockTransaction.create({
          data: {
            hospitalId,
            warehouseId: otWarehouseId,
            productId,
            type: StockTransactionType.OUT,
            quantity: take,
            unitCost: product.costPrice,
            totalCost: Number(product.costPrice) * take,
            referenceType: 'SURGERY_CONSUMABLE',
            referenceId: caseId,
            createdById: userId,
            batchNumber: stock.batchNumber,
            expiryDate: stock.expiryDate,
          },
        });

        remainingQty -= take;
        totalUsageCost += Number(product.costPrice) * take;
      }

      // 5. تحديث إجمالي الرصيد في جدول المنتجات الرئيسي
      await tx.product.update({
        where: { id: productId },
        data: { stockOnHand: { decrement: quantity } },
      });

      // 6. تسجيل المستهلك في سجل العملية الجراحية
      const totalSalesPrice = Number(product.sellPrice) * quantity;

      const consumable = await tx.surgeryConsumable.create({
        data: {
          surgeryCaseId: caseId,
          productId,
          quantity,
          unitPrice: product.sellPrice,
          totalPrice: totalSalesPrice,
        },
      });

      // 7. إضافة التكلفة لفاتورة المريض (Encounter Charge)
      const surgeryCase = await tx.surgeryCase.findUnique({
        where: { id: caseId },
        select: { encounterId: true },
      });

      if (!surgeryCase)
        throw new NotFoundException('العملية الجراحية غير موجودة');

      // البحث عن كود خدمة المستهلكات (يجب أن يكون موجوداً في السيرفس كاتالوج)
      let serviceItem = await tx.serviceItem.findFirst({
        where: { hospitalId, code: 'SURGERY-CONS', isActive: true },
      });

      // Fallback: إذا لم نجد الكود المخصص، نستخدم كود الصيدلية العام
      if (!serviceItem) {
        serviceItem = await tx.serviceItem.findFirst({
          where: { hospitalId, code: 'PHARMACY-DRUGS', isActive: true },
        });
      }

      if (serviceItem) {
        await tx.encounterCharge.create({
          data: {
            hospitalId,
            encounterId: surgeryCase.encounterId,
            serviceItemId: serviceItem.id,
            sourceType: ChargeSource.OTHER,
            sourceId: consumable.id,
            quantity: 1,
            unitPrice: totalSalesPrice,
            totalAmount: totalSalesPrice,
          },
        });
      } else {
        this.logger.warn(
          `Could not find a ServiceItem for billing surgery consumable ${product.name}`,
        );
      }

      return consumable;
    });
  }

  // --------------------------------------------------------
  // 5. استهلاك المواد (Consumables) من مخزن العمليات
  // // --------------------------------------------------------
  // async addConsumable(params: {
  //   hospitalId: number;
  //   userId: number; // المستخدم الذي سجل الحركة
  //   caseId: number;
  //   productId: number;
  //   quantity: number;
  // }) {
  //   const { hospitalId, userId, caseId, productId, quantity } = params;

  //   // 1. تحديد مخزن العمليات
  //   const otWarehouseId = await this.getOTWarehouseId(hospitalId);

  //   return this.prisma.$transaction(async (tx) => {
  //     // 2. التحقق من توفر الكمية في مخزن العمليات (إجمالي الرصيد بغض النظر عن التشغيلة للتبسيط، أو استخدام FEFO كما في الصيدلية)
  //     // للسرعة هنا، سنستخدم أي تشغيلة متوفرة (FEFO مبسط)

  //     const stocks = await tx.productStock.findMany({
  //       where: { warehouseId: otWarehouseId, productId, quantity: { gt: 0 } },
  //       orderBy: { expiryDate: 'asc' },
  //     });

  //     const totalAvail = stocks.reduce((acc, s) => acc + Number(s.quantity), 0);
  //     if (totalAvail < quantity) {
  //       throw new BadRequestException(
  //         `الكمية غير متوفرة في مخزن العمليات. المتاح: ${totalAvail}`,
  //       );
  //     }

  //     // 3. جلب بيانات المنتج للسعر
  //     const product = await tx.product.findUnique({ where: { id: productId } });
  //     if (!product) throw new NotFoundException('المنتج غير موجود');

  //     let remainingQty = quantity;
  //     let totalCost = 0;

  //     // الخصم من التشغيلات (FEFO)
  //     for (const stock of stocks) {
  //       if (remainingQty <= 0) break;
  //       const take = Math.min(remainingQty, Number(stock.quantity));

  //       // تحديث الرصيد
  //       await tx.productStock.update({
  //         where: { id: stock.id },
  //         data: { quantity: { decrement: take } },
  //       });

  //       // تسجيل حركة مخزنية (صرف عمليات)
  //       await tx.stockTransaction.create({
  //         data: {
  //           hospitalId,
  //           warehouseId: otWarehouseId,
  //           productId,
  //           type: StockTransactionType.OUT,
  //           quantity: take,
  //           unitCost: product.costPrice,
  //           totalCost: Number(product.costPrice) * take,
  //           referenceType: 'SURGERY_CONSUMABLE',
  //           referenceId: caseId,
  //           createdById: userId,
  //           batchNumber: stock.batchNumber,
  //           expiryDate: stock.expiryDate,
  //         },
  //       });

  //       remainingQty -= take;
  //       totalCost += Number(product.costPrice) * take;
  //     }

  //     // تحديث الرصيد العام
  //     await tx.product.update({
  //       where: { id: productId },
  //       data: { stockOnHand: { decrement: quantity } },
  //     });

  //     // 4. تسجيل المستهلك في جدول العملية
  //     const totalPrice = Number(product.sellPrice) * quantity;

  //     const consumable = await tx.surgeryConsumable.create({
  //       data: {
  //         surgeryCaseId: caseId,
  //         productId,
  //         quantity,
  //         unitPrice: product.sellPrice,
  //         totalPrice: totalPrice,
  //       },
  //     });

  //     // 5. إضافة التكلفة لفاتورة المريض (Encounter Charge)
  //     // نحتاج معرفة الـ encounterId
  //     const surgeryCase = await tx.surgeryCase.findUnique({
  //       where: { id: caseId },
  //     });

  //     // هنا نحتاج لـ ServiceItem عام اسمه "مستهلكات عمليات" أو نستخدم اسم المنتج
  //     // سنستخدم ChargeSource.OTHER مؤقتاً أو يمكن إضافة SURGERY للـ Enum لاحقاً
  //     // سنعتبره كـ Pharmacy Item من ناحية الفاتورة لأنه دواء/مستلزم

  //     // للتبسيط: سنبحث عن ServiceItem عام للمستلزمات، أو ننشئ Charge مباشر
  //     // الأفضل: أن يكون لكل Product ربط بـ ServiceItem، لكن بما أننا وحدنا الجدول،
  //     // سنقوم بإنشاء Charge يمثل هذا المستهلك.

  //     // سنبحث عن خدمة عامة "Surgery Consumables"
  //     let serviceItem = await tx.serviceItem.findFirst({
  //       where: { hospitalId, code: 'SURGERY-CONS' },
  //     });
  //     if (!serviceItem) {
  //       // Fallback or create dummy one (يفضل أن تكون موجودة في Seed)
  //       // لنفترض وجود خدمة عامة ID=1 أو نوقف العملية.
  //       // سنستخدم خدمة "PHARMACY-DRUGS" كبديل إذا لم نجد
  //       serviceItem = await tx.serviceItem.findFirst({
  //         where: { hospitalId, code: 'PHARMACY-DRUGS' },
  //       });
  //     }

  //     if (serviceItem) {
  //       await tx.encounterCharge.create({
  //         data: {
  //           hospitalId,
  //           encounterId: surgeryCase!.encounterId,
  //           serviceItemId: serviceItem.id,
  //           sourceType: ChargeSource.OTHER, // أو PHARMACY
  //           sourceId: consumable.id, // نربط بالمستهلك
  //           quantity: 1, // الكمية الإجمالية كبند واحد
  //           unitPrice: totalPrice,
  //           totalAmount: totalPrice,
  //           // note: `مستهلك عمليات: ${product.name} (x${quantity})`
  //         },
  //       });
  //     }

  //     return consumable;
  //   });
  // }
}
