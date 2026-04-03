// src/clinical-profile/clinical-profile.module.ts
import { Module } from '@nestjs/common';
import { ClinicalProfileController } from './clinical-profile.controller';
import { ClinicalProfileService } from './clinical-profile.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalProfileController],
  providers: [ClinicalProfileService],
  exports: [ClinicalProfileService],
})
export class ClinicalProfileModule {}
