import 'reflect-metadata';
import { AUDIT_IN_TRANSACTION_KEY } from '../audit/audit.decorator';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { HrController } from './hr.controller';

function getMethodMetadata<T>(methodName: string, key: string): T {
  const descriptor = Object.getOwnPropertyDescriptor(
    HrController.prototype,
    methodName,
  );
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error(`Missing handler ${methodName}`);
  }
  return Reflect.getMetadata(key, descriptor.value) as T;
}

describe('HrController (OPS02 / OPS03)', () => {
  it('separates leave request write permission from read-only hr:view', () => {
    const requestLeavePerms = getMethodMetadata<string[]>(
      'requestLeave',
      PERMISSIONS_KEY,
    );

    expect(requestLeavePerms).not.toContain('hr:view');
    expect(requestLeavePerms).toEqual(
      expect.arrayContaining(['hr:manage', 'hr:leaves:request']),
    );
  });

  it('marks leave status approval/rejection with @AuditInTransaction()', () => {
    const isAtomicAudit = getMethodMetadata<boolean>(
      'updateLeaveStatus',
      AUDIT_IN_TRANSACTION_KEY,
    );
    expect(isAtomicAudit).toBe(true);
  });
});
