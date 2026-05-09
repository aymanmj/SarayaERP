#!/bin/bash
# ============================================
# Saraya Offline Verification Script
# ============================================
# يتحقق من جاهزية النظام للعمل بدون إنترنت
# الاستخدام: ./verify-offline.sh [DOMAIN]
# مثال: ./verify-offline.sh alrehab.alsarayatech.ly

set -e

# ════════════════════════════════════════════
# الألوان
# ════════════════════════════════════════════
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

PASS=0
FAIL=0
WARN=0

check_pass() { echo -e "  ${GREEN}✅ PASS${NC} $1"; ((PASS++)); }
check_fail() { echo -e "  ${RED}❌ FAIL${NC} $1"; ((FAIL++)); }
check_warn() { echo -e "  ${YELLOW}⚠️  WARN${NC} $1"; ((WARN++)); }

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Saraya Medical ERP — Offline Readiness Check          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ════════════════════════════════════════════
# 1. حاوية DNS
# ════════════════════════════════════════════
echo -e "${BOLD}📡 فحص 1: حاوية DNS المحلي (saraya_dns)${NC}"

if docker ps --format '{{.Names}}' | grep -q "^saraya_dns$"; then
    check_pass "حاوية saraya_dns تعمل"
else
    check_fail "حاوية saraya_dns غير موجودة أو متوقفة!"
    echo -e "  ${YELLOW}→ الحل: docker compose -f docker-compose.production.yml up -d local-dns${NC}"
fi

# ════════════════════════════════════════════
# 2. إعدادات dnsmasq
# ════════════════════════════════════════════
echo ""
echo -e "${BOLD}📋 فحص 2: إعدادات dnsmasq${NC}"

DNSMASQ_FILE="production/dnsmasq/dnsmasq.conf"
if [ -f "$DNSMASQ_FILE" ]; then
    if grep -q "SARAYA_DOMAIN\|SARAYA_SERVER_IP\|SARAYA_BASE_DOMAIN" "$DNSMASQ_FILE"; then
        check_fail "ملف dnsmasq.conf لا يزال يحتوي على placeholders!"
        echo -e "  ${YELLOW}→ الحل: نفّذ scripts/setup-local-dns.sh YOUR_DOMAIN${NC}"
    else
        check_pass "dnsmasq.conf مفعّل بقيم حقيقية"
        
        # استخرج الدومين و IP من الملف
        DOMAIN=$(grep "^address=/" "$DNSMASQ_FILE" | head -1 | cut -d'/' -f2)
        SERVER_IP=$(grep "^address=/" "$DNSMASQ_FILE" | head -1 | cut -d'/' -f3)
        echo -e "  ${CYAN}   النطاق: ${DOMAIN}${NC}"
        echo -e "  ${CYAN}   عنوان السيرفر: ${SERVER_IP}${NC}"
    fi
else
    check_fail "ملف dnsmasq.conf غير موجود!"
fi

# ════════════════════════════════════════════
# 3. فحص DNS المحلي
# ════════════════════════════════════════════
echo ""
echo -e "${BOLD}🔍 فحص 3: حل DNS المحلي${NC}"

if [ -n "$DOMAIN" ] && [ -n "$SERVER_IP" ]; then
    # فحص مباشر عبر السيرفر المحلي
    DNS_RESULT=$(nslookup "$DOMAIN" "$SERVER_IP" 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}')
    
    if [ "$DNS_RESULT" = "$SERVER_IP" ]; then
        check_pass "DNS يحل ${DOMAIN} → ${SERVER_IP}"
    elif [ -n "$DNS_RESULT" ]; then
        check_warn "DNS يحل ${DOMAIN} → ${DNS_RESULT} (متوقع: ${SERVER_IP})"
    else
        check_fail "DNS لا يستطيع حل ${DOMAIN}!"
        echo -e "  ${YELLOW}→ تحقق: nslookup ${DOMAIN} ${SERVER_IP}${NC}"
    fi
    
    # فحص عبر dig إذا كان متاحاً
    if command -v dig &>/dev/null; then
        DIG_RESULT=$(dig +short "$DOMAIN" @"$SERVER_IP" 2>/dev/null)
        if [ "$DIG_RESULT" = "$SERVER_IP" ]; then
            check_pass "dig يؤكد: ${DOMAIN} → ${SERVER_IP}"
        fi
    fi
else
    check_warn "لم يتم استخراج الدومين/IP من dnsmasq.conf — تخطي فحص DNS"
