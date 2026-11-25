# الدفعة 26 (المرحلة السادسة) — إغلاق الحلقات المالية الطرفية: فوترة حزم الجراحة (`CAP08`) وفوترة موردي الأمانة (`CAP10`) — الترحيل `#80`

**التاريخ:** 2026-11-25  
**البنود المغطاة:** `CAP08` (ربط تسوية الحزمة الجراحية آلياً بفاتورة الخروج المقسّمة والقيد المحاسبي المجمّع)، `CAP10` (توليد فاتورة المورد والقيد المحاسبي آلياً لاستهلاكات مستلزمات الأمانة `PENDING_BILLING -> BILLED`)، `FLOW04`، `OPS03`، `SEC03`، `QA01`.

---

## 1. خط أساس المرحلة السادسة — الانحدار الشامل على الترحيل `#79`
قبل البدء بالدفعة 26، أُعيد تشغيل **حزمة الانحدار الشاملة المعزولة الكاملة** عبر `scripts/test-isolated-repair.ps1` على جميع الترحيلات الـ 79 من الصفر:
- **النتيجة:** **`45/45`** مجموعة تكامل فعّالة = **`572/572`** اختباراً ناجحاً، **`0` فاشل** (مع `5` مجموعات اختيارية مشروطة بأعلام البيئة)، خلال `937.887 s` — السجل في `scratch/phase6-full-regression-20261125/full-e2e.log`.

---

## 2. ما تم تنفيذه في الدفعة 26 (الترحيل `#80`)

### أ) قاعدة البيانات والمحفّزات (`20261125030000_cap08_drg_invoicing_and_cap10_consignment_ap_billing`)
1. **`EncounterPackageEnrollment` (`CAP08`):**
   - إضافة الأعمدة `invoiceId` (`@unique` بمرجع `Invoice` `ON DELETE RESTRICT`)، و`insuranceShare`/`patientShare` (`DECIMAL(18,3)`)، و`invoicedAt`، و`invoicedById`.
   - قيد `CHECK` (`EncounterPackageEnrollment_invoice_link_chk`) يلزم عند وجود `invoiceId` أن تكون الحالة `SETTLED` ومجموع `insuranceShare + patientShare = netBillableTotal`.
   - ترقية محفّز `encounter_package_enrollment_guard()` ليسمح **لمرة واحدة ذرية فقط** بربط `invoiceId` عندما يكون `OLD.invoiceId IS NULL` مع تجميد كافة حقول التسوية والمبالغ وبصمة `SHA-256`، ثم يرفض أي تعديل أو حذف لاحق على مستوى `PostgreSQL`.
2. **`ConsignmentConsumption` (`CAP10`):**
   - إضافة الأعمدة `purchaseInvoiceId` (بمرجع `PurchaseInvoice` `ON DELETE RESTRICT`)، و`billedAt`، و`billedById` مع فهارس `[hospitalId, supplierBillStatus]` و`[purchaseInvoiceId]`.
   - قيد `CHECK` (`ConsignmentConsumption_billing_link_chk`) يلزم وجود `purchaseInvoiceId`/`billedAt`/`billedById` لكل سجل خرج من `PENDING_BILLING`.
   - ترقية محفّز `guard_consignment_consumption_immutable()` لمنع التراجع من `BILLED`/`SETTLED` إلى `PENDING_BILLING` أو تغيير ربط فاتورة المورد على مستوى `PostgreSQL`.

### ب) الحلقة الطرفية لفوترة حزم الجراحة (`CAP08` — `SurgeryModule`)
- **محرك التقسيم الصرف (`computePackageInvoiceSplit` في `surgical-package.util.ts`):** تقسيم المبلغ المستحق بين التأمين والمريض بدقة `Money` (`ROUND_HALF_EVEN`) مع خيار تغطية سعر الحزمة الأساسي فقط أو شمول الفوائض (`coverOverage`) وسقف التغطية الأقصى (`maxCoverageAmount`)، وضمان `insuranceShare + patientShare === netBillableTotal` حتى آخر درهم (`0.001`).
- **الخدمة والمسار (`POST /surgery/packages/enrollments/:id/generate-invoice`):**
  - قفل استشاري `pg_advisory_xact_lock` وأقفال `FOR UPDATE` على التسجيل والمريض والزيارة.
  - رفض الفوترة قبل `SETTLED` أو الفوترة المكررة (`409 Conflict`) ورفض المنشأة الأجنبية (`404 Not Found`).
  - إصدار فاتورة خروج (`Invoice` بحالة `ISSUED`) مع لقطة `DRG` مفصّلة في `lineSnapshot`، وربط كافة رسوم `EncounterCharge` غير المفوترة لمنع ازدواج الفوترة نهائياً.
  - ترحيل قيد محاسبي مجمّع متوازن (`AccountingEntry` بمفتاح `invoicePostingKey`):
    - **مدين:** ذمم المرضى (`patientShare`) + ذمم التأمين/حساب شركة التأمين (`insuranceShare`).
    - **دائن:** إيراد العمليات (`packagePrice`) + إيرادات كل فئة فائض (`ROOM`/`LAB`/`RADIOLOGY`/`PHARMACY`/`OUTPATIENT`) بقيم موجبة بالكامل دون أي سطر دائن سالب حتى عند تجاوز التكلفة الفعلية لسعر الحزمة.
  - تسجيل `AuditLog` متسلسل (`ENCOUNTER_PACKAGE_INVOICED`) وبث `SIEM` بعد الالتزام.

