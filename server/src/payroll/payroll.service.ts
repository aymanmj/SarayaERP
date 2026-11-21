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
import { CommissionService } from '../commission/commission.service';
import {
  PayrollStatus,
  SystemAccountKey,
  AccountingSourceModule,
  InvoiceStatus,
  ServiceType,
  ChargeSource,
  SurgeryStatus,
} from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { financialPeriod } from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
    private attendanceService: AttendanceService,
    private commissionService: CommissionService,
  ) {}

  async generatePayroll(
    hospitalId: number,
    userId: number,
    month: number,
    year: number,
  ) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException(
        'الشهر يجب أن يكون رقماً صحيحاً بين 1 و 12.',
      );
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('السنة يجب أن تكون رقماً صحيحاً صالحاً.');
    }

    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(
      async (tx) => {
        committedAudit = null;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(27006, ${hospitalId}::int)`;

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
          orderBy: { id: 'asc' },
        });

        const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

        const run = await tx.payrollRun.create({
          data: {
            hospitalId,
            month,
            year,
            status: PayrollStatus.DRAFT,
            createdById: userId,
          },
        });

        let totalBasicDec = Money.decimal(0);
        let totalAllowancesDec = Money.decimal(0);
        let totalDeductionsDec = Money.decimal(0);
        let totalNetDec = Money.decimal(0);

        for (const emp of employees) {
          const stats = await this.attendanceService.getEmployeeMonthlyStats(
            emp.id,
            startDate,
            endDate,
            tx,
          );

          // 🧮 الحسابات الأساسية بدقة Money Decimal
          const basicDec = Money.roundDecimal(emp.basicSalary ?? 0);
          const housingDec = Money.roundDecimal(emp.housingAllowance ?? 0);
          const transportDec = Money.roundDecimal(emp.transportAllowance ?? 0);
          const otherBaseDec = Money.roundDecimal(emp.otherAllowance ?? 0);

          const dailyRateDec = Money.divide(basicDec, 30);
          const hourlyRateDec = Money.divide(dailyRateDec, 8);
          const minuteRateDec = Money.divide(hourlyRateDec, 60);

          // 1. الخصومات (غياب + تأخير)
          const absentDeductionDec = Money.multiply(
            stats.absentDays,
            dailyRateDec,
          );
          const lateDeductionDec = Money.multiply(
            stats.totalLateMinutes,
            minuteRateDec,
          );
          const totalDeductionsSlipDec = Money.roundDecimal(
            Money.addDecimal(absentDeductionDec, lateDeductionDec),
          );

          // 2. الإضافات (إضافي + عمولات جراحية + عمولات خدمات الأطباء)
          const overtimePayDec = Money.roundDecimal(
            Money.multiply(
              Money.multiply(stats.overtimeHours, hourlyRateDec),
              '1.5',
            ),
          );

          // 2.أ عمولات الطاقم الجراحي للحالات المكتملة في الشهر
          const surgeryTeamEntries = await tx.surgeryTeam.findMany({
            where: {
              userId: emp.id,
              commissionAmount: { gt: 0 },
              surgeryCase: {
                hospitalId,
                status: SurgeryStatus.COMPLETED,
                OR: [
                  { actualEnd: { gte: startDate, lte: endDate } },
                  {
                    actualEnd: null,
                    scheduledStart: { gte: startDate, lte: endDate },
                  },
                ],
              },
            },
            select: { surgeryCaseId: true, commissionAmount: true },
          });

          const coveredSurgeryCaseIds = new Set(
            surgeryTeamEntries.map((s) => s.surgeryCaseId),
          );
          const surgeryCommissionDec = surgeryTeamEntries.length
            ? Money.sumPosted(
                ...surgeryTeamEntries.map((s) => s.commissionAmount ?? 0),
              )
            : Money.decimal(0);

          // 2.ب عمولات الأطباء على البنود المفوترة غير الملغاة
          let chargesCommissionDec = Money.decimal(0);
          if (emp.isDoctor) {
            const doctorCharges = await tx.encounterCharge.findMany({
              where: {
                hospitalId,
                performerId: emp.id,
                createdAt: { gte: startDate, lte: endDate },
                invoice: { status: { not: InvoiceStatus.CANCELLED } },
              },
              select: {
                sourceType: true,
                sourceId: true,
                totalAmount: true,
                serviceItem: { select: { type: true } },
              },
            });

            const revenueByType = new Map<ServiceType, string>();
            for (const ch of doctorCharges) {
              if (
                ch.sourceType === ChargeSource.SURGERY &&
                ch.sourceId !== null &&
                coveredSurgeryCaseIds.has(ch.sourceId)
              ) {
                continue;
              }
              const sType = ch.serviceItem?.type ?? ServiceType.CONSULTATION;
              const prev = revenueByType.get(sType) ?? '0.000';
              revenueByType.set(
                sType,
                Money.toDbString(Money.sumPosted(prev, ch.totalAmount)),
              );
            }

            if (revenueByType.size > 0) {
              const fallbackConsultationRate =
                await this.commissionService.getDoctorRate(
                  hospitalId,
                  emp.id,
                  ServiceType.CONSULTATION,
                  tx,
                );
              const userFractionRate = Money.decimal(emp.commissionRate ?? 0);

              for (const [sType, revTotal] of revenueByType.entries()) {
                let ruleRate =
                  sType === ServiceType.CONSULTATION
                    ? fallbackConsultationRate
                    : await this.commissionService.getDoctorRate(
                        hospitalId,
                        emp.id,
                        sType,
                        tx,
                      );
                if (ruleRate <= 0 && fallbackConsultationRate > 0) {
                  ruleRate = fallbackConsultationRate;
                }

                if (ruleRate > 0) {
                  chargesCommissionDec = Money.addDecimal(
                    chargesCommissionDec,
                    Money.percentDecimal(revTotal, ruleRate),
                  );
                } else if (userFractionRate.gt(0)) {
                  chargesCommissionDec = Money.addDecimal(
                    chargesCommissionDec,
                    Money.rateDecimal(revTotal, userFractionRate),
                  );
                }
              }
            }
          }

          const commissionDec = Money.roundDecimal(
            Money.addDecimal(surgeryCommissionDec, chargesCommissionDec),
          );
          const otherAllowanceDec = Money.roundDecimal(
            Money.sumDecimal(otherBaseDec, commissionDec, overtimePayDec),
          );
          const totalAdditionsSlipDec = Money.roundDecimal(
            Money.sumDecimal(housingDec, transportDec, otherAllowanceDec),
          );
          const netSlipDec = Money.roundDecimal(
            Money.subtractDecimal(
              Money.addDecimal(basicDec, totalAdditionsSlipDec),
              totalDeductionsSlipDec,
            ),
          );

          await tx.payrollSlip.create({
            data: {
              payrollRunId: run.id,
              userId: emp.id,
              basicSalary: Money.toDbString(basicDec),
              housingAllowance: Money.toDbString(housingDec),
              transportAllowance: Money.toDbString(transportDec),
              otherAllowance: Money.toDbString(otherAllowanceDec),
              deductions: Money.toDbString(totalDeductionsSlipDec),
              netSalary: Money.toDbString(netSlipDec),
              commissionAmount: Money.toDbString(commissionDec),
            },
          });

          totalBasicDec = Money.sumPosted(totalBasicDec, basicDec);
          totalAllowancesDec = Money.sumPosted(
            totalAllowancesDec,
            totalAdditionsSlipDec,
          );
          totalDeductionsDec = Money.sumPosted(
            totalDeductionsDec,
            totalDeductionsSlipDec,
          );
          totalNetDec = Money.sumPosted(totalNetDec, netSlipDec);
        }

        const updatedRun = await tx.payrollRun.update({
          where: { id: run.id },
          data: {
            totalBasic: Money.toDbString(totalBasicDec),
            totalAllowances: Money.toDbString(totalAllowancesDec),
            totalDeductions: Money.toDbString(totalDeductionsDec),
            totalNet: Money.toDbString(totalNetDec),
          },
        });

        const auditFields = {
          hospitalId,
          userId,
          action: 'GENERATE_PAYROLL_RUN',
          entity: 'PayrollRun',
          entityId: updatedRun.id,
          details: {
            month,
            year,
            employeesCount: employees.length,
            totalBasic: Money.toDbString(totalBasicDec),
            totalAllowances: Money.toDbString(totalAllowancesDec),
            totalDeductions: Money.toDbString(totalDeductionsDec),
            totalNet: Money.toDbString(totalNetDec),
          },
        };
        await appendChainedAuditInTransaction(tx, auditFields);
        committedAudit = auditFields;

        return updatedRun;
      },
      { timeout: 60000 },
    );
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
  }

  async approvePayroll(hospitalId: number, id: number, userId: number) {
    let committedAudit: Record<string, unknown> | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27006, ${hospitalId}::int)`;

      const lockedRuns = await tx.$queryRaw<
        Array<{ id: number; hospitalId: number; status: string }>
      >`SELECT "id", "hospitalId", "status" FROM "PayrollRun" WHERE "id" = ${id} FOR UPDATE`;

      if (!lockedRuns.length || lockedRuns[0].hospitalId !== hospitalId) {
        throw new NotFoundException('كشف الرواتب غير موجود.');
      }

      const run = await tx.payrollRun.findUnique({
        where: { id },
        include: { slips: true },
      });

      if (!run || run.hospitalId !== hospitalId)
        throw new NotFoundException('كشف الرواتب غير موجود.');
      if (run.status !== PayrollStatus.DRAFT)
        throw new BadRequestException('الكشف معتمد مسبقاً.');
      if (!run.slips.length || !Money.isPositive(run.totalNet)) {
        throw new BadRequestException(
          'لا يمكن اعتماد كشف رواتب فارغ أو بصافي صفري/سالب.',
        );
      }

      const slipsNetSum = Money.sumPosted(...run.slips.map((s) => s.netSalary));
      if (!Money.eq(slipsNetSum, run.totalNet)) {
        throw new BadRequestException(
          'عدم تطابق بين مجموع صافي القسائم وإجمالي الكشف.',
        );
      }

      const payrollDate = new Date(Date.UTC(run.year, run.month - 1, 28));
      const { financialYear: fy, period } = await financialPeriod(
        tx,
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
      if (expenseAcc.type !== 'EXPENSE' || payableAcc.type !== 'LIABILITY') {
        throw new BadRequestException(
          'تصنيف حساب مصروف الرواتب أو الرواتب المستحقة غير صالح.',
        );
      }

      const netAmountText = Money.toDbString(run.totalNet);

      const entry = await tx.accountingEntry.create({
        data: {
          hospitalId,
          entryDate: payrollDate,
          financialYearId: fy.id,
          financialPeriodId: period.id,
          sourceModule: AccountingSourceModule.PAYROLL,
          sourceId: run.id,
          postingKey: `payroll-run:${hospitalId}:${run.id}`,
          description: `إستحقاق رواتب شهر ${run.month}/${run.year}`,
          createdById: userId,
          lines: {
            create: [
              {
                accountId: expenseAcc.id,
                debit: netAmountText,
                credit: '0.000',
                description: 'مصروف الرواتب والبدلات',
              },
              {
                accountId: payableAcc.id,
                debit: '0.000',
                credit: netAmountText,
                description: 'صافي الرواتب المستحقة',
              },
            ],
          },
        },
      });

      const updated = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: PayrollStatus.APPROVED,
          accountingEntryId: entry.id,
          approvedById: userId,
        },
      });

      const auditFields = {
        hospitalId,
        userId,
        action: 'APPROVE_PAYROLL_RUN',
        entity: 'PayrollRun',
        entityId: run.id,
        details: {
          month: run.month,
          year: run.year,
          totalNet: netAmountText,
          accountingEntryId: entry.id,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;

      return updated;
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
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
    return {
      ...run,
      slips: run.slips.map((s) => ({
        ...s,
        totalAllowances: Money.toDbString(
          Money.sumPosted(
            s.housingAllowance,
            s.transportAllowance,
            s.otherAllowance,
          ),
        ),
      })),
    };
  }

  // ❌ حذف الكشف (مسموح فقط للـ DRAFT)
  async deletePayroll(hospitalId: number, id: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27006, ${hospitalId}::int)`;

      const lockedRuns = await tx.$queryRaw<
        Array<{ id: number; hospitalId: number; status: string }>
      >`SELECT "id", "hospitalId", "status" FROM "PayrollRun" WHERE "id" = ${id} FOR UPDATE`;

      if (!lockedRuns.length || lockedRuns[0].hospitalId !== hospitalId) {
        throw new NotFoundException('كشف الرواتب غير موجود.');
      }

      if (lockedRuns[0].status === PayrollStatus.APPROVED) {
        throw new BadRequestException(
          'لا يمكن حذف كشف رواتب معتمد ومرحل للمالية. يرجى مراجعة المحاسب.',
        );
      }

      return tx.payrollRun.delete({
        where: { id },
      });
    });
  }
}
