#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#                    SARAYA ERP - SIMPLE INSTALLER
#                    التثبيت من المجلد المشترك
# ═══════════════════════════════════════════════════════════════════════════════

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

INSTALL_DIR="/opt/saraya-erp"

# Detect source directory (shared folder)
SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║               SARAYA ERP - SIMPLE INSTALLER                   ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Source:${NC} $SOURCE_DIR"
echo -e "  ${GREEN}Target:${NC} $INSTALL_DIR"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Run as root (sudo)${NC}"
    exit 1
fi

# Step 1: Install dependencies
echo -e "${YELLOW}[1/7] Installing dependencies...${NC}"
apt-get update -qq
apt-get install -y -qq curl dos2unix
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Step 2: Install Docker
echo -e "${YELLOW}[2/7] Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker
systemctl start docker
echo -e "${GREEN}✓ Docker ready${NC}"

# Step 3: Create directories
echo -e "${YELLOW}[3/7] Setting up directories...${NC}"
mkdir -p "$INSTALL_DIR"/{backups,logs,production/nginx,production/kong,scripts,monitoring/grafana/provisioning/datasources,monitoring/grafana/provisioning/dashboards,monitoring/grafana/dashboards,data/license,data/keys,uploads}
echo -e "${GREEN}✓ Directories created${NC}"

# Step 4: Copy files from shared folder
echo -e "${YELLOW}[4/7] Copying files...${NC}"

cp "$SOURCE_DIR/docker-compose.production.yml" "$INSTALL_DIR/"
cp "$SOURCE_DIR/.env.production" "$INSTALL_DIR/"
cp "$SOURCE_DIR/.env.example" "$INSTALL_DIR/" 2>/dev/null || true
cp "$SOURCE_DIR/.env.template" "$INSTALL_DIR/" 2>/dev/null || true

# Symlink .env -> .env.production
ln -sf .env.production "$INSTALL_DIR/.env" 2>/dev/null || true

if [ -d "$SOURCE_DIR/production/nginx" ]; then
    cp "$SOURCE_DIR/production/nginx/nginx.conf" "$INSTALL_DIR/production/nginx/" 2>/dev/null || true
fi

if [ -d "$SOURCE_DIR/production/kong" ]; then
    cp "$SOURCE_DIR/production/kong/kong.yml" "$INSTALL_DIR/production/kong/" 2>/dev/null || true
fi

if [ -f "$SOURCE_DIR/saraya.lic" ]; then
    cp "$SOURCE_DIR/saraya.lic" "$INSTALL_DIR/data/license/"
    chown 1000:1000 "$INSTALL_DIR/data/license/saraya.lic" 2>/dev/null || true
fi

# Copy ALL scripts
if [ -d "$SOURCE_DIR/scripts" ]; then
    cp "$SOURCE_DIR/scripts/"*.sh "$INSTALL_DIR/scripts/" 2>/dev/null || true
fi

# Copy monitoring configs
if [ -d "$SOURCE_DIR/monitoring" ]; then
    cp -r "$SOURCE_DIR/monitoring/"* "$INSTALL_DIR/monitoring/" 2>/dev/null || true
fi

# Copy frontend env
if [ -f "$SOURCE_DIR/client/.env.example" ]; then
    mkdir -p "$INSTALL_DIR/client"
    cp "$SOURCE_DIR/client/.env.example" "$INSTALL_DIR/client/" 2>/dev/null || true
fi

# Convert Windows line endings to Unix
dos2unix "$INSTALL_DIR"/*.yml 2>/dev/null || true
dos2unix "$INSTALL_DIR"/.env* 2>/dev/null || true
dos2unix "$INSTALL_DIR/scripts/"*.sh 2>/dev/null || true
dos2unix "$INSTALL_DIR/production/kong/"*.yml 2>/dev/null || true
dos2unix "$INSTALL_DIR/monitoring/"*.yml 2>/dev/null || true

chmod +x "$INSTALL_DIR/scripts/"*.sh 2>/dev/null || true

# Set ownership for data directories
chown -R 1000:1000 "$INSTALL_DIR/data/license" 2>/dev/null || true
chown -R 1000:1000 "$INSTALL_DIR/uploads" 2>/dev/null || true
chown -R 1000:1000 "$INSTALL_DIR/backups" 2>/dev/null || true

echo -e "${GREEN}✓ Files copied${NC}"

# Step 5: Setup GHCR
echo -e "${YELLOW}[5/7] Setting up GHCR...${NC}"
echo ""
echo -e "  ${BOLD}Enter GitHub credentials (for pulling Docker images):${NC}"
echo ""
read -p "  GitHub Username [aymanmj]: " GH_USER
GH_USER=${GH_USER:-aymanmj}

echo -e "  GitHub PAT (paste and press Enter):"
read -r GH_PAT

if [ -n "$GH_PAT" ]; then
    echo "$GH_PAT" | docker login ghcr.io -u "$GH_USER" --password-stdin
    
    if [ $? -eq 0 ]; then
        mkdir -p /root/.docker
        cp ~/.docker/config.json /root/.docker/ 2>/dev/null || true
        echo -e "${GREEN}✓ GHCR login successful${NC}"
    else
        echo -e "${YELLOW}⚠ GHCR login failed - you can try manually later${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Skipped GHCR setup${NC}"
fi

# Step 6: Pull and start services
echo -e "${YELLOW}[6/7] Starting services...${NC}"
cd "$INSTALL_DIR"

echo "  Pulling Docker images (this may take a few minutes)..."
docker compose -f docker-compose.production.yml --env-file .env.production pull

echo "  Starting containers..."
docker compose -f docker-compose.production.yml --env-file .env.production up -d

echo -e "${GREEN}✓ Services started${NC}"

# Step 7: Create systemd service
echo -e "${YELLOW}[7/7] Creating auto-start service...${NC}"
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
systemctl enable saraya-erp.service
echo -e "${GREEN}✓ Auto-start enabled${NC}"

# Summary
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ✅ INSTALLATION COMPLETE!                        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Access URLs:${NC}"
echo -e "  ─────────────────────────────────────────────────────"
echo -e "  🌐 Application:  ${CYAN}http://$SERVER_IP${NC}"
echo -e "  📊 Portainer:    ${CYAN}http://$SERVER_IP:9000${NC}"
echo ""
echo -e "  ${BOLD}Commands:${NC}"
echo -e "  ─────────────────────────────────────────────────────"
echo -e "  cd $INSTALL_DIR"
echo -e "  docker compose -f docker-compose.production.yml ps"
echo ""
echo -e "  ${YELLOW}Wait 1-2 minutes for all services to start!${NC}"
echo ""
