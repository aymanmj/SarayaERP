import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { NursingRecordNotice } from './nursing-notification-journal';

const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 25;

const medicationSelect = {
  id: true,
  encounterId: true,
  status: true,
  administeredAt: true,
  performer: { select: { fullName: true } },
  prescriptionItem: {
    select: {
      product: { select: { name: true } },
      prescription: { select: { encounterId: true } },
    },
  },
} satisfies Prisma.MedicationAdministrationSelect;

const vitalSelect = {
  id: true,
  encounterId: true,
  createdAt: true,
  temperature: true,
  pulse: true,
  o2Sat: true,
  bpSystolic: true,
  bpDiastolic: true,
  respRate: true,
  weight: true,
  height: true,
  bmi: true,
  encounter: {
    select: { patient: { select: { fullName: true } } },
  },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.VitalSignSelect;

type Medication = Prisma.MedicationAdministrationGetPayload<{
  select: typeof medicationSelect;
}>;
type Vital = Prisma.VitalSignGetPayload<{ select: typeof vitalSelect }>;

@Injectable()
export class NursingNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  resolve(notice: NursingRecordNotice) {
    return this.resolveMany(notice.hospitalId, [notice]);
  }

  private async resolveMany(
    hospitalId: number,
    notices: NursingRecordNotice[],
  ) {
    const medicationIds = notices
      .filter(({ kind }) => kind === 'medication')
      .map(({ recordId }) => recordId);
    const vitalIds = notices
      .filter(({ kind }) => kind === 'vital')
      .map(({ recordId }) => recordId);
    const openEncounter = { hospitalId, type: 'IPD', status: 'OPEN' } as const;
    const [medications, vitals]: [Medication[], Vital[]] = await Promise.all([
      medicationIds.length
        ? this.prisma.medicationAdministration.findMany({
            where: {
              id: { in: medicationIds },
              hospitalId,
              encounter: openEncounter,
              prescriptionItem: { prescription: { hospitalId } },
            },
            select: medicationSelect,
          })
        : [],
      vitalIds.length
        ? this.prisma.vitalSign.findMany({
            where: {
              id: { in: vitalIds },
              createdById: { not: null },
              encounter: openEncounter,
            },
            select: vitalSelect,
          })
        : [],
    ]);
    const medicationById = new Map(
      medications.map((record) => [record.id, record] as const),
    );
    const vitalById = new Map(
      vitals.map((record) => [record.id, record] as const),
    );
    const messages: (
      | ReturnType<NursingNotificationService['medicationMessage']>
      | ReturnType<NursingNotificationService['vitalMessages']>[number]
    )[] = [];
    for (const { kind, recordId, encounterId } of notices) {
      if (kind === 'medication') {
        const record = medicationById.get(recordId);
        if (
          record?.encounterId === encounterId &&
          record.prescriptionItem.prescription.encounterId === encounterId
        )
          messages.push(this.medicationMessage(record));
      } else {
        const record = vitalById.get(recordId);
        if (record?.encounterId === encounterId)
          messages.push(...this.vitalMessages(record));
      }
    }
    return messages;
  }

  async recover(hospitalId: number, after: bigint | null) {
    const records = await this.prisma.nursingNotification.findMany({
      where: {
        hospitalId,
        createdAt: { gte: new Date(Date.now() - RECOVERY_WINDOW_MS) },
        ...(after === null ? {} : { id: { gt: after } }),
      },
      orderBy: { id: after === null ? 'desc' : 'asc' },
      take: after === null ? PAGE_SIZE : PAGE_SIZE + 1,
      select: {
        id: true,
        kind: true,
        hospitalId: true,
        encounterId: true,
        recordId: true,
      },
    });
    const hasMore = records.length > PAGE_SIZE;
    const page = records.slice(0, PAGE_SIZE);
    if (after === null) page.reverse();
    const messages = await this.resolveMany(hospitalId, page);
    const cursor = page.at(-1)?.id ?? after ?? 0n;
    return { cursor: cursor.toString(), hasMore, messages };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneExpiredNotifications() {
    await this.prisma.nursingNotification.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RECOVERY_WINDOW_MS) } },
    });
  }

  private medicationMessage(record: Medication) {
    return {
      event: 'medication_update' as const,
      payload: {
        type: record.status === 'GIVEN' ? 'administered' : 'not_given',
        administrationId: record.id,
        encounterId: record.encounterId,
        medication: record.prescriptionItem.product.name,
        administeredBy: record.performer.fullName,
        status: record.status,
        timestamp: record.administeredAt.toISOString(),
      },
    };
  }

  private vitalMessages(record: Vital) {
    if (!record?.createdBy) return [];
    const vitals = {
      temperature: record.temperature?.toNumber() ?? null,
      pulse: record.pulse,
      o2Sat: record.o2Sat,
      bpSystolic: record.bpSystolic,
      bpDiastolic: record.bpDiastolic,
      respRate: record.respRate,
      weight: record.weight?.toNumber() ?? null,
      height: record.height?.toNumber() ?? null,
      bmi: record.bmi?.toNumber() ?? null,
    };
    if (!Object.values(vitals).some((value) => value !== null)) return [];
    const timestamp = record.createdAt.toISOString();
    const update = {
      event: 'vitals_update' as const,
      payload: {
        type: 'vitals_updated',
        vitalSignId: record.id,
        encounterId: record.encounterId,
        vitals,
        nurseName: record.createdBy.fullName,
        timestamp,
      },
    };

    const issues: string[] = [];
    if (
      vitals.bpSystolic !== null &&
      (vitals.bpSystolic > 180 || vitals.bpSystolic < 90)
    )
      issues.push(`BP ${vitals.bpSystolic}/${vitals.bpDiastolic ?? '—'}`);
    if (vitals.pulse !== null && (vitals.pulse > 120 || vitals.pulse < 50))
      issues.push(`HR ${vitals.pulse}`);
    if (
      vitals.temperature !== null &&
      (vitals.temperature > 39 || vitals.temperature < 35)
    )
      issues.push(`Temp ${vitals.temperature}°C`);
    if (vitals.o2Sat !== null && vitals.o2Sat < 90)
      issues.push(`SpO2: ${vitals.o2Sat}%`);
    if (!issues.length) return [update];
    return [
      update,
      {
        event: 'patient_alert' as const,
        payload: {
          type: 'CRITICAL',
          vitalSignId: record.id,
          encounterId: record.encounterId,
          patientName: record.encounter.patient.fullName,
          message: `Critical Vitals Detected: ${issues.join(', ')}`,
          timestamp,
        },
      },
    ];
  }
}
