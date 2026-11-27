// src/attendance/attendance.service.ts

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';
import { CreatePunchDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private prisma: PrismaService) {}

  private parseShiftTime(dateRef: Date, timeStr: string): Date {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(dateRef);
    d.setUTCHours(h, m, 0, 0);
    return d;
  }

  async processPunch(dto: CreatePunchDto, hospitalId?: number) {
    let resolvedHospitalId = hospitalId;
    if (resolvedHospitalId !== undefined) {
      const user = await this.prisma.user.findFirst({
        where: {
          id: dto.userId,
          hospitalId: resolvedHospitalId,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }
    } else if (typeof this.prisma.user?.findUnique === 'function') {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { hospitalId: true },
      });
      if (user?.hospitalId !== undefined) {
        resolvedHospitalId = user.hospitalId;
      }
    }

    const punchTime = new Date(dto.timestamp);
    const startOfDay = new Date(
      Date.UTC(
        punchTime.getUTCFullYear(),
        punchTime.getUTCMonth(),
        punchTime.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );

    const existingRecord = await this.prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId: dto.userId, date: startOfDay } },
    });

    const roster = await this.prisma.employeeRoster.findFirst({
      where: {
        userId: dto.userId,
        date: startOfDay,
        ...(resolvedHospitalId !== undefined
          ? { hospitalId: resolvedHospitalId }
          : {}),
      },
      include: { shift: true },
    });

    if (!existingRecord) {
      let lateMinutes = 0;
      let status = 'PRESENT';

      if (roster && !roster.isOffDay) {
        const shiftStart = this.parseShiftTime(
          startOfDay,
          roster.shift.startTime,
        );
        const graceTime = new Date(
          shiftStart.getTime() + roster.shift.graceMinutes * 60000,
        );

        if (punchTime > graceTime) {
          const diffMs = punchTime.getTime() - shiftStart.getTime();
          lateMinutes = Math.floor(diffMs / 60000);
          status = 'LATE';
        }
      }

      return this.prisma.attendanceRecord.create({
        data: {
          ...(resolvedHospitalId !== undefined
            ? { hospitalId: resolvedHospitalId }
            : {}),
          userId: dto.userId,
          date: startOfDay,
          checkIn: punchTime,
          status,
          lateMinutes,
        },
      });
    } else {
      if (existingRecord.checkIn && punchTime > existingRecord.checkIn) {
        const grossMins =
          (punchTime.getTime() - existingRecord.checkIn.getTime()) / 60000;
        const netHours = Math.max(
          0,
          (grossMins - (existingRecord.tempLeaveMinutes || 0)) / 60,
        );
        return this.prisma.attendanceRecord.update({
          where: { id: existingRecord.id },
          data: {
            ...(!existingRecord.hospitalId && resolvedHospitalId !== undefined
              ? { hospitalId: resolvedHospitalId }
              : {}),
            checkOut: punchTime,
            workedHours: Money.toDbString(Money.roundDecimal(netHours, 3)),
          },
        });
      }
      return existingRecord;
    }
  }

  async processBulkPunches(punches: CreatePunchDto[], hospitalId?: number) {
    let processed = 0;
    let errors = 0;
    const sortedPunches = [...punches].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    for (const punch of sortedPunches) {
      try {
        const user = await this.prisma.user.findFirst({
          where: {
            id: punch.userId,
            ...(hospitalId !== undefined
              ? { hospitalId, isDeleted: false }
              : {}),
          },
        });
        if (user) {
          await this.processPunch(punch, hospitalId);
          processed++;
        } else {
          errors++;
        }
      } catch (e) {
        errors++;
      }
    }
    return { success: true, processed, errors };
  }

  async getRecords(
    hospitalId: number,
    dateFrom?: Date,
    dateTo?: Date,
    userId?: number,
  ) {
    const where: any = {
      OR: [
        { hospitalId },
        { user: { hospitalId } },
        { employee: { hospitalId } },
      ],
    };
    if (userId) where.userId = userId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = dateFrom;
      if (dateTo) where.date.lte = dateTo;
    }
    return this.prisma.attendanceRecord.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        employee: { select: { id: true, employeeNo: true, fullName: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * ✅ المحرك التحليلي للحضور: حساب ملخص كامل للموظف
   */
  async getEmployeeMonthlyStats(
    userId: number,
    startDate: Date,
    endDate: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const records = await client.attendanceRecord.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
    });

    const rosters = await client.employeeRoster.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      include: { shift: true },
    });

    const paidLeaves = await client.leaveRequest.findMany({
      where: {
        userId,
        status: 'APPROVED',
        type: { not: 'UNPAID' },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { startDate: true, endDate: true },
    });

    const employeeMeta =
      typeof client.user?.findUnique === 'function'
        ? await client.user.findUnique({
            where: { id: userId },
            select: { hospitalId: true },
          })
        : null;
    const holidays =
      employeeMeta && typeof client.holiday?.findMany === 'function'
        ? await client.holiday.findMany({
            where: { hospitalId: employeeMeta.hospitalId, isActive: true },
            select: { date: true, isAnnual: true },
          })
        : [];

    let totalLateMinutes = 0;
    let absentDays = 0;
    let overtimeMinutes = 0;
    let workDaysCount = 0;

    const recordsMap = new Map(
      records.map((r) => [r.date.toISOString().slice(0, 10), r]),
    );

    const isOfficialHoliday = (d: Date) =>
      holidays.some((h) => {
        const hd = new Date(h.date);
        return (
          hd.getUTCMonth() === d.getUTCMonth() &&
          hd.getUTCDate() === d.getUTCDate() &&
          (h.isAnnual || hd.getUTCFullYear() === d.getUTCFullYear())
        );
      });

    for (const rosterItem of rosters) {
      const dateKey = rosterItem.date.toISOString().slice(0, 10);
      const record = recordsMap.get(dateKey);

      if (rosterItem.isOffDay) {
        if (record && record.checkIn && record.checkOut) {
          const duration =
            (record.checkOut.getTime() - record.checkIn.getTime()) / 60000;
          overtimeMinutes += duration;
        }
        continue;
      }

      workDaysCount++;

      const rosterDay = rosterItem.date.toISOString().slice(0, 10);
      if (
        isOfficialHoliday(rosterItem.date) ||
        paidLeaves.some(
          (leave) =>
            leave.startDate.toISOString().slice(0, 10) <= rosterDay &&
            leave.endDate.toISOString().slice(0, 10) >= rosterDay,
        )
      ) {
        continue;
      }

      if (!record) {
        absentDays++;
      } else if (record.status === 'ABSENT') {
        const excused =
          record.absenceAuthorization === 'AUTHORIZED' ||
          record.absenceAuthorization === 'SICK' ||
          record.absenceAuthorization === 'VACATION';
        if (!excused) {
          absentDays++;
        }
      } else {
        totalLateMinutes += record.lateMinutes || 0;

        if (record.checkOut && rosterItem.shift) {
          const shiftEnd = this.parseShiftTime(
            rosterItem.date,
            rosterItem.shift.endTime,
          );
          if (record.checkOut > shiftEnd) {
            const extra =
              (record.checkOut.getTime() - shiftEnd.getTime()) / 60000;
            if (extra > 30) overtimeMinutes += extra;
          }
        }
      }
    }

    return {
      totalLateMinutes,
      absentDays,
      overtimeHours: Math.floor(overtimeMinutes / 60),
      workDaysCount,
    };
  }

  /**
   * تسجيل بصمة لموظف (يدعم الموظفين غير المرتبطين بحساب مستخدم userId = null)
   */
  async processEmployeePunch(params: {
    hospitalId: number;
    employeeId: number;
    userId?: number | null;
    timestamp: Date | string;
    source?: string;
  }) {
    const punchTime = new Date(params.timestamp);
    if (Number.isNaN(punchTime.getTime())) {
      throw new BadRequestException('وقت البصمة غير صالح.');
    }
    const startOfDay = new Date(
      Date.UTC(
        punchTime.getUTCFullYear(),
        punchTime.getUTCMonth(),
        punchTime.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );

    const existingRecord = await this.prisma.attendanceRecord.findFirst({
      where: {
        hospitalId: params.hospitalId,
        date: startOfDay,
        OR: [
          { employeeId: params.employeeId },
          ...(params.userId ? [{ userId: params.userId }] : []),
        ],
      },
    });

    const shiftDay = await this.prisma.employeeShiftDay.findUnique({
      where: {
        employeeId_rosterDate: {
          employeeId: params.employeeId,
          rosterDate: startOfDay,
        },
      },
      include: { shift: true },
    });

    if (!existingRecord) {
      let lateMinutes = 0;
      let status = 'PRESENT';

      if (shiftDay && shiftDay.dayType === 'WORK' && shiftDay.shift) {
        const shiftStart = this.parseShiftTime(
          startOfDay,
          shiftDay.shift.startTime,
        );
        const graceTime = new Date(
          shiftStart.getTime() + shiftDay.shift.graceMinutes * 60000,
        );
        if (punchTime > graceTime) {
          lateMinutes = Math.floor(
            (punchTime.getTime() - shiftStart.getTime()) / 60000,
          );
          status = 'LATE';
        }
      }

      return this.prisma.attendanceRecord.create({
        data: {
          hospitalId: params.hospitalId,
          employeeId: params.employeeId,
          userId: params.userId ?? null,
          shiftId: shiftDay?.shiftId ?? null,
          date: startOfDay,
          checkIn: punchTime,
          source: params.source ?? 'ADMS',
          status,
          lateMinutes,
        },
      });
    }

    if (existingRecord.checkIn && punchTime > existingRecord.checkIn) {
      const grossMins =
        (punchTime.getTime() - existingRecord.checkIn.getTime()) / 60000;
      const netHours = Math.max(
        0,
        (grossMins - (existingRecord.tempLeaveMinutes || 0)) / 60,
      );
      return this.prisma.attendanceRecord.update({
        where: { id: existingRecord.id },
        data: {
          ...(!existingRecord.employeeId
            ? { employeeId: params.employeeId }
            : {}),
          ...(params.userId && !existingRecord.userId
            ? { userId: params.userId }
            : {}),
          checkOut: punchTime,
          workedHours: Money.toDbString(Money.roundDecimal(netHours, 3)),
        },
      });
    }
    return existingRecord;
  }
}

