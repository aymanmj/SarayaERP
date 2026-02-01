// server/src/licensing/license.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const REQUIRED_FEATURE_KEY = 'requiredFeature';

/**
 * Marks a route as PUBLIC, bypassing both Auth and License guards.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Marks a route as requiring a specific license feature/module.
 * Used by LicenseGuard to check if the feature is enabled.
 */
export const RequireFeature = (feature: string) =>
  SetMetadata(REQUIRED_FEATURE_KEY, feature);
