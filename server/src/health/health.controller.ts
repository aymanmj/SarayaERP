// src/health/health.controller.ts
// Enhanced Health Check Controller for Monitoring

import { Controller, Get, Header } from '@nestjs/common';
import { HealthService } from './health.service';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  /**
   * Basic health check (for load balancers)
   * GET /health
   */
  @Public()
  @Get()
  async getHealth() {
    return this.healthService.check();
  }

  /**
   * Detailed health check (for monitoring dashboards)
   * GET /health/detailed
   */
  @Public()
  @Get('detailed')
  async getDetailedHealth() {
    return this.healthService.detailed();
  }

  /**
   * Kubernetes readiness probe
   * GET /health/ready
   */
  @Public()
  @Get('ready')
  async getReadiness() {
    return this.healthService.ready();
  }

  /**
   * Kubernetes liveness probe
   * GET /health/live
   */
  @Public()
  @Get('live')
  async getLiveness() {
    return this.healthService.live();
  }

  /**
   * Prometheus metrics endpoint
   * GET /health/metrics
   */
  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.healthService.metrics();
  }
}

