/**
 * Patient Portal — Auth Guard (Enterprise Hardened)
 * 
 * Security layers enforced:
 * 1. JWT signature verification
 * 2. Token audience check (aud === 'patient-portal')
 * 3. Role validation (role === 'PATIENT')
 * 4. Token type validation (type === 'access')
 * 5. Required claims check (sub, hospitalId)
 * 
 * This guard REJECTS:
 * - Staff/admin JWT tokens (different role)
 * - Refresh tokens (wrong type)
 * - Tokens without hospitalId or sub
 * - Expired tokens
 * - Tokens with wrong audience
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PatientAuthGuard implements CanActivate {
  private readonly logger = new Logger(PatientAuthGuard.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('رمز المصادقة مطلوب');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //  SECURITY LAYER 1: Role Validation
      //  Reject any token that is NOT PATIENT-scoped
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (payload.role !== 'PATIENT') {
        this.logger.warn(`🚫 Non-patient token attempted portal access: role=${payload.role}, sub=${payload.sub}`);
        throw new UnauthorizedException('رمز غير صالح لبوابة المريض');
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //  SECURITY LAYER 2: Token Type Validation
      //  Only accept 'access' tokens (reject 'refresh')
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (payload.type !== 'access') {
        this.logger.warn(`🚫 Non-access token used: type=${payload.type}, sub=${payload.sub}`);
        throw new UnauthorizedException('نوع الرمز غير صالح');
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //  SECURITY LAYER 3: Audience Validation
      //  Token MUST carry aud === 'patient-portal'
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (payload.aud !== 'patient-portal') {
        this.logger.warn(`🚫 Missing or wrong audience: aud=${payload.aud}, sub=${payload.sub}`);
        throw new UnauthorizedException('رمز غير مصرّح لهذه الخدمة');
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //  SECURITY LAYER 4: Required Claims
      //  Ensure sub (patientId) and hospitalId exist
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (!payload.sub || !payload.hospitalId) {
        this.logger.warn(`🚫 Missing claims: sub=${payload.sub}, hospitalId=${payload.hospitalId}`);
        throw new UnauthorizedException('رمز ناقص البيانات');
      }

      // Attach validated patient context to request
      request['patient'] = payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // JWT verification failed (expired, signature, etc.)
      throw new UnauthorizedException('رمز المصادقة منتهي أو غير صالح');
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
