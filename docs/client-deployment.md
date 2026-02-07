# دليل نشر Saraya ERP على أجهزة العملاء

## نظرة عامة

يتم نشر النظام على أجهزة العملاء باستخدام Docker Compose مع التحديث التلقائي عبر Watchtower وإمكانية الوصول عن بُعد عبر Tailscale.

## المتطلبات

| المتطلب | الحد الأدنى | الموصى به |
|---------|-------------|-----------|
| RAM | 4 GB | 8 GB |
| CPU | 2 cores | 4 cores |
| Storage | 50 GB | 100 GB SSD |
| OS | Ubuntu 20.04+ / Debian 11+ | Ubuntu 22.04 LTS |

## خطوات الإعداد

### 1. تثبيت Docker

```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Docker
curl -fsSL https://get.docker.com | sh

# إضافة المستخدم لمجموعة docker
sudo usermod -aG docker $USER

# تثبيت Docker Compose
sudo apt install docker-compose-plugin -y

# إعادة تسجيل الدخول
newgrp docker
```

### 2. تحميل ملفات المشروع

```bash
# إنشاء مجلد المشروع
mkdir -p /opt/saraya-erp && cd /opt/saraya-erp

# نسخ الملفات من الـ repository أو USB
# يجب نسخ:
# - docker-compose.production.yml
# - .env.production
# - production/nginx/nginx.conf
# - saraya.lic (ملف الرخصة)
# - scripts/
```

### 3. إعداد GHCR

```bash
# تشغيل سكربت الإعداد
chmod +x scripts/setup-ghcr.sh
./scripts/setup-ghcr.sh
```

> **ملاحظة:** ستحتاج GitHub PAT مع صلاحية `read:packages`

### 4. تشغيل النظام

```bash
# تشغيل جميع الخدمات
docker compose -f docker-compose.production.yml --env-file .env.production up -d

# التحقق من حالة الخدمات
docker compose -f docker-compose.production.yml ps
```

### 5. الوصول للنظام

| الخدمة | الرابط |
|--------|--------|
| التطبيق | http://localhost |
| Portainer | http://localhost:9000 |
| Grafana | http://localhost:3001 |

---

## الوصول عن بُعد (Tailscale)

### على جهاز العميل:

بعد تشغيل النظام، سيتصل Tailscale تلقائياً بالشبكة.

### من لوحة تحكم Tailscale:

1. افتح [Tailscale Admin Console](https://login.tailscale.com/admin/machines)
2. ستجد الجهاز باسم `saraya-server`
3. يمكنك الآن الوصول عبر: `http://saraya-server:9000` (Portainer)

---

## التحديث

### التحديث التلقائي

Watchtower يفحص GHCR كل ساعة ويحدث تلقائياً عند توفر إصدار جديد.

### التحديث اليدوي

```bash
# تشغيل قائمة التحديث
./scripts/update.sh

# أو تحديث فوري مباشر
./scripts/update.sh update

# أو سحب الصور وإعادة التشغيل
./scripts/update.sh pull
./scripts/update.sh restart
```

### التحديث عن بُعد

```bash
# عبر Tailscale SSH
ssh user@saraya-server
cd /opt/saraya-erp
./scripts/update.sh update

# أو عبر Watchtower API
curl -H "Authorization: Bearer saraya-update-token-2026" \
     http://saraya-server:8080/v1/update
```

---

## استكشاف الأخطاء

### الخدمة لا تعمل

```bash
# عرض السجلات
docker logs saraya_backend
docker logs saraya_frontend

# إعادة التشغيل
docker compose -f docker-compose.production.yml restart backend frontend
```

### مشكلة في التحديث

```bash
# عرض سجلات Watchtower
docker logs saraya_watchtower

# سحب الصور يدوياً
./scripts/update.sh pull
```

### Tailscale لا يتصل

```bash
# عرض حالة Tailscale
docker logs saraya_tailscale

# التحقق من AUTHKEY
grep TAILSCALE_AUTHKEY .env.production
```

---

## النسخ الاحتياطي

النسخ الاحتياطي يعمل تلقائياً الساعة 2 صباحاً و 2 ظهراً.

```bash
# نسخة احتياطية يدوية
docker exec saraya_backup /backup.sh

# عرض النسخ المتاحة
ls -la ./backups/
```
