import { Logger } from '@nestjs/common';
import axios from 'axios';

const logger = new Logger('VaultLoader');

export default async (): Promise<Record<string, any>> => {
  const vaultUrl = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  
  if (!vaultUrl || !vaultToken) {
    logger.warn('⚠️ VAULT_ADDR or VAULT_TOKEN is missing. Application will fallback to .env values.');
    return {};
  }

  try {
    // Attempt to fetch KV v2 secrets from HashiCorp Vault
    // Note: KV v2 stores the actual secrets inside data.data
    const response = await axios.get(`${vaultUrl}/v1/secret/data/saraya`, {
      headers: {
        'X-Vault-Token': vaultToken,
      },
      timeout: 3000, // Short timeout so we don't stall boot forever if Vault is down
    });

    const secrets = response.data?.data?.data;
    if (secrets) {
      logger.log('✅ Successfully pulled application secrets from Vault (SSOT).');
      return secrets;
    }

    logger.warn('⚠️ Vault returned empty secrets for path secret/data/saraya');
    return {};
  } catch (error: any) {
    logger.error(`❌ Failed to connect to Vault to fetch secrets: ${error.message}`);
    
    if (process.env.NODE_ENV === 'production') {
      logger.fatal('❌ FATAL: Cannot run in production without HashiCorp Vault. Crashing to trigger Reverse Proxy Maintenance Page.');
      process.exit(1);
    }
    
    logger.warn('⚠️ Developing without Vault. Falling back to local values if available.');
    return {}; // fallback in dev
  }
};