// // src/attendance/attendance.service.ts

// import { Injectable, Logger } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import { CreatePunchDto } from './dto/attendance.dto';

// @Injectable()
// export class AttendanceService {
//   private readonly logger = new Logger(AttendanceService.name);

//   constructor(private prisma: PrismaService) {}

//   // ... (أبقِ دالة processPunch و processBulkPunches كما هي دون تغيير) ...
//   // سأعيد كتابة parseShiftTime لأننا نحتاجها
//   private parseShiftTime(dateRef: Date, timeStr: string): Date {
//     const [h, m] = timeStr.split(':').map(Number);
//     const d = new Date(dateRef);
//     d.setHours(h, m, 0, 0);
//     return d;
//   }

//   async processPunch(dto: CreatePunchDto) {
//     const punchTime = new Date(dto.timestamp);
//     const startOfDay = new Date(punchTime);
//     startOfDay.setHours(0, 0, 0, 0);

//     const existingRecord = await this.prisma.attendanceRecord.findUnique({
//       where: { userId_date: { userId: dto.userId, date: startOfDay } },
//     });

//     const roster = await this.prisma.employeeRoster.findFirst({
//       where: { userId: dto.userId, date: startOfDay },
//       include: { shift: true },
//     });

//     if (!existingRecord) {
//       let lateMinutes = 0;
//       let status = 'PRESENT';

