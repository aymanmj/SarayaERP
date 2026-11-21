import { SetMetadata } from '@nestjs/common';

export const IS_SENSITIVE_KEY = 'isSensitive';
export const AUDIT_IN_TRANSACTION_KEY = 'auditInTransaction';
export const AuditInTransaction = () =>
  SetMetadata(AUDIT_IN_TRANSACTION_KEY, true);
export const Sensitive = (actionName?: string) =>
  SetMetadata(IS_SENSITIVE_KEY, actionName || true);
