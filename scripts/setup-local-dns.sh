#!/bin/bash
# ============================================
# Saraya Local DNS Setup Script
# ============================================
# يُنفّذ مرة واحدة أثناء التثبيت لتفعيل DNS المحلي
# الاستخدام: ./setup-local-dns.sh [DOMAIN]
# مثال: ./setup-local-dns.sh rehab.alsarayatech.ly

set -e

echo "=== إعداد DNS المحلي لنظام السرايا الطبي ==="

# الحصول على IP السيرفر المحلي
SERVER_IP=$(hostname -I | awk '{print $1}')
DOMAIN="${1:-erp.alsarayatech.ly}"

echo "📍 عنوان السيرفر المحلي: ${SERVER_IP}"
echo "🌐 النطاق: ${DOMAIN}"

# استخراج النطاق الأساسي (مثل alsarayatech.ly من rehab.alsarayatech.ly)
BASE_DOMAIN=$(echo "${DOMAIN}" | awk -F. '{if(NF>2) print $(NF-1)"."$NF; else print $0}')
echo "🏷️  النطاق الأساسي: ${BASE_DOMAIN}"

# تحديث dnsmasq.conf بالقيم الفعلية
DNSMASQ_CONF="production/dnsmasq/dnsmasq.conf"

if [ ! -f "${DNSMASQ_CONF}" ]; then
    echo "❌ ملف ${DNSMASQ_CONF} غير موجود!"
    exit 1
fi

# ==============================================================
# تحرير المنفذ 53 ليعمل dnsmasq بسلام (حل تعارض systemd-resolved)
# ==============================================================
echo "🔧 جاري تحرير المنفذ 53 من systemd-resolved..."
if grep -q "DNSStubListener=no" /etc/systemd/resolved.conf; then
    echo "ℹ️ المنفذ 53 محرر مسبقاً."
else
    sudo sed -i 's/#DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf
    sudo sed -i 's/DNSStubListener=yes/DNSStubListener=no/' /etc/systemd/resolved.conf
    # إضافة السطر في حال لم يكن موجوداً
    if ! grep -q "DNSStubListener=no" /etc/systemd/resolved.conf; then
        echo "DNSStubListener=no" | sudo tee -a /etc/systemd/resolved.conf > /dev/null
    fi
    sudo systemctl restart systemd-resolved
    
    # توجيه ملف resolv.conf ليستخدم السيرفرات الحقيقية بدل الـ stub
    sudo rm -f /etc/resolv.conf
    sudo ln -s /run/systemd/resolve/resolv.conf /etc/resolv.conf
    echo "✅ تم تحرير المنفذ 53 بنجاح."
fi

# استبدال القيم الافتراضية
sed -i "s/SARAYA_DOMAIN/${DOMAIN}/g" "${DNSMASQ_CONF}"
sed -i "s/SARAYA_SERVER_IP/${SERVER_IP}/g" "${DNSMASQ_CONF}"
sed -i "s/SARAYA_BASE_DOMAIN/${BASE_DOMAIN}/g" "${DNSMASQ_CONF}"

# ────────────────────────────────────────────
# 🔍 تحقق من نجاح الاستبدال
# ────────────────────────────────────────────
if grep -q "SARAYA_DOMAIN\|SARAYA_SERVER_IP\|SARAYA_BASE_DOMAIN" "${DNSMASQ_CONF}"; then
    echo "❌ فشل استبدال بعض القيم في dnsmasq.conf!"
    echo "   تحقق يدوياً من الملف: ${DNSMASQ_CONF}"
    exit 1
fi
echo "✅ تم تحديث إعدادات DNS المحلي"

# ضبط السيرفر نفسه للوصول للنطاق محلياً بأمان (بدون فصل الشبكة)
echo "📝 جاري ضبط اسم النطاق محلياً على السيرفر..."

if grep -q "${DOMAIN}" /etc/hosts; then
    sudo sed -i "s/.*${DOMAIN}.*/${SERVER_IP} ${DOMAIN}/" /etc/hosts
else
    echo "${SERVER_IP} ${DOMAIN}" | sudo tee -a /etc/hosts > /dev/null
fi
echo "✅ تم تحديث ملف /etc/hosts"

# ────────────────────────────────────────────
# 🔄 إعادة تشغيل حاوية DNS إذا كانت تعمل
# ────────────────────────────────────────────
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^saraya_dns$"; then
    echo "🔄 جاري إعادة تشغيل حاوية DNS..."
    docker restart saraya_dns
    sleep 3
    echo "✅ تم إعادة تشغيل saraya_dns"
fi

# ────────────────────────────────────────────
# 🧪 اختبار DNS المحلي
# ────────────────────────────────────────────
echo ""
echo "🧪 جاري اختبار DNS المحلي..."
sleep 2

if command -v nslookup &>/dev/null; then
    DNS_RESULT=$(nslookup "${DOMAIN}" "${SERVER_IP}" 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}')
    if [ "${DNS_RESULT}" = "${SERVER_IP}" ]; then
        echo "✅ DNS يعمل بشكل ممتاز: ${DOMAIN} → ${SERVER_IP}"
    else
        echo "⚠️ DNS لم يرد بالنتيجة المتوقعة (${DNS_RESULT})"
        echo "   تحقق من أن حاوية saraya_dns تعمل"
    fi
elif command -v dig &>/dev/null; then
    DIG_RESULT=$(dig +short "${DOMAIN}" @"${SERVER_IP}" 2>/dev/null)
    if [ "${DIG_RESULT}" = "${SERVER_IP}" ]; then
        echo "✅ DNS يعمل بشكل ممتاز: ${DOMAIN} → ${SERVER_IP}"
    else
        echo "⚠️ DNS لم يرد بالنتيجة المتوقعة"
    fi
else
    echo "ℹ️ nslookup/dig غير متاح — تخطي اختبار DNS"
fi

# ────────────────────────────────────────────
# ⏰ تثبيت Tunnel Watchdog في cron
# ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCHDOG_SCRIPT="${SCRIPT_DIR}/tunnel-watchdog.sh"

if [ -f "${WATCHDOG_SCRIPT}" ]; then
    if ! crontab -l 2>/dev/null | grep -q "tunnel-watchdog"; then
        echo "⏰ جاري تثبيت Tunnel Watchdog في cron..."
        (crontab -l 2>/dev/null; echo "*/3 * * * * ${WATCHDOG_SCRIPT} >> /var/log/saraya-tunnel-watchdog.log 2>&1") | crontab -
        echo "✅ Tunnel Watchdog مثبت (يعمل كل 3 دقائق)"
    else
        echo "ℹ️ Tunnel Watchdog مثبت مسبقاً في cron"
    fi
fi

echo ""
echo "==========================================="
echo "✅ DNS المحلي جاهز!"
echo "==========================================="
echo ""
echo "📋 الخطوة التالية:"
echo "   أضف عنوان السيرفر (${SERVER_IP}) كـ DNS أساسي"
echo "   في إعدادات مودم الإنترنت (DHCP) في المستشفى."
echo ""
echo "   أو أضفه يدوياً في كل جهاز:"
echo "   Windows: إعدادات الشبكة → DNS → ${SERVER_IP}"
echo ""
echo "   بعد ذلك، شغّل Docker:"
echo "   docker compose -f docker-compose.production.yml up -d local-dns"
echo ""
echo "   للتحقق من جاهزية النظام للعمل offline:"
echo "   ./scripts/verify-offline.sh"
echo "==========================================="

