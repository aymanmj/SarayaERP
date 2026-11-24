# سلامة العمليات والعدّ الجراحي المزدوج وسجل التخدير والولادة (الدفعة 21 — `CAP05` — الترحيل `#75`) — 2026-11-24

## 1. النطاق والأهداف

تُنفّذ **الدفعة 21** قدرة **`CAP05`** (الولادة والتخدير والعدّ الجراحي وسلامة العمليات) وفق معايير **WHO Safe Surgery Saves Lives / JCI IPSG.4 / AORN / ASA / ACOG**، لترقية وحدة العمليات من ملاحظات JSON نصّية غير مقفلة إلى سجلات سريرية مهيكلة وموقّعة تشفيريًا بـ `SHA-256` ومحصّنة بمحفّزات وقيود `PostgreSQL` وبوابات منع إغلاق العمليات والتصعيد التلقائي للحوادث الجسيمة (`ClinicalIncident`).

---

## 2. التغييرات المنفّذة

### 2.1 الترحيل `#75` وحواجز قاعدة البيانات (`PostgreSQL`)
- **الملفات:**
  - `server/prisma/schema.prisma`
  - `server/prisma/migrations/20261124180000_surgical_safety_count_anesthesia_cap05/migration.sql`
- **الجداول والحواجز المنشأة:**
  1. **`SurgicalSafetyChecklist` (قائمة WHO الجراحية ثلاثية المراحل):**
     - مراحل `SIGN_IN`، `TIME_OUT`، `SIGN_OUT` بقيد فريد `[surgeryCaseId, phase]`.
     - قيد `SurgicalSafetyChecklist_four_eyes_chk`: يُلزم مرحلتَي `TIME_OUT` و`SIGN_OUT` بمراجع مستقل (`verifiedById <> performedById`).
     - محفّز `surgical_safety_checklist_immutable_guard`: سجل append-only يمنع أي `UPDATE` أو `DELETE` على مستوى PostgreSQL.
  2. **`SurgicalCountItem` (العدّ الجراحي المزدوج للشاش والإبر والمشارط والآلات):**
     - فئات `SPONGE`، `SHARP`، `INSTRUMENT`، `NEEDLE`، `OTHER` مع تتبع `initialCount` و`addedCount` و`finalCount`.
     - قيود `SurgicalCountItem_matched_chk` و`SurgicalCountItem_resolved_chk`: تُلزم المطابقة المزدوجة بوجود ممرض متجوّل مستقل (`circulatingNurseId <> scrubNurseId`) وتساوي العدد النهائي مع `initialCount + addedCount` عند حالة `MATCHED`، وملاحظات تسوية إلزامية عند `RESOLVED_WITH_XRAY` أو `ESCALATED_INCIDENT`.
     - محفّز `surgical_count_item_guard`: يمنع الحذف وتعديل البنود النهائية أو العبث بالمنشأة والعملية.
  3. **`AnesthesiaRecord` (سجل التخدير المقفل — معيار ASA):**
     - يشمل `asaClass` (`ASA_1`–`ASA_6`)، و`isEmergency`، و`anesthesiaType`، و`airwayManagement`، و`agentsUsed`/`vitalsTimeline`، و`fluidsInMl`/`estimatedBloodLossMl`/`urineOutputMl`، و`pacuAldreteScore` (`0..10`)، وحقول التوقيع (`status`, `signedById`, `signedAt`, `signatureHash`).
     - محفّز `anesthesia_record_guard`: يمنع الحذف وأي تعديل بعد توقيع السجل (`status = 'SIGNED'`).
  4. **توسعة `DeliveryAdmission` لسلامة الولادة:**
     - إضافة `pphAlertTriggered`، `deliverySignedById`، `deliverySignedAt`، و`deliverySignatureHash` مع قيد سلامة التوقيع `DeliveryAdmission_signed_integrity_chk`.

### 2.2 خدمات الخادم وبوابات المنع والتصعيد التلقائي
- **`server/src/surgery/surgical-safety.util.ts` و`dto/surgical-safety.dto.ts`:**
  - بصمات `SHA-256` حتمية لقائمة WHO (`computeWhoChecklistHash`) وسجل التخدير (`computeAnesthesiaRecordHash`) وتوقيع الولادة (`computeDeliverySafetyHash`).
  - محرك تقييم العدّ (`evaluateSurgicalCount`) ومحرك سلامة الولادة (`evaluateDeliverySafety`) وفق حدود نزيف ما بعد الولادة **WHO/ACOG PPH** (`>= 500 mL` للولادة الطبيعية و`>= 1000 mL` للقيصرية) وتنبيه انخفاض `APGAR < 7` أو `NICU`/`STILLBORN`.
