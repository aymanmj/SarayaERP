// ============================================
// ConnectivityService — Internet Connectivity Monitor
// ============================================
// يراقب حالة الاتصال بالإنترنت ويصدر أحداث للنظام
// يُستخدم من Integration/Notifications لتقرير هل يتم الإرسال الآن أو يُؤجل

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as https from 'https';
import * as http from 'http';

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
  private hasCompletedInitialCheck = false;

  // فحص كل 30 ثانية
  private readonly CHECK_INTERVAL_MS = 30_000;
  // عدد المحاولات الفاشلة قبل إعلان الانقطاع
  private readonly FAILURE_THRESHOLD = 2;
  // HTTP targets للفحص — أدق من DNS في بيئات المستشفيات
  // HTTP targets للفحص — استخدام IPs مباشرة لتجاوز مشاكل DNS و IPv6 (التي تسبب Timeout)
  // تم تحويلها إلى مسارات HTTPS لأن بعض المستشفيات تغلق المنفذ 80 بالكامل
  private readonly HTTP_TARGETS = [
    'https://1.1.1.1/',
    'https://8.8.8.8/',
    'http://connectivitycheck.gstatic.com/generate_204'
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
        reachable = await new Promise<boolean>((resolve) => {
          const isHttps = target.startsWith('https');
          const client = isHttps ? https : http;
          
          const req = client.request(target, {
            method: 'HEAD',
            timeout: 3000,
            family: 4, // إجبار IPv4 لتجاوز مشاكل تجمد IPv6
            rejectUnauthorized: false, // لا نهتم بصلاحية الشهادة، نريد فقط إثبات الاتصال
          }, (res) => {
            // أي استجابة تعني أننا وصلنا للانترنت
            resolve(true);
          });

          req.on('timeout', () => {
            req.destroy();
            resolve(false);
          });

          req.on('error', (err) => {
            this.logger.warn(`Connectivity check failed for ${target}: ${err.message}`);
            resolve(false);
          });

          req.end();
        });

        if (reachable) {
          break; // واحد يكفي
        }
      } catch (err: any) {
        this.logger.warn(`Unexpected error during check for ${target}: ${err.message}`);
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

      if (
        (wasOnline && this.state.consecutiveFailures >= this.FAILURE_THRESHOLD) ||
        (!this.hasCompletedInitialCheck && this.state.consecutiveFailures >= 1)
      ) {
        // 🔴 انقطاع مؤكد
        this.state.isOnline = false;
        this.state.lastOfflineAt = new Date();
        this.logger.warn('🔴 Internet connectivity LOST');
        this.eventEmitter.emit('connectivity.offline', {
          detectedAt: this.state.lastOfflineAt,
        });
      }
    }

    this.hasCompletedInitialCheck = true;
  }
}
