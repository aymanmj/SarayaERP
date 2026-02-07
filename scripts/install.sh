#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                    Saraya ERP - Automated Installation Script              ║
# ║                         سكربت التنصيب التلقائي لنظام سرايا                  ║
# ╚════════════════════════════════════════════════════════════════════════════╝
#
# الاستخدام:
#   curl -fsSL https://raw.githubusercontent.com/aymanmj/SarayaERP/main/scripts/install.sh | sudo bash
#   أو
#   sudo ./install.sh
#
# ════════════════════════════════════════════════════════════════════════════════

set -e

# ════════════════════════════════════════════════════════════════════════════════
# الألوان والتنسيق
# ════════════════════════════════════════════════════════════════════════════════
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

# ════════════════════════════════════════════════════════════════════════════════
# المتغيرات الافتراضية
# ════════════════════════════════════════════════════════════════════════════════
INSTALL_DIR="/opt/saraya-erp"
GITHUB_OWNER="aymanmj"
GITHUB_REPO="SarayaERP"
BRANCH="main"
LOG_FILE="/var/log/saraya-install.log"

# ════════════════════════════════════════════════════════════════════════════════
# الدوال المساعدة
# ════════════════════════════════════════════════════════════════════════════════

print_header() {
    clear
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║     ███████╗ █████╗ ██████╗  █████╗ ██╗   ██╗ █████╗          ║"
    echo "║     ██╔════╝██╔══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗         ║"
    echo "║     ███████╗███████║██████╔╝███████║ ╚████╔╝ ███████║         ║"
    echo "║     ╚════██║██╔══██║██╔══██╗██╔══██║  ╚██╔╝  ██╔══██║         ║"
    echo "║     ███████║██║  ██║██║  ██║██║  ██║   ██║   ██║  ██║         ║"
    echo "║     ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝         ║"
    echo "║                                                                ║"
    echo "║                    نظام سرايا للإدارة المتكاملة                 ║"
    echo "║                     Automated Installation                     ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

print_step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${MAGENTA}  الخطوة $1: $2${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    log "STEP $1: $2"
}

print_status() {
    echo -e "  ${GREEN}✓${NC} $1"
    log "SUCCESS: $1"
}

print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    log "WARNING: $1"
}

print_error() {
    echo -e "  ${RED}✗${NC} $1"
    log "ERROR: $1"
}

print_info() {
    echo -e "  ${CYAN}ℹ${NC} $1"
}

spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# ════════════════════════════════════════════════════════════════════════════════
# التحقق من المتطلبات
# ════════════════════════════════════════════════════════════════════════════════

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "يجب تشغيل هذا السكربت كـ root"
        echo -e "  استخدم: ${YELLOW}sudo ./install.sh${NC}"
        exit 1
    fi
}

check_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        print_error "نظام التشغيل غير مدعوم"
        exit 1
    fi

    case $OS in
        ubuntu|debian)
            print_status "نظام التشغيل: $PRETTY_NAME"
            ;;
        *)
            print_error "نظام التشغيل $OS غير مدعوم. يُدعم فقط Ubuntu/Debian"
            exit 1
            ;;
    esac
}

check_resources() {
    # RAM
    TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$TOTAL_RAM" -lt 3500 ]; then
        print_warning "RAM: ${TOTAL_RAM}MB (الحد الأدنى 4GB)"
    else
        print_status "RAM: ${TOTAL_RAM}MB ✓"
    fi

    # Disk
    AVAILABLE_DISK=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
    if [ "$AVAILABLE_DISK" -lt 40 ]; then
        print_warning "المساحة المتاحة: ${AVAILABLE_DISK}GB (الحد الأدنى 50GB)"
    else
        print_status "المساحة المتاحة: ${AVAILABLE_DISK}GB ✓"
    fi

    # CPU
    CPU_CORES=$(nproc)
    print_status "عدد الأنوية: $CPU_CORES"
}

# ════════════════════════════════════════════════════════════════════════════════
# تثبيت Docker
# ════════════════════════════════════════════════════════════════════════════════

