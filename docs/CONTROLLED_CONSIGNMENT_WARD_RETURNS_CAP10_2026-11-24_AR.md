# توثيق الدفعة 22 (`CAP10`): سجل المخدّرات والمقيّدات بتوقيع ثنائي، دورة مستلزمات الأمانة، ومرتجع العنابر المعتمد

- **التاريخ:** 2026-11-24
- **النطاق المعتمد:** `CAP10` (المرحلة الخامسة — الدفعة 22) وفق المرجع الموحد `docs/REMEDIATION_REGISTER_2026-11-07_AR.md` وسياسة `Money` (`docs/MONEY_LIBRARY_COMPARISON_2026-11-06_AR.md`).
- **الترحيل المضاف:** الترحيل `#76` (`server/prisma/migrations/20261124200000_controlled_substances_consignment_ward_returns_cap10/migration.sql`).

## 1. ملخص ما تم بناؤه وضبطه

### أ) سجل المخدّرات والمؤثرات العقلية برقابة 4 عيون وسلسلة SHA-256 (`ControlledSubstanceLog`)
- توسيع نموذج `Product` بحقلي `isControlled` و`controlledSchedule` (`SCHEDULE_II`, `SCHEDULE_III`, `SCHEDULE_IV`, `NARCOTIC`, `PSYCHOTROPIC`) مع قيد فحص (`CHECK`) في PostgreSQL.
- إنشاء سجل `ControlledSubstanceLog` ملحق فقط (Append-Only):
  - إلزام رقابة **4 عيون** (`witnessedById <> performedById`) على مستوى الخدمة وقاعدة البيانات (`CHECK`).
  - تتبّع الرصيد التراكمي الدقيق بالكميات العشرية (`quantityBefore`, `quantityChange`, `wastedQuantity`, `quantityAfter`) وتوثيق الهدر المشهود (Witnessed Waste) وصرف المريض/الزيارة.
  - سلسلة تجزئة تشفيرية مترابطة (`previousHash -> entryHash` عبر SHA-256) مع نقطة تحقق متكاملة `GET /inventory/governance/controlled-logs/verify`.
  - مشغّل PostgreSQL (`controlled_substance_log_immutable_guard`) يمنع `UPDATE` أو `DELETE` على أي قيد مخدّرات مسجّل.
  - استخدام قفل استشاري `pg_advisory_xact_lock(27020, hospitalId)` لمنع السباقات على الرصيد والسلسلة.

### ب) دورة حياة مستلزمات الأمانة (`ConsignmentReceipt` و`ConsignmentConsumption`)
- استلام عُهد أمانة مملوكة للمورد (`ConsignmentReceipt`) دون خلطها بمخزون المستشفى المملوك، مع سعر وحدة متفق عليه بدقة 4 خانات عشرية (`agreedUnitPrice DECIMAL(19,4)`).
- تسجيل الاستهلاك المرتبط بالمريض والزيارة (`ConsignmentConsumption`) مع احتساب `totalAmount` بدقة `DECIMAL(18,3)` عبر مكتبة `Money` (`ROUND_HALF_EVEN`) حصريًا عبر `computeConsignmentLineTotal` دون أي حسابات عائمة (`Number`/`parseFloat`).
- إرجاع المتبقي غير المستهلك إلى المورد (`POST /inventory/governance/consignments/:id/return-supplier`) مع قفل صف `FOR UPDATE` وتحديث الحالة آليًا (`ACTIVE` → `PARTIALLY_CONSUMED` → `FULLY_CONSUMED` / `RETURNED_TO_SUPPLIER`).
- مشغلات PostgreSQL (`consignment_receipt_guard`, `consignment_consumption_immutable_guard`) تمنع تجاوز الكمية المستلمة أو تعديل/حذف قيود الاستهلاك المسجّلة.

