import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantService } from './tenant.service';
import type { JwtPayload } from '../../auth/jwt-payload.type';

interface TenantRequestUser extends JwtPayload {
  userId?: number;
}

interface TenantRequest {
  user?: TenantRequestUser;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

/**
 * حارس التحقق من صلاحيات الوصول عبر المؤسسات
 * يتحقق أن المستخدم يملك صلاحية الوصول للمؤسسة/المستشفى المطلوب
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private tenantService: TenantService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const user = request.user;

    if (!user) return false;

    // SuperAdmin يمكنه الوصول لكل شيء
    if (user.isSuperAdmin) return true;

    // استخراج hospitalId المطلوب من الطلب
    const requestedHospitalId = this.extractHospitalId(request);

    if (!requestedHospitalId) return true; // لا يوجد hospitalId في الطلب

    // التحقق: هل المستخدم ينتمي لهذا المستشفى؟
    if (user.hospitalId === requestedHospitalId) return true;

    // التحقق: هل المستشفى المطلوب ينتمي لنفس المؤسسة؟
    if (user.organizationId) {
      const allowedIds = await this.tenantService.getOrganizationHospitalIds(
        user.organizationId,
      );
      if (allowedIds.includes(requestedHospitalId)) return true;
    }

    this.logger.warn(
      `⚠️ محاولة وصول غير مصرح بها: المستخدم ${user.sub ?? user.userId ?? 'unknown'} حاول الوصول لمستشفى ${requestedHospitalId}`,
    );

    throw new ForbiddenException('ليس لديك صلاحية الوصول لهذا المستشفى');
  }

  /**
   * استخراج hospitalId من الطلب (params, query, أو body)
   */
  private extractHospitalId(request: TenantRequest): number | null {
    const fromParams = request.params?.hospitalId;
    if (fromParams) return Number(fromParams);

    const fromQuery = request.query?.hospitalId;
    if (typeof fromQuery === 'string' || typeof fromQuery === 'number') {
      return Number(fromQuery);
    }

    const fromBody = request.body?.hospitalId;
    if (typeof fromBody === 'string' || typeof fromBody === 'number') {
      return Number(fromBody);
    }

    return null;
  }
}
