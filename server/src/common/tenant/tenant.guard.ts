import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantService } from './tenant.service';

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
    const request = context.switchToHttp().getRequest();
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
      `⚠️ محاولة وصول غير مصرح بها: المستخدم ${user.userId} حاول الوصول لمستشفى ${requestedHospitalId}`,
    );

    throw new ForbiddenException(
      'ليس لديك صلاحية الوصول لهذا المستشفى',
    );
  }

  /**
   * استخراج hospitalId من الطلب (params, query, أو body)
   */
  private extractHospitalId(request: any): number | null {
    const fromParams = request.params?.hospitalId;
    if (fromParams) return Number(fromParams);

    const fromQuery = request.query?.hospitalId;
    if (fromQuery) return Number(fromQuery);

    const fromBody = request.body?.hospitalId;
    if (fromBody) return Number(fromBody);

    return null;
  }
}
