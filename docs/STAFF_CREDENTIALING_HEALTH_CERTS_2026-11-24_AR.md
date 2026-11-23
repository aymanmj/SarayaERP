# تراخيص الكادر الطبي والطبي المساعد والشهادات الصحية (CAP12 — الدفعة 16، الترحيل `#70`)

**التاريخ:** 2026-11-24  
**النطاق:** `CAP12` / `OPS02` / `OPS03` / `SEC03` / `QA01`  
**الترحيل:** `20261124060000_staff_credentialing_and_health_certificates` (الترحيل رقم `#70`)

## 1. الخلفية والأهداف السريرية والتنظيمية
استجابةً لتوجيه صاحب النظام بإنشاء منظومة احترافية لتراخيص الكادر الطبي (**الأطباء والدكاترة وما في حكمهم — `MEDICAL`**) والكادر الطبي المساعد (**التمريض والفنيين والصيادلة وما في حكمهم — `ALLIED_HEALTH`**) تشمل **إذن المزاولة (`PRACTICE_LICENSE`)** و**الشهادة الصحية للخلو من الأمراض (`HEALTH_CERTIFICATE`)** والشهادات التخصصية والتنظيمية (شهادة المجلس الطبي، شهادة التخصص، `BLS/ACLS`، تصريح السلامة الإشعاعية)، مع الاستفادة من الاصطلاحات المؤسسية المرجعية في `D:\SarayaManager` (`apps/api/src/modules/hr/documents/dto/create-document.dto.ts`، قراءة فقط) وبناء التنفيذ من الصفر بما يتكامل أصيلًا مع معمارية **نظام السرايا الطبي** (العزل متعدد المنشآت، رقابة 4 عيون، التدقيق المتسلسل `AuditLog`، وبوابات الجدولة والمواعيد).

## 2. البنية التحتية وحماية قاعدة البيانات (الترحيل `#70`)
أُضيف نموذج `StaffCredential` في `server/prisma/schema.prisma` وترحيله `server/prisma/migrations/20261124060000_staff_credentialing_and_health_certificates/migration.sql` بالخصائص التالية:

- **التصنيفات والأنواع المعتمدة:**
  - `StaffCategory`: `MEDICAL` | `ALLIED_HEALTH` | `ADMINISTRATIVE_SUPPORT`.
  - `StaffCredentialType`: `PRACTICE_LICENSE` (إذن مزاولة المهنة)، `HEALTH_CERTIFICATE` (الشهادة الصحية / الخلو من الأمراض)، `MEDICAL_COUNCIL_CERT` (شهادة المجلس الطبي)، `SPECIALTY_BOARD_CERT` (شهادة التخصص)، `BLS_ACLS_CERT` (الإنعاش القلبي)، `RADIATION_SAFETY_PERMIT` (السلامة الإشعاعية)، `OTHER`.
  - `StaffCredentialStatus`: `PENDING_VERIFICATION` | `ACTIVE` | `SUSPENDED` | `REVOKED` | `SUPERSEDED`.
- **الحقول الأساسية:** `hospitalId`, `userId`, `staffCategory`, `credentialType`, `credentialNumber`, `issuingAuthority`, `issueDate`, `expiryDate`, `alertDaysBefore` (افتراضيًا `30` يومًا)، `isMandatory` (افتراضيًا `true`)، `verifiedById`/`verifiedAt`, `suspendedById`/`suspendedAt`/`suspensionReason`, `documentRef`, `notes`.
- **6 قيود `CHECK` على مستوى PostgreSQL:**
  - إلزام `expiryDate > issueDate`.
  - إلزام نطاق `alertDaysBefore` بين `0` و`365`.
  - إلزام نص غير فارغ لـ `credentialNumber` و`issuingAuthority`.
  - إلزام توثيق `verifiedById` و`verifiedAt` عند حالة `ACTIVE`.
  - إلزام توثيق `suspendedById` و`suspendedAt` و`suspensionReason` عند حالتي `SUSPENDED` و`REVOKED`.
  - تقييد قيم `staffCategory` و`credentialType` و`status`.
