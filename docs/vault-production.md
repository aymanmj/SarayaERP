# HashiCorp Vault — production recovery

Use this when the backend logs show **503** from Vault, or: *Vault is initialized but keys file is missing*.

**Cause:** Vault was initialized but `vault-cluster.json` could not be written under `./data/keys` (often wrong ownership vs. `user: node`, UID **1000** in the official image).

## One-time fix on the server

1. Stop backend and Vault:
   `docker compose -f docker-compose.production.yml stop backend vault`

2. Create the keys directory and ownership (prefer `chown` over world-writable dirs):
   - `mkdir -p /opt/saraya-erp/data/keys`
   - `sudo chown -R 1000:1000 /opt/saraya-erp/data/keys`

3. Reset Vault file storage (destroys Vault data only; not PostgreSQL). **Back up** if you had secrets only in Vault:
   - `docker exec -u root saraya_vault sh -c "rm -rf /vault/file/*"`

4. Remove the obsolete named volume for keys if it still exists (optional): `docker volume ls` then `docker volume rm <project>_vault_keys` if present.

5. Start the stack and watch logs:
   - `docker compose -f docker-compose.production.yml up -d`
   - `docker logs -f saraya_backend`

You should see successful init/unseal and a new `data/keys/vault-cluster.json` on the host.

## SMTP warnings

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD` in `.env` on the host to clear compose warnings and enable mail.
