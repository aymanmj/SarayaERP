# توثيق الدفعة التاسعة: توحيد الدقة المالية (`Money`) وإغلاق فجوات التقارير المحاسبية وإقفال السنة المالية (`FIN02` & `FLOW04`)

**تاريخ التنفيذ:** `2026-11-23`  
**الارتباط بالسجل الموحد:** `FIN02`، `FLOW04`، `QA01` في [REMEDIATION_REGISTER_2026-11-07_AR.md](file:///d:/SarayaERP/docs/REMEDIATION_REGISTER_2026-11-07_AR.md)  
**المرجع المعياري للسياسة المالية:** [MONEY_LIBRARY_COMPARISON_2026-11-06_AR.md](file:///d:/SarayaERP/docs/MONEY_LIBRARY_COMPARISON_2026-11-06_AR.md) و[money.util.ts](file:///d:/SarayaERP/server/src/common/utils/money.util.ts)

---

## 1. ملخص تنفيذي

استكملت هذه الدفعة ترحيل مسارات التقارير المالية، والأستاذ العام، وميزان المراجعة، والأرصدة الافتتاحية (اليدوية والتلقائية)، والقيود اليدوية، وإقفال السنة المالية، وقائمة الدخل، والميزانية العمومية، وتقرير أعمار ذمم المرضى، وعرض القيود في [accounting.service.ts](file:///d:/SarayaERP/server/src/accounting/accounting.service.ts) و[accounting.controller.ts](file:///d:/SarayaERP/server/src/accounting/accounting.controller.ts) إلى مكتبة `Money` (`ROUND_HALF_EVEN` بدقة 40 خانة عشرية داخلية و3 خانات عشرية للعملة الليبية `LYD`)، مع إغلاق 5 فجوات محاسبية جوهرية في إقفال السنة المالية وقائمة الدخل والميزانية العمومية وترحيل الأرصدة الافتتاحية بمراكز التكلفة.

---

## 2. الفجوات المحاسبية التي تم تشخيصها وإغلاقها

### 2.1 معالجة حسابات الإيراد العكسية (`CONTRA_REVENUE`) في إقفال السنة المالية (`closeFinancialYear`)
- **المشكلة السابقة:** حسابات الإيراد العكسية (`400200` خصومات مسموح بها، `400800` شطب تعاقدي وفروق تأمين، `400900` مردودات مبيعات) ذات طبيعة مدينة (`debit > credit`). في `closeFinancialYear`، عند حساب `balance = credit - debit` تكون القيمة سالبة، فكان الفرع `else` يضيف `Math.abs(balance)` إلى إجمالي المصروفات (`totalExpense`) بدلاً من خصمها من صافي الإيرادات (`totalRevenue`).
- **الإصلاح:**
  - حساب `netRevDec = Money.subtractDecimal(creditDec, debitDec)` وإضافته مباشرة إلى `totalRevenueDec = Money.addDecimal(totalRevenueDec, netRevDec)` بحيث تُخصم أرصدة `CONTRA_REVENUE` المدينة من إجمالي الإيرادات (تطابقاً تاماً مع قائمة الدخل `getIncomeStatement`).
  - إنشاء سطر إقفال دائن (`debit: '0.000', credit: Money.toDbString(netRevDec.abs())`) لتصفير حساب `CONTRA_REVENUE` وترحيل الصافي لكل مركز تكلفة إلى حساب الأرباح المحتجزة (`300200`).
  - قفل صف السنة المالية تشاؤمياً (`SELECT id FROM "FinancialYear" ... FOR UPDATE`) واستبعاد قيود الإقفال السابقة (`sourceModule: { not: AccountingSourceModule.CLOSING }`) وتعيين مفتاح عدم تكرار `postingKey: 'year-close:${hospitalId}:${year.id}'`.

### 2.2 استبعاد قيود الإقفال (`CLOSING`) ودعم مركز التكلفة في قائمة الدخل (`getIncomeStatement`)
- **المشكلة السابقة:** بعد إقفال السنة المالية، يقوم قيد الإقفال (`sourceModule: CLOSING`) بتصفير جميع حسابات الإيرادات والمصروفات في تاريخ نهاية السنة؛ فكان استدعاء `getIncomeStatement` للسنة المقغلة يُضمّن قيد الإقفال ويُرجع `0` للإيرادات والمصروفات وصافي الربح. كما لم يكن `GET /accounting/income-statement` يمرر معرّف مركز التكلفة `costCenterId`.
- **الإصلاح:**
  - استبعاد `sourceModule: { not: AccountingSourceModule.CLOSING }` في استعلام `getIncomeStatement`.
  - تصنيف حسابات `AccountType.CONTRA_REVENUE` صراحةً ضمن قسم الإيرادات بصافي `credit - debit` (حتى لو لم يبدأ رمز الحساب بـ `4`).
  - إضافة `@Query('costCenterId')` في `GET /accounting/income-statement` و`GET /accounting/ledger` في [accounting.controller.ts](file:///d:/SarayaERP/server/src/accounting/accounting.controller.ts).

### 2.3 عزل صافي الربح المتراكم حسب السنة المالية في الميزانية العمومية (`getBalanceSheet` / `calculateNetIncome`)
- **المشكلة السابقة:** كانت `getBalanceSheet` تعزل سطور الأصول والالتزامات وحقوق الملكية بمعرّف السنة المالية (`financialYearId: fy.id`)، لكنها تستدعي `calculateNetIncome(hospitalId, asOfStart)` دون تمرير `fy.id`، ما يؤدي إلى تسرّب إيرادات ومصروفات السنوات المالية السابقة إلى بند `P&L` الافتراضي في الميزانية العمومية.
- **الإصلاح:** تحديث `calculateNetIncome(hospitalId, asOfDate, financialYearId?: number)` لتقييد السطور بـ `financialYearId: fy.id` وحساب صافي الربح والفرق (`difference = assets - liabilitiesAndEquity`) عبر `Money`.

### 2.4 حفظ وترحيل مراكز التكلفة (`costCenterId`) في الأرصدة الافتتاحية (`generateOpeningBalancesFromLastClosedYear` & `saveOpeningBalances`)
- **المشكلة السابقة:** كانت `generateOpeningBalancesFromLastClosedYear` تُجمّع أرصدة السنة المغلقة حسب `['accountId', 'costCenterId']`، لكنها تُسقط `costCenterId` عند بناء مصفوفة `lines` وتعيّن `costCenterId: null` دائماً في `saveOpeningBalances`.
- **الإصلاح:**
  - إضافة `costCenterId?: number | null` في [opening-balance.dto.ts](file:///d:/SarayaERP/server/src/accounting/dto/opening-balance.dto.ts).
  - تمرير وحفظ `costCenterId: l.costCenterId ?? null` في `generateOpeningBalancesFromLastClosedYear` و`saveOpeningBalances` مع التحقق من توازن القيد الافتتاحي عبر `Money.eq(totalDebitDec, totalCreditDec)`.

### 2.5 إصلاح استخراج هوية المستخدم (`user.sub`) في مسارات إقفال السنة وتوليد الأرصدة الافتتاحية
- **المشكلة السابقة:** كان `AccountingController.closeFinancialYear` و`generateOpeningFromLastClosedYear` يقرآن `req.user.id` بينما حمولة `JwtPayload` المعتمدة تحمل المعرّف في `user.sub`.
- **الإصلاح:** استخدام `user.sub ?? user.id ?? 0` مع تنميط آمن للطلب في [accounting.controller.ts](file:///d:/SarayaERP/server/src/accounting/accounting.controller.ts).

---

## 3. الدوال الموحدة على مكتبة `Money` (`ROUND_HALF_EVEN`)

| الدالة في `AccountingService` | التحسين المالي المنفذ |
|---|---|
| `getLedger` | دعم `costCenterId` وحساب الرصيد الافتتاحي والتراكمي وإجمالي المدين والدائن ورصيد الإغلاق عبر `Money.decimal` و`Money.addDecimal` و`Money.subtractDecimal` و`Money.toDb`. |
| `getTrialBalance` | حساب أرصدة الصفوف وإجماليات ميزان المراجعة عبر `Money.sumDecimal` و`Money.subtractDecimal` و`Money.toDb`. |
| `saveOpeningBalances` & `generateOpeningBalancesFromLastClosedYear` | فحص التوازن بـ `Money.eq`، تخزين السطور بـ `Money.toDbString`، وترحيل `costCenterId` بدقة 3 خانات عشرية. |
| `createManualEntry` | فحص توازن القيد اليدوي بـ `Money.eq(totalDebitDec, totalCreditDec)` وتخزين السطور بـ `Money.toDbString`. |
| `getPendingDocumentsForClosing` & `closeFinancialYear` | تجميع وحساب الإيرادات وحسابات الإيراد العكسية والمصروفات والأرباح المحتجزة لكل مركز تكلفة عبر `Money` مع قفل `FOR UPDATE` ومفتاح `postingKey`. |
| `getIncomeStatement`, `calculateNetIncome`, `getBalanceSheet` | تجميع الإيرادات والمصروفات والأصول والالتزامات وحقوق الملكية وبند `P&L` عبر `Money` مع استبعاد `CLOSING` من قائمة الدخل وعزل `financialYearId` في الميزانية. |
| `getPatientsReceivablesAging`, `listJournalEntries`, `getJournalEntry` | حساب المتبقي على الفواتير وتوزيع فترات الأعمار (`0-30`، `31-60`، `61-90`، `91-120`، `121+`) وإجماليات دفتر اليومية عبر `Money`. |

---

## 4. الأدلة والاختبارات المنفذة

1. **اختبارات الوحدة (`Unit Tests`):**
   - [accounting.service.spec.ts](file:///d:/SarayaERP/server/src/accounting/accounting.service.spec.ts): `3/3` اختبارات ناجحة تغطي `getTrialBalance`، `getLedger` مع `costCenterId`، `getIncomeStatement` مع استبعاد `CLOSING` وخصم `CONTRA_REVENUE`، `closeFinancialYear` مع `postingKey`، `getBalanceSheet` مع عزل `financialYearId`، `generateOpeningBalancesFromLastClosedYear` مع ترحيل `costCenterId`، و`getPatientsReceivablesAging`.
   - كامل حزمة اختبارات الوحدة للخادم: `89/89` حزمة ناجحة (`764/764` اختبارًا).
2. **اختبارات التكامل المعزولة (`Isolated E2E`):**
   - [review-remediation.e2e-spec.ts](file:///d:/SarayaERP/server/test/e2e/review-remediation.e2e-spec.ts): `39/39` اختبارًا ناجحًا (`43.816 s` منفردًا)، بما فيها الاختبار الجديد `FIN02 & FLOW04 verifies HTTP trial-balance, ledger, income-statement, balance-sheet, year-closing with CONTRA_REVENUE, and cost-center opening carry-forward`.
   - الانحدار الشامل المعزول (`scripts/test-isolated-repair.ps1`): `32/37` مجموعة = `558/563` اختبارًا ناجحًا، `0` فاشل، و`5` متخطاة بأعلام البيئة (`nursing-load` و4 مجموعات أشعة `CAP13`) خلال `715.988 s` (`scratch/phase4-batch1-20261123/full-e2e.log`).
3. **الفحوص الساكنة وحوكمة الصلاحيات (`Static Checks & ABAC`):**
   - `npm run lint:ci`: ناجح بدون أي خطأ جديد (انخفض إجمالي الأخطاء التاريخية في الخادم إلى `4367` خطأً و`583` تحذيرًا عبر `621` ملفًا).
   - `npm run typecheck` و`npm run build`: ناجحان (`0` أخطاء).
   - `node generate-audit-report.cjs --check`: تغطية `100/100` (`88/88` فعليًا، `100%` ABAC وTenant Isolation).
