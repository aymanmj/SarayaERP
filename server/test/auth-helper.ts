import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { PrismaClient, User } from '@prisma/client';

export async function testStaffSessionClaims(
  prisma: PrismaClient,
  userId: number,
  hospitalId: number,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { authVersion: true },
  });
  const session = await prisma.staffSession.create({
    data: {
      userId,
      activeBranchId: hospitalId,
      authVersion: user.authVersion,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return {
    sid: session.id,
    branchVersion: session.branchVersion,
    authVersion: user.authVersion,
  };
}

export class AuthHelper {
  constructor(
    private prisma: PrismaClient,
    private jwt: JwtService,
  ) {}

  async createTestUser(
    username = 'testuser',
    password = 'password123',
    options: {
      hospitalId?: number;
      isDoctor?: boolean;
      roles?: string[];
      permissions?: string[];
    } = {},
  ): Promise<{ user: User; accessToken: string }> {
    // 1. Ensure Hospital exists
    let hospital = options.hospitalId
      ? await this.prisma.hospital.findUniqueOrThrow({
          where: { id: options.hospitalId },
        })
      : await this.prisma.hospital.findFirst({ where: { code: 'TEST_HOSP' } });

    if (!hospital) {
      hospital = await this.prisma.hospital.create({
        data: {
          code: 'TEST_HOSP',
          name: 'Test Hospital',
          isActive: true,
        },
      });
    }

    // 2. Create User
    const hash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash: hash,
        fullName: 'Test User',
        hospitalId: hospital.id,
        isActive: true,
        isDoctor: options.isDoctor ?? false,
      },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    // Real persisted grants: JWT claims alone must never authorize E2E requests.
    for (const name of options.roles ?? []) {
      const role = await this.prisma.role.upsert({
        where: { name },
        update: {},
        create: { name, description: 'Synthetic E2E role' },
      });
      await this.prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }
    if (options.permissions?.length) {
      const role = await this.prisma.role.create({
        data: {
          name: `SYNTHETIC_PERMISSIONS_${user.id}`,
          description: 'Per-user synthetic test grants',
        },
      });
      for (const code of [...new Set(options.permissions)]) {
        const permission = await this.prisma.permission.upsert({
          where: { code },
          update: {},
          create: { code },
        });
        await this.prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
      }
      await this.prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }

    // 3. Generate Token
    const payload = {
      ...(await testStaffSessionClaims(this.prisma, user.id, user.hospitalId)),
      sub: user.id,
      username: user.username,
      roles: options.roles ?? [],
      permissions: options.permissions ?? [],
      hospitalId: user.hospitalId,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET || 'PRODUCTION_SECRET_KEY_CHANGE_ME',
      expiresIn: '15m',
      issuer: 'saraya-staff',
    });

    return { user, accessToken };
  }
}
