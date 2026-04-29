/**
 * NPHIES Cryptography Service — Unit Tests
 *
 * Tests JWS signing, dummy mode fallback, and base64url encoding.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NphiesCryptoService } from './nphies-crypto.service';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('NphiesCryptoService', () => {
  // ===========================================
  // DUMMY MODE (No Private Key)
  // ===========================================
  describe('Dummy Mode (no private key)', () => {
    let service: NphiesCryptoService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NphiesCryptoService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      service = module.get<NphiesCryptoService>(NphiesCryptoService);
    });

    it('should initialize in dummy mode when no key is configured', () => {
      expect(service.isUsingDummySignatures()).toBe(true);
    });

    it('should return dummy signature string', () => {
      const result = service.signPayload({ test: 'data' });
      expect(result).toBe('dummy.jws.signature.for.local.testing.only');
    });

    it('should return dummy signature for any payload', () => {
      const result1 = service.signPayload({});
      const result2 = service.signPayload({ complex: { nested: true } });
      expect(result1).toBe(result2);
    });
  });

  // ===========================================
  // REAL SIGNING MODE (With RSA Private Key)
  // ===========================================
  describe('Real Signing Mode (with RSA key)', () => {
    let service: NphiesCryptoService;
    let tempKeyPath: string;

    // Generate a test RSA key pair
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    beforeEach(async () => {
      // Write the private key to a temp file
      tempKeyPath = path.join(os.tmpdir(), `nphies-test-key-${Date.now()}.pem`);
      fs.writeFileSync(tempKeyPath, privateKey);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NphiesCryptoService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'NPHIES_PRIVATE_KEY_PATH') return tempKeyPath;
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<NphiesCryptoService>(NphiesCryptoService);
    });

    afterEach(() => {
      if (fs.existsSync(tempKeyPath)) {
        fs.unlinkSync(tempKeyPath);
      }
    });

    it('should NOT be in dummy mode', () => {
      expect(service.isUsingDummySignatures()).toBe(false);
    });

    it('should return a JWS token with 3 dot-separated parts (header.payload.signature)', () => {
      const result = service.signPayload({ id: 'test-123' });
      const parts = result.split('.');
      expect(parts).toHaveLength(3);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should produce valid base64url-encoded header with RS256 algorithm', () => {
      const result = service.signPayload({ id: 'test-header' });
      const headerPart = result.split('.')[0];

      // base64url → base64 → decode
      const base64 = headerPart.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));

      expect(decoded.alg).toBe('RS256');
      expect(decoded.typ).toBe('JWT');
    });

    it('should produce valid base64url-encoded payload', () => {
      const payload = { id: 'msg-001', eventCoding: { code: 'test' } };
      const result = service.signPayload(payload);
      const payloadPart = result.split('.')[1];

      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));

      expect(decoded.id).toBe('msg-001');
      expect(decoded.eventCoding.code).toBe('test');
    });

    it('should produce different signatures for different payloads', () => {
      const sig1 = service.signPayload({ id: 'payload-1' });
      const sig2 = service.signPayload({ id: 'payload-2' });

      expect(sig1).not.toBe(sig2);
      // Headers should be the same
      expect(sig1.split('.')[0]).toBe(sig2.split('.')[0]);
      // Payloads and signatures should differ
      expect(sig1.split('.')[1]).not.toBe(sig2.split('.')[1]);
      expect(sig1.split('.')[2]).not.toBe(sig2.split('.')[2]);
    });

    it('should not contain standard base64 characters (+, /, =) — must be base64url', () => {
      // Sign multiple payloads to increase chance of special chars
      for (let i = 0; i < 10; i++) {
        const result = service.signPayload({ test: `data-${i}`, random: Math.random() });
        expect(result).not.toMatch(/[+/=]/);
      }
    });
  });

  // ===========================================
  // LOADING FROM ENVIRONMENT VARIABLE
  // ===========================================
  describe('Loading key from environment variable', () => {
    it('should load private key from NPHIES_PRIVATE_KEY env var', async () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NphiesCryptoService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'NPHIES_PRIVATE_KEY') return privateKey;
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const service = module.get<NphiesCryptoService>(NphiesCryptoService);
      expect(service.isUsingDummySignatures()).toBe(false);

      const result = service.signPayload({ test: true });
      expect(result.split('.')).toHaveLength(3);
    });
  });

  // ===========================================
  // ERROR HANDLING
  // ===========================================
  describe('Error Handling', () => {
    it('should fall back to dummy mode when key file path is invalid', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NphiesCryptoService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'NPHIES_PRIVATE_KEY_PATH') return '/nonexistent/path/key.pem';
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const service = module.get<NphiesCryptoService>(NphiesCryptoService);
      expect(service.isUsingDummySignatures()).toBe(true);
    });
  });
});
