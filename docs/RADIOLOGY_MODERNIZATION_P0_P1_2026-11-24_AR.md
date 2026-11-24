# تحديث وتحصين قسم الأشعة الشامل (الدفعة 20 — RAD-UPGRADE-P0/P1) وتحديث بيئة GitHub Actions إلى Node 24 — 2026-11-24

## 1. النطاق والأهداف

تُنفّذ **الدفعة 20** توصيات الأولوية القصوى (`P0` و`P1`) لقسم الأشعة الواردة في [تقرير مراجعة قسمَي المختبر والأشعة وخطة تطويرهما](LAB_RADIOLOGY_AUDIT_UPGRADE_PLAN_2026-11-24_AR.md) (`CAP13` / `CAP07` / `SEC03` / `FIN02` / `OPS03` / `QA01`)، إلى جانب إزالة جميع تحذيرات إهمال بيئة تشغيل **Node 20** في `.github/workflows/deploy.yml` و`client/Dockerfile.temp` بالترقية الكاملة إلى إصدارات GitHub Actions الداعمة لـ **Node 24** أصليًا.

---

## 2. التغييرات المنفّذة

### 2.1 الترحيل `#74` وحواجز قاعدة البيانات (`PostgreSQL`)
- **الملفات:**
  - `server/prisma/schema.prisma`
  - `server/prisma/migrations/20261124160000_radiology_clinical_modernization_p0_p1/migration.sql`
- **الإصلاحات الهيكلية والحواجز:**
  1. **فك القيد العالمي الخاطئ `RadiologyStudy_code_key` على `RadiologyStudy.code`:** الإبقاء على `@@unique([hospitalId, code])` ليتمكن كل مستشفى في بيئة متعددة المنشآت من تعريف رموز قياسية (`CT-CHEST-C`, `CXR`, `MRI-BRAIN`) دون تصادم بين المنشآت.
  2. **بيانات سلامة الصبغة والإشعاع على `RadiologyStudy`:** إضافة `requiresContrast`، `contrastType` (`IODINATED`/`GADOLINIUM`/`ORAL`/`OTHER`)، `ionizingRadiation`، و`minEgfrThreshold` (`DECIMAL(6,2)`).
  3. **التقارير المهيكلة والتوقيع الإلكتروني المقفل على `RadiologyOrder`:** إضافة `reportStatus` (`DRAFT`/`PRELIMINARY`/`FINAL`/`AMENDED`)، و`indicationText`/`techniqueText`/`findingsText`/`impressionText`/`biradsScore`، و`isCriticalFinding`، و`reportedById`/`signedById`/`signedAt`/`signatureHash` (`SHA-256`)، وحقول فحص السلامة (`contrastSafetyChecked`/`contrastSafetyNotes`/`pregnancyChecked`/`pregnancyStatus`/`egfrAtOrder`/`stationId`)، مع قيد `RadiologyOrder_signed_integrity_chk` ومحفّز `radiology_order_signed_report_guard` الذي يمنع على مستوى PostgreSQL أي تعديل صامت لنص التقرير أو بيانات الموقّع أو إرجاع الحالة بعد التوقيع النهائي.
  4. **جدول الملحقات الموقّعة (`RadiologyReportAddendum` — Append-Only):** يربط كل ملحق تسلسليًا بـ `previousReportHash` ← `addendumHash` (`SHA-256`) مع محفّز `radiology_report_addendum_immutable_guard` الذي يمنع أي `UPDATE` أو `DELETE`.
  5. **جدول توثيق النتائج الحرجة (`RadiologyCriticalNotification` — JCI IPSG.2):** يسجّل إبلاغ الطبيب المعالج وإعادة القراءة `Read-Back` بمهلة 30 دقيقة (`slaDeadlineAt`/`slaBreached`) مع محفّز `radiology_critical_notification_guard` لمنع الحذف أو التعديل بعد التأكيد.
  6. **جداول المؤسسة المتعددة:** `RadiologyReportTemplate` (قوالب التقارير المهيكلة حسب النمط والعضو) و`RadiologyStation` (محطات `DICOM MWL` متعددة المنشآت والأنماط).

