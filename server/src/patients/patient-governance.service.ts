import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  EncounterStatus,
  EncounterType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  RecordPatientDeathDto,
  RequestDeathReversalDto,
  RequestPatientMergeDto,
  ReviewDeathReversalDto,
  ReviewPatientMergeDto,
  UnmergePatientDto,
} from './dto/patient-governance.dto';

export interface GovernanceAuditMeta {
  ipAddress?: string;
  clientName?: string;
}

export interface PatientMergeTransferManifest {
  version: 1;
  sourcePreviousActive: boolean;
  sourcePreviousGlobalPatientId: number | null;
  encounterIds: number[];
  appointmentIds: number[];
  invoiceIds: number[];
  prescriptionIds: number[];
  allergyIds: number[];
  preAuthorizationIds: number[];
  admissionIds: number[];
  problemIds: number[];
  homeMedicationIds: number[];
  referralIds: number[];
  consentFormIds: number[];
  waitlistIds: number[];
  careGapIds: number[];
  voucherIds: number[];
  clinicalIncidentIds: number[];
  cdssAlertIds: number[];
}

const PATIENT_SUMMARY_SELECT = {
  id: true,
  mrn: true,
  fullName: true,
  isActive: true,
  isDeceased: true,
  dateOfDeath: true,
  mergedIntoPatientId: true,
  globalPatientId: true,
} as const;

const USER_SUMMARY_SELECT = {
  id: true,
  fullName: true,
} as const;

@Injectable()
export class PatientGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listMerges(hospitalId: number, status?: string) {
    const where: Prisma.PatientMergeRecordWhereInput = { hospitalId };
    if (
      status &&
      ['PENDING', 'APPROVED', 'REJECTED', 'UNMERGED'].includes(status)
    ) {
      where.status = status;
    }

