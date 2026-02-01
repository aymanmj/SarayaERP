// src/licensing/licensing.module.ts
import { Module, Global } from '@nestjs/common';
import { LicenseService } from './license.service';
import { LicenseController } from './license.controller';
import { APP_GUARD } from '@nestjs/core';
import { LicenseGuard } from './license.guard';

@Global()
@Module({
  controllers: [LicenseController],
  providers: [
    LicenseService,
    // تفعيل الحماية على مستوى التطبيق بالكامل
    {
      provide: APP_GUARD,
      useClass: LicenseGuard,
    },
  ],
  exports: [LicenseService],
})
export class LicensingModule {}
