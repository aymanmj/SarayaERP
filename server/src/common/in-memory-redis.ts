import { Logger } from '@nestjs/common';

/**
 * Enterprise In-Memory Redis Mock Client for Development & Environments without running Redis.
 * Supports basic operations (get, set, setex, del, eval, ping) with TTL enforcement.
 */
export class InMemoryRedis {
  private readonly logger = new Logger('InMemoryRedis');
  private static readonly store = new Map<
    string,
    { value: string; expiresAt?: number }
  >();
  private readonly eventCallbacks: Record<string, Function[]> = {};

  constructor(options?: any) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL SECURITY ERROR: In-Memory Redis fallback cannot be initialized in production. Redis server connection is required for data integrity across nodes.',
      );
    }
    this.logger.log('🚀 Initialized In-Memory Redis fallback client');
    // Simulate connection success asynchronously to not block
    setTimeout(() => {
      this.emit('connect');
      this.emit('ready');
    }, 50);
  }

  on(event: string, callback: Function) {
    if (!this.eventCallbacks[event]) {
      this.eventCallbacks[event] = [];
    }
    this.eventCallbacks[event].push(callback);
    return this;
  }

  private emit(event: string, ...args: any[]) {
    const callbacks = this.eventCallbacks[event] || [];
    for (const cb of callbacks) {
      try {
        cb(...args);
      } catch (err) {
        this.logger.error(`Error in event callback for ${event}:`, err);
      }
    }
  }

  async set(
    key: string,
    value: string,
    mode?: string,
    duration?: number,
  ): Promise<'OK'> {
    let expiresAt: number | undefined;
    if (mode === 'EX' && duration !== undefined) {
      expiresAt = Date.now() + duration * 1000;
    }
    InMemoryRedis.store.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    const expiresAt = Date.now() + seconds * 1000;
    InMemoryRedis.store.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const entry = InMemoryRedis.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      InMemoryRedis.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    let deletedCount = 0;
    for (const k of keys) {
      if (InMemoryRedis.store.delete(k)) {
        deletedCount++;
      }
    }
    return deletedCount;
  }

  async eval(script: string, numkeys: number, ...args: any[]): Promise<any> {
    const key = args[0];
    const dbCount = Number(args[1] || 0);

    // Specifically handle the QualityService sequence generation lua script:
    // local key = KEYS[1]
    // local dbCount = tonumber(ARGV[1])
    // local exists = redis.call('EXISTS', key)
    // if exists == 0 then redis.call('SET', key, dbCount) end
    // return redis.call('INCR', key)
    const entry = InMemoryRedis.store.get(key);
    let currentVal = entry ? Number(entry.value) : null;

    if (currentVal === null || isNaN(currentVal)) {
      currentVal = dbCount;
    }

    const newVal = currentVal + 1;
    InMemoryRedis.store.set(key, { value: String(newVal) });
    return newVal;
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  disconnect() {
    this.logger.log('🔌 In-Memory Redis client disconnected');
  }
}
