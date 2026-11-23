# دورة عينات المختبر المتكاملة والمزارع والحساسية للمضادات الحيوية (`CAP02`) — 2026-11-24

**المعرفات المرتبطة في السجل الموحد:** `CAP02`، `OPS02`، `OPS03`، `SEC03`، `QA01`  
**الدفعة:** الدفعة 15 (المرحلة 5 — سلسلة حيازة العينات بالباركود، الرفض وإعادة السحب، وتقارير المزارع والحساسية `Culture & AST` المقفلة تشفيريًا)

---

## 1. ملخص النطاق المنفّذ

1. **نموذج البيانات ومحفّزات الحماية في PostgreSQL (الترحيل `#69`: `20261124040000_lab_specimen_lifecycle_and_culture_ast`):**
   - إنشاء جدول **`LabSpecimen`** لتتبع دورة العينة بالباركود الفريد على مستوى المنشأة (`@@unique([hospitalId, barcode])`)، ونوع العينة والوعاء وموضع السحب، وحالات الدورة (`COLLECTED` → `IN_TRANSIT` → `RECEIVED` → `IN_PROCESS` → `STORED` → `DISPOSED`، مع مسار الرفض `REJECTED` / `RECOLLECT_REQUESTED` وربط إعادة السحب `recollectionOfId`)، مع قيود `CHECK` ومحفّز `lab_specimen_guard` لمنع الحذف الفعلي أو تعديل الباركود/الطلب/المنشأة أو إعادة تنشيط عينة متلفة (`DISPOSED`).
   - إنشاء جدول **`LabSpecimenEvent`** كسجل غير قابل للتعديل (Append-Only) لسلسلة حيازة العينة (Chain of Custody) محمي بمحفّز `lab_specimen_event_immutable_guard`.
   - إنشاء جدولَي **`LabCultureReport`** و**`LabCultureSensitivity`** لتقارير المزارع الميكروبيولوجية واختبار الحساسية للمضادات الحيوية (`S` / `I` / `R` / `SDD` مع `MIC` وقطر الهالة ووسم المضادات المقيدة `isRestricted`) مع بصمة تحقق `verificationHash` (`SHA-256`) ومحفّزَي `lab_culture_report_guard` و`lab_culture_sensitivity_guard` لمنع ربط عينة مرفوضة أو تعديل التقرير أو جدول الحساسية بعد الاعتماد النهائي (`FINAL_VERIFIED`).
   - التحقق من الترحيلات: `prisma migrate reset --force --skip-seed` نجح بتطبيق الترحيلات الـ 69 من الصفر، و`prisma migrate diff --exit-code` أعاد **`No difference detected.`** (صفر انحراف).

