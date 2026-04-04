<div align="center">

# 🛠️ دليل تثبيت نظام السرايا الطبي
### Saraya Medical ERP — Installation Guide
**Ubuntu Server 24.04 LTS**
**الإصدار 1.0 | أبريل 2026**

</div>

---

## 📑 فهرس المحتويات

1. [المتطلبات والتجهيزات](#1-المتطلبات-والتجهيزات)
2. [إعداد السيرفر](#2-إعداد-السيرفر)
3. [التثبيت التلقائي (الطريقة السريعة)](#3-التثبيت-التلقائي)
4. [التثبيت اليدوي (خطوة بخطوة)](#4-التثبيت-اليدوي)
5. [إعداد Cloudflare Tunnel](#5-إعداد-cloudflare-tunnel)
6. [إعداد شهادات SSL](#6-إعداد-شهادات-ssl)
7. [تفعيل الترخيص](#7-تفعيل-الترخيص)
8. [التحقق من التثبيت](#8-التحقق-من-التثبيت)
9. [إعداد النسخ الاحتياطي](#9-إعداد-النسخ-الاحتياطي)
10. [تحديث النظام](#10-تحديث-النظام)
11. [استكشاف الأخطاء وإصلاحها](#11-استكشاف-الأخطاء-وإصلاحها)
12. [البنية التحتية والخدمات](#12-البنية-التحتية-والخدمات)

---

## 1. المتطلبات والتجهيزات

### متطلبات السيرفر (الحد الأدنى)

| المكون | الحد الأدنى | الموصى به |
|--------|------------|-----------|
| **نظام التشغيل** | Ubuntu Server 22.04+ / Debian 11+ | Ubuntu Server 24.04 LTS |
| **المعالج (CPU)** | 2 أنوية | 4 أنوية |
| **الذاكرة (RAM)** | 4 GB | 8 GB |
| **القرص الصلب** | 50 GB SSD | 100 GB SSD |
| **الشبكة** | اتصال إنترنت مستقر | 10+ Mbps |

### متطلبات مسبقة

- صلاحيات `root` أو `sudo` على السيرفر.
- حساب GitHub مع **Personal Access Token (PAT)** لديه صلاحية `read:packages`.
- حساب Cloudflare (إذا كنت تريد الوصول عبر الإنترنت).
- ملف الترخيص `saraya.lic` (يُصدر من فريق السرايا).

### المنافذ المستخدمة

| المنفذ | الخدمة | ملاحظة |
|--------|--------|--------|
| 80 | Nginx (HTTP) | يُعاد التوجيه تلقائياً لـ HTTPS |
| 443 | Nginx (HTTPS) | الوصول الرئيسي للنظام |
| 3000 | Backend API | داخلي فقط (عبر Docker) |
| 3001 | Grafana (المراقبة) | اختياري |
| 9000 | Portainer (إدارة Docker) | اختياري |
| 9093 | Alertmanager | اختياري |

---

## 2. إعداد السيرفر

### 2.1 تثبيت Ubuntu Server 24.04

1. حمّل Ubuntu Server 24.04 LTS من [ubuntu.com/download/server](https://ubuntu.com/download/server).
2. ثبّت النظام على السيرفر مع اختيار **OpenSSH Server** أثناء التثبيت.
3. أعد تشغيل السيرفر بعد الانتهاء.

### 2.2 الاتصال بالسيرفر

```bash
ssh username@SERVER_IP
```

### 2.3 تحديث النظام

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

### 2.4 تعيين المنطقة الزمنية

```bash
sudo timedatectl set-timezone Africa/Tripoli
```

### 2.5 إعداد الجدار الناري (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 9000/tcp   # Portainer (اختياري)
sudo ufw allow 3001/tcp   # Grafana (اختياري)
sudo ufw enable
```

---

## 3. التثبيت التلقائي

> ⚡ **هذه أسرع طريقة** — سكربت واحد يقوم بكل شيء.

### الطريقة 1: التثبيت عن بُعد (من GitHub)

```bash
curl -fsSL https://raw.githubusercontent.com/aymanmj/SarayaERP/main/scripts/install.sh | sudo bash
```

### الطريقة 2: التثبيت من ملفات محلية (USB/مجلد مشترك)

```bash
# نسخ ملفات المشروع للسيرفر
scp -r ./SarayaERP username@SERVER_IP:/tmp/SarayaERP

# على السيرفر:
sudo bash /tmp/SarayaERP/scripts/install.sh
```

### مراحل السكربت التلقائي

السكربت يمر بـ **10 خطوات** تلقائياً:

```
Step 1:  التحقق من المتطلبات (OS, RAM, Disk)
Step 2:  جمع بيانات العميل (الاسم، النطاق، Tunnel Token)
Step 3:  تثبيت التبعيات (curl, git, jq, openssl)
Step 4:  تثبيت Docker
Step 5:  إعداد المجلدات وتنزيل الملفات
Step 6:  تسجيل الدخول لـ GHCR (GitHub Container Registry)
Step 7:  تولِيد ملف البيئة (.env.production) بكلمات مرور عشوائية
Step 8:  إعداد شهادات SSL
Step 9:  تشغيل النظام وحقن ملف الترخيص
Step 10: إعداد التشغيل التلقائي والنسخ الاحتياطي
```

**أثناء التنفيذ، سيُطلب منك إدخال:**

| المُدخَل | الوصف | مثال |
|---------|-------|------|
| Organization name | اسم المنشأة بالإنجليزية (بدون مسافات) | `rehab-hospital` |
| Domain name | النطاق الفرعي للعميل | `rehab.alsarayatech.ly` |
| Tunnel Token | رمز Cloudflare Tunnel الخاص بهذا العميل | يُنسخ من لوحة Cloudflare |
| Tailscale Auth Key | مفتاح Tailscale (اختياري) | `tskey-auth-...` |
| GitHub Username | اسم مستخدم GitHub | `aymanmj` |
| GitHub PAT | رمز الوصول الشخصي | `ghp_xxxx...` |
| License file path | مسار ملف الترخيص | `/tmp/saraya.lic` |

---

## 4. التثبيت اليدوي

> للمستخدمين المتقدمين الذين يريدون التحكم الكامل في كل خطوة.

### 4.1 تثبيت Docker

```bash
# تثبيت Docker
curl -fsSL https://get.docker.com | sudo sh

# تفعيل Docker عند الإقلاع
sudo systemctl enable docker
sudo systemctl start docker

# إضافة المستخدم الحالي لمجموعة Docker
sudo usermod -aG docker $USER
```

> ⚠️ سجّل خروج ثم دخول لتفعيل صلاحيات Docker.

### 4.2 تسجيل الدخول لـ GHCR

```bash
# تسجيل الدخول لسحب الصور الخاصة
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

> **للحصول على PAT:**
> 1. اذهب إلى [github.com/settings/tokens](https://github.com/settings/tokens)
> 2. اضغط **Generate new token (classic)**
> 3. فعّل صلاحية `read:packages`
> 4. انسخ الرمز

### 4.3 إعداد مجلد التثبيت

```bash
sudo mkdir -p /opt/saraya-erp/{backups,logs,certs,production/nginx,scripts,data/license,uploads,monitoring/grafana/provisioning/datasources,monitoring/grafana/provisioning/dashboards,monitoring/grafana/dashboards}
cd /opt/saraya-erp
```

### 4.4 تنزيل ملفات المشروع

```bash
BASE_URL="https://raw.githubusercontent.com/aymanmj/SarayaERP/main"

# الملفات الأساسية
sudo curl -fsSL "$BASE_URL/docker-compose.production.yml" -o docker-compose.production.yml
sudo curl -fsSL "$BASE_URL/.env.example" -o .env.example
sudo curl -fsSL "$BASE_URL/production/nginx/nginx.conf" -o production/nginx/nginx.conf

# السكربتات
for script in update.sh backup.sh health-check.sh auto-update.sh backup-worker.sh restore.sh; do
    sudo curl -fsSL "$BASE_URL/scripts/$script" -o "scripts/$script"
done
sudo chmod +x scripts/*.sh

# ملفات المراقبة
sudo curl -fsSL "$BASE_URL/monitoring/prometheus.yml" -o monitoring/prometheus.yml
sudo curl -fsSL "$BASE_URL/monitoring/alert_rules.yml" -o monitoring/alert_rules.yml
sudo curl -fsSL "$BASE_URL/monitoring/alertmanager.yml" -o monitoring/alertmanager.yml
sudo curl -fsSL "$BASE_URL/monitoring/grafana/provisioning/datasources/prometheus.yml" \
    -o monitoring/grafana/provisioning/datasources/prometheus.yml
sudo curl -fsSL "$BASE_URL/monitoring/grafana/provisioning/dashboards/dashboard.yml" \
    -o monitoring/grafana/provisioning/dashboards/dashboard.yml
```

### 4.5 إنشاء ملف البيئة (.env.production)

```bash
# توليد كلمات مرور عشوائية
PG_PASS=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
JWT=$(openssl rand -hex 32)
REDIS_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
ENC_KEY=$(openssl rand -base64 32)
WT_TOKEN=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
```

```bash
sudo tee /opt/saraya-erp/.env.production > /dev/null << EOF
# ════════════════════════════════════════════════
# Saraya ERP - Production Environment
# ════════════════════════════════════════════════

# Database
POSTGRES_USER=admin
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=saraya_erp
DATABASE_URL=postgresql://admin:$PG_PASS@postgres:5432/saraya_erp?schema=public

# Security
JWT_SECRET=$JWT
JWT_EXPIRES_IN=86400

# Encryption (AES-256 — لا تُغيّر هذا أبداً بعد التثبيت!)
ENCRYPTION_KEY=$ENC_KEY
ENCRYPTION_SALT=saraya-CLIENT_NAME-salt-$(openssl rand -hex 4)

# CORS
CORS_ORIGINS=https://CLIENT_DOMAIN

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASS

# Application
NODE_ENV=production
PORT=3000
SERVER_PORT=3000

# License
LICENSE_PATH=/app/data/license/saraya.lic

# Cloudflare Tunnel
TUNNEL_TOKEN=YOUR_TUNNEL_TOKEN_HERE

# Tailscale (اختياري)
TAILSCALE_AUTHKEY=
TAILSCALE_HOSTNAME=saraya-CLIENT_NAME

# GHCR
GITHUB_REPOSITORY_OWNER=aymanmj
IMAGE_TAG=latest

# Watchtower
WATCHTOWER_TOKEN=$WT_TOKEN

# Monitoring
GRAFANA_PASSWORD=admin123

# Backup
BACKUP_SCHEDULE="0 2,14 * * *"
BACKUP_RETENTION_DAYS=30
EOF
```

> ⚠️ **تنبيه حرج:** استبدل `CLIENT_NAME`, `CLIENT_DOMAIN`, `YOUR_TUNNEL_TOKEN_HERE` بالقيم الفعلية.

> 🔴 **تحذير:** قيمة `ENCRYPTION_KEY` يجب ألا تُغيَّر أبداً بعد بدء تخزين بيانات المرضى. أي تغيير سيجعل البيانات المشفرة غير قابلة للاسترجاع!

### 4.6 ضبط الصلاحيات

```bash
# صلاحيات مجلدات البيانات (UID 1000 = مستخدم node داخل الحاوية)
sudo chown -R 1000:1000 /opt/saraya-erp/data/license
sudo chown -R 1000:1000 /opt/saraya-erp/uploads
sudo chown -R 1000:1000 /opt/saraya-erp/backups
sudo chmod 775 /opt/saraya-erp/data/license
sudo chmod 775 /opt/saraya-erp/uploads
sudo chmod 775 /opt/saraya-erp/backups
```

### 4.7 سحب الصور وتشغيل النظام

```bash
cd /opt/saraya-erp

# سحب الصور
sudo docker compose -f docker-compose.production.yml --env-file .env.production pull

# تشغيل الخدمات الأساسية أولاً
sudo docker compose -f docker-compose.production.yml --env-file .env.production up -d postgres redis
echo "⏳ انتظر 15 ثانية لبدء قاعدة البيانات..."
sleep 15

# تشغيل الـ Backend
sudo docker compose -f docker-compose.production.yml --env-file .env.production up -d backend
echo "⏳ انتظر 30 ثانية لبدء الخادم..."
sleep 30

# تشغيل الواجهة والشبكة
sudo docker compose -f docker-compose.production.yml --env-file .env.production up -d frontend nginx

# تشغيل الخدمات الإضافية
sudo docker compose -f docker-compose.production.yml --env-file .env.production up -d tunnel portainer watchtower
```

### 4.8 إنشاء خدمة systemd (تشغيل تلقائي)

```bash
sudo tee /etc/systemd/system/saraya-erp.service > /dev/null << 'EOF'
[Unit]
Description=Saraya ERP System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/saraya-erp
ExecStart=/usr/bin/docker compose -f docker-compose.production.yml --env-file .env.production up -d
ExecStop=/usr/bin/docker compose -f docker-compose.production.yml --env-file .env.production down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable saraya-erp.service
```

---

## 5. إعداد Cloudflare Tunnel

> هذا يسمح بالوصول للنظام عبر الإنترنت بدون فتح منافذ في الراوتر.

### 5.1 إنشاء Tunnel في Cloudflare (لكل عميل)

1. سجّل الدخول في [one.dash.cloudflare.com](https://one.dash.cloudflare.com).
2. اذهب إلى **Zero Trust** → **Networks** → **Tunnels**.
3. اضغط **Create a tunnel**.
4. سمّه: `saraya-CLIENTNAME` (مثال: `saraya-rehab`).
5. في صفحة **Install connector**:
   - انسخ قيمة **TUNNEL_TOKEN** من أمر التثبيت المعروض.
6. في تبويب **Public Hostname**:
   - اضغط **Add a public hostname**.
   - **Subdomain**: `rehab` (اسم العميل).
   - **Domain**: `alsarayatech.ly`.
   - **Service**: `http://nginx:80`.
7. اضغط **Save**.

### 5.2 إضافة Token في ملف البيئة

```bash
sudo nano /opt/saraya-erp/.env.production
```

عدّل السطر:
```
TUNNEL_TOKEN=eyJhIjoiNTAx....YOUR_TOKEN_HERE
```

ثم أعد تشغيل الـ Tunnel:
```bash
cd /opt/saraya-erp
sudo docker compose -f docker-compose.production.yml --env-file .env.production up -d tunnel
```

### 5.3 هيكل النطاقات للعملاء المتعددين

```
┌─────────────────────────────────────────────────────────────┐
│                    alsarayatech.ly (Cloudflare)              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  rehab.alsarayatech.ly  ──→  Tunnel A ──→  سيرفر الرحاب     │
│  nokhba.alsarayatech.ly ──→  Tunnel B ──→  سيرفر النخبة     │
│  salam.alsarayatech.ly  ──→  Tunnel C ──→  سيرفر السلام     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

> ⚠️ **مهم:** كل عميل يحتاج **Tunnel خاص به** بـ **Token فريد** و **Subdomain مستقل**.

---

## 6. إعداد شهادات SSL

### الخيار 1: شهادات Cloudflare Origin (الموصى به)

إذا كنت تستخدم Cloudflare Tunnel:
1. في لوحة Cloudflare → **SSL/TLS** → **Origin Server**.
2. اضغط **Create Certificate**.
3. احفظ الشهادة والمفتاح.
4. انسخها للسيرفر:

```bash
sudo nano /opt/saraya-erp/certs/fullchain.pem   # الشهادة
sudo nano /opt/saraya-erp/certs/privkey.pem      # المفتاح
sudo chmod 600 /opt/saraya-erp/certs/privkey.pem
sudo chmod 644 /opt/saraya-erp/certs/fullchain.pem
```

### الخيار 2: شهادة ذاتية التوقيع (للشبكة الداخلية)

```bash
sudo openssl req -x509 -nodes -days 3650 \
    -newkey rsa:2048 \
    -keyout /opt/saraya-erp/certs/privkey.pem \
    -out /opt/saraya-erp/certs/fullchain.pem \
    -subj "/CN=rehab.alsarayatech.ly/O=Saraya ERP/C=LY"
```

> ⚠️ الشهادة الذاتية ستُظهر تحذيراً في المتصفح — مقبولة فقط للاستخدام الداخلي.

### الخيار 3: Let's Encrypt (مجاني)

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d rehab.alsarayatech.ly
sudo cp /etc/letsencrypt/live/rehab.alsarayatech.ly/fullchain.pem /opt/saraya-erp/certs/
sudo cp /etc/letsencrypt/live/rehab.alsarayatech.ly/privkey.pem /opt/saraya-erp/certs/
```

بعد تعديل الشهادات، أعد تشغيل Nginx:
```bash
sudo docker restart saraya_nginx
```

---

## 7. تفعيل الترخيص

### 7.1 إصدار ملف الترخيص (من جهاز المطور)

```bash
cd admin-tools
node issue-license.js
```

سيُطلب منك:
1. **كود الجهاز (Machine ID)** — يمكنك الحصول عليه من شاشة "حول النظام" في واجهة النظام.
2. **اسم المنشأة** بالعربي.
3. **مدة الاشتراك** (تجريبي/شهري/سنوي/مخصص).
4. **عدد المستخدمين**.
5. **الباقة** (أساسي/احترافي/مؤسسة).
6. **الوحدات المطلوب تفعيلها** (LAB, RADIOLOGY, PHARMACY, HR, ASSETS, ACCOUNTS, CDSS).

### 7.2 تفعيل الترخيص على السيرفر

**الطريقة 1: أثناء التثبيت**
- السكربت التلقائي يسأل عن مسار ملف الترخيص ويحقنه تلقائياً.

**الطريقة 2: بعد التثبيت (من واجهة النظام)**
- ادخل النظام ← صفحة **"حول النظام"** ← الصق رمز التفعيل (Token).

**الطريقة 3: يدوياً من الحاوية**
```bash
# نسخ ملف الترخيص لداخل الحاوية
docker cp saraya.lic saraya_backend:/app/data/license/saraya.lic

# إعادة تشغيل الـ Backend لتطبيق الترخيص
docker restart saraya_backend
```

---

## 8. التحقق من التثبيت

### 8.1 فحص حالة الخدمات

```bash
cd /opt/saraya-erp
docker compose -f docker-compose.production.yml ps
```

**النتيجة المتوقعة:** جميع الخدمات في حالة `Up (healthy)`:

```
NAME                    STATUS              PORTS
saraya_db               Up (healthy)
saraya_redis            Up (healthy)
saraya_backend          Up (healthy)        3000/tcp
saraya_frontend         Up                  80/tcp
saraya_nginx            Up (healthy)        0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
saraya_tunnel           Up
saraya_watchtower       Up
saraya_portainer        Up                  0.0.0.0:9000->9000/tcp
```

### 8.2 فحص صحة الـ Backend

```bash
curl -s http://localhost:3000/api/health | jq .
```

**النتيجة المتوقعة:**
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected"
}
```

### 8.3 فحص السجلات (Logs)

```bash
# سجلات الـ Backend
docker logs saraya_backend --tail 50

# سجلات Nginx
docker logs saraya_nginx --tail 20

# سجلات قاعدة البيانات
docker logs saraya_db --tail 20
```

### 8.4 فحص الاتصال بالنظام

- **محلياً:** افتح `https://SERVER_IP` في المتصفح.
- **عبر Tunnel:** افتح `https://rehab.alsarayatech.ly` في المتصفح.
- **بيانات الدخول الافتراضية:**
  - المستخدم: `admin`
  - كلمة المرور: (يتم تعيينها عند إنشاء قاعدة البيانات الأولى / Seed)

---

## 9. إعداد النسخ الاحتياطي

### يتم تلقائياً!
سكربت التثبيت يُنشئ مهام Cron تلقائية:

| المهمة | التوقيت | الملف |
|--------|---------|-------|
| النسخ الاحتياطي | يومياً الساعة 2:00 صباحاً | `/etc/cron.d/saraya-backup` |
| التحديث التلقائي | يومياً الساعة 3:00 صباحاً | `/etc/cron.d/saraya-update` |

### النسخ الاحتياطي اليدوي

```bash
cd /opt/saraya-erp
sudo ./scripts/backup.sh
```

النسخ تُحفظ في: `/opt/saraya-erp/backups/`

### استعادة من نسخة احتياطية

```bash
cd /opt/saraya-erp
sudo ./scripts/restore.sh /opt/saraya-erp/backups/saraya_backup_20260404_020000.sql.gz
```

### سياسة الاحتفاظ
- يتم حذف النسخ الأقدم من **30 يوماً** تلقائياً.
- يمكنك تغيير ذلك عبر `BACKUP_RETENTION_DAYS` في `.env.production`.

---

## 10. تحديث النظام

### التحديث التلقائي (Watchtower)
- **Watchtower** يفحص كل ساعة إذا كانت هناك صور Docker جديدة في GHCR.
- إذا وُجدت، يسحبها ويُعيد تشغيل الخدمة تلقائياً.

### التحديث اليدوي

```bash
cd /opt/saraya-erp
sudo ./scripts/update.sh
```

يقدم لك قائمة:
```
1) عرض حالة النظام
2) تحديث فوري (Watchtower)
3) سحب أحدث الصور
4) إعادة تشغيل الخدمات
5) التراجع لإصدار سابق
6) عرض سجلات التحديث
```

### التحديث الفوري

```bash
cd /opt/saraya-erp

# سحب الصور الجديدة
docker compose -f docker-compose.production.yml --env-file .env.production pull

# إعادة التشغيل
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

### التراجع لإصدار سابق (Rollback)

```bash
cd /opt/saraya-erp
sudo ./scripts/update.sh rollback
```

---

## 11. استكشاف الأخطاء وإصلاحها

### ❌ الـ Backend لا يبدأ

```bash
# فحص السجلات
docker logs saraya_backend --tail 100

# الأسباب الشائعة:
# 1. قاعدة البيانات لم تبدأ بعد → انتظر وأعد المحاولة
# 2. خطأ في DATABASE_URL → تحقق من .env.production
# 3. مشكلة في الترحيل (Migration) → شغّل يدوياً
docker exec saraya_backend npx prisma migrate deploy
```

### ❌ خطأ EACCES عند الترخيص

```bash
# إصلاح صلاحيات مجلد الترخيص
sudo chown -R 1000:1000 /opt/saraya-erp/data/license
sudo chmod 775 /opt/saraya-erp/data/license
docker restart saraya_backend
```

### ❌ الموقع لا يفتح عبر الإنترنت

```bash
# التحقق من Tunnel
docker logs saraya_tunnel --tail 20

# الأسباب الشائعة:
# 1. TUNNEL_TOKEN خاطئ → تحقق من .env.production
# 2. Hostname غير مُعد في Cloudflare → أضفه في Public Hostname
# 3. الـ Tunnel غير مشغّل:
docker compose -f docker-compose.production.yml --env-file .env.production up -d tunnel
```

### ❌ خطأ SSL/شهادة غير صالحة

```bash
# التحقق من الشهادات
ls -la /opt/saraya-erp/certs/
openssl x509 -in /opt/saraya-erp/certs/fullchain.pem -text -noout | head -20

# إذا كانت منتهية الصلاحية، أعد إصدارها (انظر القسم 6)
```

### ❌ قاعدة البيانات ممتلئة

```bash
# فحص حجم القرص
df -h

# فحص حجم قاعدة البيانات
docker exec saraya_db psql -U admin -d saraya_erp -c "SELECT pg_size_pretty(pg_database_size('saraya_erp'));"

# تنظيف النسخ الاحتياطية القديمة
find /opt/saraya-erp/backups/ -name "*.gz" -mtime +7 -delete
```

### ❌ إعادة تشغيل كاملة للنظام

```bash
cd /opt/saraya-erp

# إيقاف جميع الخدمات
docker compose -f docker-compose.production.yml --env-file .env.production down

# إعادة التشغيل
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

---

## 12. البنية التحتية والخدمات

### مخطط البنية التحتية

```
┌────────────────────────────────────────────────────────────────┐
│                         Ubuntu Server                           │
│                                                                  │
│  ┌──────────────────── Docker Network ──────────────────────┐   │
│  │                                                            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                │   │
│  │  │ Postgres │  │  Redis   │  │ Backend  │                │   │
│  │  │ (DB)     │  │ (Cache)  │  │ (NestJS) │                │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘                │   │
│  │       │              │              │                      │   │
│  │       └──────────────┼──────────────┘                      │   │
│  │                      │                                     │   │
│  │              ┌───────┴───────┐                             │   │
│  │              │    Nginx      │ :80 / :443                  │   │
│  │              │ (Reverse Proxy)│                             │   │
│  │              └───────┬───────┘                             │   │
│  │                      │                                     │   │
│  │              ┌───────┴───────┐                             │   │
│  │              │   Frontend   │                              │   │
│  │              │   (Vite/React)│                              │   │
│  │              └──────────────┘                              │   │
│  │                                                            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐               │   │
│  │  │ CF Tunnel│  │Tailscale │  │Watchtower │               │   │
│  │  │(Internet)│  │  (VPN)   │  │(Auto-Update)│              │   │
│  │  └──────────┘  └──────────┘  └───────────┘               │   │
│  │                                                            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │   │
│  │  │Prometheus│  │ Grafana  │  │Portainer │               │   │
│  │  │(Metrics) │  │(Dashboard)│  │(Docker UI)│               │   │
│  │  └──────────┘  └──────────┘  └──────────┘               │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│  📁 /opt/saraya-erp/                                             │
│  ├── .env.production         (ملف البيئة)                        │
│  ├── docker-compose.production.yml                               │
│  ├── certs/                  (شهادات SSL)                        │
│  ├── data/license/           (ملف الترخيص)                       │
│  ├── uploads/                (المرفقات)                          │
│  ├── backups/                (النسخ الاحتياطية)                   │
│  ├── scripts/                (سكربتات الإدارة)                   │
│  └── monitoring/             (إعدادات المراقبة)                   │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

### الأوامر المرجعية السريعة

```bash
# ─── الحالة ───
docker compose -f docker-compose.production.yml ps          # حالة الخدمات
docker logs saraya_backend --tail 50                         # سجلات الخادم
docker stats                                                  # استهلاك الموارد

# ─── التشغيل/الإيقاف ───
sudo systemctl start saraya-erp                              # تشغيل
sudo systemctl stop saraya-erp                               # إيقاف
sudo systemctl restart saraya-erp                            # إعادة تشغيل

# ─── النسخ الاحتياطي ───
./scripts/backup.sh                                           # نسخ يدوي
./scripts/restore.sh /path/to/backup.sql.gz                  # استعادة

# ─── التحديث ───
./scripts/update.sh                                           # قائمة التحديث
./scripts/update.sh pull                                      # سحب الصور فقط
./scripts/update.sh status                                    # عرض الحالة

# ─── قاعدة البيانات ───
docker exec -it saraya_db psql -U admin -d saraya_erp        # دخول PostgreSQL
docker exec saraya_backend npx prisma migrate deploy          # ترحيل قاعدة البيانات
```

---

<div align="center">

**📞 فريق الدعم الفني — شركة السرايا للتقنية**

`support@alsarayatech.ly`

---

*© 2026 Saraya Technology — جميع الحقوق محفوظة*

</div>
