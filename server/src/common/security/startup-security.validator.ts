import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Startup Security Validator
 * 
 * Validates that all critical security secrets are properly configured
 * before the application starts serving requests.
 * 
 * In PRODUCTION: Refuses to start if critical secrets are missing.
 * In DEVELOPMENT: Logs warnings but allows startup with defaults.
 * 
 * Works alongside HashiCorp Vault — checks that Vault has populated
 * the required environment variables or that they were set manually.
 */
@Injectable()
export class StartupSecurityValidator implements OnModuleInit {
  private readonly logger = new Logger(StartupSecurityValidator.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const env = this.config.get<string>('NODE_ENV', 'development');
    const isProduction = env === 'production';

    this.logger.log(`🔐 Running security validation (env: ${env})...`);

    const criticalSecrets = [
      {
        key: 'JWT_SECRET',
        description: 'JWT signing secret for authentication tokens',
        dangerousDefaults: ['dev_secret_change_me', 'fallback_secret', 'secret', 'test'],
      },
      {
        key: 'ENCRYPTION_KEY',
        description: 'AES-256 encryption key for patient PII (nationalId, phone, email)',
        dangerousDefaults: ['your-secret-key-32-chars-long-!!!'],
      },
    ];

    const importantSecrets = [
      {
        key: 'ENCRYPTION_SALT',
        description: 'Salt for key derivation (scrypt)',
        dangerousDefaults: ['saraya-default-salt-123'],
      },
    ];

    let hasCriticalFailure = false;

    // Check critical secrets
    for (const secret of criticalSecrets) {
      const value = this.config.get<string>(secret.key);

      if (!value) {
        if (isProduction) {
          this.logger.error(
            `🚨 CRITICAL: ${secret.key} is NOT SET! ${secret.description}. ` +
            `Application cannot start in production without this secret. ` +
            `Set it via environment variable or HashiCorp Vault.`
          );
          hasCriticalFailure = true;
        } else {
          this.logger.warn(
            `⚠️ DEV WARNING: ${secret.key} is not set. Using fallback default. ` +
            `This is acceptable for development but NEVER for production.`
          );
        }
        continue;
      }

      // Check for dangerous default values
      if (secret.dangerousDefaults.includes(value)) {
        if (isProduction) {
          this.logger.error(
            `🚨 CRITICAL: ${secret.key} is set to a known DEFAULT value! ` +
            `This is a severe security risk. Generate a proper secret: ` +
            `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
          );
          hasCriticalFailure = true;
        } else {
          this.logger.warn(
            `⚠️ DEV WARNING: ${secret.key} uses a default value. ` +
            `Generate a proper secret before deploying to production.`
          );
        }
      }
    }

    // Check important (non-critical) secrets
    for (const secret of importantSecrets) {
      const value = this.config.get<string>(secret.key);
      if (!value || secret.dangerousDefaults.includes(value)) {
        this.logger.warn(
          `⚠️ WARNING: ${secret.key} ${!value ? 'is not set' : 'uses a default value'}. ` +
          `${secret.description}. Consider setting a unique value.`
        );
      }
    }

    // In production, refuse to start with critical failures
    if (isProduction && hasCriticalFailure) {
      this.logger.error(
        `\n` +
        `╔══════════════════════════════════════════════════════╗\n` +
        `║  🛑 APPLICATION STARTUP BLOCKED                     ║\n` +
        `║                                                      ║\n` +
        `║  Critical security secrets are missing or unsafe.    ║\n` +
        `║  Configure them via HashiCorp Vault or env vars.     ║\n` +
        `║                                                      ║\n` +
        `║  Required:                                           ║\n` +
        `║  • JWT_SECRET (authentication)                       ║\n` +
        `║  • ENCRYPTION_KEY (patient data encryption)          ║\n` +
        `║                                                      ║\n` +
        `║  See: vault-migration.ts for auto-setup              ║\n` +
        `╚══════════════════════════════════════════════════════╝`
      );
      throw new Error('SECURITY_STARTUP_BLOCKED: Critical secrets missing in production environment');
    }

    this.logger.log('✅ Security validation passed.');
  }
}
