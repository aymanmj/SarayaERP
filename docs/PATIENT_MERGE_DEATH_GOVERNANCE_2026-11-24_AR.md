# دمج وفك دمج المريض عبر `MPI` وإدارة الوفاة (`CAP06`) — 2026-11-24

**المعرفات المرتبطة في السجل الموحد:** `CAP06`، `OPS02`، `OPS03`، `SEC03`، `UI15`، `QA01`  
**الدفعة:** الدفعة 14 (المرحلة 5 — حوكمة دمج وفك دمج ملفات المرضى برقابة 4 عيون، وتوثيق الوفاة وإلغاء المواعيد المستقبلية، وعكس الوفاة المسجّلة بالخطأ)

---

## 1. ملخص النطاق المنفّذ

1. **نموذج البيانات ومحفّزات الحماية في PostgreSQL (الترحيل `#68`: `20261124020000_patient_merge_and_death_management`):**
   - توسيع نموذج `Patient` في `server/prisma/schema.prisma` بحقول الوفاة (`isDeceased`، `dateOfDeath`، `deathCertificateNumber`، `causeOfDeath`، `deathLocation`، `deathRecordedById`، `deathRecordedAt`) وحقول الدمج (`mergedIntoPatientId`، `mergedAt`، `mergedById`) مع قيود `CHECK` تمنع الدمج الذاتي وتلزم اتساق حقول الوفاة والدمج.
   - إنشاء جدول **`PatientMergeRecord`** لدورة الدمج وفك الدمج مع قيود `CHECK` تفرض اختلاف الملفين ورقابة 4 عيون على مستوى قاعدة البيانات (`reviewedById <> requestedById`)، وفهرس فريد جزئي `PatientMergeRecord_pending_source_unique` يمنع تكرار طلبات الدمج المعلّقة لنفس الملف المصدر، ومحفّز `patient_merge_record_guard` يمنع الحذف وتعديل السجلات النهائية ويتحقق من انتماء كلا الملفين للمنشأة نفسها.
   - إنشاء جدول **`PatientDeathEvent`** كسجل أحداث غير قابل للتعديل (Append-Only) بحماية محفّز `patient_death_event_immutable_guard` (يمنع `UPDATE`/`DELETE` ويتحقق من عزل المنشأة).
   - التحقق من الترحيلات: `prisma migrate reset --force --skip-seed` نجح بتطبيق الترحيلات الـ 68 من الصفر، و`prisma migrate diff --exit-code` أعاد **`No difference detected.`** (صفر انحراف).

