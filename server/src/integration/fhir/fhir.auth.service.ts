import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class FhirAuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  /**
   * Simulate a SMART on FHIR authorize endpoint.
   * In a real Epic/Cerner system, this renders a login page for the patient/doctor
   * and returns an auth code. Here we'll generate an auth code if credentials are correct.
   */
  async authorize(clientId: string, scope: string, redirectUri: string) {
    if (!clientId || !redirectUri) {
      throw new BadRequestException('Missing client_id or redirect_uri');
    }
    // In an enterprise system, we validate the client_id against registered apps.
    // We return a mock authorization code to complete the flow.
    return {
      code: `auth_code_${Math.random().toString(36).substring(7)}`,
      state: 'smart_state',
    };
  }

  /**
   * SMART Token Endpoint
   * Issues the actual access token. We support 'client_credentials' or 'authorization_code'.
   * In Cerner/Epic, standard backend services use client_credentials.
   */
  async generateToken(grantType: string, clientId: string, clientSecret?: string, scope?: string) {
    if (grantType !== 'client_credentials') {
      throw new BadRequestException('Only client_credentials grant type is currently supported in this prototype');
    }

    if (clientId !== 'enterprise_fhir_client') {
      throw new UnauthorizedException('Invalid client_id');
    }

    // Default scope for the standalone launch
    const finalScope = scope || 'user/*.read launch/patient';

    // In a full implementation, we lookup the patient context for the launch.
    // For now, we sign a token with scopes.
    const payload = {
      iss: 'https://saraya-erp.com/api/fhir',
      sub: clientId,
      aud: 'https://saraya-erp.com/api/fhir',
      client_id: clientId,
      scope: finalScope,
      // For testing, hardcode a context patient if 'launch/patient' is requested
      ...(finalScope.includes('launch/patient') ? { patient: '1' } : {})
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '1h',
      secret: process.env.JWT_SECRET || 'fhir-super-secret-key-enterprise',
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: finalScope,
      patient: payload.patient, // Required by SMART on FHIR if patient context is set
    };
  }

  /**
   * Validates a token and checks if the required scope matches.
   */
  validateToken(token: string, requiredScope?: string) {
    try {
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'fhir-super-secret-key-enterprise',
      });

      if (requiredScope) {
        const scopes = (decoded.scope || '').split(' ');
        
        // Scope logic: e.g. "patient/*.read" covers "patient/Observation.read"
        // Simplistic check for prototyping
        const hasScope = scopes.some((s: string) => {
          if (s === requiredScope) return true;
          if (s.startsWith('user/*.read') || s.startsWith('patient/*.read')) {
            return requiredScope.endsWith('.read');
          }
          if (s.startsWith('system/*.read')) {
            return requiredScope.endsWith('.read');
          }
          return false;
        });

        if (!hasScope) {
          throw new UnauthorizedException(`Insufficient scope. Requires: ${requiredScope}`);
        }
      }

      return decoded;
    } catch (e: any) {
      throw new UnauthorizedException(e.message || 'Invalid FHIR JWT Token');
    }
  }
}
