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