- **`server/src/surgery/surgical-safety.service.ts` و`surgical-safety.controller.ts` (`/surgery/safety/*`):**
  - فرض التسلسل الإلزامي `SIGN_IN -> TIME_OUT -> SIGN_OUT` ورقابة 4 عيون، ومنع إغلاق `SIGN_OUT` (`409`) عند وجود أي بند عدّ جراحي مفتوح أو متباين (`OPEN`/`DISCREPANCY`).
  - التصعيد التلقائي لتباين العدّ غير المسوّى (`ESCALATED_INCIDENT`) إلى حادثة سريرية حرجة (`ClinicalIncident` بدرجة **`SENTINEL`**) مرتبطة مباشرة بالبند `incidentId`.
  - التصعيد التلقائي لنزيف ما بعد الولادة (`PPH`) أو انخفاض `APGAR`/`STILLBORN` عند توقيع الولادة إلى `ClinicalIncident` (`MAJOR`/`SENTINEL`).
  - ربط بوابة منع في **`SurgeryService.updateStatus`**: رفض تحويل العملية إلى `COMPLETED` (`409 Conflict`) عند وجود أي بند `SurgicalCountItem` مفتوح أو متباين.
  - تغطية جميع المسارات الحساسة بـ `@AuditInTransaction()` وسلسلة `AuditLog` وبث SIEM بعد الالتزام.

### 2.3 واجهة المستخدم السريرية (`SurgicalSafetyModal`)
- **`client/src/components/surgery/SurgicalSafetyModal.tsx` و`SurgicalSafetyModal.test.tsx` و`SurgeryCaseDetailsPage.tsx`:**
  - دمج زر `🛡️ سلامة الجراحة والعدّ والتخدير (WHO)` في شاشة تفاصيل العملية، بنافذة ثلاثية التبويبات:
    1. **قائمة WHO الجراحية** (مؤشرات الجاهزية، اختيار المراجع المستقل 4 عيون، وتوقيع المراحل ببصمة `SHA-256`).
    2. **العدّ الجراحي المزدوج** (فتح البنود، التحقق المزدوج `Circulating Nurse`، وتنبيهات التباين والتصعيد إلى حادثة `SENTINEL`).
    3. **سجل التخدير المقفل** (`ASA`، نوع التخدير، السوائل/فقدان الدم، `Aldrete 0–10`، والحفظ/التوقيع المقفل).

---

## 3. أدلة التحقق المنفّذة (بعد آخر تعديل)

| البوابة / الاختبار | النتيجة | التفصيل / الدليل |
|---|---|---|
| ترحيلات Prisma (`migrate reset --force`) | **ناجح** | تطبيق **`75/75`** ترحيلًا من الصفر على PostgreSQL المعزول (`127.0.0.1:15432`) |
| تطابق المخطط (`migrate diff --exit-code`) | **ناجح** | `No difference detected.` |
| الفحوص الساكنة (`i18n`, `tenant-isolation`, `ABAC`) | **ناجح** | `Client: 7401` / `Mobile: 40`؛ `106` متحكمًا معزولًا؛ `audit:check` **`106/106`** (`94/94` فعليًا، `100%`) |
| `server`: `lint:ci` | **ناجح** | `0` أخطاء جديدة (`4267` خطأً تاريخيًا عبر `670` ملفًا، `620` تحذيرًا) |
| `server`: `typecheck` & `build` | **ناجح** | `0` أخطاء |
| `server`: اختبارات الوحدة (`jest --runInBand`) | **ناجح** | **`102/102`** مجموعة = **`800/800`** اختبارًا (`0` متخطى، `44.348 s`)، تشمل `surgical-safety.service.spec.ts` |
| `client`: `lint` | **ناجح** | `0` أخطاء |
| `client`: `Vitest` (`--run`) | **ناجح** | **`52/52`** ملفًا = **`275/275`** اختبارًا، تشمل `SurgicalSafetyModal.test.tsx` (`2/2`) |
| `client`: بناء الإنتاج (`vite build`) | **ناجح** | `✓ built in 13.13s` (`PWA` precache `246` إدخالًا) |
| E2E معزول (`connection_limit=5`): `surgical-safety-cap05.e2e-spec.ts` | **ناجح** | `1/1` (`9.586 s`) — WHO sequence + 4-eyes، العدّ المزدوج ومنع الإغلاق، تصعيد `SENTINEL`، قفل التخدير، تصعيد `PPH/APGAR`، وعزل المنشآت (`scratch/phase5-batch21-20261124/e2e-batch21.log`) |
| E2E معزول (`connection_limit=5`): انحدار العمليات والأشعة | **ناجح** | `surgery-consumption-integrity` + `surgery-lifecycle-billing-integrity` (`31/31` خلال `36.327 s`) + `radiology-modernization-p0` (`1/1` خلال `7.44 s`) |

---

## 4. المتبقي المفتوح ضمن `CAP05`
- ربط المخطط الزمني للعلامات الحيوية داخل غرفة العمليات آليًا بأجهزة المراقبة (`HL7 ORU` من أجهزة التخدير/المونيتور).
- نماذج طباعة رسمية لقائمة WHO الجراحية وسجل التخدير ومحضر الولادة وشهادة الميلاد.
- القبول السريري الميداني (`UAT01`) مع فرق الجراحة والتخدير والنسائية والتمريض.
