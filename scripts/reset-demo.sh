#!/bin/bash
# ==============================================================================
# Saraya ERP - Reset Ubuntu VM Demo Database (Preserves License & Machine ID)
# ==============================================================================
# Drops and recreates the demo schema cleanly, then restarts saraya_demo_backend
# so docker-entrypoint.sh re-applies all migrations + seed.js + seed-demo.js.
#
# Usage:
#   sudo /opt/saraya-demo/scripts/reset-demo.sh
# ==============================================================================

set -euo pipefail

INSTALL_DIR="${SARAYA_DEMO_DIR:-/opt/saraya-demo}"
cd "$INSTALL_DIR"

if [ ! -f ".env.demo" ]; then
  echo "Error: ${INSTALL_DIR}/.env.demo not found."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source ".env.demo"
set +a

DB_USER="${POSTGRES_USER:-saraya_demo}"
DB_NAME="${POSTGRES_DB:-saraya_demo}"

echo "🔄 Stopping demo backend container..."
docker compose -f docker-compose.demo.yml --env-file .env.demo stop backend

echo "🧹 Resetting PostgreSQL public schema in ${DB_NAME}..."
docker exec saraya_demo_db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO \"${DB_USER}\"; GRANT ALL ON SCHEMA public TO public;"

echo "🧹 Flushing Redis cache..."
docker exec saraya_demo_redis redis-cli -a "$REDIS_PASSWORD" FLUSHALL >/dev/null

echo "🚀 Restarting demo backend (applies migrations + seed.js + seed-demo.js)..."
docker compose -f docker-compose.demo.yml --env-file .env.demo start backend

echo "⏳ Waiting for backend to finish seeding and pass healthcheck..."
for i in $(seq 1 60); do
  if docker exec saraya_demo_backend curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    echo "✅ Demo database reset complete! License at ${INSTALL_DIR}/data/license/ was preserved."
    exit 0
  fi
  sleep 2
done

echo "❌ Backend did not become healthy in time. Inspect logs:"
echo "   docker logs --tail 100 saraya_demo_backend"
exit 1
