#!/bin/bash
# ==============================================================================
# Saraya ERP - Ubuntu VM Full-Production Demo Installer
# ==============================================================================
# Installs a lightweight production demo stack:
#   postgres + redis + backend + frontend + nginx (+ optional cloudflared tunnel)
#
# Supports:
#   1) Prebuilt GHCR images (default) OR --local-build from local repo source
#   2) Public HTTPS via Cloudflare Tunnel (default) OR --lan-http for LAN IP tests
#
# Usage on Ubuntu Server VM:
#   sudo bash scripts/install-demo.sh
#   sudo bash scripts/install-demo.sh --local-build
#   sudo bash scripts/install-demo.sh --local-build --lan-http
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

LOCAL_BUILD=false
LAN_HTTP=false

for arg in "$@"; do
  case "$arg" in
    --local-build)
      LOCAL_BUILD=true
      ;;
    --lan-http)
      LAN_HTTP=true
      ;;
    -h|--help)
      echo "Usage: sudo bash scripts/install-demo.sh [--local-build] [--lan-http]"
      echo "  --local-build   Build backend & frontend Docker images directly from local repo source"
      echo "  --lan-http      Configure local VM LAN HTTP access without Cloudflare Tunnel"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: ${arg}${NC}"
      echo "Usage: sudo bash scripts/install-demo.sh [--local-build] [--lan-http]"
      exit 1
      ;;
  esac
done

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║      SARAYA ERP - UBUNTU VM PRODUCTION DEMO INSTALLER           ║${NC}"
echo -e "${CYAN}║      Full Production Mode + GHCR/Local Build + HTTPS/LAN        ║${NC}"
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
if [ -f "${SOURCE_DIR}/docker-compose.demo.build.yml" ]; then
  cp "${SOURCE_DIR}/docker-compose.demo.build.yml" "${INSTALL_DIR}/docker-compose.demo.build.yml"
fi
sed -i 's/\r$//' \
  "${INSTALL_DIR}/docker-compose.demo.yml" \
  "${INSTALL_DIR}/production/nginx/nginx.demo.conf" \
  "${INSTALL_DIR}/scripts/reset-demo.sh"
chmod +x "${INSTALL_DIR}/scripts/reset-demo.sh"

# Ensure node user (UID 1000) can read/write license, keys, uploads, backups
chown -R 1000:1000 "${INSTALL_DIR}/data" "${INSTALL_DIR}/uploads" "${INSTALL_DIR}/backups"
echo -e "${GREEN}✓ Files copied to ${INSTALL_DIR}${NC}"

echo -e "${YELLOW}[4/7] Configuring Image Source (GHCR Pull vs Local Build)...${NC}"
if [ "$LOCAL_BUILD" != "true" ]; then
  echo "  1) Pull prebuilt production images from GHCR (default)"
  echo "  2) Build images locally on this VM from ${SOURCE_DIR}"
  read -r -p "  Choose image source [1]: " IMG_CHOICE
  IMG_CHOICE=${IMG_CHOICE:-1}
  if [ "$IMG_CHOICE" = "2" ]; then
    LOCAL_BUILD=true
  fi
fi

read -r -p "  GitHub Repository Owner / Namespace [aymanmj]: " GH_USER
GH_USER=${GH_USER:-aymanmj}
read -r -p "  Docker IMAGE_TAG [latest]: " IMAGE_TAG
IMAGE_TAG=${IMAGE_TAG:-latest}

if [ "$LOCAL_BUILD" = "true" ]; then
  if [ ! -f "${SOURCE_DIR}/server/Dockerfile" ] || [ ! -f "${SOURCE_DIR}/client/Dockerfile" ]; then
    echo -e "${RED}Error: server/Dockerfile or client/Dockerfile not found in ${SOURCE_DIR}.${NC}"
    exit 1
  fi
  echo -e "${CYAN}ℹ Building local production images (${GH_USER}/saraya-*:${IMAGE_TAG})...${NC}"
  docker build -t "ghcr.io/${GH_USER}/saraya-frontend:${IMAGE_TAG}" \
    --build-arg VITE_API_URL=/api \
    -f "${SOURCE_DIR}/client/Dockerfile" \
    "${SOURCE_DIR}/client"
  docker build -t "ghcr.io/${GH_USER}/saraya-backend:${IMAGE_TAG}" \
    -f "${SOURCE_DIR}/server/Dockerfile" \
    "${SOURCE_DIR}/server"
  echo -e "${GREEN}✓ Local production images built successfully${NC}"
else
  read -r -s -p "  GitHub PAT (read:packages — leave empty if already logged in or public): " GH_PAT
  echo ""
  if [ -n "$GH_PAT" ]; then
    echo "$GH_PAT" | docker login ghcr.io -u "$GH_USER" --password-stdin
    echo -e "${GREEN}✓ Logged in to ghcr.io${NC}"
  else
    echo -e "${CYAN}ℹ Skipping docker login (using existing credentials)${NC}"
  fi