2. **منطق الخادم والتدقيق الذري وفصل الصلاحيات (`server/src/labs/` و`server/prisma/seed.ts`):**
   - إنشاء [`LabSpecimenService`](file:///d:/SarayaERP/server/src/labs/lab-specimen.service.ts) و[`LabSpecimenController`](file:///d:/SarayaERP/server/src/labs/lab-specimen.controller.ts) بمسار `/lab/specimens` (مسجّل قبل `LabController` في `LabModule`):
     - `POST /lab/specimens/collect` (`lab:specimens:collect`/`labs:manage`): سحب العينة وتوليد باركود فريد أو قبول باركود ممسوح، مع دعم ربط إعادة السحب `recollectionOfId` بالعينة المرفوضة فقط.
     - `GET /lab/specimens/barcode/:barcode` و`GET /lab/specimens/order/:labOrderId` (`labs:view`/`lab:requests:view`): الاستعلام بالباركود أو بالطلب مع عزل المنشأة الكامل وسلسلة الأحداث.
     - `POST /lab/specimens/:id/receive` و`POST /lab/specimens/:id/reject` و`POST /lab/specimens/:id/status` (`lab:specimens:receive`/`labs:manage`): استلام العينة، ورفضها برمز قياسي (`HEMOLYZED`/`CLOTTED`/`CONTAMINATED`...) مع إصدار طلب إعادة سحب، وتشغيل/تخزين/إتلاف العينة وفق انتقالات صالحة فقط.
     - `POST /lab/specimens/cultures` (`lab:results:enter`/`labs:manage`): إدخال وتحديث تقارير المزارع والحساسية الأولية/المرحلية مع التحقق من اسم الميكروب وعدم تكرار المضادات الحيوية ومنع ربط العينة المرفوضة.
     - `POST /lab/specimens/cultures/:id/verify` (`lab:results:verify`): الاعتماد النهائي المستقل لتقرير المزرعة، وإلزام وجود جدول حساسية عند النمو الإيجابي، واحتساب بصمة `SHA-256` غير قابلة للإنكار، وإغلاق `LabOrder` و`Order` تلقائيًا بملخص الميكروب والمضادات الحساسة والمقاومة.
   - تفعيل `@AuditInTransaction()` وسلسلة `AuditLog` وبث SIEM على كافة عمليات الكتابة، وإضافة صلاحيات `labs:view` و`labs:manage` و`lab:specimens:collect` و`lab:specimens:receive` في `server/prisma/seed.ts`.

3. **واجهة المستخدم والاختبارات (`client/src/components/labs/LabSpecimenCultureModal.tsx` و`LabWorklistPage.tsx`):**
   - بناء نافذة `LabSpecimenCultureModal` بتبويبَي «العينات والباركود» (سحب، استلام، رفض مع إعادة سحب، وإعادة سحب بديلة) و«المزارع والحساسية (AST)» (إدخال الميكروب وجدول `S/I/R/SDD` و`MIC` والاعتماد النهائي المقفل ببصمة `SHA-256`)، وربطها بقائمة عمل المختبر في `LabWorklistPage.tsx`.
   - إنشاء اختبارات وحدة `lab-specimen.service.spec.ts` وواجهة `LabSpecimenCultureModal.test.tsx` وتكامل معزول `lab-specimen-culture-cap02.e2e-spec.ts`.

---

## 2. نتائج التحقق والأدلة المنفّذة

### أ. بوابات الخادم والعميل والتدقيق الساكن

| البوابة | النتيجة | التفاصيل |
|---|---|---|
| ترحيلات Prisma + Diff | **نجاح (`0` انحراف)** | `69/69` ترحيلًا من الصفر و`prisma migrate diff --exit-code` = `No difference detected.` |
| `node generate-audit-report.cjs --check` | **نجاح (`102/102`)** | `90/90` فعليًا (`100%` تغطية ABAC وعزل المنشآت) |
| الخادم: `npm.cmd run lint:ci` | **نجاح (0 أخطاء جديدة)** | `4305` خطأً تاريخيًا و`584` تحذيرًا عبر `637` ملفًا |
| الخادم: `npm.cmd run typecheck` | **نجاح (0 أخطاء)** | — |
| الخادم: `npm.cmd run build` | **نجاح (0 أخطاء)** | — |
| الخادم: `npm.cmd test -- --runInBand` | **نجاح (`95/95` مجموعة)** | **`779/779` اختبارًا ناجحًا**، `0` متخطى، خلال `50.309 s` |
| العميل: `npm.cmd run lint` | **نجاح (`0` أخطاء)** | `88` تحذيرًا تاريخيًا |
| العميل: `npm.cmd test -- --run` (Vitest) | **نجاح (`46/46` ملفًا)** | **`264/264` اختبارًا ناجحًا** خلال `28.82 s` |
| العميل: `npm.cmd run build` | **نجاح (`12.65 s`)** | `PWA` precache `246` عنصرًا |

### ب. اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1` على Docker PostgreSQL/Redis بـ 69 ترحيلًا)

السجلات محفوظة محليًا تحت `scratch/phase5-batch15-20261124/`:

| المجموعة | النتيجة | المدة |
|---|---|---|
| `test/e2e/lab-specimen-culture-cap02.e2e-spec.ts` | **`1/1` ناجح (دورة الباركود والرفض وإعادة السحب والمزرعة وAST وقفل PostgreSQL)** | `10.905 s` |
| `test/e2e/patient-governance-cap06.e2e-spec.ts` | **`1/1` ناجح** | `9.419 s` |
| `test/e2e/clinical-notes-signature.e2e-spec.ts` | **`1/1` ناجح** | `9.616 s` |
| **الإجمالي المركّز** | **`3/3` (`3/3` مجموعات، `0` فاشل)** | — |

---

## 3. المتبقي خارج نطاق هذه الدفعة

- طباعة ملصقات الباركود الحرارية (`ZPL` / طابعة ملصقات العينات)، والتكامل الثنائي مع أجهزة الميكروبيولوجيا الآلية (`VITEK` / `BACTEC` عبر `HL7 ORU/ORM`)، وتنبيهات قيم الذعر الحرجة (`Critical Values`) ومكافحة العدوى (`Antibiogram Surveillance`)، والقبول الميداني مع فريق المختبر (`UAT01`).
