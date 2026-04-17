/**
 * Enterprise FHIR Auth Service — Unit Tests
 * 
 * Tests SMART on FHIR scope matching, OAuth2 flows, client validation,
 * and authorization code lifecycle.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { FhirAuthService } from './fhir.auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FhirAuthService', () => {
  let service: FhirAuthService;
  let jwtService: JwtService;

  const mockPrisma = {
    patient: {
      findUnique: jest.fn(),
    },
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
      ],
    }).compile();

    service = module.get<FhirAuthService>(FhirAuthService);
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
        { secret: 'test-secret-key', expiresIn: '1h' }
      );
    }

    it('should allow exact scope match', () => {
      const token = tokenWith('patient/Patient.read');
      const result = service.validateToken(token, 'patient/Patient.read');
      expect(result.scope).toBe('patient/Patient.read');
    });

    it('should allow wildcard resource read: patient/*.read → patient/Patient.read', () => {
      const token = tokenWith('patient/*.read');
      expect(() => service.validateToken(token, 'patient/Patient.read')).not.toThrow();
    });

    it('should allow wildcard resource write: patient/*.write → patient/Observation.write', () => {
      const token = tokenWith('patient/*.write');
      expect(() => service.validateToken(token, 'patient/Observation.write')).not.toThrow();
    });

    it('should allow wildcard all: patient/*.* → patient/Condition.read', () => {
      const token = tokenWith('patient/*.*');
      expect(() => service.validateToken(token, 'patient/Condition.read')).not.toThrow();
      expect(() => service.validateToken(token, 'patient/Observation.write')).not.toThrow();
    });

    it('should allow user/*.read to satisfy patient/*.read (user covers patient)', () => {
      const token = tokenWith('user/*.read');
      expect(() => service.validateToken(token, 'patient/Patient.read')).not.toThrow();
    });

    it('should allow system/*.* to satisfy any scope', () => {
      const token = tokenWith('system/*.*');
      expect(() => service.validateToken(token, 'patient/Patient.read')).not.toThrow();
      expect(() => service.validateToken(token, 'system/Subscription.write')).not.toThrow();
    });

    it('should REJECT: patient/*.read does NOT grant write access', () => {
      const token = tokenWith('patient/*.read');
      expect(() => service.validateToken(token, 'patient/Observation.write'))
        .toThrow(UnauthorizedException);
    });

    it('should REJECT: patient/Patient.read does NOT grant Observation.read', () => {
      const token = tokenWith('patient/Patient.read');
      expect(() => service.validateToken(token, 'patient/Observation.read'))
        .toThrow(UnauthorizedException);
    });

    it('should REJECT: patient/ prefix cannot satisfy system/ requests', () => {
      const token = tokenWith('patient/*.read');
      expect(() => service.validateToken(token, 'system/Subscription.read'))
        .toThrow(UnauthorizedException);
    });

    it('should handle multiple scopes in a single token', () => {
      const token = tokenWith('patient/Patient.read patient/Observation.write system/Subscription.read');
      expect(() => service.validateToken(token, 'patient/Patient.read')).not.toThrow();
      expect(() => service.validateToken(token, 'patient/Observation.write')).not.toThrow();
      expect(() => service.validateToken(token, 'system/Subscription.read')).not.toThrow();
      expect(() => service.validateToken(token, 'patient/Condition.read'))
        .toThrow(UnauthorizedException);
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
      const decoded = realJwtService.verify(result.access_token, { secret: 'test-secret-key' });
      expect(decoded.patient).toBe('42');
    });

    it('should reject non-existent patient', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);

      await expect(
        service.generateToken('client_credentials', 'enterprise_fhir_client', undefined, 'patient/*.read', undefined, '999'),
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
      await service.generateToken('authorization_code', 'enterprise_fhir_client', undefined, undefined, authResult.code);

      // Second exchange: MUST fail
      await expect(
        service.generateToken('authorization_code', 'enterprise_fhir_client', undefined, undefined, authResult.code),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject auth code issued to a different client', async () => {
      const authResult = await service.authorize(
        'enterprise_fhir_client',
        'patient/*.read',
        'http://localhost:3000/callback',
      );

      // Try to exchange with different client
      await expect(
        service.generateToken('authorization_code', 'suspicious_client', undefined, undefined, authResult.code),
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
        service.generateToken('client_credentials', 'enterprise_fhir_client', 'wrong-secret'),
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
    it('should reject expired tokens', () => {
      const token = realJwtService.sign(
        { sub: 'test', scope: 'patient/*.read' },
        { secret: 'test-secret-key', expiresIn: '0s' }
      );

      // Small delay to ensure token expires
      expect(() => service.validateToken(token, 'patient/*.read'))
        .toThrow(UnauthorizedException);
    });

    it('should reject tokens with wrong secret', () => {
      const token = new JwtService({ secret: 'wrong-secret' }).sign(
        { sub: 'test', scope: 'patient/*.read' },
        { expiresIn: '1h' }
      );

      expect(() => service.validateToken(token, 'patient/*.read'))
        .toThrow(UnauthorizedException);
    });

    it('should pass validation without requiredScope (token is valid)', () => {
      const token = realJwtService.sign(
        { sub: 'test', scope: 'patient/*.read' },
        { secret: 'test-secret-key', expiresIn: '1h' }
      );

      const result = service.validateToken(token);
      expect(result.sub).toBe('test');
    });
  });
});
