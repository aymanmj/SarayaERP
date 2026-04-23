import axios from 'axios';

/**
 * 🚀 Legacy to Vault Seamless Migration Script
 * 
 * Runs automatically during Docker entrypoint.
 * If Vault is fresh (empty) but the server has legacy `.env` configurations injected via
 * the host machine (process.env), this script pushes them to HashiCorp Vault automatically.
 * Ensures ZERO downtime for remote clients updating via ghcr.
 */
async function migrateToVault() {
  const vaultUrl = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;

  // Only run if Vault is configured in the environment
  if (!vaultUrl || !vaultToken) {
    console.log('⚠️  VAULT_ADDR or VAULT_TOKEN not found in process.env. Skipping auto-migration.');
    return;
  }

  // Check if Vault is already seeded
  try {
    const response = await axios.get(`${vaultUrl}/v1/secret/data/saraya`, {
      headers: { 'X-Vault-Token': vaultToken },
      timeout: 5000,
      validateStatus: (status) => status < 500, // Handle 404 cleanly
    });

    if (response.status === 200 && response.data?.data?.data) {
      console.log('✅ HashiCorp Vault is already seeded. Migration skipped.');
      return;
    }

    if (response.status === 404) {
      console.log('🔄 Fresh Vault detected. Checking for legacy environment variables to migrate...');
      
      // Collect legacy variables to migrate
      const legacySecrets = {
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
        JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
        ENCRYPTION_SALT: process.env.ENCRYPTION_SALT,
        FHIR_CLIENT_SECRET: process.env.FHIR_CLIENT_SECRET,
        SMTP_PASSWORD: process.env.SMTP_PASSWORD,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        
      };

      // Filter out mapped secrets to see if any exist
      const populatedSecrets = Object.fromEntries(
        Object.entries(legacySecrets).filter(([_, v]) => v !== undefined && v !== null && v !== '')
      );

      if (Object.keys(populatedSecrets).length === 0) {
        console.log('⚠️  No legacy secrets found in environment to migrate. Continuing...');
        return;
      }

      // Initialize KV Engine just in case
      try {
        await axios.post(`${vaultUrl}/v1/sys/mounts/secret`, {
          type: 'kv-v2'
        }, { headers: { 'X-Vault-Token': vaultToken } });
      } catch (e: any) {
        if (e.response?.status !== 400) {
          console.log(`ℹ️ Note: KV Engine check: ${e.message}`);
        }
      }

      // Push to Vault
      await axios.post(`${vaultUrl}/v1/secret/data/saraya`, {
        data: populatedSecrets
      }, {
        headers: { 'X-Vault-Token': vaultToken }
      });

      console.log('✅ BINGO! Legacy secrets successfully migrated to HashiCorp Vault!');
      console.log('🛡️  Your system is now enterprise-grade. Please remove sensitive keys from your .env file on the host.');
    }
  } catch (error: any) {
    console.error(`❌ Migration check failed to connect to Vault: ${error.message}`);
  }
}

migrateToVault().catch((err) => {
  console.error('Fatal Migration Error:', err);
});
