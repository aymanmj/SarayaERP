// src/cron/cron.controller.ts

import { Controller, Post, UseGuards } from '@nestjs/common';
import { NightlyBillingService } from './nightly-billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cron')
export class CronController {
  constructor(private readonly nightlyService: NightlyBillingService) {}

  // تشغيل الفوترة الليلية يدوياً
  // POST /cron/run-nightly-billing
  @Post('run-nightly-billing')
  @Roles('ADMIN') // للأدمن فقط
  async triggerNightlyBilling() {
    return this.nightlyService.runDailyBedCharges();
  }
}
