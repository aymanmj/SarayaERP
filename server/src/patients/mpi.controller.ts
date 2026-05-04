import { Controller, Get, Post, Query, UseGuards, Req, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MpiService } from './mpi.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

@ApiTags('MPI Federation')
@ApiBearerAuth()
@Controller('mpi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MpiController {
  constructor(private readonly mpiService: MpiService) {}

  @Get('search')
  @Roles('SYSTEM_ADMIN', 'HIE_ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Cross-facility Patient Search (MPI Federation)' })
  @ApiQuery({ name: 'nationalId', required: false, type: String })
  @ApiQuery({ name: 'phone', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Returns matching global patients across facilities.' })
  @ApiResponse({ status: 403, description: 'Cross-facility data sharing is disabled.' })
  async searchGlobalPatients(
    @Query('nationalId') nationalId: string,
    @Query('phone') phone: string,
    @Req() req: Request
  ) {
    if (!nationalId && !phone) {
      throw new BadRequestException('You must provide at least one search criteria (nationalId or phone).');
    }

    // Require the user's organizationId to be present in the JWT payload for proper Tenant Isolation
    const user = (req as any).user;
    if (!user || !user.organizationId) {
      throw new ForbiddenException('Invalid tenant scope. Cannot determine your organization context.');
    }
    const organizationId = user.organizationId;

    return this.mpiService.searchMpi(organizationId, { nationalId, phone });
  }

  @Post('consent/trigger')
  @Roles('SYSTEM_ADMIN', 'HIE_ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Trigger OTP for Dynamic Patient Consent' })
  @ApiResponse({ status: 201, description: 'OTP sent successfully' })
  async triggerConsentOtp(
    @Query('patientId') patientId: number,
    @Req() req: Request
  ) {
    if (!patientId) throw new BadRequestException('patientId is required');

    const user = (req as any).user;
    const doctorName = user?.fullName || 'Doctor';
    const hospitalName = 'Saraya General Hospital'; // Could be derived from hospitalId

    return this.mpiService.triggerConsentOtp(Number(patientId), doctorName, hospitalName);
  }

  @Post('consent/verify')
  @Roles('SYSTEM_ADMIN', 'HIE_ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Verify OTP and issue Consent Token' })
  @ApiResponse({ status: 201, description: 'Consent token issued' })
  async verifyConsentOtp(
    @Query('patientId') patientId: number,
    @Query('otp') otp: string
  ) {
    if (!patientId || !otp) throw new BadRequestException('patientId and otp are required');

    return this.mpiService.verifyConsentOtp(Number(patientId), otp);
  }
}
