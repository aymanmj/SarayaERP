import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

/**
 * Enterprise Key Management Service using HashiCorp Vault
 */
@Injectable()
export class VaultService implements OnModuleInit {
  private readonly logger = new Logger(VaultService.name);
  private keysCache: Map<string, string> = new Map();
  private defaultSecret: string;
  private vaultUrl: string;
  private vaultToken: string;
  private isVaultEnabled: boolean;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.defaultSecret = this.configService.get<string>('JWT_SECRET', 'fallback_secret');
    this.vaultUrl = this.configService.get<string>('VAULT_ADDR', 'http://127.0.0.1:8200');
    this.vaultToken = this.configService.get<string>('VAULT_TOKEN', 'saraya-root-token-dev');
    
    // In production, require Vault. In dev, we can fallback gracefully.
    const env = this.configService.get<string>('NODE_ENV', 'development');
    this.isVaultEnabled = env === 'production' || !!process.env.VAULT_ADDR;
  }

  async onModuleInit() {
    this.logger.log('Initializing Key Management System (Vault)...');
    try {
      await this.refreshKeys();
      
      // Schedule key refreshment every hour
      setInterval(() => {
        this.refreshKeys().catch((err) => this.logger.error('Failed to refresh keys', err));
      }, 60 * 60 * 1000);
      
    } catch (error) {
      this.logger.warn(`Failed to connect to Vault, falling back to ENV variables. Error: ${error.message}`);
    }
  }

  /**
   * Refreshes keys from HashiCorp vault
   */
  async refreshKeys() {
    if (!this.isVaultEnabled) return;
    try {
      // Use central KV-V2 path for Saraya Secrets
      const response = await lastValueFrom(
        this.httpService.get(`${this.vaultUrl}/v1/secret/data/saraya`, {
          headers: { 'X-Vault-Token': this.vaultToken },
        })
      );

      const secrets = response.data?.data?.data || {};
      for (const [kid, secret] of Object.entries(secrets)) {
        this.keysCache.set(kid, secret as string);
      }
      this.logger.log(`Successfully fetched ${Object.keys(secrets).length} enterprise secrets from Vault.`);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.logger.warn('Vault path "secret/data/saraya" not found. Need to initialize secrets.');
      } else {
        throw error;
      }
    }
  }

  /**
   * Get a specific key by ID.
   * If 'kid' is not provided, returns the ACTIVE key for the system.
   */
  async getKeyOrSecret(kid?: string): Promise<string> {
    if (!kid || kid === 'active' || kid === 'default-kid-1') {
      return this.keysCache.get('JWT_SECRET') || this.defaultSecret;
    }
    return this.keysCache.get(kid) || this.defaultSecret;
  }

  /**
   * Gets the Active Key ID for issuing new JWTs
   */
  getActiveKeyId(): string {
    // If we have an 'active' labeled key in vault, we return its ID. 
    // Usually, the system would maintain a map of all keys and 'active' points to current ID.
    // For now, let's assume 'kid-1' is active if vault is not fully seeded.
    if (this.keysCache.has('active_kid')) {
      return this.keysCache.get('active_kid') || 'default-kid-1';
    }
    return 'default-kid-1';
  }
}
