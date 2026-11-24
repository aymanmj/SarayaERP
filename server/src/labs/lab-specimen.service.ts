import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { LabResultStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { enqueueConsumptionIntent } from '../inventory/consumption-intent';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  CollectSpecimenDto,
  ReceiveSpecimenDto,
  RejectSpecimenDto,
  UpdateSpecimenStatusDto,
  UpsertCultureReportDto,
} from './dto/lab-specimen.dto';

export interface LabAuditMeta {
  ipAddress?: string;
  clientName?: string;
}

const USER_LITE = { id: true, fullName: true } as const;

const SPECIMEN_INCLUDE = {
  collectedBy: { select: USER_LITE },
  receivedBy: { select: USER_LITE },
  rejectedBy: { select: USER_LITE },
  disposedBy: { select: USER_LITE },
  recollectionOf: { select: { id: true, barcode: true, status: true } },
  recollections: {
    select: { id: true, barcode: true, status: true, collectedAt: true },
    orderBy: { collectedAt: 'asc' as const },
  },
  events: {
    include: { actor: { select: USER_LITE } },
    orderBy: { createdAt: 'asc' as const },
  },
};

const CULTURE_INCLUDE = {
  enteredBy: { select: USER_LITE },
  verifiedBy: { select: USER_LITE },
  specimen: {
    select: { id: true, barcode: true, specimenType: true, status: true },
  },
  sensitivities: { orderBy: { antibioticName: 'asc' as const } },
};

export function computeCultureVerificationHash(payload: {
  id: number;
  hospitalId: number;
  labOrderId: number;
  specimenId: number | null;
  gramStain: string | null;
  growthStatus: string;
  organismName: string | null;
  organismCode: string | null;
  colonyCount: string | null;
  incubationHours: number | null;
  comments: string | null;
  verifiedById: number;
  verifiedAt: Date;
  sensitivities: Array<{
    antibioticName: string;
    interpretation: string;
    micValue: string | null;
    zoneDiameterMm: number | null;
  }>;
}): string {
  const sortedAst = [...payload.sensitivities]
    .sort((a, b) => a.antibioticName.localeCompare(b.antibioticName))
    .map((s) => ({
      a: s.antibioticName,
      i: s.interpretation,
      m: s.micValue ?? null,
      z: s.zoneDiameterMm ?? null,
    }));

  const canonical = JSON.stringify({
    v: 1,
    id: payload.id,
    hospitalId: payload.hospitalId,
    labOrderId: payload.labOrderId,
    specimenId: payload.specimenId,
    gramStain: payload.gramStain ?? null,
    growthStatus: payload.growthStatus,
    organismName: payload.organismName ?? null,
    organismCode: payload.organismCode ?? null,
    colonyCount: payload.colonyCount ?? null,
    incubationHours: payload.incubationHours ?? null,
    comments: payload.comments ?? null,
    verifiedById: payload.verifiedById,
    verifiedAt: payload.verifiedAt.toISOString(),
    ast: sortedAst,
  });

  return createHash('sha256').update(canonical).digest('hex');
}

function buildCultureSummary(report: {
  growthStatus: string;
  organismName: string | null;
  sensitivities: Array<{ antibioticName: string; interpretation: string }>;
}): string {
  if (report.growthStatus === 'NO_GROWTH') {
    return 'No Growth (Culture Negative)';
  }
  if (report.growthStatus === 'CONTAMINATED') {
    return 'Contaminated Specimen — Recollection Advised';
  }
  const organism = report.organismName?.trim() || report.growthStatus;
  const susceptible = report.sensitivities
    .filter((s) => s.interpretation === 'S')
    .map((s) => s.antibioticName);
  const resistant = report.sensitivities
    .filter((s) => s.interpretation === 'R')
    .map((s) => s.antibioticName);
  const parts: string[] = [organism];
  if (susceptible.length > 0) {
    parts.push(`S: ${susceptible.slice(0, 5).join(', ')}`);
  }
  if (resistant.length > 0) {
    parts.push(`R: ${resistant.slice(0, 5).join(', ')}`);
  }
  return parts.join(' | ');
}

@Injectable()
export class LabSpecimenService {
  constructor(private readonly prisma: PrismaService) {}

