import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  Req,
  BadRequestException,
  ForbiddenException,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MpiService } from './mpi.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import type { Request } from 'express';

@ApiTags('MPI Federation')
@ApiBearerAuth()
@Controller('mpi')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MpiController {
  constructor(private readonly mpiService: MpiService) {}

  @Get('search')
  @Permissions('patients:manage')
  @ApiOperation({ summary: 'Cross-facility Patient Search (MPI Federation)' })
  @ApiQuery({ name: 'nationalId', required: false, type: String })
  @ApiQuery({ name: 'phone', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Returns matching global patients across facilities.',
  })
  @ApiResponse({
    status: 403,
    description: 'Cross-facility data sharing is disabled.',
  })
  async searchGlobalPatients(
    @Query('nationalId') nationalId: string,
    @Query('phone') phone: string,
    @Req() req: Request,
  ) {
    if (!nationalId && !phone) {
      throw new BadRequestException(
        'You must provide at least one search criteria (nationalId or phone).',
      );
    }

    // Require the user's organizationId to be present in the JWT payload for proper Tenant Isolation
    const user = (req as any).user;
    if (!user || !user.organizationId) {
      throw new ForbiddenException(
        'Invalid tenant scope. Cannot determine your organization context.',
      );
    }
    const organizationId = user.organizationId;

    return this.mpiService.searchMpi(organizationId, { nationalId, phone });
  }

  @Post('consent/trigger')
  @Permissions('patients:manage')
  @ApiOperation({ summary: 'Trigger OTP for Dynamic Patient Consent' })
  @ApiQuery({ name: 'patientId', required: true, type: Number })
  @ApiQuery({ name: 'purpose', required: false, type: String })
  @ApiResponse({ status: 201, description: 'OTP sent successfully' })
  async triggerConsentOtp(
    @Query('patientId') patientId: number,
    @Query('purpose') purpose: string,
    @Req() req: Request,
  ) {
    if (!patientId) throw new BadRequestException('patientId is required');

    const user = (req as any).user;
    if (!user || !user.organizationId) {
      throw new ForbiddenException(
        'Invalid tenant scope. Cannot determine your organization context.',
      );
    }
    const doctorName = user?.fullName || 'Doctor';
    const hospitalName = 'Saraya General Hospital'; // Could be derived from hospitalId
    const requestingOrganizationId = user.organizationId;
    const requestingHospitalId = user.hospitalId || null;
    const requestingUserId = user.id;

    return this.mpiService.triggerConsentOtp(
      Number(patientId),
      doctorName,
      hospitalName,
      requestingOrganizationId,
      requestingHospitalId,
      requestingUserId,
      purpose || 'Emergency Medical Treatment',
    );
  }

  @Post('consent/verify')
  @Permissions('patients:manage')
  @ApiOperation({ summary: 'Verify OTP and issue Consent Token' })
  @ApiResponse({ status: 201, description: 'Consent token issued' })
  async verifyConsentOtp(
    @Query('patientId') patientId: number,
    @Query('otp') otp: string,
    @Req() req: Request,
  ) {
    if (!patientId || !otp)
      throw new BadRequestException('patientId and otp are required');

    const user = (req as any).user;
    const requestingOrganizationId = user?.organizationId;

    return this.mpiService.verifyConsentOtp(
      Number(patientId),
      otp,
      requestingOrganizationId,
    );
  }

  // ==========================================
  // CONSENT REVOCATION
  // ==========================================

  @Delete('consent/revoke/:patientId')
  @Permissions('patients:manage')
  @ApiOperation({
    summary: 'Revoke data sharing consent for a patient',
    description:
      'Invalidates all active consent OTPs and creates an audit trail. ' +
      'Can be scoped to a specific organization or revoke all cross-facility access.',
  })
  @ApiResponse({ status: 200, description: 'Consent revoked successfully' })
  async revokeConsent(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body()
    body: {
      reason: string;
      organizationId?: number;
    },
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    if (!body.reason) {
      throw new BadRequestException(
        'A reason for consent revocation is required for audit compliance.',
      );
    }

    return this.mpiService.revokeConsent({
      patientId,
      revokedByUserId: user.sub || user.id,
      revokedByRole: user.role || 'ADMIN',
      organizationId: body.organizationId,
      reason: body.reason,
    });
  }

  // ==========================================
  // CONSENT AUDIT TRAIL
  // ==========================================

  @Get('consent/audit/:patientId')
  @Permissions('patients:manage')
  @ApiOperation({
    summary: 'Get consent audit trail for a patient',
    description:
      'Returns all consent requests, grants, expirations, and revocations ' +
      'for a specific patient. Essential for HIPAA/GDPR compliance.',
  })
  @ApiResponse({
    status: 200,
    description: 'Consent audit trail with request history and revocations.',
  })
  async getConsentAuditTrail(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.mpiService.getConsentAuditTrail(patientId, user.hospitalId);
  }
}
