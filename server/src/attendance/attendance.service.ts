// src/attendance/attendance.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePunchDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private prisma: PrismaService) {}

  private parseShiftTime(dateRef: Date, timeStr: string): Date {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(dateRef);
    d.setHours(h, m, 0, 0);
    return d;
  }

  async processPunch(dto: CreatePunchDto) {
    const punchTime = new Date(dto.timestamp);
    const startOfDay = new Date(punchTime);
    startOfDay.setHours(0, 0, 0, 0);

    const existingRecord = await this.prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId: dto.userId, date: startOfDay } },
    });

    const roster = await this.prisma.employeeRoster.findFirst({
      where: { userId: dto.userId, date: startOfDay },
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
          userId: dto.userId,
          date: startOfDay,
          checkIn: punchTime,
          status,
          lateMinutes,
        },
      });
    } else {
      if (existingRecord.checkIn && punchTime > existingRecord.checkIn) {
        return this.prisma.attendanceRecord.update({
          where: { id: existingRecord.id },
          data: { checkOut: punchTime },
        });
      }
      return existingRecord;
    }
  }

  async processBulkPunches(punches: CreatePunchDto[]) {
    let processed = 0;
    let errors = 0;
    const sortedPunches = punches.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    for (const punch of sortedPunches) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: punch.userId },
        });
        if (user) {
          await this.processPunch(punch);
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
    const where: any = { user: { hospitalId } };
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
  ) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
    });

    const rosters = await this.prisma.employeeRoster.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      include: { shift: true },
    });

    let totalLateMinutes = 0;
    let absentDays = 0;
    let overtimeMinutes = 0;
    let workDaysCount = 0;

    const recordsMap = new Map(
      records.map((r) => [r.date.toISOString().slice(0, 10), r]),
    );

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

      if (!record) {
        absentDays++;
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
