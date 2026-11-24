# تقرير المراجعة التقنية والسريرية الشاملة لقسمَي المختبر (المعمل) والأشعة وخطة التطوير المعتمدة — 2026-11-24

**الهدف:** تقييم دقيق مبني على الكود الفعلي ومقارنته بمعايير **Epic Beaker / Epic Radiant / Medinous / JCI (IPSG.1, IPSG.2, AOP) / CAP / CLIA** وسياسات **نظام السرايا الطبي** (عزل المنشآت `Multi-Tenancy`، ومكتبة الأموال `Money`، والتوقيع غير القابل للتعديل، والتدقيق المتسلسل `AuditLog`) لتحديد كل ما يحتاج إلى تحديث أو إصلاح أو تطوير في قسمَي **المختبر** و**الأشعة**.

---

## أولًا: نتائج مشتركة حاسمة بين القسمين (Cross-Cutting Findings)

1. **قيد `@unique` العالمي على رمز الفحص/الدراسة يكسر عزل المنشآت:**
   - في `server/prisma/schema.prisma` يوجد قيد فريد عالمي على `LabTest.code` (`@unique`، السطر `1366`) و`RadiologyStudy.code` (`@unique`، السطر `1544`) بالتزامن مع `@@unique([hospitalId, code])`؛ مما يمنع منشأتين مستقلتين من تعريف رموز قياسية مثل `CBC` أو `CXR`.
2. **غياب كامل لإدارة الكتالوج (`Catalog CRUD APIs & Admin UI`):**
   - لا توجد مسارات أو شاشات لإنشاء/تعديل/تعطيل `LabTest` و`LabTestParameter` و`LabCriticalValue` و`RadiologyStudy`؛ التعديل يعتمد حاليًا على سكربتات `seed` أو SQL مباشر.
3. **مخالفة سياسة مكتبة `Money` في فوترة طلبات المختبر والأشعة:**
   - حساب الإجماليات وتوزيع حصة التأمين والمريض في `server/src/labs/labs.service.ts` (`160, 209, 226-227`) و`server/src/lab-orders/lab-orders.service.ts` (`136, 194-201, 222-223`) و`server/src/radiology/radiology.service.ts` (`149, 191, 208-209`) لا يزال يعتمد على `Number` و`Math.round(... * 100) / 100` مع تثبيت `currency: 'LYD'` بدل استخدام `server/src/common/utils/money.util.ts`.
4. **غياب دورة إلغاء الطلبات وعكس حالة الدفع عند الاسترداد:**
   - لا يوجد مسار إلغاء (`cancel`) في متحكمات المختبر أو الأشعة، ولا توجد خطافات في `server/src/billing/` لعكس `Order.paymentStatus` أو سحب الطلب من قائمة عمل المختبر أو `DICOM MWL` عند استرداد/إشعار دائن للفاتورة.
5. **غياب التحقق من `doctorId` وحالة الزيارة `OPEN`:**
   - يقبل `labs.controller.ts:88` و`radiology.controller.ts:86` قيمة `dto.doctorId` دون التحقق من انتماء الطبيب للمنشأة أو نشاطه، كما لا يتحقق إنشاء الطلبات من أن `encounter.status === 'OPEN'` أو أن جميع معرّفات الفحوص المطلوبة صالحة داخل المنشأة.

---

## ثانيًا: مراجعة قسم المختبر / المعمل (Laboratory — `labs` / `lab-orders`)

### أ. نقاط القوة القائمة حاليًا
- **الدفعة 15 (`CAP02` — الترحيل `#69`):** سلسلة حيازة العينات بالباركود (`LabSpecimen` و`LabSpecimenEvent` append-only)، الرفض المرمّز وإعادة السحب المرتبطة، وتقارير المزارع والحساسية للمضادات (`LabCultureReport` و`LabCultureSensitivity` بقفل PostgreSQL وبصمة `SHA-256` وواجهة `LabSpecimenCultureModal`).
- **نية استهلاك المخزون الذرية:** استدعاء `enqueueConsumptionIntent` داخل المعاملة في `labs.service.ts:374-380`.
- **تكامل `CDSS` الأساسي:** إطلاق `lab.result_verified` مع حساب `eGFR` التلقائي للكرياتينين في `cdss.listener.ts:69-136`.
- **نواة `HL7 MLLP`:** إرسال `ORM^O01` واستقبال `ORU^R01` عبر `BullMQ`.

