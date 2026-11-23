# تعدد العملات بدقة `DECIMAL(19,6)` والتسوية البنكية العامة (CAP09 — الدفعة 17، الترحيل `#71`)

**التاريخ:** 2026-11-24  
**النطاق:** `CAP09` / `FIN02` / `OPS02` / `OPS03` / `SEC03` / `QA01`  
**الترحيل:** `20261124080000_multi_currency_and_bank_reconciliation` (الترحيل رقم `#71`)

## 1. الأهداف المحاسبية والمعمارية
تأسيس دفتر عملات وأسعار صرف تاريخي غير قابل للتلاعب متسق مع **معمارية الدقة العشرية الثلاثية** المعتمدة في الترحيل `#66` (`DECIMAL(19,6)` لأسعار الصرف و`DECIMAL(18,3)` للأرصدة والقيود النهائية عبر مكتبة `Money` وتقريب `ROUND_HALF_EVEN`)، إلى جانب منظومة **تسوية بنكية عامة** متكاملة مع الأستاذ العام (`Account` / `AccountingEntry` / `AccountingEntryLine`) تشمل المطابقة التلقائية واليدوية، وترحيل قيود التسوية الذرية (عمولات بنكية / فروق عملة / حساب مقابل مخصص)، وإثبات تطابق الرصيد (`differenceAmount = 0.000`) والإغلاق النهائي برقابة 4 عيون، دون أي تداخل أو أثر سلبي على مسار تسوية كشوف مقاصة التأمين (`BankStatementLine` في الدفعة 7).

## 2. البنية التحتية وحماية قاعدة البيانات (الترحيل `#71`)
أُضيفت التحديثات التالية في `server/prisma/schema.prisma` وترحيل `server/prisma/migrations/20261124080000_multi_currency_and_bank_reconciliation/migration.sql`:
- **توسعة التعدادات النظامية:**
  - `AccountingSourceModule.BANK_RECONCILIATION`.
  - `SystemAccountKey.FX_GAIN_LOSS` (حساب `400950` في `seed.ts`) و`SystemAccountKey.BANK_CHARGES_EXPENSE` (حساب `500950` في `seed.ts`).
- **الجداول الخمسة الجديدة وحواجز PostgreSQL:**
  1. `Currency`: رمز `ISO 4217` (`^[A-Z]{3}$`)، عدد الخانات العشرية (`0..4`)، وفهرس فريد جزئي `Currency_one_base_per_hospital_idx` (`WHERE "isBase" = true`) يضمن وجود عملة أساسية واحدة فقط لكل منشأة.
  2. `ExchangeRate`: `rate` و`inverseRate` بدقة `DECIMAL(19,6)`، قيد `CHECK` لمنع تطابق العملتين وإلزام موجبية السعرين وتكامل الاعتماد بـ 4 عيون (`verifiedById <> createdById`)، ومحفّز `exchange_rate_guard` لمنع `DELETE` وتعديل الحقول المالية بعد الإنشاء والتحقق من انتماء العملتين للمنشأة نفسها.
  3. `BankAccount`: ربط `1:1` (`@unique`) بحساب أستاذ عام (`ASSET` فقط) وعملة محددة، مع محفّز `bank_account_guard` لمنع `DELETE` والتحقق من نوع `ASSET` وعزل المنشأة.
  4. `BankReconciliationSession`: جلسة تسوية لفترة كشف بنك محددة بأرصدة `DECIMAL(18,3)`، وقيد `CHECK` (`BankReconciliationSession_close_integrity_chk`) يفرض على مستوى قاعدة البيانات أن أي جلسة `CLOSED` يجب أن تكون بفرق صفري (`differenceAmount = 0`) وبمعتمد مختلف عن المُعد (`approvedById <> preparedById`)، ومحفّز `bank_reconciliation_session_guard` يمنع الحذف وأي تعديل بعد `CLOSED`.
  5. `TreasuryBankStatementItem`: بنود كشف البنك (بما يشمل الحركات بالعملة الأجنبية `foreignAmount` و`exchangeRateUsed` بدقة `DECIMAL(19,6)`)، مع `@unique` على `matchedEntryLineId` و`adjustmentEntryId` لمنع ازدواج مطابقة سطر قيد محاسبي، ومحفّز `treasury_statement_item_guard` لمنع التعديل أو الحذف داخل جلسة مغلقة والتحقق من انتماء سطر القيد المطابق لحساب البنك والمنشأة نفسيهما.

