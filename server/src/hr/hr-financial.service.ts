// server/src/hr/hr-financial.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingSourceModule,
  Prisma,
  SystemAccountKey,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { financialPeriod } from '../accounting/financial-posting';
import { Money } from '../common/utils/money.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  ApproveEmployeeAdvanceDto,
  ApproveOvertimeRequestDto,
  ApproveSettlementDto,
  CreateEmployeeAdvanceDto,
  CreateEmployeeDeductionDto,
  CreateEndOfServiceDto,
  CreateOvertimeRequestDto,
  CreateTaxBracketDto,
  PaySettlementDto,
  PreviewEndOfServiceDto,
  UpdateEmployeeCompensationDto,
  UpdateSettlementClearanceDto,
} from './dto/hr-financial.dto';
import {
  calculateEndOfService,
  computeAdvanceSchedule,
  computeSettlementSignatureHash,
  OVERTIME_DEFAULT_MULTIPLIERS,
  type OvertimeDayType,
  type TerminationType,
} from './hr-financial.util';

const ADVISORY_LOCK_HR_FINANCIAL = 27021;

@Injectable()
export class HrFinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  // =========================================================================
  // 0. EMPLOYEE PAY BASIS (MONTHLY / HOURLY / FIXED_SHIFT) & TAX BRACKETS
  // =========================================================================

  async listEmployeesCompensation(hospitalId: number) {
    return this.prisma.user.findMany({
      where: { hospitalId, isDeleted: false },
      select: {
        id: true,
        fullName: true,
        username: true,
        isActive: true,
        employmentStatus: true,
        hireDate: true,
        payBasis: true,
        basicSalary: true,
        hourlyRate: true,
        fixedShift6hRate: true,
        fixedShift12hRate: true,
        fixedShift24hRate: true,
        standardMonthlyHours: true,
        annualLeaveBalance: true,
        isTaxExempt: true,
        isSocialInsuranceExempt: true,
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async updateEmployeeCompensation(
    hospitalId: number,
    targetUserId: number,
    actorUserId: number,
    dto: UpdateEmployeeCompensationDto,
  ) {
    const hireDate =
      dto.hireDate !== undefined ? new Date(dto.hireDate) : undefined;
    if (hireDate && Number.isNaN(hireDate.getTime())) {
      throw new BadRequestException('تاريخ التعيين غير صالح.');
    }

    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.user.findFirst({
        where: { id: targetUserId, hospitalId, isDeleted: false },
        select: { id: true, payBasis: true },
      });
      if (!existing) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }

      const saved = await tx.user.update({
        where: { id: existing.id },
        data: {
          ...(dto.payBasis !== undefined ? { payBasis: dto.payBasis } : {}),
          ...(dto.basicSalary !== undefined
            ? { basicSalary: Money.toDbString(dto.basicSalary) }
            : {}),
          ...(dto.hourlyRate !== undefined
            ? { hourlyRate: Money.toUnitDbString(dto.hourlyRate) }
            : {}),
          ...(dto.fixedShift6hRate !== undefined
            ? { fixedShift6hRate: Money.toUnitDbString(dto.fixedShift6hRate) }
            : {}),
          ...(dto.fixedShift12hRate !== undefined
            ? { fixedShift12hRate: Money.toUnitDbString(dto.fixedShift12hRate) }
            : {}),
          ...(dto.fixedShift24hRate !== undefined
            ? { fixedShift24hRate: Money.toUnitDbString(dto.fixedShift24hRate) }
            : {}),
          ...(dto.standardMonthlyHours !== undefined
            ? { standardMonthlyHours: dto.standardMonthlyHours }
            : {}),
          ...(hireDate !== undefined ? { hireDate } : {}),
          ...(dto.isTaxExempt !== undefined
            ? { isTaxExempt: dto.isTaxExempt }
            : {}),
          ...(dto.isSocialInsuranceExempt !== undefined
            ? { isSocialInsuranceExempt: dto.isSocialInsuranceExempt }
            : {}),
        },
        select: {
          id: true,
          fullName: true,
          payBasis: true,
          basicSalary: true,
          hourlyRate: true,
          fixedShift6hRate: true,
          fixedShift12hRate: true,
          fixedShift24hRate: true,
          standardMonthlyHours: true,
          hireDate: true,
          isTaxExempt: true,
          isSocialInsuranceExempt: true,
        },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_COMPENSATION_UPDATED',
        entity: 'User',
        entityId: saved.id,
        details: {
          payBasis: saved.payBasis,
          basicSalary: Money.toDbString(saved.basicSalary),
          hourlyRate: Money.toUnitDbString(saved.hourlyRate),
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  async listTaxBrackets(hospitalId: number) {
    return this.prisma.taxBracket.findMany({
      where: { hospitalId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { fromAmount: 'asc' }],
    });
  }

  async createTaxBracket(
    hospitalId: number,
    actorUserId: number,
    dto: CreateTaxBracketDto,
  ) {
    if (dto.toAmount !== undefined && dto.toAmount <= dto.fromAmount) {
      throw new BadRequestException(
        'الحد الأعلى للشريحة الضريبية يجب أن يكون أكبر من الحد الأدنى.',
      );
    }
    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const bracket = await tx.taxBracket.create({
        data: {
          hospitalId,
          name: dto.name.trim(),
          fromAmount: Money.toDbString(dto.fromAmount),
          toAmount:
            dto.toAmount !== undefined ? Money.toDbString(dto.toAmount) : null,
          rate: Money.toRateDbString(dto.rate),
          fixedAmount: Money.toDbString(dto.fixedAmount ?? 0),
          sortOrder: dto.sortOrder ?? 0,
          isActive: true,
        },
      });
      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'TAX_BRACKET_CREATED',
        entity: 'TaxBracket',
        entityId: bracket.id,
        details: {
          name: bracket.name,
          fromAmount: Money.toDbString(bracket.fromAmount),
          rate: Money.toRateDbString(bracket.rate),
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return bracket;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async deactivateTaxBracket(
    hospitalId: number,
    id: number,
    actorUserId: number,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.taxBracket.findFirst({
        where: { id, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('الشريحة الضريبية غير موجودة.');
      }
      const saved = await tx.taxBracket.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'TAX_BRACKET_DEACTIVATED',
        entity: 'TaxBracket',
        entityId: saved.id,
        details: { name: saved.name },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  // =========================================================================
  // 1. EMPLOYEE ADVANCES / LOANS (4-EYES + OPTIONAL GL DISBURSEMENT)
  // =========================================================================

  async listAdvances(hospitalId: number, userId?: number, status?: string) {
    return this.prisma.employeeAdvance.findMany({
      where: {
        hospitalId,
        ...(userId ? { userId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        requestedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { id: 'desc' },
    });
  }

  async createAdvance(
    hospitalId: number,
    requestedById: number,
    dto: CreateEmployeeAdvanceDto,
  ) {
    const schedule = computeAdvanceSchedule(dto.amount, dto.installments);
    const requestDate = dto.requestDate
      ? new Date(dto.requestDate)
      : new Date();
    if (Number.isNaN(requestDate.getTime())) {
      throw new BadRequestException('تاريخ طلب السلفة غير صالح.');
    }

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_HR_FINANCIAL}::int, ${hospitalId}::int)`;

      const employee = await tx.user.findFirst({
        where: { id: dto.userId, hospitalId, isDeleted: false },
        select: {
          id: true,
          fullName: true,
          isActive: true,
          terminationDate: true,
          employmentStatus: true,
        },
      });
      if (!employee) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }
      if (
        !employee.isActive ||
        employee.terminationDate ||
        employee.employmentStatus !== 'ACTIVE'
      ) {
        throw new ConflictException(
          'لا يمكن إنشاء سلفة لموظف غير نشط أو منتهية خدمته.',
        );
      }

      const year = requestDate.getUTCFullYear();
      const count = await tx.employeeAdvance.count({ where: { hospitalId } });
      const advanceNumber = `ADV-${year}-${String(count + 1).padStart(4, '0')}`;

      const adv = await tx.employeeAdvance.create({
        data: {
          hospitalId,
          userId: dto.userId,
          advanceNumber,
          amount: schedule.amount,
          installments: schedule.installments,
          monthlyDeduction: schedule.monthlyDeduction,
          remainingAmount: schedule.amount,
          requestDate,
          reason: dto.reason?.trim() || null,
          notes: dto.notes?.trim() || null,
          status: 'PENDING',
          requestedById,
        },
        include: {
          user: { select: { id: true, fullName: true, username: true } },
        },
      });

      const auditFields = {
        hospitalId,
        userId: requestedById,
        action: 'EMPLOYEE_ADVANCE_REQUESTED',
        entity: 'EmployeeAdvance',
        entityId: adv.id,
        details: {
          advanceNumber: adv.advanceNumber,
          targetUserId: dto.userId,
          amount: schedule.amount,
          installments: schedule.installments,
          monthlyDeduction: schedule.monthlyDeduction,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;

      return adv;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async approveAdvance(
    hospitalId: number,
    advanceId: number,
    approverId: number,
    dto: ApproveEmployeeAdvanceDto = {},
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_HR_FINANCIAL}::int, ${hospitalId}::int)`;

      const locked = await tx.$queryRaw<
        Array<{
          id: number;
          hospitalId: number;
          userId: number;
          status: string;
        }>
      >`SELECT "id", "hospitalId", "userId", "status" FROM "EmployeeAdvance" WHERE "id" = ${advanceId} FOR UPDATE`;

      if (!locked.length || locked[0].hospitalId !== hospitalId) {
        throw new NotFoundException('طلب السلفة غير موجود في هذه المنشأة.');
      }

      const advance = await tx.employeeAdvance.findUniqueOrThrow({
        where: { id: advanceId },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              isActive: true,
              terminationDate: true,
              employmentStatus: true,
            },
          },
        },
      });

      if (advance.status !== 'PENDING') {
        throw new ConflictException(
          'لا يمكن اعتماد سلفة ليست في حالة انتظار (PENDING).',
        );
      }
      if (!advance.user) {
        throw new ConflictException('سجل المستخدم المرتبط بالسلفة غير موجود.');
      }
      if (advance.userId === approverId) {
        throw new ForbiddenException(
          'رقابة 4 عيون: لا يمكن للموظف اعتماد سلفة لنفسه.',
        );
      }
      if (
        !advance.user.isActive ||
        advance.user.terminationDate ||
        advance.user.employmentStatus !== 'ACTIVE'
      ) {
        throw new ConflictException(
          'لا يمكن اعتماد سلفة لموظف غير نشط أو منتهية خدمته.',
        );
      }

      let disbursementEntryId: number | null = null;
      if (dto.postAccounting) {
        const now = new Date();
        const { financialYear: fy, period } = await financialPeriod(
          tx,
          hospitalId,
          now,
        );
        const advanceAcc = await this.accounting.getSystemAccountOrThrow(
          hospitalId,
          SystemAccountKey.EMPLOYEE_ADVANCES,
          tx,
        );
        const creditKey =
          dto.paymentMethod === 'BANK'
            ? SystemAccountKey.BANK_MAIN
            : SystemAccountKey.CASH_MAIN;
        const creditAcc = await this.accounting.getSystemAccountOrThrow(
          hospitalId,
          creditKey,
          tx,
        );
        const amtText = Money.toDbString(advance.amount);
        const entry = await tx.accountingEntry.create({
          data: {
            hospitalId,
            entryDate: now,
            financialYearId: fy.id,
            financialPeriodId: period.id,
            sourceModule: AccountingSourceModule.PAYROLL,
            sourceId: advance.id,
            postingKey: `hr-advance-disburse:${hospitalId}:${advance.id}`,
            description: `صرف سلفة موظف (${advance.advanceNumber}) - ${advance.user.fullName}`,
            createdById: approverId,
            lines: {
              create: [
                {
                  accountId: advanceAcc.id,
                  debit: amtText,
                  credit: '0.000',
                  description: `مديونية سلفة ${advance.user.fullName}`,
                },
                {
                  accountId: creditAcc.id,
                  debit: '0.000',
                  credit: amtText,
                  description: `صرف سلفة ${advance.advanceNumber}`,
                },
              ],
            },
          },
        });
        disbursementEntryId = entry.id;
      }

      const saved = await tx.employeeAdvance.update({
        where: { id: advance.id },
        data: {
          status: 'APPROVED',
          approvedById: approverId,
          approvedAt: new Date(),
          ...(disbursementEntryId ? { disbursementEntryId } : {}),
          ...(dto.notes
            ? {
                notes: advance.notes
                  ? `${advance.notes} | ${dto.notes.trim()}`
                  : dto.notes.trim(),
              }
            : {}),
        },
        include: {
          user: { select: { id: true, fullName: true, username: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      });

      const auditFields = {
        hospitalId,
        userId: approverId,
        action: 'EMPLOYEE_ADVANCE_APPROVED',
        entity: 'EmployeeAdvance',
        entityId: saved.id,
        details: {
          advanceNumber: saved.advanceNumber,
          targetUserId: saved.userId,
          amount: Money.toDbString(saved.amount),
          disbursementEntryId,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;

      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  async rejectAdvance(
    hospitalId: number,
    advanceId: number,
    approverId: number,
    notes?: string,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_HR_FINANCIAL}::int, ${hospitalId}::int)`;

      const existing = await tx.employeeAdvance.findFirst({
        where: { id: advanceId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('طلب السلفة غير موجود في هذه المنشأة.');
      }
      if (existing.status !== 'PENDING') {
        throw new ConflictException(
          'لا يمكن رفض سلفة ليست في حالة انتظار (PENDING).',
        );
      }

      const saved = await tx.employeeAdvance.update({
        where: { id: existing.id },
        data: {
          status: 'REJECTED',
          approvedById: approverId === existing.userId ? null : approverId,
          approvedAt: new Date(),
          ...(notes ? { notes: notes.trim() } : {}),
        },
      });

      const auditFields = {
        hospitalId,
        userId: approverId,
        action: 'EMPLOYEE_ADVANCE_REJECTED',
        entity: 'EmployeeAdvance',
        entityId: saved.id,
        details: { advanceNumber: saved.advanceNumber },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  // =========================================================================
  // 2. RECURRING & ONE-TIME ALLOWANCES / DEDUCTIONS / PENALTIES
  // =========================================================================

  async listDeductions(hospitalId: number, userId?: number, kind?: string) {
    return this.prisma.employeeDeduction.findMany({
      where: {
        hospitalId,
        ...(userId ? { userId } : {}),
        ...(kind ? { kind } : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { id: 'desc' },
    });
  }

  async createDeduction(
    hospitalId: number,
    createdById: number,
    dto: CreateEmployeeDeductionDto,
  ) {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (
      Number.isNaN(effectiveFrom.getTime()) ||
      (effectiveTo && Number.isNaN(effectiveTo.getTime()))
    ) {
      throw new BadRequestException('تواريخ السريان غير صالحة.');
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException(
        'تاريخ انتهاء السريان يجب أن يكون بعد أو مساويًا لتاريخ البداية.',
      );
    }

    const amountDec = Money.roundDecimal(dto.amount, 3);
    if (!amountDec.gt(0)) {
      throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر.');
    }

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const employee = await tx.user.findFirst({
        where: { id: dto.userId, hospitalId, isDeleted: false },
        select: { id: true },
      });
      if (!employee) {
        throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
      }

      const item = await tx.employeeDeduction.create({
        data: {
          hospitalId,
          userId: dto.userId,
          kind: dto.kind,
          category: dto.category,
          title: dto.title.trim(),
          amount: Money.toDbString(amountDec),
          isRecurring: dto.isRecurring ?? true,
          effectiveFrom,
          effectiveTo,
          isActive: true,
          createdById,
          notes: dto.notes?.trim() || null,
        },
        include: {
          user: { select: { id: true, fullName: true, username: true } },
        },
      });

      const auditFields = {
        hospitalId,
        userId: createdById,
        action: 'EMPLOYEE_COMPENSATION_ITEM_CREATED',
        entity: 'EmployeeDeduction',
        entityId: item.id,
        details: {
          targetUserId: dto.userId,
          kind: dto.kind,
          category: dto.category,
          amount: Money.toDbString(amountDec),
          isRecurring: item.isRecurring,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;

      return item;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async deactivateDeduction(
    hospitalId: number,
    id: number,
    actorUserId: number,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.employeeDeduction.findFirst({
        where: { id, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('بند الاستقطاع أو البدل غير موجود.');
      }
      const saved = await tx.employeeDeduction.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'EMPLOYEE_COMPENSATION_ITEM_DEACTIVATED',
        entity: 'EmployeeDeduction',
        entityId: saved.id,
        details: { targetUserId: saved.userId, kind: saved.kind },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  // =========================================================================
  // 3. OVERTIME REQUESTS (4-EYES + PAYROLL LOCK CHECK + DAY-TYPE MULTIPLIERS)
  // =========================================================================

  async listOvertimes(hospitalId: number, userId?: number, status?: string) {
    return this.prisma.overtimeRequest.findMany({
      where: {
        hospitalId,
        ...(userId ? { userId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async createOvertime(
    hospitalId: number,
    requestedById: number,
    dto: CreateOvertimeRequestDto,
  ) {
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('تاريخ العمل الإضافي غير صالح.');
    }
    const dayType: OvertimeDayType = dto.dayType ?? 'NORMAL';
    const multiplier = OVERTIME_DEFAULT_MULTIPLIERS[dayType];

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const employee = await tx.user.findFirst({
        where: { id: dto.userId, hospitalId, isDeleted: false },
        select: { id: true, isActive: true },
      });
      if (!employee || !employee.isActive) {
        throw new NotFoundException('الموظف غير موجود أو غير نشط في المنشأة.');
      }

      const lockedRun = await tx.payrollRun.findFirst({
        where: {
          hospitalId,
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          status: { in: ['APPROVED', 'PAID'] },
        },
        select: { id: true },
      });
      if (lockedRun) {
        throw new ConflictException(
          'تم اعتماد كشف رواتب هذا الشهر؛ لا يمكن إضافة عمل إضافي لفترة مغلقة.',
        );
      }

      const ot = await tx.overtimeRequest.create({
        data: {
          hospitalId,
          userId: dto.userId,
          date,
          requestedHours: Money.toDbString(dto.requestedHours),
          dayType,
          multiplier,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim() || null,
          status: 'REQUESTED',
          requestedById,
        },
        include: {
          user: { select: { id: true, fullName: true, username: true } },
        },
      });

      const auditFields = {
        hospitalId,
        userId: requestedById,
        action: 'OVERTIME_REQUEST_CREATED',
        entity: 'OvertimeRequest',
        entityId: ot.id,
        details: {
          targetUserId: dto.userId,
          date: date.toISOString().slice(0, 10),
          requestedHours: Money.toDbString(dto.requestedHours),
          dayType,
          multiplier,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return ot;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async approveOvertime(
    hospitalId: number,
    overtimeId: number,
    approverId: number,
    dto: ApproveOvertimeRequestDto,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.overtimeRequest.findFirst({
        where: { id: overtimeId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('طلب العمل الإضافي غير موجود.');
      }
      if (existing.status !== 'REQUESTED') {
        throw new ConflictException('طلب العمل الإضافي تمت معالجته مسبقًا.');
      }
      if (existing.userId === approverId) {
        throw new ForbiddenException(
          'رقابة 4 عيون: لا يمكن للموظف اعتماد عمل إضافي لنفسه.',
        );
      }
      if (Money.decimal(dto.approvedHours).gt(existing.requestedHours)) {
        throw new BadRequestException(
          'الساعات المعتمدة لا يمكن أن تتجاوز الساعات المطلوبة.',
        );
      }

      const saved = await tx.overtimeRequest.update({
        where: { id: existing.id },
        data: {
          status: 'APPROVED',
          approvedHours: Money.toDbString(dto.approvedHours),
          ...(dto.multiplier !== undefined
            ? { multiplier: Money.toDbString(dto.multiplier) }
            : {}),
          ...(dto.notes ? { notes: dto.notes.trim() } : {}),
          approvedById: approverId,
          approvedAt: new Date(),
        },
      });

      const auditFields = {
        hospitalId,
        userId: approverId,
        action: 'OVERTIME_REQUEST_APPROVED',
        entity: 'OvertimeRequest',
        entityId: saved.id,
        details: {
          targetUserId: saved.userId,
          approvedHours: Money.toDbString(dto.approvedHours),
          multiplier: Money.toDbString(saved.multiplier),
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  // =========================================================================
  // 4. END-OF-SERVICE SETTLEMENT (EOS INDEMNITY + 4-DEPT CLEARANCE + GL)
  // =========================================================================

  async previewSettlement(hospitalId: number, dto: PreviewEndOfServiceDto) {
    const effectiveDate = new Date(dto.effectiveDate);
    if (Number.isNaN(effectiveDate.getTime())) {
      throw new BadRequestException('تاريخ نهاية الخدمة غير صالح.');
    }

    const employee = await this.prisma.user.findFirst({
      where: { id: dto.userId, hospitalId, isDeleted: false },
      select: {
        id: true,
        fullName: true,
        username: true,
        basicSalary: true,
        annualLeaveBalance: true,
        hireDate: true,
        isActive: true,
        employmentStatus: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('الموظف غير موجود في هذه المنشأة.');
    }

    const hireDate = dto.hireDateOverride
      ? new Date(dto.hireDateOverride)
      : (employee.hireDate ?? effectiveDate);
    if (Number.isNaN(hireDate.getTime()) || effectiveDate < hireDate) {
      throw new BadRequestException(
        'تاريخ نهاية الخدمة يجب أن يكون بعد أو مساويًا لتاريخ التعيين.',
      );
    }

    const activeAdvances = await this.prisma.employeeAdvance.findMany({
      where: {
        hospitalId,
        userId: employee.id,
        status: 'APPROVED',
        remainingAmount: { gt: 0 },
      },
      select: {
        id: true,
        advanceNumber: true,
        amount: true,
        remainingAmount: true,
      },
      orderBy: { id: 'asc' },
    });

    const activeAdvancesTotal = activeAdvances.length
      ? Money.sumPosted(...activeAdvances.map((a) => a.remainingAmount))
      : Money.decimal(0);

    const calculation = calculateEndOfService({
      basicSalary: employee.basicSalary,
      hireDate,
      effectiveDate,
      terminationType: dto.terminationType as TerminationType,
      unusedAnnualLeaveDays: employee.annualLeaveBalance,
      activeAdvancesTotal,
      otherAdditions: dto.otherAdditions ?? 0,
      otherDeductions: dto.otherDeductions ?? 0,
    });

    return {
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        username: employee.username,
        hireDate: hireDate.toISOString(),
        basicSalary: Money.toDbString(employee.basicSalary),
        annualLeaveBalance: employee.annualLeaveBalance,
        employmentStatus: employee.employmentStatus,
      },
      activeAdvances: activeAdvances.map((a) => ({
        id: a.id,
        advanceNumber: a.advanceNumber,
        amount: Money.toDbString(a.amount),
        remainingAmount: Money.toDbString(a.remainingAmount),
      })),
      calculation,
    };
  }

  async listSettlements(hospitalId: number, status?: string) {
    return this.prisma.employeeSettlement.findMany({
      where: { hospitalId, ...(status ? { status } : {}) },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        paidBy: { select: { id: true, fullName: true } },
      },
      orderBy: { id: 'desc' },
    });
  }

  async createSettlement(
    hospitalId: number,
    createdById: number,
    dto: CreateEndOfServiceDto,
  ) {
    const preview = await this.previewSettlement(hospitalId, dto);
    const hireDate = new Date(preview.employee.hireDate);
    const effectiveDate = new Date(dto.effectiveDate);

    let committedAudit: Record<string, unknown> | null = null;
    const created = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_HR_FINANCIAL}::int, ${hospitalId}::int)`;

      const existingOpen = await tx.employeeSettlement.findFirst({
        where: {
          hospitalId,
          userId: dto.userId,
          status: { in: ['DRAFT', 'APPROVED', 'PAID'] },
        },
        select: { id: true, settlementNo: true, status: true },
      });
      if (existingOpen) {
        throw new ConflictException(
          `توجد مخالصة نهاية خدمة قائمة بالفعل لهذا الموظف (${existingOpen.settlementNo} — ${existingOpen.status}).`,
        );
      }

      const year = effectiveDate.getUTCFullYear();
      const count = await tx.employeeSettlement.count({
        where: { hospitalId },
      });
      const settlementNo = `STL-${year}-${String(count + 1).padStart(4, '0')}`;

      const calc = preview.calculation;
      const settlement = await tx.employeeSettlement.create({
        data: {
          hospitalId,
          userId: dto.userId,
          settlementNo,
          terminationType: dto.terminationType,
          hireDate,
          effectiveDate,
          reason: dto.reason?.trim() || null,
          serviceYears: calc.serviceYears,
          serviceMonths: calc.serviceMonths,
          serviceDays: calc.serviceDays,
          basicSalary: calc.basicSalary,
          dailyRate: calc.dailyRate,
          lastMonthDays: calc.lastMonthDays,
          lastMonthAmount: calc.lastMonthAmount,
          leaveDaysUnused: calc.leaveDaysUnused,
          leaveCompensationAmount: calc.leaveCompensationAmount,
          gratuityAmount: calc.gratuityAmount,
          otherAdditions: calc.otherAdditions,
          additionsNotes: dto.additionsNotes?.trim() || null,
          totalEarnings: calc.totalEarnings,
          advancesDeduction: calc.advancesDeduction,
          otherDeductions: calc.otherDeductions,
          deductionsNotes: dto.deductionsNotes?.trim() || null,
          totalDeductions: calc.totalDeductions,
          netAmount: calc.netAmount,
          isDepartmentCleared: Boolean(dto.isDepartmentCleared),
          isItCleared: Boolean(dto.isItCleared),
          isFinanceCleared: Boolean(dto.isFinanceCleared),
          isHrCleared: Boolean(dto.isHrCleared),
          clearanceNotes: dto.clearanceNotes?.trim() || null,
          status: 'DRAFT',
          createdById,
        },
        include: {
          user: { select: { id: true, fullName: true, username: true } },
        },
      });

      const auditFields = {
        hospitalId,
        userId: createdById,
        action: 'EOS_SETTLEMENT_DRAFT_CREATED',
        entity: 'EmployeeSettlement',
        entityId: settlement.id,
        details: {
          settlementNo: settlement.settlementNo,
          targetUserId: dto.userId,
          terminationType: dto.terminationType,
          totalEarnings: calc.totalEarnings,
          totalDeductions: calc.totalDeductions,
          netAmount: calc.netAmount,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;

      return settlement;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return created;
  }

  async updateSettlementClearance(
    hospitalId: number,
    settlementId: number,
    actorUserId: number,
    dto: UpdateSettlementClearanceDto,
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      const existing = await tx.employeeSettlement.findFirst({
        where: { id: settlementId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException('سند المخالصة غير موجود في هذه المنشأة.');
      }
      if (existing.status !== 'DRAFT') {
        throw new ConflictException(
          'لا يمكن تعديل إخلاء الطرف بعد اعتماد أو صرف المخالصة.',
        );
      }

      const saved = await tx.employeeSettlement.update({
        where: { id: existing.id },
        data: {
          ...(dto.isDepartmentCleared !== undefined
            ? { isDepartmentCleared: dto.isDepartmentCleared }
            : {}),
          ...(dto.isItCleared !== undefined
            ? { isItCleared: dto.isItCleared }
            : {}),
          ...(dto.isFinanceCleared !== undefined
            ? { isFinanceCleared: dto.isFinanceCleared }
            : {}),
          ...(dto.isHrCleared !== undefined
            ? { isHrCleared: dto.isHrCleared }
            : {}),
          ...(dto.clearanceNotes !== undefined
            ? { clearanceNotes: dto.clearanceNotes.trim() || null }
            : {}),
        },
      });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: 'EOS_SETTLEMENT_CLEARANCE_UPDATED',
        entity: 'EmployeeSettlement',
        entityId: saved.id,
        details: {
          isDepartmentCleared: saved.isDepartmentCleared,
          isItCleared: saved.isItCleared,
          isFinanceCleared: saved.isFinanceCleared,
          isHrCleared: saved.isHrCleared,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return updated;
  }

  async approveAndExecuteSettlement(
    hospitalId: number,
    settlementId: number,
    approverId: number,
    dto: ApproveSettlementDto = {},
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const executed = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_HR_FINANCIAL}::int, ${hospitalId}::int)`;

      const locked = await tx.$queryRaw<
        Array<{
          id: number;
          hospitalId: number;
          userId: number;
          status: string;
        }>
      >`SELECT "id", "hospitalId", "userId", "status" FROM "EmployeeSettlement" WHERE "id" = ${settlementId} FOR UPDATE`;

      if (!locked.length || locked[0].hospitalId !== hospitalId) {
        throw new NotFoundException('سند المخالصة غير موجود في هذه المنشأة.');
      }

      const settlement = await tx.employeeSettlement.findUniqueOrThrow({
        where: { id: settlementId },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              isActive: true,
              employmentStatus: true,
              terminationDate: true,
            },
          },
        },
      });

      if (settlement.status !== 'DRAFT') {
        throw new ConflictException('الاعتماد متاح لمسودة مخالصة (DRAFT) فقط.');
      }
      if (!settlement.user || settlement.userId === null) {
        throw new ConflictException(
          'سجل المستخدم المرتبط بالمخالصة غير موجود.',
        );
      }
      const targetUserId = settlement.userId;
      if (!settlement.user.isActive) {
        throw new ConflictException('الموظف غير نشط بالفعل.');
      }
      if (
        approverId === targetUserId ||
        approverId === settlement.createdById
      ) {
        throw new ForbiddenException(
          'رقابة 4 عيون: يجب أن يكون المعتمد مختلفًا عن الموظف ومعدّ مسودة المخالصة.',
        );
      }
      if (
        !settlement.isDepartmentCleared ||
        !settlement.isItCleared ||
        !settlement.isFinanceCleared ||
        !settlement.isHrCleared
      ) {
        throw new ConflictException(
          'يجب استكمال إخلاء الطرف من الجهات الأربع (القسم، تقنية المعلومات، المالية، الموارد البشرية) قبل الاعتماد.',
        );
      }

      // Lock user and active advances to guarantee zero balance drift
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${targetUserId} FOR UPDATE`;
      await tx.$executeRaw`SELECT "id" FROM "EmployeeAdvance" WHERE "hospitalId" = ${hospitalId} AND "userId" = ${targetUserId} ORDER BY "id" FOR UPDATE`;

      const activeAdvances = await tx.employeeAdvance.findMany({
        where: {
          hospitalId,
          userId: targetUserId,
          status: 'APPROVED',
          remainingAmount: { gt: 0 },
        },
        orderBy: { id: 'asc' },
      });

      const currentAdvTotal = activeAdvances.length
        ? Money.sumPosted(...activeAdvances.map((a) => a.remainingAmount))
        : Money.decimal(0);

      if (!Money.eq(currentAdvTotal, settlement.advancesDeduction)) {
        throw new ConflictException(
          'رصيد السلف النشطة تغيّر منذ إعداد المسودة؛ أعد احتساب المخالصة قبل الاعتماد.',
        );
      }

      // Optional / standard GL accrual posting
      let accrualEntryId: number | null = null;
      const shouldPostAccounting = dto.postAccounting !== false;
      const totalEarnDec = Money.roundDecimal(settlement.totalEarnings, 3);
      const advDedDec = Money.roundDecimal(settlement.advancesDeduction, 3);
      const otherDedDec = Money.roundDecimal(settlement.otherDeductions, 3);
      const netDec = Money.roundDecimal(settlement.netAmount, 3);

      if (
        shouldPostAccounting &&
        (totalEarnDec.gt(0) || advDedDec.gt(0) || otherDedDec.gt(0))
      ) {
        const { financialYear: fy, period } = await financialPeriod(
          tx,
          hospitalId,
          settlement.effectiveDate,
        );
        const eosAcc = await this.accounting.getSystemAccountOrThrow(
          hospitalId,
          SystemAccountKey.EOS_EXPENSE,
          tx,
        );
        const payableAcc = await this.accounting.getSystemAccountOrThrow(
          hospitalId,
          SystemAccountKey.SALARIES_PAYABLE,
          tx,
        );

        const lines: Array<{
          accountId: number;
          debit: string;
          credit: string;
          description: string;
        }> = [];

        if (totalEarnDec.gt(0)) {
          lines.push({
            accountId: eosAcc.id,
            debit: Money.toDbString(totalEarnDec),
            credit: '0.000',
            description: `استحقاق تصفية نهاية خدمة (${settlement.settlementNo}) - ${settlement.user.fullName}`,
          });
        }
        if (advDedDec.gt(0)) {
          const advAcc = await this.accounting.getSystemAccountOrThrow(
            hospitalId,
            SystemAccountKey.EMPLOYEE_ADVANCES,
            tx,
          );
          lines.push({
            accountId: advAcc.id,
            debit: '0.000',
            credit: Money.toDbString(advDedDec),
            description: `تسوية سلف الموظف (${settlement.settlementNo}) - ${settlement.user.fullName}`,
          });
        }
        if (otherDedDec.gt(0)) {
          const dedAcc = await this.accounting.getSystemAccountOrThrow(
            hospitalId,
            SystemAccountKey.EMPLOYEE_DEDUCTIONS_PAYABLE,
            tx,
          );
          lines.push({
            accountId: dedAcc.id,
            debit: '0.000',
            credit: Money.toDbString(otherDedDec),
            description: `استقطاعات مخالصة (${settlement.settlementNo}) - ${settlement.user.fullName}`,
          });
        }
        if (netDec.gt(0)) {
          lines.push({
            accountId: payableAcc.id,
            debit: '0.000',
            credit: Money.toDbString(netDec),
            description: `صافي مخالصة مستحق الدفع (${settlement.settlementNo})`,
          });
        } else if (netDec.lt(0)) {
          lines.push({
            accountId: payableAcc.id,
            debit: Money.toDbString(netDec.abs()),
            credit: '0.000',
            description: `رصيد مستحق على الموظف بعد المخالصة (${settlement.settlementNo})`,
          });
        }

        const entry = await tx.accountingEntry.create({
          data: {
            hospitalId,
            entryDate: settlement.effectiveDate,
            financialYearId: fy.id,
            financialPeriodId: period.id,
            sourceModule: AccountingSourceModule.PAYROLL,
            sourceId: settlement.id,
            postingKey: `hr-eos-accrual:${hospitalId}:${settlement.id}`,
            description: `استحقاق مخالصة نهاية خدمة ${settlement.settlementNo} - ${settlement.user.fullName}`,
            createdById: approverId,
            lines: { create: lines },
          },
        });
        accrualEntryId = entry.id;
      }

      const signatureHash = computeSettlementSignatureHash({
        hospitalId,
        settlementId: settlement.id,
        settlementNo: settlement.settlementNo,
        userId: targetUserId,
        terminationType: settlement.terminationType,
        effectiveDateIso: settlement.effectiveDate.toISOString(),
        totalEarnings: Money.toDbString(settlement.totalEarnings),
        totalDeductions: Money.toDbString(settlement.totalDeductions),
        netAmount: Money.toDbString(settlement.netAmount),
        approvedById: approverId,
      });

      const snapshot: Prisma.InputJsonValue = {
        version: 1,
        priorUser: {
          isActive: settlement.user.isActive,
          employmentStatus: settlement.user.employmentStatus,
          terminationDate:
            settlement.user.terminationDate?.toISOString() ?? null,
        },
        settledAdvances: activeAdvances.map((a) => ({
          id: a.id,
          advanceNumber: a.advanceNumber,
          settledAmount: Money.toDbString(a.remainingAmount),
        })),
      };

      // 1. Settle all active advances atomically
      for (const adv of activeAdvances) {
        await tx.employeeAdvance.update({
          where: { id: adv.id },
          data: { remainingAmount: '0.000', status: 'SETTLED' },
        });
      }

      // 2. Deactivate employee & revoke all active StaffSessions
      const nextEmploymentStatus =
        settlement.terminationType === 'RESIGNATION'
          ? 'RESIGNED'
          : settlement.terminationType === 'END_OF_CONTRACT'
            ? 'END_OF_CONTRACT'
            : settlement.terminationType === 'RETIREMENT'
              ? 'RETIRED'
              : 'TERMINATED';

      await tx.user.update({
        where: { id: targetUserId },
        data: {
          isActive: false,
          employmentStatus: nextEmploymentStatus,
          terminationDate: settlement.effectiveDate,
        },
      });
      await tx.staffSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3. Seal settlement as APPROVED with SHA-256 signature
      const saved = await tx.employeeSettlement.update({
        where: { id: settlement.id },
        data: {
          status: 'APPROVED',
          approvedById: approverId,
          approvedAt: new Date(),
          accrualEntryId,
          executionSnapshot: snapshot,
          signatureHash,
        },
        include: {
          user: { select: { id: true, fullName: true, username: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      });

      const auditFields = {
        hospitalId,
        userId: approverId,
        action: 'EOS_SETTLEMENT_APPROVED_AND_EXECUTED',
        entity: 'EmployeeSettlement',
        entityId: saved.id,
        details: {
          settlementNo: saved.settlementNo,
          targetUserId: saved.userId,
          nextEmploymentStatus,
          settledAdvancesCount: activeAdvances.length,
          accrualEntryId,
          signatureHash,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;

      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return executed;
  }

  async paySettlement(
    hospitalId: number,
    settlementId: number,
    payerId: number,
    dto: PaySettlementDto = {},
  ) {
    let committedAudit: Record<string, unknown> | null = null;
    const paid = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_HR_FINANCIAL}::int, ${hospitalId}::int)`;

      const existing = await tx.employeeSettlement.findFirst({
        where: { id: settlementId, hospitalId },
        include: { user: { select: { fullName: true } } },
      });
      if (!existing) {
        throw new NotFoundException('سند المخالصة غير موجود في هذه المنشأة.');
      }
      if (existing.status !== 'APPROVED') {
        throw new ConflictException(
          'يمكن صرف المخالصة المعتمدة (APPROVED) غير المدفوعة فقط.',
        );
      }

      const paymentDate = dto.paymentDate
        ? new Date(dto.paymentDate)
        : new Date();
      if (Number.isNaN(paymentDate.getTime())) {
        throw new BadRequestException('تاريخ الصرف غير صالح.');
      }

      let paymentEntryId: number | null = null;
      const netDec = Money.roundDecimal(existing.netAmount, 3);
      if (dto.postAccounting !== false && netDec.gt(0)) {
        const { financialYear: fy, period } = await financialPeriod(
          tx,
          hospitalId,
          paymentDate,
        );
        const payableAcc = await this.accounting.getSystemAccountOrThrow(
          hospitalId,
          SystemAccountKey.SALARIES_PAYABLE,
          tx,
        );
        const treasuryKey =
          dto.paymentMethod === 'BANK'
            ? SystemAccountKey.BANK_MAIN
            : SystemAccountKey.CASH_MAIN;
        const treasuryAcc = await this.accounting.getSystemAccountOrThrow(
          hospitalId,
          treasuryKey,
          tx,
        );
        const netText = Money.toDbString(netDec);
        const entry = await tx.accountingEntry.create({
          data: {
            hospitalId,
            entryDate: paymentDate,
            financialYearId: fy.id,
            financialPeriodId: period.id,
            sourceModule: AccountingSourceModule.PAYROLL,
            sourceId: existing.id,
            postingKey: `hr-eos-pay:${hospitalId}:${existing.id}`,
            description: `صرف صافي مخالصة نهاية خدمة ${existing.settlementNo} - ${existing.user?.fullName ?? ''}`,
            createdById: payerId,
            lines: {
              create: [
                {
                  accountId: payableAcc.id,
                  debit: netText,
                  credit: '0.000',
                  description: `إقفال مستحقات مخالصة ${existing.settlementNo}`,
                },
                {
                  accountId: treasuryAcc.id,
                  debit: '0.000',
                  credit: netText,
                  description: `صرف مخالصة ${existing.settlementNo}`,
                },
              ],
            },
          },
        });
        paymentEntryId = entry.id;
      }

      const saved = await tx.employeeSettlement.update({
        where: { id: existing.id },
        data: {
          status: 'PAID',
          paidById: payerId,
          paidAt: paymentDate,
          paymentEntryId,
        },
      });

      const auditFields = {
        hospitalId,
        userId: payerId,
        action: 'EOS_SETTLEMENT_PAID',
        entity: 'EmployeeSettlement',
        entityId: saved.id,
        details: {
          settlementNo: saved.settlementNo,
          netAmount: Money.toDbString(saved.netAmount),
          paymentEntryId,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return saved;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return paid;
  }

  async verifySettlement(hospitalId: number, settlementId: number) {
    const s = await this.prisma.employeeSettlement.findFirst({
      where: { id: settlementId, hospitalId },
    });
    if (!s) {
      throw new NotFoundException('سند المخالصة غير موجود في هذه المنشأة.');
    }
    if (!s.signatureHash || !s.approvedById) {
      return { valid: false, status: s.status, reason: 'UNSIGNED' };
    }
    const recomputed = computeSettlementSignatureHash({
      hospitalId: s.hospitalId,
      settlementId: s.id,
      settlementNo: s.settlementNo,
      userId: s.userId ?? 0,
      terminationType: s.terminationType,
      effectiveDateIso: s.effectiveDate.toISOString(),
      totalEarnings: Money.toDbString(s.totalEarnings),
      totalDeductions: Money.toDbString(s.totalDeductions),
      netAmount: Money.toDbString(s.netAmount),
      approvedById: s.approvedById,
    });
    return {
      valid: recomputed === s.signatureHash,
      status: s.status,
      settlementNo: s.settlementNo,
      signatureHash: s.signatureHash,
    };
  }
}
