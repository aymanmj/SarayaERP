# الإغلاق المالي لإشعارات التحويل الإلكتروني (`ERA`) والربط الذري بدفتر التحصيل والأستاذ — 2026-11-23

**المسار والمجال:** [`FLOW03`](REMEDIATION_REGISTER_2026-11-07_AR.md#L154) — المرحلة (أ-3) من [خطة البوابة الوطنية الليبية للتأمين الصحي والمقاصة](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md)  
**الترحيل المعتمد:** `#61` — [`20261123060000_era_financial_reconciliation`](../server/prisma/migrations/20261123060000_era_financial_reconciliation/migration.sql)

---

## 1. المسار المنفذ والضوابط المالية والمعمارية

1. **نموذج البيانات وحماية قاعدة البيانات (الترحيل `#61`):**
   - تحديث [`schema.prisma`](../server/prisma/schema.prisma) والترحيل `#61` لإضافة:
     - حقل `ERATransaction.postingRequestKey` بفهرس فريد (`ERATransaction_postingRequestKey_key`) لمنع إعادة ترحيل نفس إشعار `ERA` تحت مفاتيح مختلفة وضمان إعادة المحاولة الآمنة (idempotency).
     - فهرس `ERATransaction_hospitalId_bankReference_idx` لتسريع المطابقة البنكية بالمنشأة.
     - حقل `ERALineItem.receiptId` بعلاقة وفهرس فريد (`ERALineItem_receiptId_key`) نحو `ClaimReceipt(id)` مع قيد `ON DELETE RESTRICT ON UPDATE CASCADE` لربط كل بند محصّل بإيصاله المالي الفعلي.
   - إضافة مشغلين على PostgreSQL:
     - **`era_transaction_reconciled_guard`** (`guard_era_transaction_reconciled()`): يمنع `UPDATE` أو `DELETE` على أي صف `ERATransaction` حالته `RECONCILED`، كما يلزم لانتقال التحصيل المدفوع (`totalPaid > 0`) إلى `RECONCILED` وجود `postingRequestKey`، و`bankReference` (بطول لا يقل عن 5 أحرف)، و`reconciledById`.
     - **`era_line_item_reconciled_guard`** (`guard_era_line_item_reconciled()`): يمنع تعديل أو حذف أي سطر `ERALineItem` تابع لملف `ERATransaction` حالته `RECONCILED`.

2. **الخدمة الخادمة ذرية الترحيل ([`EraProcessingService`](../server/src/rcm/era-processing.service.ts)):**
   - **`processEraPayload`:** التحقق من المنشأة ونشاط شركة التأمين، وقراءة المبالغ عبر `parseNonNegativeMoney` ومكتبة [`Money`](../server/src/common/utils/money.util.ts) (`decimal.js` + `ROUND_HALF_EVEN`) مع تصدير `MONEY_INPUT_PATTERN` لضمان دقة ثلاث منازل عشرية دون `Number`/`parseFloat` غير المنضبط، وحفظ حالة `DISCREPANCY` عند عدم تطابق `totalPaid` مع مجموع أسطر البنود وإعادة محاولة مطابقة لنفس `eraNumber` عند تطابق المزود والإجمالي والعدد (أو `409 Conflict` عند الاختلاف/المنشأة الأخرى).
   - **`listEras` و`getEraById`:** استعراض إشعارات `ERA` والبنود مع العزل الصارم بـ `hospitalId`.
   - **`postEraFinancialSettlement`:** المعالجة المالية الذرية الكاملة داخل `prisma.$transaction`:
     - فرض `UUID v4` للـ `requestId` وتأكيد صريح (`confirmed === true`) ومرجع بنكي لا يقل عن 5 أحرف (`bankReference`).
     - اكتساب قفل المعاملات الاستشاري `pg_advisory_xact_lock(27007, hospitalId)` والتحقق من صلاحية المستخدم النشط وقفل سطر `ERATransaction` بـ `FOR UPDATE`.
     - معالجة إعادة المحاولة المتطابقة (`RECONCILED` بنفس `postingRequestKey` و`bankReference` و`reconciledById`) وإعادة `409 Conflict` عند أي تعارض.
     - التحقق من عدم وجود أسطر غير مطابقة (`!claimId` أو `UNMATCHED`) أو مكررة لنفس المطالبة، ومطابقة `Money.sumDecimal` لمدفوعات البنود مع `era.totalPaid`، ثم فرز البنود حسب `claimId` منعًا للجمود.
     - لكل سطر مدفوع (`Money.isPositive(line.paidAmount)`): توليد `lineRequestId` حتمي (`deterministicUuidV4`)، واستدعاء [`collectClaim`](../server/src/rcm/claim-receipt.ts) لإنشاء `ClaimReceipt` وتحديث `Claim` و`Invoice` وترحيل القيد المحاسبي المعتمد (مدين البنك/الخزينة `101100` — دائن ذمم التأمين `120200`)، وربط `ERALineItem.receiptId` بالإيصال المنشأ.
     - لكل سطر مرفوض صفري (`Money.isZero(line.paidAmount)` و`DENIED`/`denialCode`): قفل الفاتورة بـ `lockFinancialInvoice` وقفل المطالبة والتحقق من حالتها وصفرية صافي التحصيل (`claimCollectionBalance`) ثم تحديث `Claim` و`Invoice.claimStatus` إلى `REJECTED` وتدوين `ClaimHistory`.
     - اعتماد `ERATransaction` إلى `RECONCILED` وتدوين تدقيق `AuditLog` متسلسل (`appendChainedAuditInTransaction`) بالحدث `POST_ERA_FINANCIAL_RECONCILIATION`.
   - **حفظ حارس `RV12` (`reconcileEra`):** إبقاء المسار القديم المحمي رافضًا أي تسوية مالية يدوية لـ `ERA` دون إيصالات تحصيل معتمدة.

3. **واجهة برمجة التطبيقات ([`ClaimController`](../server/src/rcm/claim.controller.ts)):**
   - مسارات محمية بـ `JwtAuthGuard` و`PermissionsGuard` (`claims:read` / `claims:update`) مع مزخرفات `class-validator` و`class-transformer` متوافقة مع `ValidationPipe({ whitelist: true, transform: true })`:
     - `GET /rcm/claims/era` و`GET /rcm/claims/era/:id`
     - `POST /rcm/claims/era` (`ProcessEraPayloadDto` و`EraLineItemInputDto` مع تحويل وقبول الأرقام والنصوص المالية حتى 3 منازل عشريّة)
     - `POST /rcm/claims/era/:id/post` (`PostEraFinancialDto`)

4. **الواجهة والترجمات:**
   - إنشاء [`EraReconciliationDialog.tsx`](../client/src/pages/EraReconciliationDialog.tsx) وربطها من [`InsuranceClaimsPage.tsx`](../client/src/pages/InsuranceClaimsPage.tsx) بعرض بنود `ERA` وأرقام الإيصالات الناتجة، وتحذير البنود غير المطابقة، واستخدام `useIdempotentPost` per-card وإدخال المرجع البنكي والتأكيد الصريح، مع ترجمات `insuranceClaims.era.*` في [`ar.json`](../client/src/locales/ar.json) و[`en.json`](../client/src/locales/en.json).

---

## 2. أدلة التحقق المنفذة بعد آخر تعديل برمجي

> التمييز الصدقي: جميع النتائج التالية من تشغيلات فعلية أُجريت بعد آخر تعديل برمجي في الدفعة 4، مع التمييز الصريح بين الاختبارات الآلية والفحوص الساكنة والمجموعات المتخطاة لمتطلبات البيئة والقبول البشري.

- **مواءمة المخطط (`#61`):**
  - طُبّق الترحيل `#61` على Docker PostgreSQL المعزول (`127.0.0.1:15432`)، واجتاز `npx prisma migrate diff --exit-code` بنتيجة `No difference detected.` (`drift = 0`).
- **تغطية الأمان والمنشأة (`ABAC` / `Tenant`):**
  - `node generate-audit-report.cjs --check`: **`Total: 100 | ABAC: 100 (100%) | Tenant: 100 (100%) | Effective (non-exempt): 88/88 (100%)`**.
- **الفحوص الساكنة ووحدة الخادم (`D:\SarayaERP\server`):**
  - `npm run typecheck`: نجاح (`0`).
  - `npm run build`: نجاح (`0`).
  - `npm run lint:ci`: نجاح دون أخطاء جديدة (`ESLint: 616 files, 4387 existing errors, 579 warnings`).
  - `npm test -- --runInBand`: اجتياز **`88/88` مجموعة و`758/758` اختبار وحدة** (`0` متخطى، `0` فاشل، `41.06 s`).
- **فحوص العميل (`D:\SarayaERP\client`):**
  - `npx vitest run`: اجتياز **`43/43` ملفًا و`253/253` اختبارًا** (`0` متخطى، منها **`13/13`** في [`InsuranceClaimsPage.test.tsx`](../client/src/pages/InsuranceClaimsPage.test.tsx) تشمل ترحيل `ERA` من `EraReconciliationDialog`).
  - `npm run lint`: **`0` أخطاء و`88` تحذيرًا تاريخيًا**.
  - `npm run build`: نجاح (`✓ built in 11.93s`).
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1`):**
  - **[`insurance-claims-rcm-integrity.e2e-spec.ts`](../server/test/e2e/insurance-claims-rcm-integrity.e2e-spec.ts):** اجتياز **`7/7`** اختبارات (`27.542 s`)، تغطي استقبال `ERA` بـ `POST /rcm/claims/era`، وعزل المنشأة (`404`/`[]`)، والترحيل المتزامن الآمن بـ `UUID v4` وإرجاع `409 Conflict` عند تغيير المعرف/المرجع، وإنشاء `ClaimReceipt` والربط بـ `ERALineItem.receiptId` والقيد المحاسبي وتحديث رفض المطالبة `CO-197` وتدقيق `POST_ERA_FINANCIAL_RECONCILIATION` وحظر التعديل/الحذف عبر مشغلات PostgreSQL، والارتداد الذري (`400`) عند فشل بند واحد.
  - **[`review-remediation.e2e-spec.ts`](../server/test/e2e/review-remediation.e2e-spec.ts):** اجتياز **`38/38`** اختبارًا (`39.662 s`)، بما فيها تثبيت بقاء حارس `RV12` على `reconcileEra`.
  - **الانحدار الشامل المعزول:** اجتياز **`32` من أصل `37` مجموعة (`553` من أصل `558` اختبارًا ناجحًا، `0` فاشل)** خلال `734.514 s`، مع تخطي `5` مجموعات مشروطة بأعلام البيئة الاختيارية (`nursing-load` و4 مجموعات أشعة `CAP13`).

---

## 3. المتبقي المفتوح ونقطة الاستئناف التالية

1. **مرفقات الموافقات المسبقة (`UI07`) — نقطة الاستئناف التالية:** رفع وحفظ واستعراض مرفقات طلبات الموافقة المسبقة (`PreAuth`) بضوابط المسار والنوع والحجم وعزل المنشأة ضمن مسار التأمينات الوطنية الليبية (مع إبقاء الإرسال إلى sandbox نفيس معلّقًا مؤقتًا).
2. **استكمال مراحل البوابة الوطنية للتأمين الصحي الليبية:** لوحة مراجعة الجهات الضامنة (`Payer Portal`) وإحكام بوليصة وتغطية السقوف بالربط مع السجل الوطني الموحد (`MPI`) وفق [خطة البوابة الوطنية](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md).
3. **القبول التشغيلي والمالي الميداني (`UAT01`)** لمطابقة إشعارات `ERA` مع كشوف المصرف الفعلية واعتمادها بشريًا.
