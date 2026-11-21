import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Money } from '../common/utils/money.util';
import { roomBillableDays } from './room-billing-policy';
import { allocateRoomDays } from './room-allocation';
import { parseRoomRateSnapshot } from './room-rate-snapshot';

export type RoomChargePlan = {
  charges: Prisma.EncounterChargeUncheckedCreateInput[];
  pendingDays: number;
  reviewReason: string | null;
};

export async function pendingRoomCharges(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  encounterId: number,
  at: Date,
): Promise<RoomChargePlan> {
  try {
    return await buildRoomChargePlan(tx, hospitalId, encounterId, at);
  } catch (error) {
    if (error instanceof BadRequestException)
      return { charges: [], pendingDays: 0, reviewReason: error.message };
    throw error;
  }
}

async function buildRoomChargePlan(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  encounterId: number,
  at: Date,
): Promise<RoomChargePlan> {
  const empty: RoomChargePlan = {
    charges: [],
    pendingDays: 0,
    reviewReason: null,
  };
  const admission = await tx.admission.findFirst({
    where: {
      hospitalId,
      encounterId,
      admissionStatus: { in: ['ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING'] },
    },
  });
  if (!admission) return empty;
  const stays = await tx.bedAssignment.findMany({
    where: { hospitalId, encounterId },
    orderBy: [{ from: 'asc' }, { id: 'asc' }],
  });
  if (!stays.some((stay) => stay.roomRateSnapshot !== null)) {
    const legacy = await legacyRoomCharge(tx, hospitalId, encounterId, at);
    return legacy
      ? {
          charges: [legacy],
          pendingDays: legacy.quantity ?? 1,
          reviewReason: null,
        }
      : empty;
  }
  const charged = await tx.encounterCharge.findMany({
    where: { hospitalId, encounterId, sourceType: 'BED' },
  });
  if (
    stays.some((stay) => stay.roomRateSnapshot === null) ||
    charged.some((charge) => !charge.roomBillingKey)
  ) {
    throw new BadRequestException(
      'الإقامة تجمع سجلات قديمة بلا تعرفة موثقة وبنودًا جديدة. يلزم اعتماد تسوية تاريخية قبل الفوترة الآلية',
    );
  }
  const allocations = allocateRoomDays(
    admission.actualAdmissionDate,
    at,
    admission.roomBillingPolicy,
    admission.roomBillingTimeZone,
    stays.map((stay) => ({
      ...stay,
      rate: parseRoomRateSnapshot(stay.roomRateSnapshot),
    })),
  );
  const encounter = await tx.encounter.findFirstOrThrow({
    where: { id: encounterId, hospitalId },
    include: { patient: { include: { insurancePolicy: true } } },
  });
  const candidate = encounter.patient.insurancePolicy;
  const policyId =
    candidate?.isActive &&
    (!candidate.startDate || candidate.startDate <= at) &&
    (!candidate.endDate || candidate.endDate >= at)
      ? candidate.id
      : null;
  const desired = new Map(
    allocations.map((allocation) => [
      `room:v1:${hospitalId}:${encounterId}:${allocation.periodIndex}:${allocation.assignmentId}`,
      allocation,
    ]),
  );
  const adjustments = await tx.invoiceAdjustment.findMany({
    where: {
      hospitalId,
      chargeId: { in: charged.map((charge) => charge.id) },
      status: 'POSTED',
    },
    select: { chargeId: true, delta: true, snapshot: true },
    orderBy: { id: 'asc' },
  });
  for (const charge of charged) {
    const effectiveAmount = Money.sumDecimal(
      charge.totalAmount,
      ...adjustments
        .filter((item) => item.chargeId === charge.id)
        .map((item) => item.delta),
    );
    const lastCorrection = adjustments
      .filter((item) => item.chargeId === charge.id)
      .at(-1);
    const offset = lastCorrection
      ? ((lastCorrection.snapshot as { calculationOffset?: string })
          .calculationOffset ?? '0')
      : '0';
    const allocation = desired.get(charge.roomBillingKey!);
    if (
      !allocation ||
      charge.serviceItemId !== allocation.serviceItemId ||
      charge.quantity !== 1 ||
      !Money.eq(effectiveAmount, Money.sumDecimal(allocation.amount, offset))
    ) {
      throw new BadRequestException(
        'تغير توزيع يوم سبق تسجيل رسومه، أو فُوتر يوم غير مكتمل ثم تغير الإشغال. يلزم إجراء تسوية معتمدة دون تعديل الفاتورة السابقة',
      );
    }
  }
  const saved = new Set(charged.map((charge) => charge.roomBillingKey));
  const charges: Prisma.EncounterChargeUncheckedCreateInput[] = [];
  const pending = new Set<number>();
  for (const [key, allocation] of desired) {
    if (allocation.insurancePolicyId !== policyId)
      throw new BadRequestException(
        'تغير سياق التأمين منذ تثبيت تعرفة الإقامة؛ يلزم اعتماد التسوية قبل الفوترة',
      );
    if (saved.has(key) || Money.isZero(allocation.amount)) continue;
    charges.push({
      hospitalId,
      encounterId,
      sourceType: 'BED',
      sourceId: admission.id,
      serviceItemId: allocation.serviceItemId,
      quantity: 1,
      unitPrice: allocation.amount,
      totalAmount: allocation.amount,
      roomBillingKey: key,
      roomAllocation: allocation,
      createdAt: at,
    });
    pending.add(allocation.periodIndex);
  }
  return { charges, pendingDays: pending.size, reviewReason: null };
}

