# الشطب المعتمد للفروق التعاقدية والديون المعدومة في التأمين — 2026-11-22

**المسار والمجال:** [`FLOW03`](REMEDIATION_REGISTER_2026-11-07_AR.md#L154) — المرحلة (أ-2) من [خطة البوابة الوطنية الليبية للتأمين الصحي والمقاصة](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md)  
**الترحيل المعتمد:** `#60` — [`20261122220000_insurance_claim_writeoffs`](../server/prisma/migrations/20261122220000_insurance_claim_writeoffs/migration.sql)

---

## 1. المسار المنفذ والرقابة المحاسبية

1. **نموذج البيانات ودليل الحسابات المعتمد:**
   - إضافة مفتاح النظام `SystemAccountKey.INSURANCE_BAD_DEBT_EXPENSE` إلى [`schema.prisma`](../server/prisma/schema.prisma) مع استخدام مفتاح `SystemAccountKey.REVENUE_WRITE_OFF` القائم.
   - تعريف الحسابين الافتراضيين في [`accounting.service.ts`](../server/src/accounting/accounting.service.ts):
     - **`400800`** (`CONTRA_REVENUE` تحت `402000`): خصم / شطب تعاقدي لمطالبات التأمين (`REVENUE_WRITE_OFF` لتصنيف `CONTRACTUAL_ALLOWANCE`).
     - **`510900`** (`EXPENSE` تحت `510000`): مصروف ديون معدومة ومطالبات مرفوضة نهائيًا (`INSURANCE_BAD_DEBT_EXPENSE` لتصنيف `BAD_DEBT`).
   - إنشاء جدول `InsuranceClaimWriteOff` المرتبط بالفاتورة (`invoiceId`) وسطـر الذمة التأمينية الأصلي (`originalReceivableId`) وحساب الشطب (`writeOffAccountId`) والقيد (`postingEntryId`) وطالب/مراجع الشطب (`requestedById` / `reviewedById`).

2. **دورة العمل بـ 4 عيون (`Maker-Checker`):**
   - **استعراض سجل وأرصدة الشطب (`GET /insurance/claims/:invoiceId/write-offs`):** إرجاع تفصيل حصة التأمين الفعالة، وصافي التحصيل البنكي (`settledNet`)، والشطب المرحّل (`postedWriteOff`)، والمحجوز قيد المراجعة (`pendingWriteOff`)، والمتاح للشطب (`available`) باستخدام مكتبة [`Money`](../server/src/common/utils/money.util.ts) (`ROUND_HALF_EVEN`).
   - **تقديم طلب الشطب (`POST /insurance/claims/:invoiceId/write-offs`):** مُنفّذ في [`requestClaimWriteOff`](../server/src/insurance/insurance-claim-writeoff.ts):
     - يتطلب معرّف طلب `UUID v4` (`requestId`)، وتصنيفًا (`CONTRACTUAL_ALLOWANCE` أو `BAD_DEBT`)، ومبلغًا نصيًا موجبًا حتى ثلاث منازل عشرية، وسببًا واضحًا (`5–1000` حرفًا).
     - يعمل داخل قفل `pg_advisory_xact_lock(27007, hospitalId)` وقفل الفاتورة `lockFinancialInvoice`، ويرفض أي فاتورة مسحوبة أو ملغاة أو لها سجل `Claim` في `RCM` أو تسويات/إشعارات معلقة، ويتحقق من عدم تجاوز `available`، ويسجل التدقيق المتسلسل `REQUEST_INSURANCE_CLAIM_WRITEOFF`.
   - **الاعتماد أو الرفض المستقل (`POST /insurance/claims/:invoiceId/write-offs/:writeOffId/review`):** مُنفّذ في [`reviewClaimWriteOff`](../server/src/insurance/insurance-claim-writeoff.ts):
     - يرفض المراجعة الذاتية (`403 Forbidden` إذا طابق المراجعُ مقدمَ الطلب).
     - عند **`REJECT`**: يثبت القرار ويفك حجز المبلغ من `pendingWriteOff` مع تدوين التدقيق `REJECT_INSURANCE_CLAIM_WRITEOFF`.
     - عند **`POST`**: يرحّل قيد اليومية المتوازن (`insurance-claim-writeoff:${hospitalId}:${writeOff.id}`): **مدين** حساب `400800` أو `510900`، و**دائن** حساب ذمة التأمين الأصلي (`originalReceivable.accountId`)، ويحدّث `claimStatus` إلى `PAID` أو `PARTIALLY_PAID` (مع حالة الفاتورة `status` حسب صافي حصة المريض)، ويدوّن التدقيق المتسلسل `POST_INSURANCE_CLAIM_WRITEOFF`.

3. **تكامل الأرصدة وحماية قاعدة البيانات (الترحيل `#60`):**
   - **منع التسابق والحماية المتبادلة:** تحظر [`prepareSettlementAllocations`](../server/src/insurance/insurance-settlement-balance.ts)، و[`reviewSettlementRefund`](../server/src/insurance/insurance-settlement-refund.ts)، و[`recordClaimWithdrawal`](../server/src/insurance/claim-withdrawal.ts)، و[`updateClaimsStatus`](../server/src/insurance/insurance.service.ts#L780) تسوية أو رد أو سحب أو تغيير حالة مطالبة عليها طلب شطب معلق؛ كما تخصم [`prepareSettlementAllocations`](../server/src/insurance/insurance-settlement-balance.ts) و[`getClaims`](../server/src/insurance/insurance.service.ts#L576) الشطب المرحّل من `settlementOutstanding` ليُتاح تحصيل المتبقي بنكيًا بعد الشطب الجزئي دون عائق.
   - **محفزات PostgreSQL:** دوال `posted_insurance_writeoff_for_invoice`، و`reserved_insurance_writeoff_for_invoice`، و`expected_insurance_claim_status`، ومشغل الحماية `guard_insurance_claim_writeoff` (منع الحذف والتعديل بعد الحسم ومنع الاعتماد الذاتي)، والمشغل المؤجّل `verify_insurance_claim_writeoff` (`DEFERRABLE INITIALLY DEFERRED`)، وتحديث `verify_insurance_settlement` و`verify_insurance_settlement_application` و`protect_settled_insurance_invoice` و`block_settled_insurance_reversal`.

4. **واجهة المستخدم والترجمات:**
   - إنشاء نافذة [`InsuranceWriteOffDialog.tsx`](../client/src/pages/InsuranceWriteOffDialog.tsx) بآلية `useIdempotentPost` وعرض الرصيد المتاح وخيار تعبئة المتبقي وضوابط المراجعة المستقلة بـ 4 عيون، وربطها مع [`InsuranceClaimsPage.tsx`](../client/src/pages/InsuranceClaimsPage.tsx) لعرض إجمالي الشطب المرحّل وإتاحة الشطب ومتابعة السجل مع ترجمات [`ar.json`](../client/src/locales/ar.json) و[`en.json`](../client/src/locales/en.json).

---

## 2. أدلة التحقق المنفذة بعد التعديلات النهائية

> تمييز الصدق الهندسي: جميع الأرقام أدناه ناتجة عن تشغيلات فعلية بعد آخر تعديل برمجي، مع التمييز الصريح بين الاختبارات الآلية المنفذة والفحوص الساكنة والحزم المتخطاة والقبول الميداني البشري.

- **مواءمة المخطط (`#60`):**
  - طُبّق الترحيل `#60` على Docker PostgreSQL المعزول (`127.0.0.1:15432`)، واجتاز `npx prisma migrate diff --exit-code` بنتيجة `No difference detected.` (`drift = 0`).
- **فحص التغطية والرقابة (`ABAC` / `Tenant`):**
  - اجتاز `node generate-audit-report.cjs --check` بنسبة `100/100 (100%)` و`88/88 (100%)` فعليًا.
- **الفحوص الساكنة ووحدة الخادم (`D:\SarayaERP\server`):**
  - `npm run typecheck`: نجاح (`0`).
  - `npm run build`: نجاح (`0`).
  - `npm run lint:ci`: نجاح دون أخطاء جديدة (`616` ملفًا، `4394` خطأً تاريخيًا، `579` تحذيرًا).
  - `npm test -- --runInBand`: اجتياز **`88/88` مجموعة و`758/758` اختبار وحدة** (`0` متخطى، `0` فاشل).
- **الفحوص الساكنة ووحدة/واجهة العميل (`D:\SarayaERP\client`):**
  - `npx vitest run`: اجتياز **`43/43` ملفًا و`252/252` اختبارًا** (`0` متخطى)، منها **`12/12`** في [`InsuranceClaimsPage.test.tsx`](../client/src/pages/InsuranceClaimsPage.test.tsx) تغطي طلب الشطب التعاقدي واعتماده بـ 4 عيون.
  - `npm run lint`: نجاح (`0` أخطاء، `88` تحذيرًا تاريخيًا).
  - `npm run build`: نجاح (`12.46s`، خروج `0`).
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1`):**
  - **المجموعة المركزة للتأمين (`insurance-claims-rcm-integrity.e2e-spec.ts`):** اجتياز **`6/6`** اختبارات (`21.407 s`)، شاملةً الشطب التعاقدي `400800` بعد تسوية جزئية وتحول الحالة إلى `PAID`، وشطب الديون المعدومة `510900` بعد رفض/إعادة إرسال ثم تحصيل الرصيد البنكي المتبقي، ومنع التسوية/السحب أثناء التعليق وبعد الشطب، وإعادة المحاولة الآمنة، والعزل بين المنشآت، ومنع العكس اليدوي للقيود.
  - **الانحدار الشامل المعزول (`scratch/phase3-batch3-20261122/full-e2e.log`):** اجتياز **`32` من أصل `37` مجموعة (`552` من أصل `557` اختبارًا ناجحًا، `0` فاشل)** خلال `683.71 s`، وتخطّي `5` مجموعات مشروطة بأعلام البيئة الاختيارية (`nursing-load` و4 مجموعات أشعة).

---

## 3. المتبقي المفتوح ونقطة العودة التالية

1. **إغلاق `ERA` المالي (`EraProcessingService`)** — **نقطة الاستئناف التالية في `FLOW03` (`المرحلة أ-3`)**: ربط استلام إشعار التحويل الإلكتروني بترحيل التسويات/الفروق والقيود البنكية فعليًا بـ `Money` وتدقيق متسلسل.
2. **مرفقات الموافقات المسبقة (`UI07`)** ثم **بوابة الجهات الضامنة والسقوف عبر `MPI`** وفق [خطة البوابة الوطنية](LIBYA_NATIONAL_INSURANCE_GATEWAY_PLAN_2026-11-22_AR.md).
3. **القبول البشري والمحاسبي الميداني (`UAT01`)** لمطابقة حسابي الشطب (`400800` و`510900`) واعتماد سياسات التفويض والحدود المالية ميدانيًا.
