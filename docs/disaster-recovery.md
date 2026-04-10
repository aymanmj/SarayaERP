# 🚨 دليل الطوارئ — استعادة نظام السرايا الطبي من الصفر

## Saraya ERP — Disaster Recovery Guide

---

> **آخر تحديث:** أبريل 2026  
> **الوقت المتوقع للاستعادة:** 15-30 دقيقة  
> **المتطلبات:** سيرفر جديد (Ubuntu 24.04 LTS) + قرص خارجي يحتوي النسخة الاحتياطية

---

## 📋 المتطلبات الأساسية

| المتطلب | المواصفات الدنيا |
|---------|----------------|
| نظام التشغيل | Ubuntu Server 24.04 LTS |
| المعالج | 2 cores+ |
| الذاكرة | 4 GB+ |
| القرص | 40 GB+ |
| الاتصال | إنترنت (لتحميل Docker images) |
| النسخة الاحتياطية | ملف `saraya_backup_*.sql.gz` على قرص خارجي |

---

## 🔄 خطوات الاستعادة الكاملة

### الخطوة 1: تثبيت Ubuntu Server 24.04 LTS

- ثبّت Ubuntu Server بالإعدادات الافتراضية
- تأكد من وجود اتصال بالإنترنت
- سجّل دخول بالمستخدم الذي أنشأته

### الخطوة 2: تثبيت نظام السرايا

```bash
# تحميل المشروع
cd /opt
sudo git clone https://github.com/aymanmj/SarayaERP.git saraya-erp
cd saraya-erp

# تشغيل سكريبت التثبيت (يثبت Docker + يُعد البيئة)
sudo bash install.sh
```

### الخطوة 3: إعداد ملف البيئة (.env)

```bash
sudo nano /opt/saraya-erp/.env
```

أضف المتغيرات التالية (استخدم نفس القيم من السيرفر القديم إن أمكن):

```env
# قاعدة البيانات
POSTGRES_DB=saraya_erp
POSTGRES_USER=admin
POSTGRES_PASSWORD=كلمة_سر_قوية_هنا

# التطبيق
JWT_SECRET=مفتاح_سري_طويل_وعشوائي
NODE_ENV=production
PORT=3000

# النسخ الاحتياطي
BACKUP_PATH=./backups
BACKUP_RETENTION_DAYS=30
```

### الخطوة 4: تشغيل النظام (بدون بيانات)

```bash
cd /opt/saraya-erp
docker compose -f docker-compose.production.yml up -d
```

انتظر حتى يظهر `healthy` لجميع الحاويات:

```bash
docker compose -f docker-compose.production.yml ps
```

> ⚠️ **مهم:** انتظر حتى تعمل حاوية `postgres` بشكل كامل (status: healthy)

### الخطوة 5: توصيل القرص الخارجي

```bash
# تركيب القرص
sudo mkdir -p /mnt/SARAYA_BKP
sudo mount /dev/sdb1 /mnt/SARAYA_BKP

# إذا لم يُركب، جرّب:
sudo mount -o umask=000 /dev/sdb1 /mnt/SARAYA_BKP

# تأكد أن النسخة موجودة
ls -lh /mnt/SARAYA_BKP/saraya_backup_*
```

> **ملاحظة:** إذا كان القرص يظهر باسم مختلف (sdc, sdd)، استخدم `lsblk` لمعرفة الاسم الصحيح.

### الخطوة 6: نسخ ملف النسخة الاحتياطية

```bash
# انسخ آخر نسخة (أو النسخة المطلوبة)
cp /mnt/SARAYA_BKP/saraya_backup_*.sql.gz /opt/saraya-erp/backups/

# تأكد
ls -lh /opt/saraya-erp/backups/
```

### الخطوة 7: استعادة قاعدة البيانات

#### الطريقة أ: من سطر الأوامر (الأسرع)

```bash
# حدد آخر نسخة تلقائياً
BACKUP_FILE=$(ls -t /opt/saraya-erp/backups/saraya_backup_*.sql.gz | head -1)
BACKUP_NAME=$(basename "$BACKUP_FILE")
echo "📦 سيتم استعادة: $BACKUP_NAME"

# نفّذ الاستعادة
docker exec -i saraya_backup sh -c \
  "PGPASSWORD=\$POSTGRES_PASSWORD gunzip -c /backups/$BACKUP_NAME | pg_restore \
  -h postgres -U \$POSTGRES_USER -d \$POSTGRES_DB -c --if-exists -v"
```

#### الطريقة ب: من الواجهة

