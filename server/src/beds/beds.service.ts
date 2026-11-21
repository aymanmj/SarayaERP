// src/beds/beds.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BedStatus, EncounterType } from '@prisma/client';
import {
  lockBedEncounter,
  moveBed,
  assertNoPendingBedMovement,
  ACTIVE_ADMISSIONS,
  ACTIVE_TRANSFER_ORDERS,
  assertNoActiveIcuSupport,
} from './bed-allocation';
import { Money } from '../common/utils/money.util';

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
    const wards = await this.prisma.ward.findMany({
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

    return wards.map((ward) => ({
      ...ward,
      serviceItem: ward.serviceItem
        ? {
            ...ward.serviceItem,
            defaultPrice: Money.fromPrisma(ward.serviceItem.defaultPrice),
          }
        : null,
    }));
  }

  // 🔹 ربط Encounter (IPD) بسرير (تنويم)
  async assignBed(hospitalId: number, encounterId: number, bedId: number) {
    return this.prisma.$transaction(async (tx) => {
      const encounter = await lockBedEncounter(tx, hospitalId, encounterId);
      if (encounter.type !== EncounterType.IPD)
        throw new BadRequestException(
          'يجب أن تكون الحالة تنويمًا نشطًا لحجز السرير',
        );
      return (await moveBed(tx, hospitalId, encounterId, bedId)).assignment;
    });
  }

  async releaseBed(hospitalId: number, encounterId: number) {
    return this.prisma.$transaction(async (tx) => {
      await lockBedEncounter(tx, hospitalId, encounterId);
      await assertNoPendingBedMovement(tx, hospitalId, encounterId);
      await assertNoActiveIcuSupport(tx, hospitalId, encounterId);
      const assignments = await tx.bedAssignment.findMany({
        where: { hospitalId, encounterId, to: null },
      });
      if (assignments.length !== 1)
        throw new BadRequestException('لا يوجد حجز نشط وحيد يمكن إخلاؤه');
      const assignment = assignments[0];
      const released = await tx.bed.updateMany({
        where: { id: assignment.bedId, hospitalId, status: BedStatus.OCCUPIED },
        data: { status: BedStatus.CLEANING },
      });
      if (released.count !== 1)
        throw new BadRequestException('حالة السرير غير متسقة؛ تجب مراجعتها');
      await tx.bedAssignment.update({
        where: { id: assignment.id },
        data: { to: new Date() },
      });
      await tx.admission.updateMany({
        where: {
          hospitalId,
          encounterId,
          admissionStatus: { in: [...ACTIVE_ADMISSIONS] },
        },
        data: { bedId: null, roomId: null, wardId: null },
      });
      return { success: true };
    });
  }

  async markBedClean(hospitalId: number, bedId: number) {
    const changed = await this.prisma.bed.updateMany({
      where: {
        id: bedId,
        hospitalId,
        isActive: true,
        status: BedStatus.CLEANING,
        assignments: { none: { to: null } },
      },
      data: { status: BedStatus.AVAILABLE },
    });
    if (changed.count !== 1)
      throw new BadRequestException(
        'لا يمكن إتاحة السرير إلا بعد إخلائه وفي حالة التنظيف',
      );
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
    const ward = await this.prisma.ward.findFirst({
      where: { id, hospitalId, isActive: true },
    });
    if (!ward) throw new NotFoundException('العنبر غير موجود');
    return this.prisma.ward.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        gender: data.gender,
        serviceItemId: data.serviceItemId,
        departmentId: data.departmentId,
      },
    });
  }

  async deleteWard(hospitalId: number, id: number) {
    const ward = await this.prisma.ward.findFirst({
      where: { id, hospitalId, isActive: true },
    });
    if (!ward) throw new NotFoundException('العنبر غير موجود');

    // Check if ward has active rooms
    const activeRooms = await this.prisma.room.count({
      where: { wardId: id, isActive: true },
    });
    if (activeRooms > 0) {
      throw new BadRequestException(
        'لا يمكن حذف عنبر يحتوي على غرف نشطة. قم بحذف الغرف أولاً.',
      );
    }

    return this.prisma.ward.update({
      where: { id },
      data: { isActive: false },
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

  async updateRoom(hospitalId: number, id: number, data: any) {
    const room = await this.prisma.room.findFirst({
      where: { id, hospitalId, isActive: true },
    });
    if (!room) throw new NotFoundException('الغرفة غير موجودة');
    return this.prisma.room.update({
      where: { id },
      data: { roomNumber: data.roomNumber },
    });
  }

  async deleteRoom(hospitalId: number, id: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, hospitalId, isActive: true },
    });
    if (!room) throw new NotFoundException('الغرفة غير موجودة');

    // Check if room has active beds
    const activeBeds = await this.prisma.bed.count({
      where: { roomId: id, isActive: true },
    });
    if (activeBeds > 0) {
      throw new BadRequestException(
        'لا يمكن حذف غرفة تحتوي على أسرة نشطة. قم بحذف الأسرة أولاً.',
      );
    }

    return this.prisma.room.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // 3. إدارة الأسرة (Beds)
  async createBed(hospitalId: number, roomId: number, bedNumber: string) {
    // نحتاج معرفة العنبر من الغرفة
    const room = await this.prisma.room.findFirst({
      where: {
        id: roomId,
        hospitalId,
        isActive: true,
        ward: { hospitalId, isActive: true },
      },
    });
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

  async updateBed(
    hospitalId: number,
    id: number,
    data: { bedNumber?: string; status?: BedStatus },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Bed" WHERE "id" = ${id} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const bed = await tx.bed.findFirst({
        where: { id, hospitalId, isActive: true },
      });
      if (!bed) throw new NotFoundException('السرير غير موجود');
      if (data.status !== undefined && data.status !== bed.status) {
        if (!Object.values(BedStatus).includes(data.status))
          throw new BadRequestException('حالة السرير غير صالحة');
        const active = await tx.bedAssignment.count({
          where: { bedId: id, to: null },
        });
        const reservations = await tx.transferOrder.count({
          where: {
            hospitalId,
            toBedId: id,
            status: { in: [...ACTIVE_TRANSFER_ORDERS] },
          },
        });
        if (
          active ||
          reservations ||
          bed.status === BedStatus.OCCUPIED ||
          data.status === BedStatus.OCCUPIED
        )
          throw new BadRequestException(
            'يجب استخدام مسار الحجز أو النقل لتغيير حالة السرير المشغول أو المحجوز',
          );
      }
      return tx.bed.update({
        where: { id, hospitalId },
        data: { bedNumber: data.bedNumber, status: data.status },
      });
    });
  }

  async deleteBed(hospitalId: number, id: number) {
    const changed = await this.prisma.bed.updateMany({
      where: {
        id,
        hospitalId,
        isActive: true,
        status: { notIn: [BedStatus.OCCUPIED, BedStatus.BLOCKED] },
        assignments: { none: { to: null } },
        transferOrdersTo: {
          none: { status: { in: [...ACTIVE_TRANSFER_ORDERS] } },
        },
      },
      data: { isActive: false },
    });
    if (changed.count !== 1)
      throw new BadRequestException(
        'لا يمكن حذف سرير مشغول أو محجوز أو غير موجود',
      );
    return { success: true };
  }

  // جلب خدمات الإقامة فقط (للقائمة المنسدلة)
  async getBedServices(hospitalId: number) {
    const services = await this.prisma.serviceItem.findMany({
      where: {
        hospitalId,
        type: 'BED',
        isActive: true,
      },
      select: { id: true, name: true, defaultPrice: true },
    });

    return services.map((s) => ({
      ...s,
      defaultPrice: Money.fromPrisma(s.defaultPrice),
    }));
  }
}
