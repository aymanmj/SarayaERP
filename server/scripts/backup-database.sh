#!/bin/bash
# ============================================
# Saraya ERP - Database Backup Script
# ============================================
# Usage: ./backup-database.sh [daily|weekly|monthly]
# Cron examples:
#   0 2 * * * /path/to/backup-database.sh daily     # Daily at 2 AM
#   0 3 * * 0 /path/to/backup-database.sh weekly    # Weekly Sunday 3 AM
#   0 4 1 * * /path/to/backup-database.sh monthly   # Monthly 1st at 4 AM

set -e

# Configuration (override via environment)
BACKUP_TYPE="${1:-daily}"
BACKUP_DIR="${BACKUP_DIR:-/backups/saraya}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-saraya}"
DB_USER="${DB_USER:-postgres}"
RETENTION_DAILY=7      # Keep 7 daily backups
RETENTION_WEEKLY=4     # Keep 4 weekly backups
RETENTION_MONTHLY=12   # Keep 12 monthly backups

# Timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_TYPE}/saraya_${BACKUP_TYPE}_${TIMESTAMP}.sql.gz"

# Create backup directory if not exists
mkdir -p "${BACKUP_DIR}/${BACKUP_TYPE}"

echo "🔄 Starting ${BACKUP_TYPE} backup..."
echo "   Database: ${DB_NAME}"
echo "   Target: ${BACKUP_FILE}"

# Perform backup with compression
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip > "${BACKUP_FILE}"

# Verify backup
if [ -f "${BACKUP_FILE}" ] && [ -s "${BACKUP_FILE}" ]; then
  BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo "✅ Backup completed successfully!"
  echo "   Size: ${BACKUP_SIZE}"
else
  echo "❌ Backup failed!"
  exit 1
fi

# Cleanup old backups based on retention policy
echo "🧹 Cleaning up old backups..."
case "${BACKUP_TYPE}" in
  daily)
    find "${BACKUP_DIR}/daily" -name "*.sql.gz" -mtime +${RETENTION_DAILY} -delete
    ;;
  weekly)
    find "${BACKUP_DIR}/weekly" -name "*.sql.gz" -mtime +$((RETENTION_WEEKLY * 7)) -delete
    ;;
  monthly)
    find "${BACKUP_DIR}/monthly" -name "*.sql.gz" -mtime +$((RETENTION_MONTHLY * 30)) -delete
    ;;
esac

echo "✅ Backup process completed!"
echo ""
echo "📊 Current backup status:"
echo "   Daily:   $(ls -1 ${BACKUP_DIR}/daily/*.sql.gz 2>/dev/null | wc -l) files"
echo "   Weekly:  $(ls -1 ${BACKUP_DIR}/weekly/*.sql.gz 2>/dev/null | wc -l) files"
echo "   Monthly: $(ls -1 ${BACKUP_DIR}/monthly/*.sql.gz 2>/dev/null | wc -l) files"
