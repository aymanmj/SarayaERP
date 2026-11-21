import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  cashSessionBalance,
  cashTransaction,
  evidence,
  lockCashier,
  validAmount,
} from './cash-control';
import { Money } from '../common/utils/money.util';
import { financialPeriod } from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';

@Injectable()
export class CashierSessionsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(hospitalId: number, cashierId: number, all: boolean) {
    return cashTransaction(this.prisma, async (tx) => {
      const sessions = await tx.cashierSession.findMany({
        where: { hospitalId, ...(all ? {} : { cashierId }) },
        orderBy: { id: 'desc' },
        take: 30,
        include: {
          cashier: {
            select: { fullName: true, isActive: true, isDeleted: true },
          },
          countedBy: { select: { fullName: true } },
          closedBy: { select: { fullName: true } },
          handovers: { orderBy: { id: 'desc' } },
        },
      });
      const items: ((typeof sessions)[number] & {
        received: string;
        refunded: string;
        handedOver: string;
        expected: string;
        available: string;
      })[] = [];
      for (const session of sessions) {
        const totals = await cashSessionBalance(tx, session.id);
        items.push({
          ...session,
          received: Money.toDbString(totals.received),
          refunded: Money.toDbString(totals.refunded),
          handedOver: Money.toDbString(totals.handedOver),
          expected: Money.toDbString(totals.expected),
          available: Money.toDbString(totals.available),
        });
      }
      return items;
    });
  }
  private async locked(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    id: number,
  ) {
    const row = await tx.cashierSession.findFirst({
      where: { id, hospitalId },
    });
    if (!row) throw new NotFoundException('جلسة الصندوق غير موجودة');
    await lockCashier(tx, hospitalId, row.cashierId, false);
    return tx.cashierSession.findUniqueOrThrow({ where: { id } });
  }
  private audit(
    tx: Prisma.TransactionClient,
    hospitalId: number,
    userId: number,
    action: string,
    id: number,
    details: Prisma.InputJsonObject,
  ) {
    return appendChainedAuditInTransaction(tx, {
      hospitalId,
      userId,
      action,
      entity: 'CashierSession',
      entityId: id,
      details,
    });
  }
  async request(
    hospitalId: number,
    cashierId: number,
    dto: { amount: string; reason: string; requestId: string },
  ) {
    const amount = validAmount(dto.amount, true);
    const reason = evidence(dto.reason);
    return cashTransaction(this.prisma, async (tx) => {
      await lockCashier(tx, hospitalId, cashierId);
      const requestKey = `session:${hospitalId}:${cashierId}:${dto.requestId}`;
      const previous = await tx.cashierSession.findUnique({
        where: { requestKey },
      });
      if (previous) {
        if (
          !Money.eq(previous.openingAmount, amount) ||
          previous.reason !== reason
        )
          throw new BadRequestException('معرف الجلسة مستعمل ببيانات مختلفة');
        return previous;
      }
      if (
        await tx.cashierSession.count({
          where: {
            hospitalId,
            cashierId,
            status: { in: ['PENDING', 'OPEN', 'CLOSING'] },
          },
        })
      )
        throw new BadRequestException('يوجد طلب أو جلسة صندوق لم تُقفل');
      const row = await tx.cashierSession.create({
        data: {
          hospitalId,
          cashierId,
          requestKey,
          openingAmount: amount,
          reason,
        },
      });
      await this.audit(
        tx,
        hospitalId,
        cashierId,
        'REQUEST_CASH_SESSION',
        row.id,
        { amount, reason },
      );
      return row;
    });
  }
  async review(
    hospitalId: number,
    id: number,
    reviewerId: number,
    approve: boolean,
    reason: string,
    reference: string,
  ) {
    reason = evidence(reason);
    reference = evidence(reference);
    return cashTransaction(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27004::integer, ${hospitalId}::integer)`;
      const session = await this.locked(tx, hospitalId, id);
      if (session.cashierId === reviewerId)
        throw new ForbiddenException(
          'اعتماد الرصيد الافتتاحي يحتاج موظفًا آخر',
        );
      const status = approve ? 'OPEN' : 'REJECTED';
      if (
        session.status === status &&
        session.reviewedById === reviewerId &&
        session.openingReference === reference
      )
        return session;
      if (session.status !== 'PENDING')
        throw new BadRequestException('طلب الجلسة ليس معلقًا');
      if (approve) await lockCashier(tx, hospitalId, session.cashierId);
      const openedAt = new Date();
      if (
        approve &&
        (await tx.cashierShiftClosing.count({
          where: {
            hospitalId,
            cashierId: session.cashierId,
            rangeStart: { lte: openedAt },
            rangeEnd: { gt: openedAt },
          },
        }))
      )
        throw new BadRequestException(
          'وقت الفتح داخل إقفال سابق؛ يلزم مراجعة بيانات الوردية',
        );
      const row = await tx.cashierSession.update({
        where: { id },
        data: {
          status,
          reviewedById: reviewerId,
          reviewReason: reason,
          openingReference: reference,
          openingKey:
            approve && Money.isPositive(session.openingAmount)
              ? `opening:${hospitalId}:${reference}`
              : null,
          openedAt: approve ? openedAt : null,
        },
      });
      await this.audit(
        tx,
        hospitalId,
        reviewerId,
        approve ? 'OPEN_CASH_SESSION' : 'REJECT_CASH_SESSION',
        id,
        { reason, reference, openingAmount: row.openingAmount.toString() },
      );
      return row;
    });
  }
  async handover(
    hospitalId: number,
    sessionId: number,
    userId: number,
    dto: { amount: string; reason: string; requestId: string },
  ) {
    const amount = validAmount(dto.amount);
    const reason = evidence(dto.reason);
    return cashTransaction(this.prisma, async (tx) => {
      const session = await this.locked(tx, hospitalId, sessionId);
      if (session.cashierId !== userId)
        throw new ForbiddenException('التسليم لموظف الصندوق المسؤول فقط');
      const requestKey = `handover:${hospitalId}:${sessionId}:${dto.requestId}`;
      const previous = await tx.cashHandover.findUnique({
        where: { requestKey },
      });
      if (previous) {
        if (!Money.eq(previous.amount, amount) || previous.reason !== reason)
          throw new BadRequestException('معرف التسليم مستعمل ببيانات مختلفة');
        return previous;
      }
      if (session.status !== 'OPEN')
        throw new BadRequestException('الجلسة ليست مفتوحة');
      if ((await cashSessionBalance(tx, sessionId)).available.lt(amount))
        throw new BadRequestException('مبلغ التسليم يتجاوز النقد المتاح');
      const row = await tx.cashHandover.create({
        data: {
          hospitalId,
          sessionId,
          requestedById: userId,
          requestKey,
          amount,
          reason,
        },
      });
      await this.audit(
        tx,
        hospitalId,
        userId,
        'REQUEST_CASH_HANDOVER',
        sessionId,
        { handoverId: row.id, amount, reason },
      );
      return row;
    });
  }
  async reviewHandover(
    hospitalId: number,
    sessionId: number,
    id: number,
    userId: number,
    approve: boolean,
    reason: string,
    reference: string,
  ) {
    reason = evidence(reason);
    reference = evidence(reference);
    return cashTransaction(this.prisma, async (tx) => {
      const session = await this.locked(tx, hospitalId, sessionId);
      const row = await tx.cashHandover.findFirst({
        where: { id, sessionId, hospitalId },
      });
      if (!row) throw new NotFoundException('طلب التسليم غير موجود');
      if (row.requestedById === userId)
        throw new ForbiddenException('تأكيد استلام الخزينة يحتاج موظفًا آخر');
      const status = approve ? 'POSTED' : 'REJECTED';
      if (
        row.status === status &&
        row.reviewedById === userId &&
        row.reference === reference
      )
        return row;
      if (row.status !== 'PENDING' || session.status !== 'OPEN')
        throw new BadRequestException(
          'لا يمكن مراجعة التسليم في الحالة الحالية',
        );
      if (
        approve &&
        (await cashSessionBalance(tx, sessionId)).available
          .plus(row.amount)
          .lt(row.amount)
      )
        throw new BadRequestException('النقد المتاح لم يعد يكفي للتسليم');
      const updated = await tx.cashHandover.update({
        where: { id },
        data: {
          status,
          reviewedById: userId,
          reviewReason: reason,
          reference,
          referenceKey: approve ? `handover:${hospitalId}:${reference}` : null,
          postedAt: approve ? new Date() : null,
        },
      });
      await this.audit(
        tx,
        hospitalId,
        userId,
        approve ? 'POST_CASH_HANDOVER' : 'REJECT_CASH_HANDOVER',
        sessionId,
        { handoverId: id, amount: row.amount.toString(), reference, reason },
      );
      return updated;
    });
  }
  async count(
    hospitalId: number,
    id: number,
    cashierId: number,
    amount: string,
    reason: string,
  ) {
    return this.recordCount(hospitalId, id, cashierId, amount, reason);
  }
  async custodyCount(
    hospitalId: number,
    id: number,
    supervisorId: number,
    dto: {
      amount: string;
      reason: string;
      reference: string;
      confirmedCustody: boolean;
    },
  ) {
    if (dto.confirmedCustody !== true)
      throw new BadRequestException('يلزم تأكيد الجرد الفعلي وتسلم العهدة');
    return this.recordCount(
      hospitalId,
      id,
      supervisorId,
      dto.amount,
      dto.reason,
      evidence(dto.reference),
    );
  }
  private async recordCount(
    hospitalId: number,
    id: number,
    cashierId: number,
    amount: string,
    reason: string,
    custodyReference: string | null = null,
  ) {
    amount = validAmount(amount, true);
    reason = evidence(reason);
    return cashTransaction(this.prisma, async (tx) => {
      const session = await this.locked(tx, hospitalId, id);
      if (
        custodyReference
          ? session.cashierId === cashierId
          : session.cashierId !== cashierId
      )
        throw new ForbiddenException(
          'الجرد الاستثنائي لمشرف آخر، والعد المعتاد لصاحب الصندوق',
        );
      if (
        session.status === 'CLOSING' &&
        session.countedById === cashierId &&
        session.custodyReference === custodyReference &&
        Money.eq(session.countedAmount, amount) &&
        session.countReason === reason
      )
        return session;
      if (session.status !== 'OPEN')
        throw new BadRequestException('الجلسة ليست مفتوحة');
      if (custodyReference) {
        const [owner] = await tx.$queryRaw<
          { isActive: boolean; isDeleted: boolean }[]
        >`SELECT "isActive", "isDeleted" FROM "User" WHERE id=${session.cashierId} AND "hospitalId"=${hospitalId} FOR SHARE`;
        if (!owner || (owner.isActive && !owner.isDeleted))
          throw new BadRequestException(
            'الجرد الاستثنائي مخصص لحساب صاحب صندوق معطل أو محذوف',
          );
      }

      if (
        await tx.invoiceRefund.count({
          where: { hospitalId, sessionId: id, status: 'DISBURSING' },
        })
      )
        throw new BadRequestException(
          'يلزم حسم حجوزات الصرف الجاري قبل عد الصندوق',
        );
      if (
        await tx.cashHandover.count({
          where: { sessionId: id, hospitalId, status: 'PENDING' },
        })
      )
        throw new BadRequestException('يلزم حسم طلبات تسليم الخزينة قبل العد');
      const row = await tx.cashierSession.update({
        where: { id },
        data: {
          status: 'CLOSING',
          countedAmount: amount,
          countReason: reason,
          countedById: cashierId,
          custodyReference,
          countedAt: new Date(),
        },
      });
      await this.audit(
        tx,
        hospitalId,
        cashierId,
        custodyReference
          ? 'COUNT_EXCEPTIONAL_CASH_CUSTODY'
          : 'COUNT_CASH_SESSION',
        id,
        {
          countedAmount: amount,
          countedById: cashierId,
          custodyReference,
          ownerId: session.cashierId,
          reason,
        },
      );
      return row;
    });
  }
  async close(
    hospitalId: number,
    id: number,
    reviewerId: number,
    reason: string,
  ) {
    reason = evidence(reason);
    return cashTransaction(
      this.prisma,
      async (tx) => {
        const session = await this.locked(tx, hospitalId, id);
        if (
          session.cashierId === reviewerId ||
          session.countedById === reviewerId
        )
          throw new ForbiddenException('اعتماد العد والإقفال يحتاج موظفًا آخر');
        if (session.status === 'CLOSED') return session;
        if (
          session.status !== 'CLOSING' ||
          !session.openedAt ||
          !session.countedAt ||
          session.countedAmount === null
        )
          throw new BadRequestException('لم يُستكمل العد الفعلي');
        const balance = await cashSessionBalance(tx, id);
        const difference = Money.subtractDecimal(
          session.countedAmount,
          balance.expected,
        );
        if (
          await tx.cashierShiftClosing.count({
            where: {
              hospitalId,
              cashierId: session.cashierId,
              rangeStart: { lt: session.countedAt },
              rangeEnd: { gt: session.openedAt },
            },
          })
        )
          throw new BadRequestException('تتداخل الجلسة مع إقفال سابق');
        let accountingEntryId: number | null = null;
        if (!difference.isZero()) {
          const at = new Date();
          const { financialYear, period } = await financialPeriod(
            tx,
            hospitalId,
            at,
          );
          const cash = await tx.systemAccountMapping.findFirst({
            where: {
              hospitalId,
              key: 'CASH_MAIN',
              isActive: true,
              account: { hospitalId, isActive: true },
            },
          });
          const variance = await tx.systemAccountMapping.findFirst({
            where: {
              hospitalId,
              key: 'CASH_SHORT_OVER',
              isActive: true,
              account: { hospitalId, isActive: true },
            },
          });
          if (!cash || !variance)
            throw new BadRequestException(
              'حساب الصندوق أو العجز والزيادة غير مهيأ',
            );
          const positive = difference.gt(0);
          const absolute = Money.toDbString(difference.abs());
          const entry = await tx.accountingEntry.create({
            data: {
              hospitalId,
              postingKey: `session-close:${hospitalId}:${id}`,
              sourceModule: 'CASHIER',
              sourceId: id,
              financialYearId: financialYear.id,
              financialPeriodId: period.id,
              entryDate: at,
              createdById: reviewerId,
              description: `فرق عد فعلي لجلسة صندوق #${id}`,
              lines: {
                create: [
                  {
                    accountId: cash.accountId,
                    debit: positive ? absolute : '0',
                    credit: positive ? '0' : absolute,
                  },
                  {
                    accountId: variance.accountId,
                    debit: positive ? '0' : absolute,
                    credit: positive ? absolute : '0',
                  },
                ],
              },
            },
          });
          accountingEntryId = entry.id;
        }
        await tx.cashierShiftClosing.create({
          data: {
            hospitalId,
            cashierId: session.cashierId,
            sessionId: id,
            rangeStart: session.openedAt,
            rangeEnd: session.countedAt,
            openingCashTotal: session.openingAmount,
            refundedCashTotal: Money.toDbString(balance.refunded),
            handedOverCashTotal: Money.toDbString(balance.handedOver),
            systemCashTotal: Money.toDbString(balance.expected),
            actualCashTotal: session.countedAmount,
            difference: Money.toDbString(difference),
            note: reason,
            accountingEntryId,
          },
        });
        const row = await tx.cashierSession.update({
          where: { id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            closedById: reviewerId,
          },
        });
        await this.audit(tx, hospitalId, reviewerId, 'CLOSE_CASH_SESSION', id, {
          reason,
          expected: Money.toDbString(balance.expected),
          counted: session.countedAmount.toString(),
          difference: Money.toDbString(difference),
          accountingEntryId,
          countedById: session.countedById,
          custodyReference: session.custodyReference,
        });
        return row;
      },
      { maxWait: 10000, timeout: 20000 },
    );
  }
  async withdraw(
    hospitalId: number,
    id: number,
    cashierId: number,
    reason: string,
  ) {
    reason = evidence(reason);
    return cashTransaction(this.prisma, async (tx) => {
      const session = await this.locked(tx, hospitalId, id);
      const ownOrdinary =
        session.cashierId === cashierId && !session.custodyReference;
      const ownCustodyCount =
        session.status === 'CLOSING' &&
        !!session.custodyReference &&
        session.countedById === cashierId;
      if (!ownOrdinary && !ownCustodyCount)
        throw new ForbiddenException('سحب العد لمن سجله فقط');
      if (!['PENDING', 'CLOSING'].includes(session.status))
        throw new BadRequestException('لا يمكن سحب الطلب في هذه الحالة');
      const status = session.status === 'PENDING' ? 'CANCELLED' : 'OPEN';
      const row = await tx.cashierSession.update({
        where: { id },
        data: {
          status,
          countedAmount: null,
          countedAt: null,
          countReason: null,
          countedById: null,
          custodyReference: null,
        },
      });
      await this.audit(
        tx,
        hospitalId,
        cashierId,
        'WITHDRAW_CASH_SESSION_REQUEST',
        id,
        {
          reason,
          previousStatus: session.status,
          status,
          previousCount: session.countedAmount?.toString() ?? null,
          previousCountedById: session.countedById,
          previousCustodyReference: session.custodyReference,
        },
      );
      return row;
    });
  }
  async rejectCount(
    hospitalId: number,
    id: number,
    reviewerId: number,
    reason: string,
  ) {
    reason = evidence(reason);
    return cashTransaction(this.prisma, async (tx) => {
      const session = await this.locked(tx, hospitalId, id);
      if (
        session.cashierId === reviewerId ||
        session.countedById === reviewerId
      )
        throw new ForbiddenException(
          'رفض العد يحتاج مراجعًا مستقلاً عن صاحب العهدة ومن سجل الجرد',
        );
      if (session.status !== 'CLOSING')
        throw new BadRequestException('الجلسة ليست قيد مراجعة العد');
      const row = await tx.cashierSession.update({
        where: { id },
        data: {
          status: 'OPEN',
          countedAmount: null,
          countReason: null,
          countedAt: null,
          countedById: null,
          custodyReference: null,
        },
      });
      await this.audit(tx, hospitalId, reviewerId, 'REJECT_CASH_COUNT', id, {
        reason,
        previousCountedById: session.countedById,
        previousCount: session.countedAmount?.toString() ?? null,
        previousCustodyReference: session.custodyReference,
        previousCountReason: session.countReason,
      });
      return row;
    });
  }
}
