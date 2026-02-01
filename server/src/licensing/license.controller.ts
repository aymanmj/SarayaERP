// server/src/licensing/license.controller.ts
// Professional Licensing System 2.0

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
    return this.licenseService.getStatus();
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
   * Activate a license using a license key.
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
          }
        : null,
    };
  }
}
