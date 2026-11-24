# تحديث وتحصين قسم المختبر الطبي (الدفعة 19 — LAB-UPGRADE-P0/P1) وتسريع بوابة GitHub Actions — 2026-11-24

## 1. النطاق والأهداف

تُنفّذ **الدفعة 19** توصيات الأولوية القصوى (`P0` و`P1`) الواردة في [تقرير مراجعة قسمَي المختبر والأشعة وخطة تطويرهما](LAB_RADIOLOGY_AUDIT_UPGRADE_PLAN_2026-11-24_AR.md) لقسم المختبر الطبي (`CAP02` / `SEC03` / `FIN02` / `OPS03` / `QA01`)، إلى جانب إعادة هندسة خط أنابيب التكامل المستمر `.github/workflows/deploy.yml` لتقليص زمن اختبارات GitHub Actions من ~20 دقيقة (والتي كانت تبلغ حد المهلة `timeout-minutes: 20`) إلى ~4–5 دقائق متوازية عبر 4 شرائح (`Shards`) مع ملخّص فشل فوري.

---

## 2. التغييرات المنفّذة

### 2.1 الترحيل `#73` وقواعد حماية قاعدة البيانات (`PostgreSQL`)
- **الملفات:**
  - `server/prisma/schema.prisma`
  - `server/prisma/migrations/20261124120000_lab_clinical_modernization_p0_p1/migration.sql`
- **الإصلاحات الهيكلية والحواجز:**
  1. **فك القيد العالمي الخاطئ `LabTest_code_key` على `LabTest.code`:** الإبقاء على `@@unique([hospitalId, code])` ليتمكّن كل مستشفى في بيئة متعددة المنشآت من امتلاك رموز قياسية (`CBC`, `BMP`, `HbA1c`...) دون تصادم بين المنشآت.
  2. **إقفال التوقيع والاعتماد على `LabOrder`:** إضافة حقول `enteredById`، `enteredAt`، `isVerified`، `verifiedById`، `verifiedAt`، `verificationHash` (`VARCHAR(64)` — `SHA-256`)، `isAmended`، `amendedAt`، `lastAmendmentReason`، مع قيد `CHECK` (`LabOrder_verified_integrity_chk`) يُلزم وجود المعتمد وتاريخ الاعتماد وبصمة التشفير عند تفعيل `isVerified = true`.
  3. **جدول النطاقات المرجعية المهيكلة حسب العمر والجنس (`LabReferenceRange`):** يدعم `gender` و`ageMinDays`/`ageMaxDays` و`normalLow`/`normalHigh` و`criticalLow`/`criticalHigh`، مع قيود `CHECK` تمنع النطاقات المعكوسة.
  4. **جدول توثيق إبلاغ القيم الحرجة (`LabCriticalNotification` — JCI IPSG.2):** يسجّل المعيار السريري للـ Read-Back (اسم الطبيب المبلَّغ، وسيلة الاتصال، وقت الإبلاغ، تأكيد إعادة القراءة `readBackConfirmed`، مهلة 30 دقيقة `slaDeadlineAt`، والتحذير عند تجاوز المهلة)، مع قيد `CHECK` ومحفّز `lab_critical_notification_guard` يمنع الحذف وتعديل الإشعار بعد التأكيد أو التلاعب بالمنشأة.
  5. **جدول سجل تعديلات النتائج المعتمدة (`LabResultAmendment` — Append-Only):** يحفظ لقطة JSON كاملة قبل وبعد التعديل (`previousSnapshot`, `newSnapshot`, `previousHash`, `newHash`, `reason`) مع محفّز `lab_result_amendment_immutable_guard` الذي يمنع أي `UPDATE` أو `DELETE` على مستوى PostgreSQL.

### 2.2 إغلاق الثغرات الأمنية `P0` وعزل المنشآت وتحصين `HL7`
1. **إغلاق ثغرة IDOR العابرة للمنشآت في `LabOrdersController` / `LabOrdersService`:**
   - فرض تصفية `order.hospitalId = user.hospitalId` في `listForEncounter(encounterId, hospitalId)` وإضافة حارس `@RequireFeature('LAB')`.
   - إصلاح ربط الفوترة `EncounterCharge.sourceId` من `order.id` إلى `labOrder.id` لضمان فتح قفل الدفع تلقائيًا فور سداد الفاتورة في الكاشير، وترحيل حسابات إنشاء الطلب في `LabOrdersService` إلى مكتبة `Money` (`ROUND_HALF_EVEN`).
