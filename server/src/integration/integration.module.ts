// src/integration/integration.module.ts

import { Module } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BullModule } from '@nestjs/bullmq';
import { Hl7Consumer } from './hl7.consumer';
import { IntegrationListener } from './integration.listener'; // 1. استيراد المستمع
import { ConfigModule, ConfigService } from '@nestjs/config';

import { FhirService } from './fhir/fhir.service';
import { FhirController } from './fhir/fhir.controller';

@Module({
  imports: [
    PrismaModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT')
            ? Number(configService.get('REDIS_PORT'))
            : 6379,
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'hl7-queue',
    }),
  ],
  controllers: [IntegrationController, FhirController], // ✅
  // 2. ✅ إضافة IntegrationListener هنا ضروري جداً
  providers: [IntegrationService, Hl7Consumer, IntegrationListener, FhirService], // ✅
  exports: [IntegrationService, FhirService],
})
export class IntegrationModule {}
