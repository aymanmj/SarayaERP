import {
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // التحقق من المستخدم (تسجيل الدخول)
  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        hospital: true,
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!user || !user.isActive)
      throw new UnauthorizedException('بيانات غير صحيحة');
    if (!user.hospital?.isActive)
      throw new UnauthorizedException('المنشأة غير مفعلة');

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException('بيانات غير صحيحة');

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    );

    return { ...user, roles, permissions };
  }

  // توليد Access Token
  async generateAccessToken(user: any) {
    const payload = {
      sub: user.id,
      username: user.username,
      roles: user.roles,
      hospitalId: user.hospitalId,
      permissions: user.permissions,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '15m',
    });
  }

  // التحقق من التوكن
  async verifyToken(token: string) {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      return null;
    }
  }

  // توليد Refresh Token (Opaque Token stored in DB)
  async generateRefreshToken(userId: number) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(token, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        hashedToken: hash,
        expiresAt,
      },
    });

    // Return format: id.token (allows efficient lookup)
    return `${record.id}.${token}`;
  }

  // تسجيل الدخول الكامل
  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    const accessToken = await this.generateAccessToken({
      id: user.id,
      username: user.username,
      roles: user.roles,
      hospitalId: user.hospitalId,
      permissions: user.permissions,
    });
    const refreshToken = await this.generateRefreshToken(user.id);

    return { accessToken, refreshToken, user };
  }

  // تسجيل الخروج (Revoke specific token)
  async logout(userId: number, refreshToken?: string) {
    if (refreshToken) {
      const [id] = refreshToken.split('.');
      if (id && !isNaN(Number(id))) {
        await this.prisma.refreshToken.updateMany({
          where: { id: Number(id) },
          data: { revoked: true },
        });
      }
    } else {
       // Fallback: revoke all sessions or just return?
       // Ideally we revoke the one from the cookie.
    }
    return true;
  }

  // تجديد التوكن
  async refreshTokens(incomingRt: string) {
    if (!incomingRt) throw new ForbiddenException('Access Denied');

    const [idStr, token] = incomingRt.split('.');
    const id = Number(idStr);

    if (isNaN(id) || !token) throw new ForbiddenException('Invalid Token Format');

    const rtRecord = await this.prisma.refreshToken.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: { rolePermissions: { include: { permission: true } } },
                },
              },
            },
          },
        },
      },
    });

    // 1. Check if token exists
    if (!rtRecord) throw new ForbiddenException('Token Not Found');

    // 2. Reuse Detection (If revoked or replaced -> Compromised!)
    if (rtRecord.revoked) {
      // 🛡️ Added Grace Period: If the token was rotated in the last 10 seconds, allow it.
      // This handles race conditions when multiple parallel requests trigger refresh.
      const GRACE_PERIOD_MS = 10000;
      const updatedAt = (rtRecord as any).updatedAt as Date | undefined;
      const isRecentlyRotated = 
        rtRecord.replacedByToken === 'ROTATED' && 
        updatedAt &&
        (new Date().getTime() - updatedAt.getTime()) < GRACE_PERIOD_MS;

      if (!isRecentlyRotated) {
        // Real theft or old reuse! Revoke all tokens for this user
        await this.prisma.refreshToken.updateMany({
          where: { userId: rtRecord.userId },
          data: { revoked: true },
        });
        throw new ForbiddenException('Token Reuse Detected - Access Revoked');
      }
      
      // If it IS in the grace period, we should technically return the NEW tokens 
      // but we don't have them easily here without extra DB lookups.
      // However, the client should have already received them from the first request.
      // To break the loop, we can either throw or return a specific signal.
      // For now, let's just throw a slightly different message or allow it to return old-but-valid?
      // Actually, NestJS refresh logic usually just needs to NOT nuke everything.
      throw new ForbiddenException('Refresh Concurrency - Please Wait');
    }

    // 3. Verify Hash
    const isMatch = await bcrypt.compare(token, rtRecord.hashedToken);
    if (!isMatch) throw new ForbiddenException('Invalid Token');

    // 4. Check Expiry
    if (new Date() > rtRecord.expiresAt) {
      await this.prisma.refreshToken.update({
         where: { id },
         data: { revoked: true }
      }); // Mark revoked on expiry cleanup
      throw new ForbiddenException('Token Expired');
    }

    // 5. Rotation: Revoke Old, Create New
    // We mark the old one as revoked/replaced
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revoked: true, replacedByToken: 'ROTATED' },
    });

    const user = rtRecord.user;
    const roles = user.userRoles.map((r) => r.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code),
        ),
      ),
    );

    const newAccessToken = await this.generateAccessToken({
      id: user.id,
      username: user.username,
      roles,
      hospitalId: user.hospitalId,
      permissions,
    });

    const newRefreshToken = await this.generateRefreshToken(user.id);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}


