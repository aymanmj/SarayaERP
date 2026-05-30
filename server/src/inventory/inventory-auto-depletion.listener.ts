import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryAutoDepletionListener {
  private readonly logger = new Logger(InventoryAutoDepletionListener.name);

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('service.completed')
  async handleServiceCompletedEvent(payload: {
    hospitalId: number;
    serviceItemId: number;
    performerId: number;
    referenceType: string;
    referenceId: number;
  }) {
    try {
      this.logger.log(
        `Received service.completed event for service ${payload.serviceItemId}. Triggering auto-depletion.`,
      );

      // Find the main warehouse for the hospital.
      // Usually, there might be a specific warehouse linked to the user/department.
      // For now, we will pick the first available warehouse in the hospital.
      const defaultWarehouse = await this.prisma.warehouse.findFirst({
        where: { hospitalId: payload.hospitalId, isActive: true },
        orderBy: { id: 'asc' },
      });

      if (!defaultWarehouse) {
        this.logger.warn(
          `No active warehouse found for hospital ${payload.hospitalId}. Skipping auto-depletion.`,
        );
        return;
      }

      await this.inventoryService.autoDepleteServiceMaterials(
        payload.hospitalId,
        payload.serviceItemId,
        defaultWarehouse.id,
        1,
        payload.performerId,
        payload.referenceId,
        payload.referenceType,
      );

      this.logger.log(
        `Successfully auto-depleted materials for service ${payload.serviceItemId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to auto-deplete materials for service ${payload.serviceItemId}: ${error.message}`,
      );
    }
  }
}
