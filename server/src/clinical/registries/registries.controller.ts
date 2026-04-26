import { Controller, Get, Post, Param, ParseIntPipe, Body, UseGuards } from '@nestjs/common';
import { RegistriesService } from './registries.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';

@Controller('clinical/registries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RegistriesController {
  constructor(private readonly registriesService: RegistriesService) {}

  @Get('patient/:patientId/gaps')
  @Permissions('clinical:view')
  async getPatientGaps(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.registriesService.getPatientGaps(patientId);
  }

  @Post('gaps/:gapId/close')
  @Permissions('clinical:manage')
  async closeGap(
    @Param('gapId', ParseIntPipe) gapId: number,
    @Body('reason') reason: string,
  ) {
    return this.registriesService.closeGap(gapId, reason);
  }

  @Get(':registryId/analytics')
  @Permissions('clinical:analytics')
  async getAnalytics(@Param('registryId', ParseIntPipe) registryId: number) {
    return this.registriesService.getRegistryAnalytics(registryId);
  }

  // --- Manual Triggers (Usually run via Cron) ---
  @Post('trigger-membership-eval')
  @Permissions('admin:all')
  async triggerMembershipEval() {
    await this.registriesService.evaluateRegistryMemberships();
    return { success: true, message: 'Registry membership evaluation triggered' };
  }

  @Post('trigger-gaps-eval')
  @Permissions('admin:all')
  async triggerGapsEval() {
    await this.registriesService.evaluateCareGaps();
    return { success: true, message: 'Care Gaps evaluation triggered' };
  }
}
