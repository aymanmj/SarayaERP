/**
 * Patient Portal — Auth Guard Security Tests
 * 
 * Tests negative cases:
 * - Staff token (wrong role) → REJECTED
 * - Refresh token (wrong type) → REJECTED
 * - Missing hospitalId → REJECTED
 * - Missing sub → REJECTED
 * - Wrong audience → REJECTED
 * - Expired token → REJECTED
 * - Valid patient access token → ACCEPTED
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { PatientAuthGuard } from './auth/patient-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('PatientAuthGuard — Security Hardening', () => {
  let guard: PatientAuthGuard;
  let jwtService: JwtService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  const createMockContext = (authHeader?: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          authorization: authHeader,
        },
      }),
    }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientAuthGuard,
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<PatientAuthGuard>(PatientAuthGuard);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should REJECT request with no token', async () => {
    const ctx = createMockContext(undefined);
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should REJECT request with non-Bearer scheme', async () => {
    const ctx = createMockContext('Basic abc123');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should ACCEPT valid patient access token', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 1,
      mrn: 'MRN-001',
      hospitalId: 1,
      role: 'PATIENT',
      type: 'access',
      aud: 'patient-portal',
    });

    const ctx = createMockContext('Bearer valid-token');
    const result = await guard.canActivate(ctx as any);
    expect(result).toBe(true);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  NEGATIVE SECURITY TESTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it('should REJECT staff token (role = ADMIN)', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 1,
      hospitalId: 1,
      role: 'ADMIN', // Staff role
      type: 'access',
    });

    const ctx = createMockContext('Bearer staff-token');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should REJECT staff token (role = DOCTOR)', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 5,
      hospitalId: 1,
      role: 'DOCTOR',
      type: 'access',
    });

    const ctx = createMockContext('Bearer doctor-token');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should REJECT refresh token (type = refresh)', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 1,
      hospitalId: 1,
      role: 'PATIENT',
      type: 'refresh', // Wrong type
    });

    const ctx = createMockContext('Bearer refresh-token');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should REJECT token without sub', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      hospitalId: 1,
      role: 'PATIENT',
      type: 'access',
      // missing sub
    });

    const ctx = createMockContext('Bearer incomplete-token');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should REJECT token without hospitalId', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 1,
      role: 'PATIENT',
      type: 'access',
      // missing hospitalId
    });

    const ctx = createMockContext('Bearer no-hospital-token');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should REJECT token with wrong audience', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 1,
      hospitalId: 1,
      role: 'PATIENT',
      type: 'access',
      aud: 'admin-panel', // Wrong audience
    });

    const ctx = createMockContext('Bearer wrong-aud-token');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should REJECT expired/invalid JWT', async () => {
    (jwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error('jwt expired'));

    const ctx = createMockContext('Bearer expired-token');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });

  it('should REJECT token without aud (no backward compatibility)', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 1,
      mrn: 'MRN-001',
      hospitalId: 1,
      role: 'PATIENT',
      type: 'access',
      // No aud — REJECTED: all portal tokens must carry aud
    });

    const ctx = createMockContext('Bearer valid-no-aud');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(UnauthorizedException);
  });
});
