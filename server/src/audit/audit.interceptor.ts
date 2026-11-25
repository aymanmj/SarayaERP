import type { Request, Response } from 'express';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AUDIT_IN_TRANSACTION_KEY, IS_SENSITIVE_KEY } from './audit.decorator';
import { AuditService } from './audit.service';
import type { JwtPayload } from '../auth/jwt-payload.type';

type AuditedRequest = Request & {
  user?: JwtPayload;
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<AuditedRequest>();
    const user = req.user;

    const method = req.method;
    const path: string = req.originalUrl ?? req.url;

    const sensitiveAnnotation = this.reflector.getAllAndOverride<
      string | boolean
    >(IS_SENSITIVE_KEY, [context.getHandler(), context.getClass()]);
    const isSensitiveRead = method === 'GET' && !!sensitiveAnnotation;

    const isModifyingAction = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
      method,
    );
    const shouldLog = isSensitiveRead || isModifyingAction;

    if (
      !shouldLog ||
      (isModifyingAction &&
        this.reflector.getAllAndOverride<boolean>(AUDIT_IN_TRANSACTION_KEY, [
          context.getHandler(),
        ]))
    ) {
      return next.handle();
    }

    const start = Date.now();

    return next.handle().pipe(
      mergeMap(async (responseBody: unknown) => {
        const duration = Date.now() - start;
        const { entity, entityId } = this.inferEntityAndId(path, req);
        const actionName = this.getActionName(
          method,
          path,
          isSensitiveRead,
          sensitiveAnnotation,
        );

        const cleanPath = (path || '').split('?')[0].replace(/\/+$/, '');
        const isAnonymousQualityIncident =
          method === 'POST' &&
          (cleanPath === '/quality/incidents' ||
            cleanPath.endsWith('/quality/incidents')) &&
          Boolean(
            responseBody &&
              typeof responseBody === 'object' &&
              (responseBody as Record<string, unknown>).isAnonymous === true,
          );

        const rawUserAgent = req.headers?.['user-agent'] as
          | string
          | string[]
          | undefined;
        const clientName: string | undefined = Array.isArray(rawUserAgent)
          ? rawUserAgent[0]
          : rawUserAgent;
        const res = context.switchToHttp().getResponse<Response>();

        try {
          // Await persistence so audit failure reaches the request stream.
          await this.audit.logCritical({
            hospitalId: user?.hospitalId ?? null,
            userId: isAnonymousQualityIncident ? null : (user?.sub ?? null),
            action: actionName,
            entity: entity,
            entityId: entityId,
            ipAddress: isAnonymousQualityIncident
              ? 'ANONYMOUS'
              : this.getClientIP(req),
            clientName: isAnonymousQualityIncident ? 'ANONYMOUS' : clientName,
            details: {
              method,
              path,
              statusCode: res?.statusCode,
              durationMs: duration,
              accessType: isSensitiveRead ? 'READ_ACCESS' : 'WRITE_ACCESS',
              params: req.params,
              query: req.query,
            },
          });
        } catch (err: unknown) {
          this.logger.error('Failed to log sensitive audit', err);
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error('Critical Audit Failure: ' + msg);
        }
        return responseBody;
      }),
    );
  }

  private getActionName(
    method: string,
    _path: string,
    _isSensitiveRead: boolean,
    sensitiveAnnotation: string | boolean | undefined,
  ): string {
    if (typeof sensitiveAnnotation === 'string') {
      return sensitiveAnnotation;
    }
    switch (method) {
      case 'POST':
        return 'CREATE_ENTITY';
      case 'PUT':
      case 'PATCH':
        return 'UPDATE_ENTITY';
      case 'DELETE':
        return 'DELETE_ENTITY';
      default:
        return 'VIEW_SENSITIVE_DATA';
    }
  }

  private inferEntityAndId(path: string, req: AuditedRequest) {
    const cleanPath = path.split('?')[0];
    const segments = cleanPath.split('/').filter(Boolean);

    const entity = segments[0] || 'Unknown';
    let id: number | null = null;

    // Try to extract ID from params or path
    if (req?.params?.id) id = Number(req.params.id);
    else if (req?.params?.patientId) id = Number(req.params.patientId);
    else if (req?.params?.encounterId) id = Number(req.params.encounterId);
    else if (!isNaN(Number(segments[segments.length - 1]))) {
      id = Number(segments[segments.length - 1]);
    }

    return { entity, entityId: id };
  }

  private getClientIP(req: AuditedRequest): string {
    const rawForwarded = req.headers?.['x-forwarded-for'];
    const forwarded = Array.isArray(rawForwarded)
      ? rawForwarded[0]
      : rawForwarded;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private sanitizeBody(
    body: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!body) return null;
    const copy: Record<string, unknown> = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];

    for (const field of sensitiveFields) {
      if (copy[field]) copy[field] = '***';
    }

    return copy;
  }
}
