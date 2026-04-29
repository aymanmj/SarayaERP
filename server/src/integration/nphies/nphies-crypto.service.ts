import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * NPHIES Cryptography Service
 * Handles JWS (JSON Web Signature) generation and payload signing
 * Required for signing FHIR MessageHeader and Claims
 */
@Injectable()
export class NphiesCryptoService {
  private readonly logger = new Logger(NphiesCryptoService.name);
  
  private privateKey: string | null = null;
  private isDummyMode: boolean = false;

  constructor(private configService: ConfigService) {
    this.loadPrivateKey();
  }

  /**
   * Loads the private key for signing.
   * Checks Vault/Env paths or local files.
   * If missing, sets up a dummy mode so testing doesn't crash.
   */
  private loadPrivateKey() {
    const env = this.configService.get<string>('NODE_ENV', 'development');
    const isProduction = env === 'production';

    try {
      const keyPath = this.configService.get<string>('NPHIES_PRIVATE_KEY_PATH');
      const rawKey = this.configService.get<string>('NPHIES_PRIVATE_KEY');

      if (rawKey) {
        this.privateKey = rawKey;
        this.logger.log('🔐 Loaded NPHIES Private Key from environment variables.');
      } else if (keyPath && fs.existsSync(keyPath)) {
        this.privateKey = fs.readFileSync(keyPath, 'utf8');
        this.logger.log(`🔐 Loaded NPHIES Private Key from path: ${keyPath}`);
      } else {
        this.isDummyMode = true;
        if (isProduction) {
          this.logger.error(
            '🚨 CRITICAL: NPHIES Private Key NOT found in PRODUCTION! ' +
            'All JWS signatures will use DUMMY values and NPHIES will REJECT all submissions. ' +
            'Set NPHIES_PRIVATE_KEY or NPHIES_PRIVATE_KEY_PATH via Vault or env vars.'
          );
        } else {
          this.logger.warn('⚠️ No NPHIES Private Key found. Running in DUMMY mode for local testing.');
        }
      }
    } catch (error: any) {
      this.isDummyMode = true;
      if (isProduction) {
        this.logger.error(`🚨 CRITICAL: Failed to load NPHIES Private Key in PRODUCTION: ${error.message}`);
      } else {
        this.logger.warn(`⚠️ Failed to load NPHIES Private Key: ${error.message}. Running in DUMMY mode.`);
      }
    }
  }

  /**
   * Signs a FHIR resource (usually MessageHeader) using JWS (RS256 or ES256)
   * NPHIES requires detatched JWS in the resource's `signature` element.
   * 
   * @param payload The object/resource to sign
   * @returns JWS Signature string
   */
  signPayload(payload: any): string {
    if (this.isDummyMode || !this.privateKey) {
      return 'dummy.jws.signature.for.local.testing.only';
    }

    try {
      const header = {
        alg: 'RS256', // NPHIES typically supports RS256 or ES256
        typ: 'JWT'
      };

      const encodedHeader = this.base64urlEncode(JSON.stringify(header));
      // NPHIES expects a specific canonicalization of the payload, 
      // but for standard JWS, we stringify it.
      const encodedPayload = this.base64urlEncode(JSON.stringify(payload));
      
      const signInput = `${encodedHeader}.${encodedPayload}`;
      
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(signInput);
      signer.end();
      
      const signature = signer.sign(this.privateKey);
      const encodedSignature = this.base64urlEncode(signature);

      return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
    } catch (error: any) {
      this.logger.error(`❌ Failed to sign NPHIES payload: ${error.message}`);
      // Fallback to dummy so the pipeline doesn't break during dev
      return 'failed.jws.signature';
    }
  }

  /**
   * Base64URL encoding (RFC 4648)
   */
  private base64urlEncode(str: string | Buffer): string {
    const buf = typeof str === 'string' ? Buffer.from(str, 'utf8') : str;
    return buf.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  public isUsingDummySignatures(): boolean {
    return this.isDummyMode;
  }
}
