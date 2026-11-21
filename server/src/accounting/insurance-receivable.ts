import { BadRequestException } from '@nestjs/common';
import { type Invoice, Prisma } from '@prisma/client';
import { Money } from '../common/utils/money.util';
import {
  invoicePostingKey,
  insuranceReceivableLinePrefix,
} from './financial-posting';

export async function originalInsuranceReceivable(
  tx: Prisma.TransactionClient,
  invoice: Pick<Invoice, 'id' | 'hospitalId' | 'insuranceShare'>,
) {
  const { id: invoiceId, hospitalId } = invoice;
  const postingKey = invoicePostingKey(hospitalId, invoiceId);
  await tx.$queryRaw`SELECT id FROM "AccountingEntry" WHERE "postingKey" = ${postingKey} FOR UPDATE`;
  const journal = await tx.accountingEntry.findFirst({
    where: {
      hospitalId,
      postingKey,
      sourceId: invoiceId,
      sourceModule: 'BILLING',
    },
    include: { lines: { include: { account: true } } },
  });
  const lines = journal?.lines.filter(({ description }) =>
    description?.startsWith(insuranceReceivableLinePrefix),
  );
  const receivable = lines?.[0];
  if (
    !journal ||
    !receivable ||
    lines?.length !== 1 ||
    !Money.eq(receivable.debit, invoice.insuranceShare) ||
    !Money.isZero(receivable.credit) ||
    receivable.account.hospitalId !== hospitalId ||
    !receivable.account.isActive ||
    receivable.account.type !== 'ASSET' ||
    (await tx.accountingEntry.count({
      where: {
        hospitalId,
        sourceModule: 'JOURNAL_REVERSAL',
        sourceId: journal.id,
      },
    }))
  )
    throw new BadRequestException(
      `قيد ذمة التأمين الأصلي للفاتورة #${invoiceId} يحتاج إلى مطابقة`,
    );
  return { journal, receivable };
}
