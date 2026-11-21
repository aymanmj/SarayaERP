import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AssetsController } from './assets.controller';

function methodPermissions(methodName: string): string[] {
  const descriptor = Object.getOwnPropertyDescriptor(
    AssetsController.prototype,
    methodName,
  );
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error(`Missing handler ${methodName}`);
  }
  return (Reflect.getMetadata(PERMISSIONS_KEY, descriptor.value) ??
    []) as string[];
}

describe('AssetsController (OPS02)', () => {
  it('separates maintenance reporting write permission from read-only assets:view', () => {
    const createTicketPerms = methodPermissions('createTicket');
    const listAssetsPerms = methodPermissions('listAssets');
    const getTicketsPerms = methodPermissions('getTickets');

    expect(createTicketPerms).not.toContain('assets:view');
    expect(createTicketPerms).toEqual(
      expect.arrayContaining([
        'assets:manage',
        'assets:maintenance:manage',
        'assets:maintenance:report',
      ]),
    );

    expect(listAssetsPerms).toContain('assets:view');
    expect(getTicketsPerms).toContain('assets:view');
  });
});
