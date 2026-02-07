#!/bin/bash
# ============================================
# Saraya ERP - Database Backup Script
# ============================================

set -e

# Configuration
BACKUP_DIR="/backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${BACKUP_DIR}/saraya_backup_${DATE}.sql.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔄 Starting backup at $(date)${NC}"

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
    echo -e "${GREEN}✅ Backup completed successfully: ${BACKUP_FILE}${NC}"
    
    # Show backup size
    BACKUP_SIZE=$(ls -lh ${BACKUP_FILE} | awk '{print $5}')
    echo -e "${GREEN}📦 Backup size: ${BACKUP_SIZE}${NC}"
else
    echo -e "${RED}❌ Backup failed!${NC}"
    exit 1
fi

# Cleanup old backups (keep last N days)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
echo -e "${GREEN}🧹 Cleaning backups older than ${RETENTION_DAYS} days...${NC}"
find ${BACKUP_DIR} -name "saraya_backup_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete

# List remaining backups
echo -e "${GREEN}📋 Current backups:${NC}"
ls -lh ${BACKUP_DIR}/saraya_backup_*.sql.gz 2>/dev/null || echo "No backups found"

echo -e "${GREEN}🏁 Backup process finished at $(date)${NC}"
