import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { JwtPayload } from './jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, refreshToken, user, accessibleBranches } =
      await this.authService.login(dto.username, dto.password);

    this.setCookies(response, accessToken, refreshToken);
    return {
      user,
      success: true,
      accessToken, // for mobile support
      accessibleBranches, // ✅ Multi-Branch
    };
  }

  /**
   * ✅ Multi-Branch: تبديل الفرع النشط
   * يُصدر JWT و Refresh Token جديدين مرتبطين بالفرع المستهدف
   */
  @UseGuards(JwtAuthGuard)
  @Post('switch-branch')
  @HttpCode(HttpStatus.OK)
  async switchBranch(
    @Body() body: { targetHospitalId: number },
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.switchBranch(
      user.sub,
      body.targetHospitalId,
    );

    this.setCookies(response, result.accessToken, result.refreshToken);
    return {
      success: true,
      currentBranch: result.currentBranch,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies['Refresh'];
    const userId = (request as any).user?.sub || 0;
    
    await this.authService.logout(userId, refreshToken);

    response.clearCookie('Authentication');
    response.clearCookie('Refresh');
    return { success: true };
  }

  @Post('refresh')
  @Throttle({ short: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies['Refresh'];
    if (!refreshToken) throw new UnauthorizedException('No Refresh Token');

    const tokens = await this.authService.refreshTokens(refreshToken);

    this.setCookies(response, tokens.accessToken, tokens.refreshToken);
    return { success: true };
  }

  private setCookies(res: Response, at: string, rt: string) {
    const isSecure =
      process.env.COOKIE_SECURE === 'true' ||
      (process.env.NODE_ENV === 'production' &&
        process.env.COOKIE_SECURE !== 'false');

    res.cookie('Authentication', at, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15m
    });

    res.cookie('Refresh', rt, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
    });
  }
}

// import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { LoginDto } from './dto/login.dto';

// @Controller('auth')
// export class AuthController {
//   constructor(private readonly authService: AuthService) {}

//   @Post('login')
//   @HttpCode(HttpStatus.OK)
//   async login(@Body() dto: LoginDto) {
//     return this.authService.login(dto.username, dto.password);
//   }
// }
