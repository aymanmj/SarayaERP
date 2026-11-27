import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import type { JwtPayload } from '../../auth/jwt-payload.type';

/**
 * واجهة سياق المستأجر
 */
export interface TenantContext {
  hospitalId: number;
  organizationId: number | null;
  isSuperAdmin: boolean;
}

interface RequestWithTenantContext extends Request {
  user?: JwtPayload;
  tenantContext?: TenantContext;
}

/**
 * Tenant Context Middleware
 * يستخرج hospitalId و organizationId من JWT ويحقنهما في كل طلب
 * هذا يضمن أن كل الاستعلامات اللاحقة ستكون محصورة في نطاق المستأجر الصحيح
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  use(req: RequestWithTenantContext, _res: Response, next: NextFunction) {
    const user = req.user;

    if (user) {
      // حقن سياق المستأجر في الطلب
      req.tenantContext = {
        hospitalId: user.hospitalId,
        organizationId: user.organizationId ?? null,
        isSuperAdmin: user.isSuperAdmin ?? false,
      };
    }

    next();
  }
}

/**
 * دالة مساعدة لاستخراج سياق المستأجر من الطلب
 */
export function getTenantContext(req: RequestWithTenantContext): TenantContext {
  return (
    req.tenantContext ?? {
      hospitalId: 0,
      organizationId: null,
      isSuperAdmin: false,
    }
  );
}
