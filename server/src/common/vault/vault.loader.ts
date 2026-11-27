import { Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as https from 'node:https';
import axios from 'axios';

const logger = new Logger('VaultLoader');

const VAULT_MAX_RETRIES = 3;
const VAULT_RETRY_DELAY_MS = 2000;

interface VaultKvResponse {
  data?: {
    data?: Record<string, string>;
  };
}

interface VaultAppRoleLoginResponse {
  auth?: {
    client_token?: string;
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function resolveVaultToken(
  vaultUrl: string,
  httpsAgent?: https.Agent,
): Promise<string | undefined> {
  const roleId = process.env.VAULT_ROLE_ID;
  const secretId = process.env.VAULT_SECRET_ID;
  if (roleId && secretId) {
    const response = await axios.post<VaultAppRoleLoginResponse>(
      `${vaultUrl}/v1/auth/approle/login`,
      { role_id: roleId, secret_id: secretId },
      { timeout: 3000, ...(httpsAgent ? { httpsAgent } : {}) },
    );
    const clientToken = response.data?.auth?.client_token;
    if (clientToken) {
      return clientToken;
    }
  }
  return process.env.VAULT_TOKEN;
}

async function fetchWithRetry(
  url: string,
  token: string,
  retries: number,
  httpsAgent?: https.Agent,
): Promise<Record<string, string>> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get<VaultKvResponse>(url, {
        headers: { 'X-Vault-Token': token },
        timeout: 3000,
        ...(httpsAgent ? { httpsAgent } : {}),
      });

      const secrets = response.data?.data?.data;
      if (secrets) {
        logger.log(
          '✅ Successfully pulled application secrets from Vault (SSOT).',
        );
        return secrets;
      }

      logger.warn(
        '⚠️ Vault returned empty secrets for path secret/data/saraya',
      );
      return {};
    } catch (error: unknown) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      logger.warn(
        `⏳ Vault attempt ${attempt}/${retries} failed: ${getErrorMessage(error)}. Retrying in ${VAULT_RETRY_DELAY_MS}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, VAULT_RETRY_DELAY_MS));
    }
  }
  return {};
}

export default async (): Promise<Record<string, string>> => {
  const vaultUrl = process.env.VAULT_ADDR;
  const hasAppRole = Boolean(
    process.env.VAULT_ROLE_ID && process.env.VAULT_SECRET_ID,
  );

  if (!vaultUrl || (!process.env.VAULT_TOKEN && !hasAppRole)) {
    logger.warn(
      '⚠️ VAULT_ADDR or Vault credentials missing. Application will fallback to .env values.',
    );
    return {};
  }

  const caCertPath = process.env.VAULT_CACERT;
  const httpsAgent =
    caCertPath && fs.existsSync(caCertPath)
      ? new https.Agent({ ca: fs.readFileSync(caCertPath) })
      : undefined;

  try {
    const vaultToken = await resolveVaultToken(vaultUrl, httpsAgent);
    if (!vaultToken) {
      return {};
    }
    return await fetchWithRetry(
      `${vaultUrl}/v1/secret/data/saraya`,
      vaultToken,
      VAULT_MAX_RETRIES,
      httpsAgent,
    );
  } catch (error: unknown) {
    logger.error(
      `❌ Failed to connect to Vault after ${VAULT_MAX_RETRIES} attempts: ${getErrorMessage(error)}`,
    );
    logger.warn(
      '⚠️ Running with .env fallback values. Vault secrets will sync on next refresh cycle.',
    );
    return {};
  }
};