2. **تحصين منفذ `HL7 MLLP` (`server/src/integration/integration.service.ts` و`hl7.consumer.ts`):**
   - إزالة السقوط العالمي الخطر (`findFirst({ isActive: true })`) والقيمة الثابتة `deviceId ?? 1` في `saveInboundMessage`؛ يرفض الخادم الآن أي جهاز غير مسجّل (عنوان IP / `sendingApp`) برسالة `AE` NACK بدل تسريب البيانات لمنشأة أخرى.
   - تحويل نتائج `ORU^R01` الواردة من الأجهزة إلى مرحلة التحقق (`IN_PROGRESS`) بدل الإغلاق التلقائي (`COMPLETED`)، ومنع الكتابة فوق أي نتيجة معتمدة (`isVerified = true`)، مع إزالة التكرار على `(labOrderId, parameterId)` والبحث العكسي عبر `TestMapping`.

### 2.3 محرك النطاقات المرجعية والاعتماد المقفل والتعديل الموقّع وJCI Read-Back
- **`server/src/labs/lab-reference-range.util.ts`:** دوال حتمية لحساب عمر المريض بالأيام (`computePatientAgeDays`)، واختيار أضيق نطاق مرجعي مطابق للجنس والعمر (`selectReferenceRange`)، وتقييم النتيجة الرقمية (`LL`/`L`/`N`/`H`/`HH` و`isCritical`)، وحساب بصمة التحقق `SHA-256` (`computeLabVerificationHash`).
- **`server/src/labs/labs.service.ts` و`labs.controller.ts` و`dto/lab-modernization.dto.ts`:**
  - ترحيل حسابات `createOrdersForEncounter` (مشاركة المريض/التأمين) إلى مكتبة `Money` (`ROUND_HALF_EVEN`) مع التحقق من فتح الزيارة (`OPEN`)، وانتماء الطبيب للمنشأة، واكتمال وجود جميع التحاليل المطلوبة.
  - فرض بوابة الدفع المسبق صراحة على زيارات العيادات الخارجية (`encounter.type === 'OPD'`) في `startProcessing` و`completeOrder` دون تعطيل الحالات الحرجة (`IPD`/`ER`/`ICU`).
  - نقل `eventEmitter.emit` إلى ما بعد نجاح معاملة `$transaction`.
  - دعم إدخال النتائج متعددة البراميترات (`LabOrderResult[]`)، والاحتساب التلقائي لأعلام الشذوذ والحرج، والإنشاء التلقائي لسجلات `LabCriticalNotification` عند رصد قيمة حرجة، ومسار الاعتماد المقفل (`POST /lab/orders/:id/verify`) مع منع التعديل الصامت بعد الاعتماد (`409`)، ومسار التعديل الرسمي الموقّع (`POST /lab/orders/:id/amend`)، وإلغاء الطلبات قبل التنفيذ (`POST /lab/orders/:id/cancel`)، ومسارات `GET/POST /lab/critical-notifications(/:id/read-back)` و`POST /lab/catalog/tests` و`GET/POST /lab/catalog/reference-ranges`.
  - تحديث `LabSpecimenService.verifyCultureReport` لتثبيت حقول التحقق (`isVerified`/`verifiedById`/`verifiedAt`/`verificationHash`) وتشغيل `enqueueConsumptionIntent` عند اعتماد تقرير المزرعة.
  - استبدال `req: any` بـ `AuthenticatedRequest` في `LabsController`، مما خفّض دين ESLint التاريخي للخادم بـ **24 خطأً** (`4305` → `4281`).

### 2.4 استبدال `window.prompt()` بواجهة سريرية احترافية (`LabResultEntryModal`)
- **`client/src/components/labs/LabResultEntryModal.tsx` و`LabResultEntryModal.test.tsx` و`client/src/pages/LabWorklistPage.tsx`:**
  - إزالة جميع استدعاءات `window.prompt()` الثلاثة من شاشة قائمة عمل المختبر.
  - توفير نافذة موحّدة لإدخال لوحات البراميترات المتعددة مع إبراز القيم الحرجة (`LL`/`HH`) وغير الطبيعية (`L`/`H`)، وزر الاعتماد المقفل ببصمة `SHA-256`، ونموذج التعديل الموقّع (مع سبب إلزامي وعرض سجل التعديلات `LabResultAmendment`)، وقسم توثيق إبلاغ القيم الحرجة `JCI IPSG.2 Read-Back` مع متابعة مهلة الـ 30 دقيقة.

