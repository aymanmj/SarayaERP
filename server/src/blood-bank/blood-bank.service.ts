import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  type BloodComponentType,
  type BloodGroup,
  evaluateBloodCompatibility,
} from './blood-compatibility.util';
import {
  BedsideVerifyStepDto,
  CompleteTransfusionDto,
  CreateBloodUnitDto,
  CreateCrossmatchDto,
  DiscardBloodUnitDto,
  RecordTransfusionVitalsDto,
  ReportTransfusionReactionDto,
  ScreenBloodUnitDto,
} from './dto/blood-bank.dto';

export interface BloodBankAuditMeta {
  ipAddress?: string;
  clientName?: string;
}

const USER_LITE = {
  id: true,
  fullName: true,
  username: true,
} as const;

const UNIT_INCLUDE = {
  receivedBy: { select: USER_LITE },
  screenedBy: { select: USER_LITE },
} as const;

const CROSSMATCH_INCLUDE = {
  patient: { select: { id: true, fullName: true, mrn: true } },
  encounter: { select: { id: true, status: true, type: true } },
  bloodUnit: {
    select: {
      id: true,
      unitNumber: true,
      componentType: true,
      bloodGroup: true,
      volumeMl: true,
      expiresAt: true,
      status: true,
      screeningStatus: true,
    },
  },
  performedBy: { select: USER_LITE },
  verifiedBy: { select: USER_LITE },
} as const;

const TRANSFUSION_INCLUDE: Prisma.BloodTransfusionInclude = {
  patient: { select: { id: true, fullName: true, mrn: true } },
  encounter: { select: { id: true, status: true, type: true } },
  bloodUnit: {
    select: {
      id: true,
      unitNumber: true,
      componentType: true,
      bloodGroup: true,
      volumeMl: true,
      expiresAt: true,
      status: true,
    },
  },
  crossmatch: {
    select: {
      id: true,
      patientBloodGroup: true,
      crossmatchResult: true,
      validUntil: true,
      verifiedById: true,
    },
  },
  issuedBy: { select: USER_LITE },
  bedsideVerifier1: { select: USER_LITE },
  bedsideVerifier2: { select: USER_LITE },
  clinicalIncident: {
    select: { id: true, incidentNumber: true, severity: true, status: true },
  },
  events: {
    include: { recordedBy: { select: USER_LITE } },
    orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
  },
};

