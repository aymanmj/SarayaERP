import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { VitalsRecordedEvent } from './events/vitals-recorded.event';
import { appendNursingNotification } from '../nursing/nursing-notification-journal';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';

const internalFields = { requestKey: true, requestFingerprint: true } as const;

@Injectable()
export class VitalsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(data: {
    encounterId: number;
    hospitalId: number;
    userId: number;
    requestId?: unknown;
    ipAddress?: string;
    clientName?: string;
    temperature?: number;
    bpSystolic?: number;
    bpDiastolic?: number;
    pulse?: number;
    respRate?: number;
    o2Sat?: number;
    weight?: number;
    height?: number;
    bmi?: number;
    note?: string;
  }) {
    const {
      encounterId,
      hospitalId,
      userId,
      requestId,
      ipAddress,
      clientName,
      ...vitals
    } = data;
    if (
      requestId !== undefined &&
      (typeof requestId !== 'string' || !isUUID(requestId, '4'))
    )
      throw new BadRequestException('معرّف طلب القياس غير صالح');
    const requestKey =
      typeof requestId === 'string'
        ? `vitals:${hospitalId}:${requestId.toLowerCase()}`
        : undefined;
    // تحويل الأرقام إلى Decimal حيث يلزم
    const payload: Prisma.VitalSignCreateInput = {
      encounter: { connect: { id: encounterId } },
      createdBy: { connect: { id: userId } },

      temperature: vitals.temperature,
      bpSystolic: vitals.bpSystolic,
      bpDiastolic: vitals.bpDiastolic,
      pulse: vitals.pulse,
      respRate: vitals.respRate,
      o2Sat: vitals.o2Sat,
      weight: vitals.weight,
      height: vitals.height,
      bmi: vitals.bmi,
      note: vitals.note,
    };

    const requestFingerprint = requestKey
      ? createHash('sha256').update(JSON.stringify(payload)).digest('hex')
      : undefined;
    const auditFields = {
      action: 'VITALS_RECORDED',
      entity: 'VitalSign',
      hospitalId,
      userId,
      ipAddress,
      clientName,
      details: { encounterId },
    };
    const { vitalSign, encounter, created } = await this.prisma.$transaction(
      async (tx) => {
        const encounter = await tx.encounter.findFirst({
          where: { id: encounterId, hospitalId, isDeleted: false },
          select: {
            patientId: true,
            hospitalId: true,
            type: true,
            status: true,
          },
        });
        if (!encounter)
          throw new NotFoundException('الحالة غير موجودة في هذه المنشأة');
        if (requestKey) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestKey}, 0))`;
          const previous = await tx.vitalSign.findUnique({
            where: { requestKey },
            select: { id: true, requestFingerprint: true },
          });
          if (previous) {
            if (previous.requestFingerprint !== requestFingerprint)
              throw new ConflictException('معرّف الطلب مستخدم لقياس مختلف');
            const vitalSign = await tx.vitalSign.findUniqueOrThrow({
              where: { id: previous.id },
              omit: internalFields,
            });
            return { vitalSign, encounter, created: false };
          }
        }
        const vitalSign = await tx.vitalSign.create({
          data: {
            ...payload,
            requestKey,
            requestFingerprint: requestFingerprint ?? null,
          },
          omit: internalFields,
        });
        await appendChainedAuditInTransaction(tx, {
          ...auditFields,
          entityId: vitalSign.id,
        });
        if (
          encounter.type === 'IPD' &&
          encounter.status === 'OPEN' &&
          [
            vitalSign.temperature,
            vitalSign.bpSystolic,
            vitalSign.bpDiastolic,
            vitalSign.pulse,
            vitalSign.respRate,
            vitalSign.o2Sat,
            vitalSign.weight,
            vitalSign.height,
            vitalSign.bmi,
          ].some((value) => value !== null)
        ) {
          await appendNursingNotification(tx, {
            kind: 'vital',
            hospitalId,
            encounterId,
            recordId: vitalSign.id,
          });
        }
        return { vitalSign, encounter, created: true };
      },
    );

    if (!created) return vitalSign;
    publishCommittedCriticalAudit({ ...auditFields, entityId: vitalSign.id });
    const event: VitalsRecordedEvent = {
      vitalSignId: vitalSign.id,
      hospitalId: encounter.hospitalId,
      encounterId,
      patientId: encounter.patientId,
      vitals: {
        temperature: vitals.temperature,
        bpSystolic: vitals.bpSystolic,
        bpDiastolic: vitals.bpDiastolic,
        pulse: vitals.pulse,
        respRate: vitals.respRate,
        o2Sat: vitals.o2Sat,
      },
      recordedAt: vitalSign.createdAt,
    };
    this.eventEmitter.emit('vitals.recorded', event);

    return vitalSign;
  }

  async getForEncounter(encounterId: number, hospitalId: number) {
    return this.prisma.vitalSign.findMany({
      where: { encounterId, encounter: { hospitalId } },
      omit: internalFields,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  // دالة مساعدة لحساب الـ BMI تلقائياً
  calculateBMI(weight: number, heightCm: number): number | null {
    if (!weight || !heightCm) return null;
    const heightM = heightCm / 100;
    return parseFloat((weight / (heightM * heightM)).toFixed(2));
  }
}
