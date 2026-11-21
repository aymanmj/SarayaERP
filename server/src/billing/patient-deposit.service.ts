import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PaymentMethod } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountingService,
  ACCOUNT_CODES,
} from '../accounting/accounting.service';
import { Money } from '../common/utils/money.util';
import {
  guardCashierMovement,
  cashSessionBalance,
  cashTransaction,
} from '../cashier/cash-control';
import {
  financialPeriod,
  lockFinancialInvoice,
} from '../accounting/financial-posting';
import { adjustmentBalance } from './invoice-snapshot';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { publishCommittedCriticalAudit } from '../audit/siem.logger';
import { assertPrescriptionCollectionAvailable } from '../pharmacy/prescription-prepayment';
import {
  CreatePatientDepositDto,
  ApplyDepositDto,
  RefundDepositDto,
} from './dto/patient-deposit.dto';
const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function depositAmount(value: string) {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(value)
  )
    throw new BadRequestException('يلزم مبلغ عشري نصي بدقة ثلاث خانات');
  const amount = Money.decimal(value);
  if (!amount.gt(0)) throw new BadRequestException('المبلغ يجب أن يكون موجبًا');
  return amount;
}
@Injectable()
export class PatientDepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}
  private async lockWallet(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    patientId: number,
    userId?: number,
    encounterId?: number,
  ) {
    if (
      ![
        hospitalId,
        patientId,
        ...(userId === undefined ? [] : [userId]),
        ...(encounterId === undefined ? [] : [encounterId]),
      ].every((id) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647)
    )
      throw new BadRequestException('مرجع المريض أو الحالة أو المنفذ غير صالح');
    const rows = await tx.$queryRaw<
      { id: number }[]
    >`SELECT id FROM "Patient" WHERE id=${patientId} AND "hospitalId"=${hospitalId} AND "isDeleted"=false FOR UPDATE`;
    if (rows.length !== 1)
      throw new NotFoundException('المريض غير موجود ضمن المنشأة');
    if (
      userId &&
      !(await tx.user.findFirst({
        where: { id: userId, hospitalId, isActive: true, isDeleted: false },
      }))
    )
      throw new NotFoundException('المستخدم غير متاح');
    if (encounterId) {
      await tx.$queryRaw`SELECT id FROM "Encounter" WHERE id=${encounterId} AND "hospitalId"=${hospitalId} AND "patientId"=${patientId} FOR UPDATE`;
      if (
        !(await tx.encounter.findFirst({
          where: { id: encounterId, hospitalId, patientId, isDeleted: false },
        }))
      )
        throw new NotFoundException('الحالة لا تخص المريض والمنشأة');
    }
  }
  async getPatientDepositBalance(
    hospitalId: number,
    patientId: number,
    encounterId?: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockWallet(tx, hospitalId, patientId, undefined, encounterId);
      return this.getPatientDepositBalanceInternal(
        tx,
        hospitalId,
        patientId,
        encounterId,
      );
    });
  }
  async getPatientDepositBalanceInternal(
    db: Prisma.TransactionClient,
    hospitalId: number,
    patientId: number,
    encounterId?: number,
  ) {
    const vouchers = await db.voucher.findMany({
      where: {
        hospitalId,
        depositPatientId: patientId,
        status: 'POSTED',
        deletedAt: null,
      },
      include: {
        cashAccount: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    const payments = await db.payment.findMany({
      where: {
        hospitalId,
        isDepositApplication: true,
        invoice: { hospitalId, patientId },
      },
      include: {
        invoice: {
          select: {
            id: true,
            totalAmount: true,
            patientShare: true,
            status: true,
            encounterId: true,
          },
        },
      },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    });
    const receipts = vouchers.filter((v) => v.type === 'RECEIPT');
    const refunds = vouchers.filter((v) => v.type === 'PAYMENT');
    const totalDeposited = Money.sumDecimal(...receipts.map((v) => v.amount));
    const totalRefunded = Money.sumDecimal(...refunds.map((v) => v.amount));
    const totalApplied = Money.sumDecimal(...payments.map((v) => v.amount));
    const availableBalance = Money.subtractDecimal(
      totalDeposited,
      Money.sumDecimal(totalApplied, totalRefunded),
    );
    if (availableBalance.lt(0))
      throw new ConflictException(
        'محفظة الأمانات سالبة؛تلزم المطابقة قبل أي حركة',
      );
    return {
      patientId,
      walletScope: 'PATIENT' as const,
      encounterId: encounterId ?? null,
      totalDeposited,
      totalApplied,
      totalRefunded,
      availableBalance,
      deposits: receipts.filter(
        (v) => !encounterId || v.depositEncounterId === encounterId,
      ),
      refunds: refunds.filter(
        (v) => !encounterId || v.depositEncounterId === encounterId,
      ),
      appliedPayments: payments.filter(
        (v) => !encounterId || v.invoice.encounterId === encounterId,
      ),
    };
  }
  private async voucher(
    hospitalId: number,
    userId: number,
    dto: CreatePatientDepositDto | RefundDepositDto,
    refund: boolean,
  ) {
    if (!uuid.test(dto.requestId ?? ''))
      throw new BadRequestException('يلزم معرف UUID للعملية');
    if (!['CASH', 'CARD', 'TRANSFER'].includes(dto.method))
      throw new BadRequestException('طريقة الدفع غير مدعومة');
    const amount = depositAmount(dto.amount);
    const reason = 'reason' in dto ? dto.reason.trim() : dto.notes?.trim();
    if (refund && (!reason || reason.length < 10 || reason.length > 500))
      throw new BadRequestException('يلزم سبب استرداد واضح من10 إلى500 حرف');
    const requestKey = `deposit:${hospitalId}:${dto.requestId.toLowerCase()}`;
    const hash = fingerprint({
      userId,
      refund,
      patientId: dto.patientId,
      encounterId: dto.encounterId ?? null,
      amount: amount.toFixed(3),
      method: dto.method,
      reason: reason ?? null,
      reference: 'reference' in dto ? (dto.reference ?? null) : null,
    });
    let committedAudit: Record<string, unknown> | null = null;
    const result = await cashTransaction(
      this.prisma,
      async (tx) => {
        committedAudit = null;
        await this.lockWallet(
          tx,
          hospitalId,
          dto.patientId,
          userId,
          dto.encounterId,
        );
        const replay = await tx.voucher.findUnique({
          where: { depositRequestKey: requestKey },
        });
        if (replay) {
          if (replay.depositFingerprint !== hash)
            throw new ConflictException('معرف العملية مستخدم لطلب مختلف');
          return replay;
        }
        let sessionId: number | undefined;
        if (dto.method === 'CASH') {
          const { session } = await guardCashierMovement(
            tx,
            hospitalId,
            userId,
            true,
          );
          sessionId = session!.id;
          if (refund) {
            const balance = await cashSessionBalance(tx, sessionId);
            if (balance.available.lt(amount))
              throw new BadRequestException(
                'رصيد جلسة الصندوق غير كاف للاسترداد',
              );
          }
        }
        const wallet = await this.getPatientDepositBalanceInternal(
          tx,
          hospitalId,
          dto.patientId,
        );
        if (refund && wallet.availableBalance.lt(amount))
          throw new BadRequestException('مبلغ الاسترداد يتجاوز رصيد الأمانات');
        const now = new Date();
        const { financialYear, period } = await financialPeriod(
          tx,
          hospitalId,
          now,
        );
        const account = async (code: string, type: 'ASSET' | 'LIABILITY') => {
          await tx.$queryRaw`SELECT id FROM "Account" WHERE "hospitalId"=${hospitalId} AND code=${code} FOR SHARE`;
          const a = await tx.account.findFirst({
            where: { hospitalId, code, isActive: true, type },
          });
          if (!a)
            throw new BadRequestException(`حساب غير مهيأ أو غير مناسب:${code}`);
          return a;
        };
        const liability = await account(
          ACCOUNT_CODES.PATIENT_DEPOSITS,
          'LIABILITY',
        );
        const cash = await account(
          dto.method === 'CASH'
            ? ACCOUNT_CODES.CASH_MAIN
            : ACCOUNT_CODES.BANK_MAIN,
          'ASSET',
        );
        const value = Money.toDbString(amount);
        const ids = await tx.$queryRaw<
          { id: number }[]
        >`SELECT nextval(pg_get_serial_sequence('"Voucher"','id'))::integer AS id`;
        const voucher = await tx.voucher.create({
          data: {
            id: ids[0].id,
            hospitalId,
            depositPatientId: dto.patientId,
            depositEncounterId: dto.encounterId,
            cashierSessionId: sessionId,
            depositRequestKey: requestKey,
            depositFingerprint: hash,
            code: `${refund ? 'PV' : 'RV'}-DEP-${String(ids[0].id).padStart(8, '0')}`,
            type: refund ? 'PAYMENT' : 'RECEIPT',
            status: 'POSTED',
            date: now,
            amount: value,
            accountId: liability.id,
            cashAccountId: cash.id,
            notes: reason,
            reference: 'reference' in dto ? dto.reference : undefined,
            createdById: userId,
          },
        });
        await tx.accountingEntry.create({
          data: {
            hospitalId,
            postingKey: `deposit:voucher:${hospitalId}:${voucher.id}`,
            sourceModule: 'VOUCHER',
            sourceId: voucher.id,
            createdById: userId,
            entryDate: now,
            financialYearId: financialYear.id,
            financialPeriodId: period.id,
            description: refund ? 'استرداد أمانات المريض' : 'قبض أمانات المريض',
            lines: {
              create: [
                {
                  accountId: refund ? liability.id : cash.id,
                  debit: value,
                  credit: '0.000',
                },
                {
                  accountId: refund ? cash.id : liability.id,
                  debit: '0.000',
                  credit: value,
                },
              ],
            },
          },
        });
        const auditFields = {
          hospitalId,
          userId,
          action: refund
            ? 'PATIENT_DEPOSIT_REFUNDED'
            : 'PATIENT_DEPOSIT_COLLECTED',
          entity: 'Voucher',
          entityId: voucher.id,
          details: {
            patientId: dto.patientId,
            encounterId: dto.encounterId ?? null,
            amount: value,
            method: dto.method,
            sessionId: sessionId ?? null,
            reason: reason ?? null,
            requestKey,
          },
        };
        await appendChainedAuditInTransaction(tx, auditFields);
        committedAudit = auditFields;
        return voucher;
      },
      { maxWait: 10000, timeout: 20000 },
    );
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
  }
  createDeposit(
    hospitalId: number,
    userId: number,
    dto: CreatePatientDepositDto,
  ) {
    return this.voucher(hospitalId, userId, dto, false);
  }
  refundDeposit(hospitalId: number, userId: number, dto: RefundDepositDto) {
    return this.voucher(hospitalId, userId, dto, true);
  }
  async applyDepositToInvoice(
    hospitalId: number,
    userId: number,
    dto: ApplyDepositDto,
    externalTx?: Prisma.TransactionClient,
    internalKey?: string,
  ) {
    if (!internalKey && !uuid.test(dto.requestId ?? ''))
      throw new BadRequestException('يلزم معرف UUID لعملية السداد');
    const requested =
      dto.amount !== undefined ? depositAmount(dto.amount) : null;
    const key = `deposit:apply:${hospitalId}:${internalKey ?? dto.requestId.toLowerCase()}`;
    const hash = fingerprint({
      userId,
      invoiceId: dto.invoiceId,
      amount: requested?.toFixed(3) ?? null,
    });
    let committedAudit: Record<string, unknown> | null = null;
    const work = async (tx: Prisma.TransactionClient) => {
      committedAudit = null;
      const identity = await tx.invoice.findFirst({
        where: { id: dto.invoiceId, hospitalId },
      });
      if (!identity) throw new NotFoundException('الفاتورة غير موجودة');
      await this.lockWallet(tx, hospitalId, identity.patientId, userId);
      const replay = await tx.payment.findUnique({
        where: { depositRequestKey: key },
      });
      if (replay) {
        if (replay.depositFingerprint !== hash)
          throw new ConflictException('معرف الطلب مستخدم لسداد مختلف');
        return {
          paymentId: replay.id,
          invoiceId: replay.invoiceId,
          appliedAmount: Money.toDbString(replay.amount),
          replayed: true,
        };
      }
      const invoice = await lockFinancialInvoice(tx, hospitalId, dto.invoiceId);
      if (
        invoice.currency !== 'LYD' ||
        invoice.type !== 'INVOICE' ||
        !['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)
      )
        throw new BadRequestException('حالة الفاتورة لا تسمح بالسداد');
      await assertPrescriptionCollectionAvailable(tx, invoice);
      const stored = await tx.payment.aggregate({
        where: { hospitalId, invoiceId: invoice.id },
        _sum: { amount: true },
      });
      if (!Money.eq(stored._sum.amount ?? 0, invoice.paidAmount))
        throw new ConflictException('رصيد الفاتورة لا يطابق سجل مدفوعاتها');
      const adjusted = await adjustmentBalance(
        tx,
        hospitalId,
        invoice.id,
        invoice.patientShare,
        invoice.paidAmount,
      );
      const wallet = await this.getPatientDepositBalanceInternal(
        tx,
        hospitalId,
        invoice.patientId,
      );
      const amount = Money.decimalMin(
        requested ?? adjusted.balance,
        adjusted.balance,
        wallet.availableBalance,
      );
      if (!amount.gt(0))
        throw new BadRequestException('لا يوجد رصيد متاح أو مبلغ مستحق للسداد');
      const payment = await tx.payment.create({
        data: {
          hospitalId,
          invoiceId: invoice.id,
          amount: Money.toDbString(amount),
          method: PaymentMethod.OTHER,
          cashierId: userId,
          isDepositApplication: true,
          depositRequestKey: key,
          depositFingerprint: hash,
          reference: 'PATIENT_DEPOSIT_APPLICATION',
        },
      });
      const paid = Money.sumDecimal(invoice.paidAmount, amount);
      const status = paid
        .minus(adjusted.refunded)
        .gte(Money.sumDecimal(invoice.patientShare, adjusted.delta))
        ? 'PAID'
        : 'PARTIALLY_PAID';
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount: Money.toDbString(paid), status },
      });
      await this.accounting.recordDepositApplicationEntry({
        hospitalId,
        paymentId: payment.id,
        invoiceId: invoice.id,
        amount,
        userId,
        prisma: tx,
      });
      const auditFields = {
        hospitalId,
        userId,
        action: 'PATIENT_DEPOSIT_APPLIED',
        entity: 'Invoice',
        entityId: invoice.id,
        details: {
          patientId: invoice.patientId,
          paymentId: payment.id,
          appliedAmount: Money.toDbString(amount),
          requestKey: key,
        },
      };
      await appendChainedAuditInTransaction(tx, auditFields);
      committedAudit = auditFields;
      return {
        paymentId: payment.id,
        invoiceId: invoice.id,
        appliedAmount: Money.toDbString(amount),
        remainingInvoiceBalance: Money.toDbString(
          adjusted.balance.minus(amount),
        ),
        invoiceStatus: status,
        replayed: false,
      };
    };
    if (externalTx) {
      return work(externalTx);
    }
    const result = await this.prisma.$transaction(work, {
      maxWait: 10000,
      timeout: 20000,
    });
    if (committedAudit) publishCommittedCriticalAudit(committedAudit);
    return result;
  }
}
