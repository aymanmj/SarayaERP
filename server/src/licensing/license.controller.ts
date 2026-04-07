// server/src/licensing/license.controller.ts
// Professional Licensing System 4.0 - Smart Renewal

import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LicenseService } from './license.service';
import { Public } from './license.decorator';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  /**
   * Get current license status.
   * This endpoint is PUBLIC and can be called without authentication.
   */
  @Public()
  @Get('status')
  getStatus() {
    // Force fresh validation (bypass cache)
    return this.licenseService.getStatus(true);
  }

  /**
   * Get machine ID for activation purposes.
   * This endpoint is PUBLIC.
   */
  @Public()
  @Get('machine-id')
  getMachineId() {
    return {
      machineId: this.licenseService.getMachineId(),
    };
  }

  /**
   * Activate a license using a license key (first time / new install).
   * This endpoint is PUBLIC.
   */
  @Public()
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  activate(@Body() body: { key: string }) {
    if (!body.key || typeof body.key !== 'string') {
      throw new BadRequestException('يرجى إدخال مفتاح الترخيص.');
    }

    const result = this.licenseService.activateLicense(body.key.trim());

    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    return result;
  }

  /**
   * Renew a license with smart bonus days calculation.
   * - If renewed before expiry: bonus days = remaining days from current license
   * - If renewed during grace period or after expiry: starts from today
   * This endpoint is PUBLIC (must be accessible even when license is expired).
   */
  @Public()
  @Post('renew')
  @HttpCode(HttpStatus.OK)
  renew(@Body() body: { key: string }) {
    if (!body.key || typeof body.key !== 'string') {
      throw new BadRequestException('يرجى إدخال مفتاح التجديد.');
    }

    const result = this.licenseService.renewLicense(body.key.trim());

    if (!result.success) {
      throw new BadRequestException(result.message);
    }

    return result;
  }

  // Legacy endpoint for backward compatibility
  @Public()
  @Get('info')
  getInfo() {
    const status = this.licenseService.getStatus();
    return {
      machineId: status.machineId,
      isValid: status.isValid,
      details: status.isValid
        ? {
            plan: status.plan,
            hospitalName: status.hospitalName,
            expiryDate: status.expiryDate,
            maxUsers: status.maxUsers,
            modules: status.modules,
            isGracePeriod: status.isGracePeriod,
            isExpired: status.isExpired,
            daysRemaining: status.daysRemaining,
            graceDaysRemaining: status.graceDaysRemaining,
          }
        : null,
    };
  }
}
