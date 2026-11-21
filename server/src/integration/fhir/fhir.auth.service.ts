import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { timingSafeEqual } from 'node:crypto';

/**
 * Restricted FHIR authorization service.
 *
 * Currently supports confidential client credentials with:
 * - Registered app validation (client_id + client_secret)
 * - Dynamic patient context binding (no hardcoded IDs)
 * - Full scope parsing including wildcard read/write
 * - A client_credentials grant only. Interactive launch is disabled until
 *   consent, PKCE and redirect validation are implemented and verified.
 *
 * @see https://hl7.org/fhir/smart-app-launch/
 */

// Registered FHIR Applications (in production, this would be a DB table)
interface RegisteredApp {
  clientId: string;
  clientSecret: string; // bcrypt hash or plain for env comparison
  name: string;
  redirectUris: string[];
  grantTypes: ('client_credentials' | 'authorization_code')[];
  defaultScopes: string;
  allowedScopes?: string;
  hospitalId?: number;
}

@Injectable()
export class FhirAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FhirAuthService.name);

  // Redis client for auth codes with TTL
  private redisClient: Redis;

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST') || 'localhost';
    const port = this.config.get<number>('REDIS_PORT') || 6379;
    const password = this.config.get<string>('REDIS_PASSWORD');
    const isMock =
      this.config.get<string>('REDIS_MOCK') === 'true' ||
      process.env.REDIS_MOCK === 'true';

    if (isMock) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('REDIS_MOCK is not allowed in production.');
      }
      const { InMemoryRedis } = require('../../common/in-memory-redis');
      this.redisClient = new InMemoryRedis();
      return;
    }

    try {
      this.redisClient = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redisClient.on('error', (err) => {
        if (process.env.NODE_ENV === 'production') {
          this.logger.error(
            'Redis connection failed in FhirAuthService. Fallback to In-Memory is disabled in production.',
            err,
          );
          return;
        }
        this.logger.warn(
          'Redis connection failed in FhirAuthService. Switching to In-Memory Redis fallback.',
        );
        const { InMemoryRedis } = require('../../common/in-memory-redis');
        this.redisClient = new InMemoryRedis();
      });
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'Failed to initialize Redis in FhirAuthService. Fallback to In-Memory is disabled in production.',
          err,
        );
        throw err;
      }
      this.logger.error(
        'Failed to initialize Redis in FhirAuthService, using In-Memory fallback:',
        err,
      );
      const { InMemoryRedis } = require('../../common/in-memory-redis');
      this.redisClient = new InMemoryRedis();
    }
  }

  onModuleDestroy() {
    if (this.redisClient) {
      try {
        this.redisClient.disconnect();
      } catch (err) {
        // Ignore disconnect errors for mock or already closed connections
      }
    }
  }

  /**
   * Returns the list of registered FHIR apps.
   * In production, this would query a database table.
   * For now, we support env-based configuration + a default dev app.
   */
  private getRegisteredApps(): RegisteredApp[] {
    const apps: RegisteredApp[] = [];

    // Primary enterprise client (configured via environment)
    const envClientId =
      this.config.get<string>('FHIR_CLIENT_ID') || 'enterprise_fhir_client';
    const envClientSecret = this.config.get<string>('FHIR_CLIENT_SECRET');

    apps.push({
      clientId: envClientId,
      clientSecret: envClientSecret || '__dev_secret_must_be_configured__',
      name: 'Enterprise FHIR Client',
      redirectUris: [
        'http://localhost:3000/callback',
        'https://saraya-erp.com/callback',
      ],
      grantTypes: ['client_credentials', 'authorization_code'],
      defaultScopes: 'user/*.read launch/patient',
      allowedScopes:
        this.config.get<string>('FHIR_ALLOWED_SCOPES') ||
        'user/*.read launch/patient',
      hospitalId:
        Number(this.config.get<string>('FHIR_HOSPITAL_ID')) || undefined,
    });

    // Additional registered apps can be added here or loaded from DB
    const extraAppsJson = this.config.get<string>('FHIR_REGISTERED_APPS');
    if (extraAppsJson) {
      try {
        const extra = JSON.parse(extraAppsJson) as RegisteredApp[];
        apps.push(...extra);
      } catch {
        this.logger.warn('FHIR_REGISTERED_APPS env var contains invalid JSON');
      }
    }

    return apps;
  }

  /**
   * Validates client credentials against registered apps.
   * Returns the matched app or throws UnauthorizedException.
   */
  private validateClient(
    clientId: string,
    clientSecret?: string,
  ): RegisteredApp {
    const apps = this.getRegisteredApps();
    const app = apps.find((a) => a.clientId === clientId);

    if (!app) {
      throw new UnauthorizedException(
        `Unknown client_id: ${clientId}. Application must be registered.`,
      );
    }

    // In development mode (no FHIR_CLIENT_SECRET set), skip secret validation
    const isDev =
      ['development', 'test'].includes(
        this.config.get<string>('NODE_ENV') || 'development',
      ) && !this.config.get<string>('FHIR_CLIENT_SECRET');

    if (!isDev) {
      if (
        !clientSecret ||
        !app.clientSecret ||
        app.clientSecret === '__dev_secret_must_be_configured__'
      ) {
        throw new UnauthorizedException(
          'client_secret is required for registered applications',
        );
      }
      const actual = Buffer.from(clientSecret);
      const expected = Buffer.from(app.clientSecret);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        throw new UnauthorizedException('Invalid client_secret');
      }
    }

    return app;
  }

  /**
   * SMART on FHIR Authorize Endpoint
   *
   * In a full EHR launch:
   * 1. Validates the client_id against registered apps
   * 2. Authenticates the user (doctor/nurse) via session
   * 3. Shows consent screen for requested scopes
   * 4. Issues an authorization code bound to the user + patient context
   *
   * Current implementation: validates app registration and issues
   * an auth code with the requested scope and patient context.
   */
  authorize(
    ...request: [
      clientId: string,
      scope: string,
      redirectUri: string,
      launchPatient?: string,
    ]
  ): Promise<{ code: string; state: string }> {
    void request;
    // A separate authenticated consent + PKCE workflow must precede interactive launch.
    return Promise.reject(
      new UnauthorizedException('Interactive SMART launch is not configured'),
    );
  }

  /**
   * SMART Token Endpoint
   *
   * Supports two grant types:
   * - client_credentials: Backend service applications (no user context)
   * - authorization_code: SMART App Launch with user + patient context
   *
   * Dynamic patient context: The patient ID is NOT hardcoded.
   * It must be provided explicitly via the `patient` parameter or
   * inherited from the authorization code's launch context.
   */
  async generateToken(
    grantType: string,
    clientId: string,
    clientSecret?: string,
    scope?: string,
    code?: string,
    patient?: string,
  ) {
    // Validate the client
    const app = this.validateClient(clientId, clientSecret);

    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      (!Number.isSafeInteger(app.hospitalId) ||
        !app.hospitalId ||
        app.hospitalId <= 0)
    ) {
      throw new UnauthorizedException(
        'FHIR application must be assigned to a hospital',
      );
    }

    if (code || grantType !== 'client_credentials') {
      throw new BadRequestException(
        'Only confidential backend client credentials are currently supported',
      );
    }

    if (!app.grantTypes.includes(grantType as any)) {
      throw new BadRequestException(
        `Grant type '${grantType}' not allowed for this application. Allowed: ${app.grantTypes.join(', ')}`,
      );
    }

    const finalScope = scope || app.defaultScopes;
    const allowed = (app.allowedScopes || app.defaultScopes)
      .split(/\s+/)
      .filter(Boolean);
    for (const requested of finalScope.split(/\s+/).filter(Boolean)) {
      if (!this.scopeSatisfies(allowed, requested)) {
        throw new UnauthorizedException(
          'Requested scope exceeds registered application permissions',
        );
      }
    }
    if (
      finalScope.split(/\s+/).some((s) => s.startsWith('patient/')) &&
      !patient
    ) {
      throw new BadRequestException(
        'Patient-scoped access requires a patient context',
      );
    }
    const patientContext: string | undefined = patient;

    // Validate patient exists if context is provided
    if (patientContext) {
      const patientId = parseInt(patientContext);
      if (
        !/^[1-9]\d*$/.test(patientContext) ||
        !Number.isSafeInteger(patientId)
      ) {
        throw new BadRequestException(
          'patient parameter must be a valid numeric ID',
        );
      }
      const exists = await this.prisma.patient.findUnique({
        where: {
          id: patientId,
          ...(app.hospitalId ? { hospitalId: app.hospitalId } : {}),
        },
      });
      if (!exists) {
        throw new BadRequestException(`Patient with ID ${patientId} not found`);
      }
    }

    // Build JWT payload
    const jwtSecret =
      this.config.get<string>('JWT_SECRET') ||
      'fhir-super-secret-key-enterprise';

    const payload: Record<string, any> = {
      iss: 'https://saraya-erp.com/api/fhir',
      sub: clientId,
      aud: 'https://saraya-erp.com/api/fhir',
      client_id: clientId,
      scope: finalScope,
      hospitalId: app.hospitalId,
    };

    // Only inject patient context if explicitly provided — NEVER hardcode
    if (patientContext) {
      payload.patient = patientContext;
    }

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '1h',
      secret: jwtSecret,
    });

    this.logger.log(
      `🔑 FHIR Token issued for ${clientId} | scope: ${finalScope} | patient: ${patientContext || 'NONE (system-level)'}`,
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: finalScope,
      ...(patientContext ? { patient: patientContext } : {}),
    };
  }

  /**
   * Enterprise-grade FHIR Scope Validation.
   *
   * Supports the full SMART v2 scope syntax:
   * - Explicit: patient/Patient.read, patient/Observation.write
   * - Wildcard: patient/*.read, patient/*.write, user/*.read, system/*.write
   * - Combined: user/*.* (full access)
   *
   * Scope prefixes:
   * - patient/ : Access restricted to a specific patient context
   * - user/    : Access based on the authenticated user's permissions
   * - system/  : Backend service access (no user/patient context)
   *
   * @returns Decoded JWT payload with scope and patient context
   */
  async validateToken(token: string, requiredScope?: string) {
    const jwtSecret =
      this.config.get<string>('JWT_SECRET') ||
      'fhir-super-secret-key-enterprise';

    try {
      const decoded = this.jwtService.verify(token, { secret: jwtSecret });

      // Check if it is an MPI consent token and verify it against the blacklist
      if (decoded && decoded.type === 'mpi_consent' && decoded.patient) {
        const patientId = parseInt(decoded.patient);
        const orgId = decoded.client_id?.startsWith('org_')
          ? parseInt(decoded.client_id.replace('org_', ''))
          : undefined;

        const isBlacklisted = await this.isPatientConsentBlacklisted(
          patientId,
          orgId,
        );
        if (isBlacklisted) {
          throw new UnauthorizedException('Patient consent has been revoked');
        }
      }

      if (requiredScope) {
        const grantedScopes: string[] = (decoded.scope || '')
          .split(' ')
          .filter(Boolean);

        if (!this.scopeSatisfies(grantedScopes, requiredScope)) {
          throw new UnauthorizedException(
            `Insufficient scope. Required: "${requiredScope}". Granted: "${decoded.scope}"`,
          );
        }
      }

      return decoded;
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException(e.message || 'Invalid FHIR JWT Token');
    }
  }

  /**
   * Checks if a patient's consent token has been blacklisted in Redis (instant revocation)
   * or falls back to verifying active consent records in the database.
   */
  async isPatientConsentBlacklisted(
    patientId: number,
    orgId?: number,
  ): Promise<boolean> {
    try {
      const globalBlacklist = await this.redisClient.get(
        `blacklist:patient:consent:${patientId}`,
      );
      if (globalBlacklist === 'true') return true;

      if (orgId) {
        const orgBlacklist = await this.redisClient.get(
          `blacklist:patient:consent:${patientId}:org:${orgId}`,
        );
        if (orgBlacklist === 'true') return true;
      }
    } catch (redisErr) {
      this.logger.error(
        'Redis blacklist check failed, falling back to database verification:',
        redisErr,
      );

      // Fallback: Check if there is any active verified OTP for this patient (and org)
      const validConsentCount = await this.prisma.patientOtp.count({
        where: {
          patientId,
          verified: true,
          ...(orgId ? { requestingOrganizationId: orgId } : {}),
        },
      });
      return validConsentCount === 0;
    }
    return false;
  }

  /**
   * Determines if any of the granted scopes satisfy the required scope.
   *
   * Required scope format: "prefix/Resource.action"
   * Examples: "patient/Observation.write", "system/Subscription.read"
   *
   * Matching rules:
   *   patient/Observation.write  satisfies  patient/Observation.write  (exact)
   *   patient/*.write            satisfies  patient/Observation.write  (wildcard resource)
   *   patient/*.*                satisfies  patient/Observation.write  (wildcard all)
   *   user/*.read                satisfies  patient/Patient.read       (user covers patient reads)
   *   system/*.write             satisfies  system/Subscription.write  (system wildcard)
   */
  private scopeSatisfies(
    grantedScopes: string[],
    requiredScope: string,
  ): boolean {
    // Parse the required scope: "prefix/Resource.action"
    const reqMatch = requiredScope.match(
      /^(patient|user|system)\/(\w+|\*)\.(\w+|\*)$/,
    );
    if (!reqMatch) {
      // If required scope doesn't match expected format, do exact string match
      return grantedScopes.includes(requiredScope);
    }

    const [, reqPrefix, reqResource, reqAction] = reqMatch;

    for (const granted of grantedScopes) {
      // Exact match
      if (granted === requiredScope) return true;

      // Parse granted scope
      const grantMatch = granted.match(
        /^(patient|user|system)\/(\w+|\*)\.(\w+|\*)$/,
      );
      if (!grantMatch) continue;

      const [, grantPrefix, grantResource, grantAction] = grantMatch;

      // Check prefix compatibility:
      // - user/* can satisfy patient/* requests (user has broader access)
      // - system/* can satisfy any prefix (system is the broadest)
      // - patient/* can only satisfy patient/* requests
      const prefixOk =
        grantPrefix === reqPrefix ||
        grantPrefix === 'system' ||
        (grantPrefix === 'user' && reqPrefix === 'patient');

      if (!prefixOk) continue;

      // Check resource compatibility: * matches any resource
      const resourceOk = grantResource === '*' || grantResource === reqResource;
      if (!resourceOk) continue;

      // Check action compatibility: * matches any action (read or write)
      const actionOk = grantAction === '*' || grantAction === reqAction;
      if (!actionOk) continue;

      // All three match
      return true;
    }

    return false;
  }
}
