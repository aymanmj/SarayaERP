import {
  Injectable,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { VaultService } from '../common/vault/vault.service';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './jwt-payload.type';
import {
  hasStaffSessionClaims,
  staffSessionFilter,
} from './staff-session-lock';

type PassportRegistry = {
  use(name: string, strategy: Strategy): unknown;
  unuse(name: string): unknown;
};

@Injectable()
export class JwtStrategy
  extends PassportStrategy(Strategy, 'jwt')
  implements OnModuleDestroy
{
  private static readonly activeInstances: JwtStrategy[] = [];
  declare getPassportInstance: () => PassportRegistry;

  constructor(
    config: ConfigService,
    private readonly cls: ClsService,
    private readonly vaultService: VaultService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null => {
          const cookies = req?.cookies as Record<string, unknown> | undefined;
          const token = cookies?.['Authentication'];
          return typeof token === 'string' ? token : null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      issuer: 'saraya-staff', // Enforce Token Isolation
      secretOrKeyProvider: async (
        _request: Request,
        rawJwtToken: string,
        done: (err: unknown, secretOrKey?: string | Buffer) => void,
      ) => {
        try {
          const decoded = jwt.decode(rawJwtToken, { complete: true });
          const kid =
            decoded &&
            typeof decoded === 'object' &&
            'header' in decoded &&
            typeof decoded.header?.kid === 'string'
              ? decoded.header.kid
              : undefined;
          const secret = await this.vaultService.getKeyOrSecret(kid);
          done(null, secret);
        } catch (error) {
          done(error);
        }
      },
    });
    JwtStrategy.activeInstances.push(this);
  }

  onModuleDestroy() {
    const index = JwtStrategy.activeInstances.lastIndexOf(this);
    if (index === -1) return;
    JwtStrategy.activeInstances.splice(index, 1);
    const passport = this.getPassportInstance();
    const previous =
      JwtStrategy.activeInstances[JwtStrategy.activeInstances.length - 1];
    if (previous) {
      passport.use('jwt', previous);
    } else {
      passport.unuse('jwt');
    }
  }

  async validate(payload: JwtPayload) {
    if (
      !payload ||
      !hasStaffSessionClaims(payload) ||
      !Number.isSafeInteger(payload.sub) ||
      payload.sub <= 0 ||
      !Number.isSafeInteger(payload.hospitalId) ||
      payload.hospitalId <= 0 ||
      !Array.isArray(payload.roles) ||
      !payload.roles.every((role) => typeof role === 'string') ||
      !Array.isArray(payload.permissions) ||
      !payload.permissions.every((permission) => typeof permission === 'string')
    )
      throw new UnauthorizedException('جلسة الدخول غير صالحة');
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        isActive: true,
        isDeleted: false,
        OR: [
          { hospitalId: payload.hospitalId, hospital: { isActive: true } },
          {
            accessibleHospitals: {
              some: {
                hospitalId: payload.hospitalId,
                hospital: { isActive: true },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        username: true,
        authVersion: true,
        hospitalId: true,
        hospital: { select: { isActive: true, organizationId: true } },
        accessibleHospitals: {
          where: {
            hospitalId: payload.hospitalId,
            hospital: { isActive: true },
          },
          select: { hospital: { select: { organizationId: true } } },
        },
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
                rolePermissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!user)
      throw new UnauthorizedException(
        'الحساب أو المنشأة غير نشط أو تغير نطاق الحساب؛ يلزم تسجيل الدخول',
      );
    if (
      !Number.isSafeInteger(payload.authVersion ?? 0) ||
      (payload.authVersion ?? 0) !== (user.authVersion ?? 0)
    )
      throw new UnauthorizedException(
        'ألغيت جلسة الدخول؛يلزم تسجيل الدخول مجددًا',
      );
    const homeBranch = user.hospitalId === payload.hospitalId;
    if (
      homeBranch
        ? !user.hospital.isActive
        : user.accessibleHospitals.length === 0
    )
      throw new UnauthorizedException('المنشأة غير نشطة أو ألغي تصريح الفرع');
    const session = await this.prisma.staffSession.findFirst({
      where: staffSessionFilter(
        payload.sid,
        user.id,
        payload.hospitalId,
        user.authVersion ?? 0,
        payload.branchVersion,
      ),
      select: { id: true },
    });
    if (!session)
      throw new UnauthorizedException('ألغيت جلسة الجهاز أو تغير فرعها');
    const roles = user.userRoles.map(({ role }) => role.name);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap(({ role }) =>
          role.rolePermissions.map(({ permission }) => permission.code),
        ),
      ),
    ];
    const organizationId = homeBranch
      ? user.hospital.organizationId
      : user.accessibleHospitals[0].hospital.organizationId;
    // The signed token proves identity and selected branch, never current privileges.
    const identity: JwtPayload = {
      sid: payload.sid,
      branchVersion: payload.branchVersion,
      authVersion: user.authVersion ?? 0,
      sub: user.id,
      username: user.username,
      hospitalId: payload.hospitalId,
      organizationId: organizationId ?? undefined,
      roles,
      permissions,
      isSuperAdmin: roles.includes('SUPER_ADMIN'),
    };
    if (this.cls.isActive()) {
      this.cls.set('userId', identity.sub);
      this.cls.set('hospitalId', identity.hospitalId);
      this.cls.set('organizationId', identity.organizationId ?? null);
      this.cls.set('isSuperAdmin', identity.isSuperAdmin);
      this.cls.set('user', identity);
    }
    return identity;
  }
}

// import { Injectable } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { ExtractJwt, Strategy } from 'passport-jwt';
// import { ConfigService } from '@nestjs/config';
// import { JwtPayload } from './jwt-payload.type';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor(config: ConfigService) {
//     super({
//       jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
//       ignoreExpiration: false,
//       secretOrKey: config.get<string>('JWT_SECRET'),
//     });
//   }

//   async validate(payload: JwtPayload) {
//     // هنا يرجع كـ request.user
//     return payload;
//   }
// }
