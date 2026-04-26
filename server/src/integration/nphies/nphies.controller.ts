import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import { NphiesEligibilityService } from './nphies-eligibility.service';
import { NphiesClaimService } from './nphies-claim.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { PermissionsGuard } from '../../auth/permissions.guard';

/**
 * واجهة تحكم تكامل NPHIES
 * 
 * توفر REST endpoints لعمليات:
 * - التحقق من أهلية التأمين (Eligibility)
 * - إرسال الموافقات المسبقة (Pre-Authorization)
 * - إرسال المطالبات الإلكترونية (eClaims)
 * - الاستعلام عن حالة المطالبات
 */
@Controller('integration/nphies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NphiesController {
  private readonly logger = new Logger(NphiesController.name);

  constructor(
    private eligibilityService: NphiesEligibilityService,
    private claimService: NphiesClaimService,
  ) {}

  // ============================================
  // Eligibility — التحقق من الأهلية
  // ============================================

  /**
   * التحقق من أهلية مريض تأمينياً عبر NPHIES
   */
  @Post('eligibility/check')
  @Permissions('NPHIES_SUBMIT_CLAIM')
  async checkEligibility(
    @Body()
    data: {
      patient: {
        id: string;
        fullName: string;
        nationalId?: string;
        dateOfBirth?: string;
        gender?: string;
        phone?: string;
      };
      insurance: {
        memberId: string;
        payerIdentifier: string;
        payerName: string;
      };
    },
  ) {
    return this.eligibilityService.checkEligibility(
      {
        ...data.patient,
        dateOfBirth: data.patient.dateOfBirth
          ? new Date(data.patient.dateOfBirth)
          : undefined,
      },
      data.insurance,
    );
  }

  // ============================================
  // Claims — المطالبات
  // ============================================

  /**
   * إرسال مطالبة إلى NPHIES
   */
  @Post('claims/:claimId/submit')
  @Permissions('claims:update')
  async submitClaim(@Param('claimId', ParseIntPipe) claimId: number) {
    return this.claimService.submitClaim(claimId);
  }

  /**
   * الاستعلام عن حالة مطالبة في NPHIES
   */
  @Get('claims/:externalId/status')
  @Permissions('claims:read')
  async checkClaimStatus(@Param('externalId') externalId: string) {
    return this.claimService.checkClaimStatus(externalId);
  }

  // ============================================
  // Pre-Authorization — الموافقات المسبقة
  // ============================================

  /**
   * إرسال طلب موافقة مسبقة إلى NPHIES
   */
  @Post('preauth/submit')
  @Permissions('claims:create')
  async submitPreAuthorization(
    @Body()
    data: {
      patient: {
        id: string;
        fullName: string;
        nationalId?: string;
        dateOfBirth?: string;
        gender?: string;
      };
      insurance: {
        memberId: string;
        payerIdentifier: string;
        payerName: string;
      };
      services: Array<{
        code: string;
        name: string;
        quantity: number;
        unitPrice: number;
      }>;
      diagnoses: Array<{
        code: string;
        display: string;
        isPrimary: boolean;
      }>;
    },
  ) {
    return this.claimService.submitPreAuthorization(
      {
        ...data.patient,
        dateOfBirth: data.patient.dateOfBirth
          ? new Date(data.patient.dateOfBirth)
          : undefined,
      },
      data.insurance,
      data.services,
      data.diagnoses,
    );
  }
}
