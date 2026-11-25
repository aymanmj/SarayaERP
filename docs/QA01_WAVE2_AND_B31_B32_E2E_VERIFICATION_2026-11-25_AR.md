# تقرير إغلاق الموجة الثانية لدين ESLint والتحقق الواقعي على PostgreSQL للدفعات 31–33 (2026-11-25)

## 1. ملخص تنفيذي
استكملت **الدفعة 33 (المرحلة السادسة)** من خطة التطوير والتحصين لمشروع **السرايا الطبي (`SarayaERP`)** مسارين متلازمين بعد عودة تشغيل **Docker Desktop (`29.9.3`)**:
1. **الموجة الثانية لتقليص دين `ESLint` (`QA01` — `Wave 2`):** تصفير جميع أخطاء `ESLint` الحية (**`439 -> 0`**) عبر **17 ملفًا** في ست وحدات تشغيلية ومالية وسريرية حيوية (`pharmacy`, `insurance`, `rcm`, `inventory`, `purchases`, `surgery`) دون المساس بعقود الـ API أو كسر أي اختبار، مع تشديد سقف `server/eslint-baseline.json` رسميًا عبر `node scripts/check-lint-baseline.cjs --update-baseline` لينخفض إجمالي الدين التاريخي في الخادم من **`3750` خطأً و`591` تحذيرًا** إلى **`3311` خطأً (`-439`) و`562` تحذيرًا (`-29`)** عبر `723` ملفًا، مع صفر أخطاء جديدة.
2. **التحقق التكاملي الفعلي على `PostgreSQL + Redis` المعزولين للدفعات 31 و32 و33:** ترقية 3 مجموعات تكامل لتغطية ميزات الدفعة 32 على قاعدة البيانات والقرص الفعلي (`SEC05` AES-256-GCM، و`CAP10` التسوية التلقائية `BILLED -> SETTLED`، و`CAP12` رفع وتنزيل وثائق الكادر المشفرة)، واجتياز **`11/11` مجموعة تكامل متتابعة = `195/195` اختبارًا (`0` فشل)**.
3. **اكتشاف وإصلاح خللين فعليين في كود الإنتاج أثناء التحقق الواقعي:**
   - **خلل تصادم القيود المحاسبية لسداد الموردين (`AccountingService.recordSupplierPaymentEntry`):** كشفه اختبار `CAP10` عندما رُفض سداد فاتورة الأمانة برمز `400 Bad Request` لأن مسار التوافق القديم (`sourceModule: INVENTORY` + `sourceId: pay.id`) كان يلتقط قيد فاتورة الشراء/المخزون ذي المعرّف الرقمي نفسه فيفشل في `validateEntryModification`. تم استبداله بمسار حتمي ثابت بـ `postingKey: "supplier-payment:<hospitalId>:<payId>"` ومصدر `SUPPLIER_PAYMENT` لمنع التصادم والازدواج.
   - **خلل تسلسل تنزيل الوثيقة (`StaffCredentialingController.downloadCredentialDocument`):** كشفه فحص سجل `CAP12` بعد ظهور استثناء `[ExceptionsHandler] TypeError: Converting circular structure to JSON` بسبب إرجاع `res.send(buffer)` مع `@Res({ passthrough: true })`. تم استبداله بـ `NestJS StreamableFile` مع إزالة `res.send(buffer)` وإعادة التحقق عبر PostgreSQL المعزول حتى اختفاء الخطأ تمامًا من السجلات.

---

## 2. تفاصيل تصفية دين `ESLint` — الموجة الثانية (`439 -> 0`)

