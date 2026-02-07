#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#                    SARAYA ERP - QUICK INSTALLER
#                         التثبيت السريع بأمر واحد
# ═══════════════════════════════════════════════════════════════════════════════
#
# الاستخدام:
#   curl -fsSL https://raw.githubusercontent.com/aymanmj/SarayaERP/main/scripts/quick-install.sh | sudo bash
#
#   أو من مجلد مشترك:
#   sudo bash /mnt/hgfs/SarayaERP/scripts/quick-install.sh
#
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/saraya-erp"
GITHUB_OWNER="aymanmj"
GITHUB_REPO="SarayaERP"
GITHUB_BRANCH="main"
LOG_FILE="/var/log/saraya-install.log"

# Detect if running from shared folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || SCRIPT_DIR=""
if [[ "$SCRIPT_DIR" == *"/mnt/hgfs/"* ]] || [[ "$SCRIPT_DIR" == *"/mnt/shared/"* ]]; then
    SOURCE_DIR="$(dirname "$SCRIPT_DIR")"
    INSTALL_MODE="local"
else
    SOURCE_DIR=""
    INSTALL_MODE="remote"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Colors
# ─────────────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE" 2>/dev/null || true; }
info() { echo -e "  ${CYAN}▸${NC} $1"; log "INFO: $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; log "SUCCESS: $1"; }
warning() { echo -e "  ${YELLOW}⚠${NC} $1"; log "WARNING: $1"; }
error() { echo -e "  ${RED}✗${NC} $1"; log "ERROR: $1"; }

header() {
    clear
    echo -e "${CYAN}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════════╗
    ║                                                                   ║
    ║      ███████╗ █████╗ ██████╗  █████╗ ██╗   ██╗ █████╗            ║
    ║      ██╔════╝██╔══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗           ║
    ║      ███████╗███████║██████╔╝███████║ ╚████╔╝ ███████║           ║
    ║      ╚════██║██╔══██║██╔══██╗██╔══██║  ╚██╔╝  ██╔══██║           ║
    ║      ███████║██║  ██║██║  ██║██║  ██║   ██║   ██║  ██║           ║
    ║      ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝           ║
    ║                                                                   ║
    ║                 Enterprise Resource Planning System               ║
    ║                        Quick Installation                         ║
    ║                                                                   ║
    ╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

step() {
    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  $1${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight Checks
# ─────────────────────────────────────────────────────────────────────────────
preflight() {
    step "🔍 Checking System Requirements"
    
    # Root check
    if [ "$EUID" -ne 0 ]; then
        error "This script must be run as root"
        echo -e "  Run: ${YELLOW}sudo bash $0${NC}"
        exit 1
    fi
    success "Running as root"

    # OS check
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
            error "Unsupported OS: $ID. Only Ubuntu/Debian supported."
            exit 1
        fi
        success "Operating System: $PRETTY_NAME"
    fi

    # RAM check
    TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$TOTAL_RAM" -lt 3500 ]; then
        warning "RAM: ${TOTAL_RAM}MB (Recommended: 4GB+)"
    else
        success "RAM: ${TOTAL_RAM}MB"
    fi

    # Disk check
    AVAILABLE_DISK=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
    if [ "$AVAILABLE_DISK" -lt 40 ]; then
        warning "Disk: ${AVAILABLE_DISK}GB free (Recommended: 50GB+)"
    else
        success "Disk: ${AVAILABLE_DISK}GB free"
    fi

    # Mode info
    if [ "$INSTALL_MODE" = "local" ]; then
        success "Install Mode: Local (from shared folder)"
        info "Source: $SOURCE_DIR"
    else
        success "Install Mode: Remote (from GitHub)"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Install Dependencies
# ─────────────────────────────────────────────────────────────────────────────
install_deps() {
    step "📦 Installing Dependencies"
    
    info "Updating package lists..."
    apt-get update -qq >> "$LOG_FILE" 2>&1
    
    info "Installing required packages..."
    apt-get install -y -qq curl wget git nano jq dos2unix >> "$LOG_FILE" 2>&1
    success "Dependencies installed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Install Docker
# ─────────────────────────────────────────────────────────────────────────────
install_docker() {
    step "🐳 Installing Docker"
    
    if command -v docker &> /dev/null; then
        success "Docker already installed: $(docker --version | cut -d' ' -f3)"
    else
        info "Installing Docker..."
        curl -fsSL https://get.docker.com | sh >> "$LOG_FILE" 2>&1
        success "Docker installed"
    fi

    systemctl enable docker >> "$LOG_FILE" 2>&1
    systemctl start docker >> "$LOG_FILE" 2>&1
    success "Docker service running"

    if [ -n "$SUDO_USER" ]; then
        usermod -aG docker "$SUDO_USER" 2>/dev/null || true
        success "Added $SUDO_USER to docker group"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Setup Files
# ─────────────────────────────────────────────────────────────────────────────
setup_files() {
    step "📁 Setting Up Installation"
    
    mkdir -p "$INSTALL_DIR"/{backups,logs,ssl,production/nginx,scripts}
    
    if [ "$INSTALL_MODE" = "local" ]; then
        # Copy from shared folder
        info "Copying files from shared folder..."
        
        cp "$SOURCE_DIR/docker-compose.production.yml" "$INSTALL_DIR/" 2>/dev/null || \
            error "docker-compose.production.yml not found"
        
        [ -f "$SOURCE_DIR/.env.production" ] && \
            cp "$SOURCE_DIR/.env.production" "$INSTALL_DIR/"
        
        [ -f "$SOURCE_DIR/.env.example" ] && \
            cp "$SOURCE_DIR/.env.example" "$INSTALL_DIR/"
        
        [ -f "$SOURCE_DIR/production/nginx/nginx.conf" ] && \
            cp "$SOURCE_DIR/production/nginx/nginx.conf" "$INSTALL_DIR/production/nginx/"
        
        [ -f "$SOURCE_DIR/saraya.lic" ] && \
            cp "$SOURCE_DIR/saraya.lic" "$INSTALL_DIR/"
        
        # Copy scripts
        for script in "$SOURCE_DIR/scripts/"*.sh; do
            [ -f "$script" ] && cp "$script" "$INSTALL_DIR/scripts/"
        done
        
        # Convert Windows line endings
        dos2unix "$INSTALL_DIR"/*.yml 2>/dev/null || true
        dos2unix "$INSTALL_DIR"/*.production 2>/dev/null || true
        dos2unix "$INSTALL_DIR/scripts/"*.sh 2>/dev/null || true
        
        success "Files copied from shared folder"
    else
        # Download from GitHub
        info "Downloading files from GitHub..."
        
        BASE_URL="https://raw.githubusercontent.com/$GITHUB_OWNER/$GITHUB_REPO/$GITHUB_BRANCH"
        
        curl -fsSL "$BASE_URL/docker-compose.production.yml" -o "$INSTALL_DIR/docker-compose.production.yml"
        curl -fsSL "$BASE_URL/.env.example" -o "$INSTALL_DIR/.env.example"
        curl -fsSL "$BASE_URL/production/nginx/nginx.conf" -o "$INSTALL_DIR/production/nginx/nginx.conf" 2>/dev/null || true
        
        for script in update.sh backup.sh health-check.sh; do
            curl -fsSL "$BASE_URL/scripts/$script" -o "$INSTALL_DIR/scripts/$script" 2>/dev/null || true
        done
        
        success "Files downloaded from GitHub"
    fi
    
    chmod +x "$INSTALL_DIR/scripts/"*.sh 2>/dev/null || true
    
    if [ -n "$SUDO_USER" ]; then
        chown -R "$SUDO_USER":"$SUDO_USER" "$INSTALL_DIR"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Configure Environment
# ─────────────────────────────────────────────────────────────────────────────
configure_env() {
    step "⚙️ Configuration"
    
    # Client name
    echo ""
    echo -e "  ${BOLD}Enter client/organization name (English, no spaces):${NC}"
    read -p "  > " CLIENT_NAME
    CLIENT_NAME=${CLIENT_NAME:-saraya-client}
    CLIENT_NAME=$(echo "$CLIENT_NAME" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')
    success "Client: $CLIENT_NAME"

    # Tailscale (optional)
    echo ""
    echo -e "  ${BOLD}Tailscale Auth Key (optional, for remote access):${NC}"
    echo -e "  ${CYAN}Get from: https://login.tailscale.com/admin/settings/keys${NC}"
    read -p "  > " TAILSCALE_KEY
    
    if [ -n "$TAILSCALE_KEY" ]; then
        success "Tailscale configured"
    else
        warning "Tailscale skipped (local access only)"
    fi

    # Generate secure passwords
    POSTGRES_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    JWT_SECRET=$(openssl rand -hex 32)
    REDIS_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
    WT_TOKEN=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)

    # Create .env.production
    cat > "$INSTALL_DIR/.env.production" << EOF
# ═══════════════════════════════════════════════════════════════════════════════
# Saraya ERP - Production Configuration
# Generated: $(date)
# Client: $CLIENT_NAME
# ═══════════════════════════════════════════════════════════════════════════════

# Database
POSTGRES_USER=admin
POSTGRES_PASSWORD=$POSTGRES_PASS
POSTGRES_DB=saraya_erp
DATABASE_URL=postgresql://admin:$POSTGRES_PASS@postgres:5432/saraya_erp?schema=public

# Security
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=86400

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASS

# Application
NODE_ENV=production
PORT=3000
SERVER_PORT=3000

# License
LICENSE_PATH=/app/data/saraya.lic

# Tailscale
TAILSCALE_AUTHKEY=$TAILSCALE_KEY
TAILSCALE_HOSTNAME=saraya-$CLIENT_NAME

# GHCR
GITHUB_REPOSITORY_OWNER=$GITHUB_OWNER
IMAGE_TAG=latest

# Watchtower
WATCHTOWER_TOKEN=$WT_TOKEN

# Monitoring
GRAFANA_PASSWORD=admin123

# Backup
BACKUP_SCHEDULE="0 2,14 * * *"
BACKUP_RETENTION_DAYS=30
EOF

    success "Environment configured"
}

# ─────────────────────────────────────────────────────────────────────────────
# Setup GHCR
# ─────────────────────────────────────────────────────────────────────────────
setup_ghcr() {
    step "🔐 GitHub Container Registry Setup"
    
    echo ""
    echo -e "  ${BOLD}GitHub credentials for pulling Docker images:${NC}"
    echo -e "  ${CYAN}Get PAT from: https://github.com/settings/tokens${NC}"
    echo -e "  ${CYAN}Required permission: read:packages${NC}"
    echo ""
    
    read -p "  GitHub Username: " GH_USER
    read -sp "  GitHub PAT: " GH_PAT
    echo ""

    if [ -z "$GH_USER" ] || [ -z "$GH_PAT" ]; then
        warning "GHCR skipped - you'll need to configure manually"
        return
    fi

    echo "$GH_PAT" | docker login ghcr.io -u "$GH_USER" --password-stdin >> "$LOG_FILE" 2>&1

    if [ $? -eq 0 ]; then
        success "Logged in to GHCR"
        
        # Setup for Watchtower
        mkdir -p /root/.docker
        if [ -n "$SUDO_USER" ]; then
            USER_HOME=$(eval echo ~$SUDO_USER)
            [ -f "$USER_HOME/.docker/config.json" ] && \
                cp "$USER_HOME/.docker/config.json" /root/.docker/config.json
        fi
        chmod 600 /root/.docker/config.json 2>/dev/null || true
        success "Watchtower configured for GHCR"
    else
        error "GHCR login failed - check credentials"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Deploy
# ─────────────────────────────────────────────────────────────────────────────
deploy() {
    step "🚀 Deploying Saraya ERP"
    
    cd "$INSTALL_DIR"
    
    info "Pulling Docker images..."
    docker compose -f docker-compose.production.yml --env-file .env.production pull >> "$LOG_FILE" 2>&1 || {
        error "Failed to pull images - check GHCR credentials"
        return 1
    }
    success "Images pulled"
    
    info "Starting services..."
    docker compose -f docker-compose.production.yml --env-file .env.production up -d >> "$LOG_FILE" 2>&1
    success "Services started"
    
    info "Waiting for services to be ready..."
    sleep 20
    
    # Health check
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        success "Backend is healthy"
    else
        warning "Backend starting (may take a minute)"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Create Systemd Service
# ─────────────────────────────────────────────────────────────────────────────
create_service() {
    step "⚡ Creating System Service"
    
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
    success "Auto-start service created"
}

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
summary() {
    SERVER_IP=$(hostname -I | awk '{print $1}')
    
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║              ✅ INSTALLATION COMPLETE!                            ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}Access URLs:${NC}"
    echo -e "  ────────────────────────────────────────────────────────────────"
    echo -e "  🌐 Application:    ${CYAN}http://$SERVER_IP${NC}"
    echo -e "  📊 Portainer:      ${CYAN}http://$SERVER_IP:9000${NC}"
    echo -e "  📈 Grafana:        ${CYAN}http://$SERVER_IP:3001${NC}"
    echo ""
    echo -e "  ${BOLD}Management Commands:${NC}"
    echo -e "  ────────────────────────────────────────────────────────────────"
    echo -e "  ${YELLOW}cd $INSTALL_DIR${NC}"
    echo -e "  ${YELLOW}./scripts/health-check.sh${NC}    # Check system status"
    echo -e "  ${YELLOW}./scripts/update.sh${NC}          # Update system"
    echo ""
    echo -e "  ${BOLD}Files:${NC}"
    echo -e "  ────────────────────────────────────────────────────────────────"
    echo -e "  📁 Install Dir:    $INSTALL_DIR"
    echo -e "  📄 Config:         $INSTALL_DIR/.env.production"
    echo -e "  📄 Logs:           $LOG_FILE"
    echo ""
    echo -e "  ${RED}⚠️  Save a backup of .env.production - it contains your passwords!${NC}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
main() {
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE" 2>/dev/null || true
    
    header
    preflight
    install_deps
    install_docker
    setup_files
    configure_env
    setup_ghcr
    deploy
    create_service
    summary
    
    log "Installation completed successfully"
}

main "$@"