- **محفّز PostgreSQL `staff_credential_guard` (`guard_staff_credential()`):**
  - يمنع `DELETE` نهائيًا لحفظ الأثر التنظيمي والرقابي (لا تُحذف التراخيص بل تُعلّق أو تُلغى أو تُستبدل بتجديد أحدث).
  - يمنع تعديل السجلات الملغاة نهائيًا (`REVOKED`).
  - يمنع تغيير `hospitalId` أو `userId` أو `credentialType` أو `createdById` بعد الإنشاء.
  - يتحقق على مستوى قاعدة البيانات من انتماء الموظف للمنشأة عبر `User.hospitalId` أو جدول التفويض متعدد الفروع `UserHospitalAccess`.

## 3. طبقة الخدمات وبوابات المنع التلقائي والتدقيق
- **الخدمة:** `server/src/hr/staff-credentialing.service.ts` مع `server/src/hr/dto/staff-credential.dto.ts`.
  - **تسجيل الوثيقة (`createCredential`):** يبدأ السجل بحالة `PENDING_VERIFICATION` مع التحقق من انتماء الموظف للمنشأة وتواريخ الصلاحية.
  - **التوثيق برقابة 4 عيون (`verifyCredential`):** يمنع الموظف من توثيق ترخيصه أو شهادته لنفسه (`403`)، ويمنع منشئ السجل من اعتماد نفس السجل منفردًا (`403`) عند تفعيل مسار الرقابة، وعند الاعتماد يتحول السجل إلى `ACTIVE` ويُحوَّل تلقائيًا أي ترخيص سابق من النوع نفسه (`(userId, credentialType)`) إلى `SUPERSEDED` داخل معاملة ذرية واحدة (`$transaction`).
  - **التعليق والإلغاء وإعادة التفعيل (`suspendOrRevokeCredential`, `reinstateCredential`):** بتوثيق إلزامي للسبب ومنع التعديل بعد `REVOKED`.
  - **محرك الأهلية ومنع الجدولة (`evaluateStaffSchedulingEligibility`, `assertStaffSchedulingEligibility`):**
    - يحسب حالة الامتثال بدقة (`COMPLIANT` / `EXPIRING_SOON` / `EXPIRED` / `PENDING_VERIFICATION` / `SUSPENDED` / `REVOKED`).
    - يمنع الجدولة تلقائيًا بـ `409 Conflict` مع قائمة مفصلة بأسباب المنع إذا كان لأي نوع وثيقة إلزامية مسجلة للموظف (مثل `PRACTICE_LICENSE` أو `HEALTH_CERTIFICATE`) غياب سجل `ACTIVE` ساري المفعول يغطي تاريخ الجدولة المستهدف (`asOfDate`).
    - يدعم سياسة التشديد الشامل عبر إعداد المنشأة `SystemSetting` (`hr.requireVerifiedCredentials = 'true'`) لمنع جدولة أي كادر غير موثّق مسبقًا قبل توفر إذن المزاولة والشهادة الصحية الساريين معًا.
  - **لوحة تنبيهات الانتهاء الاستباقية (`getComplianceAlerts`):** تصنّف تلقائيًا التراخيص المنتهية والتي تنتهي قريبًا وفق نافذة `alertDaysBefore` لكل وثيقة، مع إحصائيات مخصصة لإذن المزاولة والشهادات الصحية.
  - **التدقيق الذري:** جميع عمليات الكتابة تكتب `AuditLog` متسلسلًا داخل المعاملة الذرية (`@AuditInTransaction()`) مع بث SIEM بعد التثبيت.
- **نقاط الربط والتكامل التلقائي:**
  - `server/src/hr/hr.service.ts` (`assignRoster`): يستدعي `assertStaffSchedulingEligibility(tx, hospitalId, userId, end)` لأي مناوبة فعلية (`!isOffDay`)، فيمنع إسناد مناوبة لكادر انتهت صلاحية إذن مزاولته أو شهادته الصحية.
  - `server/src/appointments/appointments.service.ts` (`createAppointment`): يستدعي `assertStaffSchedulingEligibility(this.prisma, hospitalId, doctorId, new Date(scheduledStart))`، فيمنع حجز موعد لطبيب انتهى إذن مزاولته أو شهادته الصحية أو عُلّق ترخيصه.
- **المتحكم والصلاحيات:**
  - `server/src/hr/staff-credentialing.controller.ts` (`@Controller('hr/credentials')` مسجل قبل `HrController` في `HrModule` لمنع تعارض المسارات)، محمي بـ `@UseGuards(JwtAuthGuard, PermissionsGuard)` و`@RequireFeature('HR')` والصلاحيات الدقيقة (`hr:credentials:view`, `hr:credentials:manage`, `hr:credentials:verify`) المضافة في `server/prisma/seed.ts`.

