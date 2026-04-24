#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                 Saraya ERP - Uninstall Script                              ║
# ║                    إزالة نظام سرايا وتنظيف السيرفر                         ║
# ╚════════════════════════════════════════════════════════════════════════════╝
#
# الاستخدام:
#   sudo ./uninstall.sh               → إزالة مع تأكيد + خيار النسخة الاحتياطية
#   sudo ./uninstall.sh --force       → إزالة بدون تأكيد
#   sudo ./uninstall.sh --keep-data   → إزالة الحاويات فقط (يحتفظ بالبيانات)
#
# الفرق عن reset.sh:
#   - reset.sh  → يمسح كل شيء بشكل عنيف (للتصفير الكامل)
#   - uninstall.sh → إزالة نظيفة مع خيار الاحتفاظ بالبيانات
# ════════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

INSTALL_DIR="/opt/saraya-erp"

# Parse arguments
FORCE=false
KEEP_DATA=false

for arg in "$@"; do
    case $arg in
        --force)     FORCE=true ;;
        --keep-data) KEEP_DATA=true ;;
    esac
done

# ═══════════════════════════════════════
# Root check
# ═══════════════════════════════════════
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ يجب تشغيل السكربت كـ root${NC}"
    echo -e "  Use: ${YELLOW}sudo ./uninstall.sh${NC}"
    exit 1
fi

# ═══════════════════════════════════════
# Warning
# ═══════════════════════════════════════
echo ""
echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                    ⚠️  تحذير!                                  ║${NC}"
echo -e "${RED}║                                                                ║${NC}"
echo -e "${RED}║     سيتم إزالة نظام Saraya ERP بالكامل                        ║${NC}"
if [ "$KEEP_DATA" = true ]; then
echo -e "${RED}║     ${GREEN}✓ مع الاحتفاظ بالبيانات (Docker volumes)${NC}${RED}               ║${NC}"
else
echo -e "${RED}║     ${YELLOW}بما في ذلك قاعدة البيانات وجميع البيانات!${NC}${RED}               ║${NC}"
fi
echo -e "${RED}║                                                                ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════
# Confirmation + optional backup
# ═══════════════════════════════════════
BACKUP_DIR=""

if [ "$FORCE" != true ]; then
    # Offer backup
    read -p "هل تريد الاحتفاظ بنسخة احتياطية من قاعدة البيانات؟ (y/n): " DO_BACKUP < /dev/tty

    if [ "$DO_BACKUP" = "y" ] || [ "$DO_BACKUP" = "Y" ]; then
        BACKUP_DIR="$HOME/saraya-uninstall-backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        
        echo -e "  ${CYAN}ℹ${NC} Creating backup..."
        
        # Database dump
        if docker exec saraya_db pg_dumpall -U admin > "$BACKUP_DIR/database.sql" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} Database backed up"
        else
            echo -e "  ${YELLOW}⚠${NC} Database backup failed (container may not be running)"
        fi
        
        # Config files
        [ -f "$INSTALL_DIR/.env.production" ] && cp "$INSTALL_DIR/.env.production" "$BACKUP_DIR/"
        [ -f "$INSTALL_DIR/data/license/saraya.lic" ] && cp "$INSTALL_DIR/data/license/saraya.lic" "$BACKUP_DIR/"
        
        # Uploads
        if [ -d "$INSTALL_DIR/uploads" ]; then
            cp -r "$INSTALL_DIR/uploads" "$BACKUP_DIR/" 2>/dev/null || true
        fi
        
        echo -e "  ${GREEN}✓${NC} Backup saved to: ${BOLD}$BACKUP_DIR${NC}"
        echo ""
    fi

    # Confirm
    echo -e "${RED}${BOLD}  اكتب 'نعم' أو 'yes' للمتابعة:${NC}"
    read -p "  > " CONFIRM < /dev/tty
    
    if [ "$CONFIRM" != "نعم" ] && [ "$CONFIRM" != "yes" ] && [ "$CONFIRM" != "YES" ]; then
        echo -e "\n  ${GREEN}✓${NC} تم الإلغاء. لم يتم حذف أي شيء."
        exit 0
    fi
fi

echo ""
echo -e "${YELLOW}جاري الإزالة...${NC}"
echo ""

# ═══════════════════════════════════════
# Step 1: Stop systemd service
# ═══════════════════════════════════════
echo -e "  ${CYAN}[1/6]${NC} إيقاف الخدمات..."
if systemctl is-active --quiet saraya-erp 2>/dev/null; then
    timeout 15s systemctl stop saraya-erp 2>/dev/null || true
fi
echo -e "  ${GREEN}✓${NC} Services stopped"

