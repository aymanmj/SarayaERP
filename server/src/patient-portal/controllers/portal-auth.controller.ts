/**
 * Patient Portal — Auth Controller (Enterprise Hardened)
 * 
 * Security:
 * - Rate limiting: request-otp (5/min), verify-otp (10/min), refresh (20/min)
 * - All responses use generic error messages to prevent enumeration
 * - OTP codes are never logged or returned to the client
 * 
 * Flow:
 * 1. POST /auth/request-otp  → Patient provides MRN + phone → gets OTP via configured channel
 * 2. POST /auth/verify-otp   → Patient provides MRN + OTP code → gets access + refresh tokens
 * 3. POST /auth/refresh      → Exchange refresh token for new pair (rotation + reuse detection)
 * 4. POST /auth/logout       → Revoke refresh token(s)
 * 5. GET  /auth/me            → Get current patient profile (requires valid access token)
 */

import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PatientPortalService } from '../patient-portal.service';
import { PatientAuthGuard } from '../auth/patient-auth.guard';
import { CurrentPatient } from '../auth/current-patient.decorator';
import { RequestOtpDto, VerifyOtpDto, RefreshTokenDto } from '../dto/portal.dto';

@ApiTags('Patient Portal — Auth')
@Controller('patient-portal/v1/auth')
export class PortalAuthController {
  constructor(private readonly portalService: PatientPortalService) {}

  @Post('request-otp')
  @Throttle({ short: { limit: 3, ttl: 60000 } })  // 3 requests/minute (strict — prevents abuse)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'طلب رمز تحقق OTP', description: 'يرسل رمز تحقق مكون من 6 أرقام إلى هاتف المريض' })
  @ApiResponse({ status: 200, description: 'تم إرسال الرمز بنجاح' })
  @ApiResponse({ status: 401, description: 'بيانات غير صحيحة' })
  @ApiResponse({ status: 400, description: 'تم تجاوز الحد الأقصى لطلبات OTP' })
  @ApiResponse({ status: 429, description: 'تم تجاوز حد الطلبات — حاول لاحقاً' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.portalService.requestOtp(dto.mrn, dto.phone);
  }

  @Post('verify-otp')
  @Throttle({ short: { limit: 5, ttl: 60000 } })  // 5/minute (allows retry but limits brute force)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'التحقق من رمز OTP', description: 'يتحقق من الرمز ويُرجع access + refresh tokens' })
  @ApiResponse({ status: 200, description: 'تم التحقق — إرجاع التوكنات' })
  @ApiResponse({ status: 401, description: 'رمز غير صحيح أو منتهي' })
  @ApiResponse({ status: 429, description: 'تم تجاوز حد المحاولات' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.portalService.verifyOtpAndLogin(dto.mrn, dto.code);
  }

  @Post('refresh')
  @Throttle({ short: { limit: 10, ttl: 60000 } })  // 10/minute (mobile apps may retry)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تجديد Access Token', description: 'يستبدل Refresh Token بزوج جديد من التوكنات' })
  @ApiResponse({ status: 200, description: 'تم التجديد بنجاح' })
  @ApiResponse({ status: 403, description: 'Token غير صالح أو تم إعادة استخدامه' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.portalService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(PatientAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تسجيل الخروج' })
  async logout(
    @CurrentPatient() patient: any,
    @Body() body: { refreshToken?: string },
  ) {
    return this.portalService.logout(patient.sub, body?.refreshToken);
  }

  @Get('me')
  @UseGuards(PatientAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'بيانات المريض الحالي' })
  async getMe(@CurrentPatient() patient: any) {
    return this.portalService.getProfile(patient.sub, patient.hospitalId);
  }
}
