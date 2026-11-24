# الدفعة 25 — الموازنات التقديرية وقائمة التدفقات النقدية والتفقيط وحزم الجراحة وفوترة DRG (`CAP08` — الترحيل `#79`)

**التاريخ:** 2026-11-24  
**البنود المغطاة:** `CAP08` (الحزم الجراحية وفوترة DRG)، `FIN02` (الموازنات التقديرية وقائمة التدفقات النقدية)، `FLOW04` (دقة مكتبة `Money` والتفقيط العربي)، `SEC03` (عزل المنشآت)، `OPS03` (التدقيق المتسلسل وبث SIEM)، `QA01`.  
**المرجع التخطيطي:** الجزء الثالث والأخير من الدمج الهندسي الانتقائي المعتمد من صاحب النظام بتاريخ 2026-11-24 بين `SarayaManager` و`SarayaERP` مع الحفاظ الصارم على العمارة متعددة المنشآت (`hospitalId`) ومكتبة `Money` (`ROUND_HALF_EVEN`) وحواجز `PostgreSQL`.

---

## 1. ملخص ما تم تنفيذه

### أ) قاعدة البيانات والترحيل `#79` (`20261124235000_budgets_cashflow_surgical_packages_drg_cap08`)
- **`BudgetLine`:** سطر موازنة تقديرية متعدد المنشآت مرتبط بـ `Hospital` و`FinancialYear` و`Account` و`CostCenter` (اختياري) على 12 فترة شهرية (`period1`..`period12` بدقة `DECIMAL(18,3)`) مع قيد `CHECK` على تطابق `totalBudget` مع مجموع الفترات الـ 12 ومنع السالب وفهرس فريد جزئي لكل حساب/سنة/مركز تكلفة.
- **`SurgicalPackage`:** تعريف الحزمة الجراحية الموحّدة المرتبطة بالمنشأة مع رمز فريد `UNIQUE(hospitalId, code)` ورمز التصنيف `drgCode` وسعر الحزمة المجمّع `packagePrice` (`DECIMAL(18,3)`) وعدد أيام الإقامة المشمولة `includedStayDays`.
- **`SurgicalPackageInclusion`:** قواعد شمول البنود لكل فئة خدمة (`SURGERY`, `ROOM`, `ANESTHESIA`, `LAB`, `RADIOLOGY`, `PHARMACY`, `CONSUMABLES`, `CONSULTATION`, `PROCEDURE`) بأنماط التغطية الثلاثة: `INCLUDED_UNLIMITED` أو `INCLUDED_CAPPED` (مع قيد `CHECK` يلزم وجود `capAmount > 0`) أو `EXCLUDED`، بقيود تفرد `UNIQUE(packageId, category)`.
- **`EncounterPackageEnrollment`:** ربط الزيارة السريرية بحزمة جراحية بسعر مثبّت (`packagePriceSnapshot`)، مع فهرس فريد جزئي يضمن وجود تسجيل `ACTIVE`/`SETTLED` واحد على الأكثر لكل زيارة، وقيود `CHECK` على اكتمال أرقام التسوية وبصمة `SHA-256` (`settlementHash`) عند حالة `SETTLED`، ومحفّز `PostgreSQL` (`encounter_package_enrollment_guard`) يمنع التعديل أو الحذف بعد التسوية النهائية.

### ب) المحاسبة المؤسسية والتفقيط العربي (`AccountingModule` + `common/utils`)
- **التفقيط العربي للسندات (`tafqeetVoucher`):** الحفاظ على دالة `tafqeetArabic` الفصحى متعددة العملات بدقة `Money` في `server/src/common/utils/tafqeet.util.ts` وتوسيعها بـ `tafqeetVoucher` لصيغة السندات والشيكات (`فقط ... لا غير`) مع تصديرها في `common/utils/index.ts` وتغطيتها بـ `tafqeet.util.spec.ts`.
- **الموازنات التقديرية ومقارنة الموازنة بالفعلي (`BudgetsCashFlowService` & `BudgetsCashFlowController`):**
  - `GET /accounting/corporate/budgets` و`POST /accounting/corporate/budgets` (حفظ/تحديث سطر الموازنة داخل معاملة `FOR UPDATE` مع رفض السنوات المالية المغلقة).
  - `GET /accounting/corporate/budgets/vs-actual`: احتساب الفعلي من قيود الأستاذ المرحّلة (`POSTED`) مع استبعاد قيود الإقفال (`CLOSING`)، وحساب الانحراف الدقيق (`variance` المواتي/غير المواتي حسب طبيعة الحساب `REVENUE` مقابل `EXPENSE`) ونسبة الاستهلاك عبر `Money`.
- **قائمة التدفقات النقدية المتزنة (`GET /accounting/corporate/cash-flow`):** تصنيف حركات النقد والبنك إلى الأنشطة التشغيلية (`OPERATING`) والاستثمارية (`INVESTING`) والتمويلية (`FINANCING`) مع كشف أي حركات غير مصنّفة (`unclassifiedActivities`) والتحقق الرياضي من `reconciliationDifference === 0.000` وإرفاق تفقيط الرصيد الختامي (`closingCashTafqeet`).
- **نقطة التفقيط (`GET /accounting/corporate/tafqeet`):** تحويل فوري للمبالغ بأي عملة مدعومة لاستخدامها في القوالب والتقارير.

