import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { VitalsRecordedEvent } from './events/vitals-recorded.event';

@Injectable()
export class VitalsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(data: {
    encounterId: number;
    userId: number;
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
    const { encounterId, userId, ...vitals } = data;

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

    const vitalSign = await this.prisma.vitalSign.create({
      data: payload,
    });

    // ✨ [EVENT] Vitals Recorded -> CDSS
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { patientId: true, hospitalId: true },
    });

    if (encounter) {
      const event: VitalsRecordedEvent = {
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
    }

    return vitalSign;
  }

  async getForEncounter(encounterId: number) {
    return this.prisma.vitalSign.findMany({
      where: { encounterId },
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
