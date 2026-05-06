// ============================================
// OutboundConsumer — Processes Queued Outbound Operations
// ============================================
// يعالج العمليات الخارجية المخزّنة في الطابور
// يتحقق من الاتصال قبل التنفيذ — إذا مقطوع يؤجل العملية

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConnectivityService } from '../common/services/connectivity.service';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import type { OutboundJobData } from './outbound-queue.service';

@Processor('outbound-queue')
@Injectable()
export class OutboundConsumer extends WorkerHost {
  private readonly logger = new Logger(OutboundConsumer.name);
  private expo: Expo;

  constructor(
    private connectivityService: ConnectivityService,
    private prisma: PrismaService,
  ) {
    super();
    this.expo = new Expo();
  }

  async process(job: Job<OutboundJobData>): Promise<any> {
    const { type, payload } = job.data;

    // ⚡ تحقق من الاتصال قبل التنفيذ
    if (!this.connectivityService.isOnline()) {
      this.logger.warn(
        `🔴 Cannot process ${type} (job ${job.id}) — Internet is offline. Will retry later.`,
      );
      // إعادة المحاولة بعد 60 ثانية
      throw new Error('OFFLINE: Internet connectivity unavailable — will retry');
    }

    this.logger.log(`📤 Processing outbound: ${type} (job ${job.id})`);

    try {
      switch (type) {
        case 'push-notification':
          return await this.handlePushNotification(payload);

        case 'nphies-claim':
        case 'nphies-preauth':
          return await this.handleNphiesOperation(type, payload);

        case 'external-api':
          return await this.handleExternalApi(payload);

        default:
          this.logger.warn(`⚠️ Unknown outbound job type: ${type}`);
          return { status: 'skipped', reason: 'unknown type' };
      }
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to process ${type} (job ${job.id}): ${error.message}`,
      );
      throw error; // BullMQ سيعيد المحاولة تلقائياً
    }
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
    // TODO: ربط مع NphiesService.submitClaim / submitPreauth
    this.logger.log(`📋 NPHIES ${type}: Would process claim for hospital #${payload.hospitalId}`);
    
    return {
      status: 'processed',
      type,
      note: 'NPHIES integration pending full implementation',
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
