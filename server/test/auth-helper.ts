import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';

export class AuthHelper {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async createTestUser(
    username = 'testuser',
    password = 'password123',
  ): Promise<{ user: User; accessToken: string }> {
    // 1. Ensure Hospital exists
    let hospital = await this.prisma.hospital.findFirst({
      where: { code: 'TEST_HOSP' },
    });

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
      },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    // 3. Generate Token
    const payload = {
      sub: user.id,
      username: user.username,
      roles: [],
      hospitalId: user.hospitalId,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET || 'PRODUCTION_SECRET_KEY_CHANGE_ME',
      expiresIn: '15m',
    });

    return { user, accessToken };
  }
}
