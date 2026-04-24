#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║              Saraya ERP - Complete Server Wipe & Reset                     ║
# ║              مسح وتصفير السيرفر بالكامل لتهيئته لتثبيت جديد               ║
# ╚════════════════════════════════════════════════════════════════════════════╝
#
# الاستخدام:
#   sudo ./reset.sh                → مسح كامل مع تأكيد (يحتفظ بـ Docker)
#   sudo ./reset.sh --force        → مسح كامل بدون تأكيد
#   sudo ./reset.sh --keep-backups → مسح مع الاحتفاظ بالنسخ الاحتياطية
#   sudo ./reset.sh --nuclear      → مسح كل شيء بما فيه Docker نفسه
#
# بعد التشغيل: السيرفر يكون جاهز لتثبيت نظيف كأنه سيرفر جديد
# ════════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ═══════════════════════════════════════
# Colors & Constants
# ═══════════════════════════════════════
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

INSTALL_DIR="/opt/saraya-erp"
LOG_FILE="/tmp/saraya-reset-$(date +%Y%m%d-%H%M%S).log"
STEP=0
TOTAL_STEPS=10

# ═══════════════════════════════════════
# Parse arguments
# ═══════════════════════════════════════
FORCE=false
KEEP_BACKUPS=false
NUCLEAR=false

for arg in "$@"; do
    case $arg in
        --force)    FORCE=true ;;
        --keep-backups) KEEP_BACKUPS=true ;;
        --nuclear)  NUCLEAR=true ;;
    esac
done

# ═══════════════════════════════════════
# Helper functions
# ═══════════════════════════════════════
step() {
    STEP=$((STEP + 1))
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  [$STEP/$TOTAL_STEPS] $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
info() { echo -e "  ${CYAN}ℹ${NC} $1"; }
skip() { echo -e "  ${DIM}○${NC} $1 ${DIM}(skipped)${NC}"; }

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }

# ═══════════════════════════════════════
# Pre-flight checks
# ═══════════════════════════════════════
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ يجب تشغيل السكربت كـ root${NC}"
    echo -e "  Use: ${YELLOW}sudo ./reset.sh${NC}"
    exit 1
fi

# ═══════════════════════════════════════
# Warning banner
# ═══════════════════════════════════════
echo ""
echo -e "${RED}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                                                                    ║${NC}"
echo -e "${RED}║   ⚠️  تحذير خطير: سيتم مسح السيرفر وتصفيره بالكامل!              ║${NC}"
echo -e "${RED}║   ⚠️  WARNING: This will COMPLETELY WIPE the server!               ║${NC}"
echo -e "${RED}║                                                                    ║${NC}"
echo -e "${RED}║   سيتم حذف:                                                       ║${NC}"
echo -e "${RED}║   ─────────────────────────────────────────────────────             ║${NC}"
echo -e "${RED}║   • جميع حاويات Docker (21 حاوية)                                  ║${NC}"
echo -e "${RED}║   • قاعدة البيانات (PostgreSQL data)                                ║${NC}"
echo -e "${RED}║   • ذاكرة التخزين المؤقت (Redis data)                               ║${NC}"
echo -e "${RED}║   • بيانات المراقبة (Prometheus/Grafana/Loki)                       ║${NC}"
echo -e "${RED}║   • بيانات Vault (المفاتيح والأسرار)                                ║${NC}"
echo -e "${RED}║   • الملفات المرفوعة (uploads)                                     ║${NC}"
echo -e "${RED}║   • ملفات الإعداد (.env, nginx, kong, certs)                       ║${NC}"
echo -e "${RED}║   • خدمة systemd + cron jobs                                       ║${NC}"
echo -e "${RED}║   • صور Docker (ghcr.io/aymanmj/*)                                 ║${NC}"
if [ "$NUCLEAR" = true ]; then
echo -e "${RED}║                                                                    ║${NC}"
echo -e "${RED}║   ${BOLD}🔴 NUCLEAR MODE: سيتم أيضاً إزالة Docker بالكامل!${NC}${RED}              ║${NC}"
fi
echo -e "${RED}║                                                                    ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════
# Confirmation
# ═══════════════════════════════════════
if [ "$FORCE" != true ]; then
    # Offer backup
    echo -e "${YELLOW}هل تريد أخذ نسخة احتياطية قبل المسح؟${NC}"
    read -p "  Backup first? (y/n): " DO_BACKUP < /dev/tty

    if [ "$DO_BACKUP" = "y" ] || [ "$DO_BACKUP" = "Y" ]; then
        BACKUP_DIR="${HOME}/saraya-final-backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        
        info "Creating database backup..."
        if docker exec saraya_db pg_dumpall -U admin > "$BACKUP_DIR/database-full.sql" 2>/dev/null; then
            ok "Database backup saved"
        else
            warn "Database backup failed (container may not be running)"
        fi
        
        # Backup env file
        if [ -f "$INSTALL_DIR/.env.production" ]; then
            cp "$INSTALL_DIR/.env.production" "$BACKUP_DIR/.env.production"
            ok "Environment file backed up"
        fi
        
        # Backup license
        if [ -f "$INSTALL_DIR/data/license/saraya.lic" ]; then
            cp "$INSTALL_DIR/data/license/saraya.lic" "$BACKUP_DIR/saraya.lic"
            ok "License file backed up"
        fi
        
        # Backup uploads
        if [ -d "$INSTALL_DIR/uploads" ] && [ "$(ls -A $INSTALL_DIR/uploads 2>/dev/null)" ]; then
            cp -r "$INSTALL_DIR/uploads" "$BACKUP_DIR/uploads"
            ok "Uploads backed up"
        fi
        
        # Backup certs
        if [ -d "$INSTALL_DIR/certs" ] && [ "$(ls -A $INSTALL_DIR/certs 2>/dev/null)" ]; then
            cp -r "$INSTALL_DIR/certs" "$BACKUP_DIR/certs"
            ok "SSL certificates backed up"
        fi
        
        echo ""
        echo -e "  ${GREEN}📁 Backup saved to: ${BOLD}$BACKUP_DIR${NC}"
        echo ""
    fi

    # Double confirmation
    echo -e "${RED}${BOLD}  اكتب 'DELETE ALL' للتأكيد (حساس لحالة الأحرف):${NC}"
    read -p "  > " CONFIRM < /dev/tty
    
    if [ "$CONFIRM" != "DELETE ALL" ]; then
        echo -e "\n  ${GREEN}✓${NC} Cancelled. Nothing was deleted."
        exit 0
    fi
