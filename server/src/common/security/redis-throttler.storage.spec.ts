import type Redis from 'ioredis';
import {
  LoginLockoutStore,
  RedisThrottlerStorage,
} from './redis-throttler.storage';

describe('RedisThrottlerStorage & LoginLockoutStore', () => {
  it('enforces distributed rate limits and blocks via Redis eval when available', async () => {
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce([1, 60000, 0, 0])
      .mockResolvedValueOnce([6, 59000, 1, 30000]);

    const fakeRedis = {
      status: 'ready',
      eval: evalMock,
      disconnect: jest.fn(),
    } as unknown as Redis;

    const storage = new RedisThrottlerStorage(undefined, fakeRedis);

    const first = await storage.increment('10.0.0.1', 60000, 5, 30000, 'short');
    expect(first).toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    const blocked = await storage.increment(
      '10.0.0.1',
      60000,
      5,
      30000,
      'short',
    );
    expect(blocked).toEqual({
      totalHits: 6,
      timeToExpire: 59,
      isBlocked: true,
      timeToBlockExpire: 30,
    });

    storage.onModuleDestroy();
  });

  it('gracefully falls back to in-memory throttling if Redis throws', async () => {
    const failingRedis = {
      status: 'ready',
      eval: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      disconnect: jest.fn(),
    } as unknown as Redis;

    const storage = new RedisThrottlerStorage(undefined, failingRedis);

    const r1 = await storage.increment('ip1', 60000, 2, 10000, 'short');
    const r2 = await storage.increment('ip1', 60000, 2, 10000, 'short');
    const r3 = await storage.increment('ip1', 60000, 2, 10000, 'short');

    expect(r1.isBlocked).toBe(false);
    expect(r2.totalHits).toBe(2);
    expect(r3.isBlocked).toBe(true);
    expect(r3.timeToBlockExpire).toBe(10);

    storage.onModuleDestroy();
  });

  it('tracks login lockout across calls in Redis and clears on success', async () => {
    const store = new Map<string, string>();
    const fakeRedis = {
      status: 'ready',
      incr: jest.fn((key: string) => {
        const next = Number(store.get(key) || '0') + 1;
        store.set(key, String(next));
        return Promise.resolve(next);
      }),
      pexpire: jest.fn().mockResolvedValue(1),
      set: jest.fn((key: string, val: string) => {
        store.set(key, val);
        return Promise.resolve('OK');
      }),
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      del: jest.fn((...keys: string[]) => {
        keys.forEach((k) => store.delete(k));
        return Promise.resolve(keys.length);
      }),
      disconnect: jest.fn(),
    } as unknown as Redis;

    const lockout = new LoginLockoutStore(undefined, fakeRedis);

    for (let i = 0; i < 4; i++) {
      await lockout.recordFailure('dr.ali');
      expect(await lockout.isLockedOut('dr.ali')).toBe(false);
    }

    await lockout.recordFailure('dr.ali');
    expect(await lockout.isLockedOut('dr.ali')).toBe(true);

    await lockout.clear('dr.ali');
    expect(await lockout.isLockedOut('dr.ali')).toBe(false);

    lockout.onModuleDestroy();
  });
});
