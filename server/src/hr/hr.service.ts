// src/hr/hr.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftType, LeaveType, LeaveStatus, Prisma } from '@prisma/client';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { assertStaffSchedulingEligibility } from './staff-credentialing.service';

function toUtcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

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
    if (!data.name || !data.name.trim()) {
      throw new BadRequestException('اسم الوردية مطلوب.');
    }
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(data.startTime) || !timeRegex.test(data.endTime)) {
      throw new BadRequestException(
        'صيغة وقت البداية والنهاية يجب أن تكون HH:mm.',
      );
    }
    if (
      data.graceMinutes !== undefined &&
      (!Number.isInteger(data.graceMinutes) ||
        data.graceMinutes < 0 ||
        data.graceMinutes > 240)
    ) {
      throw new BadRequestException(
        'فترة السماحية يجب أن تكون رقماً صحيحاً بين 0 و 240 دقيقة.',
      );
    }

    return this.prisma.workShift.create({
      data: {
        hospitalId,
        ...data,
        name: data.name.trim(),
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

    const rawStart = new Date(fromDate);
    const rawEnd = new Date(toDate);
    if (isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime())) {
      throw new BadRequestException('تاريخ بداية أو نهاية الجدول غير صالح.');
    }

    const start = toUtcDayStart(rawStart);
    const end = toUtcDayStart(rawEnd);
    if (end < start) {
      throw new BadRequestException(
        'تاريخ نهاية الجدول يجب أن يكون مساوياً أو بعد تاريخ البداية.',
      );
    }

    const spanDays =
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (spanDays > 366) {
      throw new BadRequestException(
        'لا يمكن جدولة أكثر من 366 يوماً في عملية واحدة.',
      );
    }

    const rostersData: Prisma.EmployeeRosterCreateManyInput[] = [];
    for (
      let d = new Date(start.getTime());
      d <= end;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      rostersData.push({
        hospitalId,
        userId,
        workShiftId,
        date: new Date(d.getTime()),
        isOffDay: Boolean(isOffDay),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.user.findFirst({
        where: { id: userId, hospitalId, isDeleted: false },
        select: { id: true },
      });
      if (!employee) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }

      // CAP12: منع جدولة ورديات عمل لموظف انتهى/عُلّق إذن مزاولته أو شهادته الصحية
      if (!isOffDay) {
        await assertStaffSchedulingEligibility(tx, hospitalId, userId, end);
      }

      const shift = await tx.workShift.findFirst({
        where: { id: workShiftId, hospitalId },
        select: { id: true },
      });
      if (!shift) {
        throw new NotFoundException('الوردية غير موجودة في هذه المنشأة.');
      }

      // 1. حذف أي جدول سابق في هذه الأيام لهذا الموظف
      await tx.employeeRoster.deleteMany({
        where: {
          hospitalId,
          userId,
          date: { gte: start, lte: end },
        },
      });

      // 2. إضافة الجدول الجديد
      return tx.employeeRoster.createMany({
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
    const entry = await this.prisma.employeeRoster.findUnique({
      where: { id },
    });

    if (!entry || entry.hospitalId !== hospitalId) {
      throw new NotFoundException('إدخال الجدول غير موجود');
    }

    if (data.workShiftId !== undefined) {
      const shift = await this.prisma.workShift.findFirst({
        where: { id: data.workShiftId, hospitalId },
        select: { id: true },
      });
      if (!shift) {
        throw new NotFoundException('الوردية غير موجودة في هذه المنشأة.');
      }
    }

    return this.prisma.employeeRoster.update({
      where: { id },
      data: {
        workShiftId: data.workShiftId ?? entry.workShiftId,
        isOffDay: data.isOffDay ?? entry.isOffDay,
      },
      include: {
        user: { select: { fullName: true } },
        shift: true,
      },
    });
  }

  // حذف إدخال roster واحد
  async deleteRosterEntry(hospitalId: number, id: number) {
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
    const rawStart = new Date(params.startDate);
    const rawEnd = new Date(params.endDate);
    if (isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime())) {
      throw new BadRequestException('تاريخ بداية أو نهاية الإجازة غير صالح.');
    }

    const start = toUtcDayStart(rawStart);
    const end = toUtcDayStart(rawEnd);
    if (end < start) {
      throw new BadRequestException(
        'تاريخ نهاية الإجازة يجب أن يكون مساوياً أو بعد تاريخ البداية.',
      );
    }

    const daysCount =
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

    return this.prisma.$transaction(async (tx) => {
      const lockedUsers = await tx.$queryRaw<
        Array<{ id: number; hospitalId: number; isDeleted: boolean }>
      >`SELECT "id", "hospitalId", "isDeleted" FROM "User" WHERE "id" = ${params.userId} AND "hospitalId" = ${params.hospitalId} FOR UPDATE`;

      if (!lockedUsers.length || lockedUsers[0].isDeleted) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }

      const overlapping = await tx.leaveRequest.findFirst({
        where: {
          hospitalId: params.hospitalId,
          userId: params.userId,
          status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });
      if (overlapping) {
        throw new BadRequestException(
          'يوجد طلب إجازة معلق أو معتمد يتداخل مع هذه الفترة.',
        );
      }

      if (params.type === LeaveType.ANNUAL) {
        const user = await tx.user.findUnique({
          where: { id: params.userId },
          select: { annualLeaveBalance: true },
        });
        const pendingAnnual = await tx.leaveRequest.aggregate({
          where: {
            hospitalId: params.hospitalId,
            userId: params.userId,
            type: LeaveType.ANNUAL,
            status: LeaveStatus.PENDING,
          },
          _sum: { daysCount: true },
        });
        const reservedDays = pendingAnnual._sum.daysCount ?? 0;
        const availableBalance = (user?.annualLeaveBalance ?? 0) - reservedDays;

        if (availableBalance < daysCount) {
          throw new BadRequestException('رصيد الإجازات السنوية لا يكفي.');
        }
      }

      return tx.leaveRequest.create({
        data: {
          hospitalId: params.hospitalId,
          userId: params.userId,
          type: params.type,
          startDate: start,
          endDate: end,
          reason: params.reason,
          daysCount,
          status: LeaveStatus.PENDING,
        },
      });
    });
  }

  async approveLeave(
    hospitalId: number,
    requestId: number,
    approverId: number,
    status: LeaveStatus,
  ) {
    if (status !== LeaveStatus.APPROVED && status !== LeaveStatus.REJECTED) {
      throw new BadRequestException(
        'حالة البت في الإجازة يجب أن تكون APPROVED أو REJECTED.',
      );
    }

    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const lockedLeaves = await tx.$queryRaw<
        Array<{
          id: number;
          hospitalId: number;
          userId: number;
          status: string;
        }>
      >`SELECT "id", "hospitalId", "userId", "status" FROM "LeaveRequest" WHERE "id" = ${requestId} FOR UPDATE`;

      if (!lockedLeaves.length || lockedLeaves[0].hospitalId !== hospitalId) {
        throw new NotFoundException('الطلب غير موجود');
      }

      const leave = await tx.leaveRequest.findUnique({
        where: { id: requestId },
      });
      if (!leave || leave.hospitalId !== hospitalId) {
        throw new NotFoundException('الطلب غير موجود');
      }

      if (leave.status !== LeaveStatus.PENDING) {
        throw new BadRequestException(
          'تم البت في طلب الإجازة مسبقاً ولا يمكن تغيير حالته مرة أخرى.',
        );
      }

      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${leave.userId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      if (status === LeaveStatus.APPROVED) {
        const overlappingApproved = await tx.leaveRequest.findFirst({
          where: {
            hospitalId,
            userId: leave.userId,
            id: { not: requestId },
            status: LeaveStatus.APPROVED,
            startDate: { lte: leave.endDate },
            endDate: { gte: leave.startDate },
          },
        });
        if (overlappingApproved) {
          throw new BadRequestException(
            'توجد إجازة معتمدة أخرى للموظف تتداخل مع هذه الفترة.',
          );
        }

        if (leave.type === LeaveType.ANNUAL) {
          const user = await tx.user.findUnique({
            where: { id: leave.userId },
            select: { annualLeaveBalance: true },
          });
          if (!user || user.annualLeaveBalance < leave.daysCount) {
            throw new BadRequestException('رصيد الإجازات السنوية لا يكفي.');
          }

          await tx.user.update({
            where: { id: leave.userId },
            data: { annualLeaveBalance: { decrement: leave.daysCount } },
          });
        }
      }

      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status, approvedById: approverId },
      });

      committedAudit = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: approverId,
        action:
          status === LeaveStatus.APPROVED
            ? 'APPROVE_LEAVE_REQUEST'
            : 'REJECT_LEAVE_REQUEST',
        entity: 'LeaveRequest',
        entityId: requestId,
        details: {
          employeeId: leave.userId,
          type: leave.type,
          daysCount: leave.daysCount,
          previousStatus: leave.status,
          newStatus: status,
        },
      });

      return updated;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
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
