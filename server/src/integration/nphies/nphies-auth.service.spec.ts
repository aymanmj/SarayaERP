/**
 * NPHIES Auth Service — Unit Tests
 *
 * Tests mTLS agent initialization, OAuth2 token management,
 * and FHIR request dispatching with retry logic.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { NphiesAuthService } from './nphies-auth.service';
import { of, throwError } from 'rxjs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

describe('NphiesAuthService', () => {
  // ===========================================
  // NO CERTIFICATES — Fallback Mode
  // ===========================================
  describe('Without mTLS certificates', () => {
    let service: NphiesAuthService;
    let httpService: HttpService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NphiesAuthService,
          {
            provide: HttpService,
            useValue: {
              post: jest.fn(),
              get: jest.fn(),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string) => {
                const map: Record<string, string> = {
                  NPHIES_BASE_URL: 'https://test.nphies.sa',
                  NPHIES_CLIENT_ID: 'test-client',
                  NPHIES_CLIENT_SECRET: 'test-secret',
                };
                return map[key] || defaultValue;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<NphiesAuthService>(NphiesAuthService);
      httpService = module.get<HttpService>(HttpService);
    });

    it('should initialize without crashing when certs are missing', () => {
      expect(service).toBeDefined();
    });

    it('should return correct base URL', () => {
      expect(service.getBaseUrl()).toBe('https://test.nphies.sa');
    });

    describe('getAccessToken', () => {
      it('should call OAuth2 token endpoint and return access_token', async () => {
        (httpService.post as jest.Mock).mockReturnValue(of({
          data: { access_token: 'test-token-123', expires_in: 3600 },
        }));

        const token = await service.getAccessToken();
        expect(token).toBe('test-token-123');
      });

      it('should cache token and not re-fetch on second call', async () => {
        (httpService.post as jest.Mock).mockReturnValue(of({
          data: { access_token: 'cached-token', expires_in: 3600 },
        }));

        await service.getAccessToken();
        await service.getAccessToken();

        // Only one HTTP call (first fetch)
        expect(httpService.post).toHaveBeenCalledTimes(1);
      });

      it('should throw when token endpoint fails', async () => {
        (httpService.post as jest.Mock).mockReturnValue(
          throwError(() => ({ response: { data: { error_description: 'invalid_client' } }, message: 'fail' })),
        );

        await expect(service.getAccessToken()).rejects.toThrow('NPHIES Authentication Failed');
      });
    });

    describe('sendFhirRequest', () => {
      it('should send POST request with correct headers', async () => {
        // Mock token fetch
        (httpService.post as jest.Mock)
          .mockReturnValueOnce(of({ data: { access_token: 'my-token', expires_in: 3600 } }))
          // Mock FHIR request
          .mockReturnValueOnce(of({ data: { resourceType: 'Bundle', entry: [] } }));

        const result = await service.sendFhirRequest('/nphies-fs/Claim/$submit', { test: true });

        expect(result).toEqual({ resourceType: 'Bundle', entry: [] });

        // Verify second call (FHIR request) has correct headers
        const fhirCall = (httpService.post as jest.Mock).mock.calls[1];
        expect(fhirCall[0]).toBe('https://test.nphies.sa/nphies-fs/Claim/$submit');
        expect(fhirCall[2].headers['Content-Type']).toBe('application/fhir+json');
        expect(fhirCall[2].headers['Authorization']).toBe('Bearer my-token');
      });

      it('should retry once on 401 (expired token)', async () => {
        // First: token fetch
        (httpService.post as jest.Mock)
          .mockReturnValueOnce(of({ data: { access_token: 'old-token', expires_in: 3600 } }))
          // Second: FHIR request fails with 401
          .mockReturnValueOnce(throwError(() => ({ response: { status: 401, data: {} }, message: 'Unauthorized' })))
          // Third: new token
          .mockReturnValueOnce(of({ data: { access_token: 'new-token', expires_in: 3600 } }))
          // Fourth: FHIR retry succeeds
          .mockReturnValueOnce(of({ data: { resourceType: 'Bundle' } }));

        const result = await service.sendFhirRequest('/test', {});
        expect(result).toEqual({ resourceType: 'Bundle' });
        expect(httpService.post).toHaveBeenCalledTimes(4);
      });

      it('should send GET request when method is GET', async () => {
        (httpService.post as jest.Mock).mockReturnValueOnce(
          of({ data: { access_token: 'token', expires_in: 3600 } }),
        );
        (httpService.get as jest.Mock).mockReturnValueOnce(
          of({ data: { status: 'active' } }),
        );

        const result = await service.sendFhirRequest('/claim/123', null, 'GET');
        expect(result).toEqual({ status: 'active' });
        expect(httpService.get).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ===========================================
  // WITH CERTIFICATES — mTLS Mode
  // ===========================================
  describe('With mTLS certificates', () => {
    let tempCertPath: string;
    let tempKeyPath: string;

    beforeAll(() => {
      // Generate self-signed cert + key for testing
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      tempCertPath = path.join(os.tmpdir(), `nphies-cert-${Date.now()}.pem`);
      tempKeyPath = path.join(os.tmpdir(), `nphies-key-${Date.now()}.pem`);
      fs.writeFileSync(tempCertPath, publicKey);
      fs.writeFileSync(tempKeyPath, privateKey);
    });

    afterAll(() => {
      [tempCertPath, tempKeyPath].forEach(f => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
    });

    it('should initialize mTLS agent when certificates exist', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NphiesAuthService,
          {
            provide: HttpService,
            useValue: { post: jest.fn(), get: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string) => {
                if (key === 'NPHIES_CERT_PATH') return tempCertPath;
                if (key === 'NPHIES_KEY_PATH') return tempKeyPath;
                return defaultValue || '';
              }),
            },
          },
        ],
      }).compile();

      const svc = module.get<NphiesAuthService>(NphiesAuthService);
      // Service should initialize without errors
      expect(svc).toBeDefined();
      expect(svc.getBaseUrl()).toBeDefined();
    });
  });
});
