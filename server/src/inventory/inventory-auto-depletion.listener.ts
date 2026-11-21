import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { enqueueConsumptionIntent } from './consumption-intent';
import { ConsumptionFailure } from './consumption-failure';
type Completion = {
  hospitalId: number;
  serviceItemId: number;
  performerId: number;
  referenceType: string;
  referenceId: number;
};
@Injectable()
export class InventoryAutoDepletionListener {
  private readonly logger = new Logger(InventoryAutoDepletionListener.name);
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
  ) {}
  @OnEvent('service.completed')
  async handleServiceCompletedEvent(payload: Completion) {
    const key = {
      hospitalId: payload.hospitalId,
      serviceItemId: payload.serviceItemId,
      referenceType: payload.referenceType,
      referenceId: payload.referenceId,
    };
    const operation = await this.prisma.$transaction((tx) =>
      enqueueConsumptionIntent(tx, { ...key, userId: payload.performerId }),
    );
    if (operation.userId !== payload.performerId)
      throw new Error('Consumption actor mismatch');
    if (operation.status === 'COMPLETED') return;
    await this.process(operation.id);
  }
  private async process(id: number) {
    const operation =
      await this.prisma.serviceMaterialConsumption.findUniqueOrThrow({
        where: { id },
      });
    if (operation.status === 'COMPLETED') return;
    try {
      let warehouseId = operation.warehouseId;
      if (warehouseId === null) {
        const policy = await this.prisma.consumptionWarehousePolicy.findUnique({
          where: { hospitalId: operation.hospitalId },
        });
        if (!policy) throw new ConsumptionFailure('SOURCE_NOT_CONFIGURED');
        await this.prisma.serviceMaterialConsumption.updateMany({
          where: { id, warehouseId: null },
          data: { warehouseId: policy.warehouseId },
        });
        warehouseId = (
          await this.prisma.serviceMaterialConsumption.findUniqueOrThrow({
            where: { id },
          })
        ).warehouseId;
      }
      if (warehouseId === null) throw new Error('Warehouse unresolved');
      await this.inventoryService.autoDepleteServiceMaterials(
        operation.hospitalId,
        operation.serviceItemId,
        warehouseId,
        operation.multiplier.toNumber(),
        operation.userId,
        operation.referenceId,
        operation.referenceType,
      );
    } catch (error: unknown) {
      await this.prisma.serviceMaterialConsumption.updateMany({
        where: { id, status: { not: 'COMPLETED' } },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          error:
            error instanceof ConsumptionFailure
              ? error.code
              : 'SERVICE_MATERIAL_CONSUMPTION_FAILED',
          nextRetryAt: new Date(
            Date.now() +
              Math.min(3600, 60 * 2 ** Math.min(operation.attempts, 6)) * 1000,
          ),
        },
      });
      this.logger.error(
        `Material consumption #${id} failed; retained for retry`,
      );
    }
  }
  @Cron('0 * * * * *', { disabled: process.env.NODE_ENV === 'test' })
  async retryPending() {
    const rows = await this.prisma.serviceMaterialConsumption.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        attempts: { lt: 10 },
        nextRetryAt: { lte: new Date() },
      },
      orderBy: { id: 'asc' },
      take: 20,
    });
    for (const row of rows) await this.process(row.id);
  }
}
