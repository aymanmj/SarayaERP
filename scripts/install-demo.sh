#!/bin/bash
# ==============================================================================
# Saraya ERP - Ubuntu VM Full-Production Demo Installer (GHCR + Cloudflare)
# ==============================================================================
# Installs a lightweight 6-container full-production demo stack:
#   postgres + redis + backend (GHCR) + frontend (GHCR) + nginx + cloudflared
#
# Usage on Ubuntu VM:
#   sudo bash scripts/install-demo.sh
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/saraya-demo"
SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║      SARAYA ERP - UBUNTU VM PRODUCTION DEMO INSTALLER           ║${NC}"
echo -e "${CYAN}║      Full Production Mode + GHCR + Cloudflare Tunnel            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: Please run as root (sudo bash scripts/install-demo.sh)${NC}"
  exit 1
fi

echo -e "${YELLOW}[1/7] Installing prerequisites (curl, openssl, ca-certificates)...${NC}"
apt-get update -qq
apt-get install -y -qq curl openssl ca-certificates >/dev/null
echo -e "${GREEN}✓ Prerequisites ready${NC}"

echo -e "${YELLOW}[2/7] Checking Docker & Docker Compose...${NC}"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker >/dev/null 2>&1 || true
systemctl start docker
if ! docker compose version >/dev/null 2>&1; then
  echo -e "${RED}Error: docker compose plugin not found. Install docker-compose-plugin.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker ready ($(docker --version))${NC}"

echo -e "${YELLOW}[3/7] Preparing directory structure at ${INSTALL_DIR}...${NC}"
mkdir -p "${INSTALL_DIR}"/{production/nginx,scripts,data/license,data/keys,uploads,backups}

for req_file in \
  "${SOURCE_DIR}/docker-compose.demo.yml" \
  "${SOURCE_DIR}/production/nginx/nginx.demo.conf" \
  "${SOURCE_DIR}/scripts/reset-demo.sh"; do
  if [ ! -f "$req_file" ]; then
    echo -e "${RED}Error: Required file not found: ${req_file}${NC}"
    echo "Run this script from a cloned SarayaERP repository directory."
    exit 1
  fi
done

cp "${SOURCE_DIR}/docker-compose.demo.yml" "${INSTALL_DIR}/docker-compose.demo.yml"
cp "${SOURCE_DIR}/production/nginx/nginx.demo.conf" "${INSTALL_DIR}/production/nginx/nginx.demo.conf"
cp "${SOURCE_DIR}/scripts/reset-demo.sh" "${INSTALL_DIR}/scripts/reset-demo.sh"
chmod +x "${INSTALL_DIR}/scripts/reset-demo.sh"

# Ensure node user (UID 1000) can read/write license, keys, uploads, backups
chown -R 1000:1000 "${INSTALL_DIR}/data" "${INSTALL_DIR}/uploads" "${INSTALL_DIR}/backups"
echo -e "${GREEN}✓ Files copied to ${INSTALL_DIR}${NC}"

echo -e "${YELLOW}[4/7] Configuring GHCR credentials...${NC}"
read -r -p "  GitHub Username [aymanmj]: " GH_USER
GH_USER=${GH_USER:-aymanmj}
read -r -s -p "  GitHub PAT (read:packages — leave empty if already logged in): " GH_PAT
echo ""
if [ -n "$GH_PAT" ]; then
  echo "$GH_PAT" | docker login ghcr.io -u "$GH_USER" --password-stdin
  echo -e "${GREEN}✓ Logged in to ghcr.io${NC}"
else
  echo -e "${CYAN}ℹ Skipping docker login (using existing credentials)${NC}"
fi

echo -e "${YELLOW}[5/7] Configuring Demo Domain, Image Tag & Cloudflare Tunnel...${NC}"
read -r -p "  Public Demo Domain (e.g. demo.alsarayatech.ly): " SARAYA_DOMAIN
while [ -z "$SARAYA_DOMAIN" ]; do
  read -r -p "  Public Demo Domain is required: " SARAYA_DOMAIN
done

read -r -p "  Docker IMAGE_TAG [latest]: " IMAGE_TAG
IMAGE_TAG=${IMAGE_TAG:-latest}

read -r -p "  Cloudflare TUNNEL_TOKEN: " TUNNEL_TOKEN
while [ -z "$TUNNEL_TOKEN" ]; do
  read -r -p "  Cloudflare TUNNEL_TOKEN is required: " TUNNEL_TOKEN
done