### ب. الثغرات والعيوب الجوهرية (المطلوب إصلاحها وتطويرها)
1. **[P0-SEC] ثغرة IDOR عابرة للمنشآت في `LabOrdersController`:**
   - `server/src/lab-orders/lab-orders.controller.ts:23-29` و`lab-orders.service.ts:31-59`: المسار `GET /encounters/:encounterId/lab-orders` لا يمرّر ولا يصفي بـ `hospitalId`، ويفتقد `@RequireFeature('LAB')` وDTO معتمدًا.
2. **[P0-SEC] منفذ `HL7 TCP 6661` غير مصادَق عليه وعابر للمنشآت:**
   - `server/src/integration/integration.service.ts:45-125`: مستمع TCP مفتوح بلا TLS أو قائمة IP مسموحة أو ربط منشأة، ويسقط إلى `findFirst({ where: { isActive: true } })` عبر جميع المنشآت أو `deviceId: 1` ثابتًا!
3. **[P0-FIN] ثلاث مسارات متضاربة لإنشاء طلبات المختبر مع خلل في فك حظر الدفع:**
   - `lab-orders.service.ts:176-201` يثبّت `insurancePolicyId = null` ويكتب `sourceId: order.id` بدل `labOrder.id`؛ بينما `CashierService.updateRelatedOrdersPaymentStatus` (`cashier.service.ts:1202-1214`) يبحث عن `labOrder.id`! كما أن `orders.service.ts:24-71` ينشئ طلب مختبر بلا معاملة وبلا رسوم.
4. **[P0-FIN/CLN] إمكانية تجاوز بوابة الدفع في التنفيذ والمزارع:**
   - `startProcessing` و`completeOrder` (`labs.service.ts:290-398`) و`collectSpecimen` و`verifyCultureReport` (`lab-specimen.service.ts`) لا تتحقق على مستوى الخادم من `order.paymentStatus` (`PAID`/`WAIVED`) أو `CANCELLED`.
5. **[P0-CLN] إطلاق الأحداث قبل تثبيت المعاملة ونقص خطافات الاستهلاك و`CDSS`:**
   - إطلاق `lab.result_verified` داخل `$transaction` (`labs.service.ts:384`)؛ وغياب `enqueueConsumptionIntent` و`lab.result_verified` عند اعتماد المزرعة في `verifyCultureReport` (`lab-specimen.service.ts:838-852`) وفي `hl7.consumer.ts:143-190` (الذي يعتمد نتائج الأجهزة تلقائيًا دون مراجعة فني المختبر ويكرر `LabOrderResult` عند إعادة المحاولة).
6. **[P0-UX/CLN] إدخال النتائج عبر `window.prompt()` وغياب الإدخال متعدد البراميترات والتحقق والتصحيح:**
   - `client/src/pages/LabWorklistPage.tsx:89-111` يستخدم 3 نوافذ `window.prompt()` متتالية لقيمة واحدة فقط؛ لا توجد شاشة إدخال لفحوص اللوحات متعددة البراميترات (`CBC`, `LFT`, `RFT`, `Electrolytes`)، كما أن `completeOrder` يكتب فوق النتائج المعتمدة مسبقًا بصمت دون `verifiedById`/`signatureHash` أو سجل تصحيح (`Amendment`).
   - `LabsTab.tsx:292-321` يتوقع `lo.results` لكن `listOrdersForEncounter` (`labs.service.ts:115-118`) لا يُدرج `results` أو `specimens` أو `cultureReports`.
