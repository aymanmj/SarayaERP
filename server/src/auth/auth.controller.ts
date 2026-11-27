import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { JwtPayload } from './jwt-payload.type';
import { Sensitive } from '../audit/audit.decorator';
import { buildAuthCookieOptions } from '../common/security/http-security.config';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @Sensitive('VIEW_STAFF_DEVICE_SESSIONS')
  sessions(@CurrentUser() user: JwtPayload) {
    return this.authService.listDeviceSessions(user);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Sensitive('REQUEST_STAFF_DEVICE_REVOCATION')
  revokeSession(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.authService.revokeOtherDevice(user, sessionId.toLowerCase());
  }

  @Post('login')
  @Header('Cache-Control', 'no-store')
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken, user, accessibleBranches } =
      await this.authService.login(dto.username, dto.password, dto.mfaCode);

    this.setCookies(response, accessToken, refreshToken);
    return {
      user,
      success: true,
      ...this.nativeAccessToken(request, accessToken),
      accessibleBranches, // ✅ Multi-Branch
    };
  }

  /**
   * ✅ Multi-Branch: تبديل الفرع النشط
   * يُصدر JWT و Refresh Token جديدين مرتبطين بالفرع المستهدف
   */
  @UseGuards(JwtAuthGuard)
  @Post('switch-branch')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async switchBranch(
    @Body() body: { targetHospitalId: number },
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (
      !Number.isInteger(body?.targetHospitalId) ||
      body.targetHospitalId < 1 ||
      body.targetHospitalId > 2147483647
    )
      throw new BadRequestException('معرّف الفرع غير صالح');
    const result = await this.authService.switchBranch(
      user,
      body.targetHospitalId,
      this.readRefreshCookie(request),
    );

    this.setCookies(response, result.accessToken, result.refreshToken);
    return {
      success: true,
      currentBranch: result.currentBranch,
      ...this.nativeAccessToken(request, result.accessToken),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(user);

    this.clearCookies(response);
    return { success: true };
  }

  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  @Throttle({ short: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.authService.refreshTokens(
      this.readRefreshCookie(request),
    );

    this.setCookies(response, tokens.accessToken, tokens.refreshToken);
    return {
      success: true,
      ...this.nativeAccessToken(request, tokens.accessToken),
      hospitalId: tokens.hospitalId,
      userId: tokens.userId,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('mfa/status')
  @Header('Cache-Control', 'no-store')
  async mfaStatus(@CurrentUser() user: JwtPayload) {
    return this.authService.getMfaStatus(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async setupMfa(@CurrentUser() user: JwtPayload) {
    return this.authService.setupMfa(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/enable')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async enableMfa(
    @CurrentUser() user: JwtPayload,
    @Body() body: { code?: string },
  ) {
    if (typeof body?.code !== 'string' || !body.code.trim()) {
      throw new BadRequestException('يرجى إدخال رمز التحقق');
    }
    return this.authService.enableMfa(user, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async disableMfa(
    @CurrentUser() user: JwtPayload,
    @Body() body: { password?: string; code?: string },
  ) {
    if (typeof body?.password !== 'string' || !body.password) {
      throw new BadRequestException('يرجى إدخال كلمة المرور');
    }
    return this.authService.disableMfa(user, body.password, body.code ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(user, true);
    this.clearCookies(response);
    return { success: true };
  }

  private readRefreshCookie(request: Request) {
    const refreshToken: unknown = request.cookies?.Refresh;
    if (typeof refreshToken !== 'string' || !refreshToken)
      throw new UnauthorizedException('No Refresh Token');
    return refreshToken;
  }

  private nativeAccessToken(request: Request, accessToken: string) {
    const headers = request.headers;
    if (
      headers.origin !== undefined ||
      headers['x-client-name'] === 'saraya-web' ||
      headers['sec-fetch-site'] !== undefined ||
      headers['sec-fetch-mode'] !== undefined
    )
      return {};
    return { accessToken };
  }

  private clearCookies(res: Response) {
    const base = buildAuthCookieOptions();
    res.clearCookie('Authentication', base);
    res.clearCookie('Refresh', base);
  }

  private setCookies(res: Response, at: string, rt: string) {
    const base = buildAuthCookieOptions();

    res.cookie('Authentication', at, {
      ...base,
      maxAge: 15 * 60 * 1000, // 15m
    });

    res.cookie('Refresh', rt, {
      ...base,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
    });
  }
}
