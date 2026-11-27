import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  isCorsOriginAllowed,
  parseConfiguredOrigins,
} from './http-security.config';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXEMPT_PATH_PREFIXES = [
  '/iclock/',
  '/api/patient-portal/v1/telegram/webhook',
  '/patient-portal/v1/telegram/webhook',
  '/api/webhooks/',
  '/webhooks/',
];

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const method = (req.method || 'GET').toUpperCase();
    if (!MUTATION_METHODS.has(method)) {
      return true;
    }

    const urlPath = (req.originalUrl || req.url || '').split('?')[0];
    if (EXEMPT_PATH_PREFIXES.some((prefix) => urlPath.startsWith(prefix))) {
      return true;
    }

    const authHeader = req.headers?.authorization;
    if (
      typeof authHeader === 'string' &&
      authHeader.trim().toLowerCase().startsWith('bearer ')
    ) {
      return true;
    }

    const cookies = req.cookies as Record<string, unknown> | undefined;
    const hasStaffAuthCookie =
      (typeof cookies?.Authentication === 'string' &&
        cookies.Authentication.length > 0) ||
      (typeof cookies?.Refresh === 'string' && cookies.Refresh.length > 0);
    if (!hasStaffAuthCookie) {
      return true;
    }

    const secFetchSite = req.headers?.['sec-fetch-site'];
    if (
      typeof secFetchSite === 'string' &&
      secFetchSite.trim().toLowerCase() === 'cross-site'
    ) {
      throw new ForbiddenException('Cross-site cookie mutation rejected');
    }

    const originHeader =
      typeof req.headers?.origin === 'string' ? req.headers.origin.trim() : '';
    const refererHeader =
      typeof req.headers?.referer === 'string'
        ? req.headers.referer.trim()
        : '';

    let candidateOrigin = originHeader;
    if (!candidateOrigin && refererHeader) {
      try {
        candidateOrigin = new URL(refererHeader).origin;
      } catch {
        throw new ForbiddenException('Invalid request referer origin');
      }
    }

    if (!candidateOrigin) {
      return true;
    }

    const hostHeader =
      typeof req.headers?.host === 'string' ? req.headers.host.trim() : '';
    if (hostHeader) {
      try {
        if (new URL(candidateOrigin).host === hostHeader) {
          return true;
        }
      } catch {
        throw new ForbiddenException('Invalid request origin');
      }
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const configuredOrigins = parseConfiguredOrigins(
      process.env.CORS_ORIGINS || process.env.CORS_ORIGIN,
    );
    const check = isCorsOriginAllowed(candidateOrigin, {
      isProduction,
      configuredOrigins,
    });
    if (!check.allowed) {
      throw new ForbiddenException('Invalid request origin');
    }

    return true;
  }
}
