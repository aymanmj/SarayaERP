#!/bin/bash
# ============================================
# Saraya SSL — Automated Certificate Management
# ============================================
# يستخدم Certbot مع DNS-01 Challenge عبر Cloudflare API
# لإصدار وتجديد شهادات Let's Encrypt تلقائياً
#
# المتطلبات:
#   - Cloudflare API Token (Zone:DNS:Edit permission)
#   - Docker مُثبت على السيرفر
#
# الاستخدام الأول:
#   chmod +x scripts/ssl-certbot-setup.sh
#   ./scripts/ssl-certbot-setup.sh issue rehab.alsarayatech.ly
#
# التجديد (cron):
#   ./scripts/ssl-certbot-setup.sh renew

set -e

# ============================================
# الإعدادات
# ============================================
CERTS_DIR="$(pwd)/certs"
CERTBOT_DIR="$(pwd)/certbot"
CLOUDFLARE_CREDENTIALS="${CERTBOT_DIR}/cloudflare.ini"
NGINX_CONTAINER="saraya_nginx"
EMAIL="${CERTBOT_EMAIL:-admin@alsarayatech.ly}"

# ألوان للإخراج
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[✅]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[⚠️]${NC} $1"; }
log_error() { echo -e "${RED}[❌]${NC} $1"; }

# ============================================
# التحقق من المتطلبات
# ============================================
check_prerequisites() {
    log_info "جاري التحقق من المتطلبات..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker غير مُثبت!"
        exit 1
    fi

    if [ -z "${CLOUDFLARE_API_TOKEN}" ]; then
        log_error "المتغير CLOUDFLARE_API_TOKEN غير معيّن!"
        echo ""
        echo "  أنشئ API Token من: https://dash.cloudflare.com/profile/api-tokens"
        echo "  الصلاحيات المطلوبة: Zone → DNS → Edit"
        echo ""
        echo "  ثم شغّل:"
        echo "  export CLOUDFLARE_API_TOKEN='your_token_here'"
        echo "  ./scripts/ssl-certbot-setup.sh issue your-domain.com"
        exit 1
    fi

    log_ok "المتطلبات متوفرة"
}

# ============================================
# إعداد ملف Cloudflare credentials
# ============================================
setup_cloudflare_credentials() {
    mkdir -p "${CERTBOT_DIR}"
    
    cat > "${CLOUDFLARE_CREDENTIALS}" <<EOF
# Cloudflare API Token for Certbot DNS-01 Challenge
# هذا الملف يحتوي على بيانات حساسة — لا ترفعه لـ Git!
dns_cloudflare_api_token = ${CLOUDFLARE_API_TOKEN}
EOF

    chmod 600 "${CLOUDFLARE_CREDENTIALS}"
    log_ok "تم إنشاء ملف Cloudflare credentials"
}

