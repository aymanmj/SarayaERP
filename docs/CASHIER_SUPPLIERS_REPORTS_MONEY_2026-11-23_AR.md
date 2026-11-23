# توثيق الدفعة العاشرة: توحيد الدقة المالية (`Money`) في الخزينة والموردين والتقارير التنفيذية وعزل السندات (`FLOW04` & `FIN02` & `CASH01` & `FIN03A` & `SEC03`)

**تاريخ التنفيذ:** `2026-11-23`  
**الارتباط بالسجل الموحد:** `FLOW04`، `FIN02`، `CASH01`، `FIN03A`، `SEC03`، `QA01` في [REMEDIATION_REGISTER_2026-11-07_AR.md](file:///d:/SarayaERP/docs/REMEDIATION_REGISTER_2026-11-07_AR.md)

---

## 1. ملخص تنفيذي

استكملت هذه الدفعة ترحيل آخر 3 دوال حيّة في `AccountingService` مع عزل المنشأة، وتوحيد تقارير وإيصالات وإقفال الشفت في `CashierService`، وتوحيد كشف الحساب وأعمار الذمم في `SuppliersService` (مع إزالة التقريب غير المصرفي `round3`)، وإصلاح بتر الدرهم الليبي إلى خانتين عشريتين في `ReportsService`، وتوحيد التقارير المجمعة العابرة للفروع في `ConsolidatedReportingService` على مكتبة `Money` (`ROUND_HALF_EVEN`).

---

## 2. الإصلاحات والتغييرات الجوهرية

1. **`AccountingService` (`server/src/accounting/accounting.service.ts`):**
   - ترحيل `recordSupplierPaymentEntry` و`recordCreditNoteEntry` و`recordVoucherEntry` إلى `Money.decimal` و`Money.toDbString` (لتصبح 100% من الدوال المالية الحيّة في `AccountingService` معتمدة على `Money`).
   - فرض عزل المنشأة (`where: { id, hospitalId }`) عند جلب الفاتورة الأصلية وإشعار المرتجع في `recordCreditNoteEntry` وإذن الصرف/القبض في `recordVoucherEntry` مع استبدال `prisma?: any` بـ `Prisma.TransactionClient`.
2. **`CashierService` (`server/src/cashier/cashier.service.ts`):**
   - **إصلاح إيصال الدفع (`getPaymentReceipt`):** تضمين التسويات المعتمدة (`adjustments: status='POSTED'`) والمرتجعات المنفّذة (`refunds: status='EXECUTED'`) في حساب `totalAmount` و`paidAmount` (الصافي عبر `netPaidAmount`) و`remainingAmount`، مع إرجاع `originalTotalAmount` و`adjustmentAmount` و`refundedAmount` بدقة `Money`.
   - **إصلاح إقفال الشفت (`closeCashierShift`):** خصم المرتجعات النقدية المنفّذة (`invoiceRefund` بحالة `EXECUTED` وطريقة `CASH`) خلال نافذة الشفت من `systemCashTotalDec` عبر `Money.subtractDecimal` لمنع ظهور عجز نقدي وهمي عند تنفيذ استرداد نقدي.
   - ترحيل `getInvoiceDetails` و`getPatientStatement` و`getDailyReport` و`getCashierUserReport` إلى `Money`.
3. **`SuppliersService` (`server/src/suppliers/suppliers.service.ts`):**
   - إزالة دالة `round3` (`Math.round(n * 1000) / 1000`) المخالفة للتقريب المصرفي، وترحيل `getSupplierStatement` و`getSuppliersAging` (بما يشمل خصم الأرصدة الدائنة غير الموزعة بترتيب FIFO على شرائح الأعمار) بالكامل إلى `Money` (`ROUND_HALF_EVEN`).
4. **`ReportsService` (`server/src/reports/reports.service.ts`):**
   - إصلاح بتر الدرهم الليبي (3 خانات) إلى خانتين (`Math.round(... * 100) / 100`) في `getDoctorPerformance` و`getRevenueByDepartment` وترحيل حساب العمولات إلى `Money.percentDecimal`.
   - توحيد `getFinancialSummary` على حدود الأشهر بتوقيت `UTC` وخصم المرتجعات المنفّذة (`invoiceRefund` `EXECUTED`) من صافي الإيرادات النقدية المحصلة، وترحيل `getOperationalStats` إلى `Money`.
5. **`ConsolidatedReportingService` (`server/src/common/tenant/consolidated-reporting.service.ts`):**
   - ترحيل `getConsolidatedRevenue` و`getBranchComparison` إلى `Money`، واستبعاد الفواتير الملغاة والمسودات (`status: { notIn: ['CANCELLED', 'DRAFT'] }`) من مقارنة إيرادات الفروع.

---

## 3. نتائج بوابات التحقق والاختبارات الفعلية

1. **الفحوص الساكنة وحوكمة الصلاحيات (`Static Checks & ABAC`):**
   - `npm run lint:ci`: ناجح دون أي خطأ جديد (انخفض إجمالي الأخطاء التاريخية في الخادم بـ 60 خطأً من `4367` إلى **`4307`** خطأً و`584` تحذيرًا عبر `623` ملفًا).
   - `npm run typecheck` و`npm run build`: ناجحان (`0` أخطاء).
   - `node generate-audit-report.cjs --check`: تغطية `100/100` (`88/88` فعليًا، `100%` ABAC وTenant Isolation).
2. **اختبارات الوحدة للخادم (`Unit Tests`):**
   - **`91/91` مجموعة = `769/769` اختبارًا ناجحًا** (`0` متخطى، خلال `45.931 s`)، بما فيها الحزمتان الجديدتان [suppliers.service.spec.ts](file:///d:/SarayaERP/server/src/suppliers/suppliers.service.spec.ts) و[reports.service.spec.ts](file:///d:/SarayaERP/server/src/reports/reports.service.spec.ts) وتوسعة [accounting.service.spec.ts](file:///d:/SarayaERP/server/src/accounting/accounting.service.spec.ts) و[cashier.service.spec.ts](file:///d:/SarayaERP/server/src/cashier/cashier.service.spec.ts).
3. **اختبارات التكامل المعزولة المباشرة (`Isolated E2E`, `scratch/phase4-batch2-20261123`):**
   - `refunds-cash-control.e2e-spec.ts`: `38/38` (`72.971 s`)
   - `invoice-adjustments.e2e-spec.ts`: `17/17` (`27.656 s`)
   - `purchase-returns.e2e-spec.ts`: `33/33` (`44.052 s`)
   - `review-remediation.e2e-spec.ts`: `39/39` (`41.690 s`)
   - الإجمالي المركز: **`127/127` اختبارًا ناجحًا (`0` فاشل)**.