## 3. طبقة الخدمات والمسارات والواجهة
- **`CurrencyExchangeService`** (`server/src/accounting/currency-exchange.service.ts`): تسجيل العملات، وتسجيل أسعار الصرف مع الحساب الدقيق لـ `inverseRate` بدقة `6dp` عبر `Money`، والاعتماد برقابة 4 عيون، ومحرك الاستعلام والتحويل الفوري (`resolveEffectiveRate` و`convertAmount`) مع دعم السعر المباشر والعكسي و**التثليث عبر العملة الأساسية للمنشأة**.
- **`BankReconciliationService`** (`server/src/accounting/bank-reconciliation.service.ts`):
  - ربط الحسابات البنكية بدليل الحسابات (`ASSET` فقط).
  - إنشاء جلسات التسوية واحتساب الرصيد الدفتري (`bookBalanceAsOfEnd`) وإيداعات الطريق (`depositsInTransit`) والصكوك المعلقة (`outstandingChecks`) والرصيد المسوّى (`reconciledBalance = closingBalanceBank + depositsInTransit - outstandingChecks`) وفرق التسوية (`differenceAmount = reconciledBalance - bookBalanceAsOfEnd`) بالكامل عبر `Money`.
  - استيراد بنود كشف البنك مع تحويل تلقائي للحركات بالعملة الأجنبية عبر `CurrencyExchangeService`.
  - المطابقة التلقائية (`autoMatchStatementItems`) واليدوية (`manualMatchStatementItem`/`unmatchStatementItem`) وفق قاعدة الاتجاه (`CREDIT` كشف بنك ↔ `DEBIT` أصل بنك في الأستاذ العام، و`DEBIT` كشف بنك ↔ `CREDIT` أصل بنك).
  - ترحيل قيود التسوية الذرية (`postStatementAdjustment`) بـ `financialPeriod` ومفتاح `postingKey: bank-recon-adj:${hospitalId}:${item.id}` لعمولات البنك وفروق العملة أو حساب مقابل مخصص، وربط سطر البنك الجديد تلقائيًا بالبند.
  - التقديم للاعتماد (`PENDING_APPROVAL` بفرق صفري وصفر بنود غير مطابقة) ثم الاعتماد والإغلاق النهائي بـ 4 عيون (`CLOSED`) مع تدقيق `AuditLog` متسلسل وبث SIEM.
- **المتحكم والصلاحيات:** `TreasuryFxController` (`@Controller('accounting/treasury')` مسجل قبل `AccountingController` في `AccountingModule`) بصلاحيات `acc:treasury:view` و`acc:treasury:manage` و`acc:treasury:approve` (المضافة في `server/prisma/seed.ts`) و`@AuditInTransaction()` على جميع عمليات الكتابة.
- **الواجهة الأمامية:** `client/src/components/accounting/TreasuryReconciliationModal.tsx` المدمجة في `client/src/pages/AccountingEntriesPage.tsx` مع اختبارات `TreasuryReconciliationModal.test.tsx`.

## 4. أدلة التحقق والاختبارات المنفذة (بعد آخر تعديل)
- **الترحيلات والمخطط (`PostgreSQL` المعزول):**
  - `prisma migrate reset --force --skip-seed`: تطبيق **`71/71`** ترحيلًا من الصفر بنجاح.
  - `prisma migrate diff --exit-code`: **`No difference detected.`**.
- **تغطية ABAC والتفويض:** `node generate-audit-report.cjs --check` = **`104/104`** (`92/92` فعليًا، `100%`).
- **الخادم (`server`):**
  - `npm.cmd run lint:ci`: **`0` أخطاء جديدة** (`649` ملفًا، الدين التاريخي `4305` خطأً و`584` تحذيرًا دون رفع خط الأساس).
  - `npm.cmd run typecheck`: `0` أخطاء.
  - `npm.cmd run build`: `0` أخطاء.
  - `npm.cmd test -- --runInBand`: **`98/98` مجموعة = `788/788` اختبارًا ناجحًا** (`0` متخطى، `48.305 s`)، شاملة `currency-exchange.service.spec.ts` (`4/4`) و`bank-reconciliation.service.spec.ts` (`3/3`).
- **العميل (`client`):**
  - `npm.cmd run lint`: `0` أخطاء (`88` تحذيرًا تاريخيًا).
  - `npm.cmd test -- --run` (`Vitest`): **`48/48` ملفًا = `267/267` اختبارًا ناجحًا** (`28.93 s`)، شاملة `TreasuryReconciliationModal.test.tsx` (`2/2`).
  - `npm.cmd run build`: نجاح كامل خلال `13.31s` (`PWA` precache `246` عنصرًا).
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1` على الترحيل `#71`، السجلات في `scratch/phase5-batch17-20261124/`):**
  - `test/e2e/treasury-fx-reconciliation-cap09.e2e-spec.ts`: **`1/1`** (`11.69 s`) — يغطي تعدد العملات ومنع عملة أساسية ثانية، أسعار الصرف بـ 6 خانات عشرية ورقابة 4 عيون والتحويل المباشر والتثليث عبر `LYD` وحماية `DELETE`/`UPDATE` على `ExchangeRate`، والحساب البنكي المرتبط بـ `ASSET` فقط، ودورة التسوية الكاملة (استيراد كشف بنك بحركة دولارية وعمولة بنكية، مطابقة تلقائية، منع التقديم بفرق `-15.000`، ترحيل قيد العمولة والوصول لفرق `0.000`، منع الاعتماد الذاتي بـ `403`، عزل المنشآت بـ `404`، الإغلاق بـ 4 عيون، وحماية `CLOSED` في التطبيق وPostgreSQL، وسلسلة `AuditLog`).
  - `test/e2e/insurance-claims-rcm-integrity.e2e-spec.ts`: **`11/11`** (`30.174 s`).
  - `test/e2e/refunds-cash-control.e2e-spec.ts`: **`38/38`** (`66.411 s`).
  - **الإجمالي المركّز:** **`50/50`** (`3/3` مجموعات، `0` فاشل).

## 5. المتبقي المفتوح خارج نطاق هذه الدفعة
- ربط مزود تغذية تلقائي فعلي لنشرات أسعار صرف مصرف ليبيا المركزي أو المصارف التجارية (`API_FEED`) مع استيراد ملفات كشوف البنوك القياسية (`MT940` / `CAMT.053` / `CSV`).
- مهمة إعادة تقييم أرصدة الحسابات الأجنبية بنهاية الفترة (`Period-End FX Revaluation` غير المحققة) عند تفعيل فواتير الموردين الأجانب متعددة العملات.
- القبول المالي والميداني (`UAT01`) مع الإدارة المالية والمراجع الخارجي.
