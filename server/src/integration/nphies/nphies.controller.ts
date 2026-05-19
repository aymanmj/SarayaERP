import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import { NphiesEligibilityService } from './nphies-eligibility.service';
import { NphiesClaimService } from './nphies-claim.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt-payload.type';

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
    @CurrentUser() user: JwtPayload,
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
      user.hospitalId,
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
  async submitClaim(
    @Param('claimId', ParseIntPipe) claimId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.claimService.submitClaim(user.hospitalId, claimId);
  }

  /**
   * الاستعلام عن حالة مطالبة في NPHIES
   */
  @Get('claims/:externalId/status')
  @Permissions('claims:read')
  async checkClaimStatus(
    @Param('externalId') externalId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.claimService.checkClaimStatus(user.hospitalId, externalId);
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
    @CurrentUser() user: JwtPayload,
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
      attachments?: Array<{
        localFilePath: string;
        title: string;
        contentType?: string;
      }>;
    },
  ) {
    return this.claimService.submitPreAuthorization(
      user.hospitalId,
      {
        ...data.patient,
        dateOfBirth: data.patient.dateOfBirth
          ? new Date(data.patient.dateOfBirth)
          : undefined,
      },
      data.insurance,
      data.services,
      data.diagnoses,
      data.attachments,
    );
  }
}
