// src/cron/cron.module.ts

import { Module } from '@nestjs/common';
import { NightlyBillingService } from './nightly-billing.service';
import { CronController } from './cron.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CronController],
  providers: [NightlyBillingService],
})
export class CronModule {}
