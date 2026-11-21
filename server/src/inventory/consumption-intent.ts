import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { captureConsumptionMaterials } from './consumption-snapshot';

export async function enqueueConsumptionIntent(
  tx: Prisma.TransactionClient,
  data: {
    hospitalId: number;
    serviceItemId: number;
    referenceType: string;
    referenceId: number;
    userId: number;
  },
) {
  if (
    !(await tx.serviceItem.findFirst({
      where: { id: data.serviceItemId, hospitalId: data.hospitalId },
    }))
  )
    throw new BadRequestException('خدمة الاستهلاك خارج المنشأة');
  const { userId, ...identity } = data;
  const existing = await tx.serviceMaterialConsumption.findUnique({
    where: { hospitalId_serviceItemId_referenceType_referenceId: identity },
  });
  if (existing) return existing;
  const materialsSnapshot = await captureConsumptionMaterials(
    tx,
    data.hospitalId,
    data.serviceItemId,
  );
  const policy = await tx.consumptionWarehousePolicy.findUnique({
    where: { hospitalId: data.hospitalId },
  });
  return tx.serviceMaterialConsumption.upsert({
    where: { hospitalId_serviceItemId_referenceType_referenceId: identity },
    update: {},
    create: {
      ...identity,
      userId,
      multiplier: 1,
      materialsSnapshot,
      snapshotVersion: 1,
      warehouseId: policy?.warehouseId ?? null,
      status: materialsSnapshot.length ? 'PENDING' : 'COMPLETED',
      completedAt: materialsSnapshot.length ? null : new Date(),
    },
  });
}
