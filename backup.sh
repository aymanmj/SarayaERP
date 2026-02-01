#!/bin/bash

# إعداد المتغيرات
BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/saraya_backup_$TIMESTAMP.sql"
RETENTION_DAYS=7

# التأكد من وجود المجلد
mkdir -p $BACKUP_DIR

# تنفيذ النسخ الاحتياطي
# PGPASSWORD يأتي من متغيرات البيئة في الحاوية
export PGPASSWORD=$POSTGRES_PASSWORD

echo "📦 Starting backup: $BACKUP_FILE"

pg_dump -h postgres -U $POSTGRES_USER -d $POSTGRES_DB > $BACKUP_FILE

if [ $? -eq 0 ]; then
  echo "✅ Backup successful: $BACKUP_FILE"
  # ضغط الملف لتوفير المساحة
  gzip $BACKUP_FILE
  
  # حذف النسخ القديمة (أقدم من 7 أيام)
  find $BACKUP_DIR -name "saraya_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
else
  echo "❌ Backup failed!"
fi
