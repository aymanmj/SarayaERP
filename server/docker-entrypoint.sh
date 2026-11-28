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

# ── IMPORTANT: disable set -e for the migration block ──
# prisma migrate deploy returns non-zero on failure, which would
# kill the script before we can inspect the error.
set +e

RETRIES=5
MIGRATE_SUCCESS=false

while [ $RETRIES -gt 0 ]; do
  echo "🔄 Running prisma migrate deploy (attempt $((6-RETRIES))/5)..."
  OUTPUT=$(npx prisma migrate deploy 2>&1)
  EXIT_CODE=$?
  echo "$OUTPUT"

  if [ $EXIT_CODE -eq 0 ]; then
    MIGRATE_SUCCESS=true
    break
  fi

  # A non-empty database or a failed migration requires an operator review.
  # Never infer that it is disposable from user count or rewrite migration history.
  if echo "$OUTPUT" | grep -qE "P3005|P3009|P3018|P3014|P3004"; then
    echo "❌ Migration requires manual review. Startup stopped without automatic schema repair."
    echo "   Back up the database, inspect the failed migration and follow docs/deployment/migration-recovery.md."
    exit 1
  fi

  # ── Transient failure (DB not ready yet) ──
  RETRIES=$((RETRIES-1))
  echo "⚠️  Migration failed (transient). Retrying in 5s... ($RETRIES attempts left)"
  sleep 5
done

# Re-enable strict mode
set -e

if [ "$MIGRATE_SUCCESS" != "true" ]; then
  echo "❌ Error: Could not apply migrations after 5 attempts."
  echo "Last output was:"
  echo "$OUTPUT"
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

    # --------------------------------------------
    # 2.1 مزامنة صلاحيات الموارد البشرية والأرشفة (Batch 45 Incremental Permissions)
    # --------------------------------------------
    node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    (async () => {
      const defs = [
        { code: 'hr:employees:view', description: 'عرض ملفات الموظفين والهيكل الوظيفي', hr: true },
        { code: 'archive:view', description: 'عرض الأرشيف الإلكتروني والمراسلات', hr: true },
        { code: 'archive:manage', description: 'إدارة المستندات والإصدارات والتصنيفات', hr: false },
        { code: 'archive:correspondence:route', description: 'تسجيل وإحالة المراسلات الصادرة والواردة', hr: true },
        { code: 'archive:delete', description: 'حذف المستندات والتصنيفات المؤرشفة', hr: false },
      ];
      const [adminR, superR, hrR] = await Promise.all([
        prisma.role.findUnique({ where: { name: 'ADMIN' }, select: { id: true } }),
        prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' }, select: { id: true } }),
        prisma.role.findUnique({ where: { name: 'HR' }, select: { id: true } }),
      ]);
      for (const d of defs) {
        const p = await prisma.permission.upsert({
          where: { code: d.code },
          update: { description: d.description },
          create: { code: d.code, description: d.description },
          select: { id: true },
        });
        for (const r of [adminR, superR]) {
          if (!r) continue;
          await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: r.id, permissionId: p.id } },
            update: {},
            create: { roleId: r.id, permissionId: p.id },
          });
        }
        if (d.hr && hrR) {
          await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: hrR.id, permissionId: p.id } },
            update: {},
            create: { roleId: hrR.id, permissionId: p.id },
          });
        }
      }
    })().catch(e => { console.error('⚠️ Batch 45 perm sync warning:', e.message); }).finally(() => prisma.\$disconnect());
    "
fi

# --------------------------------------------
# 2.2 بيانات العرض التنفيذي (Opt-In Demo Dataset)
# --------------------------------------------
# لا يعمل أبداً في الإنتاج القياسي إلا عند تفعيل RUN_DEMO_SEED=true صراحةً
if [ "$RUN_DEMO_SEED" = "true" ]; then
    echo "🏥 RUN_DEMO_SEED=true — verifying Libyan hospital executive demo dataset..."
    if [ -f "dist/prisma-demo/prisma/seed-demo.js" ]; then
        node dist/prisma-demo/prisma/seed-demo.js
        echo "✅ Demo dataset check/seed completed."
    else
        echo "⚠️  Compiled demo seed not found at dist/prisma-demo/prisma/seed-demo.js."
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
# Vault is OPTIONAL — errors here must NOT crash the container
set +e
echo "🔐 Running Vault Auto-Unseal & Init..."
export VAULT_KEYS_PATH="/app/data/keys/vault-cluster.json"

# Ensure keys directory exists and is writable
mkdir -p /app/data/keys 2>/dev/null || true

if [ -f "dist/src/scripts/vault-auto-unseal.js" ]; then
    node dist/src/scripts/vault-auto-unseal.js 2>&1 || echo "⚠️  Vault auto-unseal failed (non-fatal). Continuing..."
elif [ -f "dist/scripts/vault-auto-unseal.js" ]; then
    node dist/scripts/vault-auto-unseal.js 2>&1 || echo "⚠️  Vault auto-unseal failed (non-fatal). Continuing..."
else
    echo "ℹ️  No vault-auto-unseal script found. Skipping."
fi

# Extract and export Vault Root Token safely so Nest and Migration use it
if [ -f "$VAULT_KEYS_PATH" ]; then
    export VAULT_TOKEN=$(node -e "console.log(require('$VAULT_KEYS_PATH').root_token)" 2>/dev/null || echo "")
fi

# --------------------------------------------
# 3.5 ترحيل البيانات السريّة لـ HashiCorp Vault بسلاسة للعملاء الحاليين
# --------------------------------------------
echo "🔄 Running Vault Auto-Migration for Legacy Deployments..."
if [ -f "dist/src/scripts/vault-migration.js" ]; then
    node dist/src/scripts/vault-migration.js 2>&1 || echo "⚠️  Vault migration failed (non-fatal). Continuing..."
elif [ -f "dist/scripts/vault-migration.js" ]; then
    node dist/scripts/vault-migration.js 2>&1 || echo "⚠️  Vault migration failed (non-fatal). Continuing..."
else
    echo "ℹ️  No vault-migration script found. Skipping."
fi
set -e

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