@Injectable()
export class BloodBankService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 1. Blood Inventory (Receipt, Serology Screening, Expiry, Discard)
  // =========================================================================

  async registerBloodUnit(
    hospitalId: number,
    userId: number,
    dto: CreateBloodUnitDto,
    meta?: BloodBankAuditMeta,
  ) {
    const collectedAt = new Date(dto.collectedAt);
    const expiresAt = new Date(dto.expiresAt);
    if (
      Number.isNaN(collectedAt.getTime()) ||
      Number.isNaN(expiresAt.getTime())
    ) {
      throw new BadRequestException(
        'تواريخ السحب أو انتهاء الصلاحية غير صالحة',
      );
    }
    if (expiresAt.getTime() <= collectedAt.getTime()) {
      throw new BadRequestException(
        'تاريخ انتهاء صلاحية وحدة الدم يجب أن يكون لاحقًا لتاريخ السحب',
      );
    }

    const unitNumber = dto.unitNumber.trim().toUpperCase();

    const { unit, audit } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.bloodUnit.findUnique({
        where: { hospitalId_unitNumber: { hospitalId, unitNumber } },
      });
      if (existing) {
        throw new ConflictException(
          `وحدة الدم برقم (${unitNumber}) مسجلة مسبقًا في هذه المنشأة`,
        );
      }

      const created = await tx.bloodUnit.create({
        data: {
          hospitalId,
          unitNumber,
          componentType: dto.componentType,
          bloodGroup: dto.bloodGroup,
          volumeMl: dto.volumeMl,
          donorReference: dto.donorReference?.trim() || null,
          collectedAt,
          expiresAt,
          storageLocation: dto.storageLocation?.trim() || null,
          screeningStatus: 'PENDING',
          status: 'QUARANTINED',
          receivedById: userId,
        },
        include: UNIT_INCLUDE,
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'BLOOD_UNIT_REGISTERED',
        entity: 'BloodUnit',
        entityId: created.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          unitNumber: created.unitNumber,
          componentType: created.componentType,
          bloodGroup: created.bloodGroup,
          volumeMl: created.volumeMl,
          expiresAt: created.expiresAt.toISOString(),
        },
      });

      return { unit: created, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return unit;
  }

  async screenBloodUnit(
    hospitalId: number,
    unitId: number,
    userId: number,
    dto: ScreenBloodUnitDto,
    meta?: BloodBankAuditMeta,
  ) {
    const { unit, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "BloodUnit" WHERE "id" = ${unitId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.bloodUnit.findFirst({
        where: { id: unitId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('وحدة الدم غير موجودة في هذه المنشأة');
      }
      if (existing.status !== 'QUARANTINED') {
        throw new ConflictException(
          `لا يمكن تسجيل الفحص المصلي لوحدة في حالة (${existing.status})`,
        );
      }

      const now = new Date();
      if (
        dto.screeningStatus === 'CLEARED' &&
        existing.expiresAt.getTime() <= now.getTime()
      ) {
        throw new ConflictException(
          'لا يمكن إتاحة وحدة دم منتهية الصلاحية؛ يجب إتلافها',
        );
      }

      const nextStatus =
        dto.screeningStatus === 'CLEARED' ? 'AVAILABLE' : 'QUARANTINED';

      const updated = await tx.bloodUnit.update({
        where: { id: existing.id },
        data: {
          screeningStatus: dto.screeningStatus,
          screeningNotes: dto.screeningNotes?.trim() || null,
          screenedById: userId,
          screenedAt: now,
          status: nextStatus,
        },
        include: UNIT_INCLUDE,
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'BLOOD_UNIT_SCREENED',
        entity: 'BloodUnit',
        entityId: updated.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          unitNumber: updated.unitNumber,
          screeningStatus: updated.screeningStatus,
          status: updated.status,
        },
      });

      return { unit: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return unit;
  }

  async discardBloodUnit(
    hospitalId: number,
    unitId: number,
    userId: number,
    dto: DiscardBloodUnitDto,
    meta?: BloodBankAuditMeta,
  ) {
    const { unit, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "BloodUnit" WHERE "id" = ${unitId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.bloodUnit.findFirst({
        where: { id: unitId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('وحدة الدم غير موجودة في هذه المنشأة');
      }
      if (['TRANSFUSED', 'DISCARDED'].includes(existing.status)) {
        throw new ConflictException(
          `لا يمكن إتلاف وحدة دم في حالة (${existing.status})`,
        );
      }

      const updated = await tx.bloodUnit.update({
        where: { id: existing.id },
        data: {
          status: 'DISCARDED',
          discardReason: dto.discardReason.trim(),
        },
        include: UNIT_INCLUDE,
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'BLOOD_UNIT_DISCARDED',
        entity: 'BloodUnit',
        entityId: updated.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          unitNumber: updated.unitNumber,
          discardReason: updated.discardReason,
        },
      });

      return { unit: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return unit;
  }

  async listInventory(
    hospitalId: number,
    filters?: {
      status?: string;
      bloodGroup?: string;
      componentType?: string;
    },
  ) {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 5 * 86_400_000);

    const where: Prisma.BloodUnitWhereInput = { hospitalId };
    if (filters?.status) where.status = filters.status;
    if (filters?.bloodGroup) where.bloodGroup = filters.bloodGroup;
    if (filters?.componentType) where.componentType = filters.componentType;

    const units = await this.prisma.bloodUnit.findMany({
      where,
      include: UNIT_INCLUDE,
      orderBy: [{ expiresAt: 'asc' }, { id: 'desc' }],
    });

    const summary = {
      totalUnits: units.length,
      availableUnits: units.filter(
        (u) => u.status === 'AVAILABLE' && u.expiresAt > now,
      ).length,
      expiringSoonUnits: units.filter(
        (u) =>
          u.status === 'AVAILABLE' &&
          u.expiresAt > now &&
          u.expiresAt <= soonThreshold,
      ).length,
      expiredAvailableUnits: units.filter(
        (u) => u.status === 'AVAILABLE' && u.expiresAt <= now,
      ).length,
      quarantinedUnits: units.filter((u) =>
        ['QUARANTINED', 'REACTED_QUARANTINED'].includes(u.status),
      ).length,
      crossmatchedUnits: units.filter((u) => u.status === 'CROSSMATCHED')
        .length,
      issuedUnits: units.filter((u) => u.status === 'ISSUED').length,
    };

    return { units, summary };
  }

  // =========================================================================
  // 2. Crossmatch & 4-Eyes Verification
  // =========================================================================

  async createCrossmatch(
    hospitalId: number,
    userId: number,
    dto: CreateCrossmatchDto,
    meta?: BloodBankAuditMeta,
  ) {
    const validHours = dto.validHours ?? 72;

    const { crossmatch, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "BloodUnit" WHERE "id" = ${dto.bloodUnitId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      const [patient, encounter, unit] = await Promise.all([
        tx.patient.findFirst({
          where: { id: dto.patientId, hospitalId, isDeleted: false },
        }),
        tx.encounter.findFirst({
          where: { id: dto.encounterId, hospitalId, patientId: dto.patientId },
        }),
        tx.bloodUnit.findFirst({
          where: { id: dto.bloodUnitId, hospitalId },
        }),
      ]);

      if (!patient) {
        throw new NotFoundException('المريض غير موجود في هذه المنشأة');
      }
      if (patient.isDeceased || patient.mergedIntoPatientId) {
        throw new ConflictException(
          'لا يمكن إجراء فحص توافق دم لملف مريض متوفى أو مدمج',
        );
      }
      if (!encounter) {
        throw new NotFoundException(
          'الزيارة السريرية غير موجودة أو لا تنتمي لهذا المريض',
        );
      }
      if (!unit) {
        throw new NotFoundException('وحدة الدم غير موجودة في هذه المنشأة');
      }

      if (unit.screeningStatus !== 'CLEARED') {
        throw new ConflictException(
          `حظر سلامة دموية: لا يجوز حجز أو نقل وحدة لم تجتز الفحص المصلي (${unit.screeningStatus})`,
        );
      }
      if (unit.status !== 'AVAILABLE') {
        throw new ConflictException(
          `وحدة الدم (${unit.unitNumber}) غير متاحة للحجز (الحالة الحالية: ${unit.status})`,
        );
      }

      const now = new Date();
      if (unit.expiresAt.getTime() <= now.getTime()) {
        throw new ConflictException(
          `حظر سلامة دموية: وحدة الدم (${unit.unitNumber}) منتهية الصلاحية بتاريخ ${unit.expiresAt.toISOString().slice(0, 10)}`,
        );
      }

      const compat = evaluateBloodCompatibility(
        dto.patientBloodGroup,
        unit.bloodGroup as BloodGroup,
        unit.componentType as BloodComponentType,
      );
      if (!compat.compatible) {
        throw new ConflictException(compat.reason);
      }

      const validUntil = new Date(
        Math.min(
          now.getTime() + validHours * 3_600_000,
          unit.expiresAt.getTime(),
        ),
      );

      await tx.bloodUnit.update({
        where: { id: unit.id },
        data: { status: 'CROSSMATCHED' },
      });

      const created = await tx.bloodCrossmatch.create({
        data: {
          hospitalId,
          patientId: patient.id,
          encounterId: encounter.id,
          bloodUnitId: unit.id,
          patientBloodGroup: dto.patientBloodGroup,
          antibodyScreen: dto.antibodyScreen ?? 'NEGATIVE',
          crossmatchResult: 'COMPATIBLE',
          status: 'ACTIVE',
          validUntil,
          performedById: userId,
          notes: dto.notes?.trim() || compat.reason,
        },
        include: CROSSMATCH_INCLUDE,
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'BLOOD_CROSSMATCH_CREATED',
        entity: 'BloodCrossmatch',
        entityId: created.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          patientId: patient.id,
          encounterId: encounter.id,
          unitNumber: unit.unitNumber,
          patientBloodGroup: dto.patientBloodGroup,
          donorBloodGroup: unit.bloodGroup,
          componentType: unit.componentType,
        },
      });

      return { crossmatch: created, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return crossmatch;
  }

  async verifyCrossmatch(
    hospitalId: number,
    crossmatchId: number,
    verifierId: number,
    meta?: BloodBankAuditMeta,
  ) {
    const { crossmatch, audit } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.bloodCrossmatch.findFirst({
        where: { id: crossmatchId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('سجل التوافق غير موجود في هذه المنشأة');
      }
      if (existing.status !== 'ACTIVE') {
        throw new ConflictException(
          `لا يمكن اعتماد سجل توافق في حالة (${existing.status})`,
        );
      }
      if (existing.verifiedById) {
        throw new ConflictException('تم اعتماد سجل التوافق مسبقًا');
      }
      if (existing.performedById === verifierId) {
        throw new ForbiddenException(
          'رقابة 4 عيون: لا يجوز لفني المختبر الذي أجرى التوافق اعتماده بنفسه',
        );
      }

      const updated = await tx.bloodCrossmatch.update({
        where: { id: existing.id },
        data: {
          verifiedById: verifierId,
          verifiedAt: new Date(),
        },
        include: CROSSMATCH_INCLUDE,
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: verifierId,
        action: 'BLOOD_CROSSMATCH_VERIFIED',
        entity: 'BloodCrossmatch',
        entityId: updated.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          bloodUnitId: updated.bloodUnitId,
          patientBloodGroup: updated.patientBloodGroup,
        },
      });

      return { crossmatch: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return crossmatch;
  }

  async listCrossmatches(hospitalId: number, encounterId?: number) {
    return this.prisma.bloodCrossmatch.findMany({
      where: {
        hospitalId,
        ...(encounterId ? { encounterId } : {}),
      },
      include: CROSSMATCH_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  // =========================================================================
  // 3. Blood Issue, Dual Bedside Verification, Infusion & Hemovigilance
  // =========================================================================

  async issueBloodUnit(
    hospitalId: number,
    crossmatchId: number,
    userId: number,
    meta?: BloodBankAuditMeta,
  ) {
    const { transfusion, audit } = await this.prisma.$transaction(
      async (tx) => {
        const crossmatch = await tx.bloodCrossmatch.findFirst({
          where: { id: crossmatchId, hospitalId },
          include: { bloodUnit: true },
        });
        if (!crossmatch) {
          throw new NotFoundException('سجل التوافق غير موجود في هذه المنشأة');
        }
        if (crossmatch.status !== 'ACTIVE') {
          throw new ConflictException(
            `لا يمكن صرف وحدة الدم لسجل توافق في حالة (${crossmatch.status})`,
          );
        }
        if (!crossmatch.verifiedById) {
          throw new ConflictException(
            'حظر سلامة: يجب اعتماد فحص التوافق (4 عيون) قبل صرف وحدة الدم من بنك الدم',
          );
        }

        const now = new Date();
        if (crossmatch.validUntil.getTime() <= now.getTime()) {
          throw new ConflictException(
            'انتهت صلاحية فحص التوافق (72 ساعة)؛ يلزم إعادة التوافق قبل الصرف',
          );
        }
        if (crossmatch.bloodUnit.expiresAt.getTime() <= now.getTime()) {
          throw new ConflictException(
            'حظر سلامة دموية: انتهت صلاحية كيس الدم قبل الصرف',
          );
        }

        await tx.bloodCrossmatch.update({
          where: { id: crossmatch.id },
          data: { status: 'ISSUED' },
        });
        await tx.bloodUnit.update({
          where: { id: crossmatch.bloodUnitId },
          data: { status: 'ISSUED' },
        });

        const created = await tx.bloodTransfusion.create({
          data: {
            hospitalId,
            patientId: crossmatch.patientId,
            encounterId: crossmatch.encounterId,
            bloodUnitId: crossmatch.bloodUnitId,
            crossmatchId: crossmatch.id,
            status: 'ISSUED',
            issuedById: userId,
          },
          include: TRANSFUSION_INCLUDE,
        });

        const auditLog = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          action: 'BLOOD_UNIT_ISSUED',
          entity: 'BloodTransfusion',
          entityId: created.id,
          ipAddress: meta?.ipAddress,
          clientName: meta?.clientName,
          details: {
            crossmatchId: crossmatch.id,
            unitNumber: crossmatch.bloodUnit.unitNumber,
            patientId: crossmatch.patientId,
          },
        });

        return { transfusion: created, audit: auditLog };
      },
    );

    publishCommittedCriticalAudit(audit);
    return transfusion;
  }

  async bedsideVerify(
    hospitalId: number,
    transfusionId: number,
    verifierId: number,
    dto: BedsideVerifyStepDto,
    meta?: BloodBankAuditMeta,
  ) {
    if (!dto.patientBandScanned || !dto.bagBarcodeScanned) {
      throw new BadRequestException(
        'حظر سلامة بجانب السرير: يجب مسح إسوارة المريض وباركود كيس الدم معًا',
      );
    }

    const { transfusion, audit } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "BloodTransfusion" WHERE "id" = ${transfusionId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        const existing = await tx.bloodTransfusion.findFirst({
          where: { id: transfusionId, hospitalId },
          include: {
            patient: { select: { id: true, mrn: true } },
            bloodUnit: {
              select: { id: true, unitNumber: true, expiresAt: true },
            },
          },
        });
        if (!existing) {
          throw new NotFoundException('سجل نقل الدم غير موجود في هذه المنشأة');
        }
        if (existing.status !== 'ISSUED') {
          throw new ConflictException(
            `لا يمكن تنفيذ التحقق بجانب السرير لسجل في حالة (${existing.status})`,
          );
        }

        if (
          dto.scannedUnitNumber.trim().toUpperCase() !==
          existing.bloodUnit.unitNumber.toUpperCase()
        ) {
          throw new ConflictException(
            `تعارض باركود كيس الدم! الباركود الممسوح (${dto.scannedUnitNumber}) لا يطابق الوحدة المصروفة (${existing.bloodUnit.unitNumber})`,
          );
        }
        if (
          dto.scannedPatientMrn.trim().toUpperCase() !==
          existing.patient.mrn.toUpperCase()
        ) {
          throw new ConflictException(
            `تعارض هوية المريض! إسوارة المريض (${dto.scannedPatientMrn}) لا تطابق ملف المريض (${existing.patient.mrn})`,
          );
        }
        if (existing.bloodUnit.expiresAt.getTime() <= Date.now()) {
          throw new ConflictException(
            'حظر سلامة: انتهت صلاحية كيس الدم قبل التحقق بجانب السرير',
          );
        }

        const now = new Date();
        let updateData: Prisma.BloodTransfusionUncheckedUpdateInput;
        let stepLabel: string;

        if (!existing.bedsideVerifier1Id) {
          updateData = {
            bedsideVerifier1Id: verifierId,
            bedsideVerified1At: now,
            patientBandScanned: true,
            bagBarcodeScanned: true,
          };
          stepLabel = 'BEDSIDE_CHECK_1';
        } else if (!existing.bedsideVerifier2Id) {
          if (existing.bedsideVerifier1Id === verifierId) {
            throw new ForbiddenException(
              'بروتوكول التحقق المزدوج بجانب السرير (JCI): يجب أن يقوم ممرض/طبيب ثانٍ مستقل بالتأكيد الثاني',
            );
          }
          updateData = {
            bedsideVerifier2Id: verifierId,
            bedsideVerified2At: now,
            patientBandScanned: true,
            bagBarcodeScanned: true,
            status: 'VERIFIED_BEDSIDE',
          };
          stepLabel = 'BEDSIDE_CHECK_2_COMPLETED';
        } else {
          throw new ConflictException(
            'اكتمل التحقق المزدوج بجانب السرير مسبقًا',
          );
        }

        const updated = await tx.bloodTransfusion.update({
          where: { id: existing.id },
          data: updateData,
          include: TRANSFUSION_INCLUDE,
        });

        const auditLog = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: verifierId,
          action: 'BLOOD_TRANSFUSION_BEDSIDE_VERIFIED',
          entity: 'BloodTransfusion',
          entityId: updated.id,
          ipAddress: meta?.ipAddress,
          clientName: meta?.clientName,
          details: {
            step: stepLabel,
            unitNumber: existing.bloodUnit.unitNumber,
            patientMrn: existing.patient.mrn,
            status: updated.status,
          },
        });

        return { transfusion: updated, audit: auditLog };
      },
    );

    publishCommittedCriticalAudit(audit);
    return transfusion;
  }

  async startTransfusion(
    hospitalId: number,
    transfusionId: number,
    userId: number,
    meta?: BloodBankAuditMeta,
  ) {
    const { transfusion, audit } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "BloodTransfusion" WHERE "id" = ${transfusionId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        const existing = await tx.bloodTransfusion.findFirst({
          where: { id: transfusionId, hospitalId },
          include: { bloodUnit: true },
        });
        if (!existing) {
          throw new NotFoundException('سجل نقل الدم غير موجود في هذه المنشأة');
        }
        if (existing.status !== 'VERIFIED_BEDSIDE') {
          throw new ConflictException(
            'حظر سلامة: لا يمكن بدء نقل الدم قبل اكتمال التحقق المزدوج بجانب السرير من ممرضين مستقلين ومسح الباركود',
          );
        }

        const updated = await tx.bloodTransfusion.update({
          where: { id: existing.id },
          data: {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          },
          include: TRANSFUSION_INCLUDE,
        });

        const auditLog = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          action: 'BLOOD_TRANSFUSION_STARTED',
          entity: 'BloodTransfusion',
          entityId: updated.id,
          ipAddress: meta?.ipAddress,
          clientName: meta?.clientName,
          details: {
            unitNumber: existing.bloodUnit.unitNumber,
            startedAt: updated.startedAt?.toISOString(),
          },
        });

        return { transfusion: updated, audit: auditLog };
      },
    );

    publishCommittedCriticalAudit(audit);
    return transfusion;
  }

  async recordVitalsEvent(
    hospitalId: number,
    transfusionId: number,
    userId: number,
    dto: RecordTransfusionVitalsDto,
    meta?: BloodBankAuditMeta,
  ) {
    const { event, audit } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.bloodTransfusion.findFirst({
        where: { id: transfusionId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('سجل نقل الدم غير موجود في هذه المنشأة');
      }
      if (['RETURNED_UNUSED'].includes(existing.status)) {
        throw new ConflictException(
          'لا يمكن تسجيل علامات حيوية لوحدة أُعيدت دون نقل',
        );
      }

      const created = await tx.bloodTransfusionEvent.create({
        data: {
          hospitalId,
          transfusionId: existing.id,
          eventType: dto.eventType,
          recordedById: userId,
          temperatureC:
            dto.temperatureC !== undefined ? dto.temperatureC.toFixed(1) : null,
          heartRate: dto.heartRate ?? null,
          systolicBp: dto.systolicBp ?? null,
          diastolicBp: dto.diastolicBp ?? null,
          respiratoryRate: dto.respiratoryRate ?? null,
          spo2: dto.spo2 ?? null,
          notes: dto.notes?.trim() || null,
        },
        include: { recordedBy: { select: USER_LITE } },
      });

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'BLOOD_TRANSFUSION_VITALS_RECORDED',
        entity: 'BloodTransfusionEvent',
        entityId: created.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          transfusionId: existing.id,
          eventType: created.eventType,
          temperatureC: created.temperatureC?.toString() ?? null,
          heartRate: created.heartRate,
        },
      });

      return { event: created, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return event;
  }

  async completeTransfusion(
    hospitalId: number,
    transfusionId: number,
    userId: number,
    dto: CompleteTransfusionDto,
    meta?: BloodBankAuditMeta,
  ) {
    const { transfusion, audit } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "BloodTransfusion" WHERE "id" = ${transfusionId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        const existing = await tx.bloodTransfusion.findFirst({
          where: { id: transfusionId, hospitalId },
          include: { bloodUnit: true },
        });
        if (!existing) {
          throw new NotFoundException('سجل نقل الدم غير موجود في هذه المنشأة');
        }
        if (existing.status !== 'IN_PROGRESS') {
          throw new ConflictException(
            `لا يمكن إنهاء نقل دم في حالة (${existing.status})`,
          );
        }

        await tx.bloodUnit.update({
          where: { id: existing.bloodUnitId },
          data: { status: 'TRANSFUSED' },
        });
        await tx.bloodCrossmatch.update({
          where: { id: existing.crossmatchId },
          data: { status: 'CONSUMED' },
        });

        const updated = await tx.bloodTransfusion.update({
          where: { id: existing.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            volumeTransfusedMl: dto.volumeTransfusedMl,
          },
          include: TRANSFUSION_INCLUDE,
        });

        const auditLog = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          action: 'BLOOD_TRANSFUSION_COMPLETED',
          entity: 'BloodTransfusion',
          entityId: updated.id,
          ipAddress: meta?.ipAddress,
          clientName: meta?.clientName,
          details: {
            unitNumber: existing.bloodUnit.unitNumber,
            volumeTransfusedMl: dto.volumeTransfusedMl,
            notes: dto.notes?.trim() || null,
          },
        });

        return { transfusion: updated, audit: auditLog };
      },
    );

    publishCommittedCriticalAudit(audit);
    return transfusion;
  }

  async reportTransfusionReaction(
    hospitalId: number,
    transfusionId: number,
    userId: number,
    dto: ReportTransfusionReactionDto,
    meta?: BloodBankAuditMeta,
  ) {
    const { transfusion, audit } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "BloodTransfusion" WHERE "id" = ${transfusionId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        const existing = await tx.bloodTransfusion.findFirst({
          where: { id: transfusionId, hospitalId },
          include: {
            bloodUnit: true,
            patient: { select: { id: true, mrn: true } },
          },
        });
        if (!existing) {
          throw new NotFoundException('سجل نقل الدم غير موجود في هذه المنشأة');
        }
        if (!['IN_PROGRESS', 'COMPLETED'].includes(existing.status)) {
          throw new ConflictException(
            `لا يمكن تسجيل تفاعل نقل دم لوحدة في حالة (${existing.status})`,
          );
        }
        if (existing.hasReaction) {
          throw new ConflictException(
            'تم تسجيل تفاعل نقل دم لهذه الوحدة مسبقًا',
          );
        }

        const now = new Date();

        // Auto-create Hemovigilance ClinicalIncident in Quality & Safety module
        const incidentNumber = `HEMO-${now.getUTCFullYear()}-${existing.id}-${Date.now().toString().slice(-4)}`;
        const incident = await tx.clinicalIncident.create({
          data: {
            hospitalId,
            incidentNumber,
            incidentDate: now,
            reportedById: userId,
            incidentType: IncidentType.BLOOD_TRANSFUSION_REACTION,
            severity: dto.severity as IncidentSeverity,
            description: `Transfusion reaction (${dto.reactionType}) on Blood Unit ${existing.bloodUnit.unitNumber}: ${dto.reactionSymptoms}`,
            descriptionAr: `تفاعل نقل دم (${dto.reactionType}) على وحدة الدم ${existing.bloodUnit.unitNumber}: ${dto.reactionSymptoms}`,
            immediateAction: dto.actionTaken.trim(),
            patientId: existing.patientId,
            status: IncidentStatus.REPORTED,
          },
        });

        // Quarantine the blood unit for hemovigilance investigation
        await tx.bloodUnit.update({
          where: { id: existing.bloodUnitId },
          data: { status: 'REACTED_QUARANTINED' },
        });
        await tx.bloodCrossmatch.update({
          where: { id: existing.crossmatchId },
          data: { status: 'CONSUMED' },
        });

        // Append immutable reaction event
        await tx.bloodTransfusionEvent.create({
          data: {
            hospitalId,
            transfusionId: existing.id,
            eventType: 'REACTION_REPORTED',
            recordedById: userId,
            temperatureC:
              dto.temperatureC !== undefined
                ? dto.temperatureC.toFixed(1)
                : null,
            heartRate: dto.heartRate ?? null,
            systolicBp: dto.systolicBp ?? null,
            diastolicBp: dto.diastolicBp ?? null,
            spo2: dto.spo2 ?? null,
            reactionSymptoms: dto.reactionSymptoms.trim(),
            severity: dto.severity,
            actionTaken: dto.actionTaken.trim(),
          },
        });

        const updated = await tx.bloodTransfusion.update({
          where: { id: existing.id },
          data: {
            status: 'STOPPED_REACTION',
            stoppedAt: now,
            stopReason: `${dto.reactionType}: ${dto.reactionSymptoms.trim()}`,
            volumeTransfusedMl:
              dto.volumeTransfusedMl ?? existing.volumeTransfusedMl,
            hasReaction: true,
            reactionType: dto.reactionType.trim(),
            reactionSeverity: dto.severity,
            clinicalIncidentId: incident.id,
          },
          include: TRANSFUSION_INCLUDE,
        });

        const auditLog = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          action: 'BLOOD_TRANSFUSION_REACTION_REPORTED',
          entity: 'BloodTransfusion',
          entityId: updated.id,
          ipAddress: meta?.ipAddress,
          clientName: meta?.clientName,
          details: {
            unitNumber: existing.bloodUnit.unitNumber,
            reactionType: dto.reactionType,
            severity: dto.severity,
            clinicalIncidentId: incident.id,
            incidentNumber: incident.incidentNumber,
          },
        });

        return { transfusion: updated, audit: auditLog };
      },
    );

    publishCommittedCriticalAudit(audit);
    return transfusion;
  }

  async listTransfusions(hospitalId: number, encounterId?: number) {
    return this.prisma.bloodTransfusion.findMany({
      where: {
        hospitalId,
        ...(encounterId ? { encounterId } : {}),
      },
      include: TRANSFUSION_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
