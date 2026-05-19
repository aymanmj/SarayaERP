/**
 * Enterprise FHIR Auth Service — Unit Tests
 *
 * Tests SMART on FHIR scope matching, OAuth2 flows, client validation,
 * and authorization code lifecycle.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FhirAuthService } from './fhir.auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FhirAuthService', () => {
  let service: FhirAuthService;
  let jwtService: JwtService;

  const mockPrisma = {
    patient: {
      findUnique: jest.fn(),
    },
    patientOtp: {
      count: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => process.env[key]),
  };

  const mockRedisClient = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  const realJwtService = new JwtService({ secret: 'test-secret-key' });

  beforeEach(async () => {
    // Ensure we're in "dev mode" (no FHIR_CLIENT_SECRET) so client validation is relaxed
    delete process.env.FHIR_CLIENT_SECRET;
    process.env.JWT_SECRET = 'test-secret-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FhirAuthService,
        { provide: JwtService, useValue: realJwtService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<FhirAuthService>(FhirAuthService);
    // Inject mock Redis directly — FhirAuthService creates its own Redis in onModuleInit(),
    // which would fail in test env. Override with our mock.
    (service as any).redisClient = mockRedisClient;
    jwtService = module.get<JwtService>(JwtService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.FHIR_CLIENT_SECRET;
    delete process.env.JWT_SECRET;
  });

  // ===========================================
  // SCOPE MATCHING (scopeSatisfies via validateToken)
  // ===========================================
  describe('Scope Matching', () => {
    // Helper: create a token with specific scope
    function tokenWith(scope: string) {
      return realJwtService.sign(
        { sub: 'test', scope, client_id: 'test' },
        { secret: 'test-secret-key', expiresIn: '1h' },
      );
    }

    it('should allow exact scope match', async () => {
      const token = tokenWith('patient/Patient.read');
      const result = await service.validateToken(token, 'patient/Patient.read');
      expect(result.scope).toBe('patient/Patient.read');
    });

    it('should allow wildcard resource read: patient/*.read → patient/Patient.read', async () => {
      const token = tokenWith('patient/*.read');
      await service.validateToken(token, 'patient/Patient.read');
    });

    it('should allow wildcard resource write: patient/*.write → patient/Observation.write', async () => {
      const token = tokenWith('patient/*.write');
      await service.validateToken(token, 'patient/Observation.write');
    });

    it('should allow wildcard all: patient/*.* → patient/Condition.read', async () => {
      const token = tokenWith('patient/*.*');
      await service.validateToken(token, 'patient/Condition.read');
      await service.validateToken(token, 'patient/Observation.write');
    });

    it('should allow user/*.read to satisfy patient/*.read (user covers patient)', async () => {
      const token = tokenWith('user/*.read');
      await service.validateToken(token, 'patient/Patient.read');
    });

    it('should allow system/*.* to satisfy any scope', async () => {
      const token = tokenWith('system/*.*');
      await service.validateToken(token, 'patient/Patient.read');
      await service.validateToken(token, 'system/Subscription.write');
    });

    it('should REJECT: patient/*.read does NOT grant write access', async () => {
      const token = tokenWith('patient/*.read');
      await expect(
        service.validateToken(token, 'patient/Observation.write'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should REJECT: patient/Patient.read does NOT grant Observation.read', async () => {
      const token = tokenWith('patient/Patient.read');
      await expect(
        service.validateToken(token, 'patient/Observation.read'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should REJECT: patient/ prefix cannot satisfy system/ requests', async () => {
      const token = tokenWith('patient/*.read');
      await expect(
        service.validateToken(token, 'system/Subscription.read'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle multiple scopes in a single token', async () => {
      const token = tokenWith(
        'patient/Patient.read patient/Observation.write system/Subscription.read',
      );
      await service.validateToken(token, 'patient/Patient.read');
      await service.validateToken(token, 'patient/Observation.write');
      await service.validateToken(token, 'system/Subscription.read');
      await expect(
        service.validateToken(token, 'patient/Condition.read'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ===========================================
  // TOKEN GENERATION (OAuth2 Flows)
  // ===========================================
  describe('Token Generation — client_credentials', () => {
    it('should generate a token with client_credentials grant', async () => {
      const result = await service.generateToken(
        'client_credentials',
        'enterprise_fhir_client',
        undefined,
        'patient/*.read',
      );

      expect(result).toBeDefined();
      expect(result.access_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(3600);
      expect(result.scope).toBe('patient/*.read');
      expect(result.patient).toBeUndefined(); // No patient context without explicit parameter
    });

    it('should inject patient context when provided', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 42 });

      const result = await service.generateToken(
        'client_credentials',
        'enterprise_fhir_client',
        undefined,
        'patient/*.read',
        undefined,
        '42',
      );

      expect(result.patient).toBe('42');

      // Verify the token contains patient claim
      const decoded = realJwtService.verify(result.access_token, {
        secret: 'test-secret-key',
      });
      expect(decoded.patient).toBe('42');
    });

    it('should reject non-existent patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.generateToken(
          'client_credentials',
          'enterprise_fhir_client',
          undefined,
          'patient/*.read',
          undefined,
          '999',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unknown client_id', async () => {
      await expect(
        service.generateToken('client_credentials', 'unknown_client'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ===========================================
  // AUTHORIZATION CODE FLOW
  // ===========================================
  describe('Authorization Code Flow', () => {
    it('should issue an auth code via authorize()', async () => {
      const result = await service.authorize(
        'enterprise_fhir_client',
        'patient/*.read',
        'http://localhost:3000/callback',
        '1',
      );

      expect(result).toBeDefined();
      expect(result.code).toBeDefined();
      expect(result.code).toMatch(/^auth_/);
    });

    it('should exchange auth code for token', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 1 });

      // Step 1: Get auth code
      const authResult = await service.authorize(
        'enterprise_fhir_client',
        'patient/*.read',
        'http://localhost:3000/callback',
        '1',
      );

      // Step 2: Exchange code for token
      mockRedisClient.get.mockResolvedValue(
        JSON.stringify({
          clientId: 'enterprise_fhir_client',
          scope: 'patient/*.read',
          patient: '1',
        }),
      );

      const tokenResult = await service.generateToken(
        'authorization_code',
        'enterprise_fhir_client',
        undefined,
        undefined,
        authResult.code,
      );

      expect(tokenResult.access_token).toBeDefined();
      expect(tokenResult.scope).toBe('patient/*.read');
      expect(tokenResult.patient).toBe('1');
    });

    it('should reject reused auth code (one-time use)', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 1 });

      const authResult = await service.authorize(
        'enterprise_fhir_client',
        'patient/*.read',
        'http://localhost:3000/callback',
        '1',
      );

      // First exchange: success
      mockRedisClient.get.mockResolvedValueOnce(
        JSON.stringify({
          clientId: 'enterprise_fhir_client',
          scope: 'patient/*.read',
          patient: '1',
        }),
      );
      await service.generateToken(
        'authorization_code',
        'enterprise_fhir_client',
        undefined,
        undefined,
        authResult.code,
      );

      // Second exchange: MUST fail
      mockRedisClient.get.mockResolvedValueOnce(null);
      await expect(
        service.generateToken(
          'authorization_code',
          'enterprise_fhir_client',
          undefined,
          undefined,
          authResult.code,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject auth code issued to a different client', async () => {
      const authResult = await service.authorize(
        'enterprise_fhir_client',
        'patient/*.read',
        'http://localhost:3000/callback',
      );

      // Try to exchange with different client
      mockRedisClient.get.mockResolvedValue(
        JSON.stringify({
          clientId: 'enterprise_fhir_client',
          scope: 'patient/*.read',
        }),
      );
      await expect(
        service.generateToken(
          'authorization_code',
          'suspicious_client',
          undefined,
          undefined,
          authResult.code,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject missing redirect_uri in authorize', async () => {
      await expect(
        service.authorize('enterprise_fhir_client', 'patient/*.read', ''),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================
  // CLIENT SECRET ENFORCEMENT (Production Mode)
  // ===========================================
  describe('Client Secret Validation (Production Mode)', () => {
    beforeEach(() => {
      process.env.FHIR_CLIENT_SECRET = 'super-secret-123';
    });

    afterEach(() => {
      delete process.env.FHIR_CLIENT_SECRET;
    });

    it('should reject missing client_secret in production mode', async () => {
      await expect(
        service.generateToken('client_credentials', 'enterprise_fhir_client'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject wrong client_secret in production mode', async () => {
      await expect(
        service.generateToken(
          'client_credentials',
          'enterprise_fhir_client',
          'wrong-secret',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept correct client_secret in production mode', async () => {
      const result = await service.generateToken(
        'client_credentials',
        'enterprise_fhir_client',
        'super-secret-123',
        'system/*.read',
      );
      expect(result.access_token).toBeDefined();
    });
  });

  // ===========================================
  // TOKEN VALIDATION
  // ===========================================
  describe('Token Validation', () => {
    it('should reject expired tokens', async () => {
      const token = realJwtService.sign(
        { sub: 'test', scope: 'patient/*.read' },
        { secret: 'test-secret-key', expiresIn: '0s' },
      );

      await expect(
        service.validateToken(token, 'patient/*.read'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject tokens with wrong secret', async () => {
      const token = new JwtService({ secret: 'wrong-secret' }).sign(
        { sub: 'test', scope: 'patient/*.read' },
        { expiresIn: '1h' },
      );

      await expect(
        service.validateToken(token, 'patient/*.read'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should pass validation without requiredScope (token is valid)', async () => {
      const token = realJwtService.sign(
        { sub: 'test', scope: 'patient/*.read' },
        { secret: 'test-secret-key', expiresIn: '1h' },
      );

      const result = await service.validateToken(token);
      expect(result.sub).toBe('test');
    });

    it('should REJECT mpi_consent token if blacklisted in Redis', async () => {
      const token = realJwtService.sign(
        {
          sub: '123',
          type: 'mpi_consent',
          patient: '123',
          scope: 'patient/*.read',
          client_id: 'org_456',
        },
        { secret: 'test-secret-key', expiresIn: '1h' },
      );

      mockRedisClient.get.mockImplementation(async (key: string) => {
        if (key.includes('blacklist:patient:consent:123')) return 'true';
        return null;
      });

      await expect(service.validateToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should REJECT mpi_consent token if database fallback has no verified OTP', async () => {
      const token = realJwtService.sign(
        {
          sub: '123',
          type: 'mpi_consent',
          patient: '123',
          scope: 'patient/*.read',
          client_id: 'org_456',
        },
        { secret: 'test-secret-key', expiresIn: '1h' },
      );

      mockRedisClient.get.mockRejectedValue(
        new Error('Redis connection error'),
      );
      mockPrisma.patientOtp.count.mockResolvedValue(0);

      await expect(service.validateToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should ACCEPT mpi_consent token if database fallback has a verified OTP', async () => {
      const token = realJwtService.sign(
        {
          sub: '123',
          type: 'mpi_consent',
          patient: '123',
          scope: 'patient/*.read',
          client_id: 'org_456',
        },
        { secret: 'test-secret-key', expiresIn: '1h' },
      );

      mockRedisClient.get.mockRejectedValue(
        new Error('Redis connection error'),
      );
      mockPrisma.patientOtp.count.mockResolvedValue(1);

      const result = await service.validateToken(token);
      expect(result.patient).toBe('123');
    });
  });
});
