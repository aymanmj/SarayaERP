# تقرير المرحلة السادسة — الدفعة 32: التشفير الساكن للمرفقات (`AES-256-GCM` / `SEC05`)، التسوية التلقائية لمستلزمات الأمانة (`CAP10`)، ومستندات تراخيص الكادر المؤمّنة (`CAP12`)

**التاريخ:** 2026-11-25  
**النطاق:** تنفيذ ثلاث إغلاقات أمنية وتشغيلية متكاملة دون الحاجة لأي ترحيل قاعدة بيانات إضافي (على الترحيل المعتمد `#82`):
1. **`SEC05`:** تشفير المرفقات وقت السكون بـ `AES-256-GCM` (`SRYENC1\0`) لمرفقات الموافقات المسبقة (`PreAuth`) مع التحقق من بصمة `SHA-256` والتوافق العكسي للملفات القديمة.
2. **`CAP10`:** الترقية التلقائية لحالة استهلاك مستلزمات الأمانة من `BILLED` إلى `SETTLED` ذرياً عند السداد الكامل لفاتورة المورد المرتبطة بها.
3. **`CAP12`:** تمكين رفع وتنزيل الوثائق الممسوحة لتراخيص الكادر والشهادات الصحية مع فحص الفيروسات الإلزامي (`ClamAV zINSTREAM` / `EICAR`) والتشفير الساكن `AES-256-GCM` والتدقيق المتسلسل وواجهة المستخدم.

---

## 1. تفاصيل التنفيذ

1. **محرك التشفير الساكن للمرفقات [attachment-crypto.util.ts](file:///d:/SarayaERP/server/src/common/security/attachment-crypto.util.ts):**
   - تغليف ثنائي موحّد `SRYENC1\0` بطول ترويسة `36` بايت: `[8B Magic "SRYENC1\0"] [12B GCM IV عشوائي] [16B GCM AuthTag] [النص المشفّر]` مع ربط الترويسة كـ `AAD`.
   - اشتقاق مفتاح معزول المجال (`scryptSync(ENCRYPTION_KEY, "${ENCRYPTION_SALT}:attachments-v1", 32)`).
   - **Fail-Closed عند القراءة (`decryptAttachmentBuffer`):** يرفض أي عبث أو تعديل في البايتات أو مفتاح خاطئ بـ **`ConflictException`**، مع الحفاظ على التوافق العكسي للملفات القديمة غير المغلّفة بـ `SRYENC1\0`.
   - الدمج الكامل في [preauth-attachments.ts](file:///d:/SarayaERP/server/src/insurance/preauth-attachments.ts) (تشفير قبل الكتابة للقرص + فك التشفير قبل فحص `sizeBytes` و `sha256` + توثيق `encryptedAtRest: true, cipher: 'AES-256-GCM'` في `AuditLog`).

2. **التسوية التلقائية لمستلزمات الأمانة (`CAP10`) في [purchases.service.ts](file:///d:/SarayaERP/server/src/purchases/purchases.service.ts):**
   - داخل معاملة `recordSupplierPayment` عند انتقال فاتورة المورد إلى الحالة النهائية `PAID`:
     - ترقية كافة سجلات `ConsignmentConsumption` المرتبطة بهذه الفاتورة من `BILLED` إلى **`SETTLED`** تلقائياً وذرياً (متوافق مع محفّز `guard_consignment_consumption_immutable()`).
     - تسجيل سجل تدقيق متسلسل `CONSIGNMENT_CONSUMPTIONS_AUTO_SETTLED` وبثه لـ `SIEM` بعد التثبيت، وعدم الترقية عند السداد الجزئي (`PARTIALLY_PAID`).

3. **الوثائق الممسوحة المؤمّنة لتراخيص الكادر (`CAP12`):**
   - الخادم ([staff-credentialing.service.ts](file:///d:/SarayaERP/server/src/hr/staff-credentialing.service.ts) و [staff-credentialing.controller.ts](file:///d:/SarayaERP/server/src/hr/staff-credentialing.controller.ts)):
     - مسار `POST /hr/credentials/:id/document` (بصلاحية `hr:credentials:manage` / `hr:manage` + `@AuditInTransaction()`): فحص النوع وبصمة المحتوى (`PDF/JPEG/PNG` حتى `10 MB`) ← فحص الفيروسات عبر `scanAttachmentBuffer` (حجب المصاب بـ `422` وتسجيل `SECURITY_MALWARE_BLOCKED` دون لمس القرص) ← تشفير `AES-256-GCM` ← حفظ مرجع `enc-v1:<sha256>:<storageKey>` في `StaffCredential.documentRef` (مع منع التعديل على الوثائق `REVOKED`).
     - مسار `GET /hr/credentials/:id/document` (بصلاحية `hr:credentials:view` / `hr:view`): التحقق من احتواء المسار (`realpathSync`) وفك التشفير والتحقق من مطابقة `SHA-256` مع تسجيل تدقيق `STAFF_CREDENTIAL_DOCUMENT_DOWNLOADED`.
   - الواجهة ([StaffCredentialsModal.tsx](file:///d:/SarayaERP/client/src/components/hr/StaffCredentialsModal.tsx)): إضافة زر **«📎 إرفاق وثيقة»** وزر **«🔒 تنزيل الوثيقة»** وتغطيتها في [StaffCredentialsModal.test.tsx](file:///d:/SarayaERP/client/src/components/hr/StaffCredentialsModal.test.tsx).

---

## 2. أدلة التحقق (المنفّذ مقابل المؤجّل)

- **اختبارات الوحدة للخادم (`Jest --runInBand`):** **`114/114`** مجموعة = **`844/844`** اختباراً ناجحاً (`0` متخطى، `45.495 s`)، شاملةً:
  - [attachment-crypto.util.spec.ts](file:///d:/SarayaERP/server/src/common/security/attachment-crypto.util.spec.ts) (`5/5` اختبارات تشمل كشف العبث والمفتاح الخاطئ والتوافق العكسي).
  - [consignment-auto-settle.spec.ts](file:///d:/SarayaERP/server/src/purchases/consignment-auto-settle.spec.ts) (`2/2` اختبارات السداد الجزئي مقابل السداد الكامل).
  - [staff-credentialing.service.spec.ts](file:///d:/SarayaERP/server/src/hr/staff-credentialing.service.spec.ts) (اختبار حجب `EICAR` والتشفير الساكن ورفض العبث عند التنزيل).
- **اختبارات الواجهة وبناء الإنتاج (`Vitest` & `Vite`):** **`59/59`** ملفاً = **`287/287`** اختباراً ناجحاً (`tsc -b` + `vite build` بنجاح، `PWA precache 246 entries`).
- **الفحوص الساكنة:**
  - `server lint:ci`: **`0` أخطاء جديدة** (`3750` خطأً تاريخياً، `591` تحذيراً عبر `723` ملفاً).
  - `server tsc --noEmit` و `nest build`: **`0` أخطاء**.
  - `check-i18n`: متوازن (`7406` مفتاح ويب + `40` موبايل).
  - `verify-tenant-isolation` و `audit:check`: تغطية ABAC وعزل **`113/113`** (**`101/101`** فعّال = `100%`).
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1`):**
  - مؤجلة لحين تشغيل **Docker Desktop** على الجهاز (متوقفة حالياً: `npipe:////./pipe/dockerDesktopLinuxEngine` غير متاح).
