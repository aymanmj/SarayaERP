// server/src/radiology/radiology-dose.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { evaluateRadiationDose } from './radiation-dose.util';
import type { RecordRadiologyDoseDto } from './dto/radiology-dose.dto';

const ADVISORY_LOCK_RAD_DOSE = 27030;

@Injectable()
export class RadiologyDoseService {
  constructor(private readonly prisma: PrismaService) {}

  async recordOrderDose(
    hospitalId: number,
    radiologyOrderId: number,
    recordedById: number,
    dto: RecordRadiologyDoseDto,
  ) {
    const { record, incidentId, evaluation, audit } =
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_RAD_DOSE}::int, ${hospitalId}::int)`;

        const radOrder = await tx.radiologyOrder.findFirst({
          where: {
            id: radiologyOrderId,
            order: { hospitalId },
          },
          include: {
            order: {
              select: {
                id: true,
                encounterId: true,
                encounter: { select: { patientId: true } },
              },
            },
            study: { select: { name: true, bodyPart: true } },
          },
        });
        if (!radOrder) {
          throw new NotFoundException('طلب الأشعة غير موجود ضمن المنشأة.');
        }

        const existing = await tx.radiologyDoseRecord.findUnique({
          where: { radiologyOrderId: radOrder.id },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException(
            'تم تسجيل الجرعة الإشعاعية (RDSR) لهذا الطلب مسبقًا.',
          );
        }

        const patientId = radOrder.order.encounter.patientId;
        const since12m = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        const priorRows = await tx.radiologyDoseRecord.findMany({
          where: {
            hospitalId,
            patientId,
            recordedAt: { gte: since12m },
          },
          select: { effectiveDoseMsv: true },
        });

        let prior12m = Money.decimal(0);
        for (const r of priorRows) {
          prior12m = prior12m.plus(r.effectiveDoseMsv.toString());
        }

        const bodyRegion = dto.bodyRegion?.trim() || radOrder.study.bodyPart;
        const evalRes = evaluateRadiationDose({
          modality: dto.modality,
          bodyRegion,
          dlpMgyCm: dto.dlpMgyCm,
          effectiveDoseMsv: dto.effectiveDoseMsv,
          prior12mMsv: prior12m.toFixed(4),
        });

        const created = await tx.radiologyDoseRecord.create({
          data: {
            hospitalId,
            radiologyOrderId: radOrder.id,
            patientId,
            modality: dto.modality,
            bodyRegion: bodyRegion || null,
            ctdiVolMgy:
              dto.ctdiVolMgy !== undefined
                ? Money.roundDecimal(dto.ctdiVolMgy, 4).toFixed(4)
                : null,
            dlpMgyCm:
              dto.dlpMgyCm !== undefined
                ? Money.roundDecimal(dto.dlpMgyCm, 4).toFixed(4)
                : null,
            dapGyCm2:
              dto.dapGyCm2 !== undefined
                ? Money.roundDecimal(dto.dapGyCm2, 4).toFixed(4)
                : null,
            effectiveDoseMsv: evalRes.effectiveDoseMsv,
            kvp:
              dto.kvp !== undefined
                ? Money.roundDecimal(dto.kvp, 2).toFixed(2)
                : null,
            mas:
              dto.mas !== undefined
                ? Money.roundDecimal(dto.mas, 2).toFixed(2)
                : null,
            exposureCount: dto.exposureCount ?? 1,
            exceedsDrl: evalRes.exceedsDrl,
            cumulative12mMsv: evalRes.cumulative12mMsv,
            cumulativeWarning: evalRes.cumulativeWarning,
            recordedById,
            notes: dto.notes?.trim() || null,
          },
        });

        let createdIncidentId: number | null = null;
        if (evalRes.requiresIncidentEscalation) {
          const incident = await tx.clinicalIncident.create({
            data: {
              hospitalId,
              incidentNumber: `INC-RAD-${radOrder.id}-${Date.now()}`,
              incidentDate: new Date(),
              patientId,
              reportedById: recordedById,
              incidentType: 'DIAGNOSTIC_ERROR',
              severity: 'MAJOR',
              status: 'REPORTED',
              location: 'RADIOLOGY',
              description: `Patient cumulative 12-month radiation dose exceeded 100 mSv (${evalRes.cumulative12mMsv} mSv) after ${dto.modality} (${radOrder.study.name}) — RadiologyOrder #${radOrder.id}.`,
              descriptionAr: `تجاوز الجرعة الإشعاعية التراكمية للمريض حد 100 mSv خلال 12 شهراً (${evalRes.cumulative12mMsv} mSv) بعد فحص ${dto.modality} (${radOrder.study.name}) — طلب أشعة #${radOrder.id}.`,
            },
            select: { id: true },
          });
          createdIncidentId = incident.id;
        }

        const auditEntry = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId: recordedById,
          action: evalRes.requiresIncidentEscalation
            ? 'RADIOLOGY_DOSE_CRITICAL_EXCEEDANCE'
            : 'RADIOLOGY_DOSE_RECORDED',
          entity: 'RadiologyDoseRecord',
          entityId: created.id,
          details: {
            radiologyOrderId: radOrder.id,
            patientId,
            modality: dto.modality,
            effectiveDoseMsv: evalRes.effectiveDoseMsv,
            cumulative12mMsv: evalRes.cumulative12mMsv,
            exceedsDrl: evalRes.exceedsDrl,
            tier: evalRes.tier,
            incidentId: createdIncidentId,
          },
        });

        return {
          record: created,
          incidentId: createdIncidentId,
          evaluation: evalRes,
          audit: auditEntry,
        };
      });

    publishCommittedCriticalAudit(audit);
    return { record, incidentId, evaluation };
  }

  async getPatientDoseSummary(hospitalId: number, patientId: number) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId },
      select: { id: true, fullName: true, mrn: true },
    });
    if (!patient) {
      throw new NotFoundException('المريض غير موجود ضمن المنشأة.');
    }

    const records = await this.prisma.radiologyDoseRecord.findMany({
      where: { hospitalId, patientId },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    const since12m = Date.now() - 365 * 24 * 60 * 60 * 1000;
    let total12m = Money.decimal(0);
    let totalLifetime = Money.decimal(0);
    let drlExceedances = 0;

    for (const r of records) {
      const msv = Money.decimal(r.effectiveDoseMsv.toString());
      totalLifetime = totalLifetime.plus(msv);
      if (r.recordedAt.getTime() >= since12m) {
        total12m = total12m.plus(msv);
      }
      if (r.exceedsDrl) drlExceedances++;
    }

    const tier = total12m.gte(100)
      ? 'CRITICAL_100MSV'
      : total12m.gte(50)
        ? 'ELEVATED_50MSV'
        : 'NORMAL';

    return {
      patient,
      examCount: records.length,
      cumulative12mMsv: Money.roundDecimal(total12m, 4).toFixed(4),
      lifetimeMsv: Money.roundDecimal(totalLifetime, 4).toFixed(4),
      drlExceedances,
      tier,
      records,
    };
  }
}
