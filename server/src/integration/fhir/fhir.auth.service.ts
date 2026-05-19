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

/**
 * Enterprise SMART on FHIR Authorization Service
 *
 * Implements the SMART App Launch Framework (v2) with:
 * - Registered app validation (client_id + client_secret)
 * - Dynamic patient context binding (no hardcoded IDs)
 * - Full scope parsing including wildcard read/write
 * - Authorization code + client_credentials grant types
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
    this.redisClient = new Redis({ host, port, password });
    this.redisClient.on('error', (err) =>
      this.logger.error('Redis connection error in FhirAuthService:', err),
    );
  }

  onModuleDestroy() {
    this.redisClient.disconnect();
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
    const isDev = !this.config.get<string>('FHIR_CLIENT_SECRET');

    if (!isDev) {
      if (!clientSecret) {
        throw new UnauthorizedException(
          'client_secret is required for registered applications',
        );
      }
      if (clientSecret !== app.clientSecret) {
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
  async authorize(
    clientId: string,
    scope: string,
    redirectUri: string,
    launchPatient?: string,
  ) {
    if (!clientId || !redirectUri) {
      throw new BadRequestException('Missing client_id or redirect_uri');
    }

    // Validate the client_id is a registered app
    const app = this.validateClient(clientId);

    // Verify redirect_uri matches registered URIs
    if (
      !app.redirectUris.includes(redirectUri) &&
      !redirectUri.startsWith('http://localhost')
    ) {
      throw new BadRequestException(
        `redirect_uri not registered for this application`,
      );
    }

    // Generate authorization code (valid for 60 seconds per SMART spec)
    const code = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const payload = JSON.stringify({
      clientId,
      patient: launchPatient, // Can be undefined for system-level access
      scope: scope || app.defaultScopes,
    });

    // Store in Redis with 60s expiration
    await this.redisClient.set(`fhir_auth:${code}`, payload, 'EX', 60);

    return { code, state: 'smart_state' };
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

    if (!app.grantTypes.includes(grantType as any)) {
      throw new BadRequestException(
        `Grant type '${grantType}' not allowed for this application. Allowed: ${app.grantTypes.join(', ')}`,
      );
    }

    let finalScope = scope || app.defaultScopes;
    let patientContext: string | undefined = patient;

    // ---------------------
    // Authorization Code Flow
    // ---------------------
    if (grantType === 'authorization_code') {
      if (!code) {
        throw new BadRequestException(
          'authorization_code grant requires a valid code',
        );
      }

      const redisKey = `fhir_auth:${code}`;
      const authDataStr = await this.redisClient.get(redisKey);

      if (!authDataStr) {
        throw new UnauthorizedException(
          'Invalid or expired authorization code',
        );
      }

      const authData = JSON.parse(authDataStr);
      if (authData.clientId !== clientId) {
        throw new UnauthorizedException(
          'Authorization code was issued to a different client',
        );
      }

      // One-time use: delete code immediately
      await this.redisClient.del(redisKey);

      // Use the scope and patient from the auth code
      finalScope = authData.scope;
      patientContext = authData.patient || patient;

      // Already consumed code above via redisClient.del(redisKey)
    }

    // ---------------------
    // Client Credentials Flow
    // ---------------------
    if (grantType === 'client_credentials') {
      // Patient context can be passed as a parameter for standalone launch
      patientContext = patient;
    }

    // Validate patient exists if context is provided
    if (patientContext) {
      const patientId = parseInt(patientContext);
      if (isNaN(patientId)) {
        throw new BadRequestException(
          'patient parameter must be a valid numeric ID',
        );
      }
      const exists = await this.prisma.patient.findUnique({
        where: { id: patientId },
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
  validateToken(token: string, requiredScope?: string) {
    const jwtSecret =
      this.config.get<string>('JWT_SECRET') ||
      'fhir-super-secret-key-enterprise';

    try {
      const decoded = this.jwtService.verify(token, { secret: jwtSecret });

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
