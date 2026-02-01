// server/src/licensing/license.guard.ts
// Professional Licensing System 2.0

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseService } from './license.service';
import { IS_PUBLIC_KEY, REQUIRED_FEATURE_KEY } from './license.decorator';

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly licenseService: LicenseService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Check if route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 2. Check license validity
    const status = this.licenseService.getStatus();

    if (!status.isValid) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'LICENSE_REQUIRED',
        error: status.error || 'الترخيص غير صالح أو منتهي الصلاحية.',
      });
    }

    // 3. Check for required feature (if any)
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      REQUIRED_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredFeature) {
      const isEnabled = this.licenseService.isModuleEnabled(requiredFeature);
      if (!isEnabled) {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'FEATURE_NOT_LICENSED',
          error: `الميزة "${requiredFeature}" غير متاحة في خطة الاشتراك الحالية.`,
        });
      }
    }

    return true;
  }
}
