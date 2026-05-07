// ============================================
// ConnectivityService — Internet Connectivity Monitor
// ============================================
// يراقب حالة الاتصال بالإنترنت ويصدر أحداث للنظام
// يُستخدم من Integration/Notifications لتقرير هل يتم الإرسال الآن أو يُؤجل

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface ConnectivityState {
  /** هل الإنترنت متاح الآن؟ */
  isOnline: boolean;
  /** آخر وقت تم فيه اكتشاف اتصال */
  lastOnlineAt: Date | null;
  /** آخر وقت تم فيه اكتشاف انقطاع */
  lastOfflineAt: Date | null;
  /** عدد المحاولات المتتالية الفاشلة */
  consecutiveFailures: number;
}

@Injectable()
export class ConnectivityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectivityService.name);

  private state: ConnectivityState = {
    isOnline: true, // نفترض الاتصال عند البدء
    lastOnlineAt: null,
    lastOfflineAt: null,
    consecutiveFailures: 0,
  };

  private checkInterval: ReturnType<typeof setInterval> | null = null;

  // فحص كل 30 ثانية
  private readonly CHECK_INTERVAL_MS = 30_000;
  // عدد المحاولات الفاشلة قبل إعلان الانقطاع
  private readonly FAILURE_THRESHOLD = 2;
  // HTTP targets للفحص — أدق من DNS في بيئات المستشفيات
  private readonly HTTP_TARGETS = [
    'http://connectivitycheck.gstatic.com/generate_204',
    'https://cloudflare.com'
  ];

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    this.logger.log('🌐 Connectivity Monitor starting...');
    // فحص فوري
    await this.checkConnectivity();
    // فحص دوري
    this.checkInterval = setInterval(() => this.checkConnectivity(), this.CHECK_INTERVAL_MS);
    this.logger.log('🌐 Connectivity Monitor active (checking every 30s)');
  }

  onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  /**
   * الحالة الحالية للاتصال
   */
  getState(): ConnectivityState {
    return { ...this.state };
  }

  /**
   * هل الإنترنت متاح الآن؟
   */
  isOnline(): boolean {
    return this.state.isOnline;
  }

  /**
   * فحص الاتصال بالإنترنت عبر HTTP request
   * أثبت كفاءة أعلى من DNS في بيئات المستشفيات المغلقة التي تعترض UDP
   */
  private async checkConnectivity(): Promise<void> {
    let reachable = false;

    for (const target of this.HTTP_TARGETS) {
      try {
        const controller = new AbortController();
        // مهلة 3 ثواني للطلب
        const timeout = setTimeout(() => controller.abort(), 3000);
        
        await fetch(target, { 
          method: 'HEAD', 
          signal: controller.signal, 
          cache: 'no-store' 
        });
        
        clearTimeout(timeout);
        reachable = true;
        break; // واحد يكفي
      } catch {
        // جرّب التالي
      }
    }

    const wasOnline = this.state.isOnline;

    if (reachable) {
      this.state.consecutiveFailures = 0;
      this.state.lastOnlineAt = new Date();

      if (!wasOnline) {
        // 🟢 عاد الاتصال!
        this.state.isOnline = true;
        this.logger.log('🟢 Internet connectivity RESTORED');
        this.eventEmitter.emit('connectivity.online', {
          restoredAt: this.state.lastOnlineAt,
          wasOfflineFor: this.state.lastOfflineAt
            ? Date.now() - this.state.lastOfflineAt.getTime()
            : 0,
        });
      }
    } else {
      this.state.consecutiveFailures++;

      if (wasOnline && this.state.consecutiveFailures >= this.FAILURE_THRESHOLD) {
        // 🔴 انقطاع مؤكد
        this.state.isOnline = false;
        this.state.lastOfflineAt = new Date();
        this.logger.warn('🔴 Internet connectivity LOST');
        this.eventEmitter.emit('connectivity.offline', {
          detectedAt: this.state.lastOfflineAt,
        });
      }
    }
  }
}
