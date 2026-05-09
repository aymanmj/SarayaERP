// ============================================
// OutboundConsumer — Processes Queued Outbound Operations
// ============================================
// يعالج العمليات الخارجية المخزّنة في الطابور
// يتحقق من الاتصال قبل التنفيذ — إذا مقطوع يؤجل العملية

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { ConnectivityService } from '../common/services/connectivity.service';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import type { OutboundJobData } from './outbound-queue.service';
import { NphiesClaimService } from './nphies/nphies-claim.service';

@Processor('outbound-queue')
@Injectable()
export class OutboundConsumer extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(OutboundConsumer.name);
  private expo: Expo;
  private nphiesClaimService?: NphiesClaimService;

  constructor(
    private connectivityService: ConnectivityService,
    private prisma: PrismaService,
    private moduleRef: ModuleRef,
  ) {
    super();
    this.expo = new Expo();
  }

  async onModuleInit() {
    if (!this.connectivityService.isOnline()) {
      this.logger.warn('⏸️ Worker initialized offline. Pausing processing.');
      // قد يستغرق Worker بضعة أجزاء من الثانية للبدء، نعطيه وقتًا صغيرًا
      setTimeout(async () => {
        if (this.worker && !this.connectivityService.isOnline()) {
          await this.worker.pause();
        }
      }, 1000);
    }
  }

  @OnEvent('connectivity.offline')
  async handleOffline() {
    this.logger.warn('⏸️ Pausing outbound worker due to internet loss (prevent retry exhaustion)');
    if (this.worker) {
      await this.worker.pause();
    }
  }

  @OnEvent('connectivity.online')
  async handleOnline() {
    this.logger.log('▶️ Resuming outbound worker (Internet restored)');
    if (this.worker) {
      await this.worker.resume();
    }
  }

  async process(job: Job<OutboundJobData>): Promise<any> {
    const { type, payload } = job.data;

    if (!this.connectivityService.isOnline()) {
      this.logger.warn(
        `Cannot process ${type} (job ${job.id}) because internet is offline. Will retry later.`,
      );
      throw new Error('OFFLINE: Internet connectivity unavailable — will retry');
    }

    this.logger.log(`Processing outbound: ${type} (job ${job.id})`);

    try {
      let result: any;

      switch (type) {
        case 'push-notification':
          result = await this.handlePushNotification(payload);
          break;

        case 'nphies-claim':
        case 'nphies-preauth':
          result = await this.handleNphiesOperation(type, payload);
          break;

        case 'external-api':
          result = await this.handleExternalApi(payload);
          break;

        default:
          this.logger.warn(`Unknown outbound job type: ${type}`);
          result = { status: 'skipped', reason: 'unknown type' };
      }

      await this.markOutboxProcessed(job);
      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to process ${type} (job ${job.id}): ${error.message}`,
      );
      await this.recordOutboxFailure(job, error);
      throw error;
    }
  }

  private async markOutboxProcessed(job: Job<OutboundJobData>) {
    const outboxEventId = job.data.sourceOutboxEventId;
    if (!outboxEventId) return;

    await this.prisma.outboxEvent.update({
      where: { id: outboxEventId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        error: null,
      },
    });
  }

  private async recordOutboxFailure(job: Job<OutboundJobData>, error: Error) {
    const outboxEventId = job.data.sourceOutboxEventId;
    if (!outboxEventId) return;

    const attemptsMade = job.attemptsMade + 1;
    const maxAttempts =
      typeof job.opts.attempts === 'number' && job.opts.attempts > 0
        ? job.opts.attempts
        : 1;

    await this.prisma.outboxEvent.update({
      where: { id: outboxEventId },
      data: {
        attempts: { increment: 1 },
        error: error.message,
        status: attemptsMade >= maxAttempts ? 'FAILED' : 'QUEUED',
      },
    });
  }

  // ============================================
  // Push Notification Handler
  // ============================================
  private async handlePushNotification(payload: Record<string, any>) {
    const { userId, title, body, data } = payload;

    const devices = await this.prisma.userDevice.findMany({
      where: { userId },
    });

    if (devices.length === 0) {
      return { status: 'skipped', reason: 'no devices registered' };
    }

    const messages: ExpoPushMessage[] = [];
    for (const device of devices) {
      if (!Expo.isExpoPushToken(device.token)) continue;
      messages.push({
        to: device.token,
        sound: 'default',
        title,
        body,
        data,
      });
    }

    if (messages.length === 0) {
      return { status: 'skipped', reason: 'no valid tokens' };
    }

    const chunks = this.expo.chunkPushNotifications(messages);
    let sentCount = 0;

    for (const chunk of chunks) {
      const tickets = await this.expo.sendPushNotificationsAsync(chunk);
      sentCount += tickets.length;
    }

    this.logger.log(`✅ Push sent to ${sentCount} device(s) for user #${userId}`);
    return { status: 'sent', devicesReached: sentCount };
  }

  // ============================================
  // NPHIES Handler (Placeholder — يُربط بـ NphiesService لاحقاً)
  // ============================================
  private async handleNphiesOperation(
    type: string,
    payload: Record<string, any>,
  ) {
    if (!this.nphiesClaimService) {
      this.nphiesClaimService = this.moduleRef.get(NphiesClaimService, { strict: false });
    }

    if (type === 'nphies-claim' && payload.claimId) {
      this.logger.log(`📋 NPHIES: Processing queued claim #${payload.claimId}`);
      const result = await this.nphiesClaimService.processQueuedClaim(payload.claimId);
      
      return {
        status: 'processed',
        type,
        result,
      };
    }
    
    this.logger.warn(`📋 NPHIES ${type}: Unhandled operation or missing claimId. payload: ${JSON.stringify(payload)}`);
    return {
      status: 'skipped',
      type,
      note: 'Unhandled NPHIES operation type or missing claimId',
    };
  }

  // ============================================
  // External API Handler
  // ============================================
  private async handleExternalApi(payload: Record<string, any>) {
    const { url, method, body, headers } = payload;

    const response = await fetch(url, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`External API failed: ${response.status} ${response.statusText}`);
    }

    return {
      status: 'sent',
      httpStatus: response.status,
    };
  }
}
