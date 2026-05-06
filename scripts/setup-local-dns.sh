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

# تحديث dnsmasq.conf بالقيم الفعلية
DNSMASQ_CONF="production/dnsmasq/dnsmasq.conf"

if [ ! -f "${DNSMASQ_CONF}" ]; then
    echo "❌ ملف ${DNSMASQ_CONF} غير موجود!"
    exit 1
fi

# استبدال القيم الافتراضية
sed -i "s/SARAYA_DOMAIN/${DOMAIN}/g" "${DNSMASQ_CONF}"
sed -i "s/SARAYA_SERVER_IP/${SERVER_IP}/g" "${DNSMASQ_CONF}"

echo "✅ تم تحديث إعدادات DNS المحلي"

# ضبط السيرفر نفسه للوصول للنطاق محلياً بأمان (بدون فصل الشبكة)
echo "📝 جاري ضبط اسم النطاق محلياً على السيرفر..."

if grep -q "${DOMAIN}" /etc/hosts; then
    sudo sed -i "s/.*${DOMAIN}.*/${SERVER_IP} ${DOMAIN}/" /etc/hosts
else
    echo "${SERVER_IP} ${DOMAIN}" | sudo tee -a /etc/hosts > /dev/null
fi
echo "✅ تم تحديث ملف /etc/hosts"

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
echo "==========================================="