# ═══════════════════════════════════════
# Step 2: Stop and remove containers
# ═══════════════════════════════════════
echo -e "  ${CYAN}[2/6]${NC} إيقاف وحذف الحاويات..."

if [ -f "$INSTALL_DIR/docker-compose.production.yml" ]; then
    cd "$INSTALL_DIR"
    if [ "$KEEP_DATA" = true ]; then
        docker compose -f docker-compose.production.yml down --remove-orphans --timeout 15 2>/dev/null || true
    else
        docker compose -f docker-compose.production.yml down -v --remove-orphans --timeout 15 2>/dev/null || true
    fi
fi

# Force remove any remaining
docker ps -a --filter "name=saraya" --format '{{.Names}}' 2>/dev/null | xargs -r docker rm -f 2>/dev/null || true

echo -e "  ${GREEN}✓${NC} Containers removed"

# ═══════════════════════════════════════
# Step 3: Remove volumes (unless --keep-data)
# ═══════════════════════════════════════
if [ "$KEEP_DATA" != true ]; then
    echo -e "  ${CYAN}[3/6]${NC} حذف Docker volumes..."
    docker volume ls --filter "name=saraya" -q 2>/dev/null | xargs -r docker volume rm 2>/dev/null || true
    docker volume ls --filter "name=opt_saraya" -q 2>/dev/null | xargs -r docker volume rm 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Volumes removed"
else
    echo -e "  ${CYAN}[3/6]${NC} ${DIM}Docker volumes preserved (--keep-data)${NC}"
fi

# ═══════════════════════════════════════
# Step 4: Remove systemd + cron
# ═══════════════════════════════════════
echo -e "  ${CYAN}[4/6]${NC} حذف systemd و cron..."

for svc in saraya-erp saraya-erp.timer saraya-backup.timer; do
    if [ -f "/etc/systemd/system/$svc" ]; then
        systemctl disable "$svc" 2>/dev/null || true
        rm -f "/etc/systemd/system/$svc"
    fi
done
systemctl daemon-reload 2>/dev/null || true

rm -f /etc/cron.d/saraya-*
crontab -l 2>/dev/null | grep -v "saraya" | crontab - 2>/dev/null || true

echo -e "  ${GREEN}✓${NC} systemd & cron removed"

# ═══════════════════════════════════════
# Step 5: Remove installation directory
# ═══════════════════════════════════════
echo -e "  ${CYAN}[5/6]${NC} حذف مجلد التثبيت..."

if [ -d "$INSTALL_DIR" ]; then
    SIZE=$(du -sh "$INSTALL_DIR" 2>/dev/null | cut -f1 || echo "?")
    rm -rf "$INSTALL_DIR"
    echo -e "  ${GREEN}✓${NC} $INSTALL_DIR removed ($SIZE freed)"
else
    echo -e "  ${DIM}○${NC} $INSTALL_DIR not found"
fi

# ═══════════════════════════════════════
# Step 6: Remove Docker images (optional)
# ═══════════════════════════════════════
REMOVE_IMAGES=false

if [ "$FORCE" != true ]; then
    read -p "  هل تريد إزالة صور Docker أيضاً؟ (y/n): " RM_IMG < /dev/tty
    [ "$RM_IMG" = "y" ] || [ "$RM_IMG" = "Y" ] && REMOVE_IMAGES=true
else
    REMOVE_IMAGES=true
fi

if [ "$REMOVE_IMAGES" = true ]; then
    echo -e "  ${CYAN}[6/6]${NC} حذف صور Docker..."
    docker images --filter "reference=ghcr.io/aymanmj/*" -q 2>/dev/null | sort -u | xargs -r docker rmi -f 2>/dev/null || true
    docker images --filter "reference=*saraya*" -q 2>/dev/null | sort -u | xargs -r docker rmi -f 2>/dev/null || true
    docker system prune -f 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Docker images removed"
else
    echo -e "  ${CYAN}[6/6]${NC} ${DIM}Docker images preserved${NC}"
fi

# ═══════════════════════════════════════
# Done
# ═══════════════════════════════════════
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║   ✅ تم إزالة Saraya ERP بنجاح!                               ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
if [ "$KEEP_DATA" = true ]; then
echo -e "${GREEN}║   ${YELLOW}📁 Docker volumes preserved — data is still available${NC}${GREEN}       ║${NC}"
fi
echo -e "${GREEN}║   لإعادة التثبيت: ${CYAN}sudo bash install.sh${NC}${GREEN}                       ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    echo -e "  ${YELLOW}📁 النسخة الاحتياطية: ${BOLD}$BACKUP_DIR${NC}"
    echo ""
fi
