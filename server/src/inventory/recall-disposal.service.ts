import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryRecallDisposal, Prisma } from '@prisma/client';
import { financialPeriod } from '../accounting/financial-posting';
import { appendChainedAuditInTransaction } from '../audit/audit-chain';
import { Money } from '../common/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  inventoryKey,
  mappedAccount,
} from '../purchases/purchase-return-posting';
import { assertOwnedQuantity } from './material-transfer';
import { recalledBatch } from './recall-followup';

type Tx = Prisma.TransactionClient;
type Actor = { hospitalId: number; sub: number };
type RequestInput = {
  isolationId: number;
  requestId: string;
  quantity: string;
  reason: string;
};
type DecisionInput = {
  decision: 'APPROVE' | 'REJECT' | 'CANCEL';
  note: string;
};
type EvidenceInput = {
  quantity: string;
  evidenceReference: string;
  performedBy: string;
  performedAt: string;
};
type ReconciliationInput = {
  countedRemaining: string;
  reference: string;
  note: string;
};
type InvestigationInput = {
  requestId: string;
  countedRemaining: string;
  countReference: string;
  findings: string;
  version: number;
  movementIds: number[];
};
type InvestigationDecision = { decision: 'RESOLVE' | 'ESCALATE'; note: string };

export const disposalQuantityPattern = /^(0|[1-9]\d{0,14})(\.\d{1,3})?$/;

function requiredText(value: string, minimum: number) {
  const clean = value.trim();
  if (clean.length < minimum)
    throw new BadRequestException('بيانات الإتلاف غير مكتملة');
  return clean;
}

@Injectable()
export class RecallDisposalService {
  constructor(private readonly db: PrismaService) {}

  list(actor: Actor, stockId: number, before?: number) {
    return this.db.$transaction(async (tx) => {
      await recalledBatch(tx, actor.hospitalId, stockId);
      const rows = await tx.inventoryRecallDisposal.findMany({
        where: {
          hospitalId: actor.hospitalId,
          stockId,
          id: before === undefined ? undefined : { lt: before },
        },
        orderBy: { id: 'desc' },
        take: 31,
        include: {
          isolation: {
            select: {
              onHand: true,
              isolatedQuantity: true,
              location: true,
              recordedAt: true,
            },
          },
          investigations: {
            select: { id: true, status: true },
            orderBy: { id: 'desc' },
            take: 1,
          },
        },
      });
      return {
        records: rows.slice(0, 30),
        nextBefore: rows.length > 30 ? rows[29].id : null,
      };
    });
  }

  request(actor: Actor, stockId: number, input: RequestInput) {
    const reason = requiredText(input.reason, 5);
    const quantity = new Prisma.Decimal(input.quantity);
    if (!quantity.gt(0))
      throw new BadRequestException('كمية الإتلاف يجب أن تكون موجبة');
    return this.withStock(actor, stockId, async (tx, stock) => {
      const existing = await tx.inventoryRecallDisposal.findUnique({
        where: {
          hospitalId_requestId: {
            hospitalId: actor.hospitalId,
            requestId: input.requestId,
          },
        },
      });
      if (existing) {
        if (
          existing.stockId !== stockId ||
          existing.requestedById !== actor.sub ||
          existing.isolationId !== input.isolationId ||
          !existing.quantity.eq(quantity) ||
          existing.reason !== reason
        )
          throw new ConflictException('معرّف الطلب مستخدم لعملية أخرى');
        return existing;
      }
      this.assertEligible(stock);
      await this.checkIsolation(tx, stock, input.isolationId, quantity);
      const row = await tx.inventoryRecallDisposal.create({
        data: {
          hospitalId: actor.hospitalId,
          stockId,
          isolationId: input.isolationId,
          requestId: input.requestId,
          quantity,
          reason,
          requestedById: actor.sub,
        },
      });
      await this.audit(tx, actor, row);
      return row;
    });
  }

