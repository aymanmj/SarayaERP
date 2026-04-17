/**
 * Auth Service — Unit Tests
 * 
 * Tests login flow, password verification, token generation,
 * refresh token rotation, and reuse detection.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;

  const TEST_SECRET = 'test-jwt-secret';
  const PASSWORD = 'securePass123';
  let passwordHash: string;

  const mockUser = (overrides: any = {}) => ({
    id: 1,
    username: 'admin',
    passwordHash,
    isActive: true,
    hospitalId: 1,
    hospital: { id: 1, isActive: true, name: 'Saraya Hospital' },
    userRoles: [
      {
        role: {
          name: 'ADMIN',
          rolePermissions: [
            { permission: { code: 'VIEW_PATIENTS' } },
            { permission: { code: 'EDIT_PATIENTS' } },
          ],
        },
      },
    ],
    ...overrides,
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: new JwtService({ secret: TEST_SECRET }) },
        { 
          provide: ConfigService, 
          useValue: { get: jest.fn().mockReturnValue(TEST_SECRET) } 
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  // ===========================================
  //  LOGIN FLOW
  // ===========================================
  describe('login', () => {
    it('should authenticate valid credentials and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());
      prisma.refreshToken.create.mockResolvedValue({ id: 1 });

      const result = await service.login('admin', PASSWORD);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('admin');
      expect(result.user.roles).toEqual(['ADMIN']);
      expect(result.user.permissions).toContain('VIEW_PATIENTS');
    });

    it('should reject wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());

      await expect(service.login('admin', 'wrongPassword'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('ghost', PASSWORD))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject disabled user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ isActive: false }));

      await expect(service.login('admin', PASSWORD))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject user from disabled hospital', async () => {
      prisma.user.findUnique.mockResolvedValue(
        mockUser({ hospital: { id: 1, isActive: false } }),
      );

      await expect(service.login('admin', PASSWORD))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ===========================================
  //  ACCESS TOKEN VERIFICATION
  // ===========================================
  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const jwtService = new JwtService({ secret: TEST_SECRET });
      const token = jwtService.sign({ sub: 1, username: 'admin' }, { expiresIn: '15m' });

      const result = await service.verifyToken(token);
      expect(result).toBeDefined();
      expect(result.sub).toBe(1);
    });

    it('should return null for invalid token', async () => {
      const result = await service.verifyToken('invalid.token.here');
      expect(result).toBeNull();
    });
  });

  // ===========================================
  //  REFRESH TOKEN FLOW
  // ===========================================
  describe('refreshTokens', () => {
    it('should reject missing refresh token', async () => {
      await expect(service.refreshTokens(''))
        .rejects.toThrow(ForbiddenException);
    });

    it('should reject malformed refresh token', async () => {
      await expect(service.refreshTokens('not-a-valid-format'))
        .rejects.toThrow(ForbiddenException);
    });

    it('should reject non-existent refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('999.sometoken'))
        .rejects.toThrow(ForbiddenException);
    });

    it('should reject revoked token (reuse detection)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        hashedToken: 'hash',
        revoked: true,
        replacedByToken: null,
        expiresAt: new Date(Date.now() + 86400000),
        user: mockUser(),
      });

      await expect(service.refreshTokens('1.sometoken'))
        .rejects.toThrow(ForbiddenException);

      // Should revoke ALL user tokens (security measure)
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        data: { revoked: true },
      });
    });
  });

  // ===========================================
  //  ROLE & PERMISSION EXTRACTION
  // ===========================================
  describe('validateUser', () => {
    it('should extract roles and permissions correctly', async () => {
      const multiRoleUser = mockUser({
        userRoles: [
          {
            role: {
              name: 'DOCTOR',
              rolePermissions: [
                { permission: { code: 'VIEW_PATIENTS' } },
                { permission: { code: 'WRITE_PRESCRIPTIONS' } },
              ],
            },
          },
          {
            role: {
              name: 'ADMIN',
              rolePermissions: [
                { permission: { code: 'VIEW_PATIENTS' } }, // duplicate
                { permission: { code: 'MANAGE_USERS' } },
              ],
            },
          },
        ],
      });

      prisma.user.findUnique.mockResolvedValue(multiRoleUser);

      const result = await service.validateUser('admin', PASSWORD);

      expect(result.roles).toEqual(['DOCTOR', 'ADMIN']);
      // Permissions should be deduplicated
      expect(result.permissions).toContain('VIEW_PATIENTS');
      expect(result.permissions).toContain('WRITE_PRESCRIPTIONS');
      expect(result.permissions).toContain('MANAGE_USERS');
      // No duplicates
      expect(result.permissions.filter((p: string) => p === 'VIEW_PATIENTS')).toHaveLength(1);
    });
  });
});
