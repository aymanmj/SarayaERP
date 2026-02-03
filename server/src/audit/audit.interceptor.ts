import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { IS_SENSITIVE_KEY } from './audit.decorator';
import { AuditService } from './audit.service';
import type { JwtPayload } from '../auth/jwt-payload.type';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<any>();
    const user = req.user as JwtPayload | undefined;

    const method = req.method as string;
    const path: string = req.originalUrl ?? req.url;

    // Determine if this operation should be audited
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const sensitiveAnnotation = this.reflector.getAllAndOverride<string | boolean>(
      IS_SENSITIVE_KEY,
      [context.getHandler(), context.getClass()]
    );
    const isSensitiveRead = method === 'GET' && !!sensitiveAnnotation;

    // Skip if not a mutation or sensitive read
    if (!isMutation && !isSensitiveRead) {
      return next.handle();
    }

    const start = Date.now();

    return next.handle().pipe(
      tap(async (responseBody) => {
        const duration = Date.now() - start;
        const { entity, entityId } = this.inferEntityAndId(path, req);

        let actionName = this.getActionName(method, path, isSensitiveRead, sensitiveAnnotation, responseBody);
        
        try {
          await this.audit.log({
            hospitalId: user?.hospitalId ?? null,
            userId: user?.sub ?? null,
            action: actionName,
            entity: entity,
            entityId: entityId,
            ipAddress: this.getClientIP(req),
            clientName: req.headers['user-agent'],
            details: {
              method,
              path,
              statusCode: context.switchToHttp().getResponse().statusCode,
              durationMs: duration,
              accessType: isSensitiveRead ? 'READ_ACCESS' : 'WRITE_ACCESS',
              body: isMutation ? this.sanitizeBody(req.body) : undefined,
              params: req.params,
              query: req.query,
            },
          });
        } catch (err) {
          this.logger.error('Failed to log audit', err);
        }
      }),
    );
  }

  private getActionName(
    method: string,
    path: string,
    isSensitiveRead: boolean,
    sensitiveAnnotation: string | boolean | undefined,
    responseBody: any
  ): string {
    if (isSensitiveRead) {
      return typeof sensitiveAnnotation === 'string' 
        ? sensitiveAnnotation 
        : 'VIEW_SENSITIVE_DATA';
    }

    // Map HTTP methods to action types
    const actionMap: Record<string, string> = {
      'POST': 'CREATE',
      'PUT': 'UPDATE',
      'PATCH': 'UPDATE',
      'DELETE': 'DELETE',
    };

    const baseAction = actionMap[method] || method;
    const entity = this.inferEntityAndId(path, {} as any).entity;
    
    return `${baseAction}_${entity?.toUpperCase() || 'UNKNOWN'}`;
  }

  private inferEntityAndId(path: string, req: any) {
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

  private getClientIP(req: any): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
  }

  private sanitizeBody(body: any) {
    if (!body) return null;
    const copy = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    
    for (const field of sensitiveFields) {
      if (copy[field]) copy[field] = '***';
    }
    
    return copy;
  }
}