# ============================================
# إصدار شهادة جديدة
# ============================================
issue_certificate() {
    local DOMAIN="$1"
    
    if [ -z "${DOMAIN}" ]; then
        log_error "يجب تحديد النطاق!"
        echo "  الاستخدام: ./scripts/ssl-certbot-setup.sh issue rehab.alsarayatech.ly"
        exit 1
    fi

    log_info "جاري إصدار شهادة SSL لـ: ${DOMAIN}"
    
    check_prerequisites
    setup_cloudflare_credentials
    
    mkdir -p "${CERTS_DIR}"
    mkdir -p "${CERTBOT_DIR}/logs"
    mkdir -p "${CERTBOT_DIR}/config"
    mkdir -p "${CERTBOT_DIR}/work"

    # تشغيل Certbot عبر Docker (بدون تثبيت على السيرفر)
    docker run --rm \
        -v "${CERTBOT_DIR}/config:/etc/letsencrypt" \
        -v "${CERTBOT_DIR}/work:/var/lib/letsencrypt" \
        -v "${CERTBOT_DIR}/logs:/var/log/letsencrypt" \
        -v "${CLOUDFLARE_CREDENTIALS}:/etc/cloudflare.ini:ro" \
        certbot/dns-cloudflare:latest \
        certonly \
        --dns-cloudflare \
        --dns-cloudflare-credentials /etc/cloudflare.ini \
        --dns-cloudflare-propagation-seconds 30 \
        --email "${EMAIL}" \
        --agree-tos \
        --no-eff-email \
        --non-interactive \
        -d "${DOMAIN}" \
        -d "*.${DOMAIN}"

    if [ $? -ne 0 ]; then
        log_error "فشل إصدار الشهادة!"
        echo "  تحقق من صلاحيات API Token وأن النطاق مُضاف في Cloudflare"
        exit 1
    fi

    log_ok "تم إصدار الشهادة بنجاح!"

    # نسخ الشهادات لمجلد Nginx
    copy_certs_to_nginx "${DOMAIN}"
    
    # إعادة تحميل Nginx
    reload_nginx
    
    # إعداد التجديد التلقائي
    setup_auto_renew
    
    echo ""
    log_ok "==========================================="
    log_ok "شهادة SSL جاهزة لـ: ${DOMAIN}"
    log_ok "الشهادة صالحة لمدة 90 يوم"
    log_ok "التجديد التلقائي مُفعّل (كل 12 ساعة)"
    log_ok "==========================================="
}

# ============================================
# نسخ الشهادات لـ Nginx
# ============================================
copy_certs_to_nginx() {
    local DOMAIN="$1"
    local CERT_PATH="${CERTBOT_DIR}/config/live/${DOMAIN}"

    if [ ! -d "${CERT_PATH}" ]; then
        log_error "مسار الشهادة غير موجود: ${CERT_PATH}"
        exit 1
    fi

    # نسخ مع الاحتفاظ بنسخة احتياطية
    if [ -f "${CERTS_DIR}/fullchain.pem" ]; then
        cp "${CERTS_DIR}/fullchain.pem" "${CERTS_DIR}/fullchain.pem.bak"
        cp "${CERTS_DIR}/privkey.pem" "${CERTS_DIR}/privkey.pem.bak"
        log_info "تم حفظ نسخة احتياطية من الشهادة القديمة"
    fi

    cp -L "${CERT_PATH}/fullchain.pem" "${CERTS_DIR}/fullchain.pem"
    cp -L "${CERT_PATH}/privkey.pem" "${CERTS_DIR}/privkey.pem"
    
    # أذونات آمنة
    chmod 644 "${CERTS_DIR}/fullchain.pem"
    chmod 600 "${CERTS_DIR}/privkey.pem"
    
    log_ok "تم نسخ الشهادات لـ Nginx"
}

# ============================================
# إعادة تحميل Nginx (بدون توقف)
# ============================================
reload_nginx() {
    if docker ps --format '{{.Names}}' | grep -q "^${NGINX_CONTAINER}$"; then
        docker exec "${NGINX_CONTAINER}" nginx -s reload
        log_ok "تم إعادة تحميل Nginx (بدون توقف)"
    else
        log_warn "حاوية ${NGINX_CONTAINER} غير موجودة — أعد تشغيل Docker Compose"
    fi
}

