import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Money } from '../common/utils/money.util';
export async function cashTransaction<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxWait?: number; timeout?: number } = {
    maxWait: 10000,
    timeout: 20000,
  },
): Promise<T> {
  try {
    return await prisma.$transaction(work, options);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(
        'مرجع التنفيذ أو التمويل أو معرف العملية مستخدم مسبقًا؛ راجع السجل قبل إعادة المحاولة',
      );
    throw error;
  }
}

export async function lockCashier(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  cashierId: number,
  requireActive = true,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(27004::integer, ${hospitalId}::integer)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003::integer, ${cashierId}::integer)`;
  if (
    requireActive &&
    !(await tx.user.findFirst({
      where: { id: cashierId, hospitalId, isActive: true, isDeleted: false },
    }))
  )
    throw new NotFoundException('الكاشير غير نشط أو لا ينتمي إلى المنشأة');
}

export async function guardCashierMovement(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  cashierId: number,
  requireSession: boolean | 'IF_CONTROLLED',
) {
  await lockCashier(tx, hospitalId, cashierId);
  const at = new Date();
  if (
    await tx.cashierShiftClosing.count({
      where: {
        hospitalId,
        cashierId,
        rangeStart: { lte: at },
        rangeEnd: { gt: at },
      },
    })
  )
    throw new BadRequestException('لا يمكن تسجيل حركة داخل وردية مغلقة');
  const session = await tx.cashierSession.findFirst({
    where: { hospitalId, cashierId, status: { in: ['OPEN', 'CLOSING'] } },
  });
  if (session?.status === 'CLOSING')
    throw new BadRequestException(
      'الجلسة قيد العد والإقفال؛ تسجيل الحركات متوقف',
    );
  const required =
    requireSession === true ||
    (requireSession === 'IF_CONTROLLED' &&
      (await tx.cashierSession.count({
        where: { hospitalId, status: { in: ['OPEN', 'CLOSING', 'CLOSED'] } },
      })) > 0);
  if (!session && required)
    throw new BadRequestException('يلزم فتح جلسة صندوق برصيد افتتاحي معتمد');
  return { session, at };
}

export async function cashSessionBalance(
  tx: Prisma.TransactionClient,
  sessionId: number,
) {
  const session = await tx.cashierSession.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const receipts = await tx.payment.aggregate({
    where: { sessionId, hospitalId: session.hospitalId, method: 'CASH' },
    _sum: { amount: true },
  });
  const refunds = await tx.invoiceRefund.aggregate({
    where: {
      sessionId,
      hospitalId: session.hospitalId,
      status: 'EXECUTED',
      method: 'CASH',
    },
    _sum: { amount: true },
  });
  const handovers = await tx.cashHandover.aggregate({
    where: { sessionId, hospitalId: session.hospitalId, status: 'POSTED' },
    _sum: { amount: true },
  });
  const reserved = await tx.cashHandover.aggregate({
    where: { sessionId, hospitalId: session.hospitalId, status: 'PENDING' },
    _sum: { amount: true },
  });
  const depositCash = await tx.voucher.groupBy({
    by: ['type'],
    where: {
      hospitalId: session.hospitalId,
      cashierSessionId: sessionId,
      depositPatientId: { not: null },
      status: 'POSTED',
      deletedAt: null,
    },
    _sum: { amount: true },
  });
  const received = Money.sumDecimal(
    receipts._sum.amount ?? 0,
    depositCash.find((v) => v.type === 'RECEIPT')?._sum.amount ?? 0,
  );
  const refunded = Money.sumDecimal(
    refunds._sum.amount ?? 0,
    depositCash.find((v) => v.type === 'PAYMENT')?._sum.amount ?? 0,
  );
  const handedOver = Money.decimal(handovers._sum.amount);
  const expected = Money.sumDecimal(session.openingAmount, received)
    .minus(refunded)
    .minus(handedOver);
  const payouts = await tx.invoiceRefund.aggregate({
    where: {
      sessionId,
      hospitalId: session.hospitalId,
      status: 'DISBURSING',
      method: 'CASH',
    },
    _sum: { amount: true },
  });
  return {
    session,
    received,
    refunded,
    handedOver,
    expected,
    available: expected
      .minus(Money.decimal(reserved._sum.amount))
      .minus(Money.decimal(payouts._sum.amount)),
  };
}

export function validAmount(value: string, allowZero = false) {
  if (
    !/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(value) ||
    (allowZero ? Money.isNegative(value) : !Money.isPositive(value))
  )
    throw new BadRequestException('المبلغ غير صالح أو يتجاوز دقة النظام');
  return Money.toDbString(value);
}

export function evidence(value: string) {
  if (value.trim().length < 5 || value.length > 1000)
    throw new BadRequestException(
      'يلزم دليل أو سبب واضح من خمسة أحرف على الأقل',
    );
  return value.trim();
}