### 2.5 إعادة هندسة خط أنابيب GitHub Actions (`.github/workflows/deploy.yml`)
- **المشكلة المرصودة:** تشغيل ~43 ملف E2E تسلسليًا داخل وظيفة `test` واحدة كان يستغرق `15–20` دقيقة ويؤدي لإلغاء التشغيل تلقائيًا عند بلوغ `timeout-minutes: 20`، دون إظهار ملخّص واضح للاختبار الفاشل في واجهة Actions.
- **الحل المنفّذ:**
  1. فصل الوظيفة إلى وظيفتين متوازيتين:
     - **`static-and-unit`:** الفحوص الساكنة (`check-i18n`، `verify-tenant-isolation`، `generate-audit-report --check`) + فحص وبناء واختبارات وحدة الخادم والعميل (~3 دقائق).
     - **`e2e` بمصفوفة 4 شرائح متوازية (`shard: [1, 2, 3, 4]`):** كل شريحة تمتلك حاوية PostgreSQL 15 وRedis 7 مستقلة وتنفّذ `npm run test:e2e -- --runInBand --shard=${{ matrix.shard }}/4` (~4–5 دقائق إجمالًا).
  2. إضافة خطوة `Publish E2E Failure Summary` (`if: failure()`) لاستخراج أسطر `FAIL` و`●` و`expect(` مباشرة إلى `$GITHUB_STEP_SUMMARY`.
  3. ربط وظيفة النشر `build-and-push` بنجاح `needs: [static-and-unit, e2e]`.

---

## 3. أدلة التحقق المنفّذة (بعد آخر تعديل)

| البوابة / الاختبار | النتيجة | التفصيل / الدليل |
|---|---|---|
| ترحيلات Prisma (`migrate reset --force`) | **ناجح** | تطبيق **`73/73`** ترحيلًا من الصفر على PostgreSQL المعزول (`127.0.0.1:15432`) |
| تطابق المخطط (`migrate diff --exit-code`) | **ناجح** | `No difference detected.` |
| فحوص CI الساكنة (`i18n`, `tenant-isolation`, `ABAC`) | **ناجح** | `Client: 7401` / `Mobile: 40` متوازنة؛ `105` متحكمًا معزولًا؛ `audit:check` **`105/105`** (`93/93` فعليًا، `100%`) |
| `server`: `lint:ci` | **ناجح** | `0` أخطاء جديدة، وانخفاض الدين التاريخي بـ **24 خطأً** (`4305` → **`4281`** عبر `660` ملفًا، `584` تحذيرًا) |
| `server`: `typecheck` & `build` | **ناجح** | `0` أخطاء |
| `server`: اختبارات الوحدة (`jest --runInBand`) | **ناجح** | **`100/100`** مجموعة = **`793/793`** اختبارًا (`0` متخطى، `43.864 s`)، تشمل `lab-modernization.service.spec.ts` و`lab-orders.controller.spec.ts` و`lab-orders.service.spec.ts` |
| `client`: `lint` | **ناجح** | `0` أخطاء (`88` تحذيرًا تاريخيًا) |
| `client`: `Vitest` (`--run`) | **ناجح** | **`50/50`** ملفًا = **`271/271`** اختبارًا (`29.72 s`)، تشمل `LabResultEntryModal.test.tsx` (`2/2`) |
| `client`: بناء الإنتاج (`vite build`) | **ناجح** | `✓ built in 13.19s` (`PWA` precache `246` إدخالًا) |
| E2E معزول: `lab-modernization-p0.e2e-spec.ts` | **ناجح** | `1/1` (`11.141 s`) — عزل المنشآت، النطاقات المرجعية، القيمة الحرجة وRead-Back، الاعتماد المقفل، التعديل الموقّع، وبوابة دفع OPD (`scratch/phase5-batch19-20261124/e2e-lab-mod.log`) |
| E2E معزول: `full-cycle.e2e-spec.ts` | **ناجح** | `6/6` (`9.653 s`) — التحقق من رفض إكمال تحليل OPD غير المدفوع (`409`) ثم الإكمال بعد السداد (`200`) (`scratch/phase5-batch19-20261124/e2e-full-cycle.log`) |
| E2E معزول: `lab-specimen-culture-cap02.e2e-spec.ts` | **ناجح** | `1/1` (`9.586 s`) (`scratch/phase5-batch19-20261124/e2e-cap02.log`) |
| E2E معزول: `blood-bank-cap04.e2e-spec.ts` | **ناجح** | `1/1` (`9.92 s`) (`scratch/phase5-batch19-20261124/e2e-cap04.log`) |

---

## 4. المتبقي المفتوح ضمن `CAP02`
- طباعة ملصقات باركود العينات بصيغة `ZPL` / طابعة حرارية ميدانية.
- توجيه أجهزة `ASTM` متعددة المحلّلات وحفظ نتائج ضبط الجودة الداخلي (`Westgard QC / Levey-Jennings`).
- ربط إلغاء الطلبات المدفوعة بدورة الإشعار الدائن/الاسترداد التلقائي عند الإلغاء بعد التحصيل.
- القبول السريري الميداني (`UAT01`) بالتعاون مع فريق المختبر والتمريض.
