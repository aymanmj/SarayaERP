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
    echo -e "${BOLD}${MAGENTA}  Step $1: $2${NC}"
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
        print_error "Must run as root (يجب تشغيل السكربت كـ root)"
        echo -e "  Use: ${YELLOW}sudo ./install.sh${NC}"
        exit 1
    fi
}

check_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        print_error "Unsupported OS"
        exit 1
    fi

    case $OS in
        ubuntu|debian)
            print_status "OS: $PRETTY_NAME"
            ;;
        *)
            print_error "OS $OS not supported. Only Ubuntu/Debian supported"
            exit 1
            ;;
    esac
}

check_resources() {
    # RAM
    TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$TOTAL_RAM" -lt 3500 ]; then
        print_warning "RAM: ${TOTAL_RAM}MB (min 4GB)"
    else
        print_status "RAM: ${TOTAL_RAM}MB OK"
    fi

    # Disk
    AVAILABLE_DISK=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
    if [ "$AVAILABLE_DISK" -lt 40 ]; then
        print_warning "Disk: ${AVAILABLE_DISK}GB (min 50GB)"
    else
        print_status "Disk: ${AVAILABLE_DISK}GB OK"
    fi

    # CPU
    CPU_CORES=$(nproc)
    print_status "CPU Cores: $CPU_CORES"
}

# ════════════════════════════════════════════════════════════════════════════════
# تثبيت Docker
# ════════════════════════════════════════════════════════════════════════════════

install_docker() {
    if command -v docker &> /dev/null; then
        print_status "Docker already installed: $(docker --version)"
    else
        print_info "Installing Docker..."
        curl -fsSL https://get.docker.com | sh >> "$LOG_FILE" 2>&1
        print_status "Docker installed successfully"
    fi

    # Enable Docker (Try systemctl, fallback to warning)
    if systemctl enable docker >> "$LOG_FILE" 2>&1; then
        print_status "Docker enabled on boot"
    else
        print_warning "Could not enable docker service (systemctl failed or not available)"
    fi
    
    if systemctl start docker >> "$LOG_FILE" 2>&1; then
        print_status "Docker service started"
    else
        print_warning "Could not start docker service via systemctl (check manually)"
    fi

    # Add user to group
    if [ -n "$SUDO_USER" ]; then
        usermod -aG docker "$SUDO_USER" >> "$LOG_FILE" 2>&1 || true
        print_status "Added $SUDO_USER to docker group"
    fi
}

# ════════════════════════════════════════════════════════════════════════════════
# تثبيت الأدوات المطلوبة
# ════════════════════════════════════════════════════════════════════════════════

install_dependencies() {
    print_info "Installing required tools..."
    
    # Update package lists
    if ! apt-get update >> "$LOG_FILE" 2>&1; then
        print_warning "apt-get update failed - continuing anyway..."
    fi

    # Install packages
    PACKAGES="curl wget git nano net-tools jq unzip openssl"
    if ! apt-get install -y $PACKAGES >> "$LOG_FILE" 2>&1; then
        print_error "Failed to install dependencies. Check log for details:"
        tail -n 20 "$LOG_FILE"
        exit 1
    fi
    
    print_status "All required tools installed"
}

# ════════════════════════════════════════════════════════════════════════════════
# إعداد المجلدات
# ════════════════════════════════════════════════════════════════════════════════

setup_directories() {
    print_info "Setting up directories..."

    mkdir -p "$INSTALL_DIR"/{backups,logs,certs,production/nginx,scripts,monitoring/grafana/datasources,monitoring/grafana/dashboards,data/license,uploads}
    
    # Fix permissions - run as root
    chmod -R 755 "$INSTALL_DIR"

    # Set ownership for data directories to node user (UID 1000)
    # This fixes the EACCES error for license and uploads
    chown -R 1000:1000 "$INSTALL_DIR/data/license"
    chown -R 1000:1000 "$INSTALL_DIR/uploads"
    chown -R 1000:1000 "$INSTALL_DIR/backups"
    chmod 775 "$INSTALL_DIR/data/license"
    chmod 775 "$INSTALL_DIR/uploads"
    chmod 775 "$INSTALL_DIR/backups"
    
    if [ -n "$SUDO_USER" ]; then
        # Keep config files owned by user, but data owned by container user
        chown "$SUDO_USER":"$SUDO_USER" "$INSTALL_DIR"
        chown -R "$SUDO_USER":"$SUDO_USER" "$INSTALL_DIR/production"
        chown -R "$SUDO_USER":"$SUDO_USER" "$INSTALL_DIR/scripts"
    fi

    # Copy public.key if present (handles custom keys)
    if [ -f "public.key" ]; then
        cp public.key "$INSTALL_DIR/data/license/public.key"
        chown 1000:1000 "$INSTALL_DIR/data/license/public.key"
        chmod 644 "$INSTALL_DIR/data/license/public.key"
        print_status "Custom public.key installed"
    fi

    print_status "Directories created in $INSTALL_DIR"
}

