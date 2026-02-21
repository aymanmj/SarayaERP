#!/bin/bash
# ============================================
# Saraya ERP - Backup Worker
# Listen for backup/restore triggers from Backend
# ============================================

set -e

BACKUP_DIR="/backups"
TRIGGER_BACKUP="${BACKUP_DIR}/trigger_backup"
TRIGGER_RESTORE="${BACKUP_DIR}/trigger_restore"
STATUS_FILE="${BACKUP_DIR}/worker_status.json"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Ensure scripts are executable


log "Backup Worker Started. Watching $BACKUP_DIR for triggers..."

# Update status to ready
echo '{"status": "idle", "message": "Worker ready"}' > "$STATUS_FILE"

while true; do
    # 1. Check for Backup Trigger
    if [ -f "$TRIGGER_BACKUP" ]; then
        log "⚠️ Detected Backup Trigger!"
        rm -f "$TRIGGER_BACKUP"
        
        echo '{"status": "busy", "operation": "backup", "message": "Backup in progress..."}' > "$STATUS_FILE"
        
        if /opt/saraya-erp/scripts/backup.sh; then
            echo '{"status": "idle", "lastResult": "success", "lastOperation": "backup", "timestamp": "'$(date +%s)'"}' > "$STATUS_FILE"
        else
            echo '{"status": "idle", "lastResult": "error", "lastOperation": "backup", "timestamp": "'$(date +%s)'"}' > "$STATUS_FILE"
        fi
    fi

    # 2. Check for Restore Trigger
    if [ -f "$TRIGGER_RESTORE" ]; then
        log "⚠️ Detected Restore Trigger!"
        FILENAME=$(cat "$TRIGGER_RESTORE")
        rm -f "$TRIGGER_RESTORE"
        
        if [ -z "$FILENAME" ]; then
             log "Error: Restore trigger file empty"
             continue
        fi

        echo '{"status": "busy", "operation": "restore", "message": "Restoring '$FILENAME'..."}' > "$STATUS_FILE"
        
        if /opt/saraya-erp/scripts/restore.sh "$FILENAME"; then
            echo '{"status": "idle", "lastResult": "success", "lastOperation": "restore", "timestamp": "'$(date +%s)'"}' > "$STATUS_FILE"
        else
            echo '{"status": "idle", "lastResult": "error", "lastOperation": "restore", "timestamp": "'$(date +%s)'"}' > "$STATUS_FILE"
        fi
    fi

    sleep 5
done
