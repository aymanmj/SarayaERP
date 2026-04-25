import { Module } from '@nestjs/common';
import { ClaimService } from './claim.service';
import { ClaimScrubberService } from './scrubber/claim-scrubber.service';
import { DenialManagementService } from './denials/denial-management.service';
import { ClaimController } from './claim.controller';

import { EraProcessingService } from './era-processing.service';
import { InsuranceContractService } from './insurance-contract.service';
import { BatchSubmissionService } from './batch-submission.service';
import { NphiesModule } from '../integration/nphies/nphies.module';

/**
 * وحدة إدارة دورة الإيرادات (Revenue Cycle Management)
 * 
 * تشمل:
 * - إدارة المطالبات التأمينية (Claims)
 * - محرك فحص المطالبات (Claims Scrubbing)
 * - إدارة المرفوضات والاستئناف (Denial Management)
 * - إدارة العقود التأمينية (Contract Modeling)
 * - معالجة ملفات التحويل الإلكتروني (ERA Processing)
 * - تجميع وإرسال الدفعات (Batch Submission)
 */
@Module({
  imports: [NphiesModule],
  controllers: [ClaimController],
  providers: [
    ClaimService,
    ClaimScrubberService,
    DenialManagementService,
    EraProcessingService,
    InsuranceContractService,
    BatchSubmissionService,
  ],
  exports: [
    ClaimService, 
    ClaimScrubberService, 
    DenialManagementService,
    EraProcessingService,
    InsuranceContractService,
    BatchSubmissionService,
  ],
})
export class RcmModule {}