# ════════════════════════════════════════════════════════════════════════════════
# تحميل ملفات المشروع
# ════════════════════════════════════════════════════════════════════════════════

download_files() {
    print_info "Downloading project files..."

    cd "$INSTALL_DIR"

    # Download docker-compose.production.yml
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/docker-compose.production.yml" \
        -o docker-compose.production.yml

    # Download .env.example
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/.env.example" \
        -o .env.example

    # Download nginx.conf (SSL-enabled)
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/production/nginx/nginx.conf" \
        -o production/nginx/nginx.conf

    # Download scripts
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/scripts/update.sh" \
        -o scripts/update.sh
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/scripts/backup.sh" \
        -o scripts/backup.sh
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/scripts/setup-ghcr.sh" \
        -o scripts/setup-ghcr.sh
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/scripts/auto-update.sh" \
        -o scripts/auto-update.sh

    chmod +x scripts/*.sh

    # ============================================================
    # Download Monitoring files
    # ============================================================
    print_info "Downloading monitoring files..."
    
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

    # ============================================================
    # Download Frontend Environment Template
    # ============================================================
    print_info "Downloading frontend environment template..."
    
    mkdir -p client
    curl -fsSL "https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$BRANCH/client/.env.example" \
        -o client/.env.example

    print_status "All files downloaded"
}

# ════════════════════════════════════════════════════════════════════════════════
# إنشاء ملف البيئة
# ════════════════════════════════════════════════════════════════════════════════

generate_env_file() {
    print_info "Creating environment file..."

    # Generate random values
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
    JWT_SECRET=$(openssl rand -hex 32)
    WATCHTOWER_TOKEN=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    REDIS_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
    ENCRYPTION_KEY=$(openssl rand -base64 32)
    ENCRYPTION_SALT="saraya-${CLIENT_NAME}-salt-$(openssl rand -hex 4)"

    # Determine CORS origins
    SERVER_IP=$(hostname -I | awk '{print $1}')
    if [ -n "$CLIENT_DOMAIN" ]; then
        CORS_VALUE="https://${CLIENT_DOMAIN}"
    else
        CORS_VALUE="https://${SERVER_IP},http://${SERVER_IP}"
    fi

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

# 🔒 Encryption (Patient PII - AES-256)
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENCRYPTION_SALT=$ENCRYPTION_SALT

# 🌐 CORS (Allowed Origins)
CORS_ORIGINS=$CORS_VALUE

# SSL Certificates
SSL_CERT_PATH=./certs

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD

# Application
NODE_ENV=production
PORT=3000
SERVER_PORT=3000
BASELINE_MIGRATIONS="false"

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
EOF

    # Create symlink for default .env (important for docker-compose)
    ln -sf .env.production "$INSTALL_DIR/.env"

    print_status ".env.production created"
    print_status "🔒 ENCRYPTION_KEY generated (unique per client)"
    print_status "🌐 CORS_ORIGINS set to: $CORS_VALUE"
    print_warning "Passwords were auto-generated - keep a backup!"
    print_warning "⚠️ ENCRYPTION_KEY must NEVER be changed after data is stored!"
}

# ════════════════════════════════════════════════════════════════════════════════
# إعداد ملف بيئة الواجهة الأمامية
# ════════════════════════════════════════════════════════════════════════════════

generate_frontend_env() {
    print_info "Configuring frontend environment file..."

    # Get server IP
    SERVER_IP=$(hostname -I | awk '{print $1}')

    # Determine API URL based on domain availability
    if [ -n "$CLIENT_DOMAIN" ]; then
        API_URL="https://${CLIENT_DOMAIN}/api"
        API_BASE_URL="https://${CLIENT_DOMAIN}"
    else
        API_URL="http://${SERVER_IP}:3000"
        API_BASE_URL="http://${SERVER_IP}:3000"
    fi

    # Create client directory if not exists
    mkdir -p "$INSTALL_DIR/client"

    # Copy .env.example to .env.local
    if [ -f "$INSTALL_DIR/client/.env.example" ]; then
        cp "$INSTALL_DIR/client/.env.example" "$INSTALL_DIR/client/.env.local"
        
        # Replace placeholders with actual values
        sed -i "s|YOUR_SERVER_IP|$SERVER_IP|g" "$INSTALL_DIR/client/.env.local"
        if [ -n "$CLIENT_DOMAIN" ]; then
            sed -i "s|http://$SERVER_IP:3000|$API_URL|g" "$INSTALL_DIR/client/.env.local"
        fi
        
        print_status "Frontend .env.local created (API: $API_BASE_URL)"
    else
        # Create minimal .env.local if template not found
        cat > "$INSTALL_DIR/client/.env.local" <<EOF
# Saraya ERP - Frontend Environment (Auto-generated)
VITE_API_URL=$API_URL
VITE_API_BASE_URL=$API_BASE_URL
VITE_APP_NAME=Saraya ERP
VITE_APP_VERSION=1.0.1
VITE_ENABLE_NOTIFICATIONS=true
VITE_DEBUG_MODE=false
EOF
        print_status "Frontend .env.local created (API: $API_BASE_URL)"
    fi
}

# ════════════════════════════════════════════════════════════════════════════════
# إعداد شهادات SSL
# ════════════════════════════════════════════════════════════════════════════════

setup_ssl_certificates() {
    print_info "Setting up SSL certificates for HTTPS..."

    CERTS_DIR="$INSTALL_DIR/certs"
    mkdir -p "$CERTS_DIR"

    # Check if certificates already exist
    if [ -f "$CERTS_DIR/fullchain.pem" ] && [ -f "$CERTS_DIR/privkey.pem" ]; then
        print_status "SSL certificates already exist in $CERTS_DIR"
        return
    fi

    echo ""
    echo -e "  ${BOLD}${CYAN}SSL Certificate Options:${NC}"
    echo ""
    echo -e "  ${YELLOW}1)${NC} Import existing certificates (Cloudflare Origin, Let's Encrypt, etc.)"
    echo -e "  ${YELLOW}2)${NC} Generate self-signed certificate (for internal/LAN use)"
    echo -e "  ${YELLOW}3)${NC} Skip (configure later)"
    echo ""
    read -p "  Choose option [1-3]: " SSL_OPTION < /dev/tty

    case $SSL_OPTION in
        1)
            echo ""
            read -p "  Path to fullchain.pem (certificate): " CERT_PATH < /dev/tty
            read -p "  Path to privkey.pem (private key): " KEY_PATH < /dev/tty

            if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
                cp "$CERT_PATH" "$CERTS_DIR/fullchain.pem"
                cp "$KEY_PATH" "$CERTS_DIR/privkey.pem"
                chmod 600 "$CERTS_DIR/privkey.pem"
                chmod 644 "$CERTS_DIR/fullchain.pem"
                print_status "SSL certificates imported successfully"
            else
                print_error "Certificate files not found!"
                print_warning "Falling back to self-signed certificate..."
                generate_self_signed_cert
            fi
            ;;
        2)
            generate_self_signed_cert
            ;;
        3)
            print_warning "SSL skipped - HTTPS will not work until certificates are added"
            print_info "To add later: place fullchain.pem and privkey.pem in $CERTS_DIR"
            ;;
        *)
            print_info "No option selected - generating self-signed certificate..."
            generate_self_signed_cert
            ;;
    esac
}

generate_self_signed_cert() {
    CERTS_DIR="$INSTALL_DIR/certs"
    CERT_CN="${CLIENT_DOMAIN:-saraya-erp}"

    print_info "Generating self-signed certificate for: $CERT_CN"

    openssl req -x509 -nodes -days 3650 \
        -newkey rsa:2048 \
        -keyout "$CERTS_DIR/privkey.pem" \
        -out "$CERTS_DIR/fullchain.pem" \
        -subj "/CN=$CERT_CN/O=Saraya ERP/C=LY" \
        >> "$LOG_FILE" 2>&1

    chmod 600 "$CERTS_DIR/privkey.pem"
    chmod 644 "$CERTS_DIR/fullchain.pem"

    print_status "Self-signed SSL certificate generated (valid for 10 years)"
    print_warning "Browsers will show a security warning - this is normal for self-signed certs"
}

# ════════════════════════════════════════════════════════════════════════════════
# إعداد GHCR
# ════════════════════════════════════════════════════════════════════════════════

setup_ghcr() {
    echo ""
    print_info "To pull Docker images, you need a GitHub Personal Access Token"
    echo ""
    echo -e "  ${YELLOW}To get a Token:${NC}"
    echo "  1. Open: https://github.com/settings/tokens"
    echo "  2. Click 'Generate new token (classic)'"
    echo "  3. Select scope: read:packages"
    echo "  4. Copy the Token"
    echo ""

    read -p "  Enter GitHub Username: " GITHUB_USER < /dev/tty
    echo -e "  (Input is hidden - paste and press Enter even if you see nothing)"
    read -sp "  Enter GitHub PAT: " GITHUB_PAT < /dev/tty
    echo ""

    if [ -z "$GITHUB_USER" ] || [ -z "$GITHUB_PAT" ]; then
        print_warning "Skipped GHCR setup - attempting public access or local build"
        return
    fi

    echo "$GITHUB_PAT" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin >> "$LOG_FILE" 2>&1

    if [ $? -eq 0 ]; then
        print_status "Successfully logged in to GHCR"

        # Copy credentials for root (needed by Watchtower)
        if [ -n "$SUDO_USER" ]; then
            USER_HOME=$(eval echo ~$SUDO_USER)
            if [ -f "$USER_HOME/.docker/config.json" ]; then
                mkdir -p /root/.docker
                cp "$USER_HOME/.docker/config.json" /root/.docker/config.json
                chmod 600 /root/.docker/config.json
                print_status "Watchtower configured for GHCR access"
            fi
        fi
    else
        print_error "Login failed - check Username and PAT"
    fi
}

# ════════════════════════════════════════════════════════════════════════════════
# جمع معلومات العميل
# ════════════════════════════════════════════════════════════════════════════════

collect_client_info() {
    echo ""
    echo -e "${BOLD}${CYAN}  Client Information${NC}"
    echo -e "${CYAN}  ─────────────────${NC}"
    echo ""

    read -p "  Organization name (English, no spaces): " CLIENT_NAME < /dev/tty
    CLIENT_NAME=${CLIENT_NAME:-saraya-client}
    CLIENT_NAME=$(echo "$CLIENT_NAME" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')

    TAILSCALE_HOSTNAME="saraya-${CLIENT_NAME}"
    print_status "Tailscale hostname: $TAILSCALE_HOSTNAME"

    echo ""
    echo -e "  ${YELLOW}Domain name (optional - for HTTPS):${NC}"
    echo "  Example: erp.yourdomain.com"
    echo ""
    read -p "  Enter domain (or press Enter for IP-only access): " CLIENT_DOMAIN < /dev/tty
    
    if [ -n "$CLIENT_DOMAIN" ]; then
        print_status "Domain: $CLIENT_DOMAIN"
    else
        print_info "No domain - system will be accessed via IP"
    fi

    echo ""
    echo -e "  ${YELLOW}Tailscale Auth Key (optional - for remote access):${NC}"
    echo "  Get it from: https://login.tailscale.com/admin/settings/keys"
    echo ""
    read -p "  Enter Tailscale Auth Key (or press Enter to skip): " TAILSCALE_AUTHKEY < /dev/tty
    
    if [ -z "$TAILSCALE_AUTHKEY" ]; then
        print_warning "Tailscale skipped - you can add it later"
    else
        print_status "Tailscale key added"
    fi
}

# ════════════════════════════════════════════════════════════════════════════════
# سحب الصور وتشغيل النظام
# ════════════════════════════════════════════════════════════════════════════════

pull_and_start() {
    cd "$INSTALL_DIR"

    print_info "Pulling Docker images..."
    docker compose -f docker-compose.production.yml --env-file .env.production pull >> "$LOG_FILE" 2>&1 || true
    print_status "Images pulled"

    print_info "Starting core services..."
    
    # Start core services first (in order)
    if ! docker compose -f docker-compose.production.yml --env-file .env.production up -d postgres redis >> "$LOG_FILE" 2>&1; then
        print_error "Failed to start database services!"
        echo -e "${YELLOW}Last 20 lines of log:${NC}"
        tail -n 20 "$LOG_FILE"
        exit 1
    fi
    
    print_info "Waiting for PostgreSQL and Redis..."
    sleep 15
    
    # Start backend
    if ! docker compose -f docker-compose.production.yml --env-file .env.production up -d backend >> "$LOG_FILE" 2>&1; then
        print_error "Failed to start Backend service!"
        echo -e "${YELLOW}Last 20 lines of log:${NC}"
        tail -n 30 "$LOG_FILE"
        exit 1
    fi
    
    print_info "Waiting for Backend..."
    sleep 30
    
    # Start frontend and nginx
    if ! docker compose -f docker-compose.production.yml --env-file .env.production up -d frontend nginx >> "$LOG_FILE" 2>&1; then
        print_error "Failed to start Frontend/Nginx!"
        echo -e "${YELLOW}Last 30 lines of log:${NC}"
        tail -n 30 "$LOG_FILE"
        exit 1
    fi
    
    print_info "Waiting for Frontend and Nginx..."
    sleep 10
    
    # Start optional services (portainer, watchtower)
    docker compose -f docker-compose.production.yml --env-file .env.production up -d portainer watchtower >> "$LOG_FILE" 2>&1 || true
    
    print_status "All core services started"

    # Health check
    print_info "Checking service status..."
    sleep 5
    
    if docker ps --format "{{.Names}}" | grep -q "saraya_backend"; then
        print_status "Backend is running OK"
    else
        print_warning "Backend may need more time to start (or check logs)"
    fi
    
    if docker ps --format "{{.Names}}" | grep -q "saraya_nginx"; then
        print_status "Nginx is running OK"
    else
        print_warning "Nginx may need more time to start (or check logs)"
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
    print_status "systemd service created for auto-start"
}

# ════════════════════════════════════════════════════════════════════════════════
# إعداد التحديث التلقائي (Cron)
# ════════════════════════════════════════════════════════════════════════════════

setup_cron_jobs() {
    print_info "Setting up automatic updates..."
    
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
    
    print_status "Auto-update configured (daily at 3:00 AM)"
    print_status "Auto-backup configured (daily at 2:00 AM)"
}

# ════════════════════════════════════════════════════════════════════════════════
# عرض الملخص النهائي
# ════════════════════════════════════════════════════════════════════════════════

show_summary() {
    # Get server IP
    SERVER_IP=$(hostname -I | awk '{print $1}')

    echo ""
    echo -e "${GREEN}+================================================================+${NC}"
    echo -e "${GREEN}|                                                                |${NC}"
    echo -e "${GREEN}|            SUCCESS: Saraya ERP Installed!                      |${NC}"
    echo -e "${GREEN}|                                                                |${NC}"
    echo -e "${GREEN}+================================================================+${NC}"
    echo ""
    echo -e "${BOLD}  Access Information:${NC}"
    echo -e "  -----------------------------------------------------------------"
    echo ""
    if [ -n "$CLIENT_DOMAIN" ]; then
        echo -e "  ${CYAN}Web App:${NC}         https://$CLIENT_DOMAIN"
    else
        echo -e "  ${CYAN}Web App:${NC}         https://$SERVER_IP"
    fi
    echo -e "  ${CYAN}Portainer:${NC}       http://$SERVER_IP:9000"
    echo -e "  ${CYAN}Grafana:${NC}         http://$SERVER_IP:3001"
    echo ""
    echo -e "  ${BOLD}Useful Commands:${NC}"
    echo -e "  -----------------------------------------------------------------"
    echo ""
    echo -e "  ${YELLOW}# Check service status${NC}"
    echo -e "  cd $INSTALL_DIR && docker compose -f docker-compose.production.yml ps"
    echo ""
    echo -e "  ${YELLOW}# View logs${NC}"
    echo -e "  cd $INSTALL_DIR && docker compose -f docker-compose.production.yml logs -f"
    echo ""
    echo -e "  ${YELLOW}# Update system${NC}"
    echo -e "  cd $INSTALL_DIR && ./scripts/update.sh"
    echo ""
    echo -e "  ${YELLOW}# Stop/Start system${NC}"
    echo -e "  sudo systemctl stop saraya-erp"
    echo -e "  sudo systemctl start saraya-erp"
    echo ""
    echo -e "  ${BOLD}Important Files:${NC}"
    echo -e "  -----------------------------------------------------------------"
    echo -e "  Install Directory:  $INSTALL_DIR"
    echo -e "  Config File:        $INSTALL_DIR/.env.production"
    echo -e "  SSL Certificates:   $INSTALL_DIR/certs/"
    echo -e "  Install Log:        $LOG_FILE"
    echo ""

    if [ -n "$TAILSCALE_HOSTNAME" ] && [ -n "$TAILSCALE_AUTHKEY" ]; then
        echo -e "  ${BOLD}Remote Access (Tailscale):${NC}"
        echo -e "  -----------------------------------------------------------------"
        echo -e "  Hostname: $TAILSCALE_HOSTNAME"
        echo -e "  NOTE: Enable Subnet Routes in Tailscale Admin Console"
        echo ""
    fi

    echo -e "  ${RED}IMPORTANT: Keep a backup of .env.production file!${NC}"
    echo -e "  ${RED}IMPORTANT: ENCRYPTION_KEY must NEVER be changed after installation!${NC}"
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

    # Step 1: Check requirements
    print_step "1" "Checking Requirements"
    check_root
    check_os
    check_resources

    # Step 2: Collect client info
    print_step "2" "Client Information"
    collect_client_info

    # Step 3: Install dependencies
    print_step "3" "Installing Dependencies"
    install_dependencies
    install_docker

    # Step 4: Setup directories
    print_step "4" "Setting Up Directories"
    setup_directories
    download_files

    # Step 5: Setup GHCR
    print_step "5" "GitHub Container Registry Setup"
    setup_ghcr

    # Step 6: Create environment file
    print_step "6" "Creating Environment Files"
    generate_env_file
    generate_frontend_env

    # Step 6.5: Setup SSL Certificates
    print_step "6.5" "SSL Certificate Setup"
    setup_ssl_certificates

    # Step 7: License file
    print_step "7" "License File"
    
    # Clean up legacy saraya.lic if it exists (fix for EISDIR error)
    if [ -e "$INSTALL_DIR/saraya.lic" ]; then
        print_info "Removing legacy license file/directory..."
        rm -rf "$INSTALL_DIR/saraya.lic"
    fi

    echo ""
    echo -e "  ${YELLOW}Do you have a license file (saraya.lic)?${NC}"
    read -p "  Enter full path to license file (or press Enter to skip): " LICENSE_INPUT_PATH < /dev/tty
    
    HAS_LICENSE=false
    if [ -n "$LICENSE_INPUT_PATH" ] && [ -f "$LICENSE_INPUT_PATH" ]; then
        cp "$LICENSE_INPUT_PATH" "$INSTALL_DIR/saraya.lic.tmp"
        HAS_LICENSE=true
        print_status "License file staged for installation"
    else
        print_warning "License file skipped - system will run in activation mode"
    fi

    # Step 8: Pull and start
    print_step "8" "Starting System"
    pull_and_start

    # Inject license if provided
    # Inject license if provided
    if [ "$HAS_LICENSE" = true ]; then
        print_info "Injecting license into backend container..."
        # Wait a moment for container availability
        sleep 5
        
        # Ensure target directory exists
        docker exec saraya_backend mkdir -p /app/data/license >> "$LOG_FILE" 2>&1 || true

        if docker cp "$INSTALL_DIR/saraya.lic.tmp" saraya_backend:/app/data/license/saraya.lic; then
            print_status "License installed successfully"
            rm -f "$INSTALL_DIR/saraya.lic.tmp"
            
            # Restart backend to pick up the license immediately
            print_info "Restarting backend to apply license..."
            docker restart saraya_backend >> "$LOG_FILE" 2>&1
        else
            print_error "Failed to inject license. You may need to upload it manually."
            # Don't exit, just continue
        fi
    fi

    # Step 9: Create systemd service
    print_step "9" "Auto-Start Setup"
    create_systemd_service

    # Step 10: Setup automatic updates
    print_step "10" "Auto-Update and Backup Setup"
    setup_cron_jobs

    # Show summary
    show_summary

    log "Installation completed successfully"
}

# تشغيل البرنامج
main "$@"
