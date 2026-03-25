// src/beds/beds.service.ts

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BedStatus, EncounterType } from '@prisma/client';

@Injectable()
export class BedsService {
  constructor(private prisma: PrismaService) {}

  // 🔹 ملخص حالة الأسرة في المستشفى
  async getSummary(hospitalId: number) {
    const total = await this.prisma.bed.count({
      where: { hospitalId, isActive: true },
    });

    const available = await this.prisma.bed.count({
      where: { hospitalId, isActive: true, status: BedStatus.AVAILABLE },
    });

    const occupied = await this.prisma.bed.count({
      where: { hospitalId, isActive: true, status: BedStatus.OCCUPIED },
    });

    const maintenance = await this.prisma.bed.count({
      where: { hospitalId, isActive: true, status: BedStatus.MAINTENANCE },
    });

    const cleaning = await this.prisma.bed.count({
      where: { hospitalId, isActive: true, status: BedStatus.CLEANING },
    });

    const blocked = await this.prisma.bed.count({
      where: { hospitalId, isActive: true, status: BedStatus.BLOCKED },
    });

    return {
      total,
      available,
      occupied,
      maintenance,
      cleaning,
      blocked,
    };
  }

  // 🔹 شجرة: عنابر -> غرف -> أسِرّة
  async listTree(hospitalId: number) {
    return this.prisma.ward.findMany({
      where: { hospitalId, isActive: true },
      include: {
        department: { select: { id: true, name: true } },
        serviceItem: { select: { id: true, name: true, defaultPrice: true } },
        rooms: {
          where: { isActive: true },
          include: {
            beds: {
              where: { isActive: true },
              orderBy: { bedNumber: 'asc' },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // 🔹 ربط Encounter (IPD) بسرير (تنويم)
  async assignBed(hospitalId: number, encounterId: number, bedId: number) {
    // 1. التحقق من وجود الحالة وصحتها
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, hospitalId },
    });

    if (!encounter) {
      throw new NotFoundException('Encounter غير موجود في هذه المنشأة');
    }

    if (encounter.type !== EncounterType.IPD) {
      throw new BadRequestException('لا يمكن ربط سرير إلا بحالات تنويم (IPD)');
    }

    // 2. التحقق من وجود السرير وحالته
    const bed = await this.prisma.bed.findFirst({
      where: { id: bedId, hospitalId, isActive: true },
    });

    if (!bed) {
      throw new NotFoundException('السرير غير موجود في هذه المنشأة');
    }

    if (bed.status !== BedStatus.AVAILABLE) {
      throw new ForbiddenException('لا يمكن حجز سرير غير متاح');
    }

    // 3. التحقق: هل هذه الحالة لديها سرير بالفعل؟
    const existingForEncounter = await this.prisma.bedAssignment.findFirst({
      where: {
        hospitalId,
        encounterId,
        to: null,
      },
    });

    if (existingForEncounter) {
      // IF THEY ALREADY HAVE A BED, THIS IS A DIRECT TRANSFER. RELEASE THE OLD BED
      await this.prisma.bedAssignment.update({
        where: { id: existingForEncounter.id },
        data: { to: new Date() },
      });

      await this.prisma.bed.update({
        where: { id: existingForEncounter.bedId },
        data: { status: BedStatus.CLEANING },
      });
    }

    // 4. التحقق: هل السرير محجوز بالفعل؟
    const existingForBed = await this.prisma.bedAssignment.findFirst({
      where: { hospitalId, bedId, to: null },
    });

    if (existingForBed) {
      throw new BadRequestException('السرير محجوز بالفعل لحالة أخرى');
    }

    // 5. ✅ [تعديل هام] التحقق: هل المريض (نفس الشخص) يشغل سريراً آخر حالياً في حالة تنويم أخرى؟
    // يمنع فتح حالتي تنويم لنفس المريض في نفس الوقت وحجز سريرين
    const patientActiveBed = await this.prisma.bedAssignment.findFirst({
      where: {
        hospitalId,
        encounter: {
          patientId: encounter.patientId, // نفس المريض
        },
        encounterId: { not: encounterId }, // استثناء الحالة الحالية لأننا نعالجها أعلاه كنقل
        to: null, // الحجز ما زال نشطاً
      },
      include: {
        bed: true,
      },
    });

    if (patientActiveBed) {
      throw new BadRequestException(
        `المريض يشغل بالفعل السرير رقم ${patientActiveBed.bed.bedNumber} في حالة أخرى. يجب خروج المريض أولاً.`,
      );
    }

    // 6. إنشاء الحجز وتحديث حالة السرير
    const assignment = await this.prisma.bedAssignment.create({
      data: {
        hospitalId,
        encounterId,
        bedId,
      },
    });

    await this.prisma.bed.update({
      where: { id: bedId },
      data: { status: BedStatus.OCCUPIED },
    });

    return assignment;
  }

  // 🔹 فك ربط Encounter عن السرير (خروج من السرير)
  async releaseBed(hospitalId: number, encounterId: number) {
    const assignment = await this.prisma.bedAssignment.findFirst({
      where: {
        hospitalId,
        encounterId,
        to: null,
      },
      include: {
        bed: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('لا يوجد سرير مرتبط حاليًا بهذه الحالة');
    }

    // إغلاق الحجز
    await this.prisma.bedAssignment.update({
      where: { id: assignment.id },
      data: { to: new Date() },
    });

    // تغيير حالة السرير (مثلاً إلى CLEANING)
    await this.prisma.bed.update({
      where: { id: assignment.bedId },
      data: { status: BedStatus.CLEANING },
    });

    return { success: true };
  }

  // 🔹 تنظيف السرير وجعله متاحاً
  async markBedClean(hospitalId: number, bedId: number) {
    const bed = await this.prisma.bed.findFirst({
      where: { id: bedId, hospitalId, isActive: true },
    });

    if (!bed) {
      throw new NotFoundException('السرير غير موجود في هذه المنشأة');
    }

    if (bed.status !== BedStatus.CLEANING) {
      throw new BadRequestException(
        'لا يمكن وضع السرير كمتاح إلا إذا كان في حالة CLEANING',
      );
    }

    await this.prisma.bed.update({
      where: { id: bedId },
      data: { status: BedStatus.AVAILABLE },
    });

    return { success: true };
  }

  // 1. إدارة العنابر (Wards)
  async createWard(
    hospitalId: number,
    data: {
      name: string;
      type: string;
      gender: string;
      serviceItemId?: number;
      departmentId?: number;
    },
  ) {
    return this.prisma.ward.create({
      data: {
        hospitalId,
        name: data.name,
        type: data.type,
        gender: data.gender,
        serviceItemId: data.serviceItemId,
        departmentId: data.departmentId,
      },
    });
  }

  async updateWard(hospitalId: number, id: number, data: any) {
    return this.prisma.ward.update({
      where: { id },
      data,
    });
  }

  // 2. إدارة الغرف (Rooms)
  async createRoom(hospitalId: number, wardId: number, roomNumber: string) {
    return this.prisma.room.create({
      data: {
        hospitalId,
        wardId,
        roomNumber,
      },
    });
  }

  // 3. إدارة الأسرة (Beds)
  async createBed(hospitalId: number, roomId: number, bedNumber: string) {
    // نحتاج معرفة العنبر من الغرفة
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('الغرفة غير موجودة');

    return this.prisma.bed.create({
      data: {
        hospitalId,
        wardId: room.wardId,
        roomId,
        bedNumber,
        status: 'AVAILABLE',
      },
    });
  }

  // 4. حذف (Soft Delete أو منع الحذف إذا كان مرتبطاً)
  async deleteBed(id: number) {
    // تحقق من عدم وجود مرضى حالياً
    const active = await this.prisma.bedAssignment.findFirst({
      where: { bedId: id, to: null },
    });
    if (active) throw new BadRequestException('لا يمكن حذف سرير مشغول.');
    return this.prisma.bed.update({ where: { id }, data: { isActive: false } });
  }

  // جلب خدمات الإقامة فقط (للقائمة المنسدلة)
  async getBedServices(hospitalId: number) {
    return this.prisma.serviceItem.findMany({
      where: {
        hospitalId,
        type: 'BED',
        isActive: true,
      },
      select: { id: true, name: true, defaultPrice: true },
    });
  }
}
