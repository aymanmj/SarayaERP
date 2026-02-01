// src/prisma/prisma.service.ts

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { extendedPrisma } from './prisma.extension';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private _extendedClient: ReturnType<typeof extendedPrisma>;

  // تايمر للـ keep-alive
  private keepAliveTimer: NodeJS.Timeout | null = null;

  get extended() {
    if (!this._extendedClient) {
      this._extendedClient = extendedPrisma(this);
    }
    return this._extendedClient;
  }

  async onModuleInit() {
    this.logger.log('Connecting to PostgreSQL via Prisma...');
    await this.$connect();
    this.logger.log('✅ Prisma connected. with Soft Delete Extension.');

    // 🔁 Ping للـ DB كل 5 دقائق حتى لا ينام الـ connection
    this.keepAliveTimer = setInterval(
      async () => {
        try {
          // أبسط استعلام ممكن كـ ping
          await this.$queryRaw`SELECT 1`;
          // لو تحب تشوف لوق كل مرة شيل التعليق:
          // this.logger.debug('DB keep-alive ping OK');
        } catch (error) {
          this.logger.error('DB keep-alive ping failed', error as any);
        }
      },
      5 * 60 * 1000,
    ); // 5 دقائق
  }

  async onModuleDestroy() {
    // تنظيف التايمر
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    this.logger.log('Disconnecting Prisma...');
    await this.$disconnect();
    this.logger.log('✅ Prisma disconnected.');
  }
}
