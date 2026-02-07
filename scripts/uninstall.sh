#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                 Saraya ERP - Uninstall Script                              ║
# ║                    إزالة نظام سرايا بالكامل                                 ║
# ╚════════════════════════════════════════════════════════════════════════════╝

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="/opt/saraya-erp"

echo -e "${RED}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    ⚠️  تحذير!                                  ║"
echo "║                                                                ║"
echo "║     هذا السكربت سيقوم بإزالة نظام Saraya ERP بالكامل          ║"
echo "║     بما في ذلك قاعدة البيانات وجميع البيانات!                  ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

read -p "هل أنت متأكد من الإزالة؟ اكتب 'نعم' للمتابعة: " confirm

if [ "$confirm" != "نعم" ] && [ "$confirm" != "yes" ]; then
    echo -e "${GREEN}تم الإلغاء.${NC}"
    exit 0
fi

echo ""
read -p "هل تريد الاحتفاظ بنسخة احتياطية من قاعدة البيانات؟ (y/n): " backup

if [ "$backup" = "y" ] || [ "$backup" = "Y" ]; then
    echo -e "${YELLOW}جاري إنشاء نسخة احتياطية...${NC}"
    cd "$INSTALL_DIR"
    
    BACKUP_FILE="saraya-backup-$(date +%Y%m%d_%H%M%S).sql"
    docker exec saraya_db pg_dump -U admin saraya_erp > "/tmp/$BACKUP_FILE" 2>/dev/null || true
    
    if [ -f "/tmp/$BACKUP_FILE" ]; then
        mv "/tmp/$BACKUP_FILE" ~/
        echo -e "${GREEN}✓ تم حفظ النسخة الاحتياطية في: ~/$BACKUP_FILE${NC}"
    fi
fi

echo ""
echo -e "${YELLOW}جاري إيقاف وإزالة الخدمات...${NC}"

cd "$INSTALL_DIR" 2>/dev/null || true

# Stop and remove containers
docker compose -f docker-compose.production.yml --env-file .env.production down -v 2>/dev/null || true

# Remove systemd service
systemctl stop saraya-erp 2>/dev/null || true
systemctl disable saraya-erp 2>/dev/null || true
rm -f /etc/systemd/system/saraya-erp.service
systemctl daemon-reload

# Remove installation directory
echo -e "${YELLOW}جاري إزالة ملفات التثبيت...${NC}"
rm -rf "$INSTALL_DIR"

# Remove Docker images (optional)
read -p "هل تريد إزالة صور Docker أيضاً؟ (y/n): " remove_images

if [ "$remove_images" = "y" ] || [ "$remove_images" = "Y" ]; then
    echo -e "${YELLOW}جاري إزالة صور Docker...${NC}"
    docker rmi $(docker images "ghcr.io/*/saraya-*" -q) 2>/dev/null || true
    docker rmi $(docker images "saraya-*" -q) 2>/dev/null || true
fi

# Cleanup Docker
docker system prune -f 2>/dev/null || true

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ تم إزالة Saraya ERP بنجاح!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