  async collectSpecimen(
    hospitalId: number,
    userId: number,
    dto: CollectSpecimenDto,
    auditMeta?: LabAuditMeta,
  ) {
    const customBarcode = dto.barcode?.trim() || null;

    const specimen = await this.prisma.$transaction(async (tx) => {
      const labOrder = await tx.labOrder.findFirst({
        where: { id: dto.labOrderId, order: { hospitalId } },
        include: {
          order: { select: { id: true, hospitalId: true, status: true } },
        },
      });
      if (!labOrder) {
        throw new NotFoundException('طلب التحليل غير موجود في هذه المنشأة');
      }
      if (labOrder.order.status === OrderStatus.CANCELLED) {
        throw new ConflictException('لا يمكن سحب عينة لطلب تحليل ملغى');
      }

      if (dto.recollectionOfId) {
        await tx.$executeRaw`SELECT id FROM "LabSpecimen" WHERE id = ${dto.recollectionOfId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        const original = await tx.labSpecimen.findFirst({
          where: {
            id: dto.recollectionOfId,
            hospitalId,
            labOrderId: labOrder.id,
          },
          select: { id: true, status: true },
        });
        if (!original) {
          throw new NotFoundException(
            'العينة الأصلية المطلوب إعادة سحبها غير موجودة ضمن نفس الطلب',
          );
        }
        if (
          original.status !== 'REJECTED' &&
          original.status !== 'RECOLLECT_REQUESTED'
        ) {
          throw new ConflictException(
            'يمكن ربط إعادة السحب فقط بعينة مرفوضة أو مطلوب إعادة سحبها',
          );
        }
      }

      const existingCount = await tx.labSpecimen.count({
        where: { hospitalId, labOrderId: labOrder.id },
      });
      const barcode =
        customBarcode ??
        `SPC-H${hospitalId}-LO${labOrder.id}-${existingCount + 1}-${randomBytes(3).toString('hex').toUpperCase()}`;

      const duplicateBarcode = await tx.labSpecimen.findUnique({
        where: { hospitalId_barcode: { hospitalId, barcode } },
        select: { id: true },
      });
      if (duplicateBarcode) {
        throw new ConflictException(
          'رقم باركود العينة مستخدم مسبقًا في هذه المنشأة',
        );
      }

      const created = await tx.labSpecimen.create({
        data: {
          hospitalId,
          labOrderId: labOrder.id,
          barcode,
          specimenType: dto.specimenType,
          containerType: dto.containerType?.trim() || null,
          collectionSite: dto.collectionSite?.trim() || null,
          status: 'COLLECTED',
          collectedById: userId,
          recollectionOfId: dto.recollectionOfId ?? null,
          notes: dto.notes?.trim() || null,
        },
      });

      await tx.labSpecimenEvent.create({
        data: {
          hospitalId,
          specimenId: created.id,
          eventType: 'COLLECTED',
          fromStatus: null,
          toStatus: 'COLLECTED',
          actorId: userId,
          notes: dto.recollectionOfId
            ? `إعادة سحب للعينة #${dto.recollectionOfId}${dto.notes ? ` — ${dto.notes.trim()}` : ''}`
            : dto.notes?.trim() || null,
        },
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'LAB_SPECIMEN_COLLECTED',
        entity: 'LabSpecimen',
        entityId: created.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          labOrderId: labOrder.id,
          barcode: created.barcode,
          specimenType: created.specimenType,
          recollectionOfId: created.recollectionOfId,
        },
      });

