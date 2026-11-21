import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { JwtPayload } from './jwt-payload.type';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (request.user?.isSuperAdmin !== true) {
      throw new ForbiddenException('هذه العملية متاحة لإدارة المنصة فقط');
    }
    return true;
  }
}
