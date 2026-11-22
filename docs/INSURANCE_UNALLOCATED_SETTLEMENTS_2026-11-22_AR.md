# الحوالات الزائدة وغير الموزعة وتطبيق الأرصدة ورد الفائض — 2026-11-22

**المسار والمجال:** [`FLOW03`](REMEDIATION_REGISTER_2026-11-07_AR.md#L154) — المرحلة (أ-1) من [خطة البوابة الوطنية الليبية للتأمين الصحي والمقاصة](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md)  
**الترحيل المعتمد:** `#59` — [`20261122180000_insurance_unallocated_settlements`](../server/prisma/migrations/20261122180000_insurance_unallocated_settlements/migration.sql)

---

## 1. المسار المنفذ والعقود

1. **استقبال الحوالات غير الموزعة والزائدة (`POST /insurance/claims/settlements`):**
   - **حوالة غير موزعة بالكامل (`Pure Unallocated`):** قبول `invoiceIds: []` مع مطابقة `unallocatedAmount` لإجمالي مبلغ الحوالة الوارد في كشف البنك وتأكيد `confirmed: true` ومرجع بنكي لا يقل عن 5 أحرف.
   - **حوالة زائدة عن الفواتير المختارة (`Overpaid Settlement`):** الإبقاء على رفض `400 Bad Request` عند زيادة المبلغ الوارد عن المستحق دون موافقة صريحة، مع السماح بتسجيل الفرق كرصيد غير موزع عند تمرير `unallocatedAmount` صريح يساوي `amount - allocatedTotal` (وفي واجهة الويب عبر خيار `recordExcessAsUnallocated` غير المفعّل افتراضيًا).
   - **الحساب المحاسبي المعتمد:** أُضيف مفتاح النظام `SystemAccountKey.INSURANCE_UNALLOCATED_RECEIPTS` وحساب الالتزام الحفظي `200600` (`حوالات تأمين غير موزعة / فوائض شركات التأمين` من نوع `LIABILITY` تحت الخصوم المتداولة `200000` في [`accounting.service.ts`](../server/src/accounting/accounting.service.ts)):
     - عند قيد الاستلام: **مدين** البنك (`BANK_MAIN` `101100`) بإجمالي الحوالة، و**دائن** حسابات ذمم التأمين الأصلية لكل فاتورة مخصصة بمبلغ تخصيصها (إن وجد)، و**دائن** حساب الالتزام `200600` (`INSURANCE_UNALLOCATED_RECEIPTS`) بمبلغ `unallocatedAmount`.
     - تستمر عدم القابلية للإلغاء المباشر على قيد الاستلام عبر محفّز `block_settled_insurance_reversal`.

2. **استعراض الحوالات ذات الرصيد غير الموزع (`GET /insurance/claims/settlements`):**
   - ترجع قائمة التسويات مع ملخص دقيق للرصيد غير الموزع (`unallocatedAmount`، `appliedUnallocated`، `refundedUnallocated`، `pendingRefundUnallocated`، و`availableUnallocated`) عبر [`listInsuranceSettlements`](../server/src/insurance/insurance-settlement.ts#L275-L318) و[`unallocatedSummary`](../server/src/insurance/insurance-settlement-balance.ts#L82-L111) بصلاحية `insurance:manage` وعزل صارم بالمنشأة (`hospitalId`).

3. **تطبيق رصيد غير موزع على فواتير/مطالبات لاحقة (`POST /insurance/claims/settlements/:settlementId/apply`):**
   - مُنفّذ في [`applyInsuranceSettlementCredit`](../server/src/insurance/insurance-settlement-application.ts):
     - يتحقق من معرف طلب `UUID v4` (`requestId`) لقابلية إعادة المحاولة الآمنة ومنع الازدواج (`409 Conflict` عند اختلاف الحمولة لنفس `requestId`).
     - يستخدم القفل الاستشاري `pg_advisory_xact_lock(27007, hospitalId)` وقفل صف `InsuranceSettlement ... FOR UPDATE` وقفل فواتير `lockFinancialInvoice`، ويتحقق من حساب `200600` ومطابقته للقيد الأصلي، ومن أن الرصيد المطلوب لا يتجاوز المتاح (`available = unallocatedAmount - applied - refunded - pendingRefund`).
     - ينشئ سجل `InsuranceSettlementApplication` وسطور `InsuranceSettlementAllocation` مرتبطة به (`applicationId != null`) ومؤمّنة بقيد `@@unique([applicationId, invoiceId])` (مع الإبقاء على الفهرس الجزئي الفريد `InsuranceSettlementAllocation_initial_settlement_invoice_key WHERE "applicationId" IS NULL` للتوزيعات الأولية للحوالة).
     - يرحّل القيد المحاسبي باستخدام [`Money`](../server/src/common/utils/money.util.ts): **مدين** حساب الالتزام `200600` بمبلغ التخصيص، و**دائن** حساب ذمة التأمين الأصلي (`originalReceivable.accountId`) لكل فاتورة مختارة؛ ثم يحدّث حالات الفواتير والمطالبات (`PARTIALLY_PAID` / `PAID`) ويدوّن سجل التدقيق المتسلسل `APPLY_INSURANCE_SETTLEMENT_UNALLOCATED`.

4. **رد الفائض غير الموزع برقابة 4 عيون (`Maker-Checker`):**
   - توسيع [`requestSettlementRefund`](../server/src/insurance/insurance-settlement-refund.ts#L139) و[`reviewSettlementRefund`](../server/src/insurance/insurance-settlement-refund.ts#L263) لقبول `unallocatedAmount` إما منفردًا (رد رصيد غير موزع دون فواتير) أو مختلطًا مع سطور `lines` لتخصيصات الفواتير.
   - يحجز طلب الرد المعلّق (`PENDING`) مبلغ `unallocatedAmount` فورًا من الرصيد المتاح لمنع التخصيص المتزامن على نفس الرصيد، وتُفرج عنه حالة `REJECT`، بينما عند `POST` (بموظف مراجع مختلف ومرجع تحويل بنكي مؤكد غير مستخدم) يُرحّل القيد المحاسبي **مدين** `200600` (وحسابات الذمم إن وجدت) و**دائن** حساب البنك `101100`.
   - يستمر التحقق من تطابق قيد التسوية الأصلي في `reviewSettlementRefund` على التخصيصات الأولية (`applicationId: null`) مع `unallocatedAmount`، مع الإبقاء على منع الرد أو العكس اليدوي للقيود.

5. **حماية قاعدة البيانات (PostgreSQL Triggers — الترحيل 59):**
   - دالة `reserved_unallocated_for_settlement(settlement_id)` ومشغل `guard_insurance_settlement_application` (منع `UPDATE`/`DELETE` والتحقق من عدم تجاوز المتاح ونطاق المنشأة والمستخدم).
   - تحديث `guard_insurance_settlement_refund` لحجز الفائض غير الموزع، وتحديث `verify_insurance_settlement` لاستثناء التخصيصات اللاحقة (`applicationId IS NOT NULL`) والتحقق من سطر الالتزام `200600`.
   - مشغل قيد مؤجّل (`DEFERRABLE INITIALLY DEFERRED`) جديد `verify_insurance_settlement_application` يتحقق في نهاية المعاملة من تطابق مجموع التخصيصات مع القيد وذمم الفواتير الأصلية، وتحديث `verify_insurance_settlement_refund` و`block_settled_insurance_reversal`.

6. **واجهة المستخدم (`InsuranceClaimsPage.tsx` و`InsuranceSettlementRefundDialog.tsx`):**
   - زر مستقل لتسجيل حوالة غير موزعة (`recordUnallocated`) دون اختيار فواتير، وخانة اختيار صريحة (`recordExcessAsUnallocated`) لتسجيل الفائض غير الموزع عند زيادة المبلغ عن إجمالي الفواتير المختارة.
   - شريط عرض الحوالات بأرصدة غير موزعة متاحة مع زر **تخصيص على المطالبات المحددة** (`useIdempotentPost`) وزر **رد الفائض / السجل** مع توحيد أزرار الرد على مستوى تسوية الحوالة داخل الجدول.
   - تحديث نافذة الرد [`InsuranceSettlementRefundDialog.tsx`](../client/src/pages/InsuranceSettlementRefundDialog.tsx) لعرض تفصيل غير الموزع (الأصلي، المطبّق، المردود، المتاح) وحقل إدخال مبلغ رد الفائض منفردًا أو مع تخصيصات الفواتير، مع مفاتيح الترجمة المتقابلة في [`ar.json`](../client/src/locales/ar.json) و[`en.json`](../client/src/locales/en.json).

---

## 2. أدلة التحقق المنفذة فعليًا

> تمييز الصدق الهندسي: جميع الأرقام أدناه ناتجة عن تشغيلات فعلية بعد التعديلات النهائية (وليس استنتاجًا سابقًا)، مع فصل الاختبارات الآلية عن الفحوص الساكنة والحزم المتخطاة والقبول الميداني البشري.

- **مواءمة المخطط وقاعدة الاختبار المعزولة:**
  - طُبّق الترحيل `#59` على Docker PostgreSQL المعزول (`127.0.0.1:15432`)، واجتاز `npx prisma migrate diff --exit-code` بنتيجة `No difference detected.` (`drift = 0`).
- **فحص التغطية والرقابة (`ABAC` / `Tenant`):**
  - اجتاز `node generate-audit-report.cjs --check` بنسبة `100/100 (100%)` و`88/88 (100%)` فعليًا.
- **التحقق الساكن وبناء ووحدة الخادم (`D:\SarayaERP\server`):**
  - `npm run typecheck`: نجاح (`0`).
  - `npm run build`: نجاح (`0`).
  - `npm run lint:ci`: نجاح دون أخطاء جديدة (`615` ملفًا، `4394` خطأً تاريخيًا و`579` تحذيرًا دون رفع خط الأساس).
  - `npm test -- --runInBand`: اجتياز **`88/88` مجموعة و`758/758` اختبار وحدة** (`0` متخطى، `0` فاشل)، شاملة إضافة اختبارات استعادة/تفريغ `JwtStrategy.onModuleDestroy` في [`jwt.strategy.spec.ts`](../server/src/auth/jwt.strategy.spec.ts) (`15/15`).
- **التحقق الساكن وبناء ووحدة الواجهة (`D:\SarayaERP\client`):**
  - `npx vitest run` (بتوافق تخزين Node 26 عبر `client/src/test/setup.ts`): اجتياز **`43/43` ملفًا و`250/250` اختبارًا** (`0` متخطى)، منها `10/10` في [`InsuranceClaimsPage.test.tsx`](../client/src/pages/InsuranceClaimsPage.test.tsx) تغطي التسجيل الزائد بالخيار الصريح، والحوالة غير الموزعة المنفردة، وتخصيص الرصيد الجزئي، وطلب رد الفائض.
  - `npm run lint`: نجاح (`0` أخطاء، `88` تحذيرًا تاريخيًا).
  - `npm run build`: نجاح (`4163` وحدة، `13.40s`، خروج `0`).
- **اختبارات التكامل المعزولة على Docker PostgreSQL + Redis (`scripts/test-isolated-repair.ps1`):**
  - **المجموعة المركزة للتأمين (`insurance-claims-rcm-integrity.e2e-spec.ts`):** اجتياز `5/5` اختبارات (`1/1` مجموعة)، شاملة سيناريو كامل للحوالة الزائدة وغير الموزعة، رفض الفائض الضمني (`400`)، التخصيص اللاحق الجزئي والكامل و`requestId` (`idempotency` و`409`)، حجز الرد المعلّق والرفض ثم الاعتماد بـ 4 عيون، والرد المختلط، والعزل بين المنشآت، ومنع العكس اليدوي لجميع قيود الاستلام والتطبيق والرد.
  - **الانحدار الشامل المعزول (`scratch/phase3-batch2-20261122/full-e2e-final.log`):** اجتياز **`32` من أصل `37` مجموعة (`551` من أصل `556` اختبارًا ناجحًا، `0` فاشل)** خلال `684.25 s`، وتخطّي `5` مجموعات مشروطة بأعلام البيئة الاختيارية (`nursing-load` و4 مجموعات أشعة `radiology-cap13`/`mwl`/`viewer`/`archive`). كما استعادت `clma-websocket-integrity.e2e-spec.ts` اجتيازها الكامل (`19/19`) بعد إصلاح دورة حياة `JwtStrategy` متعدد النسخ ومواءمة `@prisma/client` إلى `6.19.3`.

---

## 3. المتبقي المفتوح ونقطة العودة التالية

1. **الشطب المعتمد للفروق التعاقدية والديون المعدومة (`Contractual Write-offs & Bad Debt`)** — **نقطة الاستئناف التالية في `FLOW03` (`المرحلة أ-2`)**:
   - معالجة الفرق غير المحصّل بين المطالبة والمعتمد من شركة التأمين عبر طلب ومراجعة 4 عيون (`Maker-Checker`) وقيد محاسبي منضبط بـ `Money` وتدقيق متسلسل ومحفزات قاعدة البيانات دون المساس بأمان الفوترة.
2. **إغلاق `ERA` المالي (`EraProcessingService`)** ثم **مرفقات الموافقات المسبقة (`UI07`)** و**مراحل البوابة الوطنية للمقاصة (`Payer Portal` و`MPI`)** وفق [خطة البوابة الوطنية](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md).
3. **القبول البشري والمحاسبي الميداني (`UAT01`)** لمطابقة الحساب `200600` ودورة الحوالات مع كشوف المصارف وإدارات الحسابات في التشغيل الفعلي.
