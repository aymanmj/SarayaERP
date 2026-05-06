import { Logger } from '@nestjs/common';
import axios from 'axios';

const logger = new Logger('VaultLoader');

/**
 * Maximum number of retries to connect to Vault before falling back to .env values.
 * Vault runs locally inside Docker, so brief unavailability (sealed, startup race)
 * should not kill the application.
 */
const VAULT_MAX_RETRIES = 3;
const VAULT_RETRY_DELAY_MS = 2000;

async function fetchWithRetry(url: string, token: string, retries: number): Promise<Record<string, any>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: { 'X-Vault-Token': token },
        timeout: 3000,
      });

      const secrets = response.data?.data?.data;
      if (secrets) {
        logger.log('✅ Successfully pulled application secrets from Vault (SSOT).');
        return secrets;
      }

      logger.warn('⚠️ Vault returned empty secrets for path secret/data/saraya');
      return {};
    } catch (error: any) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      logger.warn(`⏳ Vault attempt ${attempt}/${retries} failed: ${error.message}. Retrying in ${VAULT_RETRY_DELAY_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, VAULT_RETRY_DELAY_MS));
    }
  }
  return {};
}

export default async (): Promise<Record<string, any>> => {
  const vaultUrl = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  
  if (!vaultUrl || !vaultToken) {
    logger.warn('⚠️ VAULT_ADDR or VAULT_TOKEN is missing. Application will fallback to .env values.');
    return {};
  }

  try {
    return await fetchWithRetry(`${vaultUrl}/v1/secret/data/saraya`, vaultToken, VAULT_MAX_RETRIES);
  } catch (error: any) {
    logger.error(`❌ Failed to connect to Vault after ${VAULT_MAX_RETRIES} attempts: ${error.message}`);
    
    // OFFLINE-RESILIENCE: Do NOT crash the application when Vault is temporarily
    // unavailable. The .env values provide a valid fallback. Vault runs locally
    // inside Docker and will reconnect on the next hourly refresh cycle in
    // VaultService. Crashing here causes 502 errors for all users when internet
    // drops (even though Vault is local, startup race conditions can cause this).
    logger.warn('⚠️ Running with .env fallback values. Vault secrets will sync on next refresh cycle.');
    return {};
  }
};