install_docker() {
    if command -v docker &> /dev/null; then
        print_status "Docker مثبت بالفعل: $(docker --version)"
    else
        print_info "جاري تثبيت Docker..."
        curl -fsSL https://get.docker.com | sh >> "$LOG_FILE" 2>&1
        print_status "تم تثبيت Docker بنجاح"
    fi

    # تفعيل Docker
    systemctl enable docker >> "$LOG_FILE" 2>&1
    systemctl start docker >> "$LOG_FILE" 2>&1
    print_status "Docker يعمل ومفعل عند الإقلاع"

    # إضافة المستخدم للمجموعة
    if [ -n "$SUDO_USER" ]; then
        usermod -aG docker "$SUDO_USER"
        print_status "تمت إضافة $SUDO_USER لمجموعة docker"
    fi
}

# ════════════════════════════════════════════════════════════════════════════════
# تثبيت الأدوات المطلوبة
# ════════════════════════════════════════════════════════════════════════════════

install_dependencies() {
    print_info "جاري تثبيت الأدوات المطلوبة..."
    apt-get update >> "$LOG_FILE" 2>&1
    apt-get install -y curl wget git nano net-tools jq unzip >> "$LOG_FILE" 2>&1
    print_status "تم تثبيت جميع الأدوات المطلوبة"
}

# ════════════════════════════════════════════════════════════════════════════════
# إعداد المجلدات
# ════════════════════════════════════════════════════════════════════════════════

setup_directories() {
    print_info "جاري إعداد المجلدات..."

    mkdir -p "$INSTALL_DIR"/{backups,logs,ssl,production/nginx}
    
    if [ -n "$SUDO_USER" ]; then
        chown -R "$SUDO_USER":"$SUDO_USER" "$INSTALL_DIR"
    fi

    print_status "تم إنشاء المجلدات في $INSTALL_DIR"
}

# ════════════════════════════════════════════════════════════════════════════════
# تحميل ملفات المشروع
# ════════════════════════════════════════════════════════════════════════════════