| الوحدة | الملفات المنظّفة | الأخطاء المصححة | التعديل الهندسي المعتمد |
| :--- | :--- | :---: | :--- |
| `pharmacy` | `pharmacy.service.spec.ts` (129)، `pharmacy.controller.ts` (47)، `pharmacy.service.ts` (8) | `184` | كسر المرجع الدائري لـ `$transaction` في موك Jest مع الحفاظ على تساوي مرجع المعاملة، واستبدال `@Req() req: any` بـ `{ user: JwtPayload }` وتعريف نوع `CreateEncounterPrescriptionBody`، وتحديد `Prisma.StockTransactionWhereInput` و`Prisma.InputJsonValue`. |
| `rcm` | `claim.service.spec.ts` (73)، `denial-management.service.ts` (10)، `insurance-contract.service.ts` (4)، `era-processing.service.ts` (2) | `89` | فك حلقة `mockPrisma.$transaction`، وتنميط `Prisma.ClaimWhereInput` و`Prisma.InsuranceContractWhereInput` و`this.cls.get<number \| undefined>('hospitalId')`، وتنسيق قيم `Decimal` في `ERA` عبر `Money.toDbString`. |
| `purchases` | `purchases.controller.ts` (41)، `procurement.controller.ts` (20)، `procurement.service.spec.ts` (6) | `67` | اعتماد `AuthenticatedRequest` (`JwtPayload & { id?: number }`) و`CreatePRBody` وإصلاح توقيع `$transaction` وحذف استيراد `POStatus` غير المستخدم في الاختبار. |
| `insurance` | `insurance.service.ts` (52) | `52` | استبدال `data: any` و`where: any` بواجهات إدخال صريحة و`Prisma.PreAuthorizationWhereInput` و`Prisma.InvoiceWhereInput`. |
| `inventory` | `inventory.service.ts` (20)، `warehouse.controller.ts` (10)، `inventory-count.service.ts` (1)، `inventory.controller.ts` (1) | `32` | تنميط `updateUOM` و`tx: Prisma.TransactionClient` في `getNextSequence`، واعتماد `{ user: JwtPayload }` و`Parameters<WarehouseService[...]>` في `WarehouseController`، وتنميط مصفوفة اتجاهات الجرد وحذف استيراد `Patch` غير المستخدم. |
| `surgery` | `surgery.controller.ts` (9)، `surgery.service.ts` (6) | `15` | تنميط جسم `schedule` و`Prisma.SurgeryCaseWhereInput` و`Prisma.SurgeryCaseUncheckedUpdateInput`. |
| **الإجمالي** | **17 ملفًا (14 إنتاج + 3 اختبارات)** | **`439 -> 0`** | **تقليص خط الأساس: `3750 -> 3311` خطأً (`-439`) و`591 -> 562` تحذيرًا (`-29`)**. |

---

## 3. ترقية اختبارات التكامل للدفعة 32 والإصلاحات الميدانية المرافقة

### 3.1 `SEC05` — التشفير الساكن `AES-256-GCM` لمرفقات التأمين (`sec05-av-attachment-scanning.e2e-spec.ts`)
- التحقق على القرص الفعلي من وجود ترويسة التغليف `SRYENC1\0` عبر `isEncryptedAttachmentEnvelope(rawStored)` وعدم وجود النص الصريح `%PDF-1.4`.
- التحقق من مسار التنزيل `GET /insurance/pre-auth/:id/attachments/:attachmentId/download` وفك التشفير الشفاف المطابق بايت-ببايت للملف الأصلي.
- التحقق من العبث ببايت واحد في النص المشفر على القرص ورفض التنزيل بفشل مغلق (`409 ConflictException`).

### 3.2 `CAP10` — التسوية التلقائية لمستهلكات الأمانة وإصلاح قيد سداد المورد (`cap08-drg-billing-cap10-consignment-ap.e2e-spec.ts`)
- اختبار سداد جزئي للمورد (`1000` عبر `TRANSFER`) يبقي الفاتورة `PARTIALLY_PAID` وسجلات `ConsignmentConsumption` بحالة `BILLED` (`settledConsignmentsCount = 0`).
- اختبار السداد النهائي المكمل (`1500.668` عبر `TRANSFER`) الذي ينقل الفاتورة إلى `PAID` ويرقّي تلقائيًا سجلات `ConsignmentConsumption` المرتبطة من `BILLED` إلى `SETTLED` (`settledConsignmentsCount = 2`) مع تسجيل تدقيق متسلسل `CONSIGNMENT_CONSUMPTIONS_AUTO_SETTLED` مع منع التراجع بمشغل PostgreSQL.
- إصلاح الخلل الحرج المكتشف في `server/src/accounting/accounting.service.ts` (`recordSupplierPaymentEntry`): إزالة البحث التصادمي في `sourceModule: INVENTORY` واستخدام مفتاح الترحيل الحتمي `supplier-payment:<hospitalId>:<payId>`.

### 3.3 `CAP12` — رفع وتنزيل وثائق الكادر المؤمّن وإصلاح `StreamableFile` (`staff-credentialing-cap12.e2e-spec.ts`)
- التحقق من رفض ملف PDF مصاب بتوقيع `EICAR` برمز `422` وبقاء `documentRef = null` وتوثيق `SECURITY_MALWARE_BLOCKED` في `AuditLog`.
- التحقق من رفع ملف نظيف بمرجع `enc-v1:...` وتغليف `SRYENC1\0` مشفر على القرص دون `%PDF-1.4`.
- التحقق من عزل المستأجر العابر للمستشفيات (`404`) عند التنزيل، ومن ثم التنزيل الصحيح عبر `StreamableFile` مع صفر أخطاء `Converting circular structure to JSON` في سجل الخادم واكتمال سلسلة `STAFF_CREDENTIAL_DOCUMENT_UPLOADED` و`STAFF_CREDENTIAL_DOCUMENT_DOWNLOADED`.

---

## 4. سجل التحقق المنفذ (الاختبارات vs الفحوص الساكنة vs المفتوح)

