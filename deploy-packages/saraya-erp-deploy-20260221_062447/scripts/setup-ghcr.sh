#!/bin/bash
# ============================================
# Saraya ERP - GHCR Setup Script
# إعداد الوصول لـ GitHub Container Registry
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════╗"
    echo "║   Saraya ERP - GHCR Setup              ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_header

echo -e "${YELLOW}هذا السكربت سيقوم بإعداد الوصول لـ GitHub Container Registry${NC}"
echo ""

# Check if already logged in
if docker pull ghcr.io/aymanmj/saraya-backend:latest 2>/dev/null; then
    print_status "أنت مسجل دخول بالفعل لـ GHCR!"
    exit 0
fi

echo "ستحتاج إلى GitHub Personal Access Token (PAT) مع صلاحية read:packages"
echo ""
echo "للحصول على Token:"
echo "  1. اذهب إلى: https://github.com/settings/tokens"
echo "  2. اضغط 'Generate new token (classic)'"
echo "  3. اختر صلاحية 'read:packages'"
echo "  4. انسخ الـ Token"
echo ""

read -p "أدخل GitHub Username: " GITHUB_USER
read -sp "أدخل GitHub PAT: " GITHUB_PAT
echo ""

if [ -z "$GITHUB_USER" ] || [ -z "$GITHUB_PAT" ]; then
    print_error "يجب إدخال Username و PAT"
    exit 1
fi

# Login to GHCR
print_status "جاري تسجيل الدخول لـ GHCR..."
echo "$GITHUB_PAT" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin

if [ $? -eq 0 ]; then
    print_status "تم تسجيل الدخول بنجاح!"
    
    # Copy config.json to root for Watchtower
    if [ -f ~/.docker/config.json ]; then
        print_status "جاري نسخ config.json لـ Watchtower..."
        sudo mkdir -p /root/.docker
        sudo cp ~/.docker/config.json /root/.docker/config.json
        sudo chmod 600 /root/.docker/config.json
        print_status "تم إعداد Watchtower للوصول لـ GHCR!"
    fi
    
    # Test pulling images
    echo ""
    print_status "جاري اختبار سحب الصور..."
    
    if docker pull ghcr.io/aymanmj/saraya-backend:latest; then
        print_status "تم سحب saraya-backend بنجاح!"
    else
        print_warning "لا يمكن سحب saraya-backend - تأكد من أن الصورة موجودة"
    fi
    
    if docker pull ghcr.io/aymanmj/saraya-frontend:latest; then
        print_status "تم سحب saraya-frontend بنجاح!"
    else
        print_warning "لا يمكن سحب saraya-frontend - تأكد من أن الصورة موجودة"
    fi
    
    echo ""
    print_status "تم الإعداد بنجاح! يمكنك الآن تشغيل النظام."
    echo ""
    echo "لتشغيل النظام:"
    echo "  docker-compose -f docker-compose.production.yml --env-file .env.production up -d"
    
else
    print_error "فشل تسجيل الدخول - تحقق من Username و PAT"
    exit 1
fi
