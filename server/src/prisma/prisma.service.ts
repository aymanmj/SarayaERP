// src/prisma/prisma.service.ts

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { extendedPrisma } from './prisma.extension';

import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../common/encryption/encryption.service';
import { auditExtension } from './audit.extension';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  
  constructor(
    private readonly cls: ClsService,
    private readonly config: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {
    super({
      datasources: {
        db: {
          url: config.get<string>('DATABASE_URL'),
        },
      },
    });
    
    // Wrap the Prisma client with extensions
    const client = extendedPrisma(this, this.encryptionService).$extends(auditExtension(this.cls, this));
    
    // Attach lifecycle hooks to the proxy so NestJS can call them
    (client as any).onModuleInit = this.onModuleInit.bind(this);
    (client as any).onModuleDestroy = this.onModuleDestroy.bind(this);

    // Return the proxy so it gets injected everywhere instead of the raw client
    return client as any;
  }

  // تايمر للـ keep-alive
  private keepAliveTimer: NodeJS.Timeout | null = null;

  // Since constructor returns the extended proxy, 'this' is already extended.
  // We keep this getter for backwards compatibility with existing usage like `this.prisma.extended.patient.create`.
  get extended(): any {
    return this as any;
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
