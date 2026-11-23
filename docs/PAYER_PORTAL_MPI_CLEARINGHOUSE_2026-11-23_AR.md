# بوابة الجهات الضامنة والسقوف العابرة عبر MPI وغرفة المقاصة الليبية — 2026-11-23

**المسار والمجال:** [`FLOW03`](REMEDIATION_REGISTER_2026-11-07_AR.md#L154) — المرحلة الثالثة (الدفعة 6: المرحلتان ب وج) ضمن [خطة البوابة الوطنية الليبية للتأمين الصحي والمقاصة](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md)  
**الترحيل المعتمد:** `#63` — [`20261123140000_payer_portal_mpi_clearinghouse`](../server/prisma/migrations/20261123140000_payer_portal_mpi_clearinghouse/migration.sql)

---

## 1. نموذج البيانات والترحيل `#63`

1. **تحديث جدول `PreAuthorization` ([`schema.prisma`](../server/prisma/schema.prisma)):**
   - إضافة حقول المراجعة التأمينية والطبية للجهة الضامنة: `reviewedById` (`User`)، و`reviewedAt`، و`reviewRequestKey` الفريد (`PreAuthorization_reviewRequestKey_key`) لضمان عدم تكرار قرار البت.
2. **تحديث جدول `ClaimBatch` وإغلاق المقاصة الذري:**
   - إضافة الأعمدة: `clearingChannel` (افتراضي `'LOCAL_CLEARINGHOUSE'`)، و`submissionRequestKey` الفريد، و`adjudicationRequestKey` الفريد، و`adjudicatedById` (`User`)، و`adjudicatedAt`، و`eraTransactionId` الفريد (`ERATransaction`)، و`approvedAmount` (`DECIMAL(18,3)`)، و`rejectedClaimsCount` (افتراضي `0`).
   - **قيود التكامل (`CHECK`):**
     - `ClaimBatch_clearingChannel_check`: يحصر القناة في `('LOCAL_CLEARINGHOUSE', 'NPHIES')`.
     - `ClaimBatch_approvedAmount_check`: يشترط `("approvedAmount" IS NULL OR ("approvedAmount" >= 0 AND "approvedAmount" <= "totalAmount"))`.
   - **محفّز حماية الدفعات المغلقة (`claim_batch_closed_guard` / `guard_claim_batch_closed()`):**
     - يمنع حذف أي دفعة بحالة `SUBMITTED` أو `CLOSED` (`SQLSTATE 23514`).
     - يمنع أي تعديل على الدفعة بعد وصولها إلى حالة `CLOSED`.
     - يشترط قبل الانتقال إلى `CLOSED` توفر `adjudicationRequestKey` و`adjudicatedById` و`adjudicatedAt` و`eraTransactionId` معًا.

---

## 2. السقوف عبر MPI وبوابة الجهات الضامنة (`Payer Portal`)

1. **تجميع الرصيد الشبكي العابر للمستشفيات ([`national-payer-gateway.ts`](../server/src/insurance/national-payer-gateway.ts)):**
   - تقرأ الدالة `readNationalPatientCoverage` الرصيد المحلي via `readCoverageBalance`، وعند ارتباط المريض بسجل `GlobalPatient` (`globalPatientId != null`) تستعلم عبر استعلام PostgreSQL معلمي (`$queryRaw`) على `Patient` و`InsuranceCoverageBalance` و`InsurancePolicy` لتجنّب حقن/منع RLS العابر للمستشفيات في `prisma.extension.ts` دون كشف أي بيانات تعريفية شخصية (PII).
   - تُجمّع المبالغ عبر `Money.sumDecimal` و`Money.subtractDecimal` و`Money.decimalMax` لحساب الحقول: `mpiLinked`، و`globalPatientId`، و`linkedHospitalsCount`، و`networkUsedAmount`، و`otherHospitalsUsedAmount`، و`networkRemainingAmount`.
   - دُمج فحص `networkRemainingAmount` في [`InsuranceService.createPreAuth`](../server/src/insurance/insurance.service.ts) وفي [`reviewPayerPreAuth`](../server/src/insurance/national-payer-gateway.ts) لمنع اعتماد أو إنشاء طلبات موافقة تتجاوز السقف المتبقي على مستوى الشبكة الوطنية.

2. **صندوق وارد المراجعات وقرار البت ([`InsuranceController`](../server/src/insurance/insurance.controller.ts)):**
   - `GET /insurance/payer-portal/pre-auths` (`listPayerPreAuthInbox` بصلاحيتي `insurance:view` / `insurance:manage`): يعيد طلبات الموافقة مع المرفقات غير المسحوبة فالمسحوبة وبيانات التغطية الشبكية `mpiCoverage`.
   - `POST /insurance/payer-portal/pre-auths/:id/decision` (`reviewPayerPreAuth` عبر `PayerPreAuthDecisionDto` بصلاحية `insurance:manage`): يشترط `requestId` بصيغة `UUID v4`، ومبررات من `5–1000` حرف، و`authCode` عند `APPROVED`، مع قفل استشاري `pg_advisory_xact_lock(27009, hospitalId)` و`FOR UPDATE`، وتكرار عدم التكرار (`idempotent replay`) وإرجاع `409 Conflict` لأي قرار متعارض، وتقييد حدث `PAYER_REVIEW_PREAUTH` في التدقيق المتسلسل.

3. **كشف تكرار المطالبات العابر للمستشفيات ([`ClaimScrubberService`](../server/src/rcm/scrubber/claim-scrubber.service.ts)):**
   - إضافة قاعدة التحذير `CROSS_HOSPITAL_MPI_DUPLICATE` التي تتحقق باستعلام معلمي (`$queryRaw`) عبر `Claim`/`Invoice`/`Patient`/`Encounter` من عدم وجود مطالبة فعالة لنفس `globalPatientId` في منشأة أخرى خلال نفس اليوم التوقيتي (UTC) دون تسريب بيانات المريض من المنشأة الأخرى.

---

## 3. غرفة المقاصة الوطنية الليبية والتسوية الآلية via `ERA`

1. **إدارة الدفعات والإرسال والبت ([`BatchSubmissionService`](../server/src/rcm/batch-submission.service.ts) و[`ClaimController`](../server/src/rcm/claim.controller.ts)):**
   - نقاط HTTP في [`ClaimController`](../server/src/rcm/claim.controller.ts):
     - `GET /rcm/claims/batches` و`GET /rcm/claims/batches/:id` (`claims:read`).
     - `POST /rcm/claims/batches` (`CreateClaimBatchDto`): تجميع حتى `200` مطالبة بحالة `SCRUBBED` غير مرفقة بدفعة (مع استثناء وصفات الصرف الجزئي المفتوحة `PARTIALLY_COMPLETED`) وحساب الإجمالي بدقة `Money.sumDecimal` تحت قفل `pg_advisory_xact_lock(27008, hospitalId)`.
     - `POST /rcm/claims/batches/:id/submit` (`SubmitClaimBatchDto`): تعتمد القناة الافتراضية `LOCAL_CLEARINGHOUSE` وتمنع قناة `NPHIES` صراحةً (`400 Bad Request` التزامًا بتعليق نفيس المؤقت)، وتسند معرّفات `LY-CLH-<batchId>-<claimId>` وتُوثّق الحدث `SUBMIT_CLAIM_BATCH_CLEARINGHOUSE` مع دعم إعادة المحاولة بنفس `submissionRequestKey`.
     - `POST /rcm/claims/batches/:id/adjudicate` (`AdjudicateClaimBatchDto`): تستقبل مصفوفة القرارات على مستوى كل مطالبة وتتحقق من عدم تجاوز `claimedAmount` وإلزامية `denialCode` عند الصفر، ثم تُحدّث حالات المطالبات والفواتير وسجل `ClaimHistory`، وتولّد تلقائيًا إشعار `ERA-CLH-<batchId>` بحالة `PROCESSING`، وتُغلق الدفعة مع تقييد حدث `ADJUDICATE_CLAIM_BATCH_CLEARINGHOUSE`.
2. **التكامل مع الترحيل المالي للتحويل الإلكتروني ([`EraProcessingService`](../server/src/rcm/era-processing.service.ts)):**
   - تحديث `postEraFinancialSettlement` لمعالجة السطور المرفوضة مسبقًا ضمن دفعة مقاصة (`alreadyRejectedByBatch`) دون رفض الحالة عند مطابقة `denialCode` وخلو الرصيد المحصل، وإغلاق السطور المعتمدة ماليًا عبر `collectClaim` وقيود دفتر الأستاذ.
3. **واجهة المستخدم والترجمات:**
   - إنشاء [`PayerBatchClearingDialog.tsx`](../client/src/pages/PayerBatchClearingDialog.tsx) ودمجها في [`InsuranceClaimsPage.tsx`](../client/src/pages/InsuranceClaimsPage.tsx) لإدارة دورة إنشاء وإرسال والبت في دفعات المقاصة عبر `useIdempotentPost` و`Money.decimal(...)`.
   - تحديث [`PreAuthPage.tsx`](../client/src/pages/PreAuthPage.tsx) لإظهار الرصيد المتبقي والمستهلك في المستشفيات الأخرى عبر `MPI`، مع تحديث [`ar.json`](../client/src/locales/ar.json) و[`en.json`](../client/src/locales/en.json).

---

## 4. أدلة التحقق المنفذة بعد آخر تعديل برمجي

- **مواءمة المخطط (`#63`):** طُبّق الترحيل `#63` على PostgreSQL المعزول (`127.0.0.1:15432`)، واجتاز `npx prisma migrate diff --exit-code` بنتيجة `No difference detected.` (`drift = 0`).
- **تغطية الأمان (`ABAC` / `Tenant`):** `node generate-audit-report.cjs --check` بنسبة `Total: 100 | ABAC: 100 (100%) | Tenant: 100 (100%) | Effective (non-exempt): 88/88 (100%)`.
- **الخادم (`D:\SarayaERP\server`):**
  - `npm run typecheck`: نجاح (`0`).
  - `npm run build`: نجاح (`0`).
  - `npm run lint:ci`: دون أخطاء جديدة (`618` ملفًا، `4389` خطأً تاريخيًا، `580` تحذيرًا).
  - `npm test -- --runInBand`: اجتياز **`88/88` مجموعة و`759/759` اختبار وحدة** (`0` متخطى، `0` فاشل، `39.978 s`)، متضمّنًا اختبار `CROSS_HOSPITAL_MPI_DUPLICATE` في [`claim.service.spec.ts`](../server/src/rcm/claim.service.spec.ts).
- **العميل (`D:\SarayaERP\client`):**
  - `npx vitest run`: اجتياز **`43/43` ملفًا و`255/255` اختبارًا** (`0` متخطى، `22.21s`)، منها الاختبار الرابع عشر في [`InsuranceClaimsPage.test.tsx`](../client/src/pages/InsuranceClaimsPage.test.tsx).
  - `npm run lint`: **`0` أخطاء و`88` تحذيرًا تاريخيًا**.
  - `npm run build`: نجاح (`12.86s`).
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1`):**
  - **[`insurance-claims-rcm-integrity.e2e-spec.ts`](../server/test/e2e/insurance-claims-rcm-integrity.e2e-spec.ts):** اجتياز **`9/9`** اختبارات (`24.829 s` منفردًا، و`22.96 s` داخل الحزمة الكاملة) تغطي السقف الشبكي `MPI` ومنع تجاوز `PreAuth` (`400`)، ومرفقات `UI07` مع صندوق الجهة الضامنة (`409` عند التعارض)، وقاعدة `CROSS_HOSPITAL_MPI_DUPLICATE`، ودورة إنشاء/إرسال/بت الدفعة ومنع قناة `NPHIES` وحماية `claim_batch_closed_guard` والترحيل المالي لـ `ERA-CLH-*` والتدقيق المتسلسل.
  - **الانحدار الشامل المعزول (`scratch/phase3-batch6-20261123/full-e2e.log`):** اجتياز **`32` من أصل `37` مجموعة (`555` من أصل `560` اختبارًا ناجحًا، `0` فاشل)** خلال `704.929 s`، مع تخطّي `5` مجموعات مشروطة بأعلام البيئة (`nursing-load` و4 مجموعات أشعة `CAP13`).

---

## 5. المتبقي المفتوح ونقطة الاستئناف التالية

1. **المرحلة (د) — دفتر رسوم وعمولة المشغّل الوطني (`Gateway Clearing Fee Ledger`) والفوترة B2B واستيراد كشف التسوية البنكية:** **نقطة الاستئناف التالية** وفق [خطة البوابة الوطنية](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md)، يليها الاعتماد المالي والقانوني ومراجعة مصرف ليبيا المركزي قبل التشغيل الإنتاجي.
2. **أمان المرفقات والتشغيل الفعلي:** ربط فحص `ClamAV` وتشفير مجلد التخزين وقت السكون وسياسة النسخ الاحتياطي والاحتفاظ (من الدفعة 5).
3. **البنود المعلقة مؤقتًا:** تكامل `NPHIES` (`CAP13`) وتطبيق الموبايل (`CAP14`) و`CLN01` وفق قرارات 2026-11-22.
4. **القبول الميداني البشري (`UAT01`)** لمسارات الموافقات وبوابة الجهات الضامنة ومقاصة الدفعات والتسوية البنكية.
