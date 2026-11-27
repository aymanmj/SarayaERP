import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

type MemoryThrottleEntry = {
  hits: number;
  expiresAt: number;
  blockExpiresAt: number;
};

type MemoryLockoutEntry = {
  count: number;
  firstFailedAt: number;
  lockedUntil: number;
};

const LOGIN_LOCKOUT_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const THROTTLE_LUA = `
local hitKey = KEYS[1]
local blockKey = KEYS[2]
local ttlMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDurationMs = tonumber(ARGV[3])

local blockPttl = redis.call('PTTL', blockKey)
if blockPttl > 0 then
  local hitPttl = redis.call('PTTL', hitKey)
  if hitPttl < 0 then hitPttl = ttlMs end
  return { limit + 1, hitPttl, 1, blockPttl }
end

local hits = redis.call('INCR', hitKey)
if hits == 1 then
  redis.call('PEXPIRE', hitKey, ttlMs)
end
local hitPttl = redis.call('PTTL', hitKey)
if hitPttl < 0 then
  redis.call('PEXPIRE', hitKey, ttlMs)
  hitPttl = ttlMs
end

if hits > limit and blockDurationMs > 0 then
  redis.call('SET', blockKey, '1', 'PX', blockDurationMs)
  return { hits, hitPttl, 1, blockDurationMs }
end

return { hits, hitPttl, 0, 0 }
`;

function createOptionalRedisClient(
  config: ConfigService | undefined,
  logger: Logger,
  label: string,
): Redis | null {
  const nodeEnv = config?.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
  const redisMock = config?.get<string>('REDIS_MOCK') ?? process.env.REDIS_MOCK;
  if (redisMock === 'true' && nodeEnv !== 'production') {
    return null;
  }

  const host = config?.get<string>('REDIS_HOST') ?? process.env.REDIS_HOST;
  if (!host && nodeEnv !== 'production') {
    return null;
  }

  const portRaw = config?.get<string>('REDIS_PORT') ?? process.env.REDIS_PORT;
  const password =
    config?.get<string>('REDIS_PASSWORD') ?? process.env.REDIS_PASSWORD;

  const client = new Redis({
    host: host || '127.0.0.1',
    port: Number(portRaw || 6379),
    password: password || undefined,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    retryStrategy: (times: number) =>
      times > 2 ? null : Math.min(times * 200, 500),
  });

  client.on('error', (err: Error) => {
    logger.debug(`${label} Redis fallback active (${err.message})`);
  });

  return client;
}

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly client: Redis | null;
  private readonly memoryStore = new Map<string, MemoryThrottleEntry>();

  constructor(
    @Optional() config?: ConfigService,
    @Optional() injectedClient?: Redis | null,
  ) {
    this.client =
      injectedClient !== undefined
        ? injectedClient
        : createOptionalRedisClient(config, this.logger, 'Throttler');
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const safeTtl = Math.max(1, ttl);
    const effectiveBlockDuration = blockDuration > 0 ? blockDuration : safeTtl;

    if (this.client) {
      try {
        if (this.client.status === 'wait') {
          await this.client.connect();
        }
        const hitKey = `saraya:throttle:${throttlerName}:${key}`;
        const blockKey = `saraya:throttle:block:${throttlerName}:${key}`;
        const raw = (await this.client.eval(
          THROTTLE_LUA,
          2,
          hitKey,
          blockKey,
          String(safeTtl),
          String(limit),
          String(effectiveBlockDuration),
        )) as [number, number, number, number];

        const [hits, hitPttl, blockedFlag, blockPttl] = raw;
        return {
          totalHits: Number(hits),
          timeToExpire: Math.max(0, Math.ceil(Number(hitPttl) / 1000)),
          isBlocked: Number(blockedFlag) === 1,
          timeToBlockExpire: Math.max(0, Math.ceil(Number(blockPttl) / 1000)),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.debug(
          `Redis throttler unavailable, using local fallback: ${msg}`,
        );
      }
    }

    return this.incrementMemory(
      `${throttlerName}:${key}`,
      safeTtl,
      limit,
      effectiveBlockDuration,
    );
  }

  private incrementMemory(
    compositeKey: string,
    ttlMs: number,
    limit: number,
    blockDurationMs: number,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    let entry = this.memoryStore.get(compositeKey);

    if (entry && entry.blockExpiresAt > 0 && entry.blockExpiresAt <= now) {
      this.memoryStore.delete(compositeKey);
      entry = undefined;
    }

    if (!entry || entry.expiresAt <= now) {
      entry = {
        hits: 0,
        expiresAt: now + ttlMs,
        blockExpiresAt: 0,
      };
    }

    if (entry.blockExpiresAt > now) {
      return {
        totalHits: Math.max(entry.hits, limit + 1),
        timeToExpire: Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.max(
          0,
          Math.ceil((entry.blockExpiresAt - now) / 1000),
        ),
      };
    }

    entry.hits += 1;
    let isBlocked = false;
    let timeToBlockExpire = 0;

    if (entry.hits > limit && blockDurationMs > 0) {
      entry.blockExpiresAt = now + blockDurationMs;
      isBlocked = true;
      timeToBlockExpire = Math.max(0, Math.ceil(blockDurationMs / 1000));
    }

    this.memoryStore.set(compositeKey, entry);
    return {
      totalHits: entry.hits,
      timeToExpire: Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)),
      isBlocked,
      timeToBlockExpire,
    };
  }

  onModuleDestroy() {
    this.memoryStore.clear();
    if (this.client) {
      this.client.disconnect();
    }
  }
}

