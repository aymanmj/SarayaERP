
import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { JwtPayload } from './jwt-payload.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) {
       return false;
    }

    // ✅ ADMIN role has full access - bypass all permission checks
    if (user.roles?.includes('ADMIN')) {
      return true;
    }

    // ✅ ADMIN_FULL_ACCESS permission grants access to everything
    if (user.permissions?.includes('ADMIN_FULL_ACCESS')) {
      return true;
    }

    if (!user.permissions) {
       console.warn(`User ${user?.sub} has no permissions attached.`);
       return false;
    }

    const hasPermission = requiredPermissions.some((permission) =>
      user.permissions.includes(permission),
    );
    
    if (!hasPermission) {
        throw new ForbiddenException(`Missing required permission: ${requiredPermissions.join(', ')}`);
    }

    return true;
  }
}