### 4.1 الفحوص الساكنة واختبارات الوحدة (منفذة بعد آخر تعديل — 2026-11-25)
- **ESLint الوحدات الست + الاختبارات المعدلة:** `0` أخطاء (`npx.cmd eslint --quiet ...`).
- **بوابة `lint:ci` (`server/scripts/check-lint-baseline.cjs`):** ناجح عبر `723` ملفًا (**`3311` خطأً حياً و`562` تحذيرًا، صفر أخطاء جديدة**).
- **فحص الأنواع وبناء NestJS:** `npx.cmd tsc --noEmit` و`nest build` ناجحان (`exit 0`).
- **اختبارات وحدة الخادم (`npx.cmd jest --runInBand`):** **`114/114` مجموعة = `844/844` اختبارًا ناجحًا (`0` متخطى، `0` فاشل)** خلال `48.845 s`.
- **توازن الترجمة (`node scripts/check-i18n.js`):** العميل `7406` مفاتيح والهاتف `40` مفتاحًا متوازن بالكامل.
- **عزل المستأجرين وتغطية ABAC:** `verify-tenant-isolation.js` (`113` متحكمًا) و`audit:check` (**`113/113`**، **`101/101`** فعليًا = **`100%`**).

### 4.2 اختبارات التكامل على PostgreSQL وRedis المعزولين (`scripts/test-isolated-repair.ps1` — متتابعة على الترحيل `#82`)
أُجريت المجموعات الـ 11 بالتتابع الكامل داخل `scratch/phase6-batch33-20261125/` دون تزامن:

| # | المجموعة | المسار | النتيجة | الزمن | الغرض المغطى |
| :-: | :--- | :--- | :---: | :---: | :--- |
| 1 | `sec05-av` | `test/e2e/sec05-av-attachment-scanning.e2e-spec.ts` | **`1/1` PASS** | `12.236 s` | `ClamAV/EICAR` + تشفير `AES-256-GCM` على القرص + كشف العبث `409` (الدفعة 32) |
| 2 | `cap08-cap10` | `test/e2e/cap08-drg-billing-cap10-consignment-ap.e2e-spec.ts` | **`1/1` PASS** | `9.563 s` | فوترة `DRG` + تسوية أمانة المورد `BILLED -> SETTLED` + إصلاح `AccountingService` |
| 3 | `purchase-returns` | `test/e2e/purchase-returns.e2e-spec.ts` | **`33/33` PASS** | `46.215 s` | انحدار المشتريات والمرتجعات وسداد الموردين بعد إصلاح `AccountingService` |
| 4 | `cap12-cred` | `test/e2e/staff-credentialing-cap12.e2e-spec.ts` | **`1/1` PASS** | `11.685 s` | رفع/تنزيل وثائق التراخيص + `EICAR` + `AES-256-GCM` + `StreamableFile` بلا أخطاء |
| 5 | `hr-payroll` | `test/e2e/hr-payroll-integrity.e2e-spec.ts` | **`3/3` PASS** | `11.255 s` | انحدار الدفعة 31 على `hr` و`payroll` |
| 6 | `review-rem` | `test/e2e/review-remediation.e2e-spec.ts` | **`39/39` PASS** | `43.766 s` | انحدار الدفعة 31 (`accounting`/`billing`/`cashier`) ومصفوفة `RV01-RV13` |
| 7 | `sec03-iso` | `test/e2e/sec03-security-isolation-matrix.e2e-spec.ts` | **`1/1` PASS** | `9.506 s` | عزل المستأجرين وABAC والتدقيق الذري |
| 8 | `pharmacy` | `test/e2e/pharmacy-dispense-integrity.e2e-spec.ts` | **`93/93` PASS** | `88.157 s` | انحدار الموجة الثانية على وحدة `pharmacy` |
| 9 | `ins-rcm` | `test/e2e/insurance-claims-rcm-integrity.e2e-spec.ts` | **`11/11` PASS** | `33.802 s` | انحدار الموجة الثانية على وحدتي `insurance` و`rcm` |
| 10 | `purchases` | `test/e2e/direct-purchase-approval-integrity.e2e-spec.ts` | **`9/9` PASS** | `16.742 s` | انحدار الموجة الثانية على وحدتي `purchases` و`inventory` |
| 11 | `surgery` | `test/e2e/surgery-lifecycle-billing-integrity.e2e-spec.ts` | **`3/3` PASS** | `10.753 s` | انحدار الموجة الثانية على وحدة `surgery` |
| — | **الإجمالي** | **11 مجموعة تكامل PostgreSQL حقيقية** | **`195/195` PASS** | — | **`0` فاشل** |

### 4.3 ما لا يزال مفتوحًا بوضوح
- **الموجة الثالثة من `QA01` ESLint:** تصفية الدين التاريخي المتبقي (**`3311`** خطأً عبر بقية الوحدات الأقل خطورة والاختبارات القديمة) ومتابعة ترقيات الاعتماديات الرئيسية (`DEP01`).
- **القبول الميداني البشري (`UAT01`):** تشغيل حاوية `clamav:1.4_base` الفعلية، واختبار قارئات الباركود وأجهزة البصمة والتوقيع في الموقع، والاعتماد التنظيمي والمحاسبي والسريري النهائي.
