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
  LeaveStatus,
  LeaveType,
  Prisma,
} from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { financialPeriod } from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  calculateProgressiveTax,
  computeShiftDurationHours,
  resolveFixedShiftRate,
} from '../hr/hr-financial.util';

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

        const activeTaxBrackets = await tx.taxBracket.findMany({
          where: { hospitalId, isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { fromAmount: 'asc' }],
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

          // 🧮 الحسابات الأساسية بدقة Money Decimal حسب تصنيف الصرف (MONTHLY / HOURLY / FIXED_SHIFT)
          const payBasis = emp.payBasis || 'MONTHLY';
          let basicDec = Money.roundDecimal(emp.basicSalary ?? 0);
          let workedHoursDec = Money.decimal(0);
          let workedShiftsCount = 0;
          let dailyRateDec = Money.divide(basicDec, 30);
          let hourlyRateDec = Money.divide(dailyRateDec, 8);
          let minuteRateDec = Money.divide(hourlyRateDec, 60);

          if (payBasis === 'HOURLY' || payBasis === 'FIXED_SHIFT') {
            const monthAttendance = await tx.attendanceRecord.findMany({
              where: {
                userId: emp.id,
                date: { gte: startDate, lte: endDate },
                checkIn: { not: null },
              },
              orderBy: { date: 'asc' },
            });
            const monthRosters = await tx.employeeRoster.findMany({
              where: {
                hospitalId,
                userId: emp.id,
                date: { gte: startDate, lte: endDate },
              },
              include: { shift: true },
            });
            const rosterByDay = new Map(
              monthRosters.map((r) => [r.date.toISOString().slice(0, 10), r]),
            );

            let shiftEarningsDec = Money.decimal(0);
            for (const att of monthAttendance) {
              workedShiftsCount += 1;
              let hoursNum = 0;
              if (att.checkIn && att.checkOut && att.checkOut > att.checkIn) {
                hoursNum =
                  (att.checkOut.getTime() - att.checkIn.getTime()) / 3600000;
              } else {
                const dayRoster = rosterByDay.get(
                  att.date.toISOString().slice(0, 10),
                );
                if (dayRoster?.shift) {
                  hoursNum = computeShiftDurationHours(
                    dayRoster.shift.startTime,
                    dayRoster.shift.endTime,
                  );
                }
              }
              if (hoursNum > 0) {
                workedHoursDec = workedHoursDec.plus(
                  Money.roundDecimal(hoursNum, 3),
                );
              }
              if (payBasis === 'FIXED_SHIFT') {
                const dayRoster = rosterByDay.get(
                  att.date.toISOString().slice(0, 10),
                );
                const shiftHours = dayRoster?.shift
                  ? computeShiftDurationHours(
                      dayRoster.shift.startTime,
                      dayRoster.shift.endTime,
                    )
                  : hoursNum || 8;
                const shiftRateStr = resolveFixedShiftRate(shiftHours, {
                  fixedShift6hRate: emp.fixedShift6hRate,
                  fixedShift12hRate: emp.fixedShift12hRate,
                  fixedShift24hRate: emp.fixedShift24hRate,
                });
                shiftEarningsDec = Money.sumPosted(
                  shiftEarningsDec,
                  shiftRateStr,
                );
              }
            }

            if (payBasis === 'HOURLY') {
              hourlyRateDec = Money.decimal(emp.hourlyRate ?? 0);
              basicDec = Money.roundDecimal(
                Money.multiply(workedHoursDec, hourlyRateDec),
              );
            } else {
              basicDec = shiftEarningsDec;
              hourlyRateDec = Money.decimal(emp.hourlyRate ?? 0).gt(0)
                ? Money.decimal(emp.hourlyRate)
                : workedHoursDec.gt(0)
                  ? Money.divide(basicDec, workedHoursDec)
                  : Money.decimal(0);
            }
            dailyRateDec = Money.decimal(0);
            minuteRateDec = Money.divide(hourlyRateDec, 60);
          }

          const housingDec = Money.roundDecimal(emp.housingAllowance ?? 0);
          const transportDec = Money.roundDecimal(emp.transportAllowance ?? 0);
          const otherBaseDec = Money.roundDecimal(emp.otherAllowance ?? 0);

          // 1. الخصومات (غياب + تأخير + إجازة بدون راتب + استقطاعات دورية/جزاءات + ضريبة شرائح + أقساط السلف)
          const absentDeductionDec =
            payBasis === 'MONTHLY'
              ? Money.multiply(stats.absentDays, dailyRateDec)
              : Money.decimal(0);
          const lateDeductionDec = Money.multiply(
            stats.totalLateMinutes,
            minuteRateDec,
          );

          // 1.أ إجازات بدون راتب معتمدة داخل الشهر
          const unpaidLeaves = await tx.leaveRequest.findMany({
            where: {
              hospitalId,
              userId: emp.id,
              type: LeaveType.UNPAID,
              status: LeaveStatus.APPROVED,
              startDate: { lte: endDate },
              endDate: { gte: startDate },
            },
            select: { startDate: true, endDate: true },
          });
          let unpaidDays = 0;
          for (const ul of unpaidLeaves) {
            const overlapStart =
              ul.startDate > startDate ? ul.startDate : startDate;
            const overlapEnd = ul.endDate < endDate ? ul.endDate : endDate;
            const sUtc = Date.UTC(
              overlapStart.getUTCFullYear(),
              overlapStart.getUTCMonth(),
              overlapStart.getUTCDate(),
            );
            const eUtc = Date.UTC(
              overlapEnd.getUTCFullYear(),
              overlapEnd.getUTCMonth(),
              overlapEnd.getUTCDate(),
            );
            if (eUtc >= sUtc) {
              unpaidDays += Math.floor((eUtc - sUtc) / 86400000) + 1;
            }
          }
          const unpaidLeaveDeductionDec =
            payBasis === 'MONTHLY'
              ? Money.roundDecimal(Money.multiply(unpaidDays, dailyRateDec))
              : Money.decimal(0);

          // 1.ب الاستقطاعات والبدلات الدورية أو لمرة واحدة غير المطبقة (CAP11)
          const compItems = await tx.employeeDeduction.findMany({
            where: {
              hospitalId,
              userId: emp.id,
              isActive: true,
              effectiveFrom: { lte: endDate },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }],
            },
            select: {
              id: true,
              kind: true,
              category: true,
              amount: true,
              isRecurring: true,
              appliedInPayrollRunId: true,
            },
          });
          const applicableCompItems = compItems.filter(
            (c) =>
              (c.isRecurring || c.appliedInPayrollRunId === null) &&
              !(
                emp.isSocialInsuranceExempt && c.category === 'SOCIAL_SECURITY'
              ),
          );
          const recurringAllowanceDec = applicableCompItems
            .filter((c) => c.kind === 'ALLOWANCE')
            .reduce(
              (acc, item) => Money.sumPosted(acc, item.amount),
              Money.decimal(0),
            );
          const recurringDeductionDec = applicableCompItems
            .filter((c) => c.kind === 'DEDUCTION')
            .reduce(
              (acc, item) => Money.sumPosted(acc, item.amount),
              Money.decimal(0),
            );
          const socialSecurityDeductionDec = applicableCompItems
            .filter(
              (c) => c.kind === 'DEDUCTION' && c.category === 'SOCIAL_SECURITY',
            )
            .reduce(
              (acc, item) => Money.sumPosted(acc, item.amount),
              Money.decimal(0),
            );

          // 1.ج أقساط السلف النشطة المعتمدة (CAP11)
          const activeAdvances = await tx.employeeAdvance.findMany({
            where: {
              hospitalId,
              userId: emp.id,
              status: 'APPROVED',
              remainingAmount: { gt: 0 },
            },
            orderBy: { id: 'asc' },
            select: {
              id: true,
              advanceNumber: true,
              monthlyDeduction: true,
              remainingAmount: true,
            },
          });
          const loanInstallments: Array<{
            advanceId: number;
            advanceNumber: string;
            amount: string;
          }> = [];
          let advanceDeductionDec = Money.decimal(0);
          for (const adv of activeAdvances) {
            const remDec = Money.roundDecimal(adv.remainingAmount, 3);
            const monDec = Money.roundDecimal(adv.monthlyDeduction, 3);
            const installmentDec = remDec.lt(monDec) ? remDec : monDec;
            if (installmentDec.gt(0)) {
              advanceDeductionDec = Money.sumPosted(
                advanceDeductionDec,
                installmentDec,
              );
              loanInstallments.push({
                advanceId: adv.id,
                advanceNumber: adv.advanceNumber,
                amount: Money.toDbString(installmentDec),
              });
            }
          }

          const attendanceDeductionDec = Money.roundDecimal(
            Money.addDecimal(absentDeductionDec, lateDeductionDec),
          );
          const totalDeductionsSlipDec = Money.sumPosted(
            attendanceDeductionDec,
            unpaidLeaveDeductionDec,
            recurringDeductionDec,
            advanceDeductionDec,
          );

          // 2. الإضافات (إضافي حضور + طلبات عمل إضافي معتمدة + بدلات دورية + عمولات)
          const attendanceOvertimePayDec = Money.roundDecimal(
            Money.multiply(
              Money.multiply(stats.overtimeHours, hourlyRateDec),
              '1.5',
            ),
          );
          const approvedOvertimes = await tx.overtimeRequest.findMany({
            where: {
              hospitalId,
              userId: emp.id,
              status: 'APPROVED',
              appliedInPayrollRunId: null,
              date: { gte: startDate, lte: endDate },
            },
            select: { approvedHours: true, multiplier: true },
          });
          let requestOvertimePayDec = Money.decimal(0);
          for (const ot of approvedOvertimes) {
            if (ot.approvedHours) {
              const otLine = Money.roundDecimal(
                Money.multiply(
                  Money.multiply(ot.approvedHours, hourlyRateDec),
                  ot.multiplier,
                ),
              );
              requestOvertimePayDec = Money.sumPosted(
                requestOvertimePayDec,
                otLine,
              );
            }
          }
          const overtimePayDec = Money.sumPosted(
            attendanceOvertimePayDec,
            requestOvertimePayDec,
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
            Money.sumDecimal(
              otherBaseDec,
              commissionDec,
              overtimePayDec,
              recurringAllowanceDec,
            ),
          );
          const totalAdditionsSlipDec = Money.roundDecimal(
            Money.sumDecimal(housingDec, transportDec, otherAllowanceDec),
          );

          // 3. ضريبة الدخل التصاعدية حسب الشرائح (TaxBracket) بعد خصم الغياب والضمان
          const adjustedGrossDec = Money.subtractDecimal(
            Money.addDecimal(basicDec, totalAdditionsSlipDec),
            Money.sumPosted(attendanceDeductionDec, unpaidLeaveDeductionDec),
          );
          const taxableIncomeDec = adjustedGrossDec.gt(
            socialSecurityDeductionDec,
          )
            ? Money.subtractDecimal(
                adjustedGrossDec,
                socialSecurityDeductionDec,
              )
            : Money.decimal(0);
          const taxDeductionDec =
            !emp.isTaxExempt && activeTaxBrackets.length > 0
              ? Money.decimal(
                  calculateProgressiveTax(taxableIncomeDec, activeTaxBrackets),
                )
              : Money.decimal(0);

          const finalDeductionsSlipDec = Money.sumPosted(
            totalDeductionsSlipDec,
            taxDeductionDec,
          );
          const netSlipDec = Money.roundDecimal(
            Money.subtractDecimal(
              Money.addDecimal(basicDec, totalAdditionsSlipDec),
              finalDeductionsSlipDec,
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
              deductions: Money.toDbString(finalDeductionsSlipDec),
              netSalary: Money.toDbString(netSlipDec),
              commissionAmount: Money.toDbString(commissionDec),
              payBasis,
              workedHours: Money.toDbString(workedHoursDec),
              workedShiftsCount,
              taxDeduction: Money.toDbString(taxDeductionDec),
              advanceDeduction: Money.toDbString(advanceDeductionDec),
              recurringDeduction: Money.toDbString(recurringDeductionDec),
              unpaidLeaveDeduction: Money.toDbString(unpaidLeaveDeductionDec),
              overtimePay: Money.toDbString(overtimePayDec),
              loanInstallmentsJson: loanInstallments.length
                ? (loanInstallments as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            },
          });

          totalBasicDec = Money.sumPosted(totalBasicDec, basicDec);
          totalAllowancesDec = Money.sumPosted(
            totalAllowancesDec,
            totalAdditionsSlipDec,
          );
          totalDeductionsDec = Money.sumPosted(
            totalDeductionsDec,
            finalDeductionsSlipDec,
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
      if (run.slips.some((s) => Money.decimal(s.netSalary).lt(0))) {
        throw new BadRequestException(
          'لا يمكن اعتماد كشف رواتب يحتوي على قسيمة بصافي سالب؛ راجع السلف والخصومات.',
        );
      }

      // CAP11: قفل والتحقق من أرصدة السلف المقتطعة وخصمها ذريًا
      let totalAdvanceDeductionDec = Money.decimal(0);
      let totalRecurringDeductionDec = Money.decimal(0);
      const installmentPlan: Array<{ advanceId: number; amount: string }> = [];

      for (const slip of run.slips) {
        totalAdvanceDeductionDec = Money.sumPosted(
          totalAdvanceDeductionDec,
          slip.advanceDeduction,
        );
        totalRecurringDeductionDec = Money.sumPosted(
          totalRecurringDeductionDec,
          slip.recurringDeduction,
          slip.taxDeduction,
        );
        if (Array.isArray(slip.loanInstallmentsJson)) {
          for (const rawItem of slip.loanInstallmentsJson as Array<{
            advanceId?: number;
            amount?: string;
          }>) {
            if (rawItem.advanceId && rawItem.amount) {
              installmentPlan.push({
                advanceId: Number(rawItem.advanceId),
                amount: String(rawItem.amount),
              });
            }
          }
        }
      }

      if (installmentPlan.length > 0) {
        const sortedIds = [
          ...new Set(installmentPlan.map((i) => i.advanceId)),
        ].sort((a, b) => a - b);
        for (const advId of sortedIds) {
          await tx.$executeRaw`SELECT "id" FROM "EmployeeAdvance" WHERE "id" = ${advId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
        }
        for (const item of installmentPlan) {
          const adv = await tx.employeeAdvance.findFirst({
            where: { id: item.advanceId, hospitalId },
          });
          if (
            !adv ||
            adv.status !== 'APPROVED' ||
            Money.decimal(adv.remainingAmount).lt(item.amount)
          ) {
            throw new BadRequestException(
              'رصيد إحدى السلف تغيّر بعد توليد المسودة؛ أعد توليد الكشف قبل الاعتماد.',
            );
          }
          const nextRemDec = Money.roundDecimal(
            Money.subtractDecimal(adv.remainingAmount, item.amount),
            3,
          );
          await tx.employeeAdvance.update({
            where: { id: adv.id },
            data: {
              remainingAmount: Money.toDbString(nextRemDec),
              status: nextRemDec.lte(0) ? 'SETTLED' : 'APPROVED',
            },
          });
        }
      }

      // وسم بنود الاستقطاعات/البدلات لمرة واحدة وطلبات العمل الإضافي المعتمدة كـ "مطبّقة"
      const monthStart = new Date(
        Date.UTC(run.year, run.month - 1, 1, 0, 0, 0),
      );
      const monthEnd = new Date(
        Date.UTC(run.year, run.month, 0, 23, 59, 59, 999),
      );
      const slipUserIds = run.slips.map((s) => s.userId);
      await tx.employeeDeduction.updateMany({
        where: {
          hospitalId,
          userId: { in: slipUserIds },
          isActive: true,
          isRecurring: false,
          appliedInPayrollRunId: null,
          effectiveFrom: { lte: monthEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
        },
        data: { appliedInPayrollRunId: run.id },
      });
      await tx.overtimeRequest.updateMany({
        where: {
          hospitalId,
          userId: { in: slipUserIds },
          status: 'APPROVED',
          appliedInPayrollRunId: null,
          date: { gte: monthStart, lte: monthEnd },
        },
        data: { appliedInPayrollRunId: run.id },
      });

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
      const totalExpenseDec = Money.sumPosted(
        run.totalNet,
        totalAdvanceDeductionDec,
        totalRecurringDeductionDec,
      );
      const entryLines: Array<{
        accountId: number;
        debit: string;
        credit: string;
        description: string;
      }> = [
        {
          accountId: expenseAcc.id,
          debit: Money.toDbString(totalExpenseDec),
          credit: '0.000',
          description: 'مصروف الرواتب والبدلات',
        },
        {
          accountId: payableAcc.id,
          debit: '0.000',
          credit: netAmountText,
          description: 'صافي الرواتب المستحقة',
        },
      ];

      if (totalAdvanceDeductionDec.gt(0)) {
        const advAcc = await this.accounting.getSystemAccountOrThrow(
          hospitalId,
          SystemAccountKey.EMPLOYEE_ADVANCES,
          tx,
        );
        entryLines.push({
          accountId: advAcc.id,
          debit: '0.000',
          credit: Money.toDbString(totalAdvanceDeductionDec),
          description: `استرداد أقساط سلف الموظفين لشهر ${run.month}/${run.year}`,
        });
      }
      if (totalRecurringDeductionDec.gt(0)) {
        const dedAcc = await this.accounting.getSystemAccountOrThrow(
          hospitalId,
          SystemAccountKey.EMPLOYEE_DEDUCTIONS_PAYABLE,
          tx,
        );
        entryLines.push({
          accountId: dedAcc.id,
          debit: '0.000',
          credit: Money.toDbString(totalRecurringDeductionDec),
          description: `استقطاعات وضمانات الموظفين لشهر ${run.month}/${run.year}`,
        });
      }

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
          lines: { create: entryLines },
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
