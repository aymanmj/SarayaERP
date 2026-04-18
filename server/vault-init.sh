#!/bin/bash
# ==========================================
# Saraya ERP - Local Vault Initialization
# ==========================================
# Run this script to populate your local Vault container with the required .env secrets.
# Pre-requisites: Vault container must be running (docker-compose -f docker-compose.local.yml up -d vault)

export VAULT_ADDR="http://127.0.0.1:8200"
export VAULT_TOKEN="root" # Local dev root token

echo "🚀 Connecting to Local Vault at \$VAULT_ADDR..."

# Wait for Vault to be ready
until curl -s \$VAULT_ADDR/v1/sys/health | grep -q '"initialized":true' ; do
  echo "⏳ Waiting for Vault to initialize..."
  sleep 2
done

echo "✅ Vault is responsive."

# Enable KV v2 secrets engine if not enabled
vault secrets enable -path=secret kv-v2 2>/dev/null || echo "ℹ️ KV v2 already enabled at secret/"

# Seed application secrets
echo "🌱 Seeding Saraya ERP secrets..."
vault kv put secret/saraya \
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saraya_db?schema=public" \
  JWT_SECRET="572cd7269320642095b55cf18185dc18d57a6d666f9eafd7f283ac49dacb300f" \
  JWT_REFRESH_SECRET="d2fafd0b2d0a0735f5af98b92735c7b6896ca592f2748cad74a58fba0986d685" \
  JWT_EXPIRES_IN="86400" \
  JWT_REFRESH_EXPIRES_IN="7d" \
  ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" \
  ENCRYPTION_SALT="saraya-enterprise-salt-x921" \
  FHIR_CLIENT_SECRET="enterprise_fhir_secret_change_me" \
  SMTP_PASSWORD="mock-smtp-password" \
  REDIS_PASSWORD="mock-redis-password"

echo "✅ Vault successfully seeded! SSOT is ready."
echo "You can now run 'npm run start:dev'"
