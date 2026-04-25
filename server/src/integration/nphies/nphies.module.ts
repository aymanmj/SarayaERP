import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NphiesService } from './nphies.service';
import { NphiesAuthService } from './nphies-auth.service';
import { NphiesEligibilityService } from './nphies-eligibility.service';
import { NphiesClaimService } from './nphies-claim.service';
import { NphiesController } from './nphies.controller';

/**
 * وحدة تكامل NPHIES (منصة المطالبات الوطنية السعودية)
 * 
 * تتيح:
 * - التحقق من أهلية المريض التأمينية (Eligibility Check)
 * - إرسال الموافقات المسبقة (Pre-Authorization)
 * - إرسال المطالبات الإلكترونية (eClaims)
 * - استقبال ومعالجة الردود (ERA/Remittance)
 * 
 * تعتمد على معيار HL7 FHIR R4
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // NPHIES قد يستغرق وقتاً
      maxRedirects: 3,
    }),
  ],
  controllers: [NphiesController],
  providers: [
    NphiesService,
    NphiesAuthService,
    NphiesEligibilityService,
    NphiesClaimService,
  ],
  exports: [NphiesService, NphiesEligibilityService, NphiesClaimService],
})
export class NphiesModule {}
