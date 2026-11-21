import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Money } from '../common/utils/money.util';

export type RoomRateSnapshot = {
  version: 1;
  serviceItemId: number | null;
  serviceName: string | null;
  dailyRate: string | null;
  priceListId: number | null;
  insurancePolicyId: number | null;
  capturedAt: string;
};

export function parseRoomRateSnapshot(
  value: Prisma.JsonValue,
): RoomRateSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('تعرفة الإقامة التاريخية غير موثقة');
  const snapshot = value as unknown as RoomRateSnapshot;
  if (
    snapshot.version !== 1 ||
    !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
    (snapshot.serviceItemId !== null &&
      (!Number.isInteger(snapshot.serviceItemId) ||
        snapshot.serviceItemId <= 0)) ||
    (snapshot.serviceItemId !== null &&
      (typeof snapshot.dailyRate !== 'string' ||
        !/^\d+\.\d{3}$/.test(snapshot.dailyRate))) ||
    (snapshot.serviceItemId === null && snapshot.dailyRate !== null)
  )
    throw new BadRequestException(
      'تعرفة الإقامة المحفوظة غير صالحة؛ تجب مراجعتها',
    );
  if (
    snapshot.dailyRate !== null &&
    Money.decimal(snapshot.dailyRate).isNegative()
  )
    throw new BadRequestException('تعرفة الإقامة سالبة');
  return snapshot;
}

/** Capture actual cash/contract pricing in the same transaction as bed allocation. */
export async function captureRoomRate(
  tx: Prisma.TransactionClient,
  hospitalId: number,
  encounterId: number,
  serviceItemId: number | null,
  at: Date,
): Promise<RoomRateSnapshot> {
  const encounter = await tx.encounter.findFirstOrThrow({
    where: { id: encounterId, hospitalId },
    include: {
      patient: {
        include: {
          insurancePolicy: { include: { provider: true, priceList: true } },
        },
      },
    },
  });
  const candidate = encounter.patient.insurancePolicy;
  if (candidate && candidate.provider.hospitalId !== hospitalId)
    throw new BadRequestException('بوليصة المريض لا تنتمي إلى هذه المنشأة');
  const policy =
    candidate?.isActive &&
    (!candidate.startDate || candidate.startDate <= at) &&
    (!candidate.endDate || candidate.endDate >= at)
      ? candidate
      : null;
  const snapshot: RoomRateSnapshot = {
    version: 1,
    serviceItemId,
    serviceName: null,
    dailyRate: null,
    priceListId: null,
    insurancePolicyId: policy?.id ?? null,
    capturedAt: at.toISOString(),
  };
  if (serviceItemId === null) return snapshot;
  const service = await tx.serviceItem.findFirst({
    where: {
      id: serviceItemId,
      hospitalId,
      isActive: true,
      isDeleted: false,
      isBillable: true,
      type: 'BED',
    },
  });
  if (!service)
    throw new BadRequestException(
      'خدمة الإقامة غير صالحة أو غير مهيأة لهذه المنشأة',
    );
  const list = policy?.priceListId
    ? await tx.priceList.findFirst({
        where: { id: policy.priceListId, hospitalId, isActive: true },
      })
    : !policy
      ? await tx.priceList.findFirst({
          where: { hospitalId, isDefault: true, isActive: true },
          orderBy: { id: 'asc' },
        })
      : null;
  if (policy?.priceListId && !list)
    throw new BadRequestException('قائمة أسعار التأمين غير صالحة لهذه المنشأة');
  const custom = list
    ? await tx.priceListItem.findUnique({
        where: {
          priceListId_serviceItemId: { priceListId: list.id, serviceItemId },
        },
      })
    : null;
  const rate = Money.decimal(custom?.price ?? service.defaultPrice);
  if (rate.isNegative())
    throw new BadRequestException('تعرفة الإقامة لا يمكن أن تكون سالبة');
  return {
    ...snapshot,
    serviceName: service.name,
    dailyRate: Money.toDbString(rate),
    priceListId: custom ? list!.id : null,
  };
}