  review(actor: Actor, stockId: number, id: number, input: DecisionInput) {
    const note = requiredText(input.note, 5);
    return this.withStock(actor, stockId, async (tx, stock) => {
      const row = await this.find(tx, actor, stockId, id);
      if (input.decision === 'CANCEL') {
        if (
          row.status === 'CANCELLED' &&
          row.cancelledById === actor.sub &&
          row.cancellationNote === note
        )
          return row;
        if (row.status !== 'REQUESTED' && row.status !== 'APPROVED')
          throw new ConflictException('لا يمكن إلغاء الطلب في حالته الحالية');
        return this.update(tx, actor, row, {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: actor.sub,
          cancellationNote: note,
        });
      }
      if (row.requestedById === actor.sub)
        throw new ForbiddenException('يلزم أن يراجع الطلب موظف آخر');
      const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      if (
        row.status === status &&
        row.reviewedById === actor.sub &&
        row.reviewNote === note
      )
        return row;
      if (row.status !== 'REQUESTED')
        throw new ConflictException('سبق البت في الطلب');
      if (status === 'APPROVED') {
        this.assertEligible(stock);
        await this.checkIsolation(tx, stock, row.isolationId, row.quantity);
        if (
          await tx.inventoryRecallDisposal.findFirst({
            where: {
              hospitalId: actor.hospitalId,
              stockId,
              status: { in: ['APPROVED', 'EXECUTED'] },
            },
            select: { id: true },
          })
        )
          throw new ConflictException('يوجد طلب إتلاف معتمد لهذا الرصيد');
      }
      return this.update(tx, actor, row, {
        status,
        reviewedById: actor.sub,
        reviewedAt: new Date(),
        reviewNote: note,
      });
    });
  }

  evidence(actor: Actor, stockId: number, id: number, input: EvidenceInput) {
    const performedAt = new Date(input.performedAt);
    const evidenceReference = requiredText(input.evidenceReference, 3);
    const performedBy = requiredText(input.performedBy, 2);
    const quantity = new Prisma.Decimal(input.quantity);
    return this.withStock(actor, stockId, async (tx) => {
      const row = await this.find(tx, actor, stockId, id);
      if (['EXECUTED', 'POSTED', 'NO_DISPOSAL'].includes(row.status)) {
        if (
          row.evidenceReference === evidenceReference &&
          row.performedBy === performedBy &&
          row.performedQuantity?.eq(quantity) &&
          row.performedAt?.getTime() === performedAt.getTime() &&
          row.recordedById === actor.sub
        )
          return row;
        throw new ConflictException('سبق توثيق التنفيذ');
      }
      if (row.status !== 'APPROVED' || !row.reviewedAt)
        throw new ConflictException('يلزم اعتماد الإتلاف أولاً');
      const now = new Date();
      if (
        !Number.isFinite(performedAt.getTime()) ||
        performedAt > now ||
        performedAt.getTime() <
          Math.floor(row.reviewedAt.getTime() / 1000) * 1000
      )
        throw new BadRequestException(
          'وقت التنفيذ يجب أن يكون بعد الاعتماد وحتى الوقت الحالي',
        );
      return this.update(tx, actor, row, {
        status: 'EXECUTED',
        evidenceReference,
        performedBy,
        performedQuantity: quantity,
        performedAt,
        recordedById: actor.sub,
        recordedAt: now,
      });
    });
  }

  reconcile(
    actor: Actor,
    stockId: number,
    id: number,
    input: ReconciliationInput,
  ) {
    const reference = requiredText(input.reference, 3);
    const note = requiredText(input.note, 5);
    const countedRemaining = new Prisma.Decimal(input.countedRemaining);
    return this.withStock(actor, stockId, async (tx, stock) => {
      const row = await this.find(tx, actor, stockId, id);
      if (row.reconciledById !== null) {
        if (
          row.reconciledById === actor.sub &&
          row.reconciliationReference === reference &&
          row.reconciliationNote === note &&
          row.countedRemaining?.eq(countedRemaining)
        )
          return row;
        throw new ConflictException('سبق اعتماد تسوية لهذا المحضر');
      }
      if (
        await tx.inventoryRecallDisposalInvestigation.findFirst({
          where: { hospitalId: actor.hospitalId, disposalId: id },
          select: { id: true },
        })
      )
        throw new ConflictException('يلزم استكمال التسوية عبر التحقيق المرتبط');
      return this.applyReconciliation(
        tx,
        actor,
        stock,
        row,
        countedRemaining,
        reference,
        note,
      );
    });
  }