## 4. واجهة المستخدم
- `client/src/components/hr/StaffCredentialsModal.tsx` (مدمجة في `client/src/pages/RosterPage.tsx` مع اختبارات `client/src/components/hr/StaffCredentialsModal.test.tsx`):
  - بطاقات مؤشرات فورية: `منتهية الصلاحية`، `تنتهي قريبًا`، `تنبيهات إذن المزاولة`، `تنبيهات الشهادات الصحية`.
  - نموذج تسجيل إذن مزاولة أو شهادة صحية أو شهادة تخصص مع تحديد فئة الكادر وتواريخ الإصدار والانتهاء ونافذة التنبيه.
  - أزرار التوثيق برقابة 4 عيون والتعليق والفلترة الفورية.

## 5. أدلة التحقق والاختبارات المنفذة (بعد آخر تعديل)
- **الترحيلات والمخطط (`PostgreSQL` المعزول):**
  - `prisma migrate reset --force --skip-seed`: تطبيق **`70/70`** ترحيلًا من الصفر دون أخطاء.
  - `prisma migrate diff --exit-code`: **`No difference detected.`**.
- **تغطية ABAC والتفويض:** `node generate-audit-report.cjs --check` = **`103/103`** (`91/91` فعليًا، `100%`).
- **الخادم (`server`):**
  - `npm.cmd run lint:ci`: **`0` أخطاء جديدة** (`642` ملفًا، الدين التاريخي `4305` خطأً و`584` تحذيرًا دون رفع خط الأساس).
  - `npm.cmd run typecheck`: `0` أخطاء.
  - `npm.cmd run build`: `0` أخطاء.
  - `npm.cmd test -- --runInBand`: **`96/96` مجموعة = `781/781` اختبارًا ناجحًا** (`0` متخطى، `48.124 s`)، شاملة `staff-credentialing.service.spec.ts` (`2/2`).
- **العميل (`client`):**
  - `npm.cmd run lint`: `0` أخطاء (`88` تحذيرًا تاريخيًا).
  - `npm.cmd test -- --run` (`Vitest`): **`47/47` ملفًا = `265/265` اختبارًا ناجحًا** (`29.15 s`)، شاملة `StaffCredentialsModal.test.tsx`.
  - `npm.cmd run build`: نجاح كامل خلال `12.27s` (`PWA` precache `246` عنصرًا).
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1` على الترحيل `#70`، السجلات في `scratch/phase5-batch16-20261124/`):**
  - `test/e2e/staff-credentialing-cap12.e2e-spec.ts`: **`1/1`** (`11.068 s`) — يغطي تسجيل إذن المزاولة للطبيب والشهادة الصحية للممرض، رقابة 4 عيون ومنع التوثيق الذاتي، عزل المنشآت (`404`)، لوحة التنبيهات، حظر `409` على `POST /appointments` و`POST /hr/roster/assign` عند انتهاء الصلاحية، رفع الحظر تلقائيًا بعد التجديد وتحويل السجل القديم إلى `SUPERSEDED`، التعليق وإعادة التفعيل، حظر `DELETE` على مستوى PostgreSQL، وسلسلة `AuditLog`.
  - `test/e2e/hr-payroll-integrity.e2e-spec.ts`: **`3/3`** (`11.377 s`).
  - `test/e2e/lab-specimen-culture-cap02.e2e-spec.ts`: **`1/1`** (`9.345 s`).
  - **الإجمالي المركّز:** **`5/5`** (`3/3` مجموعات، `0` فاشل).

## 6. المتبقي خارج نطاق هذه الدفعة
- ربط رفع نسخة PDF/صورة ممسوحة ضوئيًا لوثيقة إذن المزاولة والشهادة الصحية مع فحص `ClamAV` (على غرار مرفقات الموافقات المسبقة).
- إرسال تنبيهات مجدولة تلقائيًا عبر البريد/الإشعارات الداخلية (`Cron`) قبل انتهاء الوثيقة بـ `alertDaysBefore` لإدارة الموارد البشرية والإدارة الطبية.
- القبول الميداني والتشغيلي (`UAT01`) مع إدارتي الموارد البشرية والشؤون الطبية والتمريض لاعتماد سياسة `hr.requireVerifiedCredentials` في بيئة التشغيل.
