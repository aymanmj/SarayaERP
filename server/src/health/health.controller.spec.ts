import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { HealthService } from './health.service';
import type { ConnectivityService } from '../common/services/connectivity.service';

describe('HealthController (Readiness 503 Semantics)', () => {
  it('returns readiness payload when DB and Redis are up', async () => {
    const healthService = {
      ready: jest.fn().mockResolvedValue({
        ready: true,
        checks: { database: true, redis: true },
      }),
    } as unknown as HealthService;

    const controller = new HealthController(
      healthService,
      {} as ConnectivityService,
    );

    await expect(controller.getReadiness()).resolves.toEqual({
      ready: true,
      checks: { database: true, redis: true },
    });
  });

  it('throws 503 ServiceUnavailableException when DB or Redis is down', async () => {
    const healthService = {
      ready: jest.fn().mockResolvedValue({
        ready: false,
        checks: { database: true, redis: false },
      }),
    } as unknown as HealthService;

    const controller = new HealthController(
      healthService,
      {} as ConnectivityService,
    );

    await expect(controller.getReadiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
