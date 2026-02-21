#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                 Saraya ERP - System Health Check                           ║
# ║                    فحص صحة النظام                                          ║
# ╚════════════════════════════════════════════════════════════════════════════╝

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/opt/saraya-erp"

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║              Saraya ERP - System Health Check                  ║"
    echo "║                     فحص صحة النظام                             ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_service() {
    local name=$1
    local container=$2
    
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "running")
        if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
            echo -e "  ${GREEN}✓${NC} $name: ${GREEN}يعمل${NC}"
            return 0
        else
            echo -e "  ${YELLOW}⚠${NC} $name: ${YELLOW}$status${NC}"
            return 1
        fi
    else
        echo -e "  ${RED}✗${NC} $name: ${RED}متوقف${NC}"
        return 1
    fi
}

check_endpoint() {
    local name=$1
    local url=$2
    
    if curl -sf "$url" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $name: ${GREEN}متاح${NC}"
        return 0
    else
        echo -e "  ${RED}✗${NC} $name: ${RED}غير متاح${NC}"
        return 1
    fi
}

print_header

echo -e "\n${BLUE}═══ حالة الخدمات ═══${NC}\n"

ERRORS=0

check_service "PostgreSQL" "saraya_db" || ((ERRORS++))
check_service "Redis" "saraya_redis" || ((ERRORS++))
check_service "Backend" "saraya_backend" || ((ERRORS++))
check_service "Frontend" "saraya_frontend" || ((ERRORS++))
check_service "Nginx" "saraya_nginx" || ((ERRORS++))
check_service "Portainer" "saraya_portainer" || ((ERRORS++))
check_service "Watchtower" "saraya_watchtower" || ((ERRORS++))
check_service "Tailscale" "saraya_tailscale" || ((ERRORS++))

echo -e "\n${BLUE}═══ نقاط النهاية ═══${NC}\n"

check_endpoint "Backend Health" "http://localhost:3000/api/health" || ((ERRORS++))
check_endpoint "Frontend" "http://localhost" || ((ERRORS++))
check_endpoint "Portainer" "http://localhost:9000" || ((ERRORS++))
check_endpoint "Grafana" "http://localhost:3001" || ((ERRORS++))

echo -e "\n${BLUE}═══ موارد النظام ═══${NC}\n"

# Disk
DISK_USAGE=$(df -h "$INSTALL_DIR" 2>/dev/null | awk 'NR==2 {print $5}' | tr -d '%')
if [ -n "$DISK_USAGE" ]; then
    if [ "$DISK_USAGE" -gt 90 ]; then
        echo -e "  ${RED}⚠${NC} المساحة المستخدمة: ${RED}${DISK_USAGE}%${NC} (تحذير!)"
    elif [ "$DISK_USAGE" -gt 80 ]; then
        echo -e "  ${YELLOW}⚠${NC} المساحة المستخدمة: ${YELLOW}${DISK_USAGE}%${NC}"
    else
        echo -e "  ${GREEN}✓${NC} المساحة المستخدمة: ${DISK_USAGE}%"
    fi
fi

# Memory
MEM_USAGE=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$MEM_USAGE" -gt 90 ]; then
    echo -e "  ${RED}⚠${NC} الذاكرة المستخدمة: ${RED}${MEM_USAGE}%${NC} (تحذير!)"
elif [ "$MEM_USAGE" -gt 80 ]; then
    echo -e "  ${YELLOW}⚠${NC} الذاكرة المستخدمة: ${YELLOW}${MEM_USAGE}%${NC}"
else
    echo -e "  ${GREEN}✓${NC} الذاكرة المستخدمة: ${MEM_USAGE}%"
fi

# Docker disk usage
DOCKER_SIZE=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1)
echo -e "  ${BLUE}ℹ${NC} حجم Docker: $DOCKER_SIZE"

echo -e "\n${BLUE}═══ Tailscale ═══${NC}\n"

TS_STATUS=$(docker exec saraya_tailscale tailscale status --json 2>/dev/null | jq -r '.Self.Online // false' 2>/dev/null)
if [ "$TS_STATUS" = "true" ]; then
    TS_IP=$(docker exec saraya_tailscale tailscale ip -4 2>/dev/null)
    TS_NAME=$(docker exec saraya_tailscale tailscale status --json 2>/dev/null | jq -r '.Self.HostName' 2>/dev/null)
    echo -e "  ${GREEN}✓${NC} متصل: $TS_NAME ($TS_IP)"
else
    echo -e "  ${RED}✗${NC} غير متصل"
fi

echo -e "\n${BLUE}═══ آخر النسخ الاحتياطية ═══${NC}\n"

BACKUP_DIR="$INSTALL_DIR/backups"
if [ -d "$BACKUP_DIR" ]; then
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.sql 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        BACKUP_DATE=$(stat -c %y "$LATEST_BACKUP" 2>/dev/null | cut -d' ' -f1)
        BACKUP_SIZE=$(du -h "$LATEST_BACKUP" 2>/dev/null | cut -f1)
        echo -e "  ${GREEN}✓${NC} آخر نسخة: $BACKUP_DATE ($BACKUP_SIZE)"
    else
        echo -e "  ${YELLOW}⚠${NC} لا توجد نسخ احتياطية"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} مجلد النسخ الاحتياطي غير موجود"
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}  ✓ جميع الخدمات تعمل بشكل صحيح!${NC}"
else
    echo -e "${YELLOW}  ⚠ توجد $ERRORS مشكلة تحتاج مراجعة${NC}"
fi

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