fi

log "=== Saraya ERP Reset Started ==="
log "Mode: force=$FORCE, keep-backups=$KEEP_BACKUPS, nuclear=$NUCLEAR"

# ═══════════════════════════════════════════════════════════════
# Step 1: Stop systemd service
# ═══════════════════════════════════════════════════════════════
step "إيقاف خدمة systemd..."

if systemctl is-active --quiet saraya-erp 2>/dev/null; then
    timeout 15s systemctl stop saraya-erp 2>/dev/null || warn "Systemd stop timed out"
    ok "systemd service stopped"
elif systemctl is-enabled --quiet saraya-erp 2>/dev/null; then
    ok "systemd service was not running"
else
    info "No systemd service found"
fi

# ═══════════════════════════════════════════════════════════════
# Step 2: Stop all Saraya containers
# ═══════════════════════════════════════════════════════════════
step "إيقاف وحذف جميع الحاويات..."

# Try graceful shutdown first
if [ -f "$INSTALL_DIR/docker-compose.production.yml" ]; then
    cd "$INSTALL_DIR"
    docker compose -f docker-compose.production.yml down --remove-orphans --timeout 15 2>/dev/null || true
    ok "Docker Compose down completed"
fi

# Force kill any remaining saraya containers
REMAINING=$(docker ps -a --filter "name=saraya" --format '{{.Names}}' 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
    echo "$REMAINING" | while read -r container; do
        docker rm -f "$container" 2>/dev/null || true
        info "Force removed: $container"
    done
fi

ok "All Saraya containers removed"
log "Step 2: Containers removed"

# ═══════════════════════════════════════════════════════════════
# Step 3: Remove Docker volumes (ALL data)
# ═══════════════════════════════════════════════════════════════
step "حذف Docker Volumes (قاعدة البيانات + التخزين)..."

VOLUMES_REMOVED=0

# Named volumes from docker-compose
for pattern in "saraya" "opt_saraya"; do
    VOLS=$(docker volume ls --filter "name=$pattern" -q 2>/dev/null || true)
    if [ -n "$VOLS" ]; then
        echo "$VOLS" | while read -r vol; do
            docker volume rm "$vol" 2>/dev/null || true
            info "Removed volume: $vol"
            VOLUMES_REMOVED=$((VOLUMES_REMOVED + 1))
        done
    fi
done

ok "Docker volumes removed"
log "Step 3: Volumes removed"

# ═══════════════════════════════════════════════════════════════
# Step 4: Remove Docker images
# ═══════════════════════════════════════════════════════════════
step "حذف صور Docker..."

# GHCR images
docker images --filter "reference=ghcr.io/aymanmj/*" -q 2>/dev/null | sort -u | xargs -r docker rmi -f 2>/dev/null || true
# Local saraya images
docker images --filter "reference=*saraya*" -q 2>/dev/null | sort -u | xargs -r docker rmi -f 2>/dev/null || true

# Also remove monitoring/support images that were pulled
for img in "prom/prometheus" "grafana/grafana" "prom/alertmanager" "grafana/loki" \
           "grafana/promtail" "grafana/tempo" "otel/opentelemetry-collector-contrib" \
           "prom/node-exporter" "prometheuscommunity/postgres-exporter" \
           "oliver006/redis_exporter" "hashicorp/vault" "containrrr/watchtower" \
           "portainer/portainer-ce" "tailscale/tailscale" "cloudflare/cloudflared" \
           "konghq/kong" "postgres" "redis" "nginx"; do
    docker rmi -f $(docker images "$img" -q 2>/dev/null) 2>/dev/null || true
done

ok "Docker images removed"
log "Step 4: Images removed"

# ═══════════════════════════════════════════════════════════════
# Step 5: Remove Docker networks
# ═══════════════════════════════════════════════════════════════
step "حذف شبكات Docker..."

docker network ls --filter "name=saraya" -q 2>/dev/null | xargs -r docker network rm 2>/dev/null || true

ok "Docker networks removed"
log "Step 5: Networks removed"

# ═══════════════════════════════════════════════════════════════
# Step 6: Remove systemd service & timer
# ═══════════════════════════════════════════════════════════════
step "حذف خدمة systemd..."

for svc in saraya-erp saraya-erp.timer saraya-backup.timer; do
    if [ -f "/etc/systemd/system/$svc" ]; then
        systemctl disable "$svc" 2>/dev/null || true
        rm -f "/etc/systemd/system/$svc"
        info "Removed: $svc"
    fi
done

systemctl daemon-reload 2>/dev/null || true
ok "systemd services removed"
log "Step 6: systemd removed"

# ═══════════════════════════════════════════════════════════════
# Step 7: Remove cron jobs
# ═══════════════════════════════════════════════════════════════
step "حذف Cron jobs..."

rm -f /etc/cron.d/saraya-update
rm -f /etc/cron.d/saraya-backup
rm -f /etc/cron.d/saraya-*

# Also clean root crontab entries
crontab -l 2>/dev/null | grep -v "saraya" | crontab - 2>/dev/null || true

ok "Cron jobs removed"
log "Step 7: Cron removed"

# ═══════════════════════════════════════════════════════════════
# Step 8: Remove installation directory
# ═══════════════════════════════════════════════════════════════
step "حذف مجلد التثبيت..."

if [ -d "$INSTALL_DIR" ]; then
    # Show what's being removed
    TOTAL_SIZE=$(du -sh "$INSTALL_DIR" 2>/dev/null | cut -f1 || echo "unknown")
    info "Directory size: $TOTAL_SIZE"
    
    if [ "$KEEP_BACKUPS" = true ] && [ -d "$INSTALL_DIR/backups" ]; then
        BACKUP_SAVE="/tmp/saraya-backups-preserved"
        mkdir -p "$BACKUP_SAVE"
        cp -r "$INSTALL_DIR/backups/"* "$BACKUP_SAVE/" 2>/dev/null || true
        ok "Backups preserved in: $BACKUP_SAVE"
    fi
    
    rm -rf "$INSTALL_DIR"
    ok "$INSTALL_DIR removed ($TOTAL_SIZE freed)"
else
    info "$INSTALL_DIR not found"
fi

# Also remove log files
rm -f /var/log/saraya-*.log

log "Step 8: Installation directory removed"

# ═══════════════════════════════════════════════════════════════
# Step 9: Clean Docker system cache
# ═══════════════════════════════════════════════════════════════
step "تنظيف Docker cache..."

docker system prune -af --volumes 2>/dev/null || true

# Show reclaimed space
DOCKER_DISK=$(docker system df 2>/dev/null | tail -1 | awk '{print $4}' || echo "N/A")
ok "Docker cache cleaned (reclaimable: $DOCKER_DISK)"
log "Step 9: Docker cache cleaned"

# ═══════════════════════════════════════════════════════════════
# Step 10: Nuclear option — remove Docker itself
# ═══════════════════════════════════════════════════════════════
if [ "$NUCLEAR" = true ]; then
    step "🔴 إزالة Docker بالكامل (Nuclear Mode)..."
    
    systemctl stop docker.socket 2>/dev/null || true
    systemctl stop docker 2>/dev/null || true
    
    # Detect package manager and remove
    if command -v apt-get &>/dev/null; then
        apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || true
        apt-get autoremove -y 2>/dev/null || true
    elif command -v yum &>/dev/null; then
        yum remove -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || true
    fi
    
    # Remove Docker data directory
    rm -rf /var/lib/docker
    rm -rf /var/lib/containerd
    rm -rf /etc/docker
    rm -f /usr/local/bin/docker-compose
    
    ok "Docker completely removed"
    log "Step 10: Docker uninstalled (nuclear)"
else
    step "Docker محفوظ (جاهز لتثبيت جديد)..."
    ok "Docker engine preserved — ready for fresh install"
    log "Step 10: Docker preserved"
fi

# ═══════════════════════════════════════════════════════════════
# Final verification
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Verification (التحقق النهائي)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

CLEAN=true

# Check containers
SARAYA_CONTAINERS=$(docker ps -a --filter "name=saraya" -q 2>/dev/null | wc -l | xargs)
if [ "$SARAYA_CONTAINERS" -gt 0 ]; then
    warn "Still found $SARAYA_CONTAINERS Saraya container(s)"
    CLEAN=false
else
    ok "No Saraya containers found"
fi

# Check volumes
SARAYA_VOLUMES=$(docker volume ls --filter "name=saraya" -q 2>/dev/null | wc -l | xargs)
if [ "$SARAYA_VOLUMES" -gt 0 ]; then
    warn "Still found $SARAYA_VOLUMES Saraya volume(s)"
    CLEAN=false
else
    ok "No Saraya volumes found"
fi

# Check install dir
if [ -d "$INSTALL_DIR" ]; then
    warn "$INSTALL_DIR still exists"
    CLEAN=false
else
    ok "$INSTALL_DIR removed"
fi

# Check systemd
if [ -f /etc/systemd/system/saraya-erp.service ]; then
    warn "systemd service still exists"
    CLEAN=false
else
    ok "No systemd service"
fi

# Check cron
if ls /etc/cron.d/saraya-* 2>/dev/null | grep -q .; then
    warn "Cron jobs still exist"
    CLEAN=false
else
    ok "No cron jobs"
fi

if [ "$NUCLEAR" = true ]; then
    if command -v docker &>/dev/null; then
        warn "Docker is still installed"
        CLEAN=false
    else
        ok "Docker completely removed"
    fi
fi

# ═══════════════════════════════════════════════════════════════
# Final banner
# ═══════════════════════════════════════════════════════════════
echo ""
if [ "$CLEAN" = true ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                    ║${NC}"
    echo -e "${GREEN}║   ✅ تم مسح وتصفير السيرفر بنجاح!                                  ║${NC}"
    echo -e "${GREEN}║   ✅ Server wiped successfully — ready for fresh install!            ║${NC}"
    echo -e "${GREEN}║                                                                    ║${NC}"
    if [ "$NUCLEAR" != true ]; then
    echo -e "${GREEN}║   لإعادة التثبيت:                                                   ║${NC}"
    echo -e "${GREEN}║   ${CYAN}sudo bash install.sh${NC}${GREEN}                                              ║${NC}"
    echo -e "${GREEN}║                                                                    ║${NC}"
    echo -e "${GREEN}║   أو من الإنترنت مباشرة:                                            ║${NC}"
    echo -e "${GREEN}║   ${CYAN}curl -fsSL https://raw.githubusercontent.com/aymanmj/${NC}${GREEN}           ║${NC}"
    echo -e "${GREEN}║   ${CYAN}SarayaERP/main/scripts/install.sh | sudo bash${NC}${GREEN}                   ║${NC}"
    else
    echo -e "${GREEN}║   لإعادة التثبيت، ثبّت Docker أولاً ثم شغّل install.sh              ║${NC}"
    fi
    echo -e "${GREEN}║                                                                    ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║   ⚠️ المسح اكتمل لكن بعض العناصر لم تُحذف — راجع التفاصيل أعلاه  ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════════╝${NC}"
fi

echo ""

# Show backup location if applicable
if [ -n "${BACKUP_DIR:-}" ] && [ -d "${BACKUP_DIR:-}" ]; then
    echo -e "  ${YELLOW}📁 النسخة الاحتياطية محفوظة في: ${BOLD}$BACKUP_DIR${NC}"
fi

if [ "$KEEP_BACKUPS" = true ] && [ -d "/tmp/saraya-backups-preserved" ]; then
    echo -e "  ${YELLOW}📁 النسخ الاحتياطية القديمة في: ${BOLD}/tmp/saraya-backups-preserved${NC}"
fi

echo -e "  ${DIM}📋 Log: $LOG_FILE${NC}"
echo ""

log "=== Reset completed successfully ==="
