import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../../auth/permissions.decorator';
import { TelehealthController } from './telehealth.controller';

function methodPermissions(methodName: string): string[] {
  const descriptor = Object.getOwnPropertyDescriptor(
    TelehealthController.prototype,
    methodName,
  );
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error(`Missing handler ${methodName}`);
  }
  return (Reflect.getMetadata(PERMISSIONS_KEY, descriptor.value) ??
    []) as string[];
}

describe('TelehealthController (OPS02)', () => {
  it('separates waiting-room write permission from appointments:view', () => {
    const enterWaitingRoomPerms = methodPermissions('enterWaitingRoom');

    expect(enterWaitingRoomPerms).not.toContain('appointments:view');
    expect(enterWaitingRoomPerms).toEqual(
      expect.arrayContaining([
        'telehealth:waiting-room:enter',
        'telehealth:manage',
        'telehealth:start',
      ]),
    );
  });
});