### ج) الحلقة الطرفية لفوترة موردي الأمانة (`CAP10` — `InventoryModule`)
- **المساران الجديدان في `ControlledConsignmentController`:**
  - `GET /inventory/governance/consignments/pending-billing`: عرض الاستهلاكات المعلّقة (`PENDING_BILLING`) حسب المورد والمنشأة.
  - `POST /inventory/governance/consignments/generate-supplier-invoice`: تجميع الاستهلاكات المختارة (أو كافة المعلّقة للمورد) بقفل `pg_advisory_xact_lock` و`FOR UPDATE`، وإنشاء فاتورة مورد معتمدة (`PurchaseInvoice` بحالة `APPROVED`) بأسطر `PurchaseInvoiceLine` موجّهة إلى حساب تكلفة المستلزمات (`COGS_SUPPLIES`/`COGS_DRUGS`/`500200`) دون إعادة تضخيم أصول المخزون، واستدعاء `AccountingService.recordPurchaseInvoiceEntry` ذرياً داخل نفس المعاملة (مدين تكلفة المستلزمات / دائن الموردين `200100`)، ثم ترقية كل استهلاك إلى `BILLED` مع ربط `purchaseInvoiceId` وتسجيل `AuditLog` متسلسل (`CONSIGNMENT_SUPPLIER_INVOICE_GENERATED`).

### د) واجهات العميل (`client/`)
- تحديث `SurgicalPackagesModal.tsx` بإضافة زر **«إصدار فاتورة الخروج (DRG)»** للتسجيلات المسوّاة وعرض شارة الفاتورة المرتبطة وتقسيم المريض/التأمين، وتوسيع `SurgicalPackagesModal.test.tsx`.
- تحديث `ControlledConsignmentModal.tsx` بإضافة زر **«إصدار فاتورة مورد (AP)»** لاستهلاكات الأمانة المعلّقة، وتوسيع `ControlledConsignmentModal.test.tsx`.

---

## 3. أدلة التحقق المنفذة

| الفحص / البوابة | النتيجة | التفاصيل |
|---|---|---|
| الانحدار الشامل قبل الدفعة 26 (الترحيل `#79`) | **ناجح** | `45/45` مجموعة فعّالة = `572/572` اختباراً (`0` فاشل، `5` اختيارية) |
| ترحيل PostgreSQL المعزول من الصفر | **ناجح** | `prisma migrate reset --force` طبّق **80/80** ترحيلاً + `prisma generate` (`v6.19.3`) |
| تطابق المخطط (`migrate diff`) | **ناجح** | `No difference detected.` (`drift = 0`) |
| فحوص التوطين وعزل المنشآت وتغطية ABAC | **ناجح** | `i18n`: `7401` + `40`؛ عزل المنشآت: `111`؛ `ABAC`: **`111/111`** (**`99/99`** فعّال = `100%`) |
| `server` `lint:ci` + `typecheck` + `nest build` | **ناجح** | `0` أخطاء جديدة (`4267` دين تاريخي عبر `700` ملف)، `0` أخطاء TypeScript، بناء سليم |
| اختبارات وحدة الخادم (`jest --runInBand`) | **ناجح** | **`107/107`** حزمة = **`820/820`** اختباراً ناجحاً، `0` متخطى (`57.826 s`) |
| `client` `lint` + `Vitest` + `vite build` | **ناجح** | `0` أخطاء lint، **`57/57`** ملفاً = **`284/284`** اختباراً ناجحاً (`38.94 s`)، بناء PWA سليم (`17.59 s`) |
| اختبارات التكامل `E2E` المعزولة (`scripts/test-isolated-repair.ps1`) | **ناجح** | `cap08-drg-billing-cap10-consignment-ap` + `budgets-cashflow-surgical-packages-cap08` + `controlled-consignment-ward-cap10` (`3/3` ناجحة في `scratch/phase6-batch26-20261125/`) |

---

## 4. المتبقي المفتوح
- محرك التصنيف التلقائي `DRG Grouper` من رموز `ICD-10/CPT` وتحديث حالة استهلاك الأمانة إلى `SETTLED` تلقائياً عند سداد فاتورة المورد بالكامل عبر `SupplierPayment`.
- القبول المالي والسريري الميداني (`UAT01`).