### ج) محرك الحزم الجراحية وفوترة DRG (`CAP08` — `SurgeryModule`)
- **محرك التسوية الصرف (`surgical-package.util.ts`):**
  - تطبيع `ChargeSource` (`SURGERY`, `BED`, `ICU`, `LAB_ORDER`, `RADIOLOGY_ORDER`, `PHARMACY`, `PHARMACY_PRESCRIPTION`, `SURGERY_CONSUMABLE`) و`ServiceType` إلى الفئات المعيارية الـ 9.
  - دالة `reconcileSurgicalPackage` بدقة `Money` (`ROUND_HALF_EVEN`): حساب الفعلي والمغطّى بالحزمة والفائض (`overageAmount`) على مستوى كل فئة، وصافي الفاتورة المستحق (`netBillableTotal = packagePrice + overageAmount`)، وهامش/تباين الحزمة (`packageVariance = packagePrice - coveredByPackageAmount`).
  - دالة `computePackageSettlementHash`: توليد بصمة `SHA-256` غير قابلة للتزوير لتسوية الحزمة.
- **الخدمة والمتحكم (`SurgicalPackageService` & `SurgicalPackageController` — `/surgery/packages/*`):**
  - إدارة الحزم وقواعد الشمول، تسجيل الزيارة في الحزمة بقفل استشاري (`pg_advisory_xact_lock`), معاينة التسوية المباشرة، الاعتماد والتسوية النهائية المقفل ببصمة `SHA-256` (`POST /surgery/packages/enrollments/:id/settle`)، وإلغاء التسجيل النشط قبل التسوية، مع `@AuditInTransaction()` وسلسلة `AuditLog` وبث `publishCommittedCriticalAudit`.

### د) واجهات العميل (`client/`)
- **`SurgicalPackagesModal.tsx`:** نافذة إدارة الحزم الجراحية وربط الزيارات ومعاينة وتسوية DRG، مدمجة في `SurgerySchedulePage.tsx` ومختبرة في `SurgicalPackagesModal.test.tsx`.
- **`BudgetsCashFlowModal.tsx`:** نافذة الموازنة التقديرية مقابل الفعلي وقائمة التدفقات النقدية مع التفقيط الفوري، مدمجة في `BalanceSheetPage.tsx` ومختبرة في `BudgetsCashFlowModal.test.tsx`.

---

## 2. أدلة التحقق المنفذة

| الفحص / البوابة | النتيجة | التفاصيل |
|---|---|---|
| ترحيل PostgreSQL المعزول من الصفر | **ناجح** | `prisma migrate reset --force` طبّق **79/79** ترحيلاً + `prisma generate` (`v6.19.3`) |
| تطابق المخطط (`migrate diff`) | **ناجح** | `No difference detected.` (`drift = 0`) |
| فحص التوطين (`check-i18n.js`) | **ناجح** | العميل `7401` مفتاحاً متوازناً، الجوال `40` مفتاحاً |
| عزل المنشآت (`verify-tenant-isolation.js`) | **ناجح** | فحص `111` متحكم NestJS بنجاح |
| تدقيق ABAC (`generate-audit-report.cjs --check`) | **ناجح** | **`111/111`** إجمالي (**`99/99`** فعّال = `100%`) |
| `server` `lint:ci` | **ناجح** | `0` أخطاء جديدة (`4267` خطأً تاريخياً و`638` تحذيراً عبر `699` ملفاً، دون رفع خط الأساس) |
| `server` `typecheck` و`nest build` | **ناجح** | `0` أخطاء TypeScript وبناء إنتاجي سليم |
| اختبارات وحدة الخادم (`jest --runInBand`) | **ناجح** | **`107/107`** حزمة، **`819/819`** اختباراً ناجحاً، `0` متخطى (`45.102 s`) |
| `client` `lint` + `Vitest` + `vite build` | **ناجح** | `0` أخطاء lint، **`57/57`** ملفاً = **`283/283`** اختباراً ناجحاً (`32.72 s`)، بناء PWA سليم (`12.18 s`) |
| اختبارات التكامل `E2E` المعزولة (`scripts/test-isolated-repair.ps1`) | **ناجح** | `budgets-cashflow-surgical-packages-cap08.e2e-spec.ts` (PASS) + `surgical-safety-cap05.e2e-spec.ts` (PASS) + `treasury-fx-reconciliation-cap09.e2e-spec.ts` (PASS) — السجلات في `scratch/phase5-batch25-20261124/` |

---

## 3. المتبقي المفتوح (التمييز الصريح عن الإغلاق الميداني)
1. **ربط تسوية الحزمة آلياً بإصدار فاتورة الخروج المقسّمة (`Patient/Insurance DRG Claim Split`) ومحرك `DRG Grouper` التلقائي من رموز `ICD-10/CPT`.**
2. **استيراد/تصدير جداول الموازنات بصيغة Excel/CSV ومقارنة التدفقات النقدية لعدة سنوات مالية.**
3. **القبول المالي والسريري الميداني (`UAT01`) مع مديري المالية والعمليات الجراحية قبل التشغيل الفعلي.**
