// src/payroll/payroll.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { AttendanceService } from '../attendance/attendance.service';
import {
  PayrollStatus,
  SystemAccountKey,
  AccountingSourceModule,
  InvoiceStatus,
} from '@prisma/client';
import { Money } from '../common/utils/money.util'; // ✅ [NEW] استيراد Money Utility

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
    private attendanceService: AttendanceService,
  ) {}

  /**
   * 1. توليد مسير الرواتب (Generation)
   * ✅ تم تحديثه لاستخدام Money Utility للدقة العالية
   */
  // async generatePayroll(
  //   hospitalId: number,
  //   userId: number,
  //   month: number,
  //   year: number,
  // ) {
  //   return this.prisma.$transaction(
  //     async (tx) => {
  //       // التحقق من عدم التكرار
  //       const existing = await tx.payrollRun.findUnique({
  //         where: { hospitalId_month_year: { hospitalId, month, year } },
  //       });
  //       if (existing) {
  //         // إذا كان مسودة، نحذفه ونعيد إنشاؤه (Re-run)
  //         if (existing.status === 'DRAFT') {
  //           await tx.payrollSlip.deleteMany({
  //             where: { payrollRunId: existing.id },
  //           });
  //           await tx.payrollRun.delete({ where: { id: existing.id } });
  //         } else {
  //           throw new BadRequestException(
  //             `يوجد مسير رواتب معتمد لشهر ${month}/${year} لا يمكن إعادة توليده.`,
  //           );
  //         }
  //       }

  //       const employees = await tx.user.findMany({
  //         where: { hospitalId, isActive: true, isDeleted: false },
  //       });

  //       if (employees.length === 0)
  //         throw new BadRequestException('لا يوجد موظفين نشطين.');

  //       const startDate = new Date(year, month - 1, 1);
  //       const endDate = new Date(year, month, 0, 23, 59, 59);

  //       // إنشاء رأس المسير
  //       const run = await tx.payrollRun.create({
  //         data: {
  //           hospitalId,
  //           month,
  //           year,
  //           status: PayrollStatus.DRAFT,
  //           createdById: userId,
  //         },
  //       });

  //       let grandBasic = 0;
  //       let grandAllowances = 0;
  //       let grandDeductions = 0;
  //       let grandNet = 0;

  //       for (const emp of employees) {
  //         // ✅ استخدام Money.fromPrisma للتحويل الآمن من Prisma Decimal
  //         const basic = Money.fromPrisma(emp.basicSalary);
  //         const housing = Money.fromPrisma(emp.housingAllowance);
  //         const transport = Money.fromPrisma(emp.transportAllowance);
  //         const other = Money.fromPrisma(emp.otherAllowance);

  //         // 📊 1. جلب إحصائيات الحضور لهذا الموظف
  //         const stats = await this.attendanceService.getEmployeeMonthlyStats(
  //           emp.id,
  //           startDate,
  //           endDate,
  //         );

  //         // 🧮 2. معادلات الاحتساب (Calculation Engine) - باستخدام Money Utility
  //         const dailyRate = Money.dailyRate(basic);
  //         const hourlyRate = Money.hourlyRate(dailyRate);

  //         // أ) خصم الغياب (يوم بيوم)
  //         const absentDeduction = Money.mul(stats.absentDays, dailyRate);

  //         // ب) خصم التأخير (الدقيقة بدقيقة)
  //         const minuteRate = Money.minuteRate(hourlyRate);
  //         const lateDeduction = Money.mul(stats.totalLateMinutes, minuteRate);

  //         // ج) العمل الإضافي (الساعة بساعة ونصف - 150%)
  //         const overtimePay = Money.mul(
  //           Money.mul(stats.overtimeHours, hourlyRate),
  //           1.5,
  //         );

  //         // د) عمولة الأطباء (Revenue Share)
  //         let commission = 0;
  //         const commissionRate = Money.fromPrisma(emp.commissionRate);

  //         if (emp.isDoctor && Money.gt(commissionRate, 0)) {
  //           const charges = await tx.encounterCharge.aggregate({
  //             where: {
  //               hospitalId,
  //               performerId: emp.id,
  //               createdAt: { gte: startDate, lte: endDate },
  //             },
  //             _sum: { totalAmount: true },
  //           });
  //           const totalRevenue = Money.fromPrisma(charges._sum.totalAmount);
  //           commission = Money.rate(totalRevenue, commissionRate);
  //         }

  //         // 💰 التجميع باستخدام Money Utility
  //         // إجمالي الخصومات = غياب + تأخير
  //         const totalDeductionsLine = Money.toDb(
  //           Money.add(absentDeduction, lateDeduction),
  //         );

  //         // إجمالي البدلات والإضافي = بدلات + عمولة + إضافي
  //         const totalAdditions = Money.toDb(
  //           Money.sum(housing, transport, other, commission, overtimePay),
  //         );

  //         // صافي الراتب = أساسي + إضافات - خصومات
  //         const net = Money.toDb(
  //           Money.sub(Money.add(basic, totalAdditions), totalDeductionsLine),
  //         );

  //         await tx.payrollSlip.create({
  //           data: {
  //             payrollRunId: run.id,
  //             userId: emp.id,
  //             basicSalary: Money.toDb(basic),
  //             housingAllowance: Money.toDb(housing),
  //             transportAllowance: Money.toDb(transport),
  //             // دمجنا الإضافي والعمولة هنا للعرض
  //             otherAllowance: Money.toDb(
  //               Money.sum(other, commission, overtimePay),
  //             ),
  //             deductions: totalDeductionsLine,
  //             netSalary: net,
  //           },
  //         });

  //         // تجميع الإجماليات
  //         grandBasic = Money.add(grandBasic, basic);
  //         grandAllowances = Money.add(grandAllowances, totalAdditions);
  //         grandDeductions = Money.add(grandDeductions, totalDeductionsLine);
  //         grandNet = Money.add(grandNet, net);
  //       }

  //       // تحديث الإجماليات بالدقة العالية
  //       return tx.payrollRun.update({
  //         where: { id: run.id },
  //         data: {
  //           totalBasic: Money.toDb(grandBasic),
  //           totalAllowances: Money.toDb(grandAllowances),
  //           totalDeductions: Money.toDb(grandDeductions),
  //           totalNet: Money.toDb(grandNet),
  //         },
  //       });
  //     },
  //     { timeout: 60000 }, // زيادة الوقت للمعالجة الثقيلة
  //   );
  // }

  async generatePayroll(
    hospitalId: number,
    userId: number,
    month: number,
    year: number,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.payrollRun.findUnique({
          where: { hospitalId_month_year: { hospitalId, month, year } },
        });

        if (existing) {
          if (existing.status === PayrollStatus.DRAFT) {
            await tx.payrollSlip.deleteMany({
              where: { payrollRunId: existing.id },
            });
            await tx.payrollRun.delete({ where: { id: existing.id } });
          } else {
            throw new BadRequestException(
              `يوجد مسير رواتب معتمد لشهر ${month}/${year}.`,
            );
          }
        }

        const employees = await tx.user.findMany({
          where: { hospitalId, isActive: true, isDeleted: false },
        });

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const run = await tx.payrollRun.create({
          data: {
            hospitalId,
            month,
            year,
            status: PayrollStatus.DRAFT,
            createdById: userId,
          },
        });

        let grandTotals = { basic: 0, allowances: 0, deductions: 0, net: 0 };

        for (const emp of employees) {
          const stats = await this.attendanceService.getEmployeeMonthlyStats(
            emp.id,
            startDate,
            endDate,
          );

          // 🧮 الحسابات الأساسية
          const basic = Money.fromPrisma(emp.basicSalary);
          const housing = Money.fromPrisma(emp.housingAllowance);
          const transport = Money.fromPrisma(emp.transportAllowance);
          const otherBase = Money.fromPrisma(emp.otherAllowance);

          const dailyRate = Money.dailyRate(basic);
          const hourlyRate = Money.hourlyRate(dailyRate);
          const minuteRate = Money.minuteRate(hourlyRate);

          // 1. الخصومات (غياب + تأخير)
          const absentDeduction = Money.mul(stats.absentDays, dailyRate);
          const lateDeduction = Money.mul(stats.totalLateMinutes, minuteRate);
          const totalDeductions = Money.toDb(
            Money.add(absentDeduction, lateDeduction),
          );

          // 2. الإضافات (إضافي + عمولة أطباء)
          const overtimePay = Money.mul(
            Money.mul(stats.overtimeHours, hourlyRate),
            1.5,
          );

          let commission = 0;
          if (emp.isDoctor && Money.gt(emp.commissionRate, 0)) {
            const revenue = await tx.encounterCharge.aggregate({
              where: {
                hospitalId,
                performerId: emp.id,
                createdAt: { gte: startDate, lte: endDate },
                // ✅ نحسب العمولة فقط على الخدمات التي صدرت بها فاتورة وليست ملغاة
                invoice: { status: { not: InvoiceStatus.CANCELLED } },
              },
              _sum: { totalAmount: true },
            });
            commission = Money.rate(
              Money.fromPrisma(revenue._sum.totalAmount),
              Money.fromPrisma(emp.commissionRate),
            );
          }

          const totalAdditions = Money.toDb(
            Money.sum(housing, transport, otherBase, commission, overtimePay),
          );
          const net = Money.toDb(
            Money.sub(Money.add(basic, totalAdditions), totalDeductions),
          );

          await tx.payrollSlip.create({
            data: {
              payrollRunId: run.id,
              userId: emp.id,
              basicSalary: Money.toDb(basic),
              housingAllowance: Money.toDb(housing),
              transportAllowance: Money.toDb(transport),
              otherAllowance: totalAdditions, // يشمل العلاوات والعمولة والإضافي
              deductions: totalDeductions,
              netSalary: net,
              commissionAmount: Money.toDb(commission),
            },
          });

          grandTotals.basic = Money.add(grandTotals.basic, basic);
          grandTotals.allowances = Money.add(
            grandTotals.allowances,
            totalAdditions,
          );
          grandTotals.deductions = Money.add(
            grandTotals.deductions,
            totalDeductions,
          );
          grandTotals.net = Money.add(grandTotals.net, net);
        }

        return tx.payrollRun.update({
          where: { id: run.id },
          data: {
            totalBasic: Money.toDb(grandTotals.basic),
            totalAllowances: Money.toDb(grandTotals.allowances),
            totalDeductions: Money.toDb(grandTotals.deductions),
            totalNet: Money.toDb(grandTotals.net),
          },
        });
      },
      { timeout: 60000 },
    );
  }

  /**
   * 2. اعتماد المسير (Approval & Accounting)
   */
  // async approvePayroll(hospitalId: number, id: number, userId: number) {
  //   return this.prisma.$transaction(async (tx) => {
  //     const run = await tx.payrollRun.findUnique({
  //       where: { id },
  //       include: { slips: true },
  //     });

  //     if (!run || run.hospitalId !== hospitalId)
  //       throw new NotFoundException('مسير الرواتب غير موجود.');
  //     if (run.status !== PayrollStatus.DRAFT)
  //       throw new BadRequestException(
  //         'يمكن اعتماد المسيرات التي في حالة (مسودة) فقط.',
  //       );

  //     // 🔍 التحقق من مطابقة البيانات (Data Integrity Check)
  //     const slipsNetSum = run.slips.reduce(
  //       (sum, s) => sum + Number(s.netSalary),
  //       0,
  //     );
  //     if (Math.abs(slipsNetSum - Number(run.totalNet)) > 0.1) {
  //       throw new BadRequestException(
  //         'خطأ في توازن المسير: مجموع القسائم لا يساوي الإجمالي. يرجى إعادة توليد المسير.',
  //       );
  //     }

  //     // 📅 جلب الفترة المالية المفتوحة بناءً على تاريخ المسير
  //     const payrollDate = new Date(run.year, run.month - 1, 28); // نفترض قيد الرواتب يوم 28
  //     const { fy, period } = await this.accounting.getOpenPeriodForDate(
  //       hospitalId,
  //       payrollDate,
  //     );

  //     // 💰 جلب الحسابات النظامية
  //     const expenseAcc = await this.accounting.getSystemAccountOrThrow(
  //       hospitalId,
  //       SystemAccountKey.SALARIES_EXPENSE,
  //       tx,
  //     );
  //     const payableAcc = await this.accounting.getSystemAccountOrThrow(
  //       hospitalId,
  //       SystemAccountKey.SALARIES_PAYABLE,
  //       tx,
  //     );

  //     const netAmount = Number(run.totalNet);

  //     // 📝 إنشاء القيد المحاسبي
  //     const entry = await tx.accountingEntry.create({
  //       data: {
  //         hospitalId,
  //         entryDate: payrollDate,
  //         financialYearId: fy.id,
  //         financialPeriodId: period.id,
  //         sourceModule: AccountingSourceModule.PAYROLL,
  //         sourceId: run.id,
  //         description: `إستحقاق رواتب شهر ${run.month}/${run.year}`,
  //         createdById: userId,
  //         lines: {
  //           create: [
  //             {
  //               accountId: expenseAcc.id,
  //               debit: netAmount,
  //               credit: 0,
  //               description: 'مصروف الرواتب والبدلات',
  //             },
  //             {
  //               accountId: payableAcc.id,
  //               debit: 0,
  //               credit: netAmount,
  //               description: 'صافي الرواتب المستحقة للموظفين',
  //             },
  //           ],
  //         },
  //       },
  //     });

  //     // تحديث حالة المسير وربطه بالقيد
  //     return tx.payrollRun.update({
  //       where: { id: run.id },
  //       data: {
  //         status: PayrollStatus.APPROVED,
  //         accountingEntryId: entry.id,
  //         approvedById: userId,
  //       },
  //     });
  //   });
  // }

  // async approvePayroll(hospitalId: number, id: number, userId: number) {
  //   return this.prisma.$transaction(async (tx) => {
  //     const run = await tx.payrollRun.findUnique({
  //       where: { id },
  //       include: { slips: true },
  //     });

  //     if (!run || run.hospitalId !== hospitalId)
  //       throw new NotFoundException('مسير الرواتب غير موجود.');
  //     if (run.status !== PayrollStatus.DRAFT)
  //       throw new BadRequestException(
  //         'يمكن اعتماد المسيرات التي في حالة (مسودة) فقط.',
  //       );

  //     const payrollDate = new Date(run.year, run.month - 1, 28);
  //     const { fy, period } = await this.accounting.getOpenPeriodForDate(
  //       hospitalId,
  //       payrollDate,
  //     );

  //     const expenseAcc = await this.accounting.getSystemAccountOrThrow(
  //       hospitalId,
  //       SystemAccountKey.SALARIES_EXPENSE,
  //       tx,
  //     );
  //     const payableAcc = await this.accounting.getSystemAccountOrThrow(
  //       hospitalId,
  //       SystemAccountKey.SALARIES_PAYABLE,
  //       tx,
  //     );

  //     const netAmount = Number(run.totalNet);

  //     const entry = await tx.accountingEntry.create({
  //       data: {
  //         hospitalId,
  //         entryDate: payrollDate,
  //         financialYearId: fy.id,
  //         financialPeriodId: period.id,
  //         sourceModule: AccountingSourceModule.PAYROLL,
  //         sourceId: run.id,
  //         description: `إستحقاق رواتب شهر ${run.month}/${run.year}`,
  //         createdById: userId,
  //         lines: {
  //           create: [
  //             {
  //               accountId: expenseAcc.id,
  //               debit: netAmount,
  //               credit: 0,
  //               description: 'مصروف الرواتب والبدلات',
  //             },
  //             {
  //               accountId: payableAcc.id,
  //               debit: 0,
  //               credit: netAmount,
  //               description: 'صافي الرواتب المستحقة للموظفين',
  //             },
  //           ],
  //         },
  //       },
  //     });

  //     return tx.payrollRun.update({
  //       where: { id: run.id },
  //       data: {
  //         status: PayrollStatus.APPROVED,
  //         accountingEntryId: entry.id,
  //         approvedById: userId,
  //       },
  //     });
  //   });
  // }

  async approvePayroll(hospitalId: number, id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findUnique({
        where: { id },
        include: { slips: true },
      });

      if (!run || run.hospitalId !== hospitalId)
        throw new NotFoundException('مسير الرواتب غير موجود.');
      if (run.status !== PayrollStatus.DRAFT)
        throw new BadRequestException('المسير معتمد مسبقاً.');

      const payrollDate = new Date(run.year, run.month - 1, 28);
      const { fy, period } = await this.accounting.getOpenPeriodForDate(
        hospitalId,
        payrollDate,
      );

      const expenseAcc = await this.accounting.getSystemAccountOrThrow(
        hospitalId,
        SystemAccountKey.SALARIES_EXPENSE,
        tx,
      );
      const payableAcc = await this.accounting.getSystemAccountOrThrow(
        hospitalId,
        SystemAccountKey.SALARIES_PAYABLE,
        tx,
      );

      const netAmount = Number(run.totalNet);

      const entry = await tx.accountingEntry.create({
        data: {
          hospitalId,
          entryDate: payrollDate,
          financialYearId: fy.id,
          financialPeriodId: period.id,
          sourceModule: AccountingSourceModule.PAYROLL,
          sourceId: run.id,
          description: `إستحقاق رواتب شهر ${run.month}/${run.year}`,
          createdById: userId,
          lines: {
            create: [
              {
                accountId: expenseAcc.id,
                debit: netAmount,
                credit: 0,
                description: 'مصروف الرواتب والبدلات',
              },
              {
                accountId: payableAcc.id,
                debit: 0,
                credit: netAmount,
                description: 'صافي الرواتب المستحقة',
              },
            ],
          },
        },
      });

      return tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: PayrollStatus.APPROVED,
          accountingEntryId: entry.id,
          approvedById: userId,
        },
      });
    });
  }

  async findAll(hospitalId: number) {
    return this.prisma.payrollRun.findMany({
      where: { hospitalId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async findOne(hospitalId: number, id: number) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, hospitalId },
      include: {
        slips: {
          include: {
            user: {
              select: { fullName: true, username: true, basicSalary: true },
            },
          },
          orderBy: { user: { fullName: 'asc' } },
        },
      },
    });
    if (!run) throw new NotFoundException('المسير غير موجود.');
    return run;
  }

  // ❌ حذف المسير (مسموح فقط للـ DRAFT)
  async deletePayroll(hospitalId: number, id: number) {
    // 1. البحث عن المسير والتأكد من تبعيته للمستشفى
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
    });

    if (!run || run.hospitalId !== hospitalId) {
      throw new NotFoundException('مسير الرواتب غير موجود.');
    }

    // 2. 🛡️ الحماية المالية: منع حذف المسيرات المعتمدة نهائياً
    if (run.status === PayrollStatus.APPROVED) {
      throw new BadRequestException(
        'لا يمكن حذف مسير رواتب معتمد ومرحل للمالية. يرجى مراجعة المحاسب.',
      );
    }

    // 3. الحذف (بسبب وجود onDelete: Cascade في السكيما، سيتم حذف القسائم Slips تلقائياً)
    return this.prisma.payrollRun.delete({
      where: { id },
    });
  }

  // async deletePayroll(hospitalId: number, id: number) {
  //   const run = await this.prisma.payrollRun.findUnique({ where: { id } });
  //   if (!run || run.hospitalId !== hospitalId) throw new NotFoundException();
  //   if (run.status !== PayrollStatus.DRAFT)
  //     throw new BadRequestException('لا يمكن حذف مسير رواتب معتمد.');

  //   return this.prisma.payrollRun.delete({ where: { id } });
  // }
}
