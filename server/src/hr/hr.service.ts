// src/hr/hr.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftType, LeaveType, LeaveStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

@Injectable()
export class HrService {
  constructor(private prisma: PrismaService) {}

  // --- إدارة أنواع الورديات (Shifts Definitions) ---
  async createWorkShift(
    hospitalId: number,
    data: {
      name: string;
      type: ShiftType;
      startTime: string; // "08:00"
      endTime: string; // "16:00"
      graceMinutes?: number;
    },
  ) {
    return this.prisma.workShift.create({
      data: {
        hospitalId,
        ...data,
      },
    });
  }

  async getWorkShifts(hospitalId: number) {
    return this.prisma.workShift.findMany({ where: { hospitalId } });
  }

  // --- إدارة الجدول الشهري (Rostering) ---

  // توزيع وردية لموظف في نطاق تاريخي معين
  async assignRoster(params: {
    hospitalId: number;
    userId: number;
    workShiftId: number;
    fromDate: Date;
    toDate: Date;
    isOffDay?: boolean;
  }) {
    const { hospitalId, userId, workShiftId, fromDate, toDate, isOffDay } =
      params;

    // التأكد من التواريخ
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const rostersData: Prisma.EmployeeRosterCreateManyInput[] = [];

    // حلقة تكرار لكل يوم في النطاق
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // نسخ التاريخ لتجنب التعديل بالمرجع
      const currentDay = new Date(d);

      rostersData.push({
        hospitalId,
        userId,
        workShiftId,
        date: currentDay,
        isOffDay: isOffDay || false,
      });
    }

    // نستخدم transaction لحذف القديم (إن وجد) وإضافة الجديد لهذا الموظف في هذه الأيام
    return this.prisma.$transaction(async (tx) => {
      // 1. حذف أي جدول سابق في هذه الأيام لهذا الموظف
      await tx.employeeRoster.deleteMany({
        where: {
          hospitalId,
          userId,
          date: { gte: start, lte: end },
        },
      });

      // 2. إضافة الجدول الجديد
      await tx.employeeRoster.createMany({
        data: rostersData,
      });
    });
  }

  async getRoster(hospitalId: number, from: Date, to: Date, userId?: number) {
    return this.prisma.employeeRoster.findMany({
      where: {
        hospitalId,
        date: { gte: from, lte: to },
        userId: userId || undefined,
      },
      include: {
        user: { select: { fullName: true } },
        shift: true,
      },
      orderBy: { date: 'asc' },
    });
  }

  // تعديل إدخال roster واحد
  async updateRosterEntry(
    hospitalId: number,
    id: number,
    data: { workShiftId?: number; isOffDay?: boolean },
  ) {
    // التحقق من وجود الإدخال وأنه يخص هذا المستشفى
    const entry = await this.prisma.employeeRoster.findUnique({
      where: { id },
    });

    if (!entry || entry.hospitalId !== hospitalId) {
      throw new NotFoundException('إدخال الجدول غير موجود');
    }

    return this.prisma.employeeRoster.update({
      where: { id },
      data: {
        workShiftId: data.workShiftId,
        isOffDay: data.isOffDay ?? false,
      },
      include: {
        user: { select: { fullName: true } },
        shift: true,
      },
    });
  }

  // حذف إدخال roster واحد
  async deleteRosterEntry(hospitalId: number, id: number) {
    // التحقق من وجود الإدخال وأنه يخص هذا المستشفى
    const entry = await this.prisma.employeeRoster.findUnique({
      where: { id },
    });

    if (!entry || entry.hospitalId !== hospitalId) {
      throw new NotFoundException('إدخال الجدول غير موجود');
    }

    return this.prisma.employeeRoster.delete({
      where: { id },
    });
  }

  // --- إدارة الإجازات (Leaves) ---

  async requestLeave(params: {
    hospitalId: number;
    userId: number;
    type: LeaveType;
    startDate: Date;
    endDate: Date;
    reason?: string;
  }) {
    const { startDate, endDate } = params;
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // تحقق بسيط من الرصيد (يمكن تعقيده لاحقاً)
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
    });
    if (
      user &&
      user.annualLeaveBalance < daysCount &&
      params.type === 'ANNUAL'
    ) {
      throw new BadRequestException('رصيد الإجازات السنوية لا يكفي.');
    }

    return this.prisma.leaveRequest.create({
      data: {
        ...params,
        daysCount,
        status: LeaveStatus.PENDING,
      },
    });
  }

  async approveLeave(
    hospitalId: number,
    requestId: number,
    approverId: number,
    status: LeaveStatus,
  ) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });
    if (!leave || leave.hospitalId !== hospitalId)
      throw new NotFoundException('الطلب غير موجود');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status, approvedById: approverId },
      });

      // إذا تمت الموافقة وكانت إجازة سنوية، نخصم من الرصيد
      if (status === LeaveStatus.APPROVED && leave.type === 'ANNUAL') {
        await tx.user.update({
          where: { id: leave.userId },
          data: { annualLeaveBalance: { decrement: leave.daysCount } },
        });
      }

      return updated;
    });
  }

  async getLeaves(hospitalId: number, status?: LeaveStatus) {
    return this.prisma.leaveRequest.findMany({
      where: {
        hospitalId,
        status: status || undefined,
      },
      include: {
        user: { select: { id: true, fullName: true } },
        approvedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
