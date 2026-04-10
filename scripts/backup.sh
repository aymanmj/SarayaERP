#!/bin/bash
# ============================================
# Saraya ERP - Database Backup Script
# يقبل مسار هدف اختياري كـ argument
# ============================================

set -e

# Configuration
DEFAULT_BACKUP_DIR="/backups"
BACKUP_DIR="${1:-$DEFAULT_BACKUP_DIR}"  # يستخدم المسار المُمرر أو الافتراضي
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${BACKUP_DIR}/saraya_backup_${DATE}.sql.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔄 بدء النسخ الاحتياطي $(date)${NC}"
echo -e "${GREEN}📂 مسار الهدف: ${BACKUP_DIR}${NC}"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

# Perform the backup
PGPASSWORD=${POSTGRES_PASSWORD} pg_dump \
    -h ${POSTGRES_HOST:-postgres} \
    -U ${POSTGRES_USER:-admin} \
    -d ${POSTGRES_DB:-saraya_erp} \
    -F c \
    | gzip > ${BACKUP_FILE}

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ تم النسخ الاحتياطي بنجاح: ${BACKUP_FILE}${NC}"
    
    # Show backup size
    BACKUP_SIZE=$(ls -lh ${BACKUP_FILE} | awk '{print $5}')
    echo -e "${GREEN}📦 حجم النسخة: ${BACKUP_SIZE}${NC}"

    # إذا المسار مختلف عن الافتراضي، انسخ أيضاً في المسار الافتراضي (للأمان)
    if [ "${BACKUP_DIR}" != "${DEFAULT_BACKUP_DIR}" ]; then
        SECONDARY_FILE="${DEFAULT_BACKUP_DIR}/saraya_backup_${DATE}.sql.gz"
        cp "${BACKUP_FILE}" "${SECONDARY_FILE}" 2>/dev/null && \
            echo -e "${YELLOW}📋 تم حفظ نسخة ثانية في المسار الافتراضي${NC}" || \
            echo -e "${YELLOW}⚠️ تعذر حفظ نسخة ثانية في المسار الافتراضي${NC}"
    fi
else
    echo -e "${RED}❌ فشل النسخ الاحتياطي!${NC}"
    exit 1
fi

# Cleanup old backups (keep last N days) — فقط في المسار الهدف
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
echo -e "${GREEN}🧹 تنظيف النسخ الأقدم من ${RETENTION_DAYS} يوماً في: ${BACKUP_DIR}${NC}"
find ${BACKUP_DIR} -name "saraya_backup_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete

# List remaining backups
echo -e "${GREEN}📋 النسخ الموجودة في المسار الهدف:${NC}"
ls -lh ${BACKUP_DIR}/saraya_backup_*.sql.gz 2>/dev/null || echo "لا توجد نسخ"

echo -e "${GREEN}🏁 انتهت عملية النسخ الاحتياطي $(date)${NC}"
