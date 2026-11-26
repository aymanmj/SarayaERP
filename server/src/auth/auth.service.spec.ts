import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { VaultService } from '../common/vault/vault.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

interface MockUserHospital {
  id: number;
  isActive: boolean;
  name?: string;
  code?: string;
}

interface MockUserRecord {
  id: number;
  username: string;
  passwordHash: string;
  authVersion: number;
  isActive: boolean;
  hospitalId: number;
  hospital: MockUserHospital;
  userRoles: {
    role: {
      name: string;
      rolePermissions: { permission: { code: string } }[];
    };
  }[];
  accessibleHospitals: {
    hospital: {
      id: number;
      code: string;
      name: string;
      isActive: boolean;
    };
    isDefault: boolean;
  }[];
}

interface MockAuthPrisma {
  $transaction: (
    run: (tx: MockAuthPrisma) => Promise<unknown>,
  ) => Promise<unknown>;
  $queryRaw: jest.Mock;
  user: {
    findUnique: jest.Mock;
  };
  hospital: {
    findUnique: jest.Mock;
  };
  staffSession: {
    create: jest.Mock;
    update: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockAuthPrisma;
  let vaultService: { getActiveKeyId: jest.Mock; getKeyOrSecret: jest.Mock };

  const TEST_SECRET = 'test-jwt-secret';
  const sid = randomUUID();
  const mockSession = () => ({
    id: sid,
    userId: 1,
    activeBranchId: 1,
    authVersion: 0,
    branchVersion: 0,
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
  });
  const PASSWORD = 'securePass123';
  let passwordHash: string;

  const mockUser = (
    overrides: Partial<MockUserRecord> = {},
  ): MockUserRecord => ({
    id: 1,
    username: 'admin',
    passwordHash,
    authVersion: 0,
    isActive: true,
    hospitalId: 1,
    hospital: { id: 1, isActive: true, name: 'Saraya Hospital', code: 'SH001' },
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
    accessibleHospitals: [
      {
        hospital: {
          id: 1,
          code: 'SH001',
          name: 'Saraya Hospital',
          isActive: true,
        },
        isDefault: true,
      },
    ],
    ...overrides,
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  beforeEach(async () => {
    const mockPrisma: MockAuthPrisma = {
      $transaction: (
        run: (tx: MockAuthPrisma) => Promise<unknown>,
      ): Promise<unknown> => run(mockPrisma),
      $queryRaw: jest.fn((sql: TemplateStringsArray) =>
        Promise.resolve(
          sql[0].includes('FROM "Hospital"')
            ? [mockUser().hospital]
            : [mockUser()],
        ),
      ),
      user: {
        findUnique: jest.fn(),
      },
      hospital: {
        findUnique: jest.fn(),
      },
      staffSession: {
        create: jest
          .fn()
          .mockImplementation(() => Promise.resolve(mockSession())),
        update: jest
          .fn()
          .mockImplementation(() => Promise.resolve(mockSession())),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    vaultService = {
      getActiveKeyId: jest.fn().mockReturnValue('test-kid'),
      getKeyOrSecret: jest.fn().mockResolvedValue(TEST_SECRET),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: TEST_SECRET }),
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(TEST_SECRET) },
        },
        { provide: VaultService, useValue: vaultService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = mockPrisma;
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

    it('should keep accessToken compact (< 1024 bytes) even with 200+ permissions while returning full user.permissions', async () => {
      const manyPermissions = Array.from({ length: 220 }, (_, idx) => ({
        permission: { code: `module_${idx}:action_${idx}:manage` },
      }));
      prisma.user.findUnique.mockResolvedValue(
        mockUser({
          userRoles: [
            {
              role: {
                name: 'ADMIN',
                rolePermissions: manyPermissions,
              },
            },
          ],
        }),
      );
      prisma.refreshToken.create.mockResolvedValue({ id: 1 });

      const result = await service.login('admin', PASSWORD);

      expect(Buffer.byteLength(result.accessToken, 'utf8')).toBeLessThan(1024);
      expect(result.user.permissions).toHaveLength(220);
      expect(result.user.permissions).toContain('module_0:action_0:manage');
      expect(result.user.permissions).toContain('module_219:action_219:manage');
    });

    it('should reject wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser());

      await expect(service.login('admin', 'wrongPassword')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('ghost', PASSWORD)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject disabled user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ isActive: false }));

      await expect(service.login('admin', PASSWORD)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject user from disabled hospital', async () => {
      prisma.user.findUnique.mockResolvedValue(
        mockUser({ hospital: { id: 1, isActive: false } }),
      );

      await expect(service.login('admin', PASSWORD)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ===========================================
  //  ACCESS TOKEN VERIFICATION
  // ===========================================
  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const jwtService = new JwtService({ secret: TEST_SECRET });
      const token = jwtService.sign(
        { sub: 1, username: 'admin' },
        {
          secret: TEST_SECRET,
          expiresIn: '15m',
          issuer: 'saraya-staff',
          header: { kid: 'test-kid', alg: 'HS256' },
        },
      );

      const result = await service.verifyToken(token);
      expect(result).toBeDefined();
      expect(result?.sub).toBe(1);
    });

    it('should return null when key lookup fails for token verification', async () => {
      const jwtService = new JwtService({ secret: TEST_SECRET });
      const token = jwtService.sign(
        { sub: 1, username: 'admin' },
        {
          secret: TEST_SECRET,
          expiresIn: '15m',
          issuer: 'saraya-staff',
          header: { kid: 'missing-kid', alg: 'HS256' },
        },
      );

      vaultService.getKeyOrSecret.mockRejectedValueOnce(
        new Error('missing key'),
      );

      await expect(service.verifyToken(token)).resolves.toBeNull();
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
    const secret = 'a'.repeat(64);
    let hashedToken: string;
    beforeAll(async () => {
      hashedToken = await bcrypt.hash(secret, 4);
    });

    const ticket = (overrides = {}) => ({
      id: 3,
      userId: 1,
      session: mockSession(),
      activeBranchId: 1,
      authVersion: 0,
      hashedToken,
      revoked: false,
      replacedByToken: null,
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: mockUser(),
      ...overrides,
    });

    it.each(['', 'not-a-valid-format', '1.sometoken'])(
      'rejects malformed refresh tokens',
      async (token) => {
        await expect(service.refreshTokens(token)).rejects.toThrow(
          ForbiddenException,
        );
      },
    );

    it('rejects a missing refresh record', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refreshTokens(`3.${secret}`)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('does not invalidate anyone when the secret does not match a revoked token ID', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        ticket({ revoked: true }),
      );
      await expect(
        service.refreshTokens(`3.${'b'.repeat(64)}`),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rejects revoked or expired credentials without issuing a new token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        ticket({ expiresAt: new Date(0) }),
      );
      await expect(service.refreshTokens(`3.${secret}`)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rotates a valid token and persists its branch and session version', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 7 });
      prisma.refreshToken.findUnique.mockResolvedValue(ticket());
      const rotated = await service.refreshTokens(`3.${secret}`);
      expect(typeof rotated.accessToken).toBe('string');
      expect(rotated.accessToken.length).toBeGreaterThan(0);
      expect(rotated.refreshToken).toMatch(/^7\./);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { revoked: true, replacedByToken: 'ROTATED' },
      });
      const createCalls = prisma.refreshToken.create.mock.calls as [
        {
          data: {
            userId: number;
            activeBranchId: number;
            authVersion: number;
          };
        },
      ][];
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0][0].data).toMatchObject({
        userId: 1,
        activeBranchId: 1,
        authVersion: 0,
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
      expect(
        result.permissions.filter((p: string) => p === 'VIEW_PATIENTS'),
      ).toHaveLength(1);
    });
  });
});