7. **[P1-CLN] فجوات الجودة السريرية (CAP / CLIA / JCI IPSG.2):**
   - غياب النطاقات المرجعية حسب **العمر والجنس** (`cdss.service.ts:316` يحتوي `TODO` صريحًا و`LabCriticalValue` بلا `hospitalId`).
   - غياب **سجل إبلاغ القيم الحرجة وإعادة القراءة (`Critical Value Read-Back Log`)** ومؤقت التصعيد.
   - غياب **فحص التغير المفاجئ (`Delta Check`)** مقارنة بآخر نتيجة سابقة للمريض.
   - غياب **طباعة ملصقات الباركود الحرارية (`ZPL`)** وشريط مسح الباركود في `LabWorklistPage.tsx`، وعدم استكمال إظهار مسار حيازة العينة وتعديل تقارير `PRELIMINARY` (`reportId`) في `LabSpecimenCultureModal.tsx`.
   - خلل في `LabReportPrintPage.tsx`: يعرض `encounter.createdAt` بدل `specimen.collectedAt` ويفتقد جداول المزارع والحساسية والأعلام غير الطبيعية وتوقيع المعتمد.
8. **[P2] فجوات المؤسسية المتقدمة:** توجيه أجهزة متعددة حسب الفحص ودعم `ASTM E1381/E1394`، ضبط الجودة `Westgard/Levey-Jennings`، أولوية `STAT/URGENT` ومؤشرات `TAT`، ومحرك الاعتماد التلقائي (`Auto-Verification`).

---

## ثالثًا: مراجعة قسم الأشعة (Radiology — `radiology`)

### أ. نقاط القوة القائمة حاليًا
- **تجربة `CAP13` (الترحيلان `#57` و`#58`):** قفل التنفيذ الذري بـ `lockRadiologyExecution` (`radiology-release.ts`)، والتحقق الصارم من بيانات `DICOM` (`StudyInstanceUID`/`AccessionNumber`/`MRN`/`Modality`) في `radiology-pacs.service.ts`، ومزامنة قائمة عمل `MWL` الآمنة ضد الأعطال (`radiology-mwl.service.ts`)، ووكيل عارض `OHIF` مقيد النطاق بملف ارتباط `HttpOnly` قصير العمر وترويسات `CSP` وتدقيق متسلسل (`radiology-viewer.service.ts`).

### ب. الثغرات والعيوب الجوهرية (المطلوب إصلاحها وتطويرها)
1. **[P0-CLN] غياب التوقيع الإلكتروني وقفل عدم التعديل والملحقات للتقارير (فجوة `CAP07`):**
   - `RadiologyOrder` (`schema.prisma:1564-1580`) يخلو من `reportedById` و`signedById` و`signedAt` و`reportStatus` (`DRAFT|PRELIMINARY|FINAL|AMENDED`) و`signatureHash` وجدول `RadiologyReportAddendum`. إعادة استدعاء `PATCH /radiology/orders/:id/report` تكتب فوق التقرير المعتمد بصمت وبلا أثر!
2. **[P0-UX/CLN] كتابة تقرير الأشعة الكامل داخل `window.prompt()`:**
   - `client/src/pages/RadiologyWorklistPage.tsx:99-120` يجبر أخصائي الأشعة على كتابة التقرير الطبي الكامل داخل مربع `window.prompt()` بسطر واحد!
3. **[P0-CLN] غياب فحص السلامة المسبق للصبغة (`Contrast Allergy` / `eGFR` / الحمل):**
   - `RadiologyStudy` يفتقد حقول `requiresContrast` و`contrastType` (`IODINATED`/`GADOLINIUM`) و`ionizingRadiation`؛ وإنشاء الطلب في `radiology.service.ts` لا يتحقق من `PatientAllergy` ولا من `CDSSService.computePatientEGFR` (المتوفر أصلًا في النظام!) ولا من الحمل قبل طلب فحص بالصبغة أو أشعة مؤيّنة.
4. **[P0-CLN] غياب تنبيهات النتائج الحرجة وتوثيق `Read-Back` (JCI IPSG.2):**
   - لا يوجد مسار لتحديد النتائج الحرجة الطارئة (مثل النزيف الدماغي أو استرواح الصدر الضاغط أو الانصمام الرئوي) وإطلاق تنبيه فوري وتوثيق إبلاغ الطبيب المعالج وإعادة القراءة.
