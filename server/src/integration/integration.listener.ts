import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IntegrationService } from './integration.service'; // Ensure correct path
import { LabOrderCreatedEvent } from '../labs/events/lab-order-created.event';
import { RadiologyOrderCreatedEvent } from '../radiology/events/radiology-order-created.event';
import { LabOrderStartedEvent } from '../labs/events/lab-order-started.event';
import { RadiologyOrderStartedEvent } from '../radiology/events/radiology-order-started.event';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IntegrationListener {
  private readonly logger = new Logger(IntegrationListener.name);

  constructor(
    private readonly integrationService: IntegrationService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('lab.order_created')
  async handleLabOrderCreated(event: LabOrderCreatedEvent) {
    this.logger.log(`📢 Event Listener Caught: lab.order_created (Order #${event.orderId})`);
  }

  // ✅ [NEW] Trigger HL7 when Tech clicks "Start"
  @OnEvent('lab.order_started')
  async handleLabOrderStarted(event: LabOrderStartedEvent) {
    this.logger.log(`🚀 Starting Lab Order Processing: LabOrder #${event.labOrderId}`);
    try {
      // 1. Resolve Parent Order ID from LabOrder ID
      const labOrder = await this.prisma.labOrder.findUnique({
        where: { id: event.labOrderId },
        select: { orderId: true },
      });

      if (!labOrder) {
        this.logger.error(`❌ LabOrder #${event.labOrderId} not found.`);
        return;
      }

      await this.integrationService.sendOrderToDevice(labOrder.orderId, event.hospitalId); 
    } catch (err) {
      this.logger.error('❌ Failed to trigger lab device send', err);
    }
  }

  @OnEvent('radiology.order_created')
  async handleRadiologyOrder(event: RadiologyOrderCreatedEvent) {
    this.logger.log(`📢 Event Listener Caught: radiology.order_created (Order #${event.orderId})`);
  }

  @OnEvent('radiology.order_started')
  async handleRadiologyOrderStarted(event: RadiologyOrderStartedEvent) {
    this.logger.log(`🚀 Starting Radiology Order: RadiologyOrder #${event.radiologyOrderId}`);
    try {
      // 1. Resolve Parent Order ID from RadiologyOrder ID
      const radOrder = await this.prisma.radiologyOrder.findUnique({
        where: { id: event.radiologyOrderId },
        select: { orderId: true },
      });

      if (!radOrder) {
        this.logger.error(`❌ RadiologyOrder #${event.radiologyOrderId} not found.`);
        return;
      }

      await this.integrationService.sendRadiologyOrder(
        radOrder.orderId,
        event.hospitalId,
      );
    } catch (err) {
      this.logger.error('❌ Failed to send radiology order', err);
    }
  }
}
