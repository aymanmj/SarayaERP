# مرفقات الموافقات المسبقة (`UI07`) بعزل المنشآت والتحقق من السلامة والتدقيق — 2026-11-23

**المسار والمجال:** [`UI07`](REMEDIATION_REGISTER_2026-11-07_AR.md#L162) و[`SEC05`](REMEDIATION_REGISTER_2026-11-07_AR.md#L147) و[`FLOW03`](REMEDIATION_REGISTER_2026-11-07_AR.md#L154) — مسار التأمينات الوطنية الليبية وفق [خطة البوابة الوطنية الليبية للتأمين الصحي والمقاصة](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md)  
**الترحيل المعتمد:** `#62` — [`20261123090000_preauth_attachments`](../server/prisma/migrations/20261123090000_preauth_attachments/migration.sql)

---

## 1. نموذج البيانات وعقد التخزين والترحيل `#62`

1. **جدول `PreAuthorizationAttachment` ([`schema.prisma`](../server/prisma/schema.prisma)):**
   - يربط كل مرفق بـ `hospitalId` (`Hospital`)، و`preAuthId` (`PreAuthorization` بقيد `ON DELETE RESTRICT`)، و`uploadedById` / `retiredById` (`User`)، مع حفظ `category`، و`title`، و`originalFileName`، و`contentType`، و`sizeBytes`، و`sha256`، و`storageKey` الفريد، وبيانات السحب التوثيقي (`retiredAt`، `retiredById`، `retireReason`).
   - **قيود الترحيل `#62` (`CHECK`):**
     - `PreAuthorizationAttachment_category_check`: التصنيفات المعتمدة فقط (`MEDICAL_REPORT`، `LAB_RESULT`، `IMAGING`، `PRESCRIPTION`، `REFERRAL`، `ID_DOCUMENT`، `OTHER`).
     - `PreAuthorizationAttachment_contentType_check`: الأنواع المعتمدة فقط (`application/pdf`، `image/jpeg`، `image/png`).
     - `PreAuthorizationAttachment_sizeBytes_check`: الحجم `> 0` وحتى `10485760` بايت (`10 MB`).
     - `PreAuthorizationAttachment_sha256_check` و`PreAuthorizationAttachment_storageKey_check`: تطابق `^[0-9a-f]{64}$` ومنع تسلسل `..`.
     - `PreAuthorizationAttachment_retirement_check`: سحب متكامل (`retiredAt` و`retiredById` و`retireReason` بطول لا يقل عن 5 أحرف معًا أو جميعها `NULL`).
   - **فهارس ومحفزات PostgreSQL:**
     - فهرس جزئي فريد `PreAuthorizationAttachment_active_sha256` على (`preAuthId`, `sha256`) `WHERE "retiredAt" IS NULL` لمنع تكرار نفس الملف النشط مع السماح بإعادة رفعه بعد سحبه.
     - مشغل `preauth_attachment_guard` (`guard_preauth_attachment()`): يمنع الحذف الفعلي (`DELETE`) قطعًا، ويمنع الإدراج أو السحب إذا لم يكن طلب `PreAuthorization` بحالة `PENDING` ضمن نفس المنشأة، ويحظر تعديل البيانات الوصفية أو البصمة أو تعديل أي مرفق سبق سحبه.

2. **عقد التخزين على القرص والبيئة:**
   - المتغير البيئي: `INSURANCE_ATTACHMENT_ROOT` (يُقرأ وقت التنفيذ عبر `ConfigService` أو `process.env` في `resolveAttachmentRoot`) وبافتراضي `uploads/insurance` نسبةً إلى مجلد التشغيل، بما يتوافق مع ربط الإنتاج `./uploads:/app/uploads` في [`docker-compose.production.yml`](../docker-compose.production.yml).
   - نمط المفتاح (`storageKey`): `${hospitalId}/preauth/${preAuthId}/${uuid}.${ext}` حيث يُحدّد الامتداد حصريًا من بصمة المحتوى الفعلية.
   - أُضيفت `uploads/` و`server/uploads/` إلى [`.gitignore`](../.gitignore) لمنع التزام ملفات المرضى والتأمين في المستودع.

---

## 2. ضوابط الأمان والتحقق من السلامة والواجهة

1. **خدمة المرفقات ([`preauth-attachments.ts`](../server/src/insurance/preauth-attachments.ts) عبر [`InsuranceService`](../server/src/insurance/insurance.service.ts)):**
   - **بصمة المحتوى (`detectContentType`):** فحص بايتات الترويسة (`%PDF-`، `89 50 4E 47 0D 0A 1A 0A`، `FF D8 FF`) ومطابقتها صراحةً مع `mimetype` المعلن (وإلا `400`)، وتحديد الحد الأقصى `10 MB` (`413`) والحد الأقصى `20` مرفقًا نشطًا للطلب (`409`).
   - **تعقيم الاسم والكتابة الذرية (`sanitizeFileName`):** عزل المسارات والأحرف التحكمية و`..` وتحديد 200 حرف (أو `attachment.${ext}`)، والكتابة أولًا إلى ملف `.tmp` بالراية `wx` ثم النقل الذري، مع التنظيف التلقائي لأي ملف غير مقيد إذا رفضت معاملة PostgreSQL الطلب.
   - **الاحتواء وسلامة الاسترجاع (`readPreAuthAttachment`):** فحص احتواء المسار عبر `fs.realpathSync` للجذر والملف، وفحص `stat.isFile()`، وإعادة احتساب الحجم و`sha256` عند كل تنزيل مع إرجاع `409 Conflict` عند أي عبث أو تلف، مع إتاحة تنزيل المرفقات المسحوبة لحفظ الدليل المراجعي.
   - **السحب اللطيف (`retirePreAuthAttachment`):** يتطلب سببًا (`5–1000` حرفًا) وحالة `PENDING` مقفولة بـ `FOR UPDATE`، ويحتفظ بالملف على القرص لأغراض المراجعة.
   - **التدقيق المتسلسل:** تسجيل أحداث `UPLOAD_PREAUTH_ATTACHMENT` و`DOWNLOAD_PREAUTH_ATTACHMENT` و`RETIRE_PREAUTH_ATTACHMENT` عبر `appendChainedAuditInTransaction`.

2. **واجهة HTTP ([`InsuranceController`](../server/src/insurance/insurance.controller.ts)):**
   - `GET /insurance/pre-auth/:id/attachments` (`insurance:view` / `insurance:manage`).
   - `POST /insurance/pre-auth/:id/attachments` (`insurance:manage` عبر `FileInterceptor` وحدود الذاكرة `10 MB`).
   - `GET /insurance/pre-auth/:id/attachments/:attachmentId/download` (`StreamableFile` مع `Content-Disposition: attachment; filename*=UTF-8''...` و`X-Content-Type-Options: nosniff` و`Cache-Control: no-store`).
   - `POST /insurance/pre-auth/:id/attachments/:attachmentId/retire` (`insurance:manage`).

3. **واجهة المستخدم والترجمات:**
   - إنشاء [`PreAuthAttachmentsDialog.tsx`](../client/src/pages/PreAuthAttachmentsDialog.tsx) لعرض المرفقات والرفع (`FormData` عند `PENDING`) والتنزيل (`blob`) والسحب مع سبب موثق، ودمجها في [`PreAuthPage.tsx`](../client/src/pages/PreAuthPage.tsx) بزر `"المرفقات"` المتاح لجميع حالات الطلب مع ترجمات `preAuth.attachments.*` في [`ar.json`](../client/src/locales/ar.json) و[`en.json`](../client/src/locales/en.json).

---

## 3. أدلة التحقق المنفذة بعد آخر تعديل برمجي

- **مواءمة المخطط (`#62`):** طُبّق الترحيل `#62` على PostgreSQL المعزول (`127.0.0.1:15432`)، واجتاز `npx prisma migrate diff --exit-code` بنتيجة `No difference detected.` (`drift = 0`).
- **تغطية الأمان (`ABAC` / `Tenant`):** `node generate-audit-report.cjs --check` بنسبة `Total: 100 | ABAC: 100 (100%) | Tenant: 100 (100%) | Effective (non-exempt): 88/88 (100%)`.
- **الخادم (`D:\SarayaERP\server`):**
  - `npm run typecheck`: نجاح (`0`).
  - `npm run build`: نجاح (`0`).
  - `npm run lint:ci`: دون أخطاء جديدة (`617` ملفًا، `4387` خطأً تاريخيًا، `579` تحذيرًا).
  - `npm test -- --runInBand`: اجتياز **`88/88` مجموعة و`758/758` اختبار وحدة** (`0` متخطى، `0` فاشل، `38.456 s`).
- **العميل (`D:\SarayaERP\client`):**
  - `npx vitest run`: اجتياز **`43/43` ملفًا و`254/254` اختبارًا** (`0` متخطى)، منها **`13/13`** في [`PreAuthPage.test.tsx`](../client/src/pages/PreAuthPage.test.tsx).
  - `npm run lint`: **`0` أخطاء و`88` تحذيرًا تاريخيًا**.
  - `npm run build`: نجاح (`11.84s`).
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1`):**
  - **[`insurance-claims-rcm-integrity.e2e-spec.ts`](../server/test/e2e/insurance-claims-rcm-integrity.e2e-spec.ts):** اجتياز **`8/8`** اختبارات (`23.548 s`) تغطي بصمة `PDF/PNG` وتجاوز الحجم `413` وتعقيم المسار وتكرار `sha256` والعزل بين المنشآت (`404`) وكشف العبث على القرص (`409`) والسحب وإعادة الرفع وقفل الحسم ومنع الحذف والتعديل عبر PostgreSQL والتدقيق المتسلسل.
  - **الانحدار الشامل المعزول (`scratch/phase3-batch5-20261123/full-e2e.log`):** اجتياز **`32` من أصل `37` مجموعة (`554` من أصل `559` اختبارًا ناجحًا، `0` فاشل)** خلال `688.891 s`، مع تخطّي `5` مجموعات مشروطة بأعلام البيئة (`nursing-load` و4 مجموعات أشعة `CAP13`).

---

## 4. المتبقي المفتوح ونقطة الاستئناف التالية

1. **فحص الفيروسات والبرمجيات الضارة (`ClamAV` / Anti-Malware):** ربط مسح فعلي للمرفقات المرفوعة قبل اعتماد الإطلاق الإنتاجي.
2. **التشفير وقت السكون وسياسة النسخ الاحتياطي والاحتفاظ:** تشفير مجلد التخزين الإنتاجي (`/app/uploads`) وربط سياسة نسخ احتياطي ومدة احتفاظ قانونية طبية بمستندات التأمين.
3. **بوابة الجهات الضامنة (`Payer Portal`) وإتاحة مراجعة المرفقات + السقوف عبر `MPI`:** **نقطة الاستئناف التالية** وفق [خطة البوابة الوطنية](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md).
4. **إرسال مرفقات `NPHIES` sandbox (`CAP13`):** يظل معلقًا مؤقتًا وفق قرارات 2026-11-22.
5. **القبول الميداني البشري (`UAT01`)** لمرفقات `PreAuth` وتجربة الرفع والتنزيل في بيئة التشغيل الفعلية.