@Injectable()
export class LoginLockoutStore implements OnModuleDestroy {
  private readonly logger = new Logger(LoginLockoutStore.name);
  private readonly client: Redis | null;
  private readonly memoryStore = new Map<string, MemoryLockoutEntry>();

  constructor(
    @Optional() config?: ConfigService,
    @Optional() injectedClient?: Redis | null,
  ) {
    this.client =
      injectedClient !== undefined
        ? injectedClient
        : createOptionalRedisClient(config, this.logger, 'LoginLockout');
  }

  async isLockedOut(usernameKey: string): Promise<boolean> {
    if (this.client) {
      try {
        if (this.client.status === 'wait') {
          await this.client.connect();
        }
        const locked = await this.client.get(`saraya:auth:lock:${usernameKey}`);
        if (locked === '1') {
          return true;
        }
        return false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.debug(`Redis lockout read fallback (${msg})`);
      }
    }

    const entry = this.memoryStore.get(usernameKey);
    if (!entry) return false;
    const now = Date.now();
    if (entry.lockedUntil > now) return true;
    if (now - entry.firstFailedAt > LOGIN_LOCKOUT_WINDOW_MS) {
      this.memoryStore.delete(usernameKey);
    }
    return false;
  }

  async recordFailure(usernameKey: string): Promise<void> {
    if (this.client) {
      try {
        if (this.client.status === 'wait') {
          await this.client.connect();
        }
        const failKey = `saraya:auth:fail:${usernameKey}`;
        const count = await this.client.incr(failKey);
        if (count === 1) {
          await this.client.pexpire(failKey, LOGIN_LOCKOUT_WINDOW_MS);
        }
        if (count >= LOGIN_LOCKOUT_MAX_ATTEMPTS) {
          await this.client.set(
            `saraya:auth:lock:${usernameKey}`,
            '1',
            'PX',
            LOGIN_LOCKOUT_DURATION_MS,
          );
        }
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.debug(`Redis lockout write fallback (${msg})`);
      }
    }

    const now = Date.now();
    const prev = this.memoryStore.get(usernameKey);
    if (!prev || now - prev.firstFailedAt > LOGIN_LOCKOUT_WINDOW_MS) {
      this.memoryStore.set(usernameKey, {
        count: 1,
        firstFailedAt: now,
        lockedUntil: 0,
      });
      return;
    }
    const nextCount = prev.count + 1;
    this.memoryStore.set(usernameKey, {
      count: nextCount,
      firstFailedAt: prev.firstFailedAt,
      lockedUntil:
        nextCount >= LOGIN_LOCKOUT_MAX_ATTEMPTS
          ? now + LOGIN_LOCKOUT_DURATION_MS
          : 0,
    });
  }

  async clear(usernameKey: string): Promise<void> {
    this.memoryStore.delete(usernameKey);
    if (this.client) {
      try {
        if (this.client.status === 'wait') {
          await this.client.connect();
        }
        await this.client.del(
          `saraya:auth:fail:${usernameKey}`,
          `saraya:auth:lock:${usernameKey}`,
        );
      } catch {
        // Best-effort clear in fallback mode
      }
    }
  }

  onModuleDestroy() {
    this.memoryStore.clear();
    if (this.client) {
      this.client.disconnect();
    }
  }
}