download_files() {
    print_info "جاري تحميل ملفات المشروع..."

    cd "$INSTALL_DIR"

    # تحميل docker-compose.production.yml
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/docker-compose.production.yml" \
        -o docker-compose.production.yml

    # تحميل .env.example
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/.env.example" \
        -o .env.example

    # تحميل nginx.conf (HTTP only - without SSL)
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/production/nginx/nginx-http.conf" \
        -o production/nginx/nginx.conf

    # تحميل السكربتات
    mkdir -p scripts
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/scripts/update.sh" \
        -o scripts/update.sh
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/scripts/backup.sh" \
        -o scripts/backup.sh
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/scripts/setup-ghcr.sh" \
        -o scripts/setup-ghcr.sh
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/scripts/auto-update.sh" \
        -o scripts/auto-update.sh

    chmod +x scripts/*.sh

    # ════════════════════════════════════════════════════════════════════════════════
    # تحميل ملفات المراقبة (Monitoring)
    # ════════════════════════════════════════════════════════════════════════════════
    print_info "جاري تحميل ملفات المراقبة..."
    
    mkdir -p monitoring/grafana/datasources
    mkdir -p monitoring/grafana/dashboards
    
    # Prometheus configuration
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/monitoring/prometheus.yml" \
        -o monitoring/prometheus.yml
    
    # Alert rules
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/monitoring/alert_rules.yml" \
        -o monitoring/alert_rules.yml
    
    # Alertmanager configuration
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/monitoring/alertmanager.yml" \
        -o monitoring/alertmanager.yml
    
    # Grafana datasources
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/monitoring/grafana/datasources/prometheus.yml" \
        -o monitoring/grafana/datasources/prometheus.yml
    
    # Grafana dashboards
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/monitoring/grafana/dashboards/dashboard.yml" \
        -o monitoring/grafana/dashboards/dashboard.yml

    print_status "تم تحميل جميع الملفات"
}

# ════════════════════════════════════════════════════════════════════════════════
# إنشاء ملف البيئة
# ════════════════════════════════════════════════════════════════════════════════

generate_env_file() {
    print_info "جاري إنشاء ملف الإعدادات..."

    # توليد قيم عشوائية
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
    JWT_SECRET=$(openssl rand -hex 32)
    WATCHTOWER_TOKEN=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    REDIS_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)

    cat > "$INSTALL_DIR/.env.production" << EOF
# ════════════════════════════════════════════════════════════════════════════════
# Saraya ERP - Production Environment (Auto-generated)
# Generated on: $(date)
# Client: $CLIENT_NAME
# ════════════════════════════════════════════════════════════════════════════════

# Database
POSTGRES_USER=admin
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=saraya_erp
DATABASE_URL=postgresql://admin:$POSTGRES_PASSWORD@postgres:5432/saraya_erp?schema=public

# Security
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=86400

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD

# Application
NODE_ENV=production
PORT=3000
SERVER_PORT=3000

# License
LICENSE_PATH=/app/data/saraya.lic

# Tailscale
TAILSCALE_AUTHKEY=$TAILSCALE_AUTHKEY
TAILSCALE_HOSTNAME=$TAILSCALE_HOSTNAME

# GHCR
GITHUB_REPOSITORY_OWNER=$GITHUB_OWNER
IMAGE_TAG=latest

# Watchtower
WATCHTOWER_TOKEN=$WATCHTOWER_TOKEN

# Monitoring
GRAFANA_PASSWORD=admin123

# Backup
BACKUP_SCHEDULE="0 2,14 * * *"
BACKUP_RETENTION_DAYS=30

# CORS Configuration
CORS_ORIGIN=*
CORS_ORIGINS=*
EOF

    # Create symlink for default .env (important for docker-compose)
    ln -sf .env.production "$INSTALL_DIR/.env"

    print_status "تم إنشاء ملف .env.production"
    print_warning "كلمات المرور تم توليدها تلقائياً - احتفظ بنسخة احتياطية!"
}

# ════════════════════════════════════════════════════════════════════════════════
# إعداد GHCR
# ════════════════════════════════════════════════════════════════════════════════

setup_ghcr() {
    echo ""
    print_info "لسحب صور Docker، تحتاج GitHub Personal Access Token"
    echo ""
    echo -e "  ${YELLOW}للحصول على Token:${NC}"
    echo "  1. افتح: https://github.com/settings/tokens"
    echo "  2. اضغط 'Generate new token (classic)'"
    echo "  3. اختر صلاحية: ✓ read:packages"
    echo "  4. انسخ الـ Token"
    echo ""

    read -p "  أدخل GitHub Username: " GITHUB_USER
    read -sp "  أدخل GitHub PAT: " GITHUB_PAT
    echo ""

    if [ -z "$GITHUB_USER" ] || [ -z "$GITHUB_PAT" ]; then
        print_warning "تم تخطي إعداد GHCR - ستحتاج إعداده لاحقاً"
        return
    fi

    echo "$GITHUB_PAT" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin >> "$LOG_FILE" 2>&1

    if [ $? -eq 0 ]; then
        print_status "تم تسجيل الدخول لـ GHCR بنجاح"

        # نسخ credentials لـ root (يحتاجها Watchtower)
        if [ -n "$SUDO_USER" ]; then
            USER_HOME=$(eval echo ~$SUDO_USER)
            if [ -f "$USER_HOME/.docker/config.json" ]; then
                mkdir -p /root/.docker
                cp "$USER_HOME/.docker/config.json" /root/.docker/config.json
                chmod 600 /root/.docker/config.json
                print_status "تم إعداد Watchtower للوصول لـ GHCR"
            fi
        fi
    else
        print_error "فشل تسجيل الدخول - تحقق من Username و PAT"
    fi
}

# ════════════════════════════════════════════════════════════════════════════════
# جمع معلومات العميل
# ════════════════════════════════════════════════════════════════════════════════

collect_client_info() {
    echo ""
    echo -e "${BOLD}${CYAN}  معلومات العميل${NC}"
    echo -e "${CYAN}  ─────────────────${NC}"
    echo ""

    read -p "  اسم المؤسسة (بالإنجليزية، بدون مسافات): " CLIENT_NAME
    CLIENT_NAME=${CLIENT_NAME:-saraya-client}
    CLIENT_NAME=$(echo "$CLIENT_NAME" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')

    TAILSCALE_HOSTNAME="saraya-${CLIENT_NAME}"
    print_status "اسم Tailscale: $TAILSCALE_HOSTNAME"

    echo ""
    echo -e "  ${YELLOW}مفتاح Tailscale (اختياري - للوصول البعيد):${NC}"
    echo "  احصل عليه من: https://login.tailscale.com/admin/settings/keys"
    echo ""
    read -p "  أدخل Tailscale Auth Key (أو اضغط Enter للتخطي): " TAILSCALE_AUTHKEY
    
    if [ -z "$TAILSCALE_AUTHKEY" ]; then
        print_warning "تم تخطي Tailscale - يمكنك إضافته لاحقاً"
    else
        print_status "تم إضافة مفتاح Tailscale"
    fi
}

# ════════════════════════════════════════════════════════════════════════════════
# سحب الصور وتشغيل النظام
# ════════════════════════════════════════════════════════════════════════════════

pull_and_start() {
    cd "$INSTALL_DIR"

    print_info "جاري سحب صور Docker..."
    docker compose -f docker-compose.production.yml --env-file .env.production pull >> "$LOG_FILE" 2>&1 || true
    print_status "تم سحب الصور المتاحة"

    print_info "جاري تشغيل الخدمات الأساسية..."
    
    # Start core services first (in order)
    docker compose -f docker-compose.production.yml --env-file .env.production up -d postgres redis >> "$LOG_FILE" 2>&1
    print_info "انتظار PostgreSQL و Redis..."
    sleep 15
    
    # Start backend
    docker compose -f docker-compose.production.yml --env-file .env.production up -d backend >> "$LOG_FILE" 2>&1
    print_info "انتظار Backend..."
    sleep 30
    
    # Start frontend and nginx
    docker compose -f docker-compose.production.yml --env-file .env.production up -d frontend nginx >> "$LOG_FILE" 2>&1
    print_info "انتظار Frontend و Nginx..."
    sleep 10
    
    # Start optional services (portainer, watchtower)
    docker compose -f docker-compose.production.yml --env-file .env.production up -d portainer watchtower >> "$LOG_FILE" 2>&1 || true
    
    print_status "تم تشغيل جميع الخدمات الأساسية"

    # التحقق من الحالة
    print_info "جاري التحقق من حالة الخدمات..."
    sleep 5
    
    if docker ps --format "{{.Names}}" | grep -q "saraya_backend"; then
        print_status "Backend يعمل ✓"
    else
        print_warning "Backend قد يحتاج وقتاً إضافياً للبدء"
    fi
    
    if docker ps --format "{{.Names}}" | grep -q "saraya_nginx"; then
        print_status "Nginx يعمل ✓"
    else
        print_warning "Nginx قد يحتاج وقتاً إضافياً للبدء"
    fi
}

# ════════════════════════════════════════════════════════════════════════════════
# إنشاء خدمة systemd
# ════════════════════════════════════════════════════════════════════════════════

create_systemd_service() {
    cat > /etc/systemd/system/saraya-erp.service << EOF
[Unit]
Description=Saraya ERP System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/docker compose -f docker-compose.production.yml --env-file .env.production up -d
ExecStop=/usr/bin/docker compose -f docker-compose.production.yml --env-file .env.production down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable saraya-erp.service >> "$LOG_FILE" 2>&1
    print_status "تم إنشاء خدمة systemd للتشغيل التلقائي"
}

# ════════════════════════════════════════════════════════════════════════════════
# إعداد التحديث التلقائي (Cron)
# ════════════════════════════════════════════════════════════════════════════════

setup_cron_jobs() {
    print_info "جاري إعداد التحديث التلقائي..."
    
    # Create cron job for auto-update at 3 AM daily
    cat > /etc/cron.d/saraya-update << EOF
# Saraya ERP - Automatic Update
# Runs daily at 3:00 AM
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

0 3 * * * root $INSTALL_DIR/scripts/auto-update.sh >> /var/log/saraya-update.log 2>&1
EOF

    chmod 644 /etc/cron.d/saraya-update
    
    # Create cron job for daily backup at 2 AM
    cat > /etc/cron.d/saraya-backup << EOF
# Saraya ERP - Automatic Backup
# Runs daily at 2:00 AM (before update)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

0 2 * * * root $INSTALL_DIR/scripts/backup.sh >> /var/log/saraya-backup.log 2>&1
EOF

    chmod 644 /etc/cron.d/saraya-backup
    
    print_status "تم إعداد التحديث التلقائي (3:00 صباحاً يومياً)"
    print_status "تم إعداد النسخ الاحتياطي التلقائي (2:00 صباحاً يومياً)"
}

# ════════════════════════════════════════════════════════════════════════════════
# عرض الملخص النهائي
# ════════════════════════════════════════════════════════════════════════════════

show_summary() {
    # الحصول على IP
    SERVER_IP=$(hostname -I | awk '{print $1}')

    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}║            ✓ تم تثبيت Saraya ERP بنجاح!                        ║${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}  معلومات الوصول:${NC}"
    echo -e "  ─────────────────────────────────────────────────────────────"
    echo ""
    echo -e "  ${CYAN}🌐 التطبيق:${NC}       http://$SERVER_IP"
    echo -e "  ${CYAN}📊 Portainer:${NC}    http://$SERVER_IP:9000"
    echo -e "  ${CYAN}📈 Grafana:${NC}      http://$SERVER_IP:3001"
    echo ""
    echo -e "  ${BOLD}أوامر مفيدة:${NC}"
    echo -e "  ─────────────────────────────────────────────────────────────"
    echo ""
    echo -e "  ${YELLOW}# عرض حالة الخدمات${NC}"
    echo -e "  cd $INSTALL_DIR && docker compose -f docker-compose.production.yml ps"
    echo ""
    echo -e "  ${YELLOW}# عرض السجلات${NC}"
    echo -e "  cd $INSTALL_DIR && docker compose -f docker-compose.production.yml logs -f"
    echo ""
    echo -e "  ${YELLOW}# تحديث النظام${NC}"
    echo -e "  cd $INSTALL_DIR && ./scripts/update.sh"
    echo ""
    echo -e "  ${YELLOW}# إيقاف/تشغيل النظام${NC}"
    echo -e "  sudo systemctl stop saraya-erp"
    echo -e "  sudo systemctl start saraya-erp"
    echo ""
    echo -e "  ${BOLD}ملفات مهمة:${NC}"
    echo -e "  ─────────────────────────────────────────────────────────────"
    echo -e "  📁 مجلد التثبيت:     $INSTALL_DIR"
    echo -e "  📄 ملف الإعدادات:    $INSTALL_DIR/.env.production"
    echo -e "  📄 سجل التثبيت:      $LOG_FILE"
    echo ""

    if [ -n "$TAILSCALE_HOSTNAME" ] && [ -n "$TAILSCALE_AUTHKEY" ]; then
        echo -e "  ${BOLD}الوصول البعيد (Tailscale):${NC}"
        echo -e "  ─────────────────────────────────────────────────────────────"
        echo -e "  🔗 الاسم: $TAILSCALE_HOSTNAME"
        echo -e "  ⚠️  تذكر تفعيل Subnet Routes في Tailscale Admin Console"
        echo ""
    fi

    echo -e "  ${RED}⚠️  مهم: احتفظ بنسخة من ملف .env.production${NC}"
    echo ""
}

# ════════════════════════════════════════════════════════════════════════════════
# البرنامج الرئيسي
# ════════════════════════════════════════════════════════════════════════════════

main() {
    # إنشاء ملف السجل
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"

    print_header
    log "Starting Saraya ERP Installation"

    # الخطوة 1: التحقق من المتطلبات
    print_step "1" "التحقق من المتطلبات"
    check_root
    check_os
    check_resources

    # الخطوة 2: جمع معلومات العميل
    print_step "2" "معلومات العميل"
    collect_client_info

    # الخطوة 3: تثبيت المتطلبات
    print_step "3" "تثبيت المتطلبات"
    install_dependencies
    install_docker

    # الخطوة 4: إعداد المجلدات
    print_step "4" "إعداد المجلدات"
    setup_directories
    download_files

    # الخطوة 5: إعداد GHCR
    print_step "5" "إعداد GitHub Container Registry"
    setup_ghcr

    # الخطوة 6: إنشاء ملف البيئة
    print_step "6" "إعداد ملف البيئة"
    generate_env_file

    # الخطوة 7: نسخ ملف الرخصة
    print_step "7" "ملف الرخصة"
    echo ""
    echo -e "  ${YELLOW}هل لديك ملف الرخصة (saraya.lic)؟${NC}"
    read -p "  أدخل المسار الكامل للملف (أو اضغط Enter للتخطي): " LICENSE_PATH
    
    if [ -n "$LICENSE_PATH" ] && [ -f "$LICENSE_PATH" ]; then
        cp "$LICENSE_PATH" "$INSTALL_DIR/saraya.lic"
        print_status "تم نسخ ملف الرخصة"
    else
        print_warning "تم تخطي ملف الرخصة - النظام سيعمل في وضع التفعيل"
    fi

    # الخطوة 8: سحب وتشغيل
    print_step "8" "تشغيل النظام"
    pull_and_start

    # الخطوة 9: إنشاء خدمة systemd
    print_step "9" "إعداد التشغيل التلقائي"
    create_systemd_service

    # الخطوة 10: إعداد التحديث التلقائي
    print_step "10" "إعداد التحديث والنسخ الاحتياطي التلقائي"
    setup_cron_jobs

    # عرض الملخص
    show_summary

    log "Installation completed successfully"
}

# تشغيل البرنامج
main "$@"
