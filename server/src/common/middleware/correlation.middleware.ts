/**
 * Request Correlation Middleware
 * 
 * Assigns a unique X-Request-Id (UUID v4) to every incoming HTTP request.
 * This ID is propagated through:
 *  - Request headers (for downstream use)
 *  - Response headers (for client-side tracing)
 *  - AsyncLocalStorage (for access from any module without DI)
 * 
 * Enterprise healthcare systems MUST support request tracing for:
 *  - Audit trails (Who accessed what, when?)
 *  - Debugging production issues (correlate logs across microservices)
 *  - Compliance reporting (HIPAA audit requirements)
 *  - Incident investigation (track the full lifecycle of any request)
 * 
 * @example
 * // Access the correlation ID from anywhere:
 * import { getRequestId } from './correlation.middleware';
 * const requestId = getRequestId(); // UUID or 'no-context'
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

// AsyncLocalStorage instance — available globally
const requestStore = new AsyncLocalStorage<Map<string, string>>();

/**
 * Get the current request's correlation ID.
 * Safe to call from any context — returns 'no-context' if outside a request lifecycle.
 */
export function getRequestId(): string {
  return requestStore.getStore()?.get('requestId') || 'no-context';
}

/**
 * Get any value from the current request's store.
 */
export function getRequestStore(): Map<string, string> | undefined {
  return requestStore.getStore();
}

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Use existing X-Request-Id from upstream proxy/gateway, or generate a new one
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    // Set on response header so clients can reference it
    res.setHeader('X-Request-Id', requestId);

    // Also set on request for downstream middleware/interceptors
    req.headers['x-request-id'] = requestId;

    // Create a request-scoped store with AsyncLocalStorage
    const store = new Map<string, string>();
    store.set('requestId', requestId);
    store.set('method', req.method);
    store.set('path', req.originalUrl || req.url);
    store.set('startTime', Date.now().toString());

    // Extract userId from JWT if present (for audit correlation)
    const user = (req as any).user;
    if (user?.sub) {
      store.set('userId', String(user.sub));
    }

    // Run the rest of the request inside the AsyncLocalStorage context
    requestStore.run(store, () => {
      next();
    });
  }
}
