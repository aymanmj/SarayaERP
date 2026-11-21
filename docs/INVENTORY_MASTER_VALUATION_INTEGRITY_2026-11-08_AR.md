# تقرير إحكام البيانات الأساسية للمخزون وعزل وحدات القياس ودورة حياة المستودعات ولوحة التقييم وأوامر الشراء (2026-11-08)

## 1. نطاق المرحلة وأهدافها

تستكمل هذه المرحلة (الدفعة 16) إغلاق الفجوات المتبقية في طبقة البيانات الأساسية للمخزون ووحدات القياس والمستودعات ولوحة تقييم المخزون وطلبات/أوامر الشراء ضمن بنود السجل المرجعي [`docs/REMEDIATION_REGISTER_2026-11-07_AR.md`](file:///d:/SarayaERP/docs/REMEDIATION_REGISTER_2026-11-07_AR.md) (`FIN03B`، `SEC03`، `FLOW04`، و`FIN03A`):

1. **عزل المستأجر (Tenant Isolation) وحماية معاملات تحويل وحدات القياس (`UnitOfMeasure` / `ProductUOM`)**:
   - كانت المسارات `POST /inventory/products/:productId/uoms` و`DELETE /inventory/products/:productId/uoms/:uomId` في [`server/src/inventory/inventory.controller.ts`](file:///d:/SarayaERP/server/src/inventory/inventory.controller.ts) تستدعي `addProductUom` و`removeProductUom` بدون تمرير `user.hospitalId`، ما كان يسمح بربط أو حذف وحدات قياس عبر المستشفيات أو تعديل معامل التحويل (`conversionRate`) لوحدة مستخدمة سابقاً في طلبات/أوامر شراء أو حركات مخزنية.
   - كانت `deleteUOM` في [`server/src/inventory/inventory.service.ts`](file:///d:/SarayaERP/server/src/inventory/inventory.service.ts) ترمي `new Error(...)` خاماً (`500 Internal Server Error`) بدلاً من `NotFoundException` (`404`)، ولم تكن تمنع تعطيل أو حذف وحدة قياس مرتبطة بأصناف نشطة أو حركات سابقة.
2. **إحكام فئات الأصناف (`ItemCategory`) وبطاقات الأصناف (`Product`)**:
   - كانت `createItemCategory` تقبل قيماً مثل `FIFO` و`LIFO` رغم أن محرك التقييم المالي والمخزني يعتمد المتوسط المرجح للتكلفة (`WEIGHTED_AVERAGE`) حصراً، ولم تكن تتحقق من ملكية ونوع حساب المخزون (`ASSET`) وحساب المصروف (`EXPENSE`) داخل نفس `hospitalId`.
   - كانت `createProduct` تستخدم القيمة الافتراضية غير الصالحة `'CONSUMABLE'` بدلاً من قيم `ProductType` المعتمدة في المخطط (`DRUG | SUPPLY | ASSET | LAB_REAGENT | OTHER`)، ولم تكن تتحقق من ملكية `categoryId` و`baseUomId` و`expenseAccountId` ولا من شرط `maxStock >= minStock` ودقة الأسعار عبر مكتبة `Money`.
3. **حوكمة دورة حياة المستودعات (`Warehouse`)**:
   - كانت `updateWarehouse` في [`server/src/inventory/warehouse.service.ts`](file:///d:/SarayaERP/server/src/inventory/warehouse.service.ts) تسمح بتعطيل المستودع (`isActive: false`) حتى لو كان يحتوي على أرصدة تشغيلية موجبة (`productStock.quantity > 0`) أو جلسات جرد نشطة أو أذونات صرف قيد النقل أو كان مربوطاً كسياسة مستودع افتراضي للمستشفى (`ConsumptionWarehousePolicy` / `PharmacyWarehousePolicy` / `SurgeryWarehousePolicy`).
4. **دقة لوحة تقييم المخزون وتنبيهات الحد الأدنى (`getDashboardStats` / `monitorStockLevels`)**:
   - كانت `getDashboardStats` في [`server/src/inventory/inventory-count.service.ts`](file:///d:/SarayaERP/server/src/inventory/inventory-count.service.ts) تحسب إجمالي قيمة المخزون بالاعتماد على `Number(p.stockOnHand) * Number(p.costPrice)` مع تجاهل الأرصدة الفعلية في `productStock` عند التصفية بمستودع محدد أو عدم التحقق من ملكية `warehouseId` للمستشفى، وتستخدم حداً ثابتاً (`< 10`) لتنبيهات نقص المخزون بدلاً من `minStock` المعتمد للصنف/الدفعة.
5. **إحكام طلبات وأوامر الشراء (`createPR` / `createPOFromPR` / `createPODirect`)**:
   - كانت دوال الإنشاء في [`server/src/purchases/procurement.service.ts`](file:///d:/SarayaERP/server/src/purchases/procurement.service.ts) تقبل `uomId` غير مربوط بالصنف، وتفتقر إلى قفل صفي (`FOR UPDATE`) على `PurchaseRequest` عند تحويل طلب الشراء إلى أمر شراء (`createPOFromPR`)، ما كان يسمح بإنشاء أوامر شراء مكررة لنفس الطلب عند الاستدعاء المتزامن.

---

## 2. الإصلاحات المنفذة في الكود المصدري

### 2.1 وحدات القياس، فئات الأصناف، وبطاقات الأصناف
- الملفات المعدلة:
  - [`server/src/inventory/inventory.controller.ts`](file:///d:/SarayaERP/server/src/inventory/inventory.controller.ts)
  - [`server/src/inventory/inventory.service.ts`](file:///d:/SarayaERP/server/src/inventory/inventory.service.ts)
  - [`client/src/pages/inventory/master-data/ProductsMasterDataPage.tsx`](file:///d:/SarayaERP/client/src/pages/inventory/master-data/ProductsMasterDataPage.tsx)
  - [`client/src/pages/inventory/master-data/ItemCategoriesManagementPage.tsx`](file:///d:/SarayaERP/client/src/pages/inventory/master-data/ItemCategoriesManagementPage.tsx)
- أبرز الضوابط المضافة:
  - تمرير `user.hospitalId` إلى `addProductUom` و`removeProductUom` وإضافة `ParseIntPipe` إلى مسارات تعديل وحذف وحدات القياس.
  - فرض القفل الاستشاري `pg_advisory_xact_lock(hospitalId, 27003)` وقفل صف الصنف (`SELECT id FROM "Product" ... FOR UPDATE`) داخل `addProductUom` و`removeProductUom`.
  - إلزام أن تكون الوحدة الأساسية للصنف (`baseUomId`) بمعامل تحويل يساوي `1` دائماً، وضمان وجود وحدة افتراضية واحدة فقط للشراء وأخرى للصرف لكل صنف.
  - منع تعديل معامل التحويل أو حذف ربط `ProductUOM` برمز `409 ConflictException` إذا كانت الوحدة مستخدمة في `MaterialRequestItem` أو `StockIssueItem` أو `PurchaseRequestItem` أو `PurchaseOrderItem` أو `GoodsReceiptItem` أو `StockTransaction`.
  - منع تعطيل أو حذف `UnitOfMeasure` مرتبطة بأصناف نشطة أو طلبات/أوامر مفتوحة (`409 ConflictException`)، وإرجاع `404 NotFoundException` عند عدم وجود الوحدة.
  - فرض طريقة التقييم `WEIGHTED_AVERAGE` حصراً في `createItemCategory` ومواءمة واجهة [`ItemCategoriesManagementPage.tsx`](file:///d:/SarayaERP/client/src/pages/inventory/master-data/ItemCategoriesManagementPage.tsx) معها، والتحقق من ملكية ونوع الحسابات المحاسبية (`inventoryAccountId` من نوع `ASSET` و`expenseAccountId` من نوع `EXPENSE`).
  - تطبيع النوع القديم `'CONSUMABLE'` إلى `'SUPPLY'` والتحقق الصارم من `ProductType` و`minStock <= maxStock` ودقة `costPrice` و`sellPrice` عبر مكتبة [`Money`](file:///d:/SarayaERP/server/src/common/utils/money.util.ts)، ومواءمة خيارات نوع الصنف في [`ProductsMasterDataPage.tsx`](file:///d:/SarayaERP/client/src/pages/inventory/master-data/ProductsMasterDataPage.tsx).

### 2.2 حوكمة المستودعات ولوحة التقييم المالي للمخزون
- الملفات المعدلة:
  - [`server/src/inventory/warehouse.service.ts`](file:///d:/SarayaERP/server/src/inventory/warehouse.service.ts)
  - [`server/src/inventory/inventory-count.service.ts`](file:///d:/SarayaERP/server/src/inventory/inventory-count.service.ts)
- أبرز الضوابط المضافة:
  - منع تعطيل المستودع (`isActive: false`) برمز `409 ConflictException` إذا كان يحمل رصيداً تشغيلياً موجباً (`productStock.quantity > 0`) أو جلسة جرد نشطة (`DRAFT` / `IN_PROGRESS`) أو حركات صرف/طلبات مواد مفتوحة أو كان معيناً في سياسات المستشفى (`ConsumptionWarehousePolicy`، `PharmacyWarehousePolicy`، `SurgeryWarehousePolicy`).
  - ترقية `getDashboardStats(hospitalId, warehouseId)` للتحقق من ملكية `warehouseId` للمستشفى (`404 NotFoundException` عند محاولة الوصول لمستودع مستشفى آخر)، واستبعاد الأصناف المحذوفة منطقياً (`isDeleted: false`)، وحساب قيمة كل صنف بمعادلة المتوسط المرجح عبر `Money.multiply(qty, product.costPrice)` ثم جمعها عبر `Money.sumPosted` وإرجاع كل من `totalValue` و`totalValueText`.
  - حساب `lowStockCount` و`monitorStockLevels` باستخدام `Prisma.Decimal` ومقارنة الرصيد بالحد الأدنى المعتمد (`stock.minStock` ثم `product.minStock` مع قيمة احتياطية `10`).

### 2.3 إحكام طلبات وأوامر الشراء (`ProcurementService`)
- الملف المعدل:
  - [`server/src/purchases/procurement.service.ts`](file:///d:/SarayaERP/server/src/purchases/procurement.service.ts)
- أبرز الضوابط المضافة:
  - فرض القفل الاستشاري `27003` والتحقق من ملكية وحالة المستخدم والقسم والمورد والأصناف ووحدات القياس داخل نفس `hospitalId`.
  - إلزام أن تكون كل `uomId` في بنود طلب الشراء أو أمر الشراء إما الوحدة الأساسية للصنف (`baseUomId`) أو معرفة في جدول `ProductUOM` للصنف نفسه.
  - أخذ قفل صفي `SELECT id FROM "PurchaseRequest" ... FOR UPDATE` داخل `createPOFromPR` لمنع السباقات المتزامنة من إنشاء أكثر من أمر شراء واحد لنفس طلب الشراء، وحساب إجماليات البنود وأمر الشراء عبر `Money.multiply` و`Money.sumPosted`.

---

## 3. الاختبارات والتحقق

- اجتازت مجموعة اختبارات التكامل الشاملة [`server/test/e2e/inventory-master-valuation-integrity.e2e-spec.ts`](file:///d:/SarayaERP/server/test/e2e/inventory-master-valuation-integrity.e2e-spec.ts) بنجاح كامل (**4/4 اختبارات ناجحة** في `10.321 s` على PostgreSQL وRedis المعزولين — الدليل محفوظ في `scratch/inventory-master-20261108/e2e-focused.log`):
  1. رفض طرق التقييم غير المدعومة (`FIFO`) والحسابات العابرة للمستأجرين أو ذات النوع الخاطئ (`400`)، وتطبيع `CONSUMABLE` إلى `SUPPLY` والتحقق من `minStock <= maxStock`.
  2. عزل المستأجر على مسارات `ProductUOM` (`404`)، وفرض `conversionRate = 1` للوحدة الأساسية، وتبديل الوحدة الافتراضية للشراء/الصرف ذرياً، ومنع تعديل أو حذف معامل تحويل أو وحدة قياس مرتبطة بأوامر شراء أو أصناف نشطة (`409 ConflictException`)، وإرجاع `404` عند حذف وحدة غير موجودة.
  3. منع تعطيل مستودع يحتوي على أرصدة موجبة (`409`)، والتحقق من دقة `getDashboardStats` (`totalProducts = 2`، `totalValue = 28.015`، و`totalValueText = '28.015'`) مع استبعاد الأصناف المحذوفة منطقياً ورفض `warehouseId` الأجنبي (`404`).
  4. رفض وحدات القياس غير المربوطة بالصنف في `POST /procurement/requests` (`400`)، ومنع السباق المتزامن على `POST /procurement/orders/from-pr` بحيث ينجح طلب واحد (`201`) ويرفض الآخر (`409 ConflictException`) مع بقاء أمر شراء وحيد في قاعدة البيانات.

### أمر التشغيل للتحقق على PostgreSQL المعزول (للتشغيل في نافذة PowerShell خارجية)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-isolated-repair.ps1 -TestPath "test/e2e/direct-purchase-approval-integrity.e2e-spec.ts test/e2e/inventory-master-valuation-integrity.e2e-spec.ts"
```
