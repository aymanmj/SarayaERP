# توحيد خدمات الخادم المالية المتبقية وعزل الأصول ومواءمة مكتبة `Money` ثلاثية الدقة في العميل — 2026-11-23

**المعرفات المرتبطة في السجل الموحد:** `FLOW04`، `FIN02`، `SEC03`، `QA01`  
**الدفعة:** الدفعة 12 (المرحلة 4 — استكمال ترحيل خدمات الخادم المالية المتبقية ومواءمة عميل الويب مع معمارية الدقة الثلاثية للترحيل `#66`)

---

## 1. ملخص النطاق المنفّذ

استُكمل ترحيل آخر أربع خدمات خادم مالية حية كانت ما تزال تعتمد حسابات `Number`/`Math.round` أو تفتقر إلى إحكام العزل والتزامن، بالتوازي مع مواءمة `client/src/utils/money.ts` مع معمارية الدقة العشرية الثلاثية المعتمدة في الترحيل `#66` (`DECIMAL(18,3)` للقيود والإجماليات النهائية / `DECIMAL(19,4)` لأسعار الوحدات و`WAC` / `DECIMAL(19,6)` للنسب ومعاملات التحويل وأسعار الصرف):

1. **خدمة الأصول الثابتة والصيانة (`server/src/assets/assets.service.ts`):**
   - `registerAsset`: التحقق الصارم من عدم سالبية `purchaseCost` و`salvageValue` ومن كون `salvageValue <= purchaseCost` وكون `usefulLifeYears` عددًا صحيحًا موجبًا، وحفظ التكلفة والقيمة التخريدية والدفترية عبر `Money.toDbString`.
   - `runDepreciationForPeriod`: تأمين صف الأصل بقفل `SELECT id FROM "Asset" WHERE id = $1 AND "hospitalId" = $2 FOR UPDATE` وإعادة فحص عدم تكرار الإهلاك داخل معاملة Prisma الذرية (`$transaction`)، واحتساب قسط الإهلاك الشهري (`(cost - salvage) / (years * 12)`) والقيمة الدفترية المتبقية عبر `Money` (`ROUND_HALF_EVEN`) مع ترحيل القيد المحاسبي بمفتاح عدم التكرار `postingKey: asset-depreciation:${hospitalId}:${asset.id}:${financialYear.id}:${period.id}` وحفظ المدين والدائن عبر `Money.toDbString`.
   - **إغلاق فجوة عزل متعدد المنشآت (`SEC03`) في الصيانة:** إحكام `createMaintenanceTicket` و`resolveTicket` بربط جلب الأصل وتذكرة الصيانة وتحديث حالة الأصل بـ `hospitalId` داخل معاملة Prisma الذرية (`tx.asset.findFirst({ where: { id, hospitalId } })` و`tx.maintenanceTicket.findFirst({ where: { id, hospitalId } })` و`tx.asset.updateMany({ where: { id, hospitalId } })`) مع التحقق من عدم سالبية `cost` وحفظها عبر `Money.toDbString`.
   - إنشاء حزمة اختبارات وحدة مخصصة في `server/src/assets/assets.service.spec.ts` (اختباران شاملان يثبتان التحقق المالي والإهلاك المحمي بـ `FOR UPDATE` و`postingKey` ورفض التسرب العابر للمنشآت بـ `NotFoundException`).

2. **خدمة التحليلات التنفيذية (`server/src/analytics/analytics.service.ts`):**
   - `getExecutiveStats`: تقييد جرد `productStock` بالمنتجات النشطة غير المحذوفة (`product: { isActive: true, isDeleted: false }`)، واحتساب `inventoryValue` (بما يدعم أسعار التكلفة ذات الأربع خانات عشرية `4dp`) وصافي إيرادات اليوم `dailyRevenue` (بعد خصم الإشعارات الدائنة) عبر `Money` وإرجاع القيم عبر `Money.toDb(...)` بدل `Math.round(...)` الذي كان يبتر الدراهم الليبية.
   - إضافة اختبار وحدة لـ `getExecutiveStats` في `server/src/analytics/analytics.service.spec.ts`.