      return tx.labSpecimen.findUniqueOrThrow({
        where: { id: created.id },
        include: SPECIMEN_INCLUDE,
      });
    });

    publishCommittedCriticalAudit({
      action: 'LAB_SPECIMEN_COLLECTED',
      entity: 'LabSpecimen',
      entityId: specimen.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: { labOrderId: specimen.labOrderId, barcode: specimen.barcode },
    });

    return specimen;
  }

  async findByBarcode(hospitalId: number, barcode: string) {
    const clean = barcode.trim();
    if (!clean) {
      throw new BadRequestException('يرجى إدخال باركود العينة');
    }
    const specimen = await this.prisma.labSpecimen.findUnique({
      where: { hospitalId_barcode: { hospitalId, barcode: clean } },
      include: {
        ...SPECIMEN_INCLUDE,
        labOrder: {
          include: {
            test: {
              select: { id: true, code: true, name: true, nameAr: true },
            },
            order: {
              select: {
                id: true,
                encounterId: true,
                paymentStatus: true,
                encounter: {
                  select: {
                    patient: {
                      select: { id: true, mrn: true, fullName: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!specimen) {
      throw new NotFoundException(
        'العينة غير موجودة بهذا الباركود في هذه المنشأة',
      );
    }
    return specimen;
  }

  async getOrderSpecimensAndCultures(hospitalId: number, labOrderId: number) {
    const labOrder = await this.prisma.labOrder.findFirst({
      where: { id: labOrderId, order: { hospitalId } },
      select: {
        id: true,
        resultStatus: true,
        resultValue: true,
        resultDate: true,
        test: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    });
    if (!labOrder) {
      throw new NotFoundException('طلب التحليل غير موجود في هذه المنشأة');
    }

    const [specimens, cultureReports] = await Promise.all([
      this.prisma.labSpecimen.findMany({
        where: { hospitalId, labOrderId },
        include: SPECIMEN_INCLUDE,
        orderBy: { collectedAt: 'asc' },
      }),
      this.prisma.labCultureReport.findMany({
        where: { hospitalId, labOrderId },
        include: CULTURE_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { labOrder, specimens, cultureReports };
  }

  async receiveSpecimen(
    hospitalId: number,
    specimenId: number,
    userId: number,
    dto: ReceiveSpecimenDto,
    auditMeta?: LabAuditMeta,
  ) {
    const received = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "LabSpecimen" WHERE id = ${specimenId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.labSpecimen.findFirst({
        where: { id: specimenId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('العينة غير موجودة في هذه المنشأة');
      }
      if (existing.status !== 'COLLECTED' && existing.status !== 'IN_TRANSIT') {
        throw new ConflictException(
          `لا يمكن استلام عينة في حالة ${existing.status}`,
        );
      }

      const now = new Date();
      await tx.labSpecimen.update({
        where: { id: existing.id },
        data: {
          status: 'RECEIVED',
          receivedById: userId,
          receivedAt: now,
        },
      });

      await tx.labSpecimenEvent.create({
        data: {
          hospitalId,
          specimenId: existing.id,
          eventType: 'RECEIVED',
          fromStatus: existing.status,
          toStatus: 'RECEIVED',
          actorId: userId,
          notes: dto.notes?.trim() || null,
        },
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'LAB_SPECIMEN_RECEIVED',
        entity: 'LabSpecimen',
        entityId: existing.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          labOrderId: existing.labOrderId,
          barcode: existing.barcode,
        },
      });

      return tx.labSpecimen.findUniqueOrThrow({
        where: { id: existing.id },
        include: SPECIMEN_INCLUDE,
      });
    });

    publishCommittedCriticalAudit({
      action: 'LAB_SPECIMEN_RECEIVED',
      entity: 'LabSpecimen',
      entityId: received.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: { barcode: received.barcode },
    });

    return received;
  }

  async rejectSpecimen(
    hospitalId: number,
    specimenId: number,
    userId: number,
    dto: RejectSpecimenDto,
    auditMeta?: LabAuditMeta,
  ) {
    const nextStatus = dto.requestRecollection
      ? 'RECOLLECT_REQUESTED'
      : 'REJECTED';
    const eventType = dto.requestRecollection
      ? 'RECOLLECT_REQUESTED'
      : 'REJECTED';

    const rejected = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "LabSpecimen" WHERE id = ${specimenId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.labSpecimen.findFirst({
        where: { id: specimenId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('العينة غير موجودة في هذه المنشأة');
      }
      if (
        ['REJECTED', 'RECOLLECT_REQUESTED', 'DISPOSED'].includes(
          existing.status,
        )
      ) {
        throw new ConflictException(
          `لا يمكن رفض عينة في حالة ${existing.status}`,
        );
      }

      const now = new Date();
      await tx.labSpecimen.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          rejectedById: userId,
          rejectedAt: now,
          rejectionCode: dto.rejectionCode,
          rejectionReason: dto.rejectionReason.trim(),
        },
      });

      await tx.labSpecimenEvent.create({
        data: {
          hospitalId,
          specimenId: existing.id,
          eventType,
          fromStatus: existing.status,
          toStatus: nextStatus,
          actorId: userId,
          notes: `${dto.rejectionCode}: ${dto.rejectionReason.trim()}`,
        },
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'LAB_SPECIMEN_REJECTED',
        entity: 'LabSpecimen',
        entityId: existing.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          labOrderId: existing.labOrderId,
          barcode: existing.barcode,
          rejectionCode: dto.rejectionCode,
          requestRecollection: Boolean(dto.requestRecollection),
        },
      });

      return tx.labSpecimen.findUniqueOrThrow({
        where: { id: existing.id },
        include: SPECIMEN_INCLUDE,
      });
    });

    publishCommittedCriticalAudit({
      action: 'LAB_SPECIMEN_REJECTED',
      entity: 'LabSpecimen',
      entityId: rejected.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        barcode: rejected.barcode,
        rejectionCode: rejected.rejectionCode,
      },
    });

    return rejected;
  }

  async updateSpecimenStatus(
    hospitalId: number,
    specimenId: number,
    userId: number,
    dto: UpdateSpecimenStatusDto,
    auditMeta?: LabAuditMeta,
  ) {
    const allowedFrom: Record<UpdateSpecimenStatusDto['status'], string[]> = {
      IN_PROCESS: ['RECEIVED'],
      STORED: ['RECEIVED', 'IN_PROCESS'],
      DISPOSED: [
        'RECEIVED',
        'IN_PROCESS',
        'STORED',
        'REJECTED',
        'RECOLLECT_REQUESTED',
      ],
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "LabSpecimen" WHERE id = ${specimenId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.labSpecimen.findFirst({
        where: { id: specimenId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('العينة غير موجودة في هذه المنشأة');
      }
      if (!allowedFrom[dto.status].includes(existing.status)) {
        throw new ConflictException(
          `لا يمكن تحويل العينة من ${existing.status} إلى ${dto.status}`,
        );
      }

      const now = new Date();
      await tx.labSpecimen.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          storageLocation:
            dto.storageLocation !== undefined
              ? dto.storageLocation.trim() || null
              : existing.storageLocation,
          ...(dto.status === 'DISPOSED'
            ? { disposedById: userId, disposedAt: now }
            : {}),
        },
      });

      await tx.labSpecimenEvent.create({
        data: {
          hospitalId,
          specimenId: existing.id,
          eventType:
            dto.status === 'IN_PROCESS' ? 'PROCESSING_STARTED' : dto.status,
          fromStatus: existing.status,
          toStatus: dto.status,
          actorId: userId,
          notes: dto.notes?.trim() || dto.storageLocation?.trim() || null,
        },
      });

      await appendChainedAuditInTransaction(tx, {
        action: `LAB_SPECIMEN_${dto.status}`,
        entity: 'LabSpecimen',
        entityId: existing.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          barcode: existing.barcode,
          fromStatus: existing.status,
          toStatus: dto.status,
        },
      });

      return tx.labSpecimen.findUniqueOrThrow({
        where: { id: existing.id },
        include: SPECIMEN_INCLUDE,
      });
    });

    publishCommittedCriticalAudit({
      action: `LAB_SPECIMEN_${dto.status}`,
      entity: 'LabSpecimen',
      entityId: updated.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: { barcode: updated.barcode, status: dto.status },
    });

    return updated;
  }

  async upsertCultureReport(
    hospitalId: number,
    userId: number,
    dto: UpsertCultureReportDto,
    auditMeta?: LabAuditMeta,
  ) {
    if (
      dto.growthStatus === 'SIGNIFICANT_GROWTH' &&
      (!dto.organismName || !dto.organismName.trim())
    ) {
      throw new BadRequestException(
        'يجب تحديد اسم الميكروب المعزول عند وجود نمو بكتيري ذي دلالة سريرية',
      );
    }

    const sensitivities = dto.sensitivities ?? [];
    const seenAntibiotics = new Set<string>();
    for (const s of sensitivities) {
      const key = s.antibioticName.trim().toLowerCase();
      if (seenAntibiotics.has(key)) {
        throw new BadRequestException(
          `المضاد الحيوي "${s.antibioticName}" مكرر في جدول الحساسية`,
        );
      }
      seenAntibiotics.add(key);
    }

    const report = await this.prisma.$transaction(async (tx) => {
      const labOrder = await tx.labOrder.findFirst({
        where: { id: dto.labOrderId, order: { hospitalId } },
        select: { id: true },
      });
      if (!labOrder) {
        throw new NotFoundException('طلب التحليل غير موجود في هذه المنشأة');
      }

      if (dto.specimenId) {
        const specimen = await tx.labSpecimen.findFirst({
          where: {
            id: dto.specimenId,
            hospitalId,
            labOrderId: labOrder.id,
          },
          select: { id: true, status: true },
        });
        if (!specimen) {
          throw new NotFoundException(
            'العينة المرتبطة غير موجودة ضمن نفس طلب التحليل',
          );
        }
        if (
          specimen.status === 'REJECTED' ||
          specimen.status === 'RECOLLECT_REQUESTED'
        ) {
          throw new ConflictException(
            'لا يمكن إدخال نتيجة مزرعة على عينة مرفوضة؛ يرجى استخدام عينة إعادة السحب',
          );
        }
      }

      let reportId: number;
      if (dto.reportId) {
        await tx.$executeRaw`SELECT id FROM "LabCultureReport" WHERE id = ${dto.reportId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        const existing = await tx.labCultureReport.findFirst({
          where: { id: dto.reportId, hospitalId, labOrderId: labOrder.id },
        });
        if (!existing) {
          throw new NotFoundException('تقرير المزرعة غير موجود');
        }
        if (existing.status === 'FINAL_VERIFIED') {
          throw new ConflictException(
            'تقرير المزرعة معتمد نهائيًا ومقفل ولا يمكن تعديله',
          );
        }

        await tx.labCultureReport.update({
          where: { id: existing.id },
          data: {
            specimenId:
              dto.specimenId !== undefined
                ? dto.specimenId
                : existing.specimenId,
            status: dto.status ?? existing.status,
            gramStain: dto.gramStain?.trim() || null,
            growthStatus: dto.growthStatus,
            organismName: dto.organismName?.trim() || null,
            organismCode: dto.organismCode?.trim() || null,
            colonyCount: dto.colonyCount?.trim() || null,
            incubationHours: dto.incubationHours ?? null,
            comments: dto.comments?.trim() || null,
          },
        });
        await tx.labCultureSensitivity.deleteMany({
          where: { cultureReportId: existing.id },
        });
        reportId = existing.id;
      } else {
        const created = await tx.labCultureReport.create({
          data: {
            hospitalId,
            labOrderId: labOrder.id,
            specimenId: dto.specimenId ?? null,
            status: dto.status ?? 'PRELIMINARY',
            gramStain: dto.gramStain?.trim() || null,
            growthStatus: dto.growthStatus,
            organismName: dto.organismName?.trim() || null,
            organismCode: dto.organismCode?.trim() || null,
            colonyCount: dto.colonyCount?.trim() || null,
            incubationHours: dto.incubationHours ?? null,
            comments: dto.comments?.trim() || null,
            enteredById: userId,
          },
        });
        reportId = created.id;
      }

      if (sensitivities.length > 0) {
        await tx.labCultureSensitivity.createMany({
          data: sensitivities.map((s) => ({
            cultureReportId: reportId,
            antibioticName: s.antibioticName.trim(),
            antibioticCode: s.antibioticCode?.trim() || null,
            interpretation: s.interpretation,
            micValue: s.micValue?.trim() || null,
            zoneDiameterMm: s.zoneDiameterMm ?? null,
            isRestricted: Boolean(s.isRestricted),
            notes: s.notes?.trim() || null,
          })),
        });
      }

      await appendChainedAuditInTransaction(tx, {
        action: dto.reportId
          ? 'LAB_CULTURE_REPORT_UPDATED'
          : 'LAB_CULTURE_REPORT_CREATED',
        entity: 'LabCultureReport',
        entityId: reportId,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          labOrderId: labOrder.id,
          specimenId: dto.specimenId ?? null,
          growthStatus: dto.growthStatus,
          organismName: dto.organismName?.trim() || null,
          sensitivityCount: sensitivities.length,
        },
      });

      return tx.labCultureReport.findUniqueOrThrow({
        where: { id: reportId },
        include: CULTURE_INCLUDE,
      });
    });

    publishCommittedCriticalAudit({
      action: dto.reportId
        ? 'LAB_CULTURE_REPORT_UPDATED'
        : 'LAB_CULTURE_REPORT_CREATED',
      entity: 'LabCultureReport',
      entityId: report.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        labOrderId: report.labOrderId,
        growthStatus: report.growthStatus,
      },
    });

    return report;
  }

  async verifyCultureReport(
    hospitalId: number,
    reportId: number,
    userId: number,
    auditMeta?: LabAuditMeta,
  ) {
    const verified = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "LabCultureReport" WHERE id = ${reportId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.labCultureReport.findFirst({
        where: { id: reportId, hospitalId },
        include: {
          sensitivities: { orderBy: { antibioticName: 'asc' } },
          labOrder: {
            select: {
              id: true,
              orderId: true,
              testId: true,
              resultStatus: true,
            },
          },
        },
      });
      if (!existing) {
        throw new NotFoundException('تقرير المزرعة غير موجود في هذه المنشأة');
      }
      if (existing.status === 'FINAL_VERIFIED') {
        throw new ConflictException('تقرير المزرعة معتمد نهائيًا مسبقًا');
      }
      if (
        existing.growthStatus === 'SIGNIFICANT_GROWTH' &&
        existing.sensitivities.length === 0
      ) {
        throw new BadRequestException(
          'لا يمكن الاعتماد النهائي لمزرعة إيجابية دون تسجيل نتائج الحساسية للمضادات الحيوية (AST)',
        );
      }

      const verifiedAt = new Date();
      const verificationHash = computeCultureVerificationHash({
        id: existing.id,
        hospitalId: existing.hospitalId,
        labOrderId: existing.labOrderId,
        specimenId: existing.specimenId,
        gramStain: existing.gramStain,
        growthStatus: existing.growthStatus,
        organismName: existing.organismName,
        organismCode: existing.organismCode,
        colonyCount: existing.colonyCount,
        incubationHours: existing.incubationHours,
        comments: existing.comments,
        verifiedById: userId,
        verifiedAt,
        sensitivities: existing.sensitivities,
      });

      const saved = await tx.labCultureReport.update({
        where: { id: existing.id },
        data: {
          status: 'FINAL_VERIFIED',
          verifiedById: userId,
          verifiedAt,
          verificationHash,
        },
        include: CULTURE_INCLUDE,
      });

      const summary = buildCultureSummary(saved);
      await tx.labOrder.update({
        where: { id: existing.labOrderId },
        data: {
          resultStatus: LabResultStatus.COMPLETED,
          resultValue: summary,
          resultDate: verifiedAt,
          isVerified: true,
          verifiedById: userId,
          verifiedAt,
          verificationHash,
        },
      });
      await tx.order.update({
        where: { id: existing.labOrder.orderId },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: verifiedAt,
        },
      });

      const labTestRow = await tx.labTest.findUnique({
        where: { id: existing.labOrder.testId },
        select: { serviceItemId: true },
      });
      if (
        existing.labOrder.resultStatus !== LabResultStatus.COMPLETED &&
        labTestRow?.serviceItemId
      ) {
        await enqueueConsumptionIntent(tx, {
          hospitalId,
          serviceItemId: labTestRow.serviceItemId,
          referenceType: 'LAB_ORDER',
          referenceId: existing.labOrderId,
          userId,
        });
      }

      await appendChainedAuditInTransaction(tx, {
        action: 'LAB_CULTURE_REPORT_VERIFIED',
        entity: 'LabCultureReport',
        entityId: saved.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          labOrderId: saved.labOrderId,
          organismName: saved.organismName,
          verificationHash,
        },
      });

      return saved;
    });

    publishCommittedCriticalAudit({
      action: 'LAB_CULTURE_REPORT_VERIFIED',
      entity: 'LabCultureReport',
      entityId: verified.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        labOrderId: verified.labOrderId,
        verificationHash: verified.verificationHash,
      },
    });

    return verified;
  }
}
