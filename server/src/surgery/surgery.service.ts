import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionService } from '../commission/commission.service';
import {
  SurgeryStatus,
  SurgeryRole,
  StockTransactionType,
  ChargeSource,
  ServiceType,
  TerminologySystem,
} from '@prisma/client';

@Injectable()
export class SurgeryService {
  private readonly logger = new Logger(SurgeryService.name);
  constructor(
    private prisma: PrismaService,
    private commissionService: CommissionService,
  ) {}

  // --------------------------------------------------------
  // 🏥 Helper: تحديد مخزون العمليات
  // --------------------------------------------------------
  private async getOTWarehouseId(hospitalId: number): Promise<number> {
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

    throw new BadRequestException(
      'لم يتم العثور على "مخزن عمليات" معرف في النظام. يرجى إنشاء مخزن باسم "Operations Store" أو "مخزون العمليات".',
    );
  }

  // --------------------------------------------------------
  // 1. غرف العمليات (Theatres)
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
  // 2. خدمات العمليات من كتالوج الخدمات
  // --------------------------------------------------------
  async getSurgeryServiceItems(hospitalId: number) {
    return this.prisma.serviceItem.findMany({
      where: {
        hospitalId,
        isActive: true,
        isDeleted: false,
        type: ServiceType.SURGERY,
      },
      select: {
        id: true,
        code: true,
        name: true,
        defaultPrice: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  // --------------------------------------------------------
  // 3. حجز وجدولة عملية (Booking)
  // --------------------------------------------------------
  async scheduleSurgery(params: {
    hospitalId: number;
    encounterId: number;
    theatreId: number;
    serviceItemId: number;
    surgeryName?: string; // اختياري — سيُملأ من الخدمة إذا لم يُحدد
    scheduledStart: Date;
    scheduledEnd: Date;
    teamMembers?: { userId: number; role: SurgeryRole }[];
  }) {
    const { hospitalId, encounterId, theatreId, scheduledStart, scheduledEnd } =
      params;

    // جلب بيانات الخدمة لملء اسم العملية
    const serviceItem = await this.prisma.serviceItem.findFirst({
      where: { id: params.serviceItemId, hospitalId, isActive: true },
    });
    if (!serviceItem) {
      throw new BadRequestException('خدمة العملية غير موجودة في كتالوج الخدمات.');
    }

    // التحقق من تضارب المواعيد
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
        surgeryName: params.surgeryName || serviceItem.name,
        serviceItemId: params.serviceItemId,
        scheduledStart,
        scheduledEnd,
        status: SurgeryStatus.SCHEDULED,
      },
    });

    // إضافة الطاقم الطبي
    if (params.teamMembers && params.teamMembers.length > 0) {
      for (const member of params.teamMembers) {
        await this.addTeamMember(
          hospitalId,
          surgery.id,
          member.userId,
          member.role,
        );
      }
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
        encounter: {
          include: {
            patient: {
              select: { fullName: true, mrn: true },
            },
          },
        },
        theatre: true,
        serviceItem: { select: { id: true, name: true, code: true, defaultPrice: true } },
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
        encounter: {
          include: {
            patient: true,
            department: true,
            bedAssignments: {
              where: { to: null },
              include: {
                bed: {
                  include: {
                    room: true,
                    ward: true,
                  },
                },
              },
            },
          },
        },
        theatre: true,
        team: { include: { user: true } },
        consumables: { include: { product: true } },
        serviceItem: true,
        procedureConcept: true,
        preOpDiagnosisConcept: true,
        postOpDiagnosisConcept: true,
      },
    });
  }

  // --------------------------------------------------------
  // 4. إدارة الحالة (Start / End) + الربط المالي
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

    const updated = await this.prisma.surgeryCase.update({
      where: { id: caseId, hospitalId },
      data,
      include: {
        serviceItem: true,
        team: true,
      },
    });

    // ──────────────────────────────────────────
    // 💰 الربط المالي: عند اكتمال العملية
    // ──────────────────────────────────────────
    if (status === SurgeryStatus.COMPLETED && updated.serviceItemId) {
      await this.createSurgeryCharge(hospitalId, updated);
    }

    return updated;
  }

  /**
   * 💰 إنشاء رسوم العملية الجراحية + حساب العمولات
   */
  private async createSurgeryCharge(hospitalId: number, surgeryCase: any) {
    try {
      const serviceItem = surgeryCase.serviceItem;
      if (!serviceItem) return;

      // التحقق من عدم وجود Charge مسبق لنفس العملية
      const existingCharge = await this.prisma.encounterCharge.findFirst({
        where: {
          hospitalId,
          encounterId: surgeryCase.encounterId,
          sourceType: ChargeSource.SURGERY,
          sourceId: surgeryCase.id,
        },
      });

      if (existingCharge) {
        this.logger.warn(
          `Charge already exists for surgery case #${surgeryCase.id}`,
        );
        return;
      }

      // الجراح الرئيسي (للعمولة)
      const leadSurgeon = surgeryCase.team?.find(
        (t: any) => t.role === SurgeryRole.SURGEON,
      );

      // إنشاء الرسم
      await this.prisma.encounterCharge.create({
        data: {
          hospitalId,
          encounterId: surgeryCase.encounterId,
          serviceItemId: serviceItem.id,
          sourceType: ChargeSource.SURGERY,
          sourceId: surgeryCase.id,
          quantity: 1,
          unitPrice: serviceItem.defaultPrice,
          totalAmount: serviceItem.defaultPrice,
          performerId: leadSurgeon?.userId || null,
        },
      });

      this.logger.log(
        `✅ Surgery charge created: case #${surgeryCase.id}, amount: ${serviceItem.defaultPrice}`,
      );

      // حساب وتسجيل عمولات الطاقم
      if (leadSurgeon?.userId) {
        const doctorRate = await this.commissionService.getDoctorRate(
          hospitalId,
          leadSurgeon.userId,
          ServiceType.SURGERY,
        );

        if (doctorRate > 0) {
          const commissionAmount =
            (Number(serviceItem.defaultPrice) * doctorRate) / 100;

          await this.prisma.surgeryTeam.update({
            where: { id: leadSurgeon.id },
            data: { commissionAmount },
          });

          this.logger.log(
            `💰 Surgeon commission: ${commissionAmount} (${doctorRate}%) for user #${leadSurgeon.userId}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to create surgery charge for case #${surgeryCase.id}`,
        error,
      );
      // لا نمنع اكتمال العملية بسبب خطأ مالي
    }
  }

  async updateNotes(
    hospitalId: number,
    caseId: number,
    data: {
      surgeonNotes?: string;
      anesthesiaNotes?: string;
      preOpDiagnosis?: string;
      postOpDiagnosis?: string;
      procedureConceptId?: number;
      preOpDiagnosisConceptId?: number;
      postOpDiagnosisConceptId?: number;
      procedureTerminologySystem?: TerminologySystem;
      procedureTerminologyCode?: string;
      preOpTerminologySystem?: TerminologySystem;
      preOpTerminologyCode?: string;
      postOpTerminologySystem?: TerminologySystem;
      postOpTerminologyCode?: string;
    },
  ) {
    const updateData: any = {
      surgeonNotes: data.surgeonNotes,
      anesthesiaNotes: data.anesthesiaNotes,
      preOpDiagnosis: data.preOpDiagnosis,
      postOpDiagnosis: data.postOpDiagnosis,
      procedureConceptId: data.procedureConceptId,
      preOpDiagnosisConceptId: data.preOpDiagnosisConceptId,
      postOpDiagnosisConceptId: data.postOpDiagnosisConceptId,
    };

    if (data.procedureTerminologySystem && data.procedureTerminologyCode) {
      const concept = await this.prisma.terminologyConcept.findUnique({
        where: {
          system_code: {
            system: data.procedureTerminologySystem,
            code: data.procedureTerminologyCode.trim(),
          },
        },
        select: { id: true },
      });
      updateData.procedureConceptId = concept?.id ?? null;
    }

    if (data.preOpTerminologySystem && data.preOpTerminologyCode) {
      const concept = await this.prisma.terminologyConcept.findUnique({
        where: {
          system_code: {
            system: data.preOpTerminologySystem,
            code: data.preOpTerminologyCode.trim(),
          },
        },
        select: { id: true },
      });
      updateData.preOpDiagnosisConceptId = concept?.id ?? null;
    }

    if (data.postOpTerminologySystem && data.postOpTerminologyCode) {
      const concept = await this.prisma.terminologyConcept.findUnique({
        where: {
          system_code: {
            system: data.postOpTerminologySystem,
            code: data.postOpTerminologyCode.trim(),
          },
        },
        select: { id: true },
      });
      updateData.postOpDiagnosisConceptId = concept?.id ?? null;
    }

    return this.prisma.surgeryCase.update({
      where: { id: caseId, hospitalId },
      data: updateData,
    });
  }

  // --------------------------------------------------------
  // 4.1. Clinical Workflows (Pre/Intra/Post-Op)
  // --------------------------------------------------------
  async recordPreOpChecklist(hospitalId: number, caseId: number, checklist: any, userId: number) {
    const formattedNote = `--- PRE-OP CHECKLIST (By User ${userId}) ---\n` + JSON.stringify(checklist, null, 2);
    const existing = await this.prisma.surgeryCase.findUnique({ where: { id: caseId }, select: { anesthesiaNotes: true } });
    
    return this.prisma.surgeryCase.update({
      where: { id: caseId, hospitalId },
      data: { anesthesiaNotes: existing?.anesthesiaNotes ? existing.anesthesiaNotes + '\n\n' + formattedNote : formattedNote }
    });
  }

  async recordIntraOpLog(hospitalId: number, caseId: number, log: any, userId: number) {
    const formattedNote = `--- INTRA-OP LOG (By User ${userId}) ---\n` + JSON.stringify(log, null, 2);
    const existing = await this.prisma.surgeryCase.findUnique({ where: { id: caseId }, select: { surgeonNotes: true } });
    
    return this.prisma.surgeryCase.update({
      where: { id: caseId, hospitalId },
      data: { surgeonNotes: existing?.surgeonNotes ? existing.surgeonNotes + '\n\n' + formattedNote : formattedNote }
    });
  }

  async recordPostOpPACU(hospitalId: number, caseId: number, pacuLog: any, userId: number) {
    const formattedNote = `--- PACU RECOVERY LOG (By User ${userId}) ---\n` + JSON.stringify(pacuLog, null, 2);
    const existing = await this.prisma.surgeryCase.findUnique({ where: { id: caseId }, select: { postOpDiagnosis: true } });
    
    return this.prisma.surgeryCase.update({
      where: { id: caseId, hospitalId },
      data: { postOpDiagnosis: existing?.postOpDiagnosis ? existing.postOpDiagnosis + '\n\n' + formattedNote : formattedNote }
    });
  }

  // --------------------------------------------------------
  // 5. إدارة الطاقم (Team)
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
  // 6. استهلاك المواد (Consumables) من مخزن العمليات
  // --------------------------------------------------------
  async addConsumable(params: {
    hospitalId: number;
    userId: number;
    caseId: number;
    productId: number;
    quantity: number;
  }) {
    const { hospitalId, userId, caseId, productId, quantity } = params;

    // 1. تحديد مخزن العمليات
    const otWarehouseId = await this.getOTWarehouseId(hospitalId);

    return this.prisma.$transaction(async (tx) => {
      // 2. حجز الأرصدة ومنع التضارب (Pessimistic Locking + FEFO)
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

      // 3. جلب بيانات المنتج
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product)
        throw new NotFoundException('المنتج غير موجود في قاعدة البيانات');

      let remainingQty = quantity;
      let totalUsageCost = 0;

      // 4. الخصم من التشغيلات (FEFO)
      for (const stock of stocks) {
        if (remainingQty <= 0) break;

        const availableInBatch = Number(stock.quantity);
        const take = Math.min(remainingQty, availableInBatch);

        await tx.productStock.update({
          where: { id: stock.id },
          data: { quantity: { decrement: take } },
        });

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

      // 5. تحديث إجمالي الرصيد
      await tx.product.update({
        where: { id: productId },
        data: { stockOnHand: { decrement: quantity } },
      });

      // 6. تسجيل المستهلك
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

      let serviceItem = await tx.serviceItem.findFirst({
        where: { hospitalId, code: 'SURGERY-CONS', isActive: true },
      });

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
}
