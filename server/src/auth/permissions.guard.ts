import { CanActivate, ExecutionContext, Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { JwtPayload } from './jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
      private reflector: Reflector,
      private prisma: PrismaService
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
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

    const hasPermission = requiredPermissions.some((permission) =>
      user.permissions?.includes(permission),
    );
    
    if (hasPermission) return true;

    // FALLBACK: Check Database for fresh permissions
    // This handles stale tokens or recently added permissions
    this.logger.warn(`Permission missing in token for user ${user.username} (ID: ${user.sub}). Checking DB...`);
    
    try {
        const userId = Number(user.sub);
        if (isNaN(userId)) {
            this.logger.error(`Invalid User ID in token: ${user.sub}`);
            throw new ForbiddenException('Invalid User ID');
        }

        const fullUser = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                userRoles: {
                    include: {
                        role: { include: { rolePermissions: { include: { permission: true } } } }
                    }
                }
            }
        });

        if (fullUser) {
            const dbPermissions = new Set(
                fullUser.userRoles.flatMap((ur) =>
                  ur.role.rolePermissions.map((rp) => rp.permission.code),
                ),
            );
            
            this.logger.log(`DB Query Success. User ${user.username} has ${dbPermissions.size} permissions in DB.`);
            
            const hasDbPermission = requiredPermissions.some((permission) => 
                dbPermissions.has(permission)
            );

            if (hasDbPermission) {
                this.logger.log(`✅ Allowed access via DB fallback for ${user.username} (Permission found)`);
                return true;
            } else {
                this.logger.warn(`❌ DB fallback: Permission ${requiredPermissions} NOT found in DB either.`);
                this.logger.debug(`DB Permissions: ${Array.from(dbPermissions).join(', ')}`);
            }
        } else {
             this.logger.error(`❌ DB fallback: User not found with ID ${userId}`);
        }
    } catch (error) {
        this.logger.error('Error checking DB permissions', error);
    }
    
    // DEBUG LOGGING
    this.logger.warn(`[PermissionsGuard] User: ${user.username}, Roles: ${user.roles}`);
    this.logger.warn(`[PermissionsGuard] Required: ${requiredPermissions}`);
    this.logger.warn(`[PermissionsGuard] Has in Token: ${JSON.stringify(user.permissions)}`);
    
    throw new ForbiddenException(`Missing required permission: ${requiredPermissions.join(', ')}`);
  }
}
