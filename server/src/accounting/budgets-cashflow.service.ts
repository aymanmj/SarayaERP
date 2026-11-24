// server/src/accounting/budgets-cashflow.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingSourceModule,
  AccountType,
  SystemAccountKey,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/utils/money.util';
import { tafqeetArabic, tafqeetVoucher } from '../common/utils/tafqeet.util';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { UpsertBudgetLineDto } from './dto/budgets-cashflow.dto';

type CashFlowCategory =
  | 'OPERATING'
  | 'INVESTING'
  | 'FINANCING'
  | 'UNCLASSIFIED';

type PeriodKey =
  | 'period1'
  | 'period2'
  | 'period3'
  | 'period4'
  | 'period5'
  | 'period6'
  | 'period7'
  | 'period8'
  | 'period9'
  | 'period10'
  | 'period11'
  | 'period12';

@Injectable()
export class BudgetsCashFlowService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 1. MULTI-TENANT FINANCIAL BUDGETS & BUDGET VS ACTUAL VARIANCE
  // =========================================================================

  async listBudgetLines(hospitalId: number, financialYearId: number) {
    return this.prisma.budgetLine.findMany({
      where: { hospitalId, financialYearId },
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  async upsertBudgetLine(
    hospitalId: number,
    actorUserId: number,
    dto: UpsertBudgetLineDto,
  ) {
    const periods: Record<PeriodKey, string> = {
      period1: Money.toDbString(dto.period1 ?? 0),
      period2: Money.toDbString(dto.period2 ?? 0),
      period3: Money.toDbString(dto.period3 ?? 0),
      period4: Money.toDbString(dto.period4 ?? 0),
      period5: Money.toDbString(dto.period5 ?? 0),
      period6: Money.toDbString(dto.period6 ?? 0),
      period7: Money.toDbString(dto.period7 ?? 0),
      period8: Money.toDbString(dto.period8 ?? 0),
      period9: Money.toDbString(dto.period9 ?? 0),
      period10: Money.toDbString(dto.period10 ?? 0),
      period11: Money.toDbString(dto.period11 ?? 0),
      period12: Money.toDbString(dto.period12 ?? 0),
    };
    const totalBudget = Money.toDbString(
      Money.sumPosted(...Object.values(periods)),
    );

    let committedAudit: Record<string, unknown> | null = null;
    const saved = await this.prisma.$transaction(async (tx) => {
      committedAudit = null;
      await tx.$executeRaw`SELECT "id" FROM "FinancialYear" WHERE "id" = ${dto.financialYearId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;

      const fy = await tx.financialYear.findFirst({
        where: { id: dto.financialYearId, hospitalId },
        select: { id: true, status: true },
      });
      if (!fy) {
        throw new NotFoundException('السنة المالية غير موجودة في هذه المنشأة.');
      }
      if (fy.status !== 'OPEN') {
        throw new ConflictException('لا يمكن تعديل الموازنة لسنة مالية مغلقة.');
      }

      const acc = await tx.account.findFirst({
        where: { id: dto.accountId, hospitalId, isActive: true },
        select: { id: true, code: true, name: true },
      });
      if (!acc) {
        throw new NotFoundException('الحساب المحاسبي غير موجود أو غير نشط.');
      }

      if (dto.costCenterId !== undefined) {
        const cc = await tx.costCenter.findFirst({
          where: { id: dto.costCenterId, hospitalId, isActive: true },
          select: { id: true },
        });
        if (!cc) {
          throw new NotFoundException('مركز التكلفة غير موجود في المنشأة.');
        }
      }

      const existing = await tx.budgetLine.findFirst({
        where: {
          hospitalId,
          financialYearId: dto.financialYearId,
          accountId: dto.accountId,
          costCenterId: dto.costCenterId ?? null,
        },
      });

      const line = existing
        ? await tx.budgetLine.update({
            where: { id: existing.id },
            data: {
              ...periods,
              totalBudget,
              notes: dto.notes?.trim() ?? existing.notes,
            },
            include: {
              account: { select: { id: true, code: true, name: true } },
            },
          })
        : await tx.budgetLine.create({
            data: {
              hospitalId,
              financialYearId: dto.financialYearId,
              accountId: dto.accountId,
              costCenterId: dto.costCenterId ?? null,
              ...periods,
              totalBudget,
              notes: dto.notes?.trim() || null,
              createdById: actorUserId,
            },
            include: {
              account: { select: { id: true, code: true, name: true } },
            },
          });

      const auditFields = {
        hospitalId,
        userId: actorUserId,
        action: existing ? 'BUDGET_LINE_UPDATED' : 'BUDGET_LINE_CREATED',
        entity: 'BudgetLine',
        entityId: line.id,
        details: {
          financialYearId: dto.financialYearId,
          accountCode: acc.code,
          totalBudget,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return line;
    });

    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return saved;
  }

  async getBudgetVsActual(
    hospitalId: number,
    financialYearId: number,
    costCenterId?: number,
  ) {
    const fy = await this.prisma.financialYear.findFirst({
      where: { id: financialYearId, hospitalId },
      include: { periods: { orderBy: { periodIndex: 'asc' } } },
    });
    if (!fy) {
      throw new NotFoundException('السنة المالية غير موجودة في هذه المنشأة.');
    }

    const lines = await this.prisma.budgetLine.findMany({
      where: {
        hospitalId,
        financialYearId,
        ...(costCenterId !== undefined ? { costCenterId } : {}),
      },
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
      orderBy: { id: 'asc' },
    });

    const periodIdToIdx = new Map<number, number>();
    for (const p of fy.periods) {
      const idx = Math.max(0, Math.min(11, p.periodIndex - 1));
      periodIdToIdx.set(p.id, idx);
    }

    const actualEntryLines = await this.prisma.accountingEntryLine.findMany({
      where: {
        ...(costCenterId !== undefined ? { costCenterId } : {}),
        entry: {
          hospitalId,
          financialYearId,
          sourceModule: {
            notIn: [
              AccountingSourceModule.CLOSING,
              AccountingSourceModule.OPENING,
            ],
          },
        },
      },
      select: {
        accountId: true,
        costCenterId: true,
        debit: true,
        credit: true,
        entry: { select: { financialPeriodId: true, entryDate: true } },
      },
    });

    const rows = lines.map((line) => {
      const isCreditNatural =
        line.account.type === AccountType.REVENUE ||
        line.account.type === AccountType.LIABILITY ||
        line.account.type === AccountType.EQUITY;

      const monthlyActuals = Array.from({ length: 12 }, () => Money.decimal(0));
      for (const act of actualEntryLines) {
        if (act.accountId !== line.accountId) continue;
        if (
          line.costCenterId !== null &&
          act.costCenterId !== line.costCenterId
        )
          continue;

        let idx =
          act.entry.financialPeriodId !== null
            ? periodIdToIdx.get(act.entry.financialPeriodId)
            : undefined;
        if (idx === undefined) {
          idx = act.entry.entryDate.getUTCMonth();
        }
        const net = isCreditNatural
          ? Money.subtractDecimal(act.credit, act.debit)
          : Money.subtractDecimal(act.debit, act.credit);
        monthlyActuals[idx] = monthlyActuals[idx].plus(net);
      }

      const actualTotalDec = Money.sumPosted(...monthlyActuals);
      const budgetTotalDec = Money.roundDecimal(line.totalBudget, 3);
      // Variance = Budget - Actual (for Expense: positive = under budget / favorable; for Revenue: Actual - Budget)
      const varianceDec = isCreditNatural
        ? Money.roundDecimal(
            Money.subtractDecimal(actualTotalDec, budgetTotalDec),
            3,
          )
        : Money.roundDecimal(
            Money.subtractDecimal(budgetTotalDec, actualTotalDec),
            3,
          );

      const utilizationPct = budgetTotalDec.gt(0)
        ? Money.toDbString(
            Money.roundDecimal(
              Money.divide(Money.multiply(actualTotalDec, 100), budgetTotalDec),
              2,
            ),
          )
        : '0.000';

      return {
        budgetLineId: line.id,
        accountId: line.accountId,
        accountCode: line.account.code,
        accountName: line.account.name,
        accountType: line.account.type,
        costCenter: line.costCenter,
        totalBudget: Money.toDbString(budgetTotalDec),
        totalActual: Money.toDbString(actualTotalDec),
        variance: Money.toDbString(varianceDec),
        utilizationPct,
        monthlyActuals: monthlyActuals.map((m) => Money.toDbString(m)),
      };
    });

    return {
      financialYearId: fy.id,
      financialYearName: fy.name,
      rows,
    };
  }

  // =========================================================================
  // 2. STATEMENT OF CASH FLOWS (OPERATING / INVESTING / FINANCING)
  // =========================================================================

  async getCashFlowStatement(
    hospitalId: number,
    startDateStr?: string,
    endDateStr?: string,
    costCenterId?: number,
  ) {
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(Date.UTC(endDate.getUTCFullYear(), 0, 1));

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate < startDate
    ) {
      throw new BadRequestException(
        'نطاق تاريخ قائمة التدفقات النقدية غير صالح.',
      );
    }

    // Resolve all Cash & Bank accounts for this hospital
    const [systemCashMappings, bankAccounts] = await Promise.all([
      this.prisma.systemAccountMapping.findMany({
        where: {
          hospitalId,
          isActive: true,
          key: {
            in: [
              SystemAccountKey.CASH_MAIN,
              SystemAccountKey.CASH_PETTY,
              SystemAccountKey.BANK_MAIN,
            ],
          },
        },
        select: { accountId: true },
      }),
      this.prisma.bankAccount.findMany({
        where: { hospitalId, isActive: true },
        select: { accountId: true },
      }),
    ]);

    const cashAccountIds = new Set<number>([
      ...systemCashMappings.map((m) => m.accountId),
      ...bankAccounts.map((b) => b.accountId),
    ]);

    if (cashAccountIds.size === 0) {
      throw new BadRequestException(
        'عرّف حسابات النقدية أو البنوك للمنشأة قبل إعداد قائمة التدفقات النقدية.',
      );
    }

    const cashAccounts = await this.prisma.account.findMany({
      where: { hospitalId, id: { in: [...cashAccountIds] } },
      select: { id: true, code: true, name: true },
    });

    const entries = await this.prisma.accountingEntry.findMany({
      where: {
        hospitalId,
        entryDate: { lte: endDate },
        sourceModule: { not: AccountingSourceModule.CLOSING },
        lines: {
          some: {
            accountId: { in: [...cashAccountIds] },
            ...(costCenterId !== undefined ? { costCenterId } : {}),
          },
        },
      },
      include: {
        lines: {
          where: costCenterId !== undefined ? { costCenterId } : undefined,
          include: {
            account: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
        },
      },
      orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
    });

    let openingDec = Money.decimal(0);
    let closingDec = Money.decimal(0);
    const grouped = new Map<
      CashFlowCategory,
      Map<string, ReturnType<typeof Money.decimal>>
    >();

    const addBucket = (
      cat: CashFlowCategory,
      label: string,
      amt: ReturnType<typeof Money.decimal>,
    ) => {
      const m =
        grouped.get(cat) ?? new Map<string, ReturnType<typeof Money.decimal>>();
      const prev = m.get(label) ?? Money.decimal(0);
      m.set(label, prev.plus(amt));
      grouped.set(cat, m);
    };

    const classifyCounterAccount = (
      accType: AccountType,
      accCode: string,
    ): CashFlowCategory => {
      if (accType === AccountType.EQUITY) return 'FINANCING';
      if (accType === AccountType.REVENUE || accType === AccountType.EXPENSE) {
        return 'OPERATING';
      }
      if (
        accType === AccountType.ASSET &&
        (accCode.startsWith('15') || accCode.startsWith('16'))
      ) {
        return 'INVESTING';
      }
      if (accType === AccountType.ASSET || accType === AccountType.LIABILITY) {
        return 'OPERATING';
      }
      return 'UNCLASSIFIED';
    };

    for (const entry of entries) {
      const cashDelta = entry.lines
        .filter((l) => cashAccountIds.has(l.accountId))
        .reduce(
          (sum, l) => sum.plus(Money.subtractDecimal(l.debit, l.credit)),
          Money.decimal(0),
        );

      closingDec = closingDec.plus(cashDelta);

      if (
        entry.entryDate < startDate ||
        entry.sourceModule === AccountingSourceModule.OPENING
      ) {
        openingDec = openingDec.plus(cashDelta);
        continue;
      }

      // Internal cash-to-bank transfers cancel out cleanly
      if (cashDelta.isZero()) continue;

      const counterLines = entry.lines.filter(
        (l) => !cashAccountIds.has(l.accountId) && !Money.eq(l.debit, l.credit),
      );
      const counterSigned = counterLines.map((l) =>
        Money.subtractDecimal(l.credit, l.debit),
      );
      const counterSum = counterSigned.reduce(
        (acc, v) => acc.plus(v),
        Money.decimal(0),
      );

      if (
        !counterLines.length ||
        !Money.eq(counterSum, cashDelta) ||
        counterSigned.some((v) => v.isPositive() !== cashDelta.isPositive())
      ) {
        addBucket(
          'UNCLASSIFIED',
          'قيود مركبة أو تحويلات تحتاج مراجعة التصنيف',
          cashDelta,
        );
        continue;
      }

      counterLines.forEach((line, idx) => {
        const cat = classifyCounterAccount(
          line.account.type,
          line.account.code,
        );
        addBucket(
          cat,
          `${line.account.code} - ${line.account.name}`,
          counterSigned[idx],
        );
      });
    }

    const toRows = (cat: CashFlowCategory) =>
      [...(grouped.get(cat)?.entries() ?? [])].map(([description, amount]) => ({
        description,
        amount: Money.toDbString(Money.roundDecimal(amount, 3)),
      }));

    const operatingActivities = toRows('OPERATING');
    const investingActivities = toRows('INVESTING');
    const financingActivities = toRows('FINANCING');
    const unclassifiedActivities = toRows('UNCLASSIFIED');

    const netCashChangeDec = Money.roundDecimal(
      closingDec.minus(openingDec),
      3,
    );
    const classifiedSum = [...grouped.values()]
      .flatMap((m) => [...m.values()])
      .reduce((acc, v) => acc.plus(v), Money.decimal(0));

    return {
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      cashAccounts,
      operatingActivities,
      investingActivities,
      financingActivities,
      unclassifiedActivities,
      classificationComplete: unclassifiedActivities.length === 0,
      openingCashBalance: Money.toDbString(Money.roundDecimal(openingDec, 3)),
      netCashChange: Money.toDbString(netCashChangeDec),
      closingCashBalance: Money.toDbString(Money.roundDecimal(closingDec, 3)),
      reconciliationDifference: Money.toDbString(
        Money.roundDecimal(classifiedSum.minus(netCashChangeDec), 3),
      ),
      closingCashTafqeet: tafqeetVoucher(closingDec, 'LYD'),
    };
  }

  tafqeet(amount: string | number, currency = 'LYD') {
    const normalizedCurrency = currency.toUpperCase();
    return {
      amount: Money.toDbString(Money.roundDecimal(amount ?? 0, 3)),
      currency: normalizedCurrency,
      words: tafqeetArabic(amount, { currency: normalizedCurrency }),
      voucherWords: tafqeetVoucher(amount, { currency: normalizedCurrency }),
    };
  }
}