fi

echo -e "${YELLOW}[5/7] Configuring Access Mode (Cloudflare HTTPS vs LAN HTTP)...${NC}"
if [ "$LAN_HTTP" != "true" ]; then
  echo "  1) Public HTTPS via Cloudflare Tunnel (recommended for live client demos) [default]"
  echo "  2) Local Ubuntu VM LAN HTTP only (no Cloudflare Tunnel needed)"
  read -r -p "  Choose access mode [1]: " ACCESS_CHOICE
  ACCESS_CHOICE=${ACCESS_CHOICE:-1}
  if [ "$ACCESS_CHOICE" = "2" ]; then
    LAN_HTTP=true
  fi
fi

if [ "$LAN_HTTP" = "true" ]; then
  DETECTED_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  DETECTED_IP=${DETECTED_IP:-127.0.0.1}
  read -r -p "  Ubuntu VM LAN IP or hostname [${DETECTED_IP}]: " SARAYA_DOMAIN
  SARAYA_DOMAIN=${SARAYA_DOMAIN:-$DETECTED_IP}
  DEMO_HTTP_PORT_VAL="80"
  CORS_ORIGINS_VAL="http://${SARAYA_DOMAIN},http://localhost,http://127.0.0.1"
  COOKIE_SECURE_VAL="false"
  TUNNEL_TOKEN="unused-lan-mode"
  DEMO_USE_TUNNEL="false"
  DEMO_SCHEME="http"
else
  read -r -p "  Public Demo Domain (e.g. demo.alsarayatech.ly): " SARAYA_DOMAIN
  while [ -z "$SARAYA_DOMAIN" ]; do
    read -r -p "  Public Demo Domain is required: " SARAYA_DOMAIN
  done
  read -r -p "  Cloudflare TUNNEL_TOKEN: " TUNNEL_TOKEN
  while [ -z "$TUNNEL_TOKEN" ]; do
    read -r -p "  Cloudflare TUNNEL_TOKEN is required: " TUNNEL_TOKEN
  done
  DEMO_HTTP_PORT_VAL="80"
  CORS_ORIGINS_VAL="https://${SARAYA_DOMAIN}"
  COOKIE_SECURE_VAL="true"
  DEMO_USE_TUNNEL="true"
  DEMO_SCHEME="https"
fi

