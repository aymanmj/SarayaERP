import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SystemAccountKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money, RATE_SCALE } from '../common/utils/money.util';
import { financialPeriod } from './financial-posting';
import {
  CurrencyExchangeService,
  TreasuryAuditMeta,
} from './currency-exchange.service';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import {
  AutoMatchOptionsDto,
  CreateBankAccountDto,
  CreateReconciliationSessionDto,
  ImportStatementFileDto,
  ImportStatementItemsDto,
  ManualMatchStatementItemDto,
  PostBankAdjustmentDto,
  RunFxRevaluationDto,
} from './dto/treasury-fx.dto';
import {
  parseBankStatementCsv,
  parseBankStatementMt940,
} from './bank-statement-parser.util';

const USER_LITE = {
  id: true,
  fullName: true,
  username: true,
} as const;

const BANK_ACCOUNT_INCLUDE = {
  account: { select: { id: true, code: true, name: true, type: true } },
  currency: {
    select: {
      id: true,
      code: true,
      nameAr: true,
      symbol: true,
      decimalPlaces: true,
    },
  },
  createdBy: { select: USER_LITE },
} as const;

@Injectable()
export class BankReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyExchange: CurrencyExchangeService,
  ) {}

  async createBankAccount(
    hospitalId: number,
    userId: number,
    dto: CreateBankAccountDto,
    meta?: TreasuryAuditMeta,
  ) {
    const accountNumber = dto.accountNumber.trim();
    const bankName = dto.bankName.trim();

    const { bankAccount, audit } = await this.prisma.$transaction(
      async (tx) => {
        const [glAccount, currency] = await Promise.all([
          tx.account.findFirst({
            where: { id: dto.accountId, hospitalId, isActive: true },
          }),
          tx.currency.findFirst({
            where: { id: dto.currencyId, hospitalId, isActive: true },
          }),
        ]);

        if (!glAccount) {
          throw new NotFoundException(
            'حساب الأستاذ العام غير موجود أو غير نشط في هذه المنشأة',
          );
        }
        if (glAccount.type !== 'ASSET') {
          throw new BadRequestException(
            'يجب ربط الحساب البنكي بحساب أصول (ASSET) في دليل الحسابات',
          );
        }
        if (!currency) {
          throw new NotFoundException(
            'العملة المحددة غير موجودة أو غير نشطة في هذه المنشأة',
          );
        }

        const [existingGl, existingNumber] = await Promise.all([
          tx.bankAccount.findUnique({ where: { accountId: glAccount.id } }),
          tx.bankAccount.findUnique({
            where: { hospitalId_accountNumber: { hospitalId, accountNumber } },
          }),
        ]);
        if (existingGl) {
          throw new ConflictException(
            `حساب الأستاذ العام (${glAccount.code}) مرتبط مسبقًا بحساب بنكي آخر`,
          );
        }
        if (existingNumber) {
          throw new ConflictException(
            `رقم الحساب البنكي (${accountNumber}) مسجل مسبقًا في هذه المنشأة`,
          );
        }

        const created = await tx.bankAccount.create({
          data: {
            hospitalId,
            accountId: glAccount.id,
            currencyId: currency.id,
            bankName,
            branchName: dto.branchName?.trim() || null,
            accountNumber,
            iban: dto.iban?.trim() || null,
            swiftCode: dto.swiftCode?.trim()?.toUpperCase() || null,
            createdById: userId,
          },
          include: BANK_ACCOUNT_INCLUDE,
        });

        const auditLog = await appendChainedAuditInTransaction(tx, {
          hospitalId,
          userId,
          action: 'TREASURY_BANK_ACCOUNT_CREATED',
          entity: 'BankAccount',
          entityId: created.id,
          ipAddress: meta?.ipAddress,
          clientName: meta?.clientName,
          details: {
            bankName: created.bankName,
            accountNumber: created.accountNumber,
            glAccountCode: glAccount.code,
            currencyCode: currency.code,
          },
        });

        return { bankAccount: created, audit: auditLog };
      },
    );

    publishCommittedCriticalAudit(audit);
    return bankAccount;
  }

  async listBankAccounts(hospitalId: number) {
    return this.prisma.bankAccount.findMany({
      where: { hospitalId, isActive: true },
      include: BANK_ACCOUNT_INCLUDE,
      orderBy: [{ id: 'asc' }],
    });
  }

  async createReconciliationSession(
    hospitalId: number,
    userId: number,
    dto: CreateReconciliationSessionDto,
    meta?: TreasuryAuditMeta,
  ) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (
      Number.isNaN(periodStart.getTime()) ||
      Number.isNaN(periodEnd.getTime())
    ) {
      throw new BadRequestException('تواريخ فترة التسوية البنكية غير صالحة');
    }
    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException(
        'تاريخ نهاية الفترة يجب أن يكون مساويًا أو لاحقًا لتاريخ البداية',
      );
    }

    const statementNumber = dto.statementNumber.trim();
    const openingBankStr = Money.toDbString(dto.openingBalanceBank);
    const closingBankStr = Money.toDbString(dto.closingBalanceBank);

    const { session, audit } = await this.prisma.$transaction(async (tx) => {
      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: dto.bankAccountId, hospitalId, isActive: true },
        include: { account: true, currency: true },
      });
      if (!bankAccount) {
        throw new NotFoundException(
          'الحساب البنكي غير موجود أو غير نشط في هذه المنشأة',
        );
      }

      const duplicate = await tx.bankReconciliationSession.findUnique({
        where: {
          hospitalId_bankAccountId_statementNumber: {
            hospitalId,
            bankAccountId: bankAccount.id,
            statementNumber,
          },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          `جلسة تسوية برقم الكشف (${statementNumber}) موجودة مسبقًا لهذا الحساب البنكي`,
        );
      }

      const created = await tx.bankReconciliationSession.create({
        data: {
          hospitalId,
          bankAccountId: bankAccount.id,
          statementNumber,
          periodStart,
          periodEnd,
          openingBalanceBank: openingBankStr,
          closingBalanceBank: closingBankStr,
          status: 'DRAFT',
          preparedById: userId,
          notes: dto.notes?.trim() || null,
        },
      });

      const recalc = await this.recalculateSessionTx(
        tx,
        hospitalId,
        created.id,
      );

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_BANK_RECON_SESSION_CREATED',
        entity: 'BankReconciliationSession',
        entityId: created.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          bankAccountId: bankAccount.id,
          statementNumber,
          closingBalanceBank: closingBankStr,
          bookBalanceAsOfEnd: recalc.bookBalanceAsOfEnd,
          differenceAmount: recalc.differenceAmount,
        },
      });

      return { session: recalc, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return session;
  }

  async listReconciliationSessions(hospitalId: number, bankAccountId?: number) {
    const sessions = await this.prisma.bankReconciliationSession.findMany({
      where: {
        hospitalId,
        ...(bankAccountId ? { bankAccountId } : {}),
      },
      include: {
        bankAccount: { include: BANK_ACCOUNT_INCLUDE },
        preparedBy: { select: USER_LITE },
        approvedBy: { select: USER_LITE },
        _count: { select: { items: true } },
      },
      orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }],
    });

    return sessions.map((s) => this.formatSessionSummary(s));
  }

  async getReconciliationSession(hospitalId: number, sessionId: number) {
    return this.loadDetailedSession(this.prisma, hospitalId, sessionId);
  }

  async importStatementItems(
    hospitalId: number,
    sessionId: number,
    userId: number,
    dto: ImportStatementItemsDto,
    meta?: TreasuryAuditMeta,
  ) {
    const { result, audit } = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockEditableSession(tx, hospitalId, sessionId);

      let importedCount = 0;
      for (const item of dto.items) {
        const txDate = new Date(item.transactionDate);
        if (Number.isNaN(txDate.getTime())) {
          throw new BadRequestException(
            `تاريخ حركة كشف البنك غير صالح للمرجع ${item.reference}`,
          );
        }

        let amountStr: string;
        let foreignCurrencyId: number | null = null;
        let foreignAmountStr: string | null = null;
        let exchangeRateStr: string | null = null;

        if (item.foreignCurrencyId) {
          if (!item.foreignAmount || !Money.isPositive(item.foreignAmount)) {
            throw new BadRequestException(
              `يجب تحديد مبلغ العملة الأجنبية للحركة ${item.reference}`,
            );
          }

          const foreignCurr = await tx.currency.findFirst({
            where: { id: item.foreignCurrencyId, hospitalId, isActive: true },
          });
          if (!foreignCurr) {
            throw new NotFoundException(
              `العملة الأجنبية غير موجودة أو غير نشطة للحركة ${item.reference}`,
            );
          }

          let rateToUse: string;
          if (item.exchangeRateUsed) {
            const parsedRate = Money.roundDecimal(
              item.exchangeRateUsed,
              RATE_SCALE,
            );
            if (!Money.isPositive(parsedRate)) {
              throw new BadRequestException(
                'سعر الصرف المستخدم يجب أن يكون موجبًا',
              );
            }
            rateToUse = Money.toRateDbString(parsedRate);
          } else {
            const resolved = await this.currencyExchange.resolveEffectiveRate(
              hospitalId,
              foreignCurr.code,
              session.bankAccount.currency.code,
              txDate,
              tx,
            );
            rateToUse = resolved.rate;
          }

          foreignCurrencyId = foreignCurr.id;
          foreignAmountStr = Money.toDbString(item.foreignAmount);
          exchangeRateStr = rateToUse;
          amountStr = item.amount
            ? Money.toDbString(item.amount)
            : Money.toDbString(Money.multiply(foreignAmountStr, rateToUse));
        } else {
          if (!item.amount || !Money.isPositive(item.amount)) {
            throw new BadRequestException(
              `مبلغ الحركة البنكية يجب أن يكون موجبًا للمرجع ${item.reference}`,
            );
          }
          amountStr = Money.toDbString(item.amount);
        }

        if (!Money.isPositive(amountStr)) {
          throw new BadRequestException(
            `المبلغ المحوّل للحركة ${item.reference} يجب أن يكون موجبًا`,
          );
        }

        const existingDup = await tx.treasuryBankStatementItem.findUnique({
          where: {
            hospitalId_bankAccountId_direction_reference_transactionDate_amount:
              {
                hospitalId,
                bankAccountId: session.bankAccountId,
                direction: item.direction,
                reference: item.reference.trim(),
                transactionDate: txDate,
                amount: amountStr,
              },
          },
        });
        if (existingDup) {
          throw new ConflictException(
            `الحركة البنكية بالمرجع (${item.reference}) والمبلغ (${amountStr}) مستوردة مسبقًا`,
          );
        }

        await tx.treasuryBankStatementItem.create({
          data: {
            hospitalId,
            sessionId: session.id,
            bankAccountId: session.bankAccountId,
            transactionDate: txDate,
            valueDate: item.valueDate ? new Date(item.valueDate) : null,
            reference: item.reference.trim(),
            description: item.description?.trim() || null,
            direction: item.direction,
            amount: amountStr,
            foreignCurrencyId,
            foreignAmount: foreignAmountStr,
            exchangeRateUsed: exchangeRateStr,
          },
        });
        importedCount += 1;
      }

      if (session.status === 'DRAFT') {
        await tx.bankReconciliationSession.update({
          where: { id: session.id },
          data: { status: 'IN_PROGRESS' },
        });
      }

      const updated = await this.recalculateSessionTx(
        tx,
        hospitalId,
        session.id,
      );

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_BANK_STATEMENT_IMPORTED',
        entity: 'BankReconciliationSession',
        entityId: session.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          importedCount,
          statementNumber: session.statementNumber,
        },
      });

      return {
        result: {
          importedCount,
          session: updated,
        },
        audit: auditLog,
      };
    });

    publishCommittedCriticalAudit(audit);
    return result;
  }

  async autoMatchStatementItems(
    hospitalId: number,
    sessionId: number,
    userId: number,
    dto?: AutoMatchOptionsDto,
    meta?: TreasuryAuditMeta,
  ) {
    const toleranceDays = dto?.dateToleranceDays ?? 3;
    const toleranceMs = toleranceDays * 86_400_000;

    const { result, audit } = await this.prisma.$transaction(async (tx) => {
      const session = await this.lockEditableSession(tx, hospitalId, sessionId);

      const unmatchedItems = await tx.treasuryBankStatementItem.findMany({
        where: { sessionId: session.id, hospitalId, matchStatus: 'UNMATCHED' },
        orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
      });

      // Fetch unreconciled GL lines on this bank's GL account up to periodEnd
      const candidateLines = await tx.accountingEntryLine.findMany({
        where: {
          accountId: session.bankAccount.accountId,
          treasuryStatementMatch: null,
          entry: {
            hospitalId,
            entryDate: { lte: session.periodEnd },
          },
        },
        include: {
          entry: { select: { id: true, entryDate: true, description: true } },
        },
        orderBy: [{ entry: { entryDate: 'asc' } }, { id: 'asc' }],
      });

      const usedLineIds = new Set<number>();
      let matchedCount = 0;

      for (const item of unmatchedItems) {
        const itemAmountStr = Money.toDbString(item.amount);
        const itemTime = item.transactionDate.getTime();

        const candidates = candidateLines.filter((line) => {
          if (usedLineIds.has(line.id)) return false;
          // Bank CREDIT corresponds to GL Asset DEBIT; Bank DEBIT corresponds to GL Asset CREDIT
          const lineAmountStr =
            item.direction === 'CREDIT'
              ? Money.toDbString(line.debit)
              : Money.toDbString(line.credit);
          if (lineAmountStr !== itemAmountStr) return false;
          const diffMs = Math.abs(line.entry.entryDate.getTime() - itemTime);
          return diffMs <= toleranceMs;
        });

        if (candidates.length === 0) continue;

        // Prefer reference match in description; otherwise closest date
        const refLower = item.reference.toLowerCase();
        candidates.sort((a, b) => {
          const aRef =
            a.description?.toLowerCase().includes(refLower) ||
            a.entry.description?.toLowerCase().includes(refLower)
              ? 0
              : 1;
          const bRef =
            b.description?.toLowerCase().includes(refLower) ||
            b.entry.description?.toLowerCase().includes(refLower)
              ? 0
              : 1;
          if (aRef !== bRef) return aRef - bRef;
          const aDiff = Math.abs(a.entry.entryDate.getTime() - itemTime);
          const bDiff = Math.abs(b.entry.entryDate.getTime() - itemTime);
          return aDiff - bDiff;
        });

        const chosen = candidates[0];
        usedLineIds.add(chosen.id);

        await tx.treasuryBankStatementItem.update({
          where: { id: item.id },
          data: {
            matchStatus: 'MATCHED_GL',
            matchedEntryLineId: chosen.id,
            matchedById: userId,
            matchedAt: new Date(),
          },
        });
        matchedCount += 1;
      }

      if (session.status === 'DRAFT' && matchedCount > 0) {
        await tx.bankReconciliationSession.update({
          where: { id: session.id },
          data: { status: 'IN_PROGRESS' },
        });
      }

      const updated = await this.recalculateSessionTx(
        tx,
        hospitalId,
        session.id,
      );

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_BANK_RECON_AUTO_MATCHED',
        entity: 'BankReconciliationSession',
        entityId: session.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          matchedCount,
          toleranceDays,
          differenceAmount: updated.differenceAmount,
        },
      });

      return {
        result: { matchedCount, session: updated },
        audit: auditLog,
      };
    });

    publishCommittedCriticalAudit(audit);
    return result;
  }

  async manualMatchStatementItem(
    hospitalId: number,
    itemId: number,
    userId: number,
    dto: ManualMatchStatementItemDto,
    meta?: TreasuryAuditMeta,
  ) {
    const { session, audit } = await this.prisma.$transaction(async (tx) => {
      const item = await tx.treasuryBankStatementItem.findFirst({
        where: { id: itemId, hospitalId },
      });
      if (!item) {
        throw new NotFoundException('بند كشف البنك غير موجود في هذه المنشأة');
      }

      const lockedSession = await this.lockEditableSession(
        tx,
        hospitalId,
        item.sessionId,
      );

      if (item.matchStatus !== 'UNMATCHED') {
        throw new ConflictException('بند كشف البنك مطابق أو مسوّى مسبقًا');
      }

      const line = await tx.accountingEntryLine.findFirst({
        where: {
          id: dto.entryLineId,
          accountId: lockedSession.bankAccount.accountId,
          entry: { hospitalId },
        },
        include: { treasuryStatementMatch: true },
      });
      if (!line) {
        throw new NotFoundException(
          'سطر القيد المحاسبي غير موجود أو لا ينتمي لحساب هذا البنك في هذه المنشأة',
        );
      }
      if (line.treasuryStatementMatch) {
        throw new ConflictException(
          'سطر القيد المحاسبي هذا مطابق مسبقًا مع حركة بنكية أخرى',
        );
      }

      const expectedAmount = Money.toDbString(item.amount);
      const glAmount =
        item.direction === 'CREDIT'
          ? Money.toDbString(line.debit)
          : Money.toDbString(line.credit);

      if (expectedAmount !== glAmount) {
        throw new BadRequestException(
          `تعارض في المبلغ أو الاتجاه: مبلغ كشف البنك (${item.direction} ${expectedAmount}) لا يطابق سطر القيد (${glAmount})`,
        );
      }

      await tx.treasuryBankStatementItem.update({
        where: { id: item.id },
        data: {
          matchStatus: 'MATCHED_GL',
          matchedEntryLineId: line.id,
          matchedById: userId,
          matchedAt: new Date(),
        },
      });

      const updated = await this.recalculateSessionTx(
        tx,
        hospitalId,
        lockedSession.id,
      );

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_BANK_ITEM_MANUAL_MATCHED',
        entity: 'TreasuryBankStatementItem',
        entityId: item.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          sessionId: lockedSession.id,
          matchedEntryLineId: line.id,
          amount: expectedAmount,
        },
      });

      return { session: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return session;
  }

  async unmatchStatementItem(
    hospitalId: number,
    itemId: number,
    userId: number,
    meta?: TreasuryAuditMeta,
  ) {
    const { session, audit } = await this.prisma.$transaction(async (tx) => {
      const item = await tx.treasuryBankStatementItem.findFirst({
        where: { id: itemId, hospitalId },
      });
      if (!item) {
        throw new NotFoundException('بند كشف البنك غير موجود في هذه المنشأة');
      }

      const lockedSession = await this.lockEditableSession(
        tx,
        hospitalId,
        item.sessionId,
      );

      if (item.matchStatus === 'ADJUSTED_GL') {
        throw new BadRequestException(
          'لا يمكن فك مطابقة بند تم ترحيل قيد تسوية محاسبي له؛ يجب عكس القيد محاسبيًا عند الحاجة',
        );
      }
      if (item.matchStatus !== 'MATCHED_GL') {
        throw new BadRequestException('البند غير مطابق حاليًا');
      }

      await tx.treasuryBankStatementItem.update({
        where: { id: item.id },
        data: {
          matchStatus: 'UNMATCHED',
          matchedEntryLineId: null,
          matchedById: null,
          matchedAt: null,
        },
      });

      const updated = await this.recalculateSessionTx(
        tx,
        hospitalId,
        lockedSession.id,
      );

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_BANK_ITEM_UNMATCHED',
        entity: 'TreasuryBankStatementItem',
        entityId: item.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: { sessionId: lockedSession.id },
      });

      return { session: updated, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return session;
  }

  async postStatementAdjustment(
    hospitalId: number,
    itemId: number,
    userId: number,
    dto: PostBankAdjustmentDto,
    meta?: TreasuryAuditMeta,
  ) {
    const { result, audit } = await this.prisma.$transaction(async (tx) => {
      const item = await tx.treasuryBankStatementItem.findFirst({
        where: { id: itemId, hospitalId },
      });
      if (!item) {
        throw new NotFoundException('بند كشف البنك غير موجود في هذه المنشأة');
      }

      const lockedSession = await this.lockEditableSession(
        tx,
        hospitalId,
        item.sessionId,
      );

      if (item.matchStatus !== 'UNMATCHED') {
        throw new ConflictException('بند كشف البنك مطابق أو مسوّى مسبقًا');
      }

      const counterAccountId = await this.resolveCounterAccountId(
        tx,
        hospitalId,
        dto,
      );
      if (counterAccountId === lockedSession.bankAccount.accountId) {
        throw new BadRequestException(
          'الحساب المقابل للتسوية يجب أن يكون مختلفًا عن حساب البنك نفسه',
        );
      }

      const { financialYear, period } = await financialPeriod(
        tx,
        hospitalId,
        item.transactionDate,
      );

      const amountStr = Money.toDbString(item.amount);
      const bankAccountIdGl = lockedSession.bankAccount.accountId;
      const postingKey = `bank-recon-adj:${hospitalId}:${item.id}`;

      const entryDescription =
        dto.description?.trim() ||
        `قيد تسوية بنكية (${dto.adjustmentType}) - كشف ${lockedSession.statementNumber} - مرجع ${item.reference}`;

      // Bank CREDIT -> Bank Asset DEBIT, Counter CREDIT
      // Bank DEBIT  -> Counter DEBIT, Bank Asset CREDIT
      const linesCreate =
        item.direction === 'CREDIT'
          ? [
              {
                accountId: bankAccountIdGl,
                debit: amountStr,
                credit: '0.000',
                description: entryDescription,
              },
              {
                accountId: counterAccountId,
                debit: '0.000',
                credit: amountStr,
                description: entryDescription,
              },
            ]
          : [
              {
                accountId: counterAccountId,
                debit: amountStr,
                credit: '0.000',
                description: entryDescription,
              },
              {
                accountId: bankAccountIdGl,
                debit: '0.000',
                credit: amountStr,
                description: entryDescription,
              },
            ];

      const entry = await tx.accountingEntry.create({
        data: {
          hospitalId,
          postingKey,
          sourceModule: 'BANK_RECONCILIATION',
          sourceId: item.id,
          entryDate: item.transactionDate,
          financialYearId: financialYear.id,
          financialPeriodId: period.id,
          createdById: userId,
          description: entryDescription,
          lines: { create: linesCreate },
        },
        include: { lines: true },
      });

      const bankGlLine = entry.lines.find(
        (l) => l.accountId === bankAccountIdGl,
      );
      if (!bankGlLine) {
        throw new BadRequestException(
          'تعذر تحديد سطر حساب البنك في قيد التسوية',
        );
      }

      await tx.treasuryBankStatementItem.update({
        where: { id: item.id },
        data: {
          matchStatus: 'ADJUSTED_GL',
          matchedEntryLineId: bankGlLine.id,
          adjustmentEntryId: entry.id,
          matchedById: userId,
          matchedAt: new Date(),
        },
      });

      if (lockedSession.status === 'DRAFT') {
        await tx.bankReconciliationSession.update({
          where: { id: lockedSession.id },
          data: { status: 'IN_PROGRESS' },
        });
      }

      const updated = await this.recalculateSessionTx(
        tx,
        hospitalId,
        lockedSession.id,
      );

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_BANK_ADJUSTMENT_POSTED',
        entity: 'TreasuryBankStatementItem',
        entityId: item.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          sessionId: lockedSession.id,
          adjustmentType: dto.adjustmentType,
          accountingEntryId: entry.id,
          amount: amountStr,
          direction: item.direction,
        },
      });

      return {
        result: {
          accountingEntryId: entry.id,
          session: updated,
        },
        audit: auditLog,
      };
    });

    publishCommittedCriticalAudit(audit);
    return result;
  }

  async submitReconciliationSession(
    hospitalId: number,
    sessionId: number,
    userId: number,
    meta?: TreasuryAuditMeta,
  ) {
    const { session, audit } = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockEditableSession(tx, hospitalId, sessionId);
      const recalculated = await this.recalculateSessionTx(
        tx,
        hospitalId,
        locked.id,
      );

      if (recalculated.summary.unmatchedItemsCount > 0) {
        throw new BadRequestException(
          `لا يمكن تقديم جلسة التسوية للاعتماد لوجود (${recalculated.summary.unmatchedItemsCount}) بنود غير مطابقة في كشف البنك`,
        );
      }
      if (!Money.isZero(recalculated.differenceAmount)) {
        throw new BadRequestException(
          `لا يمكن تقديم جلسة التسوية للاعتماد بوجود فرق تسوية غير صفري (${recalculated.differenceAmount})`,
        );
      }

      await tx.bankReconciliationSession.update({
        where: { id: locked.id },
        data: { status: 'PENDING_APPROVAL' },
      });

      const detailed = await this.loadDetailedSession(
        tx,
        hospitalId,
        locked.id,
      );

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_BANK_RECON_SUBMITTED',
        entity: 'BankReconciliationSession',
        entityId: locked.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          statementNumber: locked.statementNumber,
          bookBalanceAsOfEnd: detailed.bookBalanceAsOfEnd,
          reconciledBalance: detailed.reconciledBalance,
          differenceAmount: detailed.differenceAmount,
        },
      });

      return { session: detailed, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return session;
  }

  async approveAndCloseReconciliationSession(
    hospitalId: number,
    sessionId: number,
    approverId: number,
    meta?: TreasuryAuditMeta,
  ) {
    const { session, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "BankReconciliationSession" WHERE "id" = ${sessionId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
      const existing = await tx.bankReconciliationSession.findFirst({
        where: { id: sessionId, hospitalId },
      });
      if (!existing) {
        throw new NotFoundException(
          'جلسة التسوية البنكية غير موجودة في هذه المنشأة',
        );
      }
      if (existing.status === 'CLOSED') {
        throw new ConflictException(
          'جلسة التسوية البنكية مغلقة ومعتمدة مسبقًا',
        );
      }
      if (existing.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(
          'يجب تقديم جلسة التسوية أولًا (PENDING_APPROVAL) قبل الاعتماد والإغلاق النهائي',
        );
      }
      if (existing.preparedById === approverId) {
        throw new ForbiddenException(
          'رقابة 4 عيون: لا يجوز لمُعد جلسة التسوية البنكية اعتمادها وإغلاقها بنفسه',
        );
      }

      const recalculated = await this.recalculateSessionTx(
        tx,
        hospitalId,
        existing.id,
      );
      if (recalculated.summary.unmatchedItemsCount > 0) {
        throw new BadRequestException(
          'لا يمكن إغلاق التسوية لوجود بنود غير مطابقة في كشف البنك',
        );
      }
      if (!Money.isZero(recalculated.differenceAmount)) {
        throw new BadRequestException(
          `لا يمكن إغلاق التسوية بوجود فرق تسوية (${recalculated.differenceAmount})`,
        );
      }

      await tx.bankReconciliationSession.update({
        where: { id: existing.id },
        data: {
          status: 'CLOSED',
          approvedById: approverId,
          approvedAt: new Date(),
        },
      });

      const detailed = await this.loadDetailedSession(
        tx,
        hospitalId,
        existing.id,
      );

      const auditLog = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId: approverId,
        action: 'TREASURY_BANK_RECON_CLOSED',
        entity: 'BankReconciliationSession',
        entityId: existing.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          statementNumber: existing.statementNumber,
          bookBalanceAsOfEnd: detailed.bookBalanceAsOfEnd,
          reconciledBalance: detailed.reconciledBalance,
          differenceAmount: detailed.differenceAmount,
        },
      });

      return { session: detailed, audit: auditLog };
    });

    publishCommittedCriticalAudit(audit);
    return session;
  }

  private async resolveCounterAccountId(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    dto: PostBankAdjustmentDto,
  ): Promise<number> {
    if (dto.adjustmentType === 'CUSTOM_ACCOUNT') {
      if (!dto.counterAccountId) {
        throw new BadRequestException(
          'يجب تحديد الحساب المقابل (counterAccountId) عند اختيار تسوية بحساب مخصص',
        );
      }
      const acc = await tx.account.findFirst({
        where: { id: dto.counterAccountId, hospitalId, isActive: true },
      });
      if (!acc) {
        throw new NotFoundException(
          'الحساب المقابل غير موجود أو غير نشط في هذه المنشأة',
        );
      }
      return acc.id;
    }

    const key: SystemAccountKey =
      dto.adjustmentType === 'BANK_CHARGES'
        ? SystemAccountKey.BANK_CHARGES_EXPENSE
        : SystemAccountKey.FX_GAIN_LOSS;

    const mapping = await tx.systemAccountMapping.findFirst({
      where: {
        hospitalId,
        key,
        isActive: true,
        account: { hospitalId, isActive: true },
      },
    });
    if (!mapping) {
      throw new BadRequestException(
        `الحساب النظامي (${key}) غير مهيأ أو غير نشط في دليل الحسابات لهذه المنشأة`,
      );
    }
    return mapping.accountId;
  }

  private async lockEditableSession(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    sessionId: number,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "BankReconciliationSession" WHERE "id" = ${sessionId} AND "hospitalId" = ${hospitalId} FOR UPDATE`;
    const session = await tx.bankReconciliationSession.findFirst({
      where: { id: sessionId, hospitalId },
      include: {
        bankAccount: { include: { account: true, currency: true } },
      },
    });
    if (!session) {
      throw new NotFoundException(
        'جلسة التسوية البنكية غير موجودة في هذه المنشأة',
      );
    }
    if (session.status === 'CLOSED') {
      throw new BadRequestException(
        'جلسة التسوية البنكية مغلقة نهائيًا ولا تقبل أي تعديل',
      );
    }
    if (session.status === 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'جلسة التسوية قيد انتظار الاعتماد؛ لا يمكن تعديل بنودها حاليًا',
      );
    }
    return session;
  }

  private async recalculateSessionTx(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    sessionId: number,
  ) {
    const session = await tx.bankReconciliationSession.findFirstOrThrow({
      where: { id: sessionId, hospitalId },
      include: { bankAccount: true },
    });

    const glLines = await tx.accountingEntryLine.findMany({
      where: {
        accountId: session.bankAccount.accountId,
        entry: {
          hospitalId,
          entryDate: { lte: session.periodEnd },
        },
      },
      select: {
        id: true,
        debit: true,
        credit: true,
        treasuryStatementMatch: { select: { id: true } },
      },
    });

    let bookBalance = Money.roundDecimal(0, 3);
    let depositsInTransit = Money.roundDecimal(0, 3);
    let outstandingChecks = Money.roundDecimal(0, 3);

    for (const line of glLines) {
      bookBalance = Money.addDecimal(bookBalance, line.debit);
      bookBalance = Money.subtractDecimal(bookBalance, line.credit);

      if (!line.treasuryStatementMatch) {
        depositsInTransit = Money.addDecimal(depositsInTransit, line.debit);
        outstandingChecks = Money.addDecimal(outstandingChecks, line.credit);
      }
    }

    // Reconciled Bank Balance = Closing Bank Balance + Deposits in Transit - Outstanding Checks
    let reconciledBalance = Money.addDecimal(
      session.closingBalanceBank,
      depositsInTransit,
    );
    reconciledBalance = Money.subtractDecimal(
      reconciledBalance,
      outstandingChecks,
    );

    const differenceAmount = Money.subtractDecimal(
      reconciledBalance,
      bookBalance,
    );

    await tx.bankReconciliationSession.update({
      where: { id: session.id },
      data: {
        bookBalanceAsOfEnd: Money.toDbString(bookBalance),
        reconciledBalance: Money.toDbString(reconciledBalance),
        differenceAmount: Money.toDbString(differenceAmount),
      },
    });

    return this.loadDetailedSession(tx, hospitalId, session.id);
  }

  private async loadDetailedSession(
    client: Prisma.TransactionClient | PrismaService,
    hospitalId: number,
    sessionId: number,
  ) {
    const session = await client.bankReconciliationSession.findFirst({
      where: { id: sessionId, hospitalId },
      include: {
        bankAccount: { include: BANK_ACCOUNT_INCLUDE },
        preparedBy: { select: USER_LITE },
        approvedBy: { select: USER_LITE },
        items: {
          include: {
            foreignCurrency: {
              select: { id: true, code: true, symbol: true },
            },
            matchedLine: {
              select: {
                id: true,
                entryId: true,
                debit: true,
                credit: true,
                description: true,
                entry: {
                  select: { id: true, entryDate: true, description: true },
                },
              },
            },
            matchedBy: { select: USER_LITE },
          },
          orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!session) {
      throw new NotFoundException(
        'جلسة التسوية البنكية غير موجودة في هذه المنشأة',
      );
    }

    const unreconciledGlLines = await client.accountingEntryLine.findMany({
      where: {
        accountId: session.bankAccount.accountId,
        treasuryStatementMatch: null,
        entry: {
          hospitalId,
          entryDate: { lte: session.periodEnd },
        },
      },
      select: {
        id: true,
        entryId: true,
        debit: true,
        credit: true,
        description: true,
        entry: { select: { id: true, entryDate: true, description: true } },
      },
      orderBy: [{ entry: { entryDate: 'asc' } }, { id: 'asc' }],
    });

    let depositsInTransit = Money.roundDecimal(0, 3);
    let outstandingChecks = Money.roundDecimal(0, 3);
    for (const l of unreconciledGlLines) {
      depositsInTransit = Money.addDecimal(depositsInTransit, l.debit);
      outstandingChecks = Money.addDecimal(outstandingChecks, l.credit);
    }

    const unmatchedItemsCount = session.items.filter(
      (i) => i.matchStatus === 'UNMATCHED',
    ).length;
    const matchedItemsCount = session.items.filter(
      (i) => i.matchStatus === 'MATCHED_GL',
    ).length;
    const adjustedItemsCount = session.items.filter(
      (i) => i.matchStatus === 'ADJUSTED_GL',
    ).length;

    return {
      ...this.formatSessionSummary(session),
      items: session.items.map((item) => ({
        ...item,
        amount: Money.toDbString(item.amount),
        foreignAmount: item.foreignAmount
          ? Money.toDbString(item.foreignAmount)
          : null,
        exchangeRateUsed: item.exchangeRateUsed
          ? Money.toRateDbString(item.exchangeRateUsed)
          : null,
      })),
      unreconciledGlLines: unreconciledGlLines.map((l) => ({
        ...l,
        debit: Money.toDbString(l.debit),
        credit: Money.toDbString(l.credit),
      })),
      summary: {
        totalItemsCount: session.items.length,
        unmatchedItemsCount,
        matchedItemsCount,
        adjustedItemsCount,
        depositsInTransit: Money.toDbString(depositsInTransit),
        outstandingChecks: Money.toDbString(outstandingChecks),
        isBalanced:
          unmatchedItemsCount === 0 && Money.isZero(session.differenceAmount),
      },
    };
  }

  private formatSessionSummary<
    T extends {
      openingBalanceBank: Prisma.Decimal | string | number;
      closingBalanceBank: Prisma.Decimal | string | number;
      bookBalanceAsOfEnd: Prisma.Decimal | string | number;
      reconciledBalance: Prisma.Decimal | string | number;
      differenceAmount: Prisma.Decimal | string | number;
    },
  >(s: T) {
    return {
      ...s,
      openingBalanceBank: Money.toDbString(s.openingBalanceBank),
      closingBalanceBank: Money.toDbString(s.closingBalanceBank),
      bookBalanceAsOfEnd: Money.toDbString(s.bookBalanceAsOfEnd),
      reconciledBalance: Money.toDbString(s.reconciledBalance),
      differenceAmount: Money.toDbString(s.differenceAmount),
    };
  }

  // =========================================================================
  // CAP09 Batch 28: CSV / SWIFT MT940 Statement File Import & FX Revaluation
  // =========================================================================

  async importStatementFile(
    hospitalId: number,
    sessionId: number,
    userId: number,
    dto: ImportStatementFileDto,
    meta?: TreasuryAuditMeta,
  ) {
    const parsed =
      dto.format === 'MT940'
        ? parseBankStatementMt940(dto.content)
        : parseBankStatementCsv(dto.content);

    return this.importStatementItems(
      hospitalId,
      sessionId,
      userId,
      {
        items: parsed.map((item) => ({
          transactionDate: item.transactionDate,
          valueDate: item.valueDate,
          reference: item.reference,
          description: item.description,
          direction: item.direction,
          amount: Money.toDbString(item.amount),
        })),
      },
      meta,
    );
  }

  async listFxRevaluations(hospitalId: number) {
    return this.prisma.fxRevaluationRun.findMany({
      where: { hospitalId },
      include: {
        bankAccount: {
          select: { id: true, bankName: true, accountNumber: true },
        },
        performedBy: { select: USER_LITE },
      },
      orderBy: { id: 'desc' },
      take: 100,
    });
  }

  async runFxRevaluation(
    hospitalId: number,
    userId: number,
    dto: RunFxRevaluationDto,
    meta?: TreasuryAuditMeta,
  ) {
    const asOfDate = new Date(`${dto.asOfDate.slice(0, 10)}T00:00:00.000Z`);
    const asOfEndOfDay = new Date(`${dto.asOfDate.slice(0, 10)}T23:59:59.999Z`);

    const { run, audit } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27028::int, ${hospitalId}::int)`;

      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: dto.bankAccountId, hospitalId, isActive: true },
        include: { currency: true, account: true },
      });
      if (!bankAccount) {
        throw new NotFoundException('الحساب البنكي غير موجود ضمن المنشأة.');
      }
      if (bankAccount.currency.isBase) {
        throw new BadRequestException(
          'إعادة تقييم فروق العملة تنطبق فقط على الحسابات بعملات أجنبية (غير العملة الأساسية).',
        );
      }

      const dup = await tx.fxRevaluationRun.findUnique({
        where: {
          hospitalId_bankAccountId_asOfDate: {
            hospitalId,
            bankAccountId: bankAccount.id,
            asOfDate,
          },
        },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          'تم تنفيذ إعادة تقييم العملة لهذا الحساب البنكي في هذا التاريخ مسبقًا.',
        );
      }

      const baseCurrency = await tx.currency.findFirst({
        where: { hospitalId, isBase: true, isActive: true },
      });
      if (!baseCurrency) {
        throw new BadRequestException(
          'لا توجد عملة أساسية مفعّلة لهذه المنشأة.',
        );
      }

      const conversion = await this.currencyExchange.convertAmount(hospitalId, {
        fromCode: bankAccount.currency.code,
        toCode: baseCurrency.code,
        amount: Money.toDbString(Money.decimal(dto.foreignBalance).abs()),
        asOfDate: dto.asOfDate.slice(0, 10),
      });

      const closingRateStr = Money.toRateDbString(conversion.rateUsed);
      const foreignDec = Money.roundDecimal(dto.foreignBalance, 3);
      const revaluedDec = Money.roundDecimal(
        foreignDec.times(closingRateStr),
        3,
      );

      // Compute GL book balance of bank account up to asOfDate
      const glLines = await tx.accountingEntryLine.findMany({
        where: {
          accountId: bankAccount.accountId,
          entry: {
            hospitalId,
            entryDate: { lte: asOfEndOfDay },
          },
        },
        select: { debit: true, credit: true },
      });
      let bookDec = Money.decimal(0);
      for (const l of glLines) {
        bookDec = bookDec.plus(l.debit.toString()).minus(l.credit.toString());
      }
      bookDec = Money.roundDecimal(bookDec, 3);

      const gainLossDec = Money.roundDecimal(revaluedDec.minus(bookDec), 3);
      const gainLossStr = Money.toDbString(gainLossDec);

      let accountingEntryId: number | null = null;
      if (!Money.isZero(gainLossDec)) {
        const { financialYear, period } = await financialPeriod(
          tx,
          hospitalId,
          asOfDate,
        );
        const fxMapping = await tx.systemAccountMapping.findFirst({
          where: {
            hospitalId,
            key: SystemAccountKey.FX_GAIN_LOSS,
            isActive: true,
            account: { hospitalId, isActive: true },
          },
          select: { accountId: true },
        });
        const fxAccountId =
          fxMapping?.accountId ??
          (
            await tx.account.findFirst({
              where: { hospitalId, code: '400950', isActive: true },
              select: { id: true },
            })
          )?.id ??
          null;
        if (!fxAccountId) {
          throw new BadRequestException(
            'حساب فروق العملة (FX_GAIN_LOSS / 400950) غير مهيأ في دليل الحسابات.',
          );
        }

        const absDiff = Money.toDbString(gainLossDec.abs());
        const isGain = gainLossDec.gt(0);
        const entry = await tx.accountingEntry.create({
          data: {
            hospitalId,
            postingKey: `fx-reval:${hospitalId}:${bankAccount.id}:${dto.asOfDate.slice(0, 10)}`,
            entryDate: asOfDate,
            description: `إعادة تقييم فروق عملة غير محققة (${bankAccount.currency.code}) — ${bankAccount.bankName}`,
            sourceModule: 'BANK_RECONCILIATION',
            sourceId: bankAccount.id,
            financialYearId: financialYear.id,
            financialPeriodId: period.id,
            createdById: userId,
            lines: {
              create: isGain
                ? [
                    {
                      accountId: bankAccount.accountId,
                      debit: absDiff,
                      credit: '0.000',
                      description: `زيادة تقييم رصيد ${bankAccount.currency.code}`,
                    },
                    {
                      accountId: fxAccountId,
                      debit: '0.000',
                      credit: absDiff,
                      description: `أرباح فروق عملة غير محققة (${bankAccount.currency.code})`,
                    },
                  ]
                : [
                    {
                      accountId: fxAccountId,
                      debit: absDiff,
                      credit: '0.000',
                      description: `خسائر فروق عملة غير محققة (${bankAccount.currency.code})`,
                    },
                    {
                      accountId: bankAccount.accountId,
                      debit: '0.000',
                      credit: absDiff,
                      description: `تخفيض تقييم رصيد ${bankAccount.currency.code}`,
                    },
                  ],
            },
          },
        });
        accountingEntryId = entry.id;
      }

      const createdRun = await tx.fxRevaluationRun.create({
        data: {
          hospitalId,
          bankAccountId: bankAccount.id,
          asOfDate,
          currencyCode: bankAccount.currency.code,
          foreignBalance: Money.toDbString(foreignDec),
          bookBalanceBase: Money.toDbString(bookDec),
          closingRate: closingRateStr,
          revaluedBalanceBase: Money.toDbString(revaluedDec),
          unrealizedGainLoss: gainLossStr,
          accountingEntryId,
          performedById: userId,
          notes: dto.notes?.trim() || null,
        },
        include: {
          bankAccount: {
            select: { id: true, bankName: true, accountNumber: true },
          },
        },
      });

      const auditEntry = await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        action: 'TREASURY_FX_REVALUATION_POSTED',
        entity: 'FxRevaluationRun',
        entityId: createdRun.id,
        ipAddress: meta?.ipAddress,
        clientName: meta?.clientName,
        details: {
          bankAccountId: bankAccount.id,
          currencyCode: bankAccount.currency.code,
          closingRate: closingRateStr,
          bookBalanceBase: Money.toDbString(bookDec),
          revaluedBalanceBase: Money.toDbString(revaluedDec),
          unrealizedGainLoss: gainLossStr,
          accountingEntryId,
        },
      });

      return { run: createdRun, audit: auditEntry };
    });

    publishCommittedCriticalAudit(audit);
    return run;
  }
}
