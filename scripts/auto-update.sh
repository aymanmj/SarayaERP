#!/bin/bash
# ============================================
# Saraya ERP - Automatic Update Script (Cron)
# ============================================
# هذا السكربت يُنفذ تلقائياً بواسطة Cron
# الجدولة الافتراضية: 3:00 صباحاً يومياً
#
# التثبيت:
#   sudo cp auto-update.sh /opt/saraya-erp/scripts/
#   sudo chmod +x /opt/saraya-erp/scripts/auto-update.sh
#   echo "0 3 * * * root /opt/saraya-erp/scripts/auto-update.sh" | sudo tee /etc/cron.d/saraya-update
# ============================================

set -e

# Configuration
INSTALL_DIR="${INSTALL_DIR:-/opt/saraya-erp}"
LOG_FILE="/var/log/saraya-update.log"
LOCK_FILE="/tmp/saraya-update.lock"
MAX_LOG_SIZE=10485760  # 10MB

# ============================================
# Functions
# ============================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}

rotate_log() {
    if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null) -gt $MAX_LOG_SIZE ]; then
        mv "$LOG_FILE" "${LOG_FILE}.old"
        log "Log rotated"
    fi
}

cleanup() {
    rm -f "$LOCK_FILE"
}

# ============================================
# Pre-flight checks
# ============================================

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        log_error "Another update is already running (PID: $PID)"
        exit 1
    fi
fi

echo $$ > "$LOCK_FILE"
trap cleanup EXIT

# Check if install directory exists
if [ ! -d "$INSTALL_DIR" ]; then
    log_error "Install directory not found: $INSTALL_DIR"
    exit 1
fi

cd "$INSTALL_DIR"

# Check if docker-compose file exists
if [ ! -f "docker-compose.production.yml" ]; then
    log_error "docker-compose.production.yml not found"
    exit 1
fi

# ============================================
# Main Update Process
# ============================================

log "=========================================="
log "Starting automatic update..."
log "=========================================="

rotate_log

# Step 1: Load environment
if [ -f ".env.production" ]; then
    export $(grep -v '^#' .env.production | xargs)
    log "Environment loaded"
else
    log_error ".env.production not found"
    exit 1
fi

OWNER="${GITHUB_REPOSITORY_OWNER:-aymanmj}"
TAG="${IMAGE_TAG:-latest}"

# Step 2: Check for new images
log "Checking for updates..."

# Pull new images
BACKEND_PULL=$(docker pull "ghcr.io/${OWNER}/saraya-backend:${TAG}" 2>&1)
FRONTEND_PULL=$(docker pull "ghcr.io/${OWNER}/saraya-frontend:${TAG}" 2>&1)

# Check if images were updated
BACKEND_UPDATED=false
FRONTEND_UPDATED=false

if echo "$BACKEND_PULL" | grep -q "Downloaded newer image\|Pull complete"; then
    BACKEND_UPDATED=true
    log "Backend: New image available"
else
    log "Backend: Already up to date"
fi

if echo "$FRONTEND_PULL" | grep -q "Downloaded newer image\|Pull complete"; then
    FRONTEND_UPDATED=true
    log "Frontend: New image available"
else
    log "Frontend: Already up to date"
fi

# Step 3: Restart services if updates found
if [ "$BACKEND_UPDATED" = true ] || [ "$FRONTEND_UPDATED" = true ]; then
    log "Applying updates..."
    
    # Create backup marker
    BACKUP_MARKER="/tmp/saraya-update-$(date +%Y%m%d-%H%M%S)"
    touch "$BACKUP_MARKER"
    
    # Restart updated services
    if [ "$BACKEND_UPDATED" = true ]; then
        log "Restarting backend..."
        docker compose -f docker-compose.production.yml --env-file .env.production up -d backend
        
        # Wait for backend to be healthy
        RETRIES=0
        MAX_RETRIES=30
        while [ $RETRIES -lt $MAX_RETRIES ]; do
            if docker exec saraya_backend curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
                log "Backend is healthy"
                break
            fi
            sleep 2
            RETRIES=$((RETRIES + 1))
        done
        
        if [ $RETRIES -eq $MAX_RETRIES ]; then
            log_error "Backend health check failed after update"
            # Consider rollback here
        fi
    fi
    
    if [ "$FRONTEND_UPDATED" = true ]; then
        log "Restarting frontend..."
        docker compose -f docker-compose.production.yml --env-file .env.production up -d frontend
    fi
    
    # Restart nginx to pick up any proxy changes
    docker compose -f docker-compose.production.yml --env-file .env.production restart nginx
    
    log "Update completed successfully!"
    
    # Cleanup old images
    log "Cleaning up old images..."
    docker image prune -f >> "$LOG_FILE" 2>&1 || true
    
else
    log "No updates available"
fi

# Step 4: Health check
log "Running health check..."

HEALTH_OK=true

if ! docker ps --format "{{.Names}}" | grep -q "saraya_backend"; then
    log_error "Backend container not running"
    HEALTH_OK=false
fi

if ! docker ps --format "{{.Names}}" | grep -q "saraya_frontend"; then
    log_error "Frontend container not running"
    HEALTH_OK=false
fi

if ! docker ps --format "{{.Names}}" | grep -q "saraya_nginx"; then
    log_error "Nginx container not running"
    HEALTH_OK=false
fi

if [ "$HEALTH_OK" = true ]; then
    log "All services are running"
else
    log_error "Some services are not running - check logs"
fi

log "=========================================="
log "Update process finished"
log "=========================================="

exit 0
