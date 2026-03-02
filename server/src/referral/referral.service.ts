// src/referral/referral.service.ts

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralStatus } from '@prisma/client';

@Injectable()
export class ReferralService {
  constructor(private prisma: PrismaService) {}

  async create(hospitalId: number, userId: number, data: {
    patientId: number;
    receivingDoctorId: number;
    encounterId?: number;
    reason: string;
    clinicalSummary?: string;
    priority?: string;
  }) {
    return this.prisma.referral.create({
      data: {
        hospitalId,
        referringDoctorId: userId,
        patientId: data.patientId,
        receivingDoctorId: data.receivingDoctorId,
        encounterId: data.encounterId || null,
        reason: data.reason,
        clinicalSummary: data.clinicalSummary || null,
        priority: data.priority || 'ROUTINE',
      },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        referringDoctor: { select: { id: true, fullName: true } },
        receivingDoctor: { select: { id: true, fullName: true } },
      },
    });
  }

  async findSent(hospitalId: number, userId: number) {
    return this.prisma.referral.findMany({
      where: { hospitalId, referringDoctorId: userId },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        receivingDoctor: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findReceived(hospitalId: number, userId: number) {
    return this.prisma.referral.findMany({
      where: { hospitalId, receivingDoctorId: userId },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        referringDoctor: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(hospitalId: number) {
    return this.prisma.referral.findMany({
      where: { hospitalId },
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        referringDoctor: { select: { id: true, fullName: true } },
        receivingDoctor: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async accept(hospitalId: number, id: number, userId: number) {
    const referral = await this.prisma.referral.findFirst({
      where: { id, hospitalId },
    });
    if (!referral) throw new NotFoundException('الإحالة غير موجودة.');
    if (referral.receivingDoctorId !== userId) {
      throw new BadRequestException('لا يمكنك قبول إحالة غير موجهة إليك.');
    }
    if (referral.status !== ReferralStatus.PENDING) {
      throw new BadRequestException('هذه الإحالة ليست في حالة انتظار.');
    }
    return this.prisma.referral.update({
      where: { id },
      data: { status: ReferralStatus.ACCEPTED },
    });
  }

  async complete(hospitalId: number, id: number, userId: number, notes?: string) {
    const referral = await this.prisma.referral.findFirst({
      where: { id, hospitalId },
    });
    if (!referral) throw new NotFoundException('الإحالة غير موجودة.');
    if (referral.receivingDoctorId !== userId) {
      throw new BadRequestException('لا يمكنك إكمال إحالة غير موجهة إليك.');
    }
    if (referral.status !== ReferralStatus.ACCEPTED) {
      throw new BadRequestException('يجب قبول الإحالة أولاً قبل إكمالها.');
    }
    return this.prisma.referral.update({
      where: { id },
      data: {
        status: ReferralStatus.COMPLETED,
        notes: notes || null,
        completedAt: new Date(),
      },
    });
  }

  async reject(hospitalId: number, id: number, userId: number, notes?: string) {
    const referral = await this.prisma.referral.findFirst({
      where: { id, hospitalId },
    });
    if (!referral) throw new NotFoundException('الإحالة غير موجودة.');
    if (referral.receivingDoctorId !== userId) {
      throw new BadRequestException('لا يمكنك رفض إحالة غير موجهة إليك.');
    }
    if (referral.status !== ReferralStatus.PENDING) {
      throw new BadRequestException('هذه الإحالة ليست في حالة انتظار.');
    }
    return this.prisma.referral.update({
      where: { id },
      data: {
        status: ReferralStatus.REJECTED,
        notes: notes || null,
      },
    });
  }

  async cancel(hospitalId: number, id: number, userId: number) {
    const referral = await this.prisma.referral.findFirst({
      where: { id, hospitalId },
    });
    if (!referral) throw new NotFoundException('الإحالة غير موجودة.');
    if (referral.referringDoctorId !== userId) {
      throw new BadRequestException('لا يمكنك إلغاء إحالة لم ترسلها.');
    }
    if (referral.status !== ReferralStatus.PENDING) {
      throw new BadRequestException('لا يمكن الإلغاء إلا في حالة الانتظار.');
    }
    return this.prisma.referral.update({
      where: { id },
      data: { status: ReferralStatus.CANCELLED },
    });
  }
}
