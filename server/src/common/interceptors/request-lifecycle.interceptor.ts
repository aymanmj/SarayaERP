/**
 * Request Lifecycle Interceptor
 * 
 * Enterprise-grade request monitoring that:
 *  1. Measures request duration (X-Response-Time header)
 *  2. Logs slow requests (>2s) as warnings
 *  3. Logs failed requests with full context
 *  4. Correlates all logs with X-Request-Id
 * 
 * This interceptor works with the CorrelationMiddleware to provide
 * full request lifecycle observability.
 * 
 * Performance thresholds:
 *  - Normal:  < 1000ms (no log)
 *  - Warning: >= 2000ms (WARN log)
 *  - Critical: >= 5000ms (ERROR log)
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { getRequestId } from '../middleware/correlation.middleware';

@Injectable()
export class RequestLifecycleInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  // Thresholds in milliseconds
  private readonly WARN_THRESHOLD = 2000;
  private readonly CRITICAL_THRESHOLD = 5000;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<any>();
    const res = httpCtx.getResponse<any>();

    const method = req.method;
    const url = req.originalUrl || req.url;
    const requestId = getRequestId();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;

        // Always set response time header
        if (typeof res.setHeader === 'function') {
          res.setHeader('X-Response-Time', `${duration}ms`);
        }

        // Log based on duration threshold
        if (duration >= this.CRITICAL_THRESHOLD) {
          this.logger.error(
            `🐌 CRITICAL SLOW [${requestId}] ${method} ${url} → ${statusCode} (${duration}ms)`,
          );
        } else if (duration >= this.WARN_THRESHOLD) {
          this.logger.warn(
            `⚠️ SLOW [${requestId}] ${method} ${url} → ${statusCode} (${duration}ms)`,
          );
        }
        // Normal requests: no log (reduce noise). 
        // Enable debug-level logging if needed:
        // else {
        //   this.logger.debug(`[${requestId}] ${method} ${url} → ${statusCode} (${duration}ms)`);
        // }
      }),
      catchError((err) => {
        const duration = Date.now() - start;
        const statusCode = err?.status || err?.getStatus?.() || 500;

        // Set response time even on errors
        if (typeof res.setHeader === 'function') {
          res.setHeader('X-Response-Time', `${duration}ms`);
        }

        // Log all server errors (5xx) with details
        if (statusCode >= 500) {
          this.logger.error(
            `❌ [${requestId}] ${method} ${url} → ${statusCode} (${duration}ms) :: ${err.message}`,
            err.stack,
          );
        }
        // Log client errors (4xx) as warnings (useful for monitoring abuse)
        else if (statusCode >= 400) {
          this.logger.warn(
            `⚡ [${requestId}] ${method} ${url} → ${statusCode} (${duration}ms) :: ${err.message}`,
          );
        }

        return throwError(() => err);
      }),
    );
  }
}
