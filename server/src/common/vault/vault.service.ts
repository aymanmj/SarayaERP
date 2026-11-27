import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as fs from 'node:fs';
import * as https from 'node:https';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

interface VaultKvResponse {
  data?: {
    data?: Record<string, string>;
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getAxiosStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const resp = (error as { response?: { status?: unknown } }).response;
    if (typeof resp?.status === 'number') {
      return resp.status;
    }
  }
  return undefined;
}

/**
 * Enterprise Key Management Service using HashiCorp Vault
 */
@Injectable()
export class VaultService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VaultService.name);
  private keysCache: Map<string, string> = new Map();
  private defaultSecret: string;
  private vaultUrl: string;
  private vaultToken: string;
  private vaultRoleId?: string;
  private vaultSecretId?: string;
  private httpsAgent?: https.Agent;
  private isVaultEnabled: boolean;
  private refreshInterval?: ReturnType<typeof setInterval>;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.defaultSecret = this.configService.get<string>(
      'JWT_SECRET',
      'fallback_secret',
    );
    this.vaultUrl = this.configService.get<string>(
      'VAULT_ADDR',
      'http://127.0.0.1:8200',
    );
    this.vaultToken = this.configService.get<string>(
      'VAULT_TOKEN',
      'saraya-root-token-dev',
    );
    this.vaultRoleId = this.configService.get<string>('VAULT_ROLE_ID');
    this.vaultSecretId = this.configService.get<string>('VAULT_SECRET_ID');

    const caCertPath = this.configService.get<string>('VAULT_CACERT');
    if (caCertPath && fs.existsSync(caCertPath)) {
      this.httpsAgent = new https.Agent({
        ca: fs.readFileSync(caCertPath),
      });
    }

    // In production, require Vault. In dev, we can fallback gracefully.
    const env = this.configService.get<string>('NODE_ENV', 'development');
    this.isVaultEnabled = env === 'production' || !!process.env.VAULT_ADDR;
  }

  async onModuleInit() {
    this.logger.log('Initializing Key Management System (Vault)...');
    try {
      await this.refreshKeys();

      // Schedule key refreshment every hour
      this.refreshInterval = setInterval(
        () => {
          this.refreshKeys().catch((err) =>
            this.logger.error('Failed to refresh keys', err),
          );
        },
        60 * 60 * 1000,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to connect to Vault, falling back to ENV variables. Error: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Refreshes keys from HashiCorp vault
   */
  onModuleDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  private async authenticateWithAppRole(): Promise<void> {
    if (!this.vaultRoleId || !this.vaultSecretId) return;

    const postConfig = this.httpsAgent
      ? { httpsAgent: this.httpsAgent }
      : undefined;
    const response = await lastValueFrom(
      this.httpService.post<{ auth?: { client_token?: string } }>(
        `${this.vaultUrl}/v1/auth/approle/login`,
        {
          role_id: this.vaultRoleId,
          secret_id: this.vaultSecretId,
        },
        postConfig,
      ),
    );
    const clientToken = response.data?.auth?.client_token;
    if (clientToken) {
      this.vaultToken = clientToken;
    }
  }

  async refreshKeys() {
    if (!this.isVaultEnabled) return;
    try {
      await this.authenticateWithAppRole();

      // Use central KV-V2 path for Saraya Secrets
      const response = await lastValueFrom(
        this.httpService.get<VaultKvResponse>(
          `${this.vaultUrl}/v1/secret/data/saraya`,
          {
            headers: { 'X-Vault-Token': this.vaultToken },
            ...(this.httpsAgent ? { httpsAgent: this.httpsAgent } : {}),
          },
        ),
      );

      const secrets = response.data?.data?.data ?? {};
      for (const [kid, secret] of Object.entries(secrets)) {
        this.keysCache.set(kid, secret);
      }
      this.logger.log(
        `Successfully fetched ${Object.keys(secrets).length} enterprise secrets from Vault.`,
      );
    } catch (error: unknown) {
      if (getAxiosStatus(error) === 404) {
        this.logger.warn(
          'Vault path "secret/data/saraya" not found. Need to initialize secrets.',
        );
      } else {
        throw error;
      }
    }
  }

  private isAllowedJwtKid(kid: string): boolean {
    return (
      kid === 'JWT_SECRET' ||
      /^JWT_SIGNING_KEY_[A-Za-z0-9_-]+$/.test(kid) ||
      /^jwt_key_[A-Za-z0-9_-]+$/.test(kid)
    );
  }

  /**
   * Get a specific key by ID.
   * If 'kid' is not provided, returns the ACTIVE key for the system.
   */
  getKeyOrSecret(kid?: string): Promise<string> {
    if (!kid || kid === 'active' || kid === 'default-kid-1') {
      return Promise.resolve(
        this.keysCache.get('JWT_SECRET') || this.defaultSecret,
      );
    }
    if (!this.isAllowedJwtKid(kid)) {
      return Promise.reject(new Error('Invalid JWT key identifier'));
    }
    const found = this.keysCache.get(kid);
    if (!found) {
      return Promise.reject(new Error('Unknown JWT signing key'));
    }
    return Promise.resolve(found);
  }

  /**
   * Get a secret from Vault without fallback.
   * Returns null if the key is not found — use this for non-JWT secrets
   * (e.g., TELEGRAM_BOT_TOKEN, SMTP_PASSWORD) where falling back to
   * JWT_SECRET would be incorrect and potentially dangerous.
   */
  getOptionalSecret(key: string): Promise<string | null> {
    return Promise.resolve(this.keysCache.get(key) || null);
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