  investigationHistory(
    actor: Actor,
    stockId: number,
    id: number,
    before?: number,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await recalledBatch(tx, actor.hospitalId, stockId);
        await this.find(tx, actor, stockId, id);
        const stock = await tx.productStock.findFirstOrThrow({
          where: { id: stockId, hospitalId: actor.hospitalId },
        });
        const rows = await tx.inventoryRecallDisposalInvestigation.findMany({
          where: {
            hospitalId: actor.hospitalId,
            disposalId: id,
            id: before === undefined ? undefined : { lt: before },
          },
          orderBy: { id: 'desc' },
          take: 21,
        });
        return {
          records: rows.slice(0, 20),
          nextBefore: rows.length > 20 ? rows[19].id : null,
          version: stock.version,
          movements: await this.investigationMovements(tx, stock),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  submitInvestigation(
    actor: Actor,
    stockId: number,
    id: number,
    input: InvestigationInput,
  ) {
    const countReference = requiredText(input.countReference, 3);
    const findings = requiredText(input.findings, 10);
    const countedRemaining = new Prisma.Decimal(input.countedRemaining);
    return this.withStock(actor, stockId, async (tx, stock) => {
      const disposal = await this.find(tx, actor, stockId, id);
      const replay = await tx.inventoryRecallDisposalInvestigation.findUnique({
        where: {
          hospitalId_requestId: {
            hospitalId: actor.hospitalId,
            requestId: input.requestId,
          },
        },
      });
      if (replay) {
        if (
          replay.disposalId === id &&
          replay.submittedById === actor.sub &&
          replay.version === input.version &&
          replay.countedRemaining.eq(countedRemaining) &&
          replay.countReference === countReference &&
          replay.findings === findings &&
          sameMovementIds(replay.movementIds, input.movementIds)
        )
          return replay;
        throw new ConflictException('معرّف الطلب مستخدم لنتائج تحقيق أخرى');
      }
      this.unresolvedQuantity(disposal);
      if (
        await tx.inventoryRecallDisposalInvestigation.findFirst({
          where: {
            hospitalId: actor.hospitalId,
            disposalId: id,
            status: 'SUBMITTED',
          },
          select: { id: true },
        })
      )
        throw new ConflictException('توجد نتائج تحقيق بانتظار المراجعة');
      const movements = await this.investigationMovements(tx, stock);
      if (
        stock.version !== input.version ||
        !sameMovementIds(
          movements.map(({ id }) => id),
          input.movementIds,
        )
      )
        throw new ConflictException(
          'تغير سجل الحركات؛ حدّثه قبل إرسال نتائج التحقيق',
        );
      const saved = await tx.inventoryRecallDisposalInvestigation.create({
        data: {
          hospitalId: actor.hospitalId,
          disposalId: id,
          requestId: input.requestId,
          countedRemaining,
          version: stock.version,
          movementIds: input.movementIds,
          countReference,
          findings,
          submittedById: actor.sub,
        },
      });
      await this.investigationAudit(tx, actor, saved);
      return saved;
    });
  }

  reviewInvestigation(
    actor: Actor,
    stockId: number,
    id: number,
    investigationId: number,
    input: InvestigationDecision,
  ) {
    const note = requiredText(input.note, 5);
    const status = input.decision === 'RESOLVE' ? 'RESOLVED' : 'ESCALATED';
    return this.withStock(actor, stockId, async (tx, stock) => {
      const disposal = await this.find(tx, actor, stockId, id);
      const row = await tx.inventoryRecallDisposalInvestigation.findFirst({
        where: {
          id: investigationId,
          disposalId: id,
          hospitalId: actor.hospitalId,
        },
      });
      if (!row) throw new NotFoundException('نتائج التحقيق غير موجودة');
      if (
        row.status === status &&
        row.reviewedById === actor.sub &&
        row.decisionNote === note
      )
        return row;
      if (row.status !== 'SUBMITTED')
        throw new ConflictException('سبق اعتماد قرار لهذا التحقيق');
      if (
        actor.sub === row.submittedById ||
        actor.sub === disposal.requestedById ||
        actor.sub === disposal.recordedById
      )
        throw new ForbiddenException(
          'يلزم مراجع مستقل عن مقدّم الطلب ومسجّل التنفيذ ومقدّم نتائج التحقيق',
        );
      if (status === 'RESOLVED') {
        const movements = await this.investigationMovements(tx, stock);
        if (
          stock.version !== row.version ||
          !sameMovementIds(
            movements.map(({ id }) => id),
            row.movementIds,
          )
        )
          throw new ConflictException(
            'تغير سجل الحركات؛ صعّد النتيجة وأعد التحقيق قبل التسوية',
          );
      }
      const saved = await tx.inventoryRecallDisposalInvestigation.update({
        where: { id: row.id, hospitalId: actor.hospitalId },
        data: {
          status,
          reviewedById: actor.sub,
          reviewedAt: new Date(),
          decisionNote: note,
        },
      });
      if (status === 'RESOLVED')
        await this.applyReconciliation(
          tx,
          actor,
          stock,
          disposal,
          row.countedRemaining,
          row.countReference,
          note,
        );
      await this.investigationAudit(tx, actor, saved);
      return saved;
    });
  }

  private unresolvedQuantity(row: InventoryRecallDisposal) {
    if (
      row.status !== 'EXECUTED' ||
      row.reconciledById !== null ||
      !row.performedQuantity ||
      row.performedQuantity.eq(row.quantity)
    )
      throw new ConflictException('يلزم محضر إتلاف بفارق غير مسوّى');
    return row.performedQuantity;
  }

  private async applyReconciliation(
    tx: Tx,
    actor: Actor,
    stock: DisposalStock,
    row: InventoryRecallDisposal,
    countedRemaining: Prisma.Decimal,
    reference: string,
    note: string,
  ) {
    const actual = this.unresolvedQuantity(row);
    if (actor.sub === row.requestedById || actor.sub === row.recordedById)
      throw new ForbiddenException(
        'يلزم أن يعتمد التسوية موظف غير مقدم الطلب ومسجل المحضر',
      );
    await this.checkIsolation(tx, stock, row.isolationId, actual, false);
    if (!actual.plus(countedRemaining).eq(stock.quantity))
      throw new ConflictException(
        'مجموع الكمية المتلفة والمتبقي الفعلي لا يطابق رصيد المعاينة',
      );
    const saved = await tx.inventoryRecallDisposal.update({
      where: { id: row.id, hospitalId: actor.hospitalId },
      data: {
        status: actual.isZero() ? 'NO_DISPOSAL' : 'EXECUTED',
        reconciledById: actor.sub,
        reconciledAt: new Date(),
        countedRemaining,
        reconciliationReference: reference,
        reconciliationNote: note,
      },
    });
    await this.audit(tx, actor, saved, 'RECALL_DISPOSAL_RECONCILED');
    return saved;
  }

  private investigationMovements(
    tx: Tx,
    stock: {
      hospitalId: number;
      productId: number;
      warehouseId: number;
      batchNumber: string | null;
    },
  ) {
    return tx.$queryRaw<
      {
        id: number;
        type: string;
        quantity: string;
        referenceType: string | null;
        createdAt: Date;
      }[]
    >`
      SELECT id, type::text, quantity::text, "referenceType", "createdAt" FROM "StockTransaction"
      WHERE "hospitalId" = ${stock.hospitalId} AND "productId" = ${stock.productId}
        AND "warehouseId" = ${stock.warehouseId} AND btrim("batchNumber") = ${stock.batchNumber?.trim() ?? ''}
      ORDER BY id DESC LIMIT 20
    `;
  }

  private investigationAudit(
    tx: Tx,
    actor: Actor,
    row: {
      id: number;
      disposalId: number;
      status: string;
      countedRemaining: Prisma.Decimal;
    },
  ) {
    return appendChainedAuditInTransaction(tx, {
      hospitalId: actor.hospitalId,
      userId: actor.sub,
      action: `RECALL_DISPOSAL_INVESTIGATION_${row.status}`,
      entity: 'InventoryRecallDisposalInvestigation',
      entityId: row.id,
      details: {
        disposalId: row.disposalId,
        countedRemaining: row.countedRemaining.toString(),
      },
    });
  }

  post(actor: Actor, stockId: number, id: number) {
    return this.withStock(actor, stockId, async (tx, stock) => {
      const row = await this.find(tx, actor, stockId, id);
      if (row.status === 'POSTED') return row;
      if (row.status !== 'EXECUTED')
        throw new ConflictException('يلزم توثيق تنفيذ الإتلاف أولاً');
      const quantity = row.performedQuantity;
      if (
        !quantity?.gt(0) ||
        (!quantity.eq(row.quantity) && row.reconciledById === null)
      )
        throw new ConflictException(
          'الكمية الفعلية تختلف عن المعتمدة وتحتاج إلى مطابقة',
        );
      this.assertEligible(stock);
      await this.checkIsolation(tx, stock, row.isolationId, quantity, false);
      const { product } = stock;
      await assertOwnedQuantity(
        tx,
        actor.hospitalId,
        product.id,
        product.stockOnHand,
      );
      const remaining = product.stockOnHand.minus(quantity);
      const before = Money.toDbString(
        Money.multiply(product.costPrice, product.stockOnHand),
      );
      const after = Money.toDbString(
        Money.multiply(product.costPrice, remaining),
      );
      const value = Money.toDbString(Money.subtractDecimal(before, after));
      if (remaining.lt(0) || Money.decimal(before).gte('1000000000000000'))
        throw new BadRequestException('كمية المخزون أو قيمته خارج النطاق');
      const now = new Date();
      const movement = await tx.stockTransaction.create({
        data: {
          hospitalId: actor.hospitalId,
          warehouseId: stock.warehouseId,
          productId: product.id,
          binId: stock.binId,
          type: 'OUT',
          quantity,
          baseQuantity: quantity,
          unitCost: Money.toDbString(product.costPrice),
          totalCost: value,
          batchNumber: stock.batchNumber,
          expiryDate: stock.expiryDate,
          referenceType: 'RECALL_DISPOSAL',
          referenceId: row.id,
          createdById: actor.sub,
        },
      });
      const accountingEntryId = await this.postLoss(
        tx,
        actor,
        row,
        stock,
        value,
        now,
      );
      // Release the reservation inside this transaction while retaining the stock row lock.
      const posted = await this.update(tx, actor, row, {
        status: 'POSTED',
        movementId: movement.id,
        accountingEntryId,
        postedAt: now,
        postedById: actor.sub,
        valuationBefore: before,
        valuationAfter: after,
      });
      const updatedStock = await tx.productStock.updateMany({
        where: { id: stockId, hospitalId: actor.hospitalId },
        data: {
          quantity: { decrement: quantity },
          version: { increment: 1 },
        },
      });
      const updatedProduct = await tx.product.updateMany({
        where: { id: product.id, hospitalId: actor.hospitalId },
        data: { stockOnHand: remaining, version: { increment: 1 } },
      });
      if (updatedStock.count !== 1 || updatedProduct.count !== 1)
        throw new ConflictException('تعذر تحديث رصيد التشغيلة وإجمالي الصنف');
      return posted;
    });
  }

  private withStock<T>(
    actor: Actor,
    stockId: number,
    run: (tx: Tx, stock: DisposalStock) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      const { key } = await recalledBatch(tx, actor.hospitalId, stockId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(27003, ${actor.hospitalId}::integer)`;
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${key.productId} AND "hospitalId" = ${actor.hospitalId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "ProductStock" WHERE "productId" = ${key.productId} AND "hospitalId" = ${actor.hospitalId} ORDER BY id FOR UPDATE`;
      const stock = await tx.productStock.findFirst({
        where: {
          id: stockId,
          hospitalId: actor.hospitalId,
          productId: key.productId,
          warehouse: { hospitalId: actor.hospitalId },
        },
        include: { product: { include: { category: true } } },
      });
      if (!stock || stock.batchNumber?.trim() !== key.batchNumber)
        throw new ConflictException('تغيرت هوية التشغيلة');
      return run(tx, stock);
    });
  }

  private assertEligible({ product, hospitalId }: DisposalStock) {
    inventoryKey(product.type);
    if (
      (product.category &&
        (product.category.hospitalId !== hospitalId ||
          !product.category.isActive ||
          product.category.valuationMethod !== 'WEIGHTED_AVERAGE')) ||
      !product.costPrice.isFinite() ||
      product.costPrice.lt(0)
    )
      throw new BadRequestException(
        'الإتلاف متاح للأصناف الصالحة للتقييم بالمتوسط المرجح',
      );
  }

  private async checkIsolation(
    tx: Tx,
    stock: DisposalStock,
    isolationId: number,
    quantity: Prisma.Decimal,
    latest = true,
  ) {
    const check = await tx.inventoryRecallIsolation.findFirst({
      where: {
        stockId: stock.id,
        hospitalId: stock.hospitalId,
        id: latest ? undefined : isolationId,
      },
      orderBy: { id: 'desc' },
    });
    if (
      check?.id !== isolationId ||
      check.stockVersion !== stock.version ||
      !check.onHand.eq(stock.quantity)
    )
      throw new ConflictException(
        'تغيّرت معاينة العزل أو نسخة الرصيد؛ يلزم التحقق مجددًا',
      );
    if (quantity.gt(check.isolatedQuantity) || quantity.gt(stock.quantity))
      throw new BadRequestException('كمية الإتلاف تتجاوز الرصيد المعزول');
  }

  private async postLoss(
    tx: Tx,
    actor: Actor,
    row: InventoryRecallDisposal,
    stock: DisposalStock,
    value: string,
    at: Date,
  ) {
    if (Money.decimal(value).isZero()) return null;
    const { hospitalId } = actor;
    const { financialYear, period } = await financialPeriod(tx, hospitalId, at);
    const configuredAccount = stock.product.category?.inventoryAccountId;
    const inventory = configuredAccount
      ? await tx.account.findFirst({
          where: { hospitalId, id: configuredAccount, isActive: true },
        })
      : await mappedAccount(tx, hospitalId, inventoryKey(stock.product.type));
    const loss = await mappedAccount(tx, hospitalId, 'INVENTORY_LOSS');
    if (!inventory || inventory.type !== 'ASSET' || loss.type !== 'EXPENSE')
      throw new BadRequestException('حسابات قيد الإتلاف غير صالحة');
    const entry = await tx.accountingEntry.create({
      data: {
        hospitalId,
        financialYearId: financialYear.id,
        financialPeriodId: period.id,
        entryDate: at,
        createdById: actor.sub,
        sourceModule: 'INVENTORY_ADJUSTMENT',
        sourceId: row.id,
        postingKey: `recall-disposal:${hospitalId}:${row.id}`,
        description: `إتلاف تشغيلة مستدعاة #${row.id}`,
        lines: {
          create: [
            { accountId: loss.id, debit: value, credit: '0.000' },
            { accountId: inventory.id, debit: '0.000', credit: value },
          ],
        },
      },
    });
    return entry.id;
  }

  private async find(tx: Tx, actor: Actor, stockId: number, id: number) {
    const row = await tx.inventoryRecallDisposal.findFirst({
      where: { id, stockId, hospitalId: actor.hospitalId },
    });
    if (!row) throw new NotFoundException('طلب الإتلاف غير موجود');
    return row;
  }

  private async update(
    tx: Tx,
    actor: Actor,
    row: InventoryRecallDisposal,
    data: Prisma.InventoryRecallDisposalUncheckedUpdateInput,
  ) {
    const saved = await tx.inventoryRecallDisposal.update({
      where: { id: row.id, hospitalId: actor.hospitalId },
      data,
    });
    await this.audit(tx, actor, saved);
    return saved;
  }

  private audit(
    tx: Tx,
    actor: Actor,
    row: InventoryRecallDisposal,
    action = `RECALL_DISPOSAL_${row.status}`,
  ) {
    return appendChainedAuditInTransaction(tx, {
      hospitalId: actor.hospitalId,
      userId: actor.sub,
      action,
      entity: 'InventoryRecallDisposal',
      entityId: row.id,
      details: {
        stockId: row.stockId,
        isolationId: row.isolationId,
        quantity: row.quantity.toString(),
        performedQuantity: row.performedQuantity?.toString() ?? null,
        countedRemaining: row.countedRemaining?.toString() ?? null,
        reconciledById: row.reconciledById,
        movementId: row.movementId,
        accountingEntryId: row.accountingEntryId,
        valuationBefore: row.valuationBefore?.toString() ?? null,
        valuationAfter: row.valuationAfter?.toString() ?? null,
      },
    });
  }
}

type DisposalStock = Prisma.ProductStockGetPayload<{
  include: { product: { include: { category: true } } };
}>;

function sameMovementIds(expected: number[], actual: number[]) {
  return (
    expected.length === actual.length &&
    expected.every((id, index) => id === actual[index])
  );
}
