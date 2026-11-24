import { Money } from '../common/utils/money.util';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  consumeSurgerySupply,
  type SurgerySupplyInput,
} from './surgery-consumption';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionService } from '../commission/commission.service';
import {
  SurgeryStatus,
  SurgeryRole,
  ChargeSource,
  ServiceType,
  TerminologySystem,
  Prisma,
} from '@prisma/client';

@Injectable()
export class SurgeryService {
  private readonly logger = new Logger(SurgeryService.name);
  constructor(
    private prisma: PrismaService,
    private commissionService: CommissionService,
  ) {}

  // --------------------------------------------------------
  // 1. غرف العمليات (Theatres)
  // --------------------------------------------------------
  async surgerySourcePolicy(hospitalId: number) {
    return (
      (await this.prisma.surgeryWarehousePolicy.findUnique({
        where: { hospitalId },
        include: {
          warehouse: { select: { id: true, name: true, isActive: true } },
        },
      })) ?? { hospitalId, warehouseId: null, warehouse: null }
    );
  }

  async surgerySourceWarehouses(hospitalId: number) {
    return this.prisma.warehouse.findMany({
      where: { hospitalId, isActive: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  async configureSurgerySource(
    hospitalId: number,
    userId: number,
    dto: { warehouseId: number; reason: string },
  ) {
    if (
      !Number.isInteger(dto.warehouseId) ||
      dto.warehouseId <= 0 ||
      dto.warehouseId > 2147483647 ||
      typeof dto.reason !== 'string' ||
      dto.reason.trim().length < 10 ||
      dto.reason.length > 500
    )
      throw new BadRequestException('يلزم مخزن صالح وسبب واضح من10 إلى500 حرف');
    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${hospitalId}::integer)`;
      if (
        !(await tx.user.findFirst({
          where: { id: userId, hospitalId, isActive: true, isDeleted: false },
        }))
      )
        throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
      const warehouses = await tx.$queryRaw<
        { id: number }[]
      >`SELECT id FROM "Warehouse" WHERE id=${dto.warehouseId} AND "hospitalId"=${hospitalId} AND "isActive"=true FOR SHARE`;
      if (warehouses.length !== 1)
        throw new BadRequestException('المخزن غير نشط أو خارج المنشأة');
      const previous = await tx.surgeryWarehousePolicy.findUnique({
        where: { hospitalId },
      });
      const policy = await tx.surgeryWarehousePolicy.upsert({
        where: { hospitalId },
        create: {
          hospitalId,
          warehouseId: dto.warehouseId,
          updatedById: userId,
        },
        update: { warehouseId: dto.warehouseId, updatedById: userId },
      });
      const auditFields = {
        hospitalId,
        userId,
        action: 'CONFIGURE_SURGERY_WAREHOUSE',
        entity: 'SurgeryWarehousePolicy',
        entityId: policy.id,
        details: {
          reason: dto.reason.trim(),
          previousWarehouseId: previous?.warehouseId ?? null,
          warehouseId: dto.warehouseId,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return policy;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
  }

  async getTheatres(hospitalId: number) {
    return this.prisma.operatingTheatre.findMany({
      where: { hospitalId, isActive: true },
    });
  }

  async createTheatre(hospitalId: number, name: string) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > 200) {
      throw new BadRequestException('اسم غرفة العمليات مطلوب وبطول صالح.');
    }
    return this.prisma.operatingTheatre.create({
      data: { hospitalId, name: trimmed },
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
  // 3. حجز وجدولة عملية (Booking) داخل معاملة ذرية مع عزل المنشأة
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
    const {
      hospitalId,
      encounterId,
      theatreId,
      serviceItemId,
      scheduledStart,
      scheduledEnd,
    } = params;

    if (
      ![hospitalId, encounterId, theatreId, serviceItemId].every(
        (id) => Number.isInteger(id) && id > 0 && id <= 2147483647,
      )
    ) {
      throw new BadRequestException('معرفات الحجز الجراحي غير صالحة.');
    }

    if (
      !(scheduledStart instanceof Date) ||
      !(scheduledEnd instanceof Date) ||
      Number.isNaN(scheduledStart.getTime()) ||
      Number.isNaN(scheduledEnd.getTime()) ||
      scheduledEnd.getTime() <= scheduledStart.getTime()
    ) {
      throw new BadRequestException(
        'وقت نهاية العملية يجب أن يكون بعد وقت البداية.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const parent = await tx.encounter.findFirst({
        where: { id: encounterId, hospitalId, isDeleted: false },
      });
      if (!parent)
        throw new BadRequestException('الحالة غير موجودة ضمن المنشأة');
      await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${parent.patientId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Encounter" WHERE id=${encounterId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
      // قفل غرفة العمليات لمنع الحجز المتزامن المتضارب والتأكد من ملكيتها للمنشأة
      const lockedTheatre = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM "OperatingTheatre"
        WHERE id = ${theatreId} AND "hospitalId" = ${hospitalId} AND "isActive" = true
        FOR UPDATE
      `;
      if (lockedTheatre.length !== 1) {
        throw new BadRequestException(
          'غرفة العمليات غير موجودة أو غير نشطة في هذه المنشأة.',
        );
      }

      // التحقق من ملكية وحالة الزيارة العلاجية (Encounter)
      const encounter = await tx.encounter.findFirst({
        where: {
          id: encounterId,
          hospitalId,
          isDeleted: false,
        },
        include: { patient: true },
      });
      if (
        !encounter ||
        encounter.status !== 'OPEN' ||
        !encounter.patient?.isActive ||
        encounter.patient?.isDeleted
      ) {
        throw new BadRequestException(
          'الحالة العلاجية غير موجودة أو مغلقة أو خارج المنشأة.',
        );
      }

      // جلب بيانات الخدمة لملء اسم العملية والتحقق من نوعها
      const serviceItem = await tx.serviceItem.findFirst({
        where: {
          id: serviceItemId,
          hospitalId,
          isActive: true,
          isDeleted: false,
          type: ServiceType.SURGERY,
        },
      });
      if (!serviceItem) {
        throw new BadRequestException(
          'خدمة العملية غير موجودة في كتالوج الخدمات.',
        );
      }

      // التحقق من تضارب المواعيد تحت قفل الغرفة
      const conflict = await tx.surgeryCase.findFirst({
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

      const surgery = await tx.surgeryCase.create({
        data: {
          hospitalId,
          encounterId,
          theatreId,
          surgeryName: params.surgeryName?.trim() || serviceItem.name,
          serviceItemId,
          scheduledStart,
          scheduledEnd,
          status: SurgeryStatus.SCHEDULED,
        },
      });

      // إضافة الطاقم الطبي داخل نفس المعاملة الذرية مع التحقق من الانتماء للمنشأة
      if (params.teamMembers && params.teamMembers.length > 0) {
        const seenMembers = new Set<string>();
        for (const member of params.teamMembers) {
          const memberUserId = Number(member.userId);
          if (
            !Number.isInteger(memberUserId) ||
            memberUserId <= 0 ||
            !Object.values(SurgeryRole).includes(member.role)
          ) {
            throw new BadRequestException('بيانات عضو الطاقم الطبي غير صالحة.');
          }
          const memberKey = `${memberUserId}:${member.role}`;
          if (seenMembers.has(memberKey)) {
            throw new ConflictException(
              'لا يمكن تكرار نفس عضو الطاقم بنفس الدور في العملية.',
            );
          }
          seenMembers.add(memberKey);

          const staffUser = await tx.user.findFirst({
            where: {
              id: memberUserId,
              hospitalId,
              isActive: true,
              isDeleted: false,
            },
          });
          if (!staffUser) {
            throw new BadRequestException(
              'عضو الطاقم الطبي غير موجود أو غير نشط في هذه المنشأة.',
            );
          }

          await tx.surgeryTeam.create({
            data: {
              surgeryCaseId: surgery.id,
              userId: memberUserId,
              role: member.role,
              commissionAmount: null,
            },
          });
        }
      }

      return surgery;
    });
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
        serviceItem: {
          select: { id: true, name: true, code: true, defaultPrice: true },
        },
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
    const result = await this.prisma.surgeryCase.findFirst({
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
        team: { include: { user: { select: { id: true, fullName: true } } } },
        consumables: { include: { product: true } },
        serviceItem: true,
        procedureConcept: true,
        preOpDiagnosisConcept: true,
        postOpDiagnosisConcept: true,
      },
    });
    if (!result) return null;
    const supplies = Money.sumDecimal(
      ...result.consumables.map((c) => c.totalPrice),
    );
    const catalogue = result.serviceItem?.defaultPrice ?? '0';
    return {
      ...result,
      financialPreview: {
        cataloguePrice: Money.toFixed(catalogue),
        consumables: Money.toFixed(supplies),
        estimatedTotal: Money.toFixed(Money.sumDecimal(catalogue, supplies)),
        teamCommissions: Money.toFixed(
          Money.sumDecimal(
            ...result.team.map((t) => t.commissionAmount ?? '0'),
          ),
        ),
      },
    };
  }

  // --------------------------------------------------------
  // 4. إدارة الحالة (Start / End) + الربط المالي الذري
  // --------------------------------------------------------
  async updateStatus(
    hospitalId: number,
    caseId: number,
    status: SurgeryStatus,
    userId?: number,
  ) {
    if (!Object.values(SurgeryStatus).includes(status)) {
      throw new BadRequestException('حالة العملية الجراحية غير صالحة.');
    }

    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const identity = await tx.surgeryCase.findFirst({
        where: { id: caseId, hospitalId },
        include: { encounter: true },
      });
      if (!identity || identity.encounter.hospitalId !== hospitalId)
        throw new NotFoundException('العملية غير موجودة ضمن المنشأة');
      await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${identity.encounter.patientId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Encounter" WHERE id=${identity.encounterId} AND "hospitalId"=${hospitalId} FOR UPDATE`;
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM "SurgeryCase"
        WHERE id = ${caseId} AND "hospitalId" = ${hospitalId}
        FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
      }

      const existingCase = await tx.surgeryCase.findFirstOrThrow({
        where: { id: caseId, hospitalId },
        include: {
          serviceItem: true,
          team: { orderBy: { id: 'asc' } },
          encounter: { include: { patient: true } },
          _count: { select: { consumables: true } },
        },
      });

      if (
        existingCase.encounterId !== identity.encounterId ||
        existingCase.encounter.patientId !== identity.encounter.patientId
      )
        throw new ConflictException('تغيرت مراجع العملية أثناء التنفيذ');
      const allowedTransitions: Record<SurgeryStatus, SurgeryStatus[]> = {
        [SurgeryStatus.SCHEDULED]: [
          SurgeryStatus.IN_PROGRESS,
          SurgeryStatus.RECOVERY,
          SurgeryStatus.COMPLETED,
          SurgeryStatus.CANCELLED,
        ],
        [SurgeryStatus.IN_PROGRESS]: [
          SurgeryStatus.RECOVERY,
          SurgeryStatus.COMPLETED,
          SurgeryStatus.CANCELLED,
        ],
        [SurgeryStatus.RECOVERY]: [SurgeryStatus.COMPLETED],
        [SurgeryStatus.COMPLETED]: [],
        [SurgeryStatus.CANCELLED]: [],
      };

      if (!allowedTransitions[existingCase.status]?.includes(status)) {
        throw new ConflictException(
          `انتقال حالة العملية الجراحية من ${existingCase.status} إلى ${status} غير مسموح.`,
        );
      }

      if (
        status === SurgeryStatus.CANCELLED &&
        existingCase._count.consumables > 0
      ) {
        throw new ConflictException(
          'لا يمكن إلغاء العملية الجراحية بعد صرف مستلزمات مخزنية لها.',
        );
      }

      const data: Prisma.SurgeryCaseUpdateInput = { status };
      const now = new Date();
      if (status === SurgeryStatus.IN_PROGRESS) {
        data.actualStart = existingCase.actualStart ?? now;
      } else if (status === SurgeryStatus.COMPLETED) {
        if (typeof tx.surgicalCountItem?.count === 'function') {
          const unresolvedCounts = await tx.surgicalCountItem.count({
            where: {
              surgeryCaseId: caseId,
              hospitalId,
              status: { in: ['OPEN', 'DISCREPANCY'] },
            },
          });
          if (unresolvedCounts > 0) {
            throw new ConflictException(
              `حظر سلامة جراحي (CAP05): لا يمكن إكمال وإغلاق العملية مع وجود ${unresolvedCounts} بنود عدّ جراحي غير مطابقة أو غير مغلقة.`,
            );
          }
        }
        data.actualStart = existingCase.actualStart ?? now;
        data.actualEnd = now;
      }

      // ──────────────────────────────────────────
      // 💰 الربط المالي الذري: عند اكتمال العملية
      // ──────────────────────────────────────────
      let createdChargeId: number | null = null;
      let calculatedCommission: string | null = null;

      if (status === SurgeryStatus.COMPLETED && existingCase.serviceItemId) {
        if (
          !existingCase.encounter ||
          existingCase.encounter.hospitalId !== hospitalId ||
          existingCase.encounter.isDeleted ||
          existingCase.encounter.status !== 'OPEN' ||
          !existingCase.encounter.patient?.isActive ||
          existingCase.encounter.patient?.isDeleted
        ) {
          throw new BadRequestException(
            'الحالة العلاجية أو ملف المريض غير متاح لإصدار رسوم العملية.',
          );
        }

        const serviceItem = existingCase.serviceItem;
        if (
          !serviceItem ||
          serviceItem.hospitalId !== hospitalId ||
          !serviceItem.isActive ||
          serviceItem.isDeleted ||
          Money.decimal(serviceItem.defaultPrice).lt(0)
        ) {
          throw new BadRequestException(
            'خدمة العملية الجراحية غير متاحة أو غير صالحة للفوترة.',
          );
        }

        await tx.$queryRaw`
          SELECT id FROM "Encounter"
          WHERE id = ${existingCase.encounterId} AND "hospitalId" = ${hospitalId}
          FOR UPDATE
        `;

        const existingCharge = await tx.encounterCharge.findFirst({
          where: {
            hospitalId,
            encounterId: existingCase.encounterId,
            sourceType: ChargeSource.SURGERY,
            sourceId: existingCase.id,
          },
        });
        if (existingCharge) {
          throw new ConflictException(
            'تم إصدار رسوم هذه العملية الجراحية مسبقاً.',
          );
        }

        const leadSurgeon = existingCase.team.find(
          (t) => t.role === SurgeryRole.SURGEON,
        );
        if (leadSurgeon) {
          const surgeonUser = await tx.user.findFirst({
            where: {
              id: leadSurgeon.userId,
              hospitalId,
              isDeleted: false,
            },
          });
          if (!surgeonUser) {
            throw new BadRequestException(
              'الجراح الرئيسي المسجل خارج المنشأة.',
            );
          }
        }

        const basePrice = Money.toDbString(serviceItem.defaultPrice);
        const charge = await tx.encounterCharge.create({
          data: {
            hospitalId,
            encounterId: existingCase.encounterId,
            serviceItemId: serviceItem.id,
            sourceType: ChargeSource.SURGERY,
            sourceId: existingCase.id,
            quantity: 1,
            unitPrice: basePrice,
            totalAmount: basePrice,
            performerId: leadSurgeon?.userId ?? null,
          },
        });
        createdChargeId = charge.id;

        if (leadSurgeon?.userId) {
          if (leadSurgeon.commissionAmount !== null) {
            calculatedCommission = Money.toDbString(
              leadSurgeon.commissionAmount,
            );
          } else {
            const doctorRate = await this.commissionService.getDoctorRate(
              hospitalId,
              leadSurgeon.userId,
              ServiceType.SURGERY,
              tx,
            );
            if (doctorRate > 0) {
              calculatedCommission = Money.toDbString(
                Money.percentDecimal(basePrice, doctorRate),
              );
              await tx.surgeryTeam.update({
                where: { id: leadSurgeon.id },
                data: { commissionAmount: calculatedCommission },
              });
            }
          }
        }
      }

      const updated = await tx.surgeryCase.update({
        where: { id: caseId },
        data,
        include: {
          serviceItem: true,
          team: { orderBy: { id: 'asc' } },
        },
      });

      const auditFields = {
        hospitalId,
        userId: userId ?? null,
        action:
          status === SurgeryStatus.COMPLETED
            ? 'COMPLETE_SURGERY_CASE'
            : 'UPDATE_SURGERY_STATUS',
        entity: 'SurgeryCase',
        entityId: updated.id,
        details: {
          previousStatus: existingCase.status,
          status,
          encounterId: updated.encounterId,
          serviceItemId: updated.serviceItemId,
          chargeId: createdChargeId,
          surgeonCommission: calculatedCommission,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;

      return updated;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
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
    const existing = await this.prisma.surgeryCase.findFirst({
      where: { id: caseId, hospitalId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
    }

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
      where: { id: caseId },
      data: updateData,
    });
  }

  // --------------------------------------------------------
  // 4.1. Clinical Workflows (Pre/Intra/Post-Op)
  // --------------------------------------------------------
  async recordPreOpChecklist(
    hospitalId: number,
    caseId: number,
    checklist: any,
    userId: number,
  ) {
    const formattedNote =
      `--- PRE-OP CHECKLIST (By User ${userId}) ---\n` +
      JSON.stringify(checklist, null, 2);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SurgeryCase" WHERE id = ${caseId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.surgeryCase.findFirst({
        where: { id: caseId, hospitalId },
        select: { anesthesiaNotes: true },
      });
      if (!existing) {
        throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
      }

      return tx.surgeryCase.update({
        where: { id: caseId },
        data: {
          anesthesiaNotes: existing.anesthesiaNotes
            ? existing.anesthesiaNotes + '\n\n' + formattedNote
            : formattedNote,
        },
      });
    });
  }

