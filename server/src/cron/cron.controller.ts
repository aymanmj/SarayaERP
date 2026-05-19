// src/cron/cron.controller.ts

import { Controller, Post, UseGuards } from '@nestjs/common';
import { NightlyBillingService } from './nightly-billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cron')
export class CronController {
  constructor(private readonly nightlyService: NightlyBillingService) {}

  // تشغيل الفوترة الليلية يدوياً
  // POST /cron/run-nightly-billing
  @Post('run-nightly-billing')
  @Permissions('system:manage') // للأدمن فقط
  async triggerNightlyBilling() {
    return this.nightlyService.runDailyBedCharges();
  }
}
