# سلامة اعتماد فواتير الشراء المباشر وتقييم المخزون والقيد الذري — 2026-11-08

## 1. نطاق الدفعة والهدف
تغطي هذه الدفعة مسار **فواتير الشراء المباشر واعتمادها** (`PurchasesService.createPurchaseInvoice`، `updatePurchaseInvoice`، `approvePurchaseInvoice`، و`AccountingService.recordPurchaseInvoiceEntry`) ضمن بنود السجل الموحد `FIN03B` و`FLOW04` و`FIN03A` و`SEC03` و`OPS03`:

1. **إصلاح عقد API لبنود فاتورة الشراء (`PurchaseInvoiceLineDto`)**:
   - أُضيفت الحقول `productId` و`batchNumber` و`expiryDate` إلى `PurchaseInvoiceLineDto` في `server/src/purchases/purchases.controller.ts` بحيث لا تحذفها `ValidationPipe({ whitelist: true })` عند إنشاء أو تعديل فاتورة شراء عبر HTTP.
2. **الأقفال التسلسلية ومطابقة الرصيد قبل التوريد المباشر (`approvePurchaseInvoice`)**:
   - فرض القفل الاستشاري لمخزون المنشأة `pg_advisory_xact_lock(27003, hospitalId)` داخل المعاملة الذرية قبل أي قراءة أو تعديل.
   - التحقق من نشاط المستخدم المنفذ والمورد والمخزن المستلم (`FOR SHARE`) ضمن نفس المنشأة، والتحقق من الفترة المالية المفتوحة داخل المعاملة (`financialPeriod`).
   - قفل الفاتورة (`FOR UPDATE`) ثم الأصناف (`Product` مرتبة تصاعديًا `FOR UPDATE`) ثم التشغيلات (`ProductStock` مرتبة تصاعديًا `FOR UPDATE`).
   - فرض مطابقة رصيد الصنف الإجمالي مع مجموع التشغيلات والإرساليات قيد النقل (`assertOwnedQuantity`) قبل إضافة الكمية الواردة، ورفض الاعتماد بـ `409 Conflict` عند وجود عدم تطابق سابق.
3. **حسابات `Money` الدقيقة وتكلفة التشغيلة وبواقي تقريب WAC**:
   - إزالة حسابات `Number` و`round3` من `approvePurchaseInvoice` و`recordPurchaseInvoiceEntry` واستبدالها بعقود `Money` (`Money.toDbString`، `Money.sumPosted`، `Money.multiply`، `Money.subtractDecimal`، `Money.allocate`، `Money.eq`).
   - تحديث `unitCost` للتشغيلة المستلمة وتحديث `costPrice` للصنف مع شرط التفاؤل (`version` و`stockOnHand`) لإبطال أي جرد مفتوح يتقاطع مع التشغيلة المستلمة.
   - رفض استلام تشغيلة منتهية الصلاحية أو الكتابة فوق تاريخ صلاحية مختلف لتشغيلة قائمة (`ConflictException`).
   - تسجيل بواقي تقريب المتوسط المرجح (`valuationRoundingResiduals`) وتفاصيل الاعتماد في سجل التدقيق المتسلسل (`appendChainedAuditInTransaction` بالفعل `APPROVE_PURCHASE_INVOICE`) داخل نفس المعاملة الذرية مع القيد المحاسبي (`recordPurchaseInvoiceEntry`).
4. **مواءمة واجهة تفاصيل الفاتورة (`PurchaseInvoiceDetailsPage.tsx`)**:
   - قصر إتاحة وضع التعديل في الواجهة على الفواتير بحالة `DRAFT` فقط بما يطابق عقد الخادم.

## 2. الملفات المعدلة والمضافة
- [purchases.controller.ts](file:///d:/SarayaERP/server/src/purchases/purchases.controller.ts)
- [purchases.service.ts](file:///d:/SarayaERP/server/src/purchases/purchases.service.ts)
- [accounting.service.ts](file:///d:/SarayaERP/server/src/accounting/accounting.service.ts)
- [PurchaseInvoiceDetailsPage.tsx](file:///d:/SarayaERP/client/src/pages/PurchaseInvoiceDetailsPage.tsx)
- [direct-purchase-approval-integrity.e2e-spec.ts](file:///d:/SarayaERP/server/test/e2e/direct-purchase-approval-integrity.e2e-spec.ts)

## 3. حالة التحقق والمتبقي
- **حالة التنفيذ والتحقق**:
  - اجتازت مجموعة اختبارات التكامل المركزة [`server/test/e2e/direct-purchase-approval-integrity.e2e-spec.ts`](file:///d:/SarayaERP/server/test/e2e/direct-purchase-approval-integrity.e2e-spec.ts) بنجاح كامل (**8/8 اختبارات ناجحة** على PostgreSQL وRedis المعزولين — الدليل محفوظ في `scratch/direct-purchase-20261108/e2e-focused.log`):
    1. حفظ `batchNumber` و`expiryDate` عبر `PurchaseInvoiceLineDto` والالتزام الذري للرصيد وWAC والقيد والتدقيق المتسلسل.
    2. التسلسل المتزامن (`Promise.all`) لطلبي اعتماد لنفس الفاتورة بحيث يرحل المخزون والقيد مرة واحدة فقط (`201` + `400`).
    3. رفض الاعتماد (`409`) عند عدم تطابق `stockOnHand` مع أرصدة التشغيلات (`assertOwnedQuantity`).
    4. رفض تعارض تاريخ الصلاحية لتشغيلة قائمة ورفض استلام تشغيلة منتهية الصلاحية (`409` / `400`).
    5. إبطال الجرد المفتوح (`IN_PROGRESS`) عند توريد كمية جديدة على تشغيلة مشمولة بالجرد (`409` عند محاولة ترحيل الجرد المتقادم).
    6. التراجع الذري الكامل (Rollback) عند فشل إدراج `AccountingEntry`.
    7. التراجع الذري الكامل (Rollback) عند فشل إدراج `AuditLog`.
    8. فرض صلاحيات `purchases:invoice:create` و`purchases:invoice:approve`.
- **المتبقي ضمن `FIN03B` و`FLOW04`**:
  - الأرصدة الافتتاحية للمخزون وبقية التقارير المالية.
  - نموذج القيمة الدفترية الدقيقة عبر جميع كتّاب WAC والقبول المحاسبي والتشغيلي الشامل.
