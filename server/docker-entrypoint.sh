#!/bin/sh
# ============================================
# Saraya ERP - Production Entrypoint
# ============================================
set -e

echo "🚀 Starting Saraya ERP Container..."

# --------------------------------------------
# 1. انتظار قاعدة البيانات (Wait for DB)
# --------------------------------------------
# نحاول الاتصال وتشغيل المايجريشن 5 مرات قبل الاستسلام
# هذا يحل مشكلة "Connection refused" عند بدء تشغيل Docker Compose
echo "📦 Applying database migrations..."
RETRIES=5
until [ $RETRIES -eq 0 ]; do
  npx prisma migrate deploy && break
  RETRIES=$((RETRIES-1))
  echo "⚠️  Migration failed. Waiting for Database... ($RETRIES attempts left)"
  sleep 5
done

if [ $RETRIES -eq 0 ]; then
  echo "❌ Error: Could not connect to Database after multiple attempts."
  exit 1
fi

# --------------------------------------------
# 2. منطق البيانات الأولية (Seeding Logic)
# --------------------------------------------
# إذا تم تمرير متغير SKIP_SEED=true نتجاوز هذه الخطوة
if [ "$SKIP_SEED" != "true" ]; then
    echo "🔍 Checking if database needs seeding..."
    
    # نتحقق من وجود المستخدم 'admin'
    # ملاحظة: نستخدم node مباشرة لتجنب overhead الخاص بـ npx
    SEED_CHECK=$(node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.user.findFirst({ where: { username: 'admin' } })
      .then(user => {
        console.log(user ? 'SEEDED' : 'NEEDS_SEED');
        prisma.\$disconnect();
      })
      .catch(err => {
        console.error('Check Error:', err.message);
        console.log('ERROR');
        prisma.\$disconnect();
        process.exit(1);
      });
    ")

    if [ "$SEED_CHECK" = "NEEDS_SEED" ]; then
        echo "🌱 Fresh database detected. Running seed script..."
        
        # تشغيل ملف JS المترجم مباشرة للأداء
        if [ -f "dist/prisma/seed.js" ]; then
            node dist/prisma/seed.js
        else
            # Fallback في حالة عدم وجود الملف المترجم
            echo "⚠️  Compiled seed not found, falling back to npx..."
            npx prisma db seed
        fi
        
        echo "✅ Seeding completed."
    elif [ "$SEED_CHECK" = "ERROR" ]; then
        echo "⚠️  Could not verify seed status. Skipping to be safe."
    else
        echo "✅ Database already contains data. Skipping seed."
    fi
fi

# --------------------------------------------
# 2.5 تحديث كتالوج التحاليل والأشعة (Lab & Radiology Catalog Update)
# --------------------------------------------
# يتحقق إذا كان الكتالوج الموسّع موجود، وإن لم يكن يضيفه تلقائياً
# آمن تماماً (upsert) — لن يكرر أو يحذف بيانات موجودة
echo "🔍 Checking Lab & Radiology catalog..."
CATALOG_CHECK=$(node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.labTest.count({ where: { isActive: true } })
  .then(count => {
    console.log(count > 20 ? 'UPDATED' : 'NEEDS_UPDATE');
    prisma.\$disconnect();
  })
  .catch(err => {
    console.log('SKIP');
    prisma.\$disconnect();
  });
" 2>/dev/null || echo "SKIP")

if [ "$CATALOG_CHECK" = "NEEDS_UPDATE" ]; then
    echo "📦 Updating Lab & Radiology catalogs..."
    if [ -f "dist/prisma/seeds/seed-lab-radiology.js" ]; then
        node -e "
        const { seedLabRadiology } = require('./dist/prisma/seeds/seed-lab-radiology');
        seedLabRadiology().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
        "
        echo "✅ Lab & Radiology catalogs updated."
    else
        echo "⚠️  Catalog seed file not found in dist. Skipping."
    fi
elif [ "$CATALOG_CHECK" = "UPDATED" ]; then
    echo "✅ Lab & Radiology catalogs already up to date."
else
    echo "⚠️  Could not check catalog status. Skipping."
fi

# --------------------------------------------
# 3. تهيئة وفك تشفير الـ Vault تلقائياً (Auto-Unseal)
# --------------------------------------------
echo "🔐 Running Vault Auto-Unseal & Init..."
export VAULT_KEYS_PATH="/app/data/keys/vault-cluster.json"

if [ -f "dist/src/scripts/vault-auto-unseal.js" ]; then
    node dist/src/scripts/vault-auto-unseal.js
elif [ -f "dist/scripts/vault-auto-unseal.js" ]; then
    node dist/scripts/vault-auto-unseal.js
fi

# Extract and export Vault Root Token safely so Nest and Migration use it
if [ -f "$VAULT_KEYS_PATH" ]; then
    export VAULT_TOKEN=$(node -e "console.log(require('$VAULT_KEYS_PATH').root_token)")
fi

# --------------------------------------------
# 3.5 ترحيل البيانات السريّة لـ HashiCorp Vault بسلاسة للعملاء الحاليين
# --------------------------------------------
echo "🔄 Running Vault Auto-Migration for Legacy Deployments..."
if [ -f "dist/src/scripts/vault-migration.js" ]; then
    node dist/src/scripts/vault-migration.js
elif [ -f "dist/scripts/vault-migration.js" ]; then
    node dist/scripts/vault-migration.js
fi

# --------------------------------------------
# 4. تشغيل الخادم (Start Server)
# --------------------------------------------
echo "🏁 Starting NestJS Application..."

# التحقق من مسار الملف الرئيسي (قد يختلف حسب إعدادات tsconfig)
if [ -f "dist/main.js" ]; then
    exec node dist/main.js
elif [ -f "dist/src/main.js" ]; then
    exec node dist/src/main.js
else
    echo "❌ Error: Could not find main.js in dist/ or dist/src/"
    echo "Current directory contents:"
    ls -R dist/
    exit 1
fi



# #!/bin/sh
# # ============================================
# # Saraya ERP - Docker Entrypoint Script
# # ============================================
# # This script runs on container startup:
# # 1. Syncs database schema (handles drift)
# # 2. Applies migrations
# # 3. Seeds the database (only on first run)
# # 4. Starts the Node.js server

# set -e

# echo "🚀 Starting Saraya ERP Backend..."

# # Step 1: Sync database schema (Safe Migration)
# if [ "$BASELINE_MIGRATIONS" = "true" ]; then
#     echo "⚠️ BASELINE_MIGRATIONS=true detected. Running baseline script..."
#     node scripts/baseline.js
# fi

# echo "📦 Applying database migrations..."
# npx prisma migrate deploy

# # Step 2: Check if seeding is needed (first run detection)
# # We check if the admin user exists - if not, this is a fresh database
# echo "🔍 Checking if database needs seeding..."
# SEED_CHECK=$(node -e "
# const { PrismaClient } = require('@prisma/client');
# const prisma = new PrismaClient();
# prisma.user.findFirst({ where: { username: 'admin' } })
#   .then(user => {
#     console.log(user ? 'SEEDED' : 'NEEDS_SEED');
#     prisma.\$disconnect();
#   })
#   .catch(() => {
#     console.log('NEEDS_SEED');
#     prisma.\$disconnect();
#   });
# " 2>/dev/null || echo "NEEDS_SEED")

# if [ "$SEED_CHECK" = "NEEDS_SEED" ]; then
#     echo "🌱 First run detected! Seeding database..."
#     npx prisma db seed
#     echo "✅ Database seeded successfully!"
# else
#     echo "✅ Database already seeded, skipping..."
# fi

# # Step 3: Start the server
# echo "🏁 Starting Node.js server..."
# exec node dist/src/main.js
