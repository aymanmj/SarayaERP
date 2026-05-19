import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  OutboundQueueService,
  OutboundJobType,
} from './outbound-queue.service';

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private isProcessing = false;

  constructor(
    private prisma: PrismaService,
    private outboundQueueService: OutboundQueueService,
  ) {}

  /**
   * Relay Outbox Events to BullMQ
   * Runs every 5 seconds to ensure fast processing.
   */
  @Cron('*/5 * * * * *')
  async processOutbox() {
    if (this.isProcessing) return; // Prevent overlapping runs
    this.isProcessing = true;

    try {
      // Find up to 50 pending events
      const pendingEvents = await this.prisma.outboxEvent.findMany({
        where: { status: { in: ['PENDING', 'QUEUED'] } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      if (pendingEvents.length === 0) {
        this.isProcessing = false;
        return;
      }

      this.logger.log(
        `🔄 Outbox Relay: Processing ${pendingEvents.length} pending outbound events...`,
      );

      for (const event of pendingEvents) {
        try {
          // Forward to BullMQ with a stable job id so repeated relay runs do not
          // create duplicate external submissions.
          await this.outboundQueueService.enqueue({
            type: event.type as OutboundJobType,
            payload: event.payload as Record<string, any>,
            hospitalId: event.hospitalId ?? undefined,
            createdAt: event.createdAt.toISOString(),
            sourceOutboxEventId: event.id,
            jobId: `outbox-event-${event.id}`,
          });

          // The event is only queued here. OutboundConsumer marks it PROCESSED
          // after the external operation succeeds.
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'QUEUED',
              error: null,
            },
          });
        } catch (error: any) {
          this.logger.error(
            `❌ Outbox Relay failed for event #${event.id}: ${error.message}`,
          );

          // Mark as FAILED or increment attempts
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              attempts: { increment: 1 },
              error: error.message,
              status: event.attempts >= 4 ? 'FAILED' : 'PENDING', // Fail after 5 attempts
            },
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Critical error in OutboxRelay: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Optional Cleanup: Run daily at 3 AM to delete old processed outbox events
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldOutboxEvents() {
    this.logger.log(
      '🧹 Cleaning up processed Outbox events older than 30 days...',
    );
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.outboxEvent.deleteMany({
      where: {
        status: 'PROCESSED',
        processedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    this.logger.log(`🧹 Deleted ${result.count} old Outbox events.`);
  }
}
