#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║              Saraya ERP - Complete Reset Script                           ║
# ║              سكربت مسح النظام بالكامل وإعادة التثبيت من الصفر              ║
# ╚════════════════════════════════════════════════════════════════════════════╝
#
# الاستخدام:
#   sudo ./reset.sh           → مسح كامل مع تأكيد
#   sudo ./reset.sh --force   → مسح كامل بدون تأكيد
#
# ⚠️ تحذير: هذا السكربت يمسح كل شيء بما فيه قاعدة البيانات!
# ════════════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

INSTALL_DIR="/opt/saraya-erp"

# ════════════════════════════════════════════════════════════════════════════════
# التحقق
# ════════════════════════════════════════════════════════════════════════════════

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ Must run as root (يجب تشغيل السكربت كـ root)${NC}"
    echo -e "  Use: ${YELLOW}sudo ./reset.sh${NC}"
    exit 1
fi

echo ""
echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                                                                ║${NC}"
echo -e "${RED}║   ⚠️  تحذير: سيتم مسح النظام بالكامل!                         ║${NC}"
echo -e "${RED}║                                                                ║${NC}"
echo -e "${RED}║   - جميع حاويات Docker                                        ║${NC}"
echo -e "${RED}║   - جميع البيانات (قاعدة البيانات + Redis)                     ║${NC}"
echo -e "${RED}║   - جميع الصور (Docker images)                                ║${NC}"
echo -e "${RED}║   - ملفات الإعداد (.env, nginx, certs)                        ║${NC}"
echo -e "${RED}║   - خدمة systemd + cron jobs                                  ║${NC}"
echo -e "${RED}║                                                                ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$1" != "--force" ]; then
    echo -e "${YELLOW}هل تريد أخذ نسخة احتياطية قبل المسح؟${NC}"
    read -p "  Backup first? (y/n): " DO_BACKUP < /dev/tty

    if [ "$DO_BACKUP" = "y" ] || [ "$DO_BACKUP" = "Y" ]; then
        BACKUP_FILE="/tmp/saraya-backup-$(date +%Y%m%d-%H%M%S).sql"
        echo -e "  ${CYAN}ℹ${NC} Creating database backup..."
        if docker exec saraya_postgres pg_dumpall -U admin > "$BACKUP_FILE" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} Backup saved to: $BACKUP_FILE"
        else
            echo -e "  ${YELLOW}⚠${NC} Backup failed (database may not be running)"
        fi
    fi

    echo ""
    echo -e "${RED}${BOLD}  اكتب 'DELETE' للتأكيد:${NC}"
    read -p "  > " CONFIRM < /dev/tty
    
    if [ "$CONFIRM" != "DELETE" ]; then
        echo -e "\n  ${GREEN}✓${NC} Cancelled. Nothing was deleted."
        exit 0
    fi
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 1: Stopping containers...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# إيقاف خدمة systemd
# إيقاف خدمة systemd
if systemctl is-active --quiet saraya-erp 2>/dev/null; then
    echo -e "  ${CYAN}ℹ${NC} Stopping systemd service..."
    timeout 15s systemctl stop saraya-erp || echo -e "  ${YELLOW}⚠${NC} Systemd stop timed out, forcing container removal..."
    echo -e "  ${GREEN}✓${NC} systemd service stopped"
else
    echo -e "  ${CYAN}ℹ${NC} systemd service not running"
fi

# إيقاف الحاويات
echo -e "  ${CYAN}ℹ${NC} Stopping Docker containers..."
cd "$INSTALL_DIR" 2>/dev/null && \
    docker compose -f docker-compose.production.yml down --remove-orphans --timeout 15 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Docker containers stopped and removed"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 2: Removing Docker volumes (database data)...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# مسح volumes المرتبطة بالنظام
docker volume ls --filter "name=saraya" -q | xargs -r docker volume rm 2>/dev/null || true
docker volume ls --filter "name=opt_saraya" -q | xargs -r docker volume rm 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Docker volumes removed"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 3: Removing Docker images...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# مسح صور GHCR الخاصة بالنظام
docker images --filter "reference=ghcr.io/aymanmj/*" -q | xargs -r docker rmi -f 2>/dev/null || true
# مسح صور saraya المحلية
docker images --filter "reference=*saraya*" -q | xargs -r docker rmi -f 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Docker images removed"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 4: Removing Docker networks...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

docker network ls --filter "name=saraya" -q | xargs -r docker network rm 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Docker networks removed"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 5: Removing systemd service...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -f /etc/systemd/system/saraya-erp.service ]; then
    systemctl disable saraya-erp 2>/dev/null || true
    rm -f /etc/systemd/system/saraya-erp.service
    systemctl daemon-reload
    echo -e "  ${GREEN}✓${NC} systemd service removed"
else
    echo -e "  ${CYAN}ℹ${NC} No systemd service found"
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 6: Removing cron jobs...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

rm -f /etc/cron.d/saraya-update
rm -f /etc/cron.d/saraya-backup
echo -e "  ${GREEN}✓${NC} Cron jobs removed"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 7: Removing installation directory...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo -e "  ${GREEN}✓${NC} $INSTALL_DIR removed"
else
    echo -e "  ${CYAN}ℹ${NC} $INSTALL_DIR not found"
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Step 8: Cleaning Docker cache...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

docker system prune -f 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Docker cache cleaned"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║   ✅ تم مسح النظام بالكامل!                                    ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║   لإعادة التثبيت:                                               ║${NC}"
echo -e "${GREEN}║   curl -fsSL https://raw.githubusercontent.com/aymanmj/        ║${NC}"
echo -e "${GREEN}║   SarayaERP/main/scripts/install.sh | sudo bash                ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    echo -e "  ${YELLOW}📁 Backup saved at: $BACKUP_FILE${NC}"
    echo ""
fi
