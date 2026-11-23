import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { financialPeriod } from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { mappedAccount } from '../purchases/purchase-return-posting';
import {
  EraProcessingService,
  MONEY_INPUT_PATTERN,
} from './era-processing.service';

const UUID_V4_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const RATE_INPUT_PATTERN = /^0(\.\d{1,4})?$|^1(\.0{1,4})?$/;

export const DEFAULT_GATEWAY_FLAT_FEE_PER_CLAIM = '2.000';
export const DEFAULT_GATEWAY_FEE_RATE = '0.0050';

export type AccrueGatewayFeeInput = {
  requestId: string;
  confirmed: boolean;
  flatFeePerClaim?: number | string;
  feeRate?: number | string;
};

export type SettleGatewayFeeInput = {
  requestId: string;
  confirmed: boolean;
  bankReference: string;
};

export type ImportBankStatementLineInput = {
  bankReference: string;
  transactionDate?: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: number | string;
  description?: string;
};

export type ImportBankStatementInput = {
  requestId: string;
  bankName: string;
  accountNumber?: string;
  lines: ImportBankStatementLineInput[];
};

export type ReconcileBankStatementInput = {
  requestId: string;
  confirmed: boolean;
  targetType: 'ERA' | 'GATEWAY_FEE';
  targetId: number;
};

