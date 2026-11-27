import { PermissionsGuard } from './permissions.guard';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { JwtPayload } from './jwt-payload.type';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    logout: jest.Mock;
    refreshTokens: jest.Mock;
    getMfaStatus: jest.Mock;
    enableMfa: jest.Mock;
  };
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCookieSecure = process.env.COOKIE_SECURE;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      logout: jest.fn(),
      refreshTokens: jest.fn(),
      getMfaStatus: jest.fn().mockResolvedValue({
        mfaEnabled: true,
        mfaVerifiedAt: null,
      }),
      enableMfa: jest.fn().mockResolvedValue({ mfaEnabled: true }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCookieSecure === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = originalCookieSecure;
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('clears Authentication and Refresh cookies with matching attributes on logout and logoutAll', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SECURE;

    const user: JwtPayload = {
      sub: 42,
      username: 'cashier1',
      hospitalId: 1,
      roles: ['CASHIER'],
      permissions: ['cashier:view'],
    };
    const clearCookie = jest.fn();
    const response = { clearCookie } as unknown as Response;

    await controller.logout(user, response);
    expect(authService.logout).toHaveBeenCalledWith(user);
    expect(clearCookie).toHaveBeenCalledWith('Authentication', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(clearCookie).toHaveBeenCalledWith('Refresh', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    clearCookie.mockClear();
    await controller.logoutAll(user, response);
    expect(authService.logout).toHaveBeenCalledWith(user, true);
    expect(clearCookie).toHaveBeenCalledWith('Authentication', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(clearCookie).toHaveBeenCalledWith('Refresh', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('returns MFA status and forwards valid MFA enable requests', async () => {
    const user: JwtPayload = {
      sub: 42,
      username: 'doctor1',
      hospitalId: 1,
      roles: ['DOCTOR'],
      permissions: [],
    };
    await expect(controller.mfaStatus(user)).resolves.toEqual({
      mfaEnabled: true,
      mfaVerifiedAt: null,
    });
    await expect(
      controller.enableMfa(user, { code: '123456' }),
    ).resolves.toEqual({ mfaEnabled: true });
    expect(authService.enableMfa).toHaveBeenCalledWith(user, '123456');
  });
});
