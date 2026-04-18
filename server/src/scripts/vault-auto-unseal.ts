import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 🚀 Vault Auto-Unseal & Init Script
 * 
 * Runs automatically during Docker entrypoint.
 * Initializes Vault if it's fresh and unseals it if it's sealed.
 * Saves the cluster keys securely to a local volume mapping.
 */
async function autoUnsealVault() {
  const vaultUrl = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
  const keysPath = process.env.VAULT_KEYS_PATH || '/app/data/keys/vault-cluster.json';

  try {
    // Wait for vault to be responsive
    for (let i = 0; i < 10; i++) {
        try {
            await axios.get(`${vaultUrl}/v1/sys/health`, { validateStatus: () => true, timeout: 2000 });
            break;
        } catch (e) {
            console.log(`⏳ Waiting for Vault API... (${i + 1}/10)`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // 1. Check Initialization Status
    const initRes = await axios.get(`${vaultUrl}/v1/sys/init`);
    let keys: { keys: string[], root_token: string } | null = null;
    
    if (!initRes.data.initialized) {
      console.log('🔄 Vault is Uninitialized. Initializing Vault cluster...');
      
      const payload = {
        secret_shares: 3,
        secret_threshold: 3
      };
      
      const res = await axios.post(`${vaultUrl}/v1/sys/init`, payload);
      
      keys = {
        keys: res.data.keys,
        root_token: res.data.root_token
      };

      // Create directory if not exists
      const dir = path.dirname(keysPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save keys securely
      fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2), { mode: 0o600 });
      console.log(`✅ Vault Initialized! Keys saved safely to ${keysPath}`);
    } else {
      console.log('✅ Vault is already initialized.');
      // Load keys from file if exists
      if (fs.existsSync(keysPath)) {
        keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
      } else {
        console.error(
          `❌ Vault is initialized but keys file (${keysPath}) is missing! Cannot auto-unseal or fetch root token. ` +
            'Fix volume permissions (e.g. chown 1000:1000 on host ./data/keys) and reset Vault storage if needed — see docs/vault-production.md.',
        );
        process.exit(1);
      }
    }

    // 2. Check Seal Status
    const sealRes = await axios.get(`${vaultUrl}/v1/sys/seal-status`);
    if (sealRes.data.sealed) {
      console.log('🔓 Vault is Sealed. Auto-unsealing now...');
      
      let unsealed = false;
      for (const key of keys!.keys) {
        const unsealRes = await axios.post(`${vaultUrl}/v1/sys/unseal`, { key });
        if (!unsealRes.data.sealed) {
            unsealed = true;
            break;
        }
      }

      if (unsealed) {
        console.log('✅ Vault successfully Unsealed!');
      } else {
        console.error('❌ Failed to unseal Vault! Threshold not met.');
      }
    } else {
      console.log('✅ Vault is already unsealed.');
    }

    // Export the token so the entrypoint can inject it
    console.log(`VAULT_ROOT_TOKEN_READY`);

  } catch (error: any) {
    console.error(`❌ Vault Auto-Unseal Error: ${error.message}`);
    process.exit(1);
  }
}

autoUnsealVault();
