#!/bin/bash
# ============================================
# Saraya ERP - Publish Images to GHCR
# ============================================

set -e

# Configuration
GITHUB_USER=${GITHUB_REPOSITORY_OWNER:-aymanmj}
IMAGE_TAG="latest"
TIMESTAMP=$(date +%Y%m%d-%H%M)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Starting Build & Publish Process...${NC}"
echo -e "User: ${GITHUB_USER}"
echo -e "Tag: ${TIMESTAMP}"

# 1. Build & Push Backend
echo -e "\n${YELLOW}📦 Building Backend...${NC}"
docker build -t ghcr.io/$GITHUB_USER/saraya-backend:$IMAGE_TAG ./server
docker tag ghcr.io/$GITHUB_USER/saraya-backend:$IMAGE_TAG ghcr.io/$GITHUB_USER/saraya-backend:$TIMESTAMP

echo -e "${YELLOW}⬆️ Pushing Backend...${NC}"
docker push ghcr.io/$GITHUB_USER/saraya-backend:$IMAGE_TAG
docker push ghcr.io/$GITHUB_USER/saraya-backend:$TIMESTAMP

# 2. Build & Push Frontend
echo -e "\n${YELLOW}📦 Building Frontend...${NC}"
# Need to ensure VITE_API_URL is set correctly for production build if baked in?
# Usually frontend env vars are baked in at build time.
# But for Docker, we often use runtime config or relative paths.
# Saraya uses relative paths (proxy or nginx), so generic build is fine.
docker build -t ghcr.io/$GITHUB_USER/saraya-frontend:$IMAGE_TAG ./client
docker tag ghcr.io/$GITHUB_USER/saraya-frontend:$IMAGE_TAG ghcr.io/$GITHUB_USER/saraya-frontend:$TIMESTAMP

echo -e "${YELLOW}⬆️ Pushing Frontend...${NC}"
docker push ghcr.io/$GITHUB_USER/saraya-frontend:$IMAGE_TAG
docker push ghcr.io/$GITHUB_USER/saraya-frontend:$TIMESTAMP

echo -e "\n${GREEN}✅ Success! Images published to GHCR.${NC}"
echo -e "Backend: ghcr.io/$GITHUB_USER/saraya-backend:$TIMESTAMP"
echo -e "Frontend: ghcr.io/$GITHUB_USER/saraya-frontend:$TIMESTAMP"
echo -e "\n${YELLOW}To update client servers, run:${NC}"
echo -e "docker-compose -f docker-compose.production.yml pull && docker-compose -f docker-compose.production.yml up -d"