//       if (roster && !roster.isOffDay) {
//         const shiftStart = this.parseShiftTime(
//           startOfDay,
//           roster.shift.startTime,
//         );
//         const graceTime = new Date(
//           shiftStart.getTime() + roster.shift.graceMinutes * 60000,
//         );

//         if (punchTime > graceTime) {
//           const diffMs = punchTime.getTime() - shiftStart.getTime();
//           lateMinutes = Math.floor(diffMs / 60000);
//           status = 'LATE';
//         }
//       }

//       return this.prisma.attendanceRecord.create({
//         data: {
//           userId: dto.userId,
//           date: startOfDay,
//           checkIn: punchTime,
//           status,
//           lateMinutes,
//         },
//       });
//     } else {
//       if (existingRecord.checkIn && punchTime > existingRecord.checkIn) {
//         return this.prisma.attendanceRecord.update({
//           where: { id: existingRecord.id },
//           data: { checkOut: punchTime },
//         });
//       }
//       return existingRecord;
//     }
//   }

//   async processBulkPunches(punches: CreatePunchDto[]) {
//     // ... (الكود السابق كما هو)
//     let processed = 0;
//     let errors = 0;
//     const sortedPunches = punches.sort(
//       (a, b) =>
//         new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
//     );
//     for (const punch of sortedPunches) {
//       try {
//         const user = await this.prisma.user.findUnique({
//           where: { id: punch.userId },
//         });
//         if (user) {
//           await this.processPunch(punch);
//           processed++;
//         } else {
//           errors++;
//         }
//       } catch (e) {
//         errors++;
//       }
//     }
//     return { success: true, processed, errors };
//   }

