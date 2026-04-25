import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Tenant Context Middleware
 * يستخرج hospitalId و organizationId من JWT ويحقنهما في كل طلب
 * هذا يضمن أن كل الاستعلامات اللاحقة ستكون محصورة في نطاق المستأجر الصحيح
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  use(req: Request, _res: Response, next: NextFunction) {
    const user = (req as any).user;

    if (user) {
      // حقن سياق المستأجر في الطلب
      (req as any).tenantContext = {
        hospitalId: user.hospitalId,
        organizationId: user.organizationId || null,
        isSuperAdmin: user.isSuperAdmin || false,
      };
    }

    next();
  }
}

/**
 * واجهة سياق المستأجر
 */
export interface TenantContext {
  hospitalId: number;
  organizationId: number | null;
  isSuperAdmin: boolean;
}

/**
 * دالة مساعدة لاستخراج سياق المستأجر من الطلب
 */
export function getTenantContext(req: Request): TenantContext {
  return (req as any).tenantContext || {
    hospitalId: 0,
    organizationId: null,
    isSuperAdmin: false,
  };
}
