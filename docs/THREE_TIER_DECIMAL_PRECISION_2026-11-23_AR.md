# توثيق الدفعة الحادية عشرة (الترحيل #66): معمارية الدقة العشرية الثلاثية (`DECIMAL(18, 3)` / `DECIMAL(19, 4)` / `DECIMAL(19, 6)`)

**تاريخ التنفيذ:** `2026-11-23`  
**الاعتماد:** موافقة صريحة من صاحب النظام بتاريخ `2026-11-23` على الترقية الانتقائية الثلاثية  
**الارتباط بالسجل الموحد:** `FLOW04`، `FIN02`، `FIN03B`، `QA01` في [REMEDIATION_REGISTER_2026-11-07_AR.md](file:///d:/SarayaERP/docs/REMEDIATION_REGISTER_2026-11-07_AR.md)  
**الترحيل:** `20261123230000_three_tier_decimal_precision` (الترحيل رقم `#66`)

---

## 1. السياسة الهندسية والمحاسبية المعتمدة

| المستوى | نوع العمود في PostgreSQL | ثابت وحدود `Money` | النطاق المشمول | المبرّر المحاسبي |
|---|---|---|---|---|
| **المستوى 1 — القيود النهائية والإجماليات المرحّلة** | `DECIMAL(18, 3)` | `MONEY_SCALE = 3` (`toDb` / `toDbString`) | قيود الأستاذ العام (`AccountingEntryLine.debit/credit`)، إجماليات الفواتير والذمم والمدفوعات والمطالبات والإيصالات والسندات والرواتب وجلسات الصندوق (مع تثبيت 6 أعمدة غير مقيدة سابقًا في `CashierShiftClosing` و`Admission` و`DischargePlanning`). | يمنع تسرب كسور `0.0004` إلى القيود النهائية ويضمن توازن ميزان المراجعة والميزانية العمومية بدقة الدرهم (`0.000 د.ل`). |
| **المستوى 2 — أسعار الوحدات وتكاليف المتوسط المرجّح (`WAC`) والتعريفات** | `DECIMAL(19, 4)` | `UNIT_PRICE_SCALE = 4` (`toUnitDb` / `toUnitDbString` / `postedUnitLine`) | **`21` عمودًا:** `ServiceItem.defaultPrice`، `EncounterCharge.unitPrice`، `Product.costPrice/sellPrice`، `PurchaseOrderItem.unitPrice`، `GoodsReceiptItem.unitPrice/unitCost`، `ProductStock.unitCost`، `StockTransaction.unitCost`، `StockIssueItem.unitCost/batchUnitCost`، `PrescriptionItem.prepaidUnitPrice`، `DispenseItem.unitPrice`، `DoctorSchedule.consultationPrice`، `InventoryCountLine.costPrice`، `PurchaseReturnLine.unitPrice`، `PurchaseInvoiceLine.unitPrice`، `SurgeryConsumable.unitPrice`، `PriceListItem.price`، `ICUEquipmentUsage.dailyRate`، `ContractBenefit.agreedPrice`. | يقلّص انحراف تقريب `WAC` وأسعار الجملة بمقدار `10` أضعاف (مثال: `14 / 6 = 2.3333` يعطي `6 × 2.3333 = 13.9998 ≈ 14.000` بدل `13.998`، و`300 × 0.4167 = 125.010`). |
| **المستوى 3 — النسب المئوية والعمولات ومعاملات التحويل وأسعار الصرف** | `DECIMAL(19, 6)` | `RATE_SCALE = 6` (`toRateDb` / `toRateDbString`) | **`13` عمودًا:** `User.commissionRate`، `ProductUOM.conversionRate`، `InsurancePolicy.patientCopayRate`، `InsurancePlan.defaultCopayRate`، `CoverageRule.copayValue`، `CommissionRule.doctorRate/hospitalRate`، `InsuranceContract.discountPercentage/copayPercentage`، `ContractBenefit.discountPercent/copayPercent`، `ServiceMaterialConsumption.multiplier`، `GatewayClearingFeeEntry.feeRate`. | يدعم نسبًا دقيقة (مثل `12.3456%` و`0.005000`) ومعاملات التحويل الصيدلانية وأسعار الصرف المستقبلية (`CAP09`) دون قص أو فقدان دقة. |

---

## 2. تفاصيل التنفيذ

1. **مكتبة الأموال (`server/src/common/utils/money.util.ts` و`money.util.spec.ts`):**
   - إضافة الثوابت `UNIT_PRICE_SCALE = 4` و`RATE_SCALE = 6`، والدوال `Money.to4dp`، `Money.to6dp`، `Money.toUnitDb`، `Money.toUnitDbString`، `Money.toRateDb`، `Money.toRateDbString`، و`Money.postedUnitLine` (وكذلك على `MoneyChain`) مع تقريب مصرفي صارم (`ROUND_HALF_EVEN`).
2. **قاعدة البيانات والترحيل `#66` (`server/prisma/schema.prisma` و`20261123230000_three_tier_decimal_precision/migration.sql`):**
   - تعديل الأعمدة الـ `40` (`21` إلى `DECIMAL(19,4)`، و`13` إلى `DECIMAL(19,6)`، و`6` لتثبيتها صراحةً على `DECIMAL(18,3)`).
   - معالجة تبعية محفّز PostgreSQL `protect_received_order_terms` على `PurchaseOrderItem.unitPrice` بإسقاطه وإعادة إنشائه مطابقًا داخل نفس الترحيل.
   - التحقق من تطبيق الترحيلات الـ `66` كاملةً من الصفر على قاعدة الاختبار المعزولة (`prisma migrate reset --force` + `prisma migrate diff --exit-code`: `No difference detected.`).
3. **تحديث حدود التطبيق (`WAC` وأسعار الوحدات والنسب):**
   - تحديث `PurchasesService` (`normalizeLines` و`approvePurchaseInvoice`)، `ProcurementService` (`createPODirect`)، `goods-receipt.ts`، `InventoryService` (`upsertProductUom` بـ 6 خانات و`createProduct` بـ 4 خانات)، `InventoryCountService`، `RecallDisposalService`، `manual-stock-adjustment.ts`، و`GatewayClearingLedgerService` (`feeRate` بـ 6 خانات) للاستفادة الكاملة من `Money.toUnitDbString` (`4dp`) و`Money.toRateDbString` (`6dp`) مع إبقاء القيود النهائية على `Money.toDbString` (`3dp`).
   - إضافة اختبار تكامل في [direct-purchase-approval-integrity.e2e-spec.ts](file:///d:/SarayaERP/server/test/e2e/direct-purchase-approval-integrity.e2e-spec.ts) يثبت حفظ `0.4167` في `DECIMAL(19,4)` لـ `Product.costPrice` و`ProductStock.unitCost` مع ترحيل `125.010` إلى الأستاذ العام `DECIMAL(18,3)`، وارتفاع دقة `WAC` في الشراء المباشر إلى `2.3333`.

---

## 3. نتائج بوابات التحقق والاختبارات الفعلية

1. **سلامة الترحيل والمخطط (`PostgreSQL` المعزول):**
   - تطبيق جميع الترحيلات الـ **`66`** من الصفر (`prisma migrate reset --force`): ناجح بدون أخطاء.
   - فحص الانحراف (`prisma migrate diff --exit-code`): **`No difference detected.`** (`drift = 0`).
2. **الفحوص الساكنة وحوكمة الصلاحيات (`Static Checks & ABAC`):**
   - `npm run lint:ci`: ناجح دون أي خطأ جديد (`4307` خطأً تاريخيًا و`584` تحذيرًا عبر `623` ملفًا).
   - `npm run typecheck` و`npm run build`: ناجحان (`0` أخطاء).
   - `node generate-audit-report.cjs --check`: تغطية **`100/100`** (`88/88` فعليًا، `100%` ABAC وTenant Isolation).
3. **اختبارات الوحدة للخادم (`Unit Tests`):**
   - **`91/91` مجموعة = `770/770` اختبارًا ناجحًا** (`0` متخطى، `43.731 s`) شاملة اختبارات الدقة الثلاثية في [money.util.spec.ts](file:///d:/SarayaERP/server/src/common/utils/money.util.spec.ts).
4. **اختبارات التكامل المعزولة (`Isolated E2E` على الترحيل `#66`):**
   - التشغيل الشامل (`scratch/phase4-batch3-20261123/full-e2e.log`): اجتازت `30/32` مجموعة (`557/564` اختبارًا) من المرة الأولى، وأثبتت الحالتان المتبقيتان في `direct-purchase-approval-integrity` و`goods-receipt-integrity` انخفاض فرق تقريب تقييم `WAC` من `-0.002 د.ل` إلى **`0.000 د.ل`** (`2.3333` بدل `2.333`).
   - بعد تحديث توقعات الحالتين وإعادة التشغيل المعزول:
     - `direct-purchase-approval-integrity.e2e-spec.ts`: **`9/9`** ناجحة (بما فيها اختبار سعر الجملة بـ 4 خانات `0.4167 × 300 = 125.010`).
     - `goods-receipt-integrity.e2e-spec.ts`: **`30/30`** ناجحة (`28.535 s`).
   - المجموع الموحّد على الترحيل `#66`: **`32/37` مجموعة = `559/564` اختبارًا ناجحًا** (`0` فاشل، و`5` متخطاة بأعلام البيئة).
