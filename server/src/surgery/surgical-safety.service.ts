import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  computeAnesthesiaRecordHash,
  computeDeliverySafetyHash,
  computeWhoChecklistHash,
  evaluateDeliverySafety,
  evaluateSurgicalCount,
} from './surgical-safety.util';
import type {
  AddSurgicalCountDeltaDto,
  CreateSurgicalCountItemDto,
  RecordWhoChecklistDto,
  ResolveSurgicalCountDiscrepancyDto,
  SaveAnesthesiaRecordDto,
  SignDeliverySafetyDto,
  VerifySurgicalCountDto,
} from './dto/surgical-safety.dto';

@Injectable()
export class SurgicalSafetyService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureActiveUserInHospital(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    userId: number,
    label: string,
  ) {
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        isDeleted: false,
        OR: [{ hospitalId }, { accessibleHospitals: { some: { hospitalId } } }],
      },
      select: { id: true, fullName: true },
    });
    if (!user) {
      throw new NotFoundException(`${label} غير متاح أو غير نشط ضمن المنشأة.`);
    }
    return user;
  }

  async getCaseSafetySummary(hospitalId: number, surgeryCaseId: number) {
    const surgeryCase = await this.prisma.surgeryCase.findFirst({
      where: { id: surgeryCaseId, hospitalId },
      select: {
        id: true,
        surgeryName: true,
        status: true,
        safetyChecklists: {
          orderBy: { signedAt: 'asc' },
          include: {
            performedBy: { select: { id: true, fullName: true } },
            verifiedBy: { select: { id: true, fullName: true } },
          },
        },
        countItems: {
          orderBy: { id: 'asc' },
          include: {
            scrubNurse: { select: { id: true, fullName: true } },
            circulatingNurse: { select: { id: true, fullName: true } },
            incident: {
              select: { id: true, incidentNumber: true, severity: true },
            },
          },
        },
        anesthesiaRecord: {
          include: {
            anesthesiologist: { select: { id: true, fullName: true } },
            signedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!surgeryCase) {
      throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
    }

    const completedPhases = new Set(
      surgeryCase.safetyChecklists.map((c) => c.phase),
    );
    const unresolvedCounts = surgeryCase.countItems.filter(
      (c) => c.status === 'OPEN' || c.status === 'DISCREPANCY',
    );
    const discrepancyCounts = surgeryCase.countItems.filter(
      (c) => c.status === 'DISCREPANCY',
    );

    return {
      surgeryCaseId: surgeryCase.id,
      surgeryName: surgeryCase.surgeryName,
      status: surgeryCase.status,
      checklists: surgeryCase.safetyChecklists,
      countItems: surgeryCase.countItems,
      anesthesiaRecord: surgeryCase.anesthesiaRecord,
      readiness: {
        signInDone: completedPhases.has('SIGN_IN'),
        timeOutDone: completedPhases.has('TIME_OUT'),
        signOutDone: completedPhases.has('SIGN_OUT'),
        anesthesiaSigned: surgeryCase.anesthesiaRecord?.status === 'SIGNED',
        unresolvedCountItems: unresolvedCounts.length,
        discrepancyCountItems: discrepancyCounts.length,
        canStartIncision:
          completedPhases.has('SIGN_IN') && completedPhases.has('TIME_OUT'),
        canCloseAndComplete:
          completedPhases.has('SIGN_OUT') && unresolvedCounts.length === 0,
      },
    };
  }

  async recordWhoChecklist(
    hospitalId: number,
    surgeryCaseId: number,
    performedById: number,
    dto: RecordWhoChecklistDto,
  ) {
    const { created, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SurgeryCase" WHERE id = ${surgeryCaseId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const surgeryCase = await tx.surgeryCase.findFirst({
        where: { id: surgeryCaseId, hospitalId },
        include: {
          safetyChecklists: { select: { phase: true } },
          countItems: { select: { id: true, itemName: true, status: true } },
        },
      });
      if (!surgeryCase) {
        throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
      }

      const existingPhases = new Set(
        surgeryCase.safetyChecklists.map((c) => c.phase),
      );
      if (existingPhases.has(dto.phase)) {
        throw new ConflictException(
          `تم توثيق مرحلة قائمة التحقق الجراحي (${dto.phase}) مسبقًا وهي مقفلة غير قابلة للتعديل.`,
        );
      }

      // Enforce strict WHO sequential workflow: SIGN_IN -> TIME_OUT -> SIGN_OUT
      if (dto.phase === 'TIME_OUT' && !existingPhases.has('SIGN_IN')) {
        throw new ConflictException(
          'لا يمكن توثيق مرحلة TIME_OUT قبل إتمام مرحلة SIGN_IN.',
        );
      }
      if (dto.phase === 'SIGN_OUT' && !existingPhases.has('TIME_OUT')) {
        throw new ConflictException(
          'لا يمكن توثيق مرحلة SIGN_OUT قبل إتمام مرحلة TIME_OUT.',
        );
      }

      // Enforce zero unresolved surgical counts before SIGN_OUT
      if (dto.phase === 'SIGN_OUT') {
        const unresolved = surgeryCase.countItems.filter(
          (c) => c.status === 'OPEN' || c.status === 'DISCREPANCY',
        );
        if (unresolved.length > 0) {
          throw new ConflictException(
            `حظر سلامة جراحي: لا يمكن إغلاق مرحلة SIGN_OUT مع وجود ${unresolved.length} بنود عدّ جراحي غير مطابقة أو مفتوحة (${unresolved.map((u) => u.itemName).join(', ')}).`,
          );
        }
      }

      // Enforce 4-eyes independent verifier for TIME_OUT and SIGN_OUT
      let verifiedById: number | null = dto.verifiedById ?? null;
      if (dto.phase === 'TIME_OUT' || dto.phase === 'SIGN_OUT') {
        if (!verifiedById) {
          throw new BadRequestException(
            `تتطلب مرحلة ${dto.phase} تحقّقًا مزدوجًا (4 عيون) من عضو فريق مستقل (verifiedById).`,
          );
        }
        if (verifiedById === performedById) {
          throw new ConflictException(
            'لا يجوز التحقق الذاتي؛ يجب أن يكون المراجع المستقل شخصًا مختلفًا عن المُسجِّل.',
          );
        }
        await this.ensureActiveUserInHospital(
          tx,
          hospitalId,
          verifiedById,
          'المراجع المستقل',
        );
      } else if (verifiedById) {
        if (verifiedById === performedById) {
          verifiedById = null;
        } else {
          await this.ensureActiveUserInHospital(
            tx,
            hospitalId,
            verifiedById,
            'المراجع المستقل',
          );
        }
      }

      const signedAt = new Date();
      const siteMarked = Boolean(dto.siteMarked);
      const consentConfirmed = Boolean(dto.consentConfirmed);
      const allergyChecked = Boolean(dto.allergyChecked);
      const antibioticProphylaxisGiven = Boolean(
        dto.antibioticProphylaxisGiven,
      );
      const imagingDisplayed = Boolean(dto.imagingDisplayed);

      const signatureHash = computeWhoChecklistHash({
        hospitalId,
        surgeryCaseId,
        phase: dto.phase,
        checklistItems: dto.checklistItems,
        siteMarked,
        consentConfirmed,
        allergyChecked,
        antibioticProphylaxisGiven,
        imagingDisplayed,
        performedById,
        verifiedById,
        signedAt,
      });

      const record = await tx.surgicalSafetyChecklist.create({
        data: {
          hospitalId,
          surgeryCaseId,
          phase: dto.phase,
          checklistItems: dto.checklistItems as Prisma.InputJsonValue,
          siteMarked,
          consentConfirmed,
          allergyChecked,
          antibioticProphylaxisGiven,
          imagingDisplayed,
          performedById,
          verifiedById,
          signedAt,
          signatureHash,
          notes: dto.notes?.trim() || null,
        },
        include: {
          performedBy: { select: { id: true, fullName: true } },
          verifiedBy: { select: { id: true, fullName: true } },
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: performedById,
        action: 'WHO_SURGICAL_CHECKLIST_SIGNED',
        entity: 'SurgicalSafetyChecklist',
        entityId: record.id,
        details: {
          surgeryCaseId,
          phase: dto.phase,
          verifiedById,
          signatureHash,
        },
      });

      return { created: record, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return created;
  }

  async addSurgicalCountItem(
    hospitalId: number,
    surgeryCaseId: number,
    scrubNurseId: number,
    dto: CreateSurgicalCountItemDto,
  ) {
    const { created, audit } = await this.prisma.$transaction(async (tx) => {
      const surgeryCase = await tx.surgeryCase.findFirst({
        where: { id: surgeryCaseId, hospitalId },
        select: { id: true, status: true },
      });
      if (!surgeryCase) {
        throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
      }
      if (
        surgeryCase.status === 'COMPLETED' ||
        surgeryCase.status === 'CANCELLED'
      ) {
        throw new ConflictException(
          'لا يمكن إضافة بنود عدّ جراحي لعملية مكتملة أو ملغاة.',
        );
      }

      const item = await tx.surgicalCountItem.create({
        data: {
          hospitalId,
          surgeryCaseId,
          category: dto.category,
          itemName: dto.itemName.trim(),
          initialCount: dto.initialCount,
          addedCount: 0,
          status: 'OPEN',
          scrubNurseId,
        },
        include: {
          scrubNurse: { select: { id: true, fullName: true } },
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: scrubNurseId,
        action: 'SURGICAL_COUNT_OPENED',
        entity: 'SurgicalCountItem',
        entityId: item.id,
        details: {
          surgeryCaseId,
          category: dto.category,
          itemName: item.itemName,
          initialCount: dto.initialCount,
        },
      });

      return { created: item, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return created;
  }

  async addSurgicalCountDelta(
    hospitalId: number,
    countItemId: number,
    userId: number,
    dto: AddSurgicalCountDeltaDto,
  ) {
    const { updated, audit } = await this.prisma.$transaction(async (tx) => {
      const item = await tx.surgicalCountItem.findFirst({
        where: { id: countItemId, hospitalId },
      });
      if (!item) {
        throw new NotFoundException('بند العدّ الجراحي غير موجود ضمن المنشأة.');
      }
      if (item.status !== 'OPEN') {
        throw new ConflictException(
          'لا يمكن إضافة كميات لبند عدّ جراحي بعد إقفاله أو رصد تباين عليه.',
        );
      }

      const nextAdded = item.addedCount + dto.addedDelta;
      const saved = await tx.surgicalCountItem.update({
        where: { id: countItemId },
        data: { addedCount: nextAdded },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'SURGICAL_COUNT_ADDED',
        entity: 'SurgicalCountItem',
        entityId: item.id,
        details: {
          surgeryCaseId: item.surgeryCaseId,
          addedDelta: dto.addedDelta,
          newAddedCount: nextAdded,
        },
      });

      return { updated: saved, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return updated;
  }

  async verifySurgicalCount(
    hospitalId: number,
    countItemId: number,
    circulatingNurseId: number,
    dto: VerifySurgicalCountDto,
  ) {
    const { updated, audit } = await this.prisma.$transaction(async (tx) => {
      const item = await tx.surgicalCountItem.findFirst({
        where: { id: countItemId, hospitalId },
      });
      if (!item) {
        throw new NotFoundException('بند العدّ الجراحي غير موجود ضمن المنشأة.');
      }
      if (item.status !== 'OPEN' && item.status !== 'DISCREPANCY') {
        throw new ConflictException('تم إنهاء وإقفال هذا البند مسبقًا.');
      }
      if (item.scrubNurseId === circulatingNurseId) {
        throw new ConflictException(
          'العدّ الجراحي المزدوج (JCI IPSG.4) يشترط تحقق ممرض متجوّل مستقل مختلف عن ممرض التعقيم (Scrub Nurse).',
        );
      }

      const evalResult = evaluateSurgicalCount({
        initialCount: item.initialCount,
        addedCount: item.addedCount,
        finalCount: dto.finalCount,
      });

      const nextStatus = evalResult.isMatched ? 'MATCHED' : 'DISCREPANCY';
      const now = new Date();

      const saved = await tx.surgicalCountItem.update({
        where: { id: countItemId },
        data: {
          finalCount: dto.finalCount,
          status: nextStatus,
          circulatingNurseId,
          verifiedAt: now,
          resolutionNotes: dto.notes?.trim() || item.resolutionNotes,
        },
        include: {
          scrubNurse: { select: { id: true, fullName: true } },
          circulatingNurse: { select: { id: true, fullName: true } },
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: circulatingNurseId,
        action: evalResult.isMatched
          ? 'SURGICAL_COUNT_MATCHED'
          : 'SURGICAL_COUNT_DISCREPANCY',
        entity: 'SurgicalCountItem',
        entityId: item.id,
        details: {
          surgeryCaseId: item.surgeryCaseId,
          itemName: item.itemName,
          expectedFinal: evalResult.expectedFinal,
          finalCount: dto.finalCount,
          variance: evalResult.variance,
          status: nextStatus,
        },
      });

      return { updated: saved, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return updated;
  }

  async resolveSurgicalCountDiscrepancy(
    hospitalId: number,
    countItemId: number,
    circulatingNurseId: number,
    dto: ResolveSurgicalCountDiscrepancyDto,
  ) {
    const { updated, incident, audit } = await this.prisma.$transaction(
      async (tx) => {
        const item = await tx.surgicalCountItem.findFirst({
          where: { id: countItemId, hospitalId },
          include: {
            surgeryCase: {
              select: {
                id: true,
                surgeryName: true,
                encounter: { select: { patientId: true } },
                theatre: { select: { name: true } },
              },
            },
          },
        });
        if (!item) {
          throw new NotFoundException(
            'بند العدّ الجراحي غير موجود ضمن المنشأة.',
          );
        }
        if (item.status !== 'DISCREPANCY') {
          throw new ConflictException(
            'لا يمكن تسوية أو تصعيد إلا بندًا يحمل حالة تباين (DISCREPANCY).',
          );
        }
        if (item.scrubNurseId === circulatingNurseId) {
          throw new ConflictException(
            'تسوية تباين العدّ الجراحي تتطلب توثيق ممرض مستقل عن ممرض التعقيم.',
          );
        }

        let createdIncident: {
          id: number;
          incidentNumber: string;
          severity: IncidentSeverity;
        } | null = null;

        if (dto.resolutionStatus === 'ESCALATED_INCIDENT') {
          const incidentNumber = `INC-OR-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
          createdIncident = await tx.clinicalIncident.create({
            data: {
              hospitalId,
              incidentNumber,
              incidentDate: new Date(),
              reportedById: circulatingNurseId,
              incidentType: IncidentType.PROCEDURE_COMPLICATION,
              severity: IncidentSeverity.SENTINEL,
              status: IncidentStatus.REPORTED,
              patientId: item.surgeryCase.encounter.patientId,
              location: item.surgeryCase.theatre.name,
              description: `Unresolved surgical count discrepancy for ${item.itemName} (expected ${item.initialCount + item.addedCount}, counted ${item.finalCount ?? 'N/A'}) during ${item.surgeryCase.surgeryName}. Notes: ${dto.resolutionNotes.trim()}`,
              descriptionAr: `تصعيد تباين عدّ جراحي غير مطابق للصنف (${item.itemName}) أثناء عملية (${item.surgeryCase.surgeryName}). المتوقع: ${item.initialCount + item.addedCount}، الفعلي: ${item.finalCount ?? '—'}.`,
              immediateAction: dto.resolutionNotes.trim(),
            },
            select: { id: true, incidentNumber: true, severity: true },
          });
        }

        const now = new Date();
        const saved = await tx.surgicalCountItem.update({
          where: { id: countItemId },
          data: {
            status: dto.resolutionStatus,
            circulatingNurseId,
            verifiedAt: now,
            resolutionNotes: dto.resolutionNotes.trim(),
            incidentId: createdIncident?.id ?? null,
          },
          include: {
            scrubNurse: { select: { id: true, fullName: true } },
            circulatingNurse: { select: { id: true, fullName: true } },
            incident: {
              select: { id: true, incidentNumber: true, severity: true },
            },
          },
        });

        const auditEntry = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: circulatingNurseId,
          action: 'SURGICAL_COUNT_DISCREPANCY_RESOLVED',
          entity: 'SurgicalCountItem',
          entityId: item.id,
          details: {
            surgeryCaseId: item.surgeryCaseId,
            resolutionStatus: dto.resolutionStatus,
            incidentId: createdIncident?.id ?? null,
            incidentNumber: createdIncident?.incidentNumber ?? null,
          },
        });

        return { updated: saved, incident: createdIncident, audit: auditEntry };
      },
    );

    publishCommittedCriticalAudit(audit);
    return { countItem: updated, incident };
  }

  async saveAnesthesiaDraft(
    hospitalId: number,
    surgeryCaseId: number,
    anesthesiologistId: number,
    dto: SaveAnesthesiaRecordDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const surgeryCase = await tx.surgeryCase.findFirst({
        where: { id: surgeryCaseId, hospitalId },
        select: { id: true },
      });
      if (!surgeryCase) {
        throw new NotFoundException('العملية الجراحية غير موجودة ضمن المنشأة.');
      }

      const existing = await tx.anesthesiaRecord.findUnique({
        where: { surgeryCaseId },
      });
      if (existing?.status === 'SIGNED') {
        throw new ConflictException(
          'سجل التخدير موقّع ومقفل إلكترونيًا ولا يمكن تعديله.',
        );
      }

      const payload = {
        anesthesiologistId,
        asaClass: dto.asaClass,
        isEmergency: Boolean(dto.isEmergency),
        anesthesiaType: dto.anesthesiaType,
        airwayManagement: dto.airwayManagement?.trim() || null,
        inductionTime: dto.inductionTime ? new Date(dto.inductionTime) : null,
        emergenceTime: dto.emergenceTime ? new Date(dto.emergenceTime) : null,
        agentsUsed:
          dto.agentsUsed !== undefined
            ? (dto.agentsUsed as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        vitalsTimeline:
          dto.vitalsTimeline !== undefined
            ? (dto.vitalsTimeline as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        fluidsInMl: dto.fluidsInMl ?? 0,
        estimatedBloodLossMl: dto.estimatedBloodLossMl ?? 0,
        urineOutputMl: dto.urineOutputMl ?? 0,
        pacuAldreteScore: dto.pacuAldreteScore ?? null,
        complications: dto.complications?.trim() || null,
      };

      if (existing) {
        return tx.anesthesiaRecord.update({
          where: { id: existing.id },
          data: payload,
        });
      }
      return tx.anesthesiaRecord.create({
        data: {
          hospitalId,
          surgeryCaseId,
          status: 'DRAFT',
          ...payload,
        },
      });
    });
  }

  async signAnesthesiaRecord(
    hospitalId: number,
    surgeryCaseId: number,
    signedById: number,
  ) {
    const { signed, audit } = await this.prisma.$transaction(async (tx) => {
      const record = await tx.anesthesiaRecord.findFirst({
        where: { surgeryCaseId, hospitalId },
      });
      if (!record) {
        throw new NotFoundException(
          'لا توجد مسودة سجل تخدير لهذه العملية؛ احفظ المسودة أولًا قبل التوقيع.',
        );
      }
      if (record.status === 'SIGNED') {
        throw new ConflictException('سجل التخدير موقّع ومقفل مسبقًا.');
      }

      const signedAt = new Date();
      const signatureHash = computeAnesthesiaRecordHash({
        hospitalId,
        surgeryCaseId,
        anesthesiologistId: record.anesthesiologistId,
        asaClass: record.asaClass,
        isEmergency: record.isEmergency,
        anesthesiaType: record.anesthesiaType,
        airwayManagement: record.airwayManagement,
        fluidsInMl: record.fluidsInMl,
        estimatedBloodLossMl: record.estimatedBloodLossMl,
        urineOutputMl: record.urineOutputMl,
        pacuAldreteScore: record.pacuAldreteScore,
        complications: record.complications,
        signedById,
        signedAt,
      });

      const updated = await tx.anesthesiaRecord.update({
        where: { id: record.id },
        data: {
          status: 'SIGNED',
          signedById,
          signedAt,
          signatureHash,
        },
        include: {
          anesthesiologist: { select: { id: true, fullName: true } },
          signedBy: { select: { id: true, fullName: true } },
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: signedById,
        action: 'ANESTHESIA_RECORD_SIGNED',
        entity: 'AnesthesiaRecord',
        entityId: updated.id,
        details: {
          surgeryCaseId,
          asaClass: updated.asaClass,
          anesthesiaType: updated.anesthesiaType,
          estimatedBloodLossMl: updated.estimatedBloodLossMl,
          pacuAldreteScore: updated.pacuAldreteScore,
          signatureHash,
        },
      });

      return { signed: updated, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return signed;
  }

  async signDeliverySafety(
    hospitalId: number,
    deliveryAdmissionId: number,
    signedById: number,
    dto: SignDeliverySafetyDto = {},
  ) {
    const { delivery, evaluation, incident, audit } =
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.deliveryAdmission.findFirst({
          where: { id: deliveryAdmissionId, encounter: { hospitalId } },
          include: {
            encounter: {
              select: { id: true, hospitalId: true, patientId: true },
            },
            babies: true,
          },
        });
        if (!existing) {
          throw new NotFoundException('ملف الولادة غير موجود ضمن المنشأة.');
        }
        if (existing.deliverySignedAt) {
          throw new ConflictException('تم توقيع وتأمين ملف الولادة مسبقًا.');
        }

        const evalRes = evaluateDeliverySafety({
          deliveryMethod: existing.deliveryMethod,
          bloodLossMl: existing.bloodLoss,
          babies: existing.babies,
        });

        let createdIncident: {
          id: number;
          incidentNumber: string;
          severity: IncidentSeverity;
        } | null = null;

        if (evalRes.pphTriggered || evalRes.neonatalAlertTriggered) {
          const incidentNumber = `INC-OB-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
          const hasStillborn = existing.babies.some(
            (b) => b.status === 'STILLBORN',
          );
          createdIncident = await tx.clinicalIncident.create({
            data: {
              hospitalId,
              incidentNumber,
              incidentDate: new Date(),
              reportedById: signedById,
              incidentType: IncidentType.PROCEDURE_COMPLICATION,
              severity: hasStillborn
                ? IncidentSeverity.SENTINEL
                : IncidentSeverity.MAJOR,
              status: IncidentStatus.REPORTED,
              patientId: existing.encounter.patientId,
              location: 'Labor & Delivery',
              description: `Obstetrical safety escalation (${existing.deliveryMethod}): ${evalRes.alerts.join(' | ')}`,
              descriptionAr: evalRes.alerts.join(' | '),
              immediateAction: dto.notes?.trim() || null,
            },
            select: { id: true, incidentNumber: true, severity: true },
          });
        }

        const signedAt = new Date();
        const deliverySignatureHash = computeDeliverySafetyHash({
          hospitalId,
          deliveryAdmissionId: existing.id,
          encounterId: existing.encounterId,
          deliveryMethod: existing.deliveryMethod,
          bloodLossMl: existing.bloodLoss,
          babyCount: existing.babyCount,
          pphAlertTriggered: evalRes.pphTriggered,
          signedById,
          signedAt,
        });

        const updatedDelivery = await tx.deliveryAdmission.update({
          where: { id: existing.id },
          data: {
            pphAlertTriggered: evalRes.pphTriggered,
            deliverySignedById: signedById,
            deliverySignedAt: signedAt,
            deliverySignatureHash,
            ...(dto.notes?.trim()
              ? {
                  notes: existing.notes
                    ? `${existing.notes}\n${dto.notes.trim()}`
                    : dto.notes.trim(),
                }
              : {}),
          },
        });

        const auditEntry = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: signedById,
          action: 'DELIVERY_SAFETY_SIGNED',
          entity: 'DeliveryAdmission',
          entityId: existing.id,
          details: {
            encounterId: existing.encounterId,
            deliveryMethod: existing.deliveryMethod,
            bloodLossMl: existing.bloodLoss,
            pphAlertTriggered: evalRes.pphTriggered,
            neonatalAlertTriggered: evalRes.neonatalAlertTriggered,
            incidentId: createdIncident?.id ?? null,
            deliverySignatureHash,
          },
        });

        return {
          delivery: updatedDelivery,
          evaluation: evalRes,
          incident: createdIncident,
          audit: auditEntry,
        };
      });

    publishCommittedCriticalAudit(audit);
    return { delivery, evaluation, incident };
  }
}