3. **خدمة لوحة القيادة (`server/src/dashboard/dashboard.service.ts`):**
   - ترحيل حسابات `todayRevenue` و`lastMonthRevenue` و`currentMonthRevenue` و`inventoryValueCalc` ومعدل نمو الإيرادات `revenueGrowthRate` واتجاه الإيرادات الأسبوعي `getWeeklyTrend` وتوزيع الأقسام `getDepartmentDistribution` إلى `Money` بدقة 3 خانات (`ROUND_HALF_EVEN`) بدل التجميع بـ `Number`.

4. **خدمة الفوترة (`server/src/billing/billing.service.ts`):**
   - استبدال `Number(invoice.totalAmount / patientShare / insuranceShare)` عند بث حدث `InvoiceIssuedEvent` بـ `Money.toDb(...)` للحفاظ على دقة التقريب الموحّدة.

5. **مواءمة عميل الويب مع الدقة العشرية الثلاثية (`client/src/utils/money.ts`):**
   - إضافة الثوابت `MONEY_SCALE = 3` و`UNIT_PRICE_SCALE = 4` و`RATE_SCALE = 6`.
   - إضافة دوال `Money.toUnitDbString` (`4dp`، نطاق `< 10^15`) و`Money.toRateDbString` (`6dp`، نطاق `< 10^13`) و`Money.postedUnitLine`، ومُنسّقات العرض `formatUnitPrice` و`formatRate`.
   - إضافة تغطية اختبارية في `client/src/utils/money.review.test.ts` (ارتفع عدد اختبارات الملف إلى `4/4`).

---

## 2. نتائج التحقق والأدلة المنفّذة

### أ. بوابات الخادم والعميل والتدقيق الساكن

| البوابة | النتيجة | التفاصيل |
|---|---|---|
| `node generate-audit-report.cjs --check` | **نجاح (`100/100`)** | `88/88` فعليًا دون أي تراجع في تغطية `ABAC` |
| الخادم: `npm.cmd run lint:ci` | **نجاح (0 أخطاء جديدة)** | انخفاض الدين التاريخي إلى `4305` خطأً و`584` تحذيرًا عبر `624` ملفًا |
| الخادم: `npm.cmd run typecheck` | **نجاح (0 أخطاء)** | — |
| الخادم: `npm.cmd run build` | **نجاح (0 أخطاء)** | — |
| الخادم: `npm.cmd test -- --runInBand` | **نجاح (`92/92` مجموعة)** | **`773/773` اختبارًا ناجحًا**، `0` متخطى، خلال `44.846 s` |
| العميل: `npm.cmd run lint` | **نجاح (`0` أخطاء)** | `88` تحذيرًا تاريخيًا |
| العميل: `npm.cmd test -- --run` (Vitest) | **نجاح (`43/43` ملفًا)** | **`258/258` اختبارًا ناجحًا** خلال `28.26 s` |
| العميل: `npm.cmd run build` | **نجاح (`12.61 s`)** | `4167` وحدة، `PWA` precache `246` عنصرًا |

### ب. اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1` على Docker PostgreSQL/Redis، 66 ترحيلًا)

السجلات محفوظة محليًا تحت `scratch/phase4-batch4-20261123/`:

| المجموعة | النتيجة | المدة |
|---|---|---|
| `test/e2e/discharge-finance.e2e-spec.ts` | **`46/46` ناجح** | `49.263 s` |
| `test/e2e/patient-deposit-interim-billing.e2e-spec.ts` | **`4/4` ناجح** | `13.202 s` |
| `test/e2e/multi-tenant-isolation.e2e-spec.ts` | **`2/2` ناجح** | `9.564 s` |
| `test/e2e/review-remediation.e2e-spec.ts` | **`39/39` ناجح** | `42.482 s` |
| **الإجمالي المركّز** | **`91/91` (`4/4` مجموعات، `0` فاشل)** | — |

---

## 3. المتبقي خارج نطاق هذه الدفعة

- ربط شاشات واجهة المستخدم المتبقية لأسعار الوحدات والنسب بدوال `formatUnitPrice`/`formatRate` عند الحاجة التفاعلية، ومراجعة تحويلات التواريخ والعملات المتعددة (`CAP09`)، وإضافة `@AuditInTransaction()` وبث SIEM ومصفوفة عزل شاملة لبقية مسارات الكتابة في المتحكمات (`OPS02`/`OPS03`/`SEC03`).
- يظل القبول البشري والمحاسبي والميداني (`UAT01`) مفتوحًا.
