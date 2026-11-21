import { BadRequestException } from '@nestjs/common';
import { Prisma, ProductType, SystemAccountKey } from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { financialPeriod } from '../accounting/financial-posting';

export function inventoryKey(type: ProductType): SystemAccountKey {
  if (type === 'DRUG') return 'INVENTORY_DRUGS';
  if (type === 'SUPPLY') return 'INVENTORY_SUPPLIES';
  if (type === 'LAB_REAGENT') return 'INVENTORY_LAB';
  throw new BadRequestException(
    'هذا النوع يحتاج دورة أصول أو تصنيف مخزني معتمد',
  );
}
export async function mappedAccount(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  key: SystemAccountKey,
) {
  const mapping = await tx.systemAccountMapping.findFirst({
    where: {
      hospitalId,
      key,
      isActive: true,
      account: { hospitalId, isActive: true },
    },
    include: { account: true },
  });
  if (!mapping)
    throw new BadRequestException(`حساب الربط غير مهيأ أو غير نشط: ${key}`);
  if (
    [
      'INVENTORY_DRUGS',
      'INVENTORY_SUPPLIES',
      'INVENTORY_LAB',
      'INVENTORY_RADIOLOGY',
    ].includes(key) &&
    mapping.account.type !== 'ASSET'
  )
    throw new BadRequestException('حساب المخزون يجب أن يكون أصلًا');
  return mapping.account;
}
export async function postPurchaseReturn(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  id: number,
  userId: number,
  payableAccountId: number,
  inventory: Map<number, Prisma.Decimal>,
  amount: string,
  at: Date,
) {
  const { financialYear, period } = await financialPeriod(tx, hospitalId, at);
  const lines = [
    { accountId: payableAccountId, debit: amount, credit: '0.000' },
  ];
  let book = Money.decimal(0);
  for (const [accountId, cost] of inventory) {
    book = book.plus(cost);
    if (cost.gt(0))
      lines.push({ accountId, debit: '0.000', credit: Money.toDbString(cost) });
  }
  if (book.gte('1000000000000000'))
    throw new BadRequestException('قيمة المخزون تتجاوز دقة التخزين');
  const variance = book.minus(amount);
  if (!variance.isZero()) {
    const account = await mappedAccount(
      tx,
      hospitalId,
      variance.gt(0) ? 'INVENTORY_LOSS' : 'INVENTORY_GAIN',
    );
    if (account.type !== (variance.gt(0) ? 'EXPENSE' : 'REVENUE'))
      throw new BadRequestException('حساب فرق تقييم المخزون غير مناسب');
    lines.push({
      accountId: account.id,
      debit: variance.gt(0) ? Money.toDbString(variance) : '0.000',
      credit: variance.lt(0) ? Money.toDbString(variance.abs()) : '0.000',
    });
  }
  if (
    !Money.eq(
      Money.sumDecimal(...lines.map((l) => l.debit)),
      Money.sumDecimal(...lines.map((l) => l.credit)),
    )
  )
    throw new BadRequestException('قيد المرتجع غير متوازن');
  return tx.accountingEntry.create({
    data: {
      hospitalId,
      postingKey: `purchase-return:${hospitalId}:${id}`,
      sourceModule: 'PURCHASE_RETURN',
      sourceId: id,
      entryDate: at,
      financialYearId: financialYear.id,
      financialPeriodId: period.id,
      createdById: userId,
      description: `مرتجع مشتريات موثق #${id}`,
      lines: { create: lines },
    },
  });
}