1. افتح المتصفح → `http://عنوان_السيرفر`
2. سجّل دخول بحساب المدير
3. اذهب إلى **الإعدادات → النسخ الاحتياطي والاستعادة**
4. ستجد النسخة في الجدول
5. اضغط زر **الاستعادة** (🔄)
6. اكتب `RESTORE` للتأكيد

### الخطوة 8: تحديث قاعدة البيانات

```bash
# تطبيق أي migrations جديدة
docker exec saraya_backend npx prisma migrate deploy

# إعادة تعبئة البيانات الأساسية
docker exec saraya_backend npx prisma db seed
```

### الخطوة 9: إعادة تشغيل النظام

```bash
cd /opt/saraya-erp
docker compose -f docker-compose.production.yml restart
```

---

## ✅ التحقق من نجاح الاستعادة

```bash
# 1. جميع الحاويات تعمل
docker compose -f docker-compose.production.yml ps

# 2. قاعدة البيانات تستجيب
docker exec saraya_backend npx prisma db pull --print 2>/dev/null && echo "✅ DB OK"

# 3. الواجهة تعمل
curl -s http://localhost | head -5 && echo "✅ Frontend OK"
```

---

## 🔧 إعدادات ما بعد الاستعادة

### 1. إعداد Auto-Mount للأقراص الخارجية

```bash
# سكريبت المراقبة
sudo nano /usr/local/bin/saraya-usb-monitor.sh
# (انسخ محتوى السكريبت من الملف الأصلي)

sudo chmod +x /usr/local/bin/saraya-usb-monitor.sh

# خدمة systemd
sudo nano /etc/systemd/system/saraya-usb-monitor.service

# المحتوى:
# [Unit]
# Description=Saraya ERP USB Auto-Mount Monitor
# After=multi-user.target
#
# [Service]
# Type=simple
# ExecStart=/usr/local/bin/saraya-usb-monitor.sh
# Restart=always
# RestartSec=5
#
# [Install]
# WantedBy=multi-user.target

sudo systemctl daemon-reload
sudo systemctl enable saraya-usb-monitor
sudo systemctl start saraya-usb-monitor
```

### 2. إعداد Cloudflare Tunnel (إذا كان مستخدماً)

```bash
# أضف التوكن في ملف .env
echo "CLOUDFLARE_TUNNEL_TOKEN=التوكن_هنا" >> /opt/saraya-erp/.env

# أعد تشغيل
docker compose -f docker-compose.production.yml restart tunnel
```

### 3. إعداد النسخ التلقائي

- من الواجهة → الإعدادات → النسخ الاحتياطي
- اختر المسار الأساسي
- فعّل النسخ المزدوج واختر القرص الخارجي كمسار ثانوي
- اضغط حفظ

---

## ❗ استكشاف الأخطاء

### مشكلة: "Permission denied" عند تركيب القرص

```bash
sudo mount -o umask=000,uid=1000,gid=1000 /dev/sdb1 /mnt/SARAYA_BKP
```

### مشكلة: الحاوية لا تعمل

```bash
# فحص السجلات
docker logs saraya_backend --tail 50
docker logs saraya_backup --tail 50

# إعادة بناء
docker compose -f docker-compose.production.yml up -d --build
```

### مشكلة: خطأ في الاستعادة "database does not exist"

```bash
# أنشئ قاعدة البيانات يدوياً
docker exec saraya_postgres psql -U admin -c "CREATE DATABASE saraya_erp;"

# ثم أعد محاولة الاستعادة
```

### مشكلة: القرص لا يظهر بعد التوصيل

```bash
# اعرض الأقراص
lsblk

# إذا لم يظهر في VMware:
# VM → Removable Devices → USB Device → Connect
```

---

## 📞 معلومات الدعم

| البيان | القيمة |
|--------|--------|
| اسم النظام | Saraya Medical ERP |
| إصدار Docker | 24.x+ |
| قاعدة البيانات | PostgreSQL 16 |
| مجلد التثبيت | `/opt/saraya-erp` |
| مجلد النسخ | `/opt/saraya-erp/backups` أو القرص الخارجي |
| صيغة النسخة | `.sql.gz` (PostgreSQL custom + gzip) |

---

## 📊 مخطط سير العملية

```
    السيرفر تعطّل ❌
         │
         ▼
   سيرفر جديد + Ubuntu 24.04
         │
         ▼
   تثبيت Saraya (install.sh)
         │
         ▼
   docker compose up -d
         │
         ▼
   توصيل القرص الخارجي 🔌
         │
         ▼
   نسخ الملف → /backups/
         │
         ▼
   استعادة قاعدة البيانات 🔄
         │
         ▼
   prisma migrate + seed
         │
         ▼
   restart → النظام يعمل! ✅
         │
         ▼
   ⏱️ إجمالي: 15-30 دقيقة
```