//   async getRecords(
//     hospitalId: number,
//     dateFrom?: Date,
//     dateTo?: Date,
//     userId?: number,
//   ) {
//     // ... (الكود السابق كما هو)
//     const where: any = { user: { hospitalId } };
//     if (userId) where.userId = userId;
//     if (dateFrom || dateTo) {
//       where.date = {};
//       if (dateFrom) where.date.gte = dateFrom;
//       if (dateTo) where.date.lte = dateTo;
//     }
//     return this.prisma.attendanceRecord.findMany({
//       where,
//       include: {
//         user: { select: { id: true, fullName: true, username: true } },
//       },
//       orderBy: { date: 'desc' },
//     });
//   }

//   /**
//    * ✅ [NEW] المحرك التحليلي للحضور: حساب ملخص الشهر للموظف
//    * هذه الدالة هي "عقل" الرواتب، تحسب الغياب والتأخير والإضافي
//    */
//   async getEmployeeMonthlyStats(
//     userId: number,
//     startDate: Date,
//     endDate: Date,
//   ) {
//     // 1. جلب سجلات الحضور
//     const records = await this.prisma.attendanceRecord.findMany({
//       where: {
//         userId,
//         date: { gte: startDate, lte: endDate },
//       },
//     });

//     // 2. جلب الجدول (Roster) لمعرفة أيام العمل المفترضة
//     const rosters = await this.prisma.employeeRoster.findMany({
//       where: {
//         userId,
//         date: { gte: startDate, lte: endDate },
//       },
//       include: { shift: true },
//     });

//     let totalLateMinutes = 0;
//     let absentDays = 0;
//     let overtimeMinutes = 0;
//     let workDaysCount = 0;

//     // خريطة سريعة للبحث في السجلات
//     const recordsMap = new Map(
//       records.map((r) => [r.date.toISOString().slice(0, 10), r]),
//     );

//     // المرور على كل يوم في الشهر (أو الجدول المخطط)
//     for (const rosterItem of rosters) {
//       const dateKey = rosterItem.date.toISOString().slice(0, 10);
//       const record = recordsMap.get(dateKey);

//       if (rosterItem.isOffDay) {
//         // إذا داوم في يوم عطلة -> يحسب إضافي بالكامل
//         if (record && record.checkIn && record.checkOut) {
//           const duration =
//             (record.checkOut.getTime() - record.checkIn.getTime()) / 60000;
//           overtimeMinutes += duration;
//         }
//         continue;
//       }

//       workDaysCount++;

//       if (!record) {
//         // يوم عمل ولم يحضر -> غياب
//         absentDays++;
//       } else {
//         // حضر، نحسب التأخير والإضافي
//         totalLateMinutes += record.lateMinutes;

//         // حساب الإضافي (بعد ساعات الدوام)
//         // إذا خرج بعد وقت انتهاء الوردية بفترة معتبرة (مثلاً 30 دقيقة)
//         if (record.checkOut && rosterItem.shift) {
//           const shiftEnd = this.parseShiftTime(
//             rosterItem.date,
//             rosterItem.shift.endTime,
//           );
//           if (record.checkOut > shiftEnd) {
//             const extra =
//               (record.checkOut.getTime() - shiftEnd.getTime()) / 60000;
//             if (extra > 30) {
//               // فقط إذا زاد عن 30 دقيقة
//               overtimeMinutes += extra;
//             }
//           }
//         }
//       }
//     }

//     return {
//       totalLateMinutes,
//       absentDays,
//       overtimeHours: Math.floor(overtimeMinutes / 60),
//       workDaysCount,
//     };
//   }

//   /**
//    * حساب ملخص الحضور للموظف خلال فترة محددة
//    */
//   async getEmployeeMonthlyStats(
//     userId: number,
//     startDate: Date,
//     endDate: Date,
//   ) {
//     // 1. جلب سجلات الحضور الفعلي
//     const records = await this.prisma.attendanceRecord.findMany({
//       where: {
//         userId,
//         date: { gte: startDate, lte: endDate },
//       },
//     });