### 2.2 محرك سلامة الصبغة والتقارير المهيكلة وتوسعة `DICOM/MWL/OHIF`
- **`server/src/radiology/radiology-report.util.ts` و`dto/radiology-modernization.dto.ts`:**
  - حساب `eGFR` بمعادلة **CKD-EPI 2021** الخالية من التحيز العرقي من آخر نتيجة كرياتينين في المختبر.
  - فحص ثلاثي للسلامة قبل الطلب (`evaluateRadiologySafety`): حساسية الصبغة من `PatientAllergy`، انخفاض `eGFR < threshold`، وحالة الحمل للأشعة المؤيّنة للنساء بعمر الإنجاب (12–55 سنة) مع حظر إلزامي (`409 Conflict`) يتطلب مبرّر تجاوز سريري موثّقًا.
  - تركيب النص السريري المهيكل (`composeStructuredReportText`) وبصمات `SHA-256` للتقرير والملحقات (`computeRadiologyReportHash` و`computeRadiologyAddendumHash`).
- **`server/src/radiology/radiology.service.ts` و`radiology.controller.ts`:**
  - ترحيل فوترة `createOrdersForEncounter` و`completeOrderWithReport` بالكامل إلى مكتبة **`Money`** (`ROUND_HALF_EVEN`) مع التحقق من فتح الزيارة (`OPEN`) ونشاط الطبيب واكتمال الدراسات.
  - مسارات جديدة: `POST /radiology/encounters/:encounterId/safety-check`، `POST /radiology/orders/:id/sign`، `POST /radiology/orders/:id/addenda`، `GET /radiology/orders/:id/verify`، `POST /radiology/orders/:id/cancel`، `GET/POST /radiology/critical-notifications(/:id/read-back)`، `POST /radiology/catalog/studies`، `GET/POST /radiology/templates`، و`GET/POST /radiology/stations` (مع `@AuditInTransaction()` وسلسلة `AuditLog` وبث SIEM).
  - حذف 143 سطرًا من الكود المعلّق الميت في `radiology.controller.ts` واستبدال `req: any` بـ `AuthenticatedRequest`؛ مما خفّض دين ESLint التاريخي للخادم بـ **14 خطأً إضافيًا** (`4281` → `4267`).
- **`server/src/radiology/radiology-pacs.service.ts` و`radiology-mwl.service.ts` و`radiology-viewer.controller.ts`:**
  - فك حصر `DX/CR` والـ 128 صورة لدعم جميع أنماط DICOM الـ 12 (`DX/CR/CT/MR/US/MG/RF/XA/NM/PT/DXA/OT`) وحتى `20,000` شريحة للدراسة (لدعم الأشعة المقطعية `CT` والرنين المغناطيسي `MR`).
  - ترقية `RadiologyMwlService` لدعم محطات `RadiologyStation` متعددة المنشآت والأنماط بالتوازي مع التوافق الكامل مع إعدادات البيئة السابقة.
  - دعم تضمين عارض `OHIF` في نفس الأصل (`frame-ancestors 'self'`) عبر `RADIOLOGY_OHIF_ALLOW_SAME_ORIGIN_EMBED=true` مع إبقاء `frame-ancestors 'none'` افتراضيًا.

### 2.3 الواجهة السريرية وإصلاحات العرض والطباعة
- **`client/src/components/radiology/RadiologyReportModal.tsx` و`RadiologyReportModal.test.tsx` و`RadiologyWorklistPage.tsx`:**
  - إزالة `window.prompt()` نهائيًا واستبدالها بمحرر تقارير مهيكلة (`Indication/Technique/Findings/Impression/BI-RADS`) مع اختيار القوالب السريعة، والحفظ الأولي مقابل التوقيع المقفل بـ `SHA-256`، ونموذج الملحقات الموقّعة (`Addenda`)، وتوثيق `JCI IPSG.2 Read-Back`، وإصلاح حالة الفراغ (`filtered.length === 0`).
