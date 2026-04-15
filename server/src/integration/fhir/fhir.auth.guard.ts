import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FhirAuthService } from './fhir.auth.service';
import { Request } from 'express';

/**
 * Decorator to declare the required FHIR scope for an endpoint.
 * Uses the SMART v2 scope syntax: prefix/Resource.action
 * 
 * @example @FhirScope('patient/Observation.write')
 */
export const FhirScope = (scope: string) => SetMetadata('fhir_scope', scope);

/**
 * Extend Express Request to include SMART context
 */
export interface SmartContext {
  /** The patient ID this token is scoped to (undefined = system-level access) */
  patient?: string;
  /** The granted scopes */
  scope: string;
  /** The client_id that owns this token */
  client_id: string;
  /** The subject identifier */
  sub: string;
}

export interface FhirRequest extends Request {
  smartContext: SmartContext;
}

/**
 * Enterprise FHIR Auth Guard
 * 
 * Protects FHIR endpoints with:
 * 1. Bearer token validation (JWT)
 * 2. Scope-based access control (read/write per resource)
 * 3. SMART patient context injection for downstream enforcement
 * 
 * The guard extracts and validates the token, checks the required scope,
 * and injects the decoded SMART context into the request for use by
 * controllers and services to enforce patient-level isolation.
 */
@Injectable()
export class FhirAuthGuard implements CanActivate {
  constructor(
    private fhirAuthService: FhirAuthService,
    private reflector: Reflector
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const requiredScope = this.reflector.get<string>('fhir_scope', context.getHandler());

    // The metadata endpoint is public per FHIR spec
    if (request.path.endsWith('/fhir/metadata')) {
      return true;
    }

    // CDS discovery endpoint is public per CDS Hooks spec
    if (request.path.endsWith('/cds-services') && request.method === 'GET') {
      return true;
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid FHIR Bearer Token. All FHIR endpoints require SMART authorization.');
    }

    const token = authHeader.split(' ')[1];
    
    // Validate token and scopes — throws if invalid
    const decoded = this.fhirAuthService.validateToken(token, requiredScope);
    
    // Inject the full SMART context into the request
    // Controllers MUST use this to enforce patient-level data isolation
    (request as FhirRequest).smartContext = {
      patient: decoded.patient, // undefined means system-level (no patient restriction)
      scope: decoded.scope || '',
      client_id: decoded.client_id || decoded.sub,
      sub: decoded.sub,
    };

    return true;
  }
}
