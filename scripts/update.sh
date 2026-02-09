#!/bin/bash
# ============================================
# Saraya ERP - Manual Update Script
# يقوم بتحديث النظام بشكل يدوي وفوري
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
source .env.production 2>/dev/null || true
WATCHTOWER_HTTP_API_TOKEN="${WATCHTOWER_HTTP_API_TOKEN:-saraya-update-token}"
WATCHTOWER_HOST="${WATCHTOWER_HOST:-localhost}"
WATCHTOWER_PORT="${WATCHTOWER_PORT:-8080}"

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════╗"
    echo "║     Saraya ERP - Update Manager        ║"
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

# Show current container status
show_status() {
    echo -e "\n${BLUE}=== حالة الـ Containers ===${NC}"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" | grep saraya || echo "لا توجد containers تعمل"
}

# Trigger immediate update via Watchtower HTTP API
trigger_update() {
    echo -e "\n${BLUE}=== تشغيل التحديث الفوري ===${NC}"
    
    print_status "جاري الاتصال بـ Watchtower..."
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${WATCHTOWER_HTTP_API_TOKEN}" \
        "http://${WATCHTOWER_HOST}:${WATCHTOWER_PORT}/v1/update" 2>/dev/null || echo "000")
    
    if [ "$RESPONSE" = "200" ]; then
        print_status "تم تشغيل التحديث بنجاح!"
        echo -e "${YELLOW}انتظر بضع دقائق لاكتمال التحديث...${NC}"
    elif [ "$RESPONSE" = "401" ]; then
        print_error "خطأ في المصادقة - تحقق من WATCHTOWER_HTTP_API_TOKEN"
    elif [ "$RESPONSE" = "000" ]; then
        print_error "لا يمكن الاتصال بـ Watchtower - تأكد من أنه يعمل"
        echo "جاري المحاولة عبر docker exec..."
        docker exec saraya_watchtower /watchtower --run-once 2>/dev/null && \
            print_status "تم تشغيل التحديث عبر docker exec" || \
            print_error "فشل التحديث"
    else
        print_error "خطأ غير متوقع: HTTP $RESPONSE"
    fi
}

# Pull latest images manually
pull_images() {
    echo -e "\n${BLUE}=== سحب أحدث الصور ===${NC}"
    
    source .env.production 2>/dev/null || true
    OWNER="${GITHUB_REPOSITORY_OWNER:-aymanmj}"
    TAG="${IMAGE_TAG:-latest}"
    
    print_status "جاري سحب saraya-backend..."
    docker pull "ghcr.io/${OWNER}/saraya-backend:${TAG}"
    
    print_status "جاري سحب saraya-frontend..."
    docker pull "ghcr.io/${OWNER}/saraya-frontend:${TAG}"
    
    print_status "تم سحب جميع الصور بنجاح!"
}

# Restart services with new images
restart_services() {
    echo -e "\n${BLUE}=== إعادة تشغيل الخدمات ===${NC}"
    
    print_warning "سيتم إعادة تشغيل الـ backend و frontend..."
    read -p "هل تريد المتابعة؟ (y/n): " confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        docker compose -f docker-compose.production.yml --env-file .env.production up -d backend frontend
        print_status "تم إعادة تشغيل الخدمات بنجاح!"
    else
        print_warning "تم الإلغاء"
    fi
}

# Rollback to previous image
rollback() {
    echo -e "\n${BLUE}=== التراجع للإصدار السابق ===${NC}"
    
    print_warning "هذا سيعيد النظام للصور السابقة..."
    
    # Show available images
    echo -e "\n${YELLOW}الصور المتاحة للـ backend:${NC}"
    docker images "ghcr.io/*/saraya-backend" --format "{{.Tag}}\t{{.CreatedAt}}" | head -5
    
    echo -e "\n${YELLOW}الصور المتاحة للـ frontend:${NC}"
    docker images "ghcr.io/*/saraya-frontend" --format "{{.Tag}}\t{{.CreatedAt}}" | head -5
    
    read -p "أدخل الـ TAG للتراجع إليه (أو اضغط Enter للإلغاء): " rollback_tag
    
    if [ -n "$rollback_tag" ]; then
        export IMAGE_TAG="$rollback_tag"
        docker compose -f docker-compose.production.yml --env-file .env.production up -d backend frontend
        print_status "تم التراجع للإصدار: $rollback_tag"
    else
        print_warning "تم الإلغاء"
    fi
}

# View Watchtower logs
view_logs() {
    echo -e "\n${BLUE}=== سجلات Watchtower ===${NC}"
    docker logs saraya_watchtower --tail 50
}

# Main menu
main_menu() {
    print_header
    
    echo "اختر العملية:"
    echo "  1) عرض حالة النظام"
    echo "  2) تحديث فوري (Watchtower)"
    echo "  3) سحب أحدث الصور"
    echo "  4) إعادة تشغيل الخدمات"
    echo "  5) التراجع لإصدار سابق"
    echo "  6) عرض سجلات التحديث"
    echo "  0) خروج"
    echo ""
    read -p "اختيارك: " choice
    
    case $choice in
        1) show_status ;;
        2) trigger_update ;;
        3) pull_images ;;
        4) restart_services ;;
        5) rollback ;;
        6) view_logs ;;
        0) exit 0 ;;
        *) print_error "اختيار غير صحيح" ;;
    esac
    
    echo ""
    read -p "اضغط Enter للمتابعة..."
    main_menu
}

# Handle command line arguments
case "${1:-menu}" in
    update)
        trigger_update
        ;;
    pull)
        pull_images
        ;;
    restart)
        restart_services
        ;;
    rollback)
        rollback
        ;;
    status)
        show_status
        ;;
    logs)
        view_logs
        ;;
    menu|*)
        main_menu
        ;;
esac
