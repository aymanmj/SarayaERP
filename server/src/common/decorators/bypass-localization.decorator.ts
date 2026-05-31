import { SetMetadata } from '@nestjs/common';

export const BYPASS_LOCALIZATION_KEY = 'bypassLocalization';
export const BypassLocalization = () => SetMetadata(BYPASS_LOCALIZATION_KEY, true);