upsert_env() {
  local file="$1"
  local key="$2"
  local val="$3"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

ENV_FILE="${INSTALL_DIR}/.env.demo"
if [ -f "$ENV_FILE" ]; then
  echo -e "${CYAN}ℹ Existing ${ENV_FILE} detected — updating network/tag settings and preserving DB & encryption secrets.${NC}"
  upsert_env "$ENV_FILE" "GITHUB_REPOSITORY_OWNER" "${GH_USER}"
  upsert_env "$ENV_FILE" "IMAGE_TAG" "${IMAGE_TAG}"
  upsert_env "$ENV_FILE" "SARAYA_DOMAIN" "${SARAYA_DOMAIN}"
  upsert_env "$ENV_FILE" "CORS_ORIGINS" "${CORS_ORIGINS_VAL}"
  upsert_env "$ENV_FILE" "COOKIE_SECURE" "${COOKIE_SECURE_VAL}"
  upsert_env "$ENV_FILE" "DEMO_HTTP_PORT" "${DEMO_HTTP_PORT_VAL}"
  upsert_env "$ENV_FILE" "TUNNEL_TOKEN" "${TUNNEL_TOKEN}"
  upsert_env "$ENV_FILE" "DEMO_USE_TUNNEL" "${DEMO_USE_TUNNEL}"
  if ! grep -qE "^PACS_PASSWORD=" "$ENV_FILE"; then
    upsert_env "$ENV_FILE" "PACS_USER" "saraya_pacs"
    upsert_env "$ENV_FILE" "PACS_PASSWORD" "$(openssl rand -hex 20)"
  fi
  upsert_env "$ENV_FILE" "RADIOLOGY_OHIF_ENABLED" "true"
  upsert_env "$ENV_FILE" "RADIOLOGY_ORTHANC_URL" "http://orthanc:8042"
else
  PG_PASS="$(openssl rand -hex 24)"
  REDIS_PASS="$(openssl rand -hex 24)"
  PACS_PASS="$(openssl rand -hex 20)"
  JWT_SEC="$(openssl rand -hex 48)"
  ENC_KEY="$(openssl rand -hex 32)"
  ENC_SALT="$(openssl rand -hex 16)"

  cat > "$ENV_FILE" <<EOF
GITHUB_REPOSITORY_OWNER=${GH_USER}
IMAGE_TAG=${IMAGE_TAG}
SARAYA_DOMAIN=${SARAYA_DOMAIN}
CORS_ORIGINS=${CORS_ORIGINS_VAL}
COOKIE_SECURE=${COOKIE_SECURE_VAL}
DEMO_HTTP_PORT=${DEMO_HTTP_PORT_VAL}
TUNNEL_TOKEN=${TUNNEL_TOKEN}
DEMO_USE_TUNNEL=${DEMO_USE_TUNNEL}

POSTGRES_USER=saraya_demo
POSTGRES_DB=saraya_demo
POSTGRES_PASSWORD=${PG_PASS}
REDIS_PASSWORD=${REDIS_PASS}

PACS_USER=saraya_pacs
PACS_PASSWORD=${PACS_PASS}
RADIOLOGY_OHIF_ENABLED=true
RADIOLOGY_ORTHANC_URL=http://orthanc:8042

JWT_SECRET=${JWT_SEC}
ENCRYPTION_KEY=${ENC_KEY}
ENCRYPTION_SALT=${ENC_SALT}

AV_SCANNER_MODE=eicar_builtin
ENABLE_STRICT_CSP=false
EOF
  chmod 600 "$ENV_FILE"
  echo -e "${GREEN}✓ Generated production secrets in ${ENV_FILE}${NC}"
fi

echo -e "${YELLOW}[6/7] Starting production demo containers...${NC}"
cd "$INSTALL_DIR"
if [ "$LOCAL_BUILD" != "true" ]; then
  if [ "$DEMO_USE_TUNNEL" = "true" ]; then
    docker compose -f docker-compose.demo.yml --env-file .env.demo pull
  else
    docker compose -f docker-compose.demo.yml --env-file .env.demo pull postgres redis orthanc backend frontend nginx
  fi
fi

if [ "$DEMO_USE_TUNNEL" = "true" ]; then
  docker compose -f docker-compose.demo.yml --env-file .env.demo up -d
else
  docker compose -f docker-compose.demo.yml --env-file .env.demo stop tunnel >/dev/null 2>&1 || true
  docker compose -f docker-compose.demo.yml --env-file .env.demo up -d postgres redis orthanc backend frontend nginx
fi

echo -e "${YELLOW}[7/7] Waiting for backend readiness (/api/health/ready — DB + Redis + Seed)...${NC}"
HEALTHY=false
for i in $(seq 1 60); do
  if docker exec saraya_demo_backend curl -sf http://localhost:3000/api/health/ready >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$HEALTHY" != "true" ]; then
  echo -e "${RED}✗ Backend did not pass /api/health/ready within 120s. Check logs:${NC}"
  echo "  docker logs --tail 100 saraya_demo_backend"
  exit 1
fi

MACHINE_ID="(not generated yet — check docker logs saraya_demo_backend)"
if [ -f "${INSTALL_DIR}/data/license/machine.id" ]; then
  MACHINE_ID="$(tr -d '[:space:]' < "${INSTALL_DIR}/data/license/machine.id")"
fi

ACCESS_URL="${DEMO_SCHEME}://${SARAYA_DOMAIN}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            SARAYA ERP PRODUCTION DEMO IS RUNNING!               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Access URL:${NC}       ${ACCESS_URL}"
if [ "$DEMO_USE_TUNNEL" = "true" ]; then
  echo -e "  ${BOLD}Cloudflare Origin:${NC} http://saraya_nginx:80"
fi
echo -e "  ${BOLD}Install Path:${NC}     ${INSTALL_DIR}"
echo -e "  ${BOLD}Machine ID:${NC}       ${CYAN}${MACHINE_ID}${NC}"
echo ""
echo -e "  ${YELLOW}NEXT STEP — Activate Full Production Enterprise License:${NC}"
echo -e "  1. On your admin workstation (with private signing key), run:"
echo -e "     ${BOLD}node admin-tools/issue-license.js${NC}"
echo -e "     - Paste Machine ID: ${CYAN}${MACHINE_ID}${NC}"
echo -e "     - Choose Plan: Enterprise (ACCOUNTS, HR, ASSETS, LAB, RADIOLOGY, PHARMACY, OBGYN, INSURANCE_INTEGRATION)"
echo -e "  2. Open ${BOLD}${ACCESS_URL}/activation${NC} and paste the signed license key"
echo -e "     (or copy saraya.lic to ${INSTALL_DIR}/data/license/saraya.lic and run: docker restart saraya_demo_backend)."
echo ""
echo -e "  ${BOLD}Verify Live HTTP/HTTPS API Smoke Test:${NC}"
echo -e "    node scripts/smoke-demo.cjs ${ACCESS_URL}"
echo ""
echo -e "  ${BOLD}Demo Accounts:${NC}"
echo -e "    Admin:  admin / admin123"
echo -e "    Staff:  dr_ahmed, dr_sara, nurse_laila, reception_user, pharm_ali,"
echo -e "            cashier_mo, acc_samir, lab_user, rad_user, hr_muna (pass: 123456)"
echo ""
echo -e "  ${BOLD}Reset Demo Data Anytime:${NC}"
echo -e "    sudo ${INSTALL_DIR}/scripts/reset-demo.sh"
echo ""