/** Caller must lock the patient and encounter before persisting this preview. */
async function legacyRoomCharge(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  encounterId: number,
  at: Date,
): Promise<Prisma.EncounterChargeUncheckedCreateInput | null> {
  const admission = await tx.admission.findFirst({
    where: {
      hospitalId,
      encounterId,
      admissionStatus: { in: ['ADMITTED', 'IN_PROGRESS', 'DISCHARGE_PENDING'] },
    },
    include: { bed: { include: { ward: true } } },
  });
  if (!admission?.bed?.ward?.serviceItemId) return null;
  const days = roomBillableDays(
    admission.actualAdmissionDate,
    at,
    admission.roomBillingPolicy,
    admission.roomBillingTimeZone,
  );
  const service = await tx.serviceItem.findFirst({
    where: { id: admission.bed.ward.serviceItemId, hospitalId, isActive: true },
  });
  if (!service)
    throw new BadRequestException('خدمة الإقامة غير مهيأة لهذه المنشأة');
  const charged = await tx.encounterCharge.aggregate({
    where: {
      hospitalId,
      encounterId,
      sourceType: 'BED',
    },
    _sum: { quantity: true },
  });
  const quantity = days - (charged._sum.quantity || 0);
  if (quantity <= 0) return null;
  const assignments = await tx.bedAssignment.findMany({
    where: { hospitalId, encounterId },
    select: { bed: { select: { ward: { select: { serviceItemId: true } } } } },
  });
  const services = new Set(
    assignments
      .map((assignment) => assignment.bed.ward.serviceItemId)
      .filter((id) => id !== null),
  );
  services.add(service.id);
  if (services.size > 1) {
    throw new BadRequestException(
      'تغيرت خدمة الإقامة أثناء التنويم. يجب مراجعة توزيع الأيام وتسعيرتها بين الأقسام قبل الفوترة',
    );
  }
  return {
    hospitalId,
    encounterId,
    serviceItemId: service.id,
    sourceType: 'BED',
    sourceId: admission.id,
    quantity,
    unitPrice: service.defaultPrice,
    totalAmount: Money.toDbString(
      Money.multiply(service.defaultPrice, quantity),
    ),
    createdAt: at,
  };
}
