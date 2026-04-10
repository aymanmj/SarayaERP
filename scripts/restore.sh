#!/bin/bash
# ============================================
# Saraya ERP - Database Restore Script
# يقبل المسار الكامل لملف النسخة أو اسم الملف فقط
# ============================================

set -e

# Configuration
DEFAULT_BACKUP_DIR="/backups"
LOG_FILE="/var/log/saraya-restore.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file_path_or_filename>"
    exit 1
fi

# تحديد المسار الكامل للملف
INPUT="$1"
if [[ "$INPUT" == /* ]]; then
    # مسار كامل (يبدأ بـ /)
    BACKUP_FILE="$INPUT"
else
    # اسم ملف فقط — نبحث في المسار الافتراضي
    BACKUP_FILE="${DEFAULT_BACKUP_DIR}/$INPUT"
fi

log "=========================================="
log "بدء عملية الاستعادة..."
log "ملف النسخة: $BACKUP_FILE"

# التحقق من وجود الملف
if [ ! -f "$BACKUP_FILE" ]; then
    log_error "ملف النسخة غير موجود: $BACKUP_FILE"
    exit 1
fi

# التحقق من أن الملف غير فارغ
if [ ! -s "$BACKUP_FILE" ]; then
    log_error "ملف النسخة فارغ"
    exit 1
fi

# عرض حجم الملف
FILE_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
log "📦 حجم ملف النسخة: $FILE_SIZE"

log "جاري استعادة قاعدة البيانات saraya_erp..."

export PGPASSWORD=${POSTGRES_PASSWORD}

if gunzip -c "$BACKUP_FILE" | pg_restore \
    -h ${POSTGRES_HOST:-postgres} \
    -U ${POSTGRES_USER:-admin} \
    -d ${POSTGRES_DB:-saraya_erp} \
    -c --if-exists \
    -v >> "$LOG_FILE" 2>&1; then
    
    log "✅ تمت الاستعادة بنجاح"
else
    log_error "❌ فشلت الاستعادة — راجع السجلات"
    exit 1
fi

log "=========================================="