5. **[P1-CAP13] قيود المرحلة التجريبية في `PACS/MWL/OHIF`:**
   - `radiology-pacs.service.ts:16,187` يحصر الأنماط بـ `DX/CR` فقط ويرفض أي دراسة تتجاوز `128` صورة (مما يمنع ربط جميع فحوصات **الأشعة المقطعية `CT` والرنين المغناطيسي `MR`**!).
   - `radiology-mwl.service.ts:29-41` يعتمد على متغيرات بيئة لمستشفى واحد ومحطة واحدة بدل جدول محطات `RadiologyStation` متعدد المنشآت والأجهزة (`CT_1`, `MR_1`, `US_1`, `DX_1`)، ولا توجد أزرار في `RadiologyWorklistPage.tsx` لمزامنة `MWL` أو ربط الدراسة أو webhook ربط تلقائي عند `StableStudy`.
   - `radiology-viewer.controller.ts:81` يفرض `frame-ancestors 'none'` مما يمنع عرض عارض `OHIF` مدمجًا بشاشة مقسّمة بجانب محرر التقرير المنظم؛ و`radiology-viewer.service.ts:100-102` يحصر العرض في الطبيب الطالب/المعالج فقط ويحجب الاستشاريين المناوبين.
6. **[P1-BUG/UX] أخطاء واجهة وطباعة وكود ميت:**
   - تضارب رموز الأنماط في `RadiologyTab.tsx:58-66` (`X-RAY`/`MRI`/`ULTRASOUND` بدل `DX`/`MR`/`US`).
   - خلل حالة الفراغ في `RadiologyWorklistPage.tsx:236` (`items.length === 0` بدل `filtered.length === 0`).
   - طباعة `RAD-${data.id}` في `RadiologyReportPrintPage.tsx:141` بدل `dicomAccessionNumber` الحقيقي، مع خانة توقيع فارغة بلا اسم طبيب الأشعة.
   - وجود 143 سطرًا من الكود المعلّق الميت في `radiology.controller.ts:138-281`.
7. **[P2] فجوات المؤسسية المتقدمة (Radiant Parity):** قوالب التقارير المهيكلة والماكرو والتصنيفات المعيارية (`BI-RADS`/`TI-RADS`/`LI-RADS`)، وتتبع الجرعة الإشعاعية (`CTDIvol`/`DLP`/`DAP` عبر `DICOM RDSR`)، وجدولة غرف الأجهزة وسجل الفني وإعادة التصوير (`Repeat/Reject QC`)، ومقارنة الدراسات السابقة.

---

## رابعًا: خارطة التنفيذ المقترحة للدفعات القادمة
- **الدفعة 19 (`LAB-UPGRADE-P0`):** إغلاق IDOR `lab-orders` وتوحيد مسار طلبات المختبر على `Money` وإلغاء/عكس الدفع، وتحصين `HL7` وتفريغ نتائج الأجهزة إلى `PRELIMINARY`، واستبدال `window.prompt` بنافذة إدخال لوحات متعددة البراميترات مع التوقيع غير القابل للتعديل (`FINAL_VERIFIED`)، والنطاقات المرجعية حسب العمر والجنس، وتوثيق القيم الحرجة `Read-Back` (JCI IPSG.2)، وإصلاح `LabsTab` وتقرير الطباعة والكتالوج.
- **الدفعة 20 (`RAD-UPGRADE-P0/P1`):** التوقيع الإلكتروني غير القابل للتعديل لتقارير الأشعة والملحقات (`RadiologyReportAddendum`) بـ `SHA-256` ومحفّز PostgreSQL، واستبدال `window.prompt` بمحرر تقارير مهيكلة (`Indication/Technique/Findings/Impression`) + قوالب، وفحص السلامة المسبق للصبغة (`PatientAllergy` + `eGFR` + الحمل)، وتنبيهات النتائج الحرجة `Read-Back`، وفك قيود `DX/CR` والـ 128 صورة لدعم `CT/MR/US` مع جدول محطات `MWL` متعددة والعارض المدمج وإلغاء الطلبات المالي.
