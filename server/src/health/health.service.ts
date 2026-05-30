// src/health/health.service.ts
// Enhanced Health Check Service with detailed metrics

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as os from 'os';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    fhirSubscriptions: {
      status: 'up' | 'down';
      activeCount: number;
      error?: string;
    };
    memory: MemoryStatus;
    cpu: CpuStatus;
  };
}

interface ServiceStatus {
  status: 'up' | 'down';
  latency?: number;
  error?: string;
}

interface MemoryStatus {
  total: string;
  used: string;
  free: string;
  usagePercent: number;
}

interface CpuStatus {
  cores: number;
  model: string;
  loadAverage: number[];
}

import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private startTime = Date.now();
  private redisClient: Redis;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const host = this.config.get<string>('REDIS_HOST') || 'localhost';
    const port = this.config.get<number>('REDIS_PORT') || 6379;
    const password = this.config.get<string>('REDIS_PASSWORD');
    const isMock =
      this.config.get<string>('REDIS_MOCK') === 'true' ||
      process.env.REDIS_MOCK === 'true';

    if (isMock) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('REDIS_MOCK is not allowed in production.');
      }
      const { InMemoryRedis } = require('../common/in-memory-redis');
      this.redisClient = new InMemoryRedis();
      return;
    }

    try {
      this.redisClient = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redisClient.on('error', (err) => {
        if (process.env.NODE_ENV === 'production') {
          this.logger.error(
            'Redis connection failed in HealthService. Fallback to In-Memory is disabled in production.',
            err,
          );
          return;
        }
        // Prevent unhandled error crashes and fallback
        const { InMemoryRedis } = require('../common/in-memory-redis');
        this.redisClient = new InMemoryRedis();
      });
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'Failed to initialize Redis in HealthService. Fallback to In-Memory is disabled in production.',
          err,
        );
        throw err;
      }
      const { InMemoryRedis } = require('../common/in-memory-redis');
      this.redisClient = new InMemoryRedis();
    }
  }

  /**
   * Basic health check (for load balancers)
   */
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'up' };
  }

  /**
   * Detailed health check (for monitoring systems)
   */
  async detailed(): Promise<HealthStatus> {
    const dbStatus = await this.checkDatabase();
    const redisStatus = await this.checkRedis();
    const fhirStatus = await this.checkFhirSubscriptions();
    const memoryStatus = this.getMemoryStatus();
    const cpuStatus = this.getCpuStatus();

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (dbStatus.status === 'down' || redisStatus.status === 'down') {
      status = 'unhealthy';
    } else if (
      memoryStatus.usagePercent > 90 ||
      dbStatus.latency! > 1000 ||
      fhirStatus.status === 'down'
    ) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: dbStatus,
        redis: redisStatus,
        fhirSubscriptions: fhirStatus,
        memory: memoryStatus,
        cpu: cpuStatus,
      },
    };
  }

  /**
   * Readiness probe (for Kubernetes)
   */
  async ready(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
    const dbUp = await this.checkDatabase()
      .then((d) => d.status === 'up')
      .catch(() => false);

    return {
      ready: dbUp,
      checks: {
        database: dbUp,
      },
    };
  }

  /**
   * Liveness probe (for Kubernetes)
   */
  async live(): Promise<{ alive: boolean }> {
    return { alive: true };
  }

  /**
   * Prometheus metrics format
   */
  async metrics(): Promise<string> {
    const health = await this.detailed();
    const memTotal = os.totalmem();
    const memUsed = memTotal - os.freemem();

    return `
# HELP saraya_uptime_seconds Application uptime in seconds
# TYPE saraya_uptime_seconds gauge
saraya_uptime_seconds ${health.uptime}

# HELP saraya_database_latency_ms Database query latency in milliseconds
# TYPE saraya_database_latency_ms gauge
saraya_database_latency_ms ${health.services.database.latency || 0}

# HELP saraya_database_up Database connection status (1=up, 0=down)
# TYPE saraya_database_up gauge
saraya_database_up ${health.services.database.status === 'up' ? 1 : 0}

# HELP saraya_memory_used_bytes Memory used in bytes
# TYPE saraya_memory_used_bytes gauge
saraya_memory_used_bytes ${memUsed}

# HELP saraya_memory_total_bytes Total memory in bytes
# TYPE saraya_memory_total_bytes gauge
saraya_memory_total_bytes ${memTotal}

# HELP saraya_cpu_cores Number of CPU cores
# TYPE saraya_cpu_cores gauge
saraya_cpu_cores ${os.cpus().length}

# HELP saraya_health_status Health status (1=healthy, 0.5=degraded, 0=unhealthy)
# TYPE saraya_health_status gauge
saraya_health_status ${health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0}
`.trim();
  }

  // ============================================
  // Private helper methods
  // ============================================

  private async checkDatabase(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'up',
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.redisClient.ping();
      return { status: 'up', latency: Date.now() - start };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'Redis ping failed',
      };
    }
  }

  private async checkFhirSubscriptions() {
    try {
      const activeCount = await this.prisma.fhirSubscription.count({
        where: { status: 'active' },
      });
      return { status: 'up' as const, activeCount };
    } catch (error) {
      return {
        status: 'down' as const,
        activeCount: 0,
        error: error instanceof Error ? error.message : 'Database error',
      };
    }
  }

  private getMemoryStatus(): MemoryStatus {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      total: this.formatBytes(total),
      used: this.formatBytes(used),
      free: this.formatBytes(free),
      usagePercent: Math.round((used / total) * 100),
    };
  }

  private getCpuStatus(): CpuStatus {
    const cpus = os.cpus();
    return {
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      loadAverage: os.loadavg(),
    };
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }
}