2. **منطق الخادم وحواجز السلامة السريرية (`server/src/patients/`، `encounters`، `appointments`، `prisma.extension.ts`، `seed.ts`):**
   - إنشاء [`PatientGovernanceService`](file:///d:/SarayaERP/server/src/patients/patient-governance.service.ts) و[`PatientGovernanceController`](file:///d:/SarayaERP/server/src/patients/patient-governance.controller.ts) بمسار `/patients/governance` (مسجل قبل `PatientsController` في `PatientsModule` لمنع تعارض المسار مع `GET /patients/:id`):
     - **دمج ملفات المرضى بـ 4 عيون:** `POST /patients/governance/merges` (`patients:merge:request`) ← `POST /patients/governance/merges/:id/review` (`patients:merge:approve`) مع أقفال `FOR UPDATE` مرتّبة تصاعديًا لمنع `deadlock`، ومنع دمج مريض لديه حالة تنويم/طوارئ مفتوحة أو متوفى كمصدر، ونقل ذري لكافة الكيانات السريرية والمالية المرتبطة (16 كيانًا: الزيارات، المواعيد، الفواتير، الوصفات، الحساسيات، الموافقات المسبقة، التنويم، المشكلات السريرية، الأدوية المنزلية، التحويلات، الإقرارات، قوائم الانتظار، فجوات الرعاية، سندات الأمانات `depositPatientId`، حوادث الجودة، وتنبيهات `CDSS`) مع حفظ بيان نقل دقيق `transferManifest` بالمعرّفات المنقولة، وربط الملف المصدر بالسجل الوطني الموحد `globalPatientId` للهدف.
     - **فك الدمج دون فقدان بيانات (`Unmerge`):** `POST /patients/governance/merges/:id/unmerge` (`patients:merge:approve`) يستعيد ذريًا كل سجل نُقل استنادًا إلى `transferManifest` ويعيد تفعيل الملف المصدر وحالته السابقة لـ `globalPatientId`.
     - **إدارة الوفاة (`Death Management`):** `POST /patients/governance/:patientId/death` (`patients:death:record`) يتحقق من عدم مستقبلية تاريخ الوفاة وعدم سبقه لتاريخ الميلاد، ويقفل الملف سريريًا، ويلغي تلقائيًا جميع المواعيد المستقبلية (`REQUESTED`/`CONFIRMED`) وقوائم الانتظار المفتوحة مع حفظ معرّفاتها في `PatientDeathEvent`.
     - **إلغاء توثيق الوفاة بالخطأ بـ 4 عيون:** `POST /patients/governance/:patientId/death/reversal-request` ← `POST /patients/governance/:patientId/death/reversal-review/:eventId` (`patients:death:reverse`) يفرض مراجعًا مستقلًا ويعيد تفعيل الملف عند الاعتماد مع حفظ السجل التاريخي بالكامل.
   - **حواجز السلامة السريرية في نقاط الدخول:**
     - منع فتح زيارة جديدة (`EncountersService.createEncounter`) أو حجز موعد (`AppointmentsService.createAppointment`) لمريض متوفى أو مدمج (`409 ConflictException`).
     - استبعاد الملفات المدمجة (`mergedIntoPatientId: null`) من البحث والقوائم النشطة في `PatientsService.findAll`.
     - توسيع `PATIENT_RELATION_KEYS` في `server/src/prisma/prisma.extension.ts` (`sourcePatient`، `targetPatient`، `mergedIntoPatient`، `mergedFromPatients`) لضمان فك تشفير PII التلقائي في استعلامات الحوكمة.
     - إضافة الصلاحيات الأربع الجديدة (`patients:merge:request`، `patients:merge:approve`، `patients:death:record`، `patients:death:reverse`) في `server/prisma/seed.ts` مع `@AuditInTransaction()` وسلسلة `AuditLog` المترابطة وبث SIEM.

3. **واجهة المستخدم والاختبارات (`client/src/components/patients/PatientGovernanceDialog.tsx` و`PatientsPage.tsx`):**
   - بناء نافذة `PatientGovernanceDialog` بتبويبَي «الدمج وفك الدمج (MPI)» (مع إخفاء أزرار الاعتماد عن مقدّم الطلب تطبيقًا لرقابة 4 عيون) و«إدارة الوفاة» (توثيق الوفاة وطلب/اعتماد عكس الوفاة بالخطأ)، وربطها بزر حوكمة في `PatientsPage.tsx`.
   - إنشاء اختبارات وحدة `patient-governance.service.spec.ts` وواجهة `PatientGovernanceDialog.test.tsx` وتكامل معزول `patient-governance-cap06.e2e-spec.ts`.

---

## 2. نتائج التحقق والأدلة المنفّذة

### أ. بوابات الخادم والعميل والتدقيق الساكن

| البوابة | النتيجة | التفاصيل |
|---|---|---|
| ترحيلات Prisma + Diff | **نجاح (`0` انحراف)** | `68/68` ترحيلًا من الصفر و`prisma migrate diff --exit-code` = `No difference detected.` |
| `node generate-audit-report.cjs --check` | **نجاح (`101/101`)** | `89/89` فعليًا (`100%` تغطية ABAC وعزل المنشآت) |
| الخادم: `npm.cmd run lint:ci` | **نجاح (0 أخطاء جديدة)** | `4305` خطأً تاريخيًا و`584` تحذيرًا عبر `632` ملفًا |
| الخادم: `npm.cmd run typecheck` | **نجاح (0 أخطاء)** | — |
| الخادم: `npm.cmd run build` | **نجاح (0 أخطاء)** | — |
| الخادم: `npm.cmd test -- --runInBand` | **نجاح (`94/94` مجموعة)** | **`777/777` اختبارًا ناجحًا**، `0` متخطى، خلال `41.653 s` |
| العميل: `npm.cmd run lint` | **نجاح (`0` أخطاء)** | `88` تحذيرًا تاريخيًا |
| العميل: `npm.cmd test -- --run` (Vitest) | **نجاح (`45/45` ملفًا)** | **`262/262` اختبارًا ناجحًا** خلال `28.84 s` |
| العميل: `npm.cmd run build` | **نجاح (`13.07 s`)** | `PWA` precache `246` عنصرًا |

### ب. اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1` على Docker PostgreSQL/Redis بـ 68 ترحيلًا)

السجلات محفوظة محليًا تحت `scratch/phase5-batch14-20261124/`:

| المجموعة | النتيجة | المدة |
|---|---|---|
| `test/e2e/patient-governance-cap06.e2e-spec.ts` | **`1/1` ناجح (دورة الدمج/فك الدمج/الوفاة/عكس الوفاة الكاملة)** | `9.63 s` |
| `test/e2e/clinical-notes-signature.e2e-spec.ts` | **`1/1` ناجح** | `9.787 s` |
| `test/e2e/multi-tenant-isolation.e2e-spec.ts` | **`2/2` ناجح** | `9.825 s` |
| **الإجمالي المركّز** | **`4/4` (`3/3` مجموعات، `0` فاشل)** | — |

---

## 3. المتبقي خارج نطاق هذه الدفعة

- معالجة الجداول الاختيارية ذات العلاقة الفريدة `1:1` عند دمج مريضين يمتلك كلاهما سجل `PatientMedicalHistory` أو `ObstetricHistory` (تحديد سياسة دمج الحقول النصية السريرية مع فريق السجلات الطبية)، وتوليد إشعار `ADT A40` خارجي لشبكة `MPI` عند تفعيل التكامل الخارجي، وطباعة شهادة الوفاة الرسمية بـ `PDF`.
- القبول السريري والإداري والقانوني الميداني (`UAT01`).
