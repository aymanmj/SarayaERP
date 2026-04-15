import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FhirAuthService } from './fhir.auth.service';
import { Request } from 'express';

export const FhirScope = (scope: string) => SetMetadata('fhir_scope', scope);

@Injectable()
export class FhirAuthGuard implements CanActivate {
  constructor(
    private fhirAuthService: FhirAuthService,
    private reflector: Reflector
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const requiredScope = this.reflector.get<string>('fhir_scope', context.getHandler());

    // The metadata endpoint is public in FHIR
    if (request.path.endsWith('/fhir/metadata')) {
      return true;
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // In strict enterprise mode, all endpoints except metadata require auth
      throw new UnauthorizedException('Missing or invalid FHIR Bearer Token');
    }

    const token = authHeader.split(' ')[1];
    
    // Validate token and scopes
    const decoded = this.fhirAuthService.validateToken(token, requiredScope);
    
    // Inject the decoded SMART context into request so controllers can filter by patient ID
    (request as any).smartContext = decoded;

    return true;
  }
}