ENV_FILE="${INSTALL_DIR}/.env.demo"
if [ -f "$ENV_FILE" ]; then
  echo -e "${CYAN}ℹ Existing ${ENV_FILE} detected — updating domain/tag/tunnel and keeping existing DB/encryption keys.${NC}"
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" "$ENV_FILE"
  sed -i "s|^SARAYA_DOMAIN=.*|SARAYA_DOMAIN=${SARAYA_DOMAIN}|" "$ENV_FILE"
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${SARAYA_DOMAIN}|" "$ENV_FILE"
  sed -i "s|^TUNNEL_TOKEN=.*|TUNNEL_TOKEN=${TUNNEL_TOKEN}|" "$ENV_FILE"
else
  PG_PASS="$(openssl rand -hex 24)"
  REDIS_PASS="$(openssl rand -hex 24)"
  JWT_SEC="$(openssl rand -hex 48)"
  ENC_KEY="$(openssl rand -hex 32)"
  ENC_SALT="$(openssl rand -hex 16)"

  cat > "$ENV_FILE" <<EOF
GITHUB_REPOSITORY_OWNER=${GH_USER}
IMAGE_TAG=${IMAGE_TAG}
SARAYA_DOMAIN=${SARAYA_DOMAIN}
CORS_ORIGINS=https://${SARAYA_DOMAIN}
COOKIE_SECURE=true
DEMO_HTTP_PORT=80
TUNNEL_TOKEN=${TUNNEL_TOKEN}

POSTGRES_USER=saraya_demo
POSTGRES_DB=saraya_demo
POSTGRES_PASSWORD=${PG_PASS}
REDIS_PASSWORD=${REDIS_PASS}

JWT_SECRET=${JWT_SEC}
ENCRYPTION_KEY=${ENC_KEY}
ENCRYPTION_SALT=${ENC_SALT}

AV_SCANNER_MODE=eicar_builtin
ENABLE_STRICT_CSP=false
EOF
  chmod 600 "$ENV_FILE"
  echo -e "${GREEN}✓ Generated production secrets in ${ENV_FILE}${NC}"
fi

echo -e "${YELLOW}[6/7] Pulling GHCR images and starting demo containers...${NC}"
cd "$INSTALL_DIR"
docker compose -f docker-compose.demo.yml --env-file .env.demo pull
docker compose -f docker-compose.demo.yml --env-file .env.demo up -d

echo -e "${YELLOW}[7/7] Waiting for backend health & license Machine ID...${NC}"
HEALTHY=false
for i in $(seq 1 45); do
  if docker exec saraya_demo_backend curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$HEALTHY" != "true" ]; then
  echo -e "${RED}✗ Backend did not become healthy within 90s. Check logs:${NC}"
  echo "  docker logs --tail 100 saraya_demo_backend"
  exit 1
fi

MACHINE_ID="(not generated yet — check docker logs saraya_demo_backend)"
if [ -f "${INSTALL_DIR}/data/license/machine.id" ]; then
  MACHINE_ID="$(cat "${INSTALL_DIR}/data/license/machine.id" | tr -d '[:space:]')"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            SARAYA ERP PRODUCTION DEMO IS RUNNING!               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Public URL:${NC}       https://${SARAYA_DOMAIN}"
echo -e "  ${BOLD}Cloudflare Origin:${NC} http://saraya_nginx:80"
echo -e "  ${BOLD}Install Path:${NC}     ${INSTALL_DIR}"
echo -e "  ${BOLD}Machine ID:${NC}       ${CYAN}${MACHINE_ID}${NC}"
echo ""
echo -e "  ${YELLOW}NEXT STEP — Activate Full Production Enterprise License:${NC}"
echo -e "  1. On your admin workstation, run: ${BOLD}node admin-tools/issue-license.js${NC}"
echo -e "     - Paste Machine ID: ${CYAN}${MACHINE_ID}${NC}"
echo -e "     - Choose Plan: Enterprise (include ACCOUNTS, HR, ASSETS, LAB, RADIOLOGY, PHARMACY, OBGYN, INSURANCE_INTEGRATION)"
echo -e "  2. Open ${BOLD}https://${SARAYA_DOMAIN}/activation${NC} and paste the signed license key"
echo -e "     (or copy saraya.lic to ${INSTALL_DIR}/data/license/saraya.lic and restart backend)."
echo ""
echo -e "  ${BOLD}Demo Accounts:${NC}"
echo -e "    Admin:  admin / admin123"
echo -e "    Staff:  dr_ahmed, dr_sara, nurse_laila, reception_user, pharm_ali,"
echo -e "            cashier_mo, acc_samir, lab_user, rad_user, hr_muna (pass: 123456)"
echo ""
echo -e "  ${BOLD}Reset Demo Data Anytime:${NC}"
echo -e "    sudo ${INSTALL_DIR}/scripts/reset-demo.sh"
echo ""