# ============================================
# تجديد الشهادة
# ============================================
renew_certificate() {
    log_info "جاري فحص وتجديد الشهادات..."
    
    if [ ! -d "${CERTBOT_DIR}/config" ]; then
        log_warn "لا توجد شهادات مُصدرة. استخدم 'issue' أولاً."
        exit 0
    fi

    if [ ! -f "${CLOUDFLARE_CREDENTIALS}" ]; then
        if [ -z "${CLOUDFLARE_API_TOKEN}" ]; then
            log_error "ملف Cloudflare credentials غير موجود و CLOUDFLARE_API_TOKEN غير معيّن"
            exit 1
        fi
        setup_cloudflare_credentials
    fi

    docker run --rm \
        -v "${CERTBOT_DIR}/config:/etc/letsencrypt" \
        -v "${CERTBOT_DIR}/work:/var/lib/letsencrypt" \
        -v "${CERTBOT_DIR}/logs:/var/log/letsencrypt" \
        -v "${CLOUDFLARE_CREDENTIALS}:/etc/cloudflare.ini:ro" \
        certbot/dns-cloudflare:latest \
        renew \
        --dns-cloudflare \
        --dns-cloudflare-credentials /etc/cloudflare.ini \
        --quiet \
        --no-self-upgrade

    if [ $? -eq 0 ]; then
        # اكتشاف النطاق من المجلدات الموجودة
        for DOMAIN_DIR in "${CERTBOT_DIR}/config/live"/*/; do
            DOMAIN=$(basename "${DOMAIN_DIR}")
            if [ "${DOMAIN}" != "README" ]; then
                copy_certs_to_nginx "${DOMAIN}"
            fi
        done
        reload_nginx
        log_ok "تم تجديد الشهادات بنجاح"
    else
        log_warn "لا توجد شهادات تحتاج تجديد حالياً"
    fi
}

# ============================================
# إعداد التجديد التلقائي (Cron)
# ============================================
setup_auto_renew() {
    local SCRIPT_PATH="$(readlink -f "$0")"
    local CRON_JOB="0 */12 * * * ${SCRIPT_PATH} renew >> /var/log/saraya-ssl-renew.log 2>&1"
    
    # تحقق هل الـ cron job مُضاف مسبقاً
    if crontab -l 2>/dev/null | grep -q "ssl-certbot-setup.sh renew"; then
        log_info "Cron job للتجديد التلقائي موجود مسبقاً"
        return
    fi

    # إضافة الـ cron job
    (crontab -l 2>/dev/null; echo "${CRON_JOB}") | crontab -
    log_ok "تم إضافة Cron job للتجديد التلقائي (كل 12 ساعة)"
}

# ============================================
# عرض حالة الشهادة
# ============================================
show_status() {
    log_info "حالة الشهادات:"
    echo ""
    
    if [ ! -d "${CERTBOT_DIR}/config" ]; then
        log_warn "لا توجد شهادات مُصدرة"
        return
    fi

    docker run --rm \
        -v "${CERTBOT_DIR}/config:/etc/letsencrypt:ro" \
        certbot/certbot:latest \
        certificates

    echo ""
    
    # عرض تاريخ انتهاء الشهادة المُثبتة في Nginx
    if [ -f "${CERTS_DIR}/fullchain.pem" ]; then
        echo "📜 شهادة Nginx الحالية:"
        openssl x509 -in "${CERTS_DIR}/fullchain.pem" -noout -subject -dates 2>/dev/null || \
            echo "   (تعذر قراءة الشهادة — قد تكون self-signed)"
    fi
}

# ============================================
# نقطة الدخول
# ============================================
case "${1}" in
    issue)
        issue_certificate "${2}"
        ;;
    renew)
        renew_certificate
        ;;
    status)
        show_status
        ;;
    *)
        echo ""
        echo "============================================"
        echo "  Saraya SSL — إدارة شهادات Let's Encrypt"
        echo "============================================"
        echo ""
        echo "الاستخدام:"
        echo "  $0 issue <domain>    إصدار شهادة جديدة"
        echo "  $0 renew             تجديد الشهادات الموجودة"
        echo "  $0 status            عرض حالة الشهادات"
        echo ""
        echo "أمثلة:"
        echo "  export CLOUDFLARE_API_TOKEN='xxx'"
        echo "  $0 issue rehab.alsarayatech.ly"
        echo ""
        echo "ملاحظات:"
        echo "  - يستخدم DNS-01 Challenge عبر Cloudflare API"
        echo "  - يعمل بدون فتح port 80 للإنترنت"
        echo "  - يُصدر شهادة للنطاق + Wildcard (*.domain)"
        echo "  - التجديد تلقائي كل 12 ساعة عبر cron"
        echo ""
        ;;
esac
