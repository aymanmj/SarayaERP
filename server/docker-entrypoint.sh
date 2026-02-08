#!/bin/sh
# ============================================
# Saraya ERP - Docker Entrypoint Script
# ============================================
# This script runs on container startup:
# 1. Syncs database schema (handles drift)
# 2. Applies migrations
# 3. Seeds the database (only on first run)
# 4. Starts the Node.js server

set -e

echo "🚀 Starting Saraya ERP Backend..."

# Step 1: Sync database schema (Safe Migration)
if [ "$BASELINE_MIGRATIONS" = "true" ]; then
    echo "⚠️ BASELINE_MIGRATIONS=true detected. Running baseline script..."
    node scripts/baseline.js
fi

echo "📦 Applying database migrations..."
npx prisma migrate deploy

# Step 2: Check if seeding is needed (first run detection)
# We check if the admin user exists - if not, this is a fresh database
echo "🔍 Checking if database needs seeding..."
SEED_CHECK=$(node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findFirst({ where: { username: 'admin' } })
  .then(user => {
    console.log(user ? 'SEEDED' : 'NEEDS_SEED');
    prisma.\$disconnect();
  })
  .catch(() => {
    console.log('NEEDS_SEED');
    prisma.\$disconnect();
  });
" 2>/dev/null || echo "NEEDS_SEED")

if [ "$SEED_CHECK" = "NEEDS_SEED" ]; then
    echo "🌱 First run detected! Seeding database..."
    npx prisma db seed
    echo "✅ Database seeded successfully!"
else
    echo "✅ Database already seeded, skipping..."
fi

# Step 3: Start the server
echo "🏁 Starting Node.js server..."
exec node dist/src/main.js
