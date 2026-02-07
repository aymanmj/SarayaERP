#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║            Saraya ERP - Deployment Package Creator                         ║
# ║               إنشاء حزمة النشر لتوزيعها على العملاء                         ║
# ╚════════════════════════════════════════════════════════════════════════════╝
#
# هذا السكربت ينشئ ملف ZIP يحتوي على كل ما تحتاجه لتثبيت النظام عند العميل
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/deploy-packages"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="saraya-erp-deploy-$TIMESTAMP"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           Saraya ERP - Deployment Package Creator              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Create output directory
mkdir -p "$OUTPUT_DIR/$PACKAGE_NAME"

echo -e "${YELLOW}جاري إنشاء حزمة النشر...${NC}"
echo ""

# Copy required files
echo -e "  نسخ docker-compose.production.yml..."
cp "$PROJECT_DIR/docker-compose.production.yml" "$OUTPUT_DIR/$PACKAGE_NAME/"

echo -e "  نسخ .env.example..."
cp "$PROJECT_DIR/.env.example" "$OUTPUT_DIR/$PACKAGE_NAME/"

echo -e "  نسخ مجلد scripts..."
mkdir -p "$OUTPUT_DIR/$PACKAGE_NAME/scripts"
cp "$PROJECT_DIR/scripts/"*.sh "$OUTPUT_DIR/$PACKAGE_NAME/scripts/"
chmod +x "$OUTPUT_DIR/$PACKAGE_NAME/scripts/"*.sh

echo -e "  نسخ مجلد production..."
mkdir -p "$OUTPUT_DIR/$PACKAGE_NAME/production/nginx"
if [ -f "$PROJECT_DIR/production/nginx/nginx.conf" ]; then
    cp "$PROJECT_DIR/production/nginx/nginx.conf" "$OUTPUT_DIR/$PACKAGE_NAME/production/nginx/"
fi

echo -e "  نسخ التوثيق..."
mkdir -p "$OUTPUT_DIR/$PACKAGE_NAME/docs"
if [ -d "$PROJECT_DIR/docs" ]; then
    cp -r "$PROJECT_DIR/docs/"* "$OUTPUT_DIR/$PACKAGE_NAME/docs/" 2>/dev/null || true
fi

# Create quick-install script for the package
cat > "$OUTPUT_DIR/$PACKAGE_NAME/INSTALL.sh" << 'EOF'
#!/bin/bash
# Quick Installer - يشغل سكربت التثبيت الكامل
echo "Starting Saraya ERP Installation..."
sudo bash scripts/install.sh
EOF
chmod +x "$OUTPUT_DIR/$PACKAGE_NAME/INSTALL.sh"

# Create README
cat > "$OUTPUT_DIR/$PACKAGE_NAME/README.md" << 'EOF'
# Saraya ERP - Deployment Package

## التثبيت السريع

```bash
# 1. انقل هذا المجلد للسيرفر
# 2. شغّل سكربت التثبيت:
sudo ./INSTALL.sh
```

## المتطلبات

- Ubuntu Server 20.04+ أو Debian 11+
- RAM: 4 GB (موصى 8 GB)
- Disk: 50 GB متاح
- اتصال إنترنت

## الملفات

| الملف | الوصف |
|-------|-------|
| `INSTALL.sh` | سكربت التثبيت السريع |
| `scripts/install.sh` | السكربت الكامل للتثبيت |
| `scripts/update.sh` | سكربت التحديث |
| `docker-compose.production.yml` | إعدادات Docker |

## بعد التثبيت

سيُعرض رابط الوصول للنظام. يمكن الوصول من أي جهاز على الشبكة المحلية.
EOF

# Create zip file
echo ""
echo -e "  ${YELLOW}إنشاء ملف ZIP...${NC}"
cd "$OUTPUT_DIR"
zip -r "$PACKAGE_NAME.zip" "$PACKAGE_NAME" > /dev/null

# Cleanup
rm -rf "$OUTPUT_DIR/$PACKAGE_NAME"

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ تم إنشاء حزمة النشر بنجاح!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  📦 الحزمة: ${BLUE}$OUTPUT_DIR/$PACKAGE_NAME.zip${NC}"
echo ""
echo -e "  ${YELLOW}للاستخدام:${NC}"
echo "  1. انقل الملف للسيرفر الهدف (USB أو SCP)"
echo "  2. فك الضغط: unzip $PACKAGE_NAME.zip"
echo "  3. شغّل: sudo ./INSTALL.sh"
echo ""