fi

# ════════════════════════════════════════════
# 4. فحص حاويات Docker الأساسية
# ════════════════════════════════════════════
echo ""
echo -e "${BOLD}🐳 فحص 4: حاويات Docker الأساسية${NC}"

CRITICAL_CONTAINERS="saraya_db saraya_redis saraya_backend saraya_frontend saraya_nginx"
for container in $CRITICAL_CONTAINERS; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        STATUS=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
        if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "no-healthcheck" ]; then
            check_pass "${container} يعمل"
        else
            check_warn "${container} يعمل لكن حالته: ${STATUS}"
        fi
    else
        check_fail "${container} غير موجود أو متوقف!"
    fi
done

# ════════════════════════════════════════════
# 5. فحص HTTPS
# ════════════════════════════════════════════
echo ""
echo -e "${BOLD}🔒 فحص 5: الوصول عبر HTTPS${NC}"

if [ -n "$DOMAIN" ]; then
    HTTP_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://${SERVER_IP}/api/health" --resolve "${DOMAIN}:443:${SERVER_IP}" 2>/dev/null || echo "000")
    
    if [ "$HTTP_STATUS" = "200" ]; then
        check_pass "HTTPS يعمل (HTTP ${HTTP_STATUS})"
    elif [ "$HTTP_STATUS" = "000" ]; then
        check_fail "لا يمكن الوصول لـ HTTPS على ${SERVER_IP}:443"
        echo -e "  ${YELLOW}→ تحقق: curl -sk https://${SERVER_IP}/api/health${NC}"
    else
        check_warn "HTTPS يرد لكن بكود: ${HTTP_STATUS}"
    fi
fi

# ════════════════════════════════════════════
# 6. فحص Cloudflare Tunnel
# ════════════════════════════════════════════
echo ""
echo -e "${BOLD}☁️  فحص 6: Cloudflare Tunnel${NC}"

if docker ps --format '{{.Names}}' | grep -q "^saraya_tunnel$"; then
    TUNNEL_LOGS=$(docker logs --tail 10 saraya_tunnel 2>&1)
    if echo "$TUNNEL_LOGS" | grep -q "Registered tunnel connection"; then
        check_pass "Tunnel مسجل ومتصل"
    elif echo "$TUNNEL_LOGS" | grep -q "i/o timeout\|context deadline"; then
        check_warn "Tunnel يعمل لكن غير متصل (الإنترنت مقطوع — هذا طبيعي)"
    else
        check_warn "Tunnel يعمل لكن حالته غير واضحة"
    fi
else
    check_warn "Tunnel غير موجود (مطلوب فقط للوصول من الإنترنت)"
fi

# ════════════════════════════════════════════
# 7. فحص cron watchdog
# ════════════════════════════════════════════
echo ""
echo -e "${BOLD}⏰ فحص 7: Tunnel Watchdog (cron)${NC}"

if crontab -l 2>/dev/null | grep -q "tunnel-watchdog"; then
    check_pass "Tunnel watchdog مثبت في cron"
else
    check_warn "Tunnel watchdog غير مثبت في cron!"
    echo -e "  ${YELLOW}→ الحل: (crontab -l 2>/dev/null; echo '*/3 * * * * /opt/saraya-erp/scripts/tunnel-watchdog.sh >> /var/log/saraya-tunnel-watchdog.log 2>&1') | crontab -${NC}"
fi

# ════════════════════════════════════════════
# النتيجة
# ════════════════════════════════════════════
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD} 📊 النتيجة: ${GREEN}${PASS} نجح${NC} | ${RED}${FAIL} فشل${NC} | ${YELLOW}${WARN} تحذير${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

if [ "$FAIL" -eq 0 ]; then
    echo ""
    echo -e "${GREEN}${BOLD} 🎉 النظام جاهز للعمل بدون إنترنت!${NC}"
    echo ""
    echo -e " ${CYAN}للاختبار:${NC}"
    echo -e "   1. افصل الإنترنت من MiFi"
    echo -e "   2. افتح المتصفح على: https://${DOMAIN:-alrehab.alsarayatech.ly}"
    echo -e "   3. يجب أن يعمل النظام بشكل طبيعي"
    echo ""
else
    echo ""
    echo -e "${RED}${BOLD} ⚠️  يوجد ${FAIL} مشكلة تحتاج إصلاح قبل العمل offline${NC}"
    echo ""
fi

exit $FAIL
