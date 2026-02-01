// src/triage/triage.module.ts

import { Module } from '@nestjs/common';
import { TriageService } from './triage.service';
import { TriageController } from './triage.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TriageController],
  providers: [TriageService],
})
export class TriageModule {}