    return this.prisma.patientMergeRecord.findMany({
      where,
      include: {
        sourcePatient: { select: PATIENT_SUMMARY_SELECT },
        targetPatient: { select: PATIENT_SUMMARY_SELECT },
        requestedBy: { select: USER_SUMMARY_SELECT },
        reviewedBy: { select: USER_SUMMARY_SELECT },
        unmergedBy: { select: USER_SUMMARY_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPatientGovernanceStatus(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId, isDeleted: false },
      select: {
        id: true,
        mrn: true,
        fullName: true,
        isActive: true,
        isDeceased: true,
        dateOfDeath: true,
        deathCertificateNumber: true,
        causeOfDeath: true,
        deathLocation: true,
        deathRecordedAt: true,
        deathRecordedBy: { select: USER_SUMMARY_SELECT },
        mergedIntoPatientId: true,
        mergedAt: true,
        mergedBy: { select: USER_SUMMARY_SELECT },
        mergedIntoPatient: { select: PATIENT_SUMMARY_SELECT },
        mergedFromPatients: { select: PATIENT_SUMMARY_SELECT },
      },
    });
    if (!patient) {
      throw new NotFoundException('المريض غير موجود في هذه المنشأة');
    }

    const [mergeHistory, deathEvents] = await Promise.all([
      this.prisma.patientMergeRecord.findMany({
        where: {
          hospitalId,
          OR: [{ sourcePatientId: patientId }, { targetPatientId: patientId }],
        },
        include: {
          sourcePatient: { select: PATIENT_SUMMARY_SELECT },
          targetPatient: { select: PATIENT_SUMMARY_SELECT },
          requestedBy: { select: USER_SUMMARY_SELECT },
          reviewedBy: { select: USER_SUMMARY_SELECT },
          unmergedBy: { select: USER_SUMMARY_SELECT },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.patientDeathEvent.findMany({
        where: { hospitalId, patientId },
        include: {
          actor: { select: USER_SUMMARY_SELECT },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      patient,
      mergeHistory,
      deathEvents,
    };
  }

  async requestMerge(
    hospitalId: number,
    userId: number,
    dto: RequestPatientMergeDto,
    auditMeta?: GovernanceAuditMeta,
  ) {
    if (dto.sourcePatientId === dto.targetPatientId) {
      throw new BadRequestException(
        'لا يمكن دمج ملف المريض مع نفسه؛ يرجى اختيار ملفين مختلفين',
      );
    }

    const reason = dto.reason.trim();
    if (reason.length < 5) {
      throw new BadRequestException('يجب توثيق سبب واضح لطلب دمج ملف المريض');
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const firstId = Math.min(dto.sourcePatientId, dto.targetPatientId);
      const secondId = Math.max(dto.sourcePatientId, dto.targetPatientId);
      await tx.$executeRaw`SELECT id FROM "Patient" WHERE id IN (${firstId}, ${secondId}) AND "hospitalId" = ${hospitalId} ORDER BY id ASC FOR UPDATE`;

      const [source, target] = await Promise.all([
        tx.patient.findFirst({
          where: { id: dto.sourcePatientId, hospitalId, isDeleted: false },
          select: {
            id: true,
            isDeceased: true,
            mergedIntoPatientId: true,
          },
        }),
        tx.patient.findFirst({
          where: { id: dto.targetPatientId, hospitalId, isDeleted: false },
          select: {
            id: true,
            isDeceased: true,
            mergedIntoPatientId: true,
          },
        }),
      ]);

      if (!source || !target) {
        throw new NotFoundException(
          'أحد ملفي المريض غير موجود ضمن هذه المنشأة',
        );
      }

      if (source.mergedIntoPatientId !== null) {
        throw new ConflictException('الملف المصدر مدمج مسبقًا في ملف مريض آخر');
      }
      if (target.mergedIntoPatientId !== null) {
        throw new ConflictException(
          'الملف الهدف مدمج في ملف آخر؛ يرجى اختيار الملف الأساسي النشط',
        );
      }
      if (source.isDeceased) {
        throw new ConflictException(
          'لا يمكن دمج ملف مريض متوفى كملف مصدر؛ يرجى مراجعة السجل الطبي أولاً',
        );
      }

      const activeInpatientOrEr = await tx.encounter.findFirst({
        where: {
          hospitalId,
          patientId: source.id,
          status: EncounterStatus.OPEN,
          type: { in: [EncounterType.IPD, EncounterType.ER] },
        },
        select: { id: true, type: true },
      });
      if (activeInpatientOrEr) {
        throw new ConflictException(
          'لا يمكن دمج ملف مريض لديه حالة تنويم أو طوارئ مفتوحة؛ يرجى إغلاق الحالة أولاً',
        );
      }

      const existingPending = await tx.patientMergeRecord.findFirst({
        where: {
          hospitalId,
          sourcePatientId: source.id,
          status: 'PENDING',
        },
        select: { id: true },
      });
      if (existingPending) {
        throw new ConflictException(
          'يوجد طلب دمج قيد المراجعة بالفعل لهذا الملف المصدر',
        );
      }

      const created = await tx.patientMergeRecord.create({
        data: {
          hospitalId,
          sourcePatientId: source.id,
          targetPatientId: target.id,
          status: 'PENDING',
          reason,
          requestedById: userId,
        },
        include: {
          sourcePatient: { select: PATIENT_SUMMARY_SELECT },
          targetPatient: { select: PATIENT_SUMMARY_SELECT },
          requestedBy: { select: USER_SUMMARY_SELECT },
        },
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'PATIENT_MERGE_REQUESTED',
        entity: 'PatientMergeRecord',
        entityId: created.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          sourcePatientId: source.id,
          targetPatientId: target.id,
          reason,
        },
      });

      return created;
    });

    publishCommittedCriticalAudit({
      action: 'PATIENT_MERGE_REQUESTED',
      entity: 'PatientMergeRecord',
      entityId: record.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        sourcePatientId: record.sourcePatientId,
        targetPatientId: record.targetPatientId,
      },
    });

    return record;
  }

  async reviewMerge(
    hospitalId: number,
    mergeId: number,
    reviewerId: number,
    dto: ReviewPatientMergeDto,
    auditMeta?: GovernanceAuditMeta,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "PatientMergeRecord" WHERE id = ${mergeId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      const record = await tx.patientMergeRecord.findFirst({
        where: { id: mergeId, hospitalId },
      });
      if (!record) {
        throw new NotFoundException('طلب دمج المريض غير موجود');
      }
      if (record.status !== 'PENDING') {
        throw new ConflictException(
          'تم البت في طلب دمج المريض مسبقًا ولا يمكن إعادة مراجعته',
        );
      }
      if (record.requestedById === reviewerId) {
        throw new ForbiddenException(
          'لا يجوز لمقدّم طلب الدمج اعتماده أو رفضه بنفسه (رقابة 4 عيون)',
        );
      }

      const now = new Date();
      const reviewNote = dto.reviewNote?.trim() || null;

      if (dto.decision === 'REJECT') {
        const rejected = await tx.patientMergeRecord.update({
          where: { id: record.id },
          data: {
            status: 'REJECTED',
            reviewedById: reviewerId,
            reviewedAt: now,
            reviewNote,
          },
          include: {
            sourcePatient: { select: PATIENT_SUMMARY_SELECT },
            targetPatient: { select: PATIENT_SUMMARY_SELECT },
            requestedBy: { select: USER_SUMMARY_SELECT },
            reviewedBy: { select: USER_SUMMARY_SELECT },
          },
        });

        await appendChainedAuditInTransaction(tx, {
          action: 'PATIENT_MERGE_REJECTED',
          entity: 'PatientMergeRecord',
          entityId: rejected.id,
          hospitalId,
          userId: reviewerId,
          ipAddress: auditMeta?.ipAddress,
          clientName: auditMeta?.clientName,
          details: {
            sourcePatientId: record.sourcePatientId,
            targetPatientId: record.targetPatientId,
            reviewNote,
          },
        });

        return { record: rejected, action: 'PATIENT_MERGE_REJECTED' as const };
      }

      // APPROVE: lock both patients in ascending ID order to prevent deadlocks
      const firstId = Math.min(record.sourcePatientId, record.targetPatientId);
      const secondId = Math.max(record.sourcePatientId, record.targetPatientId);
      await tx.$executeRaw`SELECT id FROM "Patient" WHERE id IN (${firstId}, ${secondId}) AND "hospitalId" = ${hospitalId} ORDER BY id ASC FOR UPDATE`;

      const [source, target] = await Promise.all([
        tx.patient.findFirst({
          where: { id: record.sourcePatientId, hospitalId, isDeleted: false },
          select: {
            id: true,
            isActive: true,
            isDeceased: true,
            mergedIntoPatientId: true,
            globalPatientId: true,
          },
        }),
        tx.patient.findFirst({
          where: { id: record.targetPatientId, hospitalId, isDeleted: false },
          select: {
            id: true,
            isActive: true,
            isDeceased: true,
            mergedIntoPatientId: true,
            globalPatientId: true,
          },
        }),
      ]);

      if (!source || !target) {
        throw new NotFoundException(
          'تعذر إتمام الدمج لأن أحد ملفي المريض لم يعد موجودًا',
        );
      }
      if (
        source.mergedIntoPatientId !== null ||
        target.mergedIntoPatientId !== null
      ) {
        throw new ConflictException(
          'أحد ملفي المريض قد دُمج بالفعل ضمن عملية أخرى',
        );
      }
      if (source.isDeceased) {
        throw new ConflictException(
          'لا يمكن اعتماد دمج ملف مريض متوفى كملف مصدر',
        );
      }

      const openInpatientOrEr = await tx.encounter.findFirst({
        where: {
          hospitalId,
          patientId: source.id,
          status: EncounterStatus.OPEN,
          type: { in: [EncounterType.IPD, EncounterType.ER] },
        },
        select: { id: true },
      });
      if (openInpatientOrEr) {
        throw new ConflictException(
          'الملف المصدر لديه حالة تنويم أو طوارئ مفتوحة؛ أغلقها قبل اعتماد الدمج',
        );
      }

      // Snapshot exact IDs to move so unmerge can reverse 100% losslessly
      const [
        encounters,
        appointments,
        invoices,
        prescriptions,
        allergies,
        preAuthorizations,
        admissions,
        problems,
        homeMedications,
        referrals,
        consentForms,
        waitlists,
        careGaps,
        vouchers,
        clinicalIncidents,
        cdssAlerts,
      ] = await Promise.all([
        tx.encounter.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.appointment.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.invoice.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.prescription.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.patientAllergy.findMany({
          where: { patientId: source.id },
          select: { id: true },
        }),
        tx.preAuthorization.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.admission.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.patientProblem.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.homeMedication.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.referral.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.consentForm.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.waitlist.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.careGap.findMany({
          where: { patientId: source.id },
          select: { id: true },
        }),
        tx.voucher.findMany({
          where: { hospitalId, depositPatientId: source.id },
          select: { id: true },
        }),
        tx.clinicalIncident.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
        tx.cDSSAlert.findMany({
          where: { hospitalId, patientId: source.id },
          select: { id: true },
        }),
      ]);

      const manifest: PatientMergeTransferManifest = {
        version: 1,
        sourcePreviousActive: source.isActive,
        sourcePreviousGlobalPatientId: source.globalPatientId,
        encounterIds: encounters.map((r) => r.id),
        appointmentIds: appointments.map((r) => r.id),
        invoiceIds: invoices.map((r) => r.id),
        prescriptionIds: prescriptions.map((r) => r.id),
        allergyIds: allergies.map((r) => r.id),
        preAuthorizationIds: preAuthorizations.map((r) => r.id),
        admissionIds: admissions.map((r) => r.id),
        problemIds: problems.map((r) => r.id),
        homeMedicationIds: homeMedications.map((r) => r.id),
        referralIds: referrals.map((r) => r.id),
        consentFormIds: consentForms.map((r) => r.id),
        waitlistIds: waitlists.map((r) => r.id),
        careGapIds: careGaps.map((r) => r.id),
        voucherIds: vouchers.map((r) => r.id),
        clinicalIncidentIds: clinicalIncidents.map((r) => r.id),
        cdssAlertIds: cdssAlerts.map((r) => r.id),
      };

      // Reassign every linked clinical & financial entity atomically
      if (manifest.encounterIds.length > 0) {
        await tx.encounter.updateMany({
          where: { id: { in: manifest.encounterIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.appointmentIds.length > 0) {
        await tx.appointment.updateMany({
          where: { id: { in: manifest.appointmentIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.invoiceIds.length > 0) {
        await tx.invoice.updateMany({
          where: { id: { in: manifest.invoiceIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.prescriptionIds.length > 0) {
        await tx.prescription.updateMany({
          where: { id: { in: manifest.prescriptionIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.allergyIds.length > 0) {
        await tx.patientAllergy.updateMany({
          where: { id: { in: manifest.allergyIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.preAuthorizationIds.length > 0) {
        await tx.preAuthorization.updateMany({
          where: { id: { in: manifest.preAuthorizationIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.admissionIds.length > 0) {
        await tx.admission.updateMany({
          where: { id: { in: manifest.admissionIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.problemIds.length > 0) {
        await tx.patientProblem.updateMany({
          where: { id: { in: manifest.problemIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.homeMedicationIds.length > 0) {
        await tx.homeMedication.updateMany({
          where: { id: { in: manifest.homeMedicationIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.referralIds.length > 0) {
        await tx.referral.updateMany({
          where: { id: { in: manifest.referralIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.consentFormIds.length > 0) {
        await tx.consentForm.updateMany({
          where: { id: { in: manifest.consentFormIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.waitlistIds.length > 0) {
        await tx.waitlist.updateMany({
          where: { id: { in: manifest.waitlistIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.careGapIds.length > 0) {
        await tx.careGap.updateMany({
          where: { id: { in: manifest.careGapIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.voucherIds.length > 0) {
        await tx.voucher.updateMany({
          where: { id: { in: manifest.voucherIds } },
          data: { depositPatientId: target.id },
        });
      }
      if (manifest.clinicalIncidentIds.length > 0) {
        await tx.clinicalIncident.updateMany({
          where: { id: { in: manifest.clinicalIncidentIds } },
          data: { patientId: target.id },
        });
      }
      if (manifest.cdssAlertIds.length > 0) {
        await tx.cDSSAlert.updateMany({
          where: { id: { in: manifest.cdssAlertIds } },
          data: { patientId: target.id },
        });
      }

      // Mark source patient as merged & link to canonical MPI GlobalPatient if present
      await tx.patient.update({
        where: { id: source.id },
        data: {
          isActive: false,
          mergedIntoPatientId: target.id,
          mergedAt: now,
          mergedById: reviewerId,
          ...(target.globalPatientId
            ? { globalPatientId: target.globalPatientId }
            : {}),
        },
      });

      const approved = await tx.patientMergeRecord.update({
        where: { id: record.id },
        data: {
          status: 'APPROVED',
          reviewedById: reviewerId,
          reviewedAt: now,
          reviewNote,
          transferManifest: manifest as unknown as Prisma.InputJsonValue,
        },
        include: {
          sourcePatient: { select: PATIENT_SUMMARY_SELECT },
          targetPatient: { select: PATIENT_SUMMARY_SELECT },
          requestedBy: { select: USER_SUMMARY_SELECT },
          reviewedBy: { select: USER_SUMMARY_SELECT },
        },
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'PATIENT_MERGE_APPROVED',
        entity: 'PatientMergeRecord',
        entityId: approved.id,
        hospitalId,
        userId: reviewerId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          sourcePatientId: source.id,
          targetPatientId: target.id,
          reviewNote,
          movedCounts: {
            encounters: manifest.encounterIds.length,
            appointments: manifest.appointmentIds.length,
            invoices: manifest.invoiceIds.length,
            prescriptions: manifest.prescriptionIds.length,
            allergies: manifest.allergyIds.length,
            admissions: manifest.admissionIds.length,
            vouchers: manifest.voucherIds.length,
          },
        },
      });

      return { record: approved, action: 'PATIENT_MERGE_APPROVED' as const };
    });

    publishCommittedCriticalAudit({
      action: result.action,
      entity: 'PatientMergeRecord',
      entityId: result.record.id,
      hospitalId,
      userId: reviewerId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        sourcePatientId: result.record.sourcePatientId,
        targetPatientId: result.record.targetPatientId,
      },
    });

    return result.record;
  }

  async unmerge(
    hospitalId: number,
    mergeId: number,
    userId: number,
    dto: UnmergePatientDto,
    auditMeta?: GovernanceAuditMeta,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 5) {
      throw new BadRequestException('يجب توثيق سبب واضح لعملية فك دمج المريض');
    }

    const unmerged = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "PatientMergeRecord" WHERE id = ${mergeId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      const record = await tx.patientMergeRecord.findFirst({
        where: { id: mergeId, hospitalId },
      });
      if (!record) {
        throw new NotFoundException('سجل دمج المريض غير موجود');
      }
      if (record.status !== 'APPROVED') {
        throw new ConflictException(
          'يمكن فك الدمج فقط لسجلات الدمج المعتمدة حاليًا',
        );
      }

      const firstId = Math.min(record.sourcePatientId, record.targetPatientId);
      const secondId = Math.max(record.sourcePatientId, record.targetPatientId);
      await tx.$executeRaw`SELECT id FROM "Patient" WHERE id IN (${firstId}, ${secondId}) AND "hospitalId" = ${hospitalId} ORDER BY id ASC FOR UPDATE`;

      const manifest =
        record.transferManifest as unknown as PatientMergeTransferManifest | null;
      if (!manifest || manifest.version !== 1) {
        throw new ConflictException(
          'بيان النقل غير مكتمل ولا يمكن فك الدمج تلقائيًا بأمان',
        );
      }

      const sourceId = record.sourcePatientId;

      if (manifest.encounterIds.length > 0) {
        await tx.encounter.updateMany({
          where: { id: { in: manifest.encounterIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.appointmentIds.length > 0) {
        await tx.appointment.updateMany({
          where: { id: { in: manifest.appointmentIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.invoiceIds.length > 0) {
        await tx.invoice.updateMany({
          where: { id: { in: manifest.invoiceIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.prescriptionIds.length > 0) {
        await tx.prescription.updateMany({
          where: { id: { in: manifest.prescriptionIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.allergyIds.length > 0) {
        await tx.patientAllergy.updateMany({
          where: { id: { in: manifest.allergyIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.preAuthorizationIds.length > 0) {
        await tx.preAuthorization.updateMany({
          where: { id: { in: manifest.preAuthorizationIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.admissionIds.length > 0) {
        await tx.admission.updateMany({
          where: { id: { in: manifest.admissionIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.problemIds.length > 0) {
        await tx.patientProblem.updateMany({
          where: { id: { in: manifest.problemIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.homeMedicationIds.length > 0) {
        await tx.homeMedication.updateMany({
          where: { id: { in: manifest.homeMedicationIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.referralIds.length > 0) {
        await tx.referral.updateMany({
          where: { id: { in: manifest.referralIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.consentFormIds.length > 0) {
        await tx.consentForm.updateMany({
          where: { id: { in: manifest.consentFormIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.waitlistIds.length > 0) {
        await tx.waitlist.updateMany({
          where: { id: { in: manifest.waitlistIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.careGapIds.length > 0) {
        await tx.careGap.updateMany({
          where: { id: { in: manifest.careGapIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.voucherIds.length > 0) {
        await tx.voucher.updateMany({
          where: { id: { in: manifest.voucherIds } },
          data: { depositPatientId: sourceId },
        });
      }
      if (manifest.clinicalIncidentIds.length > 0) {
        await tx.clinicalIncident.updateMany({
          where: { id: { in: manifest.clinicalIncidentIds } },
          data: { patientId: sourceId },
        });
      }
      if (manifest.cdssAlertIds.length > 0) {
        await tx.cDSSAlert.updateMany({
          where: { id: { in: manifest.cdssAlertIds } },
          data: { patientId: sourceId },
        });
      }

      await tx.patient.update({
        where: { id: sourceId },
        data: {
          isActive: manifest.sourcePreviousActive,
          mergedIntoPatientId: null,
          mergedAt: null,
          mergedById: null,
          globalPatientId: manifest.sourcePreviousGlobalPatientId,
        },
      });

      const updated = await tx.patientMergeRecord.update({
        where: { id: record.id },
        data: {
          status: 'UNMERGED',
          unmergedById: userId,
          unmergedAt: new Date(),
          unmergeReason: reason,
        },
        include: {
          sourcePatient: { select: PATIENT_SUMMARY_SELECT },
          targetPatient: { select: PATIENT_SUMMARY_SELECT },
          requestedBy: { select: USER_SUMMARY_SELECT },
          reviewedBy: { select: USER_SUMMARY_SELECT },
          unmergedBy: { select: USER_SUMMARY_SELECT },
        },
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'PATIENT_UNMERGED',
        entity: 'PatientMergeRecord',
        entityId: updated.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          sourcePatientId: sourceId,
          targetPatientId: record.targetPatientId,
          reason,
        },
      });

      return updated;
    });

    publishCommittedCriticalAudit({
      action: 'PATIENT_UNMERGED',
      entity: 'PatientMergeRecord',
      entityId: unmerged.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        sourcePatientId: unmerged.sourcePatientId,
        targetPatientId: unmerged.targetPatientId,
      },
    });

    return unmerged;
  }

  async recordDeath(
    hospitalId: number,
    patientId: number,
    userId: number,
    dto: RecordPatientDeathDto,
    auditMeta?: GovernanceAuditMeta,
  ) {
    const dateOfDeath = new Date(dto.dateOfDeath);
    if (Number.isNaN(dateOfDeath.getTime())) {
      throw new BadRequestException('تاريخ ووقت الوفاة غير صالح');
    }
    const now = new Date();
    if (dateOfDeath.getTime() > now.getTime() + 60_000) {
      throw new BadRequestException('لا يمكن تسجيل تاريخ وفاة مستقبلي');
    }

    const causeOfDeath = dto.causeOfDeath.trim();
    const deathCertificateNumber = dto.deathCertificateNumber?.trim() || null;
    const deathLocation = dto.deathLocation?.trim() || null;

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Patient" WHERE id = ${patientId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      const patient = await tx.patient.findFirst({
        where: { id: patientId, hospitalId, isDeleted: false },
        select: {
          id: true,
          dateOfBirth: true,
          isDeceased: true,
          mergedIntoPatientId: true,
        },
      });
      if (!patient) {
        throw new NotFoundException('المريض غير موجود في هذه المنشأة');
      }
      if (patient.mergedIntoPatientId !== null) {
        throw new ConflictException(
          'تم دمج ملف هذا المريض في ملف آخر؛ يرجى التوثيق على الملف الأساسي',
        );
      }
      if (patient.isDeceased) {
        throw new ConflictException('تم توثيق وفاة هذا المريض مسبقًا');
      }
      if (
        patient.dateOfBirth &&
        dateOfDeath.getTime() < patient.dateOfBirth.getTime()
      ) {
        throw new BadRequestException(
          'لا يمكن أن يكون تاريخ الوفاة سابقًا لتاريخ ميلاد المريض',
        );
      }

      if (dto.encounterId) {
        const encounter = await tx.encounter.findFirst({
          where: {
            id: dto.encounterId,
            hospitalId,
            patientId,
            isDeleted: false,
          },
          select: { id: true },
        });
        if (!encounter) {
          throw new NotFoundException(
            'الزيارة المرتبطة بتوثيق الوفاة غير موجودة لهذا المريض',
          );
        }
      }

      const updatedPatient = await tx.patient.update({
        where: { id: patientId },
        data: {
          isDeceased: true,
          dateOfDeath,
          deathCertificateNumber,
          causeOfDeath,
          deathLocation,
          deathRecordedById: userId,
          deathRecordedAt: now,
          isActive: false,
        },
        select: {
          id: true,
          mrn: true,
          fullName: true,
          isActive: true,
          isDeceased: true,
          dateOfDeath: true,
          deathCertificateNumber: true,
          causeOfDeath: true,
          deathLocation: true,
          deathRecordedAt: true,
          deathRecordedBy: { select: USER_SUMMARY_SELECT },
        },
      });

      // Automatically cancel future scheduled appointments
      const futureAppointments = await tx.appointment.findMany({
        where: {
          hospitalId,
          patientId,
          status: {
            in: [AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED],
          },
          scheduledStart: { gte: dateOfDeath },
        },
        select: { id: true },
      });
      const cancelledAppointmentIds = futureAppointments.map((a) => a.id);

      if (cancelledAppointmentIds.length > 0) {
        await tx.appointment.updateMany({
          where: { id: { in: cancelledAppointmentIds } },
          data: {
            status: AppointmentStatus.CANCELLED,
            notes: 'أُلغي تلقائيًا بسبب توثيق وفاة المريض',
          },
        });
      }

      // Close open waitlist entries
      await tx.waitlist.updateMany({
        where: {
          hospitalId,
          patientId,
          status: 'WAITING',
        },
        data: {
          status: 'CANCELLED',
        },
      });

      const deathEvent = await tx.patientDeathEvent.create({
        data: {
          hospitalId,
          patientId,
          eventType: 'RECORDED',
          dateOfDeath,
          deathCertificateNumber,
          causeOfDeath,
          deathLocation,
          encounterId: dto.encounterId ?? null,
          cancelledAppointmentIds:
            cancelledAppointmentIds as unknown as Prisma.InputJsonValue,
          actorId: userId,
        },
        include: { actor: { select: USER_SUMMARY_SELECT } },
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'PATIENT_DEATH_RECORDED',
        entity: 'Patient',
        entityId: patientId,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          deathEventId: deathEvent.id,
          dateOfDeath: dateOfDeath.toISOString(),
          deathCertificateNumber,
          cancelledAppointmentsCount: cancelledAppointmentIds.length,
        },
      });

      return {
        patient: updatedPatient,
        deathEvent,
        cancelledAppointmentIds,
      };
    });

    publishCommittedCriticalAudit({
      action: 'PATIENT_DEATH_RECORDED',
      entity: 'Patient',
      entityId: patientId,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: {
        deathEventId: outcome.deathEvent.id,
        cancelledAppointmentsCount: outcome.cancelledAppointmentIds.length,
      },
    });

    return outcome;
  }

  async requestDeathReversal(
    hospitalId: number,
    patientId: number,
    userId: number,
    dto: RequestDeathReversalDto,
    auditMeta?: GovernanceAuditMeta,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException(
        'يجب تقديم تبرير سريري/إداري مفصل (10 أحرف على الأقل) لطلب إلغاء توثيق الوفاة',
      );
    }

    const event = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Patient" WHERE id = ${patientId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      const patient = await tx.patient.findFirst({
        where: { id: patientId, hospitalId, isDeleted: false },
        select: { id: true, isDeceased: true },
      });
      if (!patient) {
        throw new NotFoundException('المريض غير موجود في هذه المنشأة');
      }
      if (!patient.isDeceased) {
        throw new ConflictException('ملف المريض غير مسجّل كمتوفى حاليًا');
      }

      const pendingRequests = await tx.patientDeathEvent.findMany({
        where: { hospitalId, patientId, eventType: 'REVERSAL_REQUESTED' },
        select: { id: true },
      });
      if (pendingRequests.length > 0) {
        const reviewed = await tx.patientDeathEvent.findMany({
          where: {
            hospitalId,
            patientId,
            eventType: { in: ['REVERSAL_APPROVED', 'REVERSAL_REJECTED'] },
            relatedEventId: { in: pendingRequests.map((r) => r.id) },
          },
          select: { relatedEventId: true },
        });
        const reviewedSet = new Set(reviewed.map((r) => r.relatedEventId));
        if (pendingRequests.some((r) => !reviewedSet.has(r.id))) {
          throw new ConflictException(
            'يوجد طلب قائم بالفعل لإلغاء توثيق الوفاة بانتظار المراجعة المستقلة',
          );
        }
      }

      const created = await tx.patientDeathEvent.create({
        data: {
          hospitalId,
          patientId,
          eventType: 'REVERSAL_REQUESTED',
          reason,
          actorId: userId,
        },
        include: { actor: { select: USER_SUMMARY_SELECT } },
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'PATIENT_DEATH_REVERSAL_REQUESTED',
        entity: 'PatientDeathEvent',
        entityId: created.id,
        hospitalId,
        userId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: { patientId, reason },
      });

      return created;
    });

    publishCommittedCriticalAudit({
      action: 'PATIENT_DEATH_REVERSAL_REQUESTED',
      entity: 'PatientDeathEvent',
      entityId: event.id,
      hospitalId,
      userId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: { patientId },
    });

    return event;
  }

  async reviewDeathReversal(
    hospitalId: number,
    patientId: number,
    requestEventId: number,
    reviewerId: number,
    dto: ReviewDeathReversalDto,
    auditMeta?: GovernanceAuditMeta,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Patient" WHERE id = ${patientId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      const patient = await tx.patient.findFirst({
        where: { id: patientId, hospitalId, isDeleted: false },
        select: { id: true, isDeceased: true },
      });
      if (!patient) {
        throw new NotFoundException('المريض غير موجود في هذه المنشأة');
      }

      const requestEvent = await tx.patientDeathEvent.findFirst({
        where: {
          id: requestEventId,
          hospitalId,
          patientId,
          eventType: 'REVERSAL_REQUESTED',
        },
      });
      if (!requestEvent) {
        throw new NotFoundException('طلب إلغاء توثيق الوفاة غير موجود');
      }

      const existingReview = await tx.patientDeathEvent.findFirst({
        where: {
          hospitalId,
          patientId,
          relatedEventId: requestEvent.id,
          eventType: { in: ['REVERSAL_APPROVED', 'REVERSAL_REJECTED'] },
        },
        select: { id: true },
      });
      if (existingReview) {
        throw new ConflictException('تم البت في طلب إلغاء توثيق الوفاة مسبقًا');
      }

      if (requestEvent.actorId === reviewerId) {
        throw new ForbiddenException(
          'لا يجوز لمقدّم طلب إلغاء الوفاة اعتماده أو رفضه بنفسه (رقابة 4 عيون)',
        );
      }

      const reviewNote = dto.reviewNote?.trim() || null;

      if (dto.decision === 'REJECT') {
        const event = await tx.patientDeathEvent.create({
          data: {
            hospitalId,
            patientId,
            eventType: 'REVERSAL_REJECTED',
            reason: reviewNote,
            actorId: reviewerId,
            relatedEventId: requestEvent.id,
          },
          include: { actor: { select: USER_SUMMARY_SELECT } },
        });

        await appendChainedAuditInTransaction(tx, {
          action: 'PATIENT_DEATH_REVERSAL_REJECTED',
          entity: 'PatientDeathEvent',
          entityId: event.id,
          hospitalId,
          userId: reviewerId,
          ipAddress: auditMeta?.ipAddress,
          clientName: auditMeta?.clientName,
          details: { patientId, requestEventId, reviewNote },
        });

        return {
          event,
          isDeceased: patient.isDeceased,
          action: 'PATIENT_DEATH_REVERSAL_REJECTED' as const,
        };
      }

      if (!patient.isDeceased) {
        throw new ConflictException('ملف المريض لم يعد مسجلاً كمتوفى');
      }

      await tx.patient.update({
        where: { id: patientId },
        data: {
          isDeceased: false,
          dateOfDeath: null,
          deathCertificateNumber: null,
          causeOfDeath: null,
          deathLocation: null,
          deathRecordedById: null,
          deathRecordedAt: null,
          isActive: true,
        },
      });

      const event = await tx.patientDeathEvent.create({
        data: {
          hospitalId,
          patientId,
          eventType: 'REVERSAL_APPROVED',
          reason: reviewNote || requestEvent.reason,
          actorId: reviewerId,
          relatedEventId: requestEvent.id,
        },
        include: { actor: { select: USER_SUMMARY_SELECT } },
      });

      await appendChainedAuditInTransaction(tx, {
        action: 'PATIENT_DEATH_REVERSED',
        entity: 'Patient',
        entityId: patientId,
        hospitalId,
        userId: reviewerId,
        ipAddress: auditMeta?.ipAddress,
        clientName: auditMeta?.clientName,
        details: {
          deathEventId: event.id,
          requestEventId,
          reviewNote,
        },
      });

      return {
        event,
        isDeceased: false,
        action: 'PATIENT_DEATH_REVERSED' as const,
      };
    });

    publishCommittedCriticalAudit({
      action: result.action,
      entity: 'Patient',
      entityId: patientId,
      hospitalId,
      userId: reviewerId,
      ipAddress: auditMeta?.ipAddress,
      clientName: auditMeta?.clientName,
      details: { eventId: result.event.id, requestEventId },
    });

    return {
      event: result.event,
      isDeceased: result.isDeceased,
    };
  }
}