### ج) مرتجع العنابر المعتمد من الصيدلي (`WardStockReturn`)
- تقديم طلب مرتجع من طاقم التمريض (`POST /inventory/governance/ward-returns`) مع توثيق سلامة الختم (`sealIntact`) وسلسلة التبريد (`coldChainMaintained`) ورقم التشغيلة وتاريخ الصلاحية.
- مراجعة مستقلة من الصيدلي (`POST /inventory/governance/ward-returns/:id/review`) بضوابط سلامة صارمة:
  - منع الاعتماد الذاتي (`reviewedById <> requestedById` على مستوى الخدمة وقاعدة البيانات).
  - حظر إعادة الإدخال للمخزون (`APPROVE_RESTOCK` → `409 Conflict`) إذا كان الختم مكسورًا أو سلسلة التبريد مقطوعة أو الصلاحية منتهية (`evaluateWardReturnEligibility`)، مع توجيهها للإتلاف (`REJECT_DESTROY`).
  - عند الاعتماد الصحيح، تنفيذ إعادة إدخال ذرية في معاملة واحدة: إنشاء `StockTransaction` (`type: IN`, `referenceType: 'WARD_RETURN'`) + تحديث `ProductStock` + زيادة `Product.stockOnHand` مع ربط `stockTransactionId` إلزاميًا في قيد PostgreSQL.
  - مشغّل PostgreSQL (`ward_stock_return_guard`) يمنع التعديل أو الحذف بعد إقرار/رفض الطلب.

### د) الواجهة والأمن والتكامل (`UI` / `ABAC` / `Audit`)
- إنشاء `ControlledConsignmentModal.tsx` بـ 3 تبويبات تفاعلية ودمجها في `PharmacyWorklistPage.tsx` (زر `🔐 المخدّرات والأمانة ومرتجع العنابر`).
- تغطية جميع المسارات بـ `JwtAuthGuard` + `PermissionsGuard` (`inventory:view`/`pharmacy:view`/`inventory:manage`/`pharmacy:manage`) و`@AuditInTransaction()` وتسجيل تدقيق متسلسل `appendChainedAudit` + نشر `publishCommittedCriticalAudit` بعد تأكيد المعاملة فقط.

## 2. أدلة التحقق المنفذة (2026-11-24)

| البوابة / الفحص | النتيجة | التفاصيل |
|---|---|---|
| ترحيل PostgreSQL المعزول من الصفر | **نجاح (76/76)** | `node scripts/prepare-isolated-repair.cjs` طبّق الترحيلات الـ 76 بما فيها `#76`. |
| فحص تطابق المخطط (`prisma migrate diff --exit-code`) | **نجاح (`No difference detected.`)** | تطابق 100% بين `schema.prisma` وقاعدة الاختبار المعزولة. |
| الفحوص الساكنة (`check-i18n`, `verify-tenant-isolation`, `generate-audit-report --check`) | **نجاح** | Client `7401` + Mobile `40` متوازنة؛ `107/107` متحكمات (فعّال `95/95` = `100%` ABAC & Tenant). |
| الخادم (`lint:ci`, `typecheck`, `nest build`) | **نجاح** | `0` أخطاء ESLint جديدة (خط الأساس ثابت `4267`)، `tsc --noEmit` و`nest build` دون أخطاء. |
| اختبارات وحدة الخادم (`Jest --runInBand`) | **نجاح (103/103 حزمة — 803/803 اختبار)** | شاملة `src/inventory/controlled-consignment.service.spec.ts`. |
| العميل (`eslint`, `Vitest --run`, `tsc -b && vite build`) | **نجاح (53/53 ملفًا — 277/277 اختبارًا)** | شاملة `src/components/pharmacy/ControlledConsignmentModal.test.tsx` وبناء PWA نظيف. |
| اختبارات التكامل E2E على PostgreSQL المعزولة (`connection_limit=5`) | **نجاح (3/3 حزم)** | `controlled-consignment-ward-cap10.e2e-spec.ts` (9.07s) + `inventory-count-integrity.e2e-spec.ts` + `surgical-safety-cap05.e2e-spec.ts` (9.01s). |

## 3. ما يبقى خارج نطاق الإغلاق الآلي
- القبول الميداني البشري (`UAT01`) مع الصيدلي المسؤول وأمين مخزن المخدّرات ومراجعة تقارير التفتيش الرقابي المحلي قبل التشغيل الفعلي.