//     // 2. جلب جدول الموظف (Roster) لمعرفة أيام العمل المطلوبة
//     const rosters = await this.prisma.employeeRoster.findMany({
//       where: {
//         userId,
//         date: { gte: startDate, lte: endDate },
//       },
//     });

//     let totalLateMinutes = 0;
//     let absentDays = 0;

//     // خريطة للأيام التي حضر فيها الموظف
//     const attendedDays = new Set(
//       records.map((r) => r.date.toISOString().split('T')[0]),
//     );

//     // تحليل الغياب بناءً على الجدول (Roster)
//     for (const day of rosters) {
//       const dateStr = day.date.toISOString().split('T')[0];
//       if (!day.isOffDay && !attendedDays.has(dateStr)) {
//         absentDays++; // يوم عمل مجدول ولم يحضر
//       }
//     }

//     // مجموع دقائق التأخير
//     totalLateMinutes = records.reduce(
//       (sum, r) => sum + (r.lateMinutes || 0),
//       0,
//     );

//     return {
//       totalLateMinutes,
//       absentDays,
//     };
//   }
// }

// // src/attendance/attendance.service.ts

// import { Injectable, Logger } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
// import { CreatePunchDto } from './dto/attendance.dto';

// @Injectable()
// export class AttendanceService {
//   private readonly logger = new Logger(AttendanceService.name);

//   // مواعيد العمل الافتراضية (يمكن نقلها لاحقاً لجدول إعدادات في قاعدة البيانات)
//   private readonly SHIFT_START_HOUR = 8; // 8:00 AM
//   private readonly SHIFT_START_MINUTE = 0;

//   constructor(private prisma: PrismaService) {}

//   // دالة مساعدة لتحليل وقت "08:30" إلى كائن Date بناءً على يوم مرجعي
//   private parseShiftTime(dateRef: Date, timeStr: string): Date {
//     const [h, m] = timeStr.split(':').map(Number);
//     const d = new Date(dateRef);
//     d.setHours(h, m, 0, 0);
//     return d;
//   }

//   /**
//    * معالجة بصمة واحدة (تسجيل دخول أو تحديث خروج)
//    */
//   // async processPunch(dto: CreatePunchDto) {
//   //   const punchTime = new Date(dto.timestamp);

//   //   // 1. تحديد بداية اليوم ونهايته بناءً على وقت البصمة
//   //   const startOfDay = new Date(punchTime);
//   //   startOfDay.setHours(0, 0, 0, 0);

//   //   const endOfDay = new Date(punchTime);
//   //   endOfDay.setHours(23, 59, 59, 999);

//   //   // 2. البحث عن سجل موجود لهذا الموظف في هذا اليوم
//   //   const existingRecord = await this.prisma.attendanceRecord.findUnique({
//   //     where: {
//   //       userId_date: {
//   //         userId: dto.userId,
//   //         date: startOfDay,
//   //       },
//   //     },
//   //   });

//   //   if (!existingRecord) {
//   //     // 🟢 حالة جديدة: هذه أول بصمة في اليوم -> نعتبرها (Check-In)

//   //     // حساب التأخير
//   //     const shiftStart = new Date(startOfDay);
//   //     shiftStart.setHours(this.SHIFT_START_HOUR, this.SHIFT_START_MINUTE, 0, 0);

//   //     let lateMinutes = 0;
//   //     if (punchTime > shiftStart) {
//   //       const diffMs = punchTime.getTime() - shiftStart.getTime();
//   //       lateMinutes = Math.floor(diffMs / 60000); // تحويل لـ دقائق
//   //     }

//   //     return this.prisma.attendanceRecord.create({
//   //       data: {
//   //         userId: dto.userId,
//   //         date: startOfDay,
//   //         checkIn: punchTime,
//   //         checkOut: null, // لم يخرج بعد
//   //         status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
//   //         lateMinutes: lateMinutes,
//   //       },
//   //     });
//   //   } else {
//   //     // 🔴 سجل موجود: هذه بصمة لاحقة -> نحدثها كـ (Check-Out)
//   //     // المنطق: آخر بصمة في اليوم هي الخروج دائماً

//   //     // نتأكد أن البصمة الجديدة بعد البصمة المسجلة (وليست تكراراً بالخطأ)
//   //     if (existingRecord.checkIn && punchTime > existingRecord.checkIn) {
//   //       // تحديث وقت الخروج
//   //       // يمكن لاحقاً حساب ساعات العمل الإضافي هنا
//   //       return this.prisma.attendanceRecord.update({
//   //         where: { id: existingRecord.id },
//   //         data: {
//   //           checkOut: punchTime,
//   //         },
//   //       });
//   //     }