  async recordIntraOpLog(
    hospitalId: number,
    caseId: number,
    log: any,
    userId: number,
  ) {
    const formattedNote =
      `--- INTRA-OP LOG (By User ${userId}) ---\n` +
      JSON.stringify(log, null, 2);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SurgeryCase" WHERE id = ${caseId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.surgeryCase.findFirst({
        where: { id: caseId, hospitalId },
        select: { surgeonNotes: true },
      });
      if (!existing) {
        throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
      }

      return tx.surgeryCase.update({
        where: { id: caseId },
        data: {
          surgeonNotes: existing.surgeonNotes
            ? existing.surgeonNotes + '\n\n' + formattedNote
            : formattedNote,
        },
      });
    });
  }

  async recordPostOpPACU(
    hospitalId: number,
    caseId: number,
    pacuLog: any,
    userId: number,
  ) {
    const formattedNote =
      `--- PACU RECOVERY LOG (By User ${userId}) ---\n` +
      JSON.stringify(pacuLog, null, 2);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SurgeryCase" WHERE id = ${caseId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.surgeryCase.findFirst({
        where: { id: caseId, hospitalId },
        select: { postOpDiagnosis: true },
      });
      if (!existing) {
        throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
      }

      return tx.surgeryCase.update({
        where: { id: caseId },
        data: {
          postOpDiagnosis: existing.postOpDiagnosis
            ? existing.postOpDiagnosis + '\n\n' + formattedNote
            : formattedNote,
        },
      });
    });
  }

  // --------------------------------------------------------
  // 5. إدارة الطاقم (Team) مع عزل المنشأة وحماية الحالة المكتملة
  // --------------------------------------------------------
  async addTeamMember(
    hospitalId: number,
    caseId: number,
    userId: number,
    role: SurgeryRole,
    commissionAmount?: number | string | null,
  ) {
    if (
      !Number.isInteger(caseId) ||
      caseId <= 0 ||
      !Number.isInteger(userId) ||
      userId <= 0 ||
      !Object.values(SurgeryRole).includes(role)
    ) {
      throw new BadRequestException('بيانات عضو الطاقم الجراحي غير صالحة.');
    }

    let normalizedCommission: string | null = null;
    if (
      commissionAmount !== undefined &&
      commissionAmount !== null &&
      commissionAmount !== ''
    ) {
      const commStr = String(commissionAmount);
      if (!/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(commStr)) {
        throw new BadRequestException('قيمة عمولة عضو الطاقم غير صالحة.');
      }
      normalizedCommission = Money.toDbString(commStr);
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: number; status: SurgeryStatus }[]
      >`
        SELECT id, status FROM "SurgeryCase"
        WHERE id = ${caseId} AND "hospitalId" = ${hospitalId}
        FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
      }
      if (
        locked[0].status === SurgeryStatus.COMPLETED ||
        locked[0].status === SurgeryStatus.CANCELLED
      ) {
        throw new ConflictException(
          'لا يمكن تعديل الطاقم الطبي بعد اكتمال العملية أو إلغائها.',
        );
      }

      const staffUser = await tx.user.findFirst({
        where: { id: userId, hospitalId, isActive: true, isDeleted: false },
        select: { id: true, fullName: true },
      });
      if (!staffUser) {
        throw new BadRequestException(
          'عضو الطاقم الطبي غير موجود أو غير نشط في هذه المنشأة.',
        );
      }

      const dup = await tx.surgeryTeam.findFirst({
        where: { surgeryCaseId: caseId, userId, role },
      });
      if (dup) {
        throw new ConflictException(
          'عضو الطاقم مضاف مسبقاً بهذا الدور في هذه العملية.',
        );
      }

      return tx.surgeryTeam.create({
        data: {
          surgeryCaseId: caseId,
          userId,
          role,
          commissionAmount: normalizedCommission,
        },
        include: {
          user: { select: { id: true, fullName: true } },
        },
      });
    });
  }

  async removeTeamMember(hospitalId: number, id: number, caseId?: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('معرف عضو الطاقم غير صالح.');
    }

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.surgeryTeam.findUnique({
        where: { id },
        include: { surgeryCase: true },
      });
      if (
        !member ||
        member.surgeryCase.hospitalId !== hospitalId ||
        (caseId !== undefined && member.surgeryCaseId !== caseId)
      ) {
        throw new NotFoundException('عضو الطاقم غير موجود ضمن المنشأة.');
      }

      await tx.$queryRaw`
        SELECT id FROM "SurgeryCase"
        WHERE id = ${member.surgeryCaseId} AND "hospitalId" = ${hospitalId}
        FOR UPDATE
      `;

      const currentCase = await tx.surgeryCase.findFirstOrThrow({
        where: { id: member.surgeryCaseId, hospitalId },
      });
      if (
        currentCase.status === SurgeryStatus.COMPLETED ||
        currentCase.status === SurgeryStatus.CANCELLED
      ) {
        throw new ConflictException(
          'لا يمكن حذف عضو الطاقم بعد اكتمال العملية أو إلغائها.',
        );
      }

      return tx.surgeryTeam.delete({ where: { id } });
    });
  }

  // --------------------------------------------------------
  // 6. استهلاك المواد (Consumables) من مخزن العمليات
  // --------------------------------------------------------
  async addConsumable(params: SurgerySupplyInput) {
    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(
      (tx) => {
        committedAudit = null;
        return consumeSurgerySupply(tx, params, (auditFields) => {
          committedAudit = auditFields;
        });
      },
      { timeout: 20000 },
    );
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
  }
}