- **`client/src/pages/RadiologyReportPrintPage.tsx`:** عرض `dicomAccessionNumber` الحقيقي، حالة التقرير، اسم وتوقيع طبيب الأشعة المعتمد وبصمة `SHA-256`، وكامل الملحقات الموقّعة.
- **`client/src/components/encounter/RadiologyTab.tsx`:** توحيد رموز الأنماط القياسية (`DX`/`CR`/`CT`/`MR`/`US`/`MG`/`RF`/`DXA`) مع الحفاظ على الأسماء السابقة.

### 2.4 إزالة تحذيرات Node 20 في GitHub Actions وDocker
- ترقية جميع إجراءات `.github/workflows/deploy.yml` إلى الإصدارات الرسمية الداعمة لـ **Node 24** أصليًا: `actions/checkout@v7`، `actions/setup-node@v7`، `docker/login-action@v4`، `docker/setup-buildx-action@v4`، `docker/metadata-action@v6`، `docker/build-push-action@v7`.
- تحديث `client/Dockerfile.temp` من `node:20-alpine` إلى `node:24-slim` (بينما `server/Dockerfile` و`client/Dockerfile` يعملان بالفعل على `node:24-slim`).

---

## 3. أدلة التحقق المنفّذة (بعد آخر تعديل)

| البوابة / الاختبار | النتيجة | التفصيل / الدليل |
|---|---|---|
| ترحيلات Prisma (`migrate reset --force`) | **ناجح** | تطبيق **`74/74`** ترحيلًا من الصفر على PostgreSQL المعزول (`127.0.0.1:15432`) |
| تطابق المخطط (`migrate diff --exit-code`) | **ناجح** | `No difference detected.` |
| الفحوص الساكنة (`i18n`, `tenant-isolation`, `ABAC`) | **ناجح** | `Client: 7401` / `Mobile: 40`؛ `105` متحكمًا معزولًا؛ `audit:check` **`105/105`** (`93/93` فعليًا) |
| `server`: `lint:ci` | **ناجح** | `0` أخطاء جديدة، وانخفاض الدين التاريخي بـ **14 خطأً** (`4281` → **`4267`** عبر `664` ملفًا، `603` تحذيرًا) |
| `server`: `typecheck` & `build` | **ناجح** | `0` أخطاء |
| `server`: اختبارات الوحدة (`jest --runInBand`) | **ناجح** | **`101/101`** مجموعة = **`797/797`** اختبارًا (`0` متخطى، `48.927 s`)، تشمل `radiology-modernization.service.spec.ts` و`radiology.service.spec.ts` |
| `client`: `lint` | **ناجح** | `0` أخطاء |
| `client`: `Vitest` (`--run`) | **ناجح** | **`51/51`** ملفًا = **`273/273`** اختبارًا (`36.45 s`)، تشمل `RadiologyReportModal.test.tsx` (`2/2`) و`RadiologyWorklistPage.test.tsx` |
| `client`: بناء الإنتاج (`vite build`) | **ناجح** | `✓ built in 16.07s` (`PWA` precache `246` إدخالًا) |
| E2E معزول (`connection_limit=5`): `radiology-modernization-p0.e2e-spec.ts` | **ناجح** | `1/1` (`9.053 s`) — عزل المنشآت، الصبغة/`eGFR`/الحمل، التوقيع `SHA-256`، الملحقات، `Read-Back`، والإلغاء (`scratch/phase5-batch20-20261124/e2e-rad-mod.log`) |
| E2E معزول (`connection_limit=5`): `clinical-consumption`, `lab-modernization-p0`, `full-cycle` | **ناجح** | `17/17` (`16.163 s`) + `1/1` (`7.154 s`) + `6/6` (`7.112 s`) (`scratch/phase5-batch20-20261124/e2e-batch20.log`) |

---

## 4. المتبقي المفتوح ضمن `CAP13` (الأشعة)
- تتبّع الجرعة الإشعاعية (`CTDIvol` / `DLP` / `DAP` عبر `DICOM RDSR`) وجدولة غرف الأجهزة وسجل إعادة التصوير (`Repeat/Reject QC`).
- webhook ربط تلقائي من Orthanc عند حدث `StableStudy` ومقارنة الدراسات السابقة جنبًا إلى جنب.
- القبول السريري الميداني (`UAT01`) بالتعاون مع أطباء وفنيي الأشعة.
