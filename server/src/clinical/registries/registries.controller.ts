import { Controller, Get, Post, Param, ParseIntPipe, Body, UseGuards, Patch } from '@nestjs/common';
import { RegistriesService } from './registries.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/dto/jwt-payload.type';
import type { UpsertRegistryDto } from './dto/upsert-registry.dto';

@Controller('clinical/registries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RegistriesController {
  constructor(private readonly registriesService: RegistriesService) {}

  @Get()
  @Permissions('clinical:view')
  async listRegistries(@CurrentUser() user: JwtPayload) {
    return this.registriesService.listRegistries(user.hospitalId);
  }

  @Post()
  @Permissions('clinical:manage')
  async createRegistry(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertRegistryDto,
  ) {
    return this.registriesService.createRegistry(user.hospitalId, dto);
  }

  @Patch(':registryId')
  @Permissions('clinical:manage')
  async updateRegistry(
    @CurrentUser() user: JwtPayload,
    @Param('registryId', ParseIntPipe) registryId: number,
    @Body() dto: UpsertRegistryDto,
  ) {
    return this.registriesService.updateRegistry(user.hospitalId, registryId, dto);
  }

  @Get('patient/:patientId/gaps')
  @Permissions('clinical:view')
  async getPatientGaps(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.registriesService.getPatientGaps(patientId);
  }

  @Post('gaps/:gapId/close')
  @Permissions('clinical:manage')
  async closeGap(
    @Param('gapId', ParseIntPipe) gapId: number,
    @Body() body: { reason?: string; notes?: string },
  ) {
    return this.registriesService.closeGap(gapId, body.reason ?? body.notes ?? '');
  }

  @Get(':registryId/analytics')
  @Permissions('clinical:analytics')
  async getAnalytics(@Param('registryId', ParseIntPipe) registryId: number) {
    return this.registriesService.getRegistryAnalytics(registryId);
  }

  @Get(':registryId')
  @Permissions('clinical:view')
  async getRegistry(
    @CurrentUser() user: JwtPayload,
    @Param('registryId', ParseIntPipe) registryId: number,
  ) {
    return this.registriesService.getRegistry(user.hospitalId, registryId);
  }

  // --- Manual Triggers (Usually run via Cron) ---
  @Post('trigger-membership-eval')
  @Permissions('admin:all')
  async triggerMembershipEval() {
    const result = await this.registriesService.evaluateRegistryMemberships();
    return { success: true, message: 'Registry membership evaluation triggered', ...result };
  }

  @Post('trigger-gaps-eval')
  @Permissions('admin:all')
  async triggerGapsEval() {
    const result = await this.registriesService.evaluateCareGaps();
    return { success: true, message: 'Care Gaps evaluation triggered', ...result };
  }
}
