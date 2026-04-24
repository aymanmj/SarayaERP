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
CYAN='\033[0;36m'
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
    local optional=${3:-false}
    
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
        if [ "$optional" = "true" ]; then
            echo -e "  ${CYAN}○${NC} $name: ${CYAN}غير مُفعّل${NC}"
            return 0  # لا نحسبه كخطأ
        else
            echo -e "  ${RED}✗${NC} $name: ${RED}متوقف${NC}"
            return 1
        fi
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

# ═══════════════════════════════════════
# 1. الخدمات الأساسية (Core Services)
# ═══════════════════════════════════════
echo -e "\n${BLUE}═══ الخدمات الأساسية ═══${NC}\n"

ERRORS=0

check_service "PostgreSQL" "saraya_db" || ((ERRORS++))
check_service "Redis" "saraya_redis" || ((ERRORS++))
check_service "Backend" "saraya_backend" || ((ERRORS++))
check_service "Frontend" "saraya_frontend" || ((ERRORS++))
check_service "Nginx" "saraya_nginx" || ((ERRORS++))

# ═══════════════════════════════════════
# 2. خدمات الأمان والبوابات
# ═══════════════════════════════════════
echo -e "\n${BLUE}═══ الأمان والبوابات ═══${NC}\n"

check_service "Vault (الأسرار)" "saraya_vault" || ((ERRORS++))
check_service "Kong (FHIR Gateway)" "saraya_kong" true

# ═══════════════════════════════════════
# 3. خدمات الوصول والشبكة
# ═══════════════════════════════════════
echo -e "\n${BLUE}═══ الوصول والشبكة ═══${NC}\n"

check_service "Cloudflare Tunnel" "saraya_tunnel" true
check_service "Tailscale VPN" "saraya_tailscale" true

# ═══════════════════════════════════════
# 4. المراقبة (Monitoring Stack)
# ═══════════════════════════════════════
echo -e "\n${BLUE}═══ المراقبة ═══${NC}\n"

check_service "Prometheus" "saraya_prometheus" true
check_service "Grafana" "saraya_grafana" true
check_service "Alertmanager" "saraya_alertmanager" true
check_service "Loki (Logs)" "saraya_loki" true
check_service "Promtail" "saraya_promtail" true
check_service "Tempo (Tracing)" "saraya_tempo" true
check_service "OTel Collector" "saraya_otel_collector" true
check_service "Node Exporter" "saraya_node_exporter" true
check_service "Postgres Exporter" "saraya_postgres_exporter" true
check_service "Redis Exporter" "saraya_redis_exporter" true

# ═══════════════════════════════════════
# 5. الإدارة والصيانة
# ═══════════════════════════════════════
echo -e "\n${BLUE}═══ الإدارة والصيانة ═══${NC}\n"

check_service "Watchtower (تحديث)" "saraya_watchtower" || ((ERRORS++))
check_service "Portainer (إدارة)" "saraya_portainer" || ((ERRORS++))
check_service "Backup Worker" "saraya_backup" true

# ═══════════════════════════════════════
# 6. نقاط النهاية (Endpoints)
# ═══════════════════════════════════════
echo -e "\n${BLUE}═══ نقاط النهاية ═══${NC}\n"

check_endpoint "Backend Health" "http://localhost:3000/api/health" || ((ERRORS++))
check_endpoint "Frontend" "http://localhost" || ((ERRORS++))
check_endpoint "Portainer" "http://localhost:9000" || true
check_endpoint "Grafana" "http://localhost:3001" || true
check_endpoint "Vault Health" "http://localhost:8200/v1/sys/health" || true
check_endpoint "Kong Proxy" "http://localhost:8000" || true
check_endpoint "Loki Ready" "http://localhost:3100/ready" || true

# ═══════════════════════════════════════
# 7. موارد النظام (System Resources)
# ═══════════════════════════════════════
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

# Container count
RUNNING=$(docker ps --format '{{.Names}}' | grep -c saraya 2>/dev/null || echo "0")
TOTAL=$(docker ps -a --format '{{.Names}}' | grep -c saraya 2>/dev/null || echo "0")
echo -e "  ${BLUE}ℹ${NC} الحاويات: ${RUNNING} تعمل من أصل ${TOTAL}"

# ═══════════════════════════════════════
# 8. Tailscale
# ═══════════════════════════════════════
echo -e "\n${BLUE}═══ Tailscale ═══${NC}\n"

TS_STATUS=$(docker exec saraya_tailscale tailscale status --json 2>/dev/null | jq -r '.Self.Online // false' 2>/dev/null)
if [ "$TS_STATUS" = "true" ]; then
    TS_IP=$(docker exec saraya_tailscale tailscale ip -4 2>/dev/null)
    TS_NAME=$(docker exec saraya_tailscale tailscale status --json 2>/dev/null | jq -r '.Self.HostName' 2>/dev/null)
    echo -e "  ${GREEN}✓${NC} متصل: $TS_NAME ($TS_IP)"
else
    echo -e "  ${CYAN}○${NC} غير متصل أو غير مُفعّل"
fi

# ═══════════════════════════════════════
# 9. آخر النسخ الاحتياطية
# ═══════════════════════════════════════
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

# ═══════════════════════════════════════
# النتيجة النهائية
# ═══════════════════════════════════════
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}  ✓ جميع الخدمات الأساسية تعمل بشكل صحيح!${NC}"
else
    echo -e "${YELLOW}  ⚠ توجد $ERRORS مشكلة في الخدمات الأساسية تحتاج مراجعة${NC}"
fi

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
