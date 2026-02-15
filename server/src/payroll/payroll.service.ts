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
              `يوجد كشف رواتب معتمد لشهر ${month}/${year}.`,
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

  async approvePayroll(hospitalId: number, id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findUnique({
        where: { id },
        include: { slips: true },
      });

      if (!run || run.hospitalId !== hospitalId)
        throw new NotFoundException('كشف الرواتب غير موجود.');
      if (run.status !== PayrollStatus.DRAFT)
        throw new BadRequestException('الكشف معتمد مسبقاً.');

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
    if (!run) throw new NotFoundException('الكشف غير موجود.');
    return run;
  }

  // ❌ حذف الكشف (مسموح فقط للـ DRAFT)
  async deletePayroll(hospitalId: number, id: number) {
    // 1. البحث عن الكشف والتأكد من تبعيته للمستشفى
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
    });

    if (!run || run.hospitalId !== hospitalId) {
      throw new NotFoundException('كشف الرواتب غير موجود.');
    }

    // 2. 🛡️ الحماية المالية: منع حذف الكشوفات المعتمدة نهائياً
    if (run.status === PayrollStatus.APPROVED) {
      throw new BadRequestException(
        'لا يمكن حذف كشف رواتب معتمد ومرحل للمالية. يرجى مراجعة المحاسب.',
      );
    }

    // 3. الحذف (بسبب وجود onDelete: Cascade في السكيما، سيتم حذف القسائم Slips تلقائياً)
    return this.prisma.payrollRun.delete({
      where: { id },
    });
  }
}
