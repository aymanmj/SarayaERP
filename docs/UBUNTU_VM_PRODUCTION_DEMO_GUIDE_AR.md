# دليل نشر وتشغيل الديمو الإنتاجي الكامل على سيرفر Ubuntu Server VM

> آخر تحديث: **2026-11-27** | يغطي حزمة [docker-compose.demo.yml](file:///d:/SarayaERP/docker-compose.demo.yml) وسكربت [install-demo.sh](file:///d:/SarayaERP/scripts/install-demo.sh) للعمل في وضع `NODE_ENV=production` الحقيقي مع قاعدة PostgreSQL وRedis والترخيص المؤسسي الموقّع وNginx.

---

## 1. مواصفات وتجهيز السيرفر (Ubuntu Server 24.04 LTS VM)

* **نظام التشغيل:** `Ubuntu Server 24.04 LTS` (64-bit) — فعّل `OpenSSH Server` أثناء التثبيت.
* **المواصفات المقترحة:**
  * المعالج: `4 vCPU` (الحد الأدنى `2 vCPU`)
  * الذاكرة: `6–8 GB RAM` (تصلح `4 GB RAM` للتشغيل بعد جاهزية الصور، لكن `8 GB` مُوصى بها للبناء المحلي داخل الـ VM)
  * القرص: `40 GB SSD`
  * الشبكة: `Bridged Adapter` (أو `NAT` مع فتح المنافذ `22` و`80` و`443` عند التجربة محلياً)

### تجهيز Ubuntu بعد الإقلاع الأول:

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone Africa/Tripoli
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

---

## 2. تنبيه أمني حاسم قبل الرفع أو النقل إلى GitHub / VM

> [!CAUTION]
> **لا تقم أبداً برفع أو نسخ `admin-tools/private.key` إلى GitHub أو إلى سيرفر الـ VM أو العميل.**
> المفتاح الخاص لإصدار التراخيص يبقى على جهاز الإدارة الخاص بك فقط، وتصدر منه التراخيص باستخدام `node admin-tools/issue-license.js` بناءً على `Machine ID` الخاص بالـ VM.
>
> كذلك لا تلتقط ملفات مؤقتة أو ملفات `admin-tools/activation.json` تجريبية غير مطلوبة عند إنشاء `git commit`.

---

## 3. اختيار مسار النشر (حسب جاهزيتك الآن)

### المسار أ (المُوصى به لمشاركة رابط HTTPS احترافي مع العميل): نشر عبر GHCR + Cloudflare Tunnel

1. **من جهاز التطوير (Windows):** راجع التغييرات وارفع الكود النظيف إلى فرع `main` لتنفيذ خط أنابيب [deploy.yml](file:///d:/SarayaERP/.github/workflows/deploy.yml) وبناء صور `saraya-backend` و`saraya-frontend` على `ghcr.io`.
2. **في لوحة Cloudflare Zero Trust:**
   * أنشئ نفقاً (`Tunnel`) جديداً واحصل على `TUNNEL_TOKEN`.
   * أضف `Public Hostname` (مثل `demo.alsarayatech.ly`) موجّهاً إلى Origin URL:
     ```text
     http://saraya_nginx:80
     ```
3. **داخل Ubuntu Server VM:**
   ```bash
   git clone <REPO_URL> ~/SarayaERP
   cd ~/SarayaERP
   sudo bash scripts/install-demo.sh
   ```
   * اختر الخيار الافتراضي `[1]` (سحب من GHCR) ثم الخيار الافتراضي `[1]` (Cloudflare Tunnel HTTPS).

---

### المسار ب (تشغيل فوري على الـ VM من الكود الحالي دون انتظار GHCR): بناء محلي داخل الـ VM

إذا أردت تجربة النسخة الحالية فوراً على الـ VM قبل الرفع إلى GitHub أو بدون اتصال بـ GHCR:

1. انقل المستودع أو استنسخه داخل الـ VM (بدون `node_modules` وبدون `admin-tools/private.key`).
2. شغّل المثبّت بخيار البناء المحلي:
   * **مع Cloudflare Tunnel HTTPS:**
     ```bash
     sudo bash scripts/install-demo.sh --local-build
     ```
   * **أو على شبكة المختبر/المكتب المحلية بدون Cloudflare (HTTP على IP الـ VM):**
     ```bash
     sudo bash scripts/install-demo.sh --local-build --lan-http
     ```

> عند اختيار `--lan-http` يضبط السكربت تلقائياً `COOKIE_SECURE=false` و`CORS_ORIGINS=http://<VM_IP>,http://localhost,http://127.0.0.1` ولا يشغّل حاوية `tunnel`، بينما يعمل كامل المكدس (`postgres`, `redis`, `backend`, `frontend`, `nginx`) في `NODE_ENV=production`.

---

## 4. تفعيل الترخيص الإنتاجي (Enterprise License)

عند انتهاء خطوة `[7/7]` في [install-demo.sh](file:///d:/SarayaERP/scripts/install-demo.sh) سيظهر لك في الطرفية رقم **`Machine ID`** الخاص بالـ VM:

1. على جهاز الإدارة الخاص بك (المحتوي على `admin-tools/private.key`):
   ```bash
   node admin-tools/issue-license.js
   ```
   * أدخل `Machine ID` الظاهر على الـ VM.
   * اختر خطة **Enterprise** وشغّل جميع الوحدات:
     `ACCOUNTS, HR, ASSETS, LAB, RADIOLOGY, PHARMACY, OBGYN, INSURANCE_INTEGRATION`
2. افتح صفحة التفعيل عبر المتصفح:
   * `https://demo.<your-domain>/activation` (أو `http://<VM_IP>/activation`)
   * الصق مفتاح الترخيص الموقّع — أو انسخ الملف يدوياً إلى `/opt/saraya-demo/data/license/saraya.lic` ثم نفّذ:
     ```bash
     docker restart saraya_demo_backend
     ```

---

## 5. التحقق الحي والتصفير قبل عرض العميل

### 1) فحص الدخان الإنتاجي من الخارج (`HTTP` أو `HTTPS`)
بعد التثبيت وتفعيل الترخيص، نفّذ [smoke-demo.cjs](file:///d:/SarayaERP/scripts/smoke-demo.cjs) (يختبر الواجهة، `/api/health/ready`، الترخيص، حجم الكوكيز، `CsrfOriginGuard`، مسارات النساء والولادة والخصوبة، تبديل الفروع، وتسجيل الدخول لجميع الأدوار):

```bash
node scripts/smoke-demo.cjs https://demo.<your-domain>
# أو في وضع LAN HTTP:
node scripts/smoke-demo.cjs http://<VM_IP>
```

### 2) تصفير وإعادة تهيئة بيانات الديمو قبل اجتماع العميل
يحذف السكربت [reset-demo.sh](file:///d:/SarayaERP/scripts/reset-demo.sh) قاعدة البيانات ويعيد تشغيل الـ migrations + `seed.js` + `seed-demo.js` (بما فيها رفع وربط دراسات PACS/OHIF الثلاثة تلقائياً) مع **الحفاظ على الترخيص و`Machine ID`**:

```bash
sudo /opt/saraya-demo/scripts/reset-demo.sh
```

### 3) ترقية سيرفر VM قائم لإدراج قسم الأشعة (Orthanc PACS + OHIF) دون تصفير البيانات
إذا كان الديمو شغّالاً بالفعل على الـ VM وتريد تفعيل حاوية `orthanc` والدراسات الطبية التجريبية (`DX / CT 24-slice / MRI 16-slice`) مباشرةً:

```bash
cd ~/SarayaERP && git pull
sudo cp docker-compose.demo.yml /opt/saraya-demo/docker-compose.demo.yml
cd /opt/saraya-demo
grep -q '^PACS_USER=' .env.demo || echo 'PACS_USER=saraya_pacs' | sudo tee -a .env.demo
grep -q '^PACS_PASSWORD=' .env.demo || echo "PACS_PASSWORD=$(openssl rand -hex 20)" | sudo tee -a .env.demo
grep -q '^RADIOLOGY_OHIF_ENABLED=' .env.demo || printf 'RADIOLOGY_OHIF_ENABLED=true\nRADIOLOGY_ORTHANC_URL=http://orthanc:8042\n' | sudo tee -a .env.demo
sudo docker compose -f docker-compose.demo.yml --env-file .env.demo pull
sudo docker compose -f docker-compose.demo.yml --env-file .env.demo up -d
```

> عند إقلاع `backend` مع الصورتين الجديدتين من `main` (Commit ما بعد الدفعة 43)، سيرفع `seed-demo.js` تلقائياً الـ 41 صورة DICOM إلى Orthanc ويربطها بطلبات الأشعة القائمة (`ACC-DEMO-2026-001/002/003`) دون مسح أي بيانات أخرى.

### 3) حسابات العرض المجهزة مسبقاً
* **المدير العام:** `admin` / `admin123`
* **الأطباء والتمريض والخدمات:** `dr_ahmed`, `dr_sara`, `nurse_laila`, `reception_user`, `pharm_ali`, `cashier_mo`, `acc_samir`, `lab_user`, `rad_user`, `hr_muna` (كلمة المرور للجميع: `123456`)
* **سيناريو العرض المقترح للعميل:** راجع [CLIENT_DEMO_WALKTHROUGH_AR.md](file:///d:/SarayaERP/docs/CLIENT_DEMO_WALKTHROUGH_AR.md).
