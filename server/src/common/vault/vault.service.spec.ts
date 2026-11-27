import { of } from 'rxjs';
import type { ConfigService } from '@nestjs/config';
import type { HttpService } from '@nestjs/axios';
import { VaultService } from './vault.service';

describe('VaultService (C-03 JWT kid Allowlist)', () => {
  let service: VaultService;

  beforeEach(async () => {
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'JWT_SECRET') return 'fallback-jwt-secret';
        if (key === 'VAULT_ADDR') return 'http://127.0.0.1:8200';
        if (key === 'VAULT_TOKEN') return 'test-token';
        if (key === 'NODE_ENV') return 'production';
        return fallback;
      }),
    } as unknown as ConfigService;

    const httpService = {
      get: jest.fn().mockReturnValue(
        of({
          data: {
            data: {
              data: {
                JWT_SECRET: 'vault-active-jwt-secret',
                JWT_SIGNING_KEY_2: 'vault-rotated-jwt-secret',
                SMTP_HOST: 'smtp.internal',
                active_kid: 'default-kid-1',
              },
            },
          },
        }),
      ),
    } as unknown as HttpService;

    service = new VaultService(configService, httpService);
    await service.refreshKeys();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('resolves allowed JWT signing keys and default active aliases', async () => {
    await expect(service.getKeyOrSecret()).resolves.toBe(
      'vault-active-jwt-secret',
    );
    await expect(service.getKeyOrSecret('active')).resolves.toBe(
      'vault-active-jwt-secret',
    );
    await expect(service.getKeyOrSecret('default-kid-1')).resolves.toBe(
      'vault-active-jwt-secret',
    );
    await expect(service.getKeyOrSecret('JWT_SECRET')).resolves.toBe(
      'vault-active-jwt-secret',
    );
    await expect(service.getKeyOrSecret('JWT_SIGNING_KEY_2')).resolves.toBe(
      'vault-rotated-jwt-secret',
    );
  });

  it('rejects arbitrary non-JWT Vault keys and unknown kids', async () => {
    await expect(service.getKeyOrSecret('SMTP_HOST')).rejects.toThrow(
      'Invalid JWT key identifier',
    );
    await expect(service.getKeyOrSecret('active_kid')).rejects.toThrow(
      'Invalid JWT key identifier',
    );
    await expect(service.getKeyOrSecret('JWT_SIGNING_KEY_99')).rejects.toThrow(
      'Unknown JWT signing key',
    );
  });

  it('authenticates with Vault AppRole when VAULT_ROLE_ID and VAULT_SECRET_ID are set', async () => {
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'JWT_SECRET') return 'fallback-jwt-secret';
        if (key === 'VAULT_ADDR') return 'https://vault.internal.ly:8200';
        if (key === 'VAULT_ROLE_ID') return 'role-123';
        if (key === 'VAULT_SECRET_ID') return 'secret-456';
        if (key === 'NODE_ENV') return 'production';
        return fallback;
      }),
    } as unknown as ConfigService;

    const postMock = jest.fn().mockReturnValue(
      of({
        data: {
          auth: { client_token: 'hvs.approle-short-lived-token' },
        },
      }),
    );
    const getMock = jest.fn().mockReturnValue(
      of({
        data: {
          data: {
            data: {
              JWT_SECRET: 'vault-approle-jwt-secret',
            },
          },
        },
      }),
    );
    const httpService = {
      post: postMock,
      get: getMock,
    } as unknown as HttpService;

    const appRoleVault = new VaultService(configService, httpService);
    await appRoleVault.refreshKeys();

    expect(postMock).toHaveBeenCalledWith(
      'https://vault.internal.ly:8200/v1/auth/approle/login',
      { role_id: 'role-123', secret_id: 'secret-456' },
      undefined,
    );
    expect(getMock).toHaveBeenCalledWith(
      'https://vault.internal.ly:8200/v1/secret/data/saraya',
      {
        headers: { 'X-Vault-Token': 'hvs.approle-short-lived-token' },
      },
    );
    await expect(appRoleVault.getKeyOrSecret()).resolves.toBe(
      'vault-approle-jwt-secret',
    );
    appRoleVault.onModuleDestroy();
  });
});
