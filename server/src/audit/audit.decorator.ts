import { SetMetadata } from '@nestjs/common';

export const IS_SENSITIVE_KEY = 'isSensitive';
export const Sensitive = (actionName?: string) =>
  SetMetadata(IS_SENSITIVE_KEY, actionName || true);