//   //     return existingRecord; // لا تغيير (بصمة قديمة أو مكررة)
//   //   }
//   // }

//   async processPunch(dto: CreatePunchDto) {
//     const punchTime = new Date(dto.timestamp);
//     const startOfDay = new Date(punchTime);
//     startOfDay.setHours(0, 0, 0, 0);

//     // 1. البحث عن سجل الحضور لليوم
//     const existingRecord = await this.prisma.attendanceRecord.findUnique({
//       where: { userId_date: { userId: dto.userId, date: startOfDay } },
//     });

//     // 2. جلب جدول الوردية لهذا الموظف في هذا اليوم (Roster)
//     const roster = await this.prisma.employeeRoster.findFirst({
//       where: { userId: dto.userId, date: startOfDay },
//       include: { shift: true },
//     });

//     if (!existingRecord) {
//       // -- تسجيل الدخول (Check-In) --

//       let lateMinutes = 0;
//       let status = 'PRESENT';

//       if (roster && !roster.isOffDay) {
//         // إذا كان لديه جدول، نحسب التأخير بناءً على وقت الوردية
//         const shiftStart = this.parseShiftTime(
//           startOfDay,
//           roster.shift.startTime,
//         );

//         // إضافة فترة السماحية (Grace Period)
//         const graceTime = new Date(
//           shiftStart.getTime() + roster.shift.graceMinutes * 60000,
//         );

//         if (punchTime > graceTime) {
//           const diffMs = punchTime.getTime() - shiftStart.getTime();
//           lateMinutes = Math.floor(diffMs / 60000);
//           status = 'LATE';
//         }
//       } else {
//         // إذا لم يكن لديه جدول (يوم عطلة أو لم يجدول)، نعتبره حضور عادي
//         // status = 'PRESENT';
//       }

//       return this.prisma.attendanceRecord.create({
//         data: {
//           userId: dto.userId,
//           date: startOfDay,
//           checkIn: punchTime,
//           status,
//           lateMinutes,
//         },
//       });
//     } else {
//       // -- تسجيل الخروج (Check-Out) --
//       if (existingRecord.checkIn && punchTime > existingRecord.checkIn) {
//         return this.prisma.attendanceRecord.update({
//           where: { id: existingRecord.id },
//           data: { checkOut: punchTime },
//         });
//       }
//       return existingRecord;
//     }
//   }

//   /**
//    * معالجة مجموعة بصمات (Bulk Import من أجهزة ZKTeco/Suprema)
//    */
//   async processBulkPunches(punches: CreatePunchDto[]) {
//     let processed = 0;
//     let errors = 0;

//     // ترتيب البصمات زمنياً لضمان دقة الدخول والخروج
//     const sortedPunches = punches.sort(
//       (a, b) =>
//         new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
//     );

//     for (const punch of sortedPunches) {
//       try {
//         // التأكد أن الموظف موجود في النظام
//         const user = await this.prisma.user.findUnique({
//           where: { id: punch.userId },
//         });
//         if (user) {
//           await this.processPunch(punch);
//           processed++;
//         } else {
//           this.logger.warn(
//             `User ID ${punch.userId} not found, skipping punch.`,
//           );
//           errors++;
//         }
//       } catch (e) {
//         this.logger.error(`Error processing punch for user ${punch.userId}`, e);
//         errors++;
//       }
//     }

//     return { success: true, processed, errors };
//   }

//   /**
//    * جلب سجلات الحضور لموظف أو للكل
//    */
//   async getRecords(
//     hospitalId: number,
//     dateFrom?: Date,
//     dateTo?: Date,
//     userId?: number,
//   ) {
//     const where: any = {
//       user: { hospitalId }, // تأكد أننا نجلب موظفي المستشفى فقط
//     };

//     if (userId) where.userId = userId;
//     if (dateFrom || dateTo) {
//       where.date = {};
//       if (dateFrom) where.date.gte = dateFrom;
//       if (dateTo) where.date.lte = dateTo;
//     }

//     return this.prisma.attendanceRecord.findMany({
//       where,
//       include: {
//         user: { select: { id: true, fullName: true, username: true } },
//       },
//       orderBy: { date: 'desc' },
//     });
//   }
// }