const FEE_ENTRY_INCLUDE = {
  provider: { select: { id: true, name: true, code: true } },
  claimBatch: {
    select: {
      id: true,
      batchNumber: true,
      status: true,
      totalClaims: true,
      approvedAmount: true,
    },
  },
  eraTransaction: {
    select: { id: true, eraNumber: true, status: true, totalPaid: true },
  },
  accruedBy: { select: { id: true, fullName: true, username: true } },
  settledBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.GatewayClearingFeeEntryInclude;

const BANK_LINE_INCLUDE = {
  matchedEra: {
    select: { id: true, eraNumber: true, status: true, totalPaid: true },
  },
  matchedFeeEntry: {
    select: {
      id: true,
      b2bInvoiceNumber: true,
      status: true,
      totalFeeAmount: true,
    },
  },
  importedBy: { select: { id: true, fullName: true, username: true } },
  matchedBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.BankStatementLineInclude;

function parseBoundedDecimal(
  value: number | string | undefined,
  opts: {
    defaultValue?: string;
    maxScale: number;
    max?: string;
    minPositive?: boolean;
    fieldLabel: string;
  },
): Prisma.Decimal {
  if (value === undefined || value === null || value === '') {
    if (opts.defaultValue !== undefined) {
      return Money.decimal(opts.defaultValue);
    }
    throw new BadRequestException(`القيمة مطلوبة في ${opts.fieldLabel}`);
  }

  let rawStr: string;
  if (typeof value === 'string') {
    rawStr = value.trim();
  } else if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
  ) {
    rawStr = String(value);
  } else {
    throw new BadRequestException(`قيمة غير صالحة في ${opts.fieldLabel}`);
  }

  const pattern =
    opts.maxScale === 4 ? RATE_INPUT_PATTERN : MONEY_INPUT_PATTERN;
  if (!pattern.test(rawStr)) {
    throw new BadRequestException(`صيغة غير صالحة في ${opts.fieldLabel}`);
  }

  const dec = Money.decimal(rawStr);
  if (dec.decimalPlaces() > opts.maxScale) {
    throw new BadRequestException(
      `عدد الخانات العشرية يتجاوز المسموح في ${opts.fieldLabel}`,
    );
  }
  if (opts.minPositive && !dec.gt(0)) {
    throw new BadRequestException(
      `يجب أن تكون القيمة موجبة في ${opts.fieldLabel}`,
    );
  }
  if (opts.max !== undefined && dec.gt(Money.decimal(opts.max))) {
    throw new BadRequestException(
      `القيمة تتجاوز الحد الأقصى المسموح في ${opts.fieldLabel}`,
    );
  }
  return dec;
}

function assertUuidV4(requestId: string | undefined, message: string) {
  if (!UUID_V4_PATTERN.test(requestId ?? '')) {
    throw new BadRequestException(message);
  }
}

function normalizeBankReference(raw: string | undefined): string {
  const ref = raw?.trim().toUpperCase() ?? '';
  if (ref.length < 5 || ref.length > 200) {
    throw new BadRequestException(
      'يلزم مرجع تحويل بنكي صالح بطول 5 إلى 200 حرف',
    );
  }
  return ref;
}

/**
 * خدمة دفتر رسوم وعمولات المشغّل الوطني (B2B) واستيراد ومطابقة كشف الحساب البنكي
 */
@Injectable()
export class GatewayClearingLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eraProcessingService: EraProcessingService,
  ) {}

  listFeeLedger(
    hospitalId: number,
    filters?: { providerId?: number; status?: string },
  ) {
    return this.prisma.gatewayClearingFeeEntry.findMany({
      where: {
        hospitalId,
        ...(filters?.providerId ? { providerId: filters.providerId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: FEE_ENTRY_INCLUDE,
      orderBy: [{ accruedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async accrueBatchClearingFee(
    hospitalId: number,
    userId: number,
    batchId: number,
    input: AccrueGatewayFeeInput,
  ) {
    assertUuidV4(input.requestId, 'يلزم معرف طلب بصيغة UUID v4 صالحة');
    if (input.confirmed !== true) {
      throw new BadRequestException(
        'يلزم تأكيد صريح (confirmed: true) لإثبات واستحقاق رسوم المشغّل',
      );
    }

    const flatFeePerClaimDec = parseBoundedDecimal(input.flatFeePerClaim, {
      defaultValue: DEFAULT_GATEWAY_FLAT_FEE_PER_CLAIM,
      maxScale: 3,
      fieldLabel: 'flatFeePerClaim',
    });
    const feeRateDec = parseBoundedDecimal(input.feeRate, {
      defaultValue: DEFAULT_GATEWAY_FEE_RATE,
      maxScale: 4,
      max: '0.2500',
      fieldLabel: 'feeRate',
    });

    const requestKey = `gateway-fee-accrue:${hospitalId}:${batchId}:${input.requestId.toLowerCase()}`;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(27010, ${hospitalId}::integer)`;

          const activeUser = await tx.user.findFirst({
            where: { id: userId, hospitalId, isActive: true, isDeleted: false },
            select: { id: true },
          });
          if (!activeUser) {
            throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
          }

          const locked = await tx.$queryRaw<Array<{ id: number }>>`
            SELECT id FROM "ClaimBatch"
            WHERE id = ${batchId} AND "hospitalId" = ${hospitalId}
            FOR UPDATE
          `;
          if (locked.length === 0) {
            throw new NotFoundException('الدفعة غير موجودة');
          }

          const batch = await tx.claimBatch.findFirstOrThrow({
            where: { id: batchId, hospitalId },
            include: {
              gatewayFeeEntry: { include: FEE_ENTRY_INCLUDE },
              eraTransaction: { select: { id: true, eraNumber: true } },
            },
          });

          if (batch.gatewayFeeEntry) {
            const existing = batch.gatewayFeeEntry;
            if (
              existing.accrualRequestKey === requestKey &&
              Money.eq(existing.flatFeePerClaim, flatFeePerClaimDec) &&
              Money.eq(existing.feeRate, feeRateDec)
            ) {
              return existing;
            }
            throw new ConflictException(
              'تم احتساب واستحقاق رسوم المشغّل لهذه الدفعة مسبقًا',
            );
          }

          if (
            batch.status !== 'CLOSED' ||
            batch.clearingChannel !== 'LOCAL_CLEARINGHOUSE'
          ) {
            throw new BadRequestException(
              'استحقاق رسوم المشغّل يتطلب دفعة مقاصة وطنية مغلقة (CLOSED)',
            );
          }

          if (batch.totalClaims <= 0) {
            throw new BadRequestException(
              'الدفعة لا تحتوي على مطالبات قابلة للفوترة',
            );
          }

          const adjudicatedDec = Money.decimal(batch.approvedAmount ?? 0);
          const flatFeeTotalStr = Money.toDbString(
            Money.multiply(flatFeePerClaimDec, batch.totalClaims),
          );
          const percentageFeeTotalStr = Money.toDbString(
            Money.multiply(adjudicatedDec, feeRateDec),
          );
          const totalFeeAmountStr = Money.toDbString(
            Money.addDecimal(flatFeeTotalStr, percentageFeeTotalStr),
          );

          if (!Money.isPositive(totalFeeAmountStr)) {
            throw new BadRequestException(
              'إجمالي رسوم المشغّل الوطني يجب أن يكون أكبر من صفر',
            );
          }

          const [expenseAccount, payableAccount] = await Promise.all([
            mappedAccount(tx, hospitalId, 'GATEWAY_CLEARING_FEE_EXPENSE'),
            mappedAccount(tx, hospitalId, 'GATEWAY_CLEARING_FEE_PAYABLE'),
          ]);
          if (expenseAccount.type !== 'EXPENSE') {
            throw new BadRequestException(
              'حساب مصروف رسوم المشغّل يجب أن يكون من نوع مصروف (EXPENSE)',
            );
          }
          if (
            payableAccount.type !== 'LIABILITY' ||
            payableAccount.id === expenseAccount.id
          ) {
            throw new BadRequestException(
              'حساب مستحقات المشغّل الوطني يجب أن يكون التزامًا مستقلًا',
            );
          }

          const accruedAt = new Date();
          const { financialYear, period } = await financialPeriod(
            tx,
            hospitalId,
            accruedAt,
          );
          const b2bInvoiceNumber = `SARAYA-B2B-${hospitalId}-${batch.id}`;

          const accrualEntry = await tx.accountingEntry.create({
            data: {
              hospitalId,
              postingKey: `gateway-clearing-fee:${hospitalId}:${batch.id}`,
              sourceModule: 'BILLING',
              sourceId: batch.id,
              description: `استحقاق رسوم وفوترة مقاصة البوابة الوطنية (${b2bInvoiceNumber} · ${batch.batchNumber})`,
              entryDate: accruedAt,
              createdById: userId,
              financialYearId: financialYear.id,
              financialPeriodId: period.id,
              lines: {
                create: [
                  {
                    accountId: expenseAccount.id,
                    debit: totalFeeAmountStr,
                    credit: '0.000',
                    description: `مصروف رسوم مقاصة الدفعة ${batch.batchNumber}`,
                  },
                  {
                    accountId: payableAccount.id,
                    debit: '0.000',
                    credit: totalFeeAmountStr,
                    description: `ذمم رسوم المشغّل — ${b2bInvoiceNumber}`,
                  },
                ],
              },
            },
          });

          const created = await tx.gatewayClearingFeeEntry.create({
            data: {
              hospitalId,
              providerId: batch.providerId,
              claimBatchId: batch.id,
              eraTransactionId: batch.eraTransactionId,
              b2bInvoiceNumber,
              accrualRequestKey: requestKey,
              billableClaimsCount: batch.totalClaims,
              adjudicatedAmount: Money.toDbString(adjudicatedDec),
              flatFeePerClaim: Money.toDbString(flatFeePerClaimDec),
              feeRate: feeRateDec.toFixed(4),
              flatFeeTotal: flatFeeTotalStr,
              percentageFeeTotal: percentageFeeTotalStr,
              totalFeeAmount: totalFeeAmountStr,
              status: 'ACCRUED',
              expenseAccountId: expenseAccount.id,
              payableAccountId: payableAccount.id,
              accrualEntryId: accrualEntry.id,
              accruedById: userId,
              accruedAt,
            },
            include: FEE_ENTRY_INCLUDE,
          });

          await appendChainedAuditInTransaction(tx, {
            hospitalId,
            userId,
            entity: 'GatewayClearingFeeEntry',
            entityId: created.id,
            action: 'ACCRUE_GATEWAY_CLEARING_FEE',
            details: {
              b2bInvoiceNumber,
              claimBatchId: batch.id,
              batchNumber: batch.batchNumber,
              billableClaimsCount: batch.totalClaims,
              adjudicatedAmount: Money.toDbString(adjudicatedDec),
              flatFeeTotal: flatFeeTotalStr,
              percentageFeeTotal: percentageFeeTotalStr,
              totalFeeAmount: totalFeeAmountStr,
              accrualEntryId: accrualEntry.id,
            },
          });

          return created;
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'تم استحقاق رسوم المشغّل لهذه الدفعة مسبقًا',
        );
      }
      throw err;
    }
  }

  async settleGatewayClearingFee(
    hospitalId: number,
    userId: number,
    feeEntryId: number,
    input: SettleGatewayFeeInput,
    txParam?: Prisma.TransactionClient,
  ) {
    assertUuidV4(input.requestId, 'يلزم معرف طلب بصيغة UUID v4 صالحة');
    if (input.confirmed !== true) {
      throw new BadRequestException(
        'يلزم تأكيد صريح (confirmed: true) لتسوية وسداد رسوم المشغّل',
      );
    }
    const bankReference = normalizeBankReference(input.bankReference);
    const requestKey = `gateway-fee-settle:${hospitalId}:${feeEntryId}:${input.requestId.toLowerCase()}`;

    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27010, ${hospitalId}::integer)`;

      const activeUser = await tx.user.findFirst({
        where: { id: userId, hospitalId, isActive: true, isDeleted: false },
        select: { id: true },
      });
      if (!activeUser) {
        throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
      }

      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "GatewayClearingFeeEntry"
        WHERE id = ${feeEntryId} AND "hospitalId" = ${hospitalId}
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundException('فاتورة رسوم المشغّل غير موجودة');
      }

      const entry = await tx.gatewayClearingFeeEntry.findFirstOrThrow({
        where: { id: feeEntryId, hospitalId },
        include: FEE_ENTRY_INCLUDE,
      });

      if (entry.status === 'SETTLED') {
        if (
          entry.settlementRequestKey === requestKey &&
          entry.settlementBankReference === bankReference &&
          entry.settledById === userId
        ) {
          return entry;
        }
        throw new ConflictException(
          'تم سداد فاتورة رسوم المشغّل مسبقًا بمعرف أو مرجع بنكي مختلف',
        );
      }

      const duplicateBankRef = await tx.gatewayClearingFeeEntry.findFirst({
        where: {
          hospitalId,
          settlementBankReference: bankReference,
          id: { not: entry.id },
        },
        select: { id: true },
      });
      if (duplicateBankRef) {
        throw new ConflictException(
          'المرجع البنكي مستخدم مسبقًا لسداد فاتورة رسوم أخرى',
        );
      }

      const [bankAccount, payableAccount] = await Promise.all([
        mappedAccount(tx, hospitalId, 'BANK_MAIN'),
        tx.account.findFirst({
          where: { id: entry.payableAccountId, hospitalId, isActive: true },
        }),
      ]);
      if (bankAccount.type !== 'ASSET') {
        throw new BadRequestException(
          'الحساب البنكي الرئيسي يجب أن يكون أصلًا (ASSET)',
        );
      }
      if (
        !payableAccount ||
        payableAccount.type !== 'LIABILITY' ||
        payableAccount.id === bankAccount.id
      ) {
        throw new BadRequestException(
          'حساب مستحقات رسوم المشغّل غير نشط أو غير صالح',
        );
      }

      const settledAt = new Date();
      const { financialYear, period } = await financialPeriod(
        tx,
        hospitalId,
        settledAt,
      );
      const totalFeeStr = Money.toDbString(entry.totalFeeAmount);

      const settlementEntry = await tx.accountingEntry.create({
        data: {
          hospitalId,
          postingKey: `gateway-clearing-fee-settlement:${hospitalId}:${entry.id}`,
          sourceModule: 'CASHIER',
          sourceId: entry.id,
          description: `سداد مستحقات المشغّل الوطني (${entry.b2bInvoiceNumber} · ${bankReference})`,
          entryDate: settledAt,
          createdById: userId,
          financialYearId: financialYear.id,
          financialPeriodId: period.id,
          lines: {
            create: [
              {
                accountId: payableAccount.id,
                debit: totalFeeStr,
                credit: '0.000',
                description: `إقفال ذمم رسوم المشغّل — ${entry.b2bInvoiceNumber}`,
              },
              {
                accountId: bankAccount.id,
                debit: '0.000',
                credit: totalFeeStr,
                description: `تحويل بنكي لسداد رسوم المشغّل (${bankReference})`,
              },
            ],
          },
        },
      });

      const settled = await tx.gatewayClearingFeeEntry.update({
        where: { id: entry.id },
        data: {
          status: 'SETTLED',
          settlementRequestKey: requestKey,
          settlementBankReference: bankReference,
          settlementEntryId: settlementEntry.id,
          settledById: userId,
          settledAt,
        },
        include: FEE_ENTRY_INCLUDE,
      });

      await appendChainedAuditInTransaction(tx, {
        hospitalId,
        userId,
        entity: 'GatewayClearingFeeEntry',
        entityId: settled.id,
        action: 'SETTLE_GATEWAY_CLEARING_FEE',
        details: {
          b2bInvoiceNumber: entry.b2bInvoiceNumber,
          bankReference,
          totalFeeAmount: totalFeeStr,
          settlementEntryId: settlementEntry.id,
        },
      });

      return settled;
    };

    try {
      return txParam
        ? await run(txParam)
        : await this.prisma.$transaction(run, {
            maxWait: 10000,
            timeout: 30000,
          });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'تعارض في مرجع السداد أو معرّف تسوية رسوم المشغّل',
        );
      }
      throw err;
    }
  }

  listBankStatementLines(
    hospitalId: number,
    filters?: { direction?: string; status?: string },
  ) {
    return this.prisma.bankStatementLine.findMany({
      where: {
        hospitalId,
        ...(filters?.direction ? { direction: filters.direction } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: BANK_LINE_INCLUDE,
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
    });
  }

  async importBankStatementLines(
    hospitalId: number,
    userId: number,
    input: ImportBankStatementInput,
  ) {
    assertUuidV4(input.requestId, 'يلزم معرف طلب بصيغة UUID v4 صالحة');
    const bankName = (input.bankName ?? '').trim();
    if (bankName.length < 3 || bankName.length > 100) {
      throw new BadRequestException('اسم المصرف مطلوب (3 إلى 100 حرف)');
    }
    const accountNumber = input.accountNumber?.trim() || null;
    if (accountNumber && accountNumber.length > 100) {
      throw new BadRequestException('رقم الحساب يتجاوز الطول المسموح');
    }
    if (
      !Array.isArray(input.lines) ||
      input.lines.length === 0 ||
      input.lines.length > 200
    ) {
      throw new BadRequestException(
        'يلزم إرفاق 1 إلى 200 حركة في كشف الحساب البنكي',
      );
    }

    const importRequestKey = `bank-import:${hospitalId}:${input.requestId.toLowerCase()}`;
    const seenKeys = new Set<string>();

    const parsedLines = input.lines.map((line, index) => {
      if (line.direction !== 'CREDIT' && line.direction !== 'DEBIT') {
        throw new BadRequestException(
          `اتجاه الحركة في السطر ${index + 1} يجب أن يكون CREDIT أو DEBIT`,
        );
      }
      const bankReference = normalizeBankReference(line.bankReference);
      const uniqueKey = `${line.direction}:${bankReference}`;
      if (seenKeys.has(uniqueKey)) {
        throw new BadRequestException(
          `مرجع بنكي مكرر داخل نفس الكشف: ${bankReference}`,
        );
      }
      seenKeys.add(uniqueKey);

      const amountDec = parseBoundedDecimal(line.amount, {
        maxScale: 3,
        minPositive: true,
        fieldLabel: `lines[${index}].amount`,
      });
      const txDate = line.transactionDate
        ? new Date(line.transactionDate)
        : new Date();
      if (Number.isNaN(txDate.getTime())) {
        throw new BadRequestException(
          `تاريخ الحركة غير صالح في السطر ${index + 1}`,
        );
      }

      return {
        bankReference,
        direction: line.direction,
        amountStr: Money.toDbString(amountDec),
        transactionDate: txDate,
        description: line.description?.trim().slice(0, 500) || null,
      };
    });

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(27010, ${hospitalId}::integer)`;

          const activeUser = await tx.user.findFirst({
            where: { id: userId, hospitalId, isActive: true, isDeleted: false },
            select: { id: true },
          });
          if (!activeUser) {
            throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
          }

          const results: Array<
            Prisma.BankStatementLineGetPayload<{
              include: typeof BANK_LINE_INCLUDE;
            }>
          > = [];
          let createdCount = 0;

          for (const line of parsedLines) {
            const existing = await tx.bankStatementLine.findUnique({
              where: {
                hospitalId_direction_bankReference: {
                  hospitalId,
                  direction: line.direction,
                  bankReference: line.bankReference,
                },
              },
              include: BANK_LINE_INCLUDE,
            });

            if (existing) {
              if (
                existing.importRequestKey === importRequestKey &&
                Money.eq(existing.amount, line.amountStr) &&
                existing.bankName === bankName
              ) {
                results.push(existing);
                continue;
              }
              throw new ConflictException(
                `الحركة البنكية (${line.direction} / ${line.bankReference}) مستوردة مسبقًا ببيانات أو طلب مختلف`,
              );
            }

            const created = await tx.bankStatementLine.create({
              data: {
                hospitalId,
                importRequestKey,
                bankName,
                accountNumber,
                bankReference: line.bankReference,
                transactionDate: line.transactionDate,
                direction: line.direction,
                amount: line.amountStr,
                description: line.description,
                status: 'UNMATCHED',
                importedById: userId,
              },
              include: BANK_LINE_INCLUDE,
            });
            results.push(created);
            createdCount++;
          }

          if (createdCount > 0) {
            await appendChainedAuditInTransaction(tx, {
              hospitalId,
              userId,
              entity: 'BankStatementLine',
              entityId: results[0].id,
              action: 'IMPORT_BANK_STATEMENT_LINES',
              details: {
                bankName,
                importRequestKey,
                importedCount: createdCount,
                references: parsedLines.map((l) => l.bankReference),
              },
            });
          }

          return results;
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'تعارض أثناء استيراد كشف الحساب البنكي لوجود مرجع مكرر',
        );
      }
      throw err;
    }
  }

  async reconcileBankStatementLine(
    hospitalId: number,
    userId: number,
    lineId: number,
    input: ReconcileBankStatementInput,
  ) {
    assertUuidV4(input.requestId, 'يلزم معرف طلب بصيغة UUID v4 صالحة');
    if (input.confirmed !== true) {
      throw new BadRequestException(
        'يلزم تأكيد صريح (confirmed: true) لاعتماد المطابقة البنكية',
      );
    }
    if (input.targetType !== 'ERA' && input.targetType !== 'GATEWAY_FEE') {
      throw new BadRequestException(
        'نوع المطابقة يجب أن يكون ERA أو GATEWAY_FEE',
      );
    }
    if (!Number.isInteger(input.targetId) || input.targetId <= 0) {
      throw new BadRequestException('معرّف السجل المستهدف غير صالح');
    }

    const matchRequestKey = `bank-match:${hospitalId}:${lineId}:${input.requestId.toLowerCase()}`;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(27010, ${hospitalId}::integer)`;

          const activeUser = await tx.user.findFirst({
            where: { id: userId, hospitalId, isActive: true, isDeleted: false },
            select: { id: true },
          });
          if (!activeUser) {
            throw new NotFoundException('المستخدم غير متاح ضمن المنشأة');
          }

          const lockedLine = await tx.$queryRaw<Array<{ id: number }>>`
            SELECT id FROM "BankStatementLine"
            WHERE id = ${lineId} AND "hospitalId" = ${hospitalId}
            FOR UPDATE
          `;
          if (lockedLine.length === 0) {
            throw new NotFoundException('حركة كشف الحساب البنكي غير موجودة');
          }

          const line = await tx.bankStatementLine.findFirstOrThrow({
            where: { id: lineId, hospitalId },
            include: BANK_LINE_INCLUDE,
          });

          if (line.status === 'MATCHED') {
            const sameTarget =
              (input.targetType === 'ERA' &&
                line.matchedEraId === input.targetId) ||
              (input.targetType === 'GATEWAY_FEE' &&
                line.matchedFeeEntryId === input.targetId);
            if (line.matchRequestKey === matchRequestKey && sameTarget) {
              return line;
            }
            throw new ConflictException(
              'تمت مطابقة هذه الحركة البنكية مسبقًا مع سجل آخر',
            );
          }

          const matchedAt = new Date();
          let updatedLine: Prisma.BankStatementLineGetPayload<{
            include: typeof BANK_LINE_INCLUDE;
          }>;

          if (input.targetType === 'ERA') {
            if (line.direction !== 'CREDIT') {
              throw new BadRequestException(
                'مطابقة إشعار ERA تتطلب حركة بنكية دائنة (CREDIT)',
              );
            }

            const lockedEra = await tx.$queryRaw<Array<{ id: number }>>`
              SELECT id FROM "ERATransaction"
              WHERE id = ${input.targetId} AND "hospitalId" = ${hospitalId}
              FOR UPDATE
            `;
            if (lockedEra.length === 0) {
              throw new NotFoundException('ملف ERA غير موجود ضمن المنشأة');
            }

            const era = await tx.eRATransaction.findFirstOrThrow({
              where: { id: input.targetId, hospitalId },
              select: { id: true, eraNumber: true, totalPaid: true },
            });
            if (!Money.eq(line.amount, era.totalPaid)) {
              throw new BadRequestException(
                'مبلغ الحركة البنكية لا يطابق إجمالي مدفوعات ملف ERA',
              );
            }

            await this.eraProcessingService.postEraFinancialSettlement(
              hospitalId,
              userId,
              era.id,
              {
                requestId: input.requestId,
                bankReference: line.bankReference,
                confirmed: true,
              },
              tx,
            );

            updatedLine = await tx.bankStatementLine.update({
              where: { id: line.id },
              data: {
                status: 'MATCHED',
                matchRequestKey,
                matchedEraId: era.id,
                matchedById: userId,
                matchedAt,
              },
              include: BANK_LINE_INCLUDE,
            });
          } else {
            if (line.direction !== 'DEBIT') {
              throw new BadRequestException(
                'سداد رسوم المشغّل الوطني يتطلب حركة بنكية مدينة/خصم (DEBIT)',
              );
            }

            const lockedFee = await tx.$queryRaw<Array<{ id: number }>>`
              SELECT id FROM "GatewayClearingFeeEntry"
              WHERE id = ${input.targetId} AND "hospitalId" = ${hospitalId}
              FOR UPDATE
            `;
            if (lockedFee.length === 0) {
              throw new NotFoundException(
                'فاتورة رسوم المشغّل غير موجودة ضمن المنشأة',
              );
            }

            const feeEntry = await tx.gatewayClearingFeeEntry.findFirstOrThrow({
              where: { id: input.targetId, hospitalId },
              select: {
                id: true,
                b2bInvoiceNumber: true,
                totalFeeAmount: true,
              },
            });
            if (!Money.eq(line.amount, feeEntry.totalFeeAmount)) {
              throw new BadRequestException(
                'مبلغ الحركة البنكية لا يطابق إجمالي فاتورة رسوم المشغّل',
              );
            }

            await this.settleGatewayClearingFee(
              hospitalId,
              userId,
              feeEntry.id,
              {
                requestId: input.requestId,
                bankReference: line.bankReference,
                confirmed: true,
              },
              tx,
            );

            updatedLine = await tx.bankStatementLine.update({
              where: { id: line.id },
              data: {
                status: 'MATCHED',
                matchRequestKey,
                matchedFeeEntryId: feeEntry.id,
                matchedById: userId,
                matchedAt,
              },
              include: BANK_LINE_INCLUDE,
            });
          }

          await appendChainedAuditInTransaction(tx, {
            hospitalId,
            userId,
            entity: 'BankStatementLine',
            entityId: updatedLine.id,
            action: 'RECONCILE_BANK_STATEMENT_LINE',
            details: {
              bankReference: line.bankReference,
              direction: line.direction,
              amount: Money.toDbString(line.amount),
              targetType: input.targetType,
              targetId: input.targetId,
            },
          });

          return updatedLine;
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'هذه الحركة البنكية أو السجل المستهدف مرتبط بمطابقة أخرى مسبقًا',
        );
      }
      throw err;
    }
  }
}
