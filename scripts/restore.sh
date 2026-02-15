#!/bin/bash
# ============================================
# Saraya ERP - Database Restore Script
# ============================================

set -e

# Configuration
BACKUP_DIR="/backups"
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
    echo "Usage: $0 <backup_filename>"
    exit 1
fi

BACKUP_FILE="${BACKUP_DIR}/$1"

log "=========================================="
log "Starting restore process..."
log "Target File: $BACKUP_FILE"

# check if file exists
if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Confirm file is not empty
if [ ! -s "$BACKUP_FILE" ]; then
    log_error "Backup file is empty"
    exit 1
fi

log "Restoring database saraya_erp..."

# Drop and recreate database to ensure clean slate?
# No, pg_restore with -c (clean) option handles it if format is custom (-F c).
# But backup.sh uses -F c (custom). So we use pg_restore.

# Wait, check backup.sh:
# pg_dump -F c | gzip > file

# So restore is:
# gunzip -c file | pg_restore -d dbname -c

export PGPASSWORD=${POSTGRES_PASSWORD}

if gunzip -c "$BACKUP_FILE" | pg_restore \
    -h ${POSTGRES_HOST:-postgres} \
    -U ${POSTGRES_USER:-admin} \
    -d ${POSTGRES_DB:-saraya_erp} \
    -c --if-exists \
    -v >> "$LOG_FILE" 2>&1; then
    
    log "✅ Restore completed successfully"
else
    log_error "❌ Restore failed - Check logs"
    exit 1
fi

log "=========================================="
