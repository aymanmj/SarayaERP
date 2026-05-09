// ============================================
// OutboundQueueService — Offline-First Outbound Queue
// ============================================
// يجمع كل العمليات التي تتطلب إنترنت في طابور واحد.
// عند انقطاع الإنترنت: العمليات تُخزّن في Redis عبر BullMQ
// عند عودة الإنترنت: العمليات تُنفّذ تلقائياً بالترتيب
//
// العمليات المدعومة:
// - Push Notifications (Expo)
// - NPHIES Claims
// - External API calls
// - Email/SMS (مستقبلاً)

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { ConnectivityService } from '../common/services/connectivity.service';

export type OutboundJobType = 
  | 'push-notification'
  | 'nphies-claim'
  | 'nphies-preauth'
  | 'external-api'
  | 'email'
  | 'sms';

export interface OutboundJobData {
  type: OutboundJobType;
  payload: Record<string, any>;
  /** معرّف المستشفى */
  hospitalId?: number;
  /** عدد المحاولات المتبقية */
  maxRetries?: number;
  /** وقت إنشاء الطلب الأصلي */
  createdAt: string;
  sourceOutboxEventId?: number;
  jobId?: string;
}

@Injectable()
export class OutboundQueueService implements OnModuleInit {
  private readonly logger = new Logger(OutboundQueueService.name);

  constructor(
    @InjectQueue('outbound-queue') private outboundQueue: Queue,
    private connectivityService: ConnectivityService,
  ) {}

  async onModuleInit() {
    // عرض حالة الطابور عند البدء
    const waiting = await this.outboundQueue.getWaitingCount();
    const delayed = await this.outboundQueue.getDelayedCount();
    const failed = await this.outboundQueue.getFailedCount();

    if (waiting + delayed + failed > 0) {
      this.logger.warn(
        `📦 Outbound Queue has pending items: ${waiting} waiting, ${delayed} delayed, ${failed} failed`,
      );
    } else {
      this.logger.log('📦 Outbound Queue is empty — ready for offline operations');
    }
  }

  // ============================================
  // إضافة عملية للطابور
  // ============================================

  /**
   * إضافة عملية خارجية للطابور
   * إذا الإنترنت متاح: تُنفّذ فوراً
   * إذا مقطوع: تُخزّن وتُنفّذ لاحقاً
   */
  async enqueue(data: OutboundJobData): Promise<string> {
    const jobId =
      data.jobId ??
      (data.sourceOutboxEventId
        ? `outbox-event-${data.sourceOutboxEventId}`
        : `${data.type}-${Date.now()}-${Math.random().toString(36).substring(7)}`);

    const isOnline = this.connectivityService.isOnline();

    await this.outboundQueue.add(data.type, data, {
      jobId,
      attempts: data.maxRetries ?? 5,
      backoff: {
        type: 'exponential',
        delay: isOnline ? 1000 : 60_000, // فوري إذا متصل, 60 ثانية إذا مقطوع
      },
      removeOnComplete: {
        age: 86400, // احتفظ بالنتائج 24 ساعة
        count: 500,
      },
      removeOnFail: {
        age: 604800, // احتفظ بالفشل 7 أيام
      },
    });

    if (!isOnline) {
      this.logger.warn(
        `📦 QUEUED (offline): ${data.type} — will process when internet returns`,
      );
    } else {
      this.logger.debug(`📤 QUEUED (online): ${data.type}`);
    }

    return jobId;
  }

  /**
   * إضافة عملية خارجية لصندوق الصادر (Outbox) كجزء من عملية قاعدة بيانات واحدة (Transaction).
   * هذا النمط يضمن 100% أن الطلب لن يضيع إذا تعطل النظام قبل وصوله لـ Redis.
   */
  async enqueueTransactional(
    tx: Prisma.TransactionClient,
    data: OutboundJobData,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        type: data.type,
        payload: data.payload as any,
        hospitalId: data.hospitalId,
        status: 'PENDING',
      },
    });
    
    this.logger.debug(`📤 OUTBOX (Transactional): ${data.type} saved to DB Outbox`);
  }

  // ============================================
  // Convenience Methods
  // ============================================

  /** إضافة Push Notification للطابور */
  async queuePushNotification(
    userId: number,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<string> {
    return this.enqueue({
      type: 'push-notification',
      payload: { userId, title, body, data },
      createdAt: new Date().toISOString(),
    });
  }

  /** إضافة مطالبة NPHIES للطابور */
  async queueNphiesClaim(
    hospitalId: number,
    claimData: Record<string, any>,
  ): Promise<string> {
    return this.enqueue({
      type: 'nphies-claim',
      hospitalId,
      payload: claimData,
      maxRetries: 3,
      createdAt: new Date().toISOString(),
    });
  }

  /** إضافة طلب موافقة مسبقة NPHIES */
  async queueNphiesPreauth(
    hospitalId: number,
    preauthData: Record<string, any>,
  ): Promise<string> {
    return this.enqueue({
      type: 'nphies-preauth',
      hospitalId,
      payload: preauthData,
      maxRetries: 3,
      createdAt: new Date().toISOString(),
    });
  }

  // ============================================
  // حالة الطابور (للـ Dashboard)
  // ============================================

  async getQueueStatus() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.outboundQueue.getWaitingCount(),
      this.outboundQueue.getActiveCount(),
      this.outboundQueue.getCompletedCount(),
      this.outboundQueue.getFailedCount(),
      this.outboundQueue.getDelayedCount(),
    ]);

    return {
      internetStatus: this.connectivityService.isOnline() ? 'online' : 'offline',
      queue: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + delayed,
      },
      connectivity: this.connectivityService.getState(),
    };
  }

  // ============================================
  // استجابة لأحداث الاتصال
  // ============================================

  /**
   * عند عودة الإنترنت — نقوم بتنشيط العمليات المؤجلة
   */
  @OnEvent('connectivity.online')
  async handleConnectivityRestored(payload: { restoredAt: Date; wasOfflineFor: number }) {
    const delayedCount = await this.outboundQueue.getDelayedCount();
    const waitingCount = await this.outboundQueue.getWaitingCount();
    const total = delayedCount + waitingCount;

    if (total > 0) {
      this.logger.log(
        `🟢 Internet restored after ${Math.round(payload.wasOfflineFor / 1000)}s — ` +
        `Processing ${total} queued outbound operations...`,
      );

      // نقل العمليات المؤجلة للتنفيذ الفوري
      // BullMQ سيتولى التنفيذ تلقائياً عبر الـ Consumer
    } else {
      this.logger.log('🟢 Internet restored — No pending outbound operations');
    }
  }

  @OnEvent('connectivity.offline')
  handleConnectivityLost() {
    this.logger.warn('🔴 Internet lost — New outbound operations will be queued');
  }
}
