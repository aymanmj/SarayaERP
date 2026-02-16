// src/financial-years/financial-years.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialYearStatus } from '@prisma/client';

// ✅ دالة لتحويل تاريخ نصي (YYYY-MM-DD أو ISO تحتوي على ذلك) إلى Date عند منتصف الليل UTC
function parseDateOnlyToUtc(dateStr: string): Date {
  if (!dateStr) {
    throw new BadRequestException('صيغة التاريخ غير صحيحة.');
  }

  // لو جاء التاريخ بصيغة ISO نأخذ الجزء قبل الـ T
  const normalized = dateStr.trim().split('T')[0];

  const [yearStr, monthStr, dayStr] = normalized.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1..12
  const day = Number(dayStr);

  if (!year || !month || !day) {
    throw new BadRequestException('صيغة التاريخ غير صحيحة.');
  }

  // Date.UTC يستخدم الشهر من 0..11
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

// ✅ تطبيع أي Date إلى بداية اليوم UTC (تجاهل الوقت تماماً)
function startOfDayUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

@Injectable()
export class FinancialYearsService {
  constructor(private prisma: PrismaService) {}

  // قائمة السنوات المالية للمستشفى
  async listYears(hospitalId: number) {
    return this.prisma.financialYear.findMany({
      where: {
        hospitalId,
        deletedAt: null,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  // إنشاء سنة مالية جديدة (التخزين على أساس تاريخ فقط في منتصف الليل UTC)
  async createYear(params: {
    hospitalId: number;
    userId: number;
    year: number;
    name?: string;
    description?: string;
    startDate: string; // متوقع: "YYYY-MM-DD" أو ISO يحتويها
    endDate: string; // متوقع: "YYYY-MM-DD" أو ISO يحتويها
  }) {
    const { hospitalId, userId, year, name, startDate, endDate } = params;

    // ✅ تحويل التواريخ إلى UTC (تاريخ فقط)
    const start = parseDateOnlyToUtc(startDate);
    const end = parseDateOnlyToUtc(endDate);

    if (end <= start) {
      throw new BadRequestException(
        'تاريخ نهاية السنة يجب أن يكون بعد تاريخ البداية.',
      );
    }

    // التحقق من عدم وجود تضارب في الفترات (بشكل مبسط)
    const overlapping = await this.prisma.financialYear.findFirst({
      where: {
        hospitalId,
        deletedAt: null,
        OR: [
          {
            startDate: { lte: end },
            endDate: { gte: start },
          },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException(
        'يوجد سنة مالية أخرى تتقاطع مع هذه الفترة الزمنية.',
      );
    }

    // ملاحظة: لا نرسل year إلى Prisma لأن الموديل لا يحتوي هذا العمود
    return this.prisma.financialYear.create({
      data: {
        hospitalId,
        name: name || `السنة المالية ${year}`,
        code: `FY-${year}`, // أو أي نمط تسميات تفضله
        // removed description because it's not present in the Prisma model
        startDate: start, // ✅ تاريخ بداية السنة في منتصف الليل UTC
        endDate: end, // ✅ تاريخ نهاية السنة في منتصف الليل UTC
        status: FinancialYearStatus.OPEN,
        isCurrent: false,
        createdById: userId,
      },
    });
  }

  // تحديث حالة السنة المالية + جعلها السنة الحالية (اختياري)
  async updateYearStatus(params: {
    hospitalId: number;
    yearId: number;
    userId: number;
    status?: FinancialYearStatus;
    isCurrent?: boolean;
  }) {
    const fy = await this.prisma.financialYear.findFirst({
      where: {
        id: params.yearId,
        hospitalId: params.hospitalId,
        deletedAt: null,
      },
    });

    if (!fy) throw new NotFoundException('السنة المالية غير موجودة.');

    return this.prisma.$transaction(async (tx) => {
      // لو طلب يجعلها الحالية، نخلي كل السنوات الأخرى isCurrent = false
      if (params.isCurrent === true) {
        await tx.financialYear.updateMany({
          where: {
            hospitalId: params.hospitalId,
          },
          data: {
            isCurrent: false,
          },
        });
      }

      const updated = await tx.financialYear.update({
        where: { id: fy.id },
        data: {
          status: params.status ?? fy.status,
          isCurrent: params.isCurrent ?? fy.isCurrent,
          updatedById: params.userId,
        },
      });

      return updated;
    });
  }

  // جلب الفترات (الشهور) لسنة مالية
  async listPeriods(hospitalId: number, yearId: number) {
    const fy = await this.prisma.financialYear.findFirst({
      where: { id: yearId, hospitalId, deletedAt: null },
    });
    if (!fy) throw new NotFoundException('السنة المالية غير موجودة.');

    return this.prisma.financialPeriod.findMany({
      where: {
        financialYearId: fy.id,
        deletedAt: null,
      },
      orderBy: { periodIndex: 'asc' },
    });
  }

  // توليد فترات شهرية تلقائيًا لسنة مالية (باستخدام UTC)
  async generateMonthlyPeriods(
    hospitalId: number,
    yearId: number,
    userId: number,
  ) {
    const fy = await this.prisma.financialYear.findFirst({
      where: { id: yearId, hospitalId, deletedAt: null },
    });
    if (!fy) throw new NotFoundException('السنة المالية غير موجودة.');

    const existing = await this.prisma.financialPeriod.count({
      where: { financialYearId: fy.id, deletedAt: null },
    });
    if (existing > 0) {
      throw new BadRequestException(
        'تم إنشاء فترات مسبقًا لهذه السنة المالية.',
      );
    }

    // ✅ نطبع حدود السنة إلى بداية اليوم UTC
    const start = startOfDayUtc(fy.startDate);
    const end = startOfDayUtc(fy.endDate);

    const periodsData: {
      financialYearId: number;
      periodIndex: number;
      periodCode: string;
      monthStartDate: Date;
      monthEndDate: Date;
      numberOfDays: number;
      payrollStartDate: Date;
      payrollEndDate: Date;
      createdById: number;
    }[] = [];

    let current = new Date(start); // بداية أول شهر
    let index = 1;

    const msPerDay = 1000 * 60 * 60 * 24;

    while (current <= end && index <= 24) {
      const year = current.getUTCFullYear();
      const month = current.getUTCMonth(); // 0..11

      // بداية الشهر على منتصف الليل UTC
      const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

      // نهاية الشهر (اليوم الأخير) على منتصف الليل UTC
      const monthEnd = new Date(Date.UTC(year, month + 1, 0, 0, 0, 0));

      // قصّ النهاية لو تعدّت نهاية السنة
      const effectiveEnd = monthEnd > end ? end : monthEnd;

      const periodCode = `${monthStart.getUTCFullYear()}-${String(
        monthStart.getUTCMonth() + 1,
      ).padStart(2, '0')}`;

      const numberOfDays =
        Math.round((effectiveEnd.getTime() - monthStart.getTime()) / msPerDay) +
        1;

      periodsData.push({
        financialYearId: fy.id,
        periodIndex: index,
        periodCode,
        monthStartDate: monthStart,
        monthEndDate: effectiveEnd,
        numberOfDays,
        payrollStartDate: monthStart,
        payrollEndDate: effectiveEnd,
        createdById: userId,
      });

      // الانتقال لأول يوم من الشهر التالي (UTC)
      current = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
      index++;

      if (monthEnd >= end) break;
    }

    await this.prisma.financialPeriod.createMany({
      data: periodsData,
    });

    return this.listPeriods(hospitalId, yearId);
  }

  // فتح فترة مالية
  async openPeriod(hospitalId: number, periodId: number, userId: number) {
    const period = await this.prisma.financialPeriod.findFirst({
      where: { id: periodId, deletedAt: null },
      include: { financialYear: true },
    });

    if (!period || period.financialYear.hospitalId !== hospitalId) {
      throw new NotFoundException('الفترة المالية غير موجودة.');
    }

    if (period.financialYear.status !== FinancialYearStatus.OPEN) {
      throw new BadRequestException('لا يمكن فتح فترة في سنة مالية مقفلة.');
    }

    return this.prisma.financialPeriod.update({
      where: { id: periodId },
      data: {
        isOpen: true,
        updatedById: userId,
      },
    });
  }

  // إغلاق فترة مالية
  async closePeriod(hospitalId: number, periodId: number, userId: number) {
    const period = await this.prisma.financialPeriod.findFirst({
      where: { id: periodId, deletedAt: null },
      include: { financialYear: true },
    });

    if (!period || period.financialYear.hospitalId !== hospitalId) {
      throw new NotFoundException('الفترة المالية غير موجودة.');
    }

    if (period.financialYear.status !== FinancialYearStatus.OPEN) {
      throw new BadRequestException('لا يمكن تعديل فترات سنة مالية مقفلة.');
    }

    return this.prisma.financialPeriod.update({
      where: { id: periodId },
      data: {
        isOpen: false,
        updatedById: userId,
      },
    });
  }

  // جلب السنة المالية الحالية (مفتوحة)
  async getCurrentYearOrThrow(hospitalId: number) {
    const fy = await this.prisma.financialYear.findFirst({
      where: {
        hospitalId,
        isCurrent: true,
        status: FinancialYearStatus.OPEN,
        deletedAt: null,
      },
    });

    if (!fy) {
      throw new BadRequestException(
        'لا توجد سنة مالية حالية مفتوحة. يرجى تعيين سنة حالية أولاً.',
      );
    }

    return fy;
  }

  async getCurrentYearNullable(hospitalId: number) {
    return this.prisma.financialYear.findFirst({
      where: {
        hospitalId,
        isCurrent: true,
        status: FinancialYearStatus.OPEN,
        deletedAt: null,
      },
    });
  }

  // 🔍 إيجاد سنة مالية حالية مفتوحة + فترة مفتوحة تشمل التاريخ (باستخدام UTC)
  async getOpenPeriodForDate(hospitalId: number, date: Date) {
    // نطبع التاريخ إلى بداية اليوم UTC (تجاهل الوقت)
    const target = startOfDayUtc(date);

    // 1) نجيب السنة المالية الحالية المفتوحة التي تغطي هذا التاريخ
    const fy = await this.prisma.financialYear.findFirst({
      where: {
        hospitalId,
        deletedAt: null,
        status: FinancialYearStatus.OPEN,
        isCurrent: true,
        startDate: { lte: target },
        endDate: { gte: target },
      },
    });

    if (!fy) {
      throw new BadRequestException(
        'لا توجد سنة مالية حالية مفتوحة تشمل هذا التاريخ.',
      );
    }

    // 2) نبحث عن فترة (شهر) مفتوحة تغطي هذا التاريخ
    const period = await this.prisma.financialPeriod.findFirst({
      where: {
        financialYearId: fy.id,
        deletedAt: null,
        isOpen: true,
        monthStartDate: { lte: target },
        monthEndDate: { gte: target },
      },
      orderBy: { periodIndex: 'asc' },
    });

    if (!period) {
      throw new BadRequestException(
        'لا توجد فترة (شهر) مفتوحة تشمل هذا التاريخ في هذه السنة المالية.',
      );
    }

    return { fy, period };
  }
}
