# سلامة شركات التأمين والوثائق والخطط وحساب التغطية والموافقات المسبقة وتسوية المطالبات ودورة الإيرادات (RCM) — 2026-11-08

## 1. نطاق الدفعة والبنود المرتبطة
ترتبط هذه الدفعة ببنود السجل الموحد [`REMEDIATION_REGISTER_2026-11-07_AR.md`](REMEDIATION_REGISTER_2026-11-07_AR.md):
- **`FLOW03`**: سلامة دورة التأمين ومدقق المطالبات والربط بين الوثائق والخطط والموافقات المسبقة وتسوية المطالبات ودورة الإيرادات (`RCM`).
- **`FLOW04`**: توحيد الحسابات المالية وفق مكتبة [`Money`](../server/src/common/utils/money.util.ts) (`DECIMAL(18,3)` وتقريب `ROUND_HALF_EVEN`) في خطط وبوالص التأمين وتسوية المطالبات وتحصيل ومؤشرات `RCM` وشاشة مطالبات التأمين.
- **`SEC03`**: عزل المستأجرين (`hospitalId`) على جميع مسارات شركات التأمين والبوالص والخطط وقواعد التغطية والموافقات المسبقة ومسارات مطالبات دورة الإيرادات (`rcm/claims`).
- **`OPS03` / `FIN02`**: الذرية المحاسبية والتدقيق المتسلسل (`appendChainedAuditInTransaction`) وحماية قيد تسوية مطالبات التأمين (`postingKey: insurance-claim-settlement:...`) من العكس اليدوي والتكرار المتزامن.

---

## 2. الثغرات التي تم تشخيصها وإغلاقها

### أ) عزل المستأجرين وتطبيع نسب التحمل وصلاحية التواريخ في التأمين (`InsuranceController` / `InsuranceService` — `SEC03` / `FLOW03` / `FLOW04`)
1. **غياب عزل المنشأة (`hospitalId`) في عمليات الكتابة والقراءة الفرعية**:
   - كانت دوال `createPolicy`، `createPlan`، `getPlanDetails`، `addCoverageRule`، `updatePreAuth`، `updateProvider`، و`softDeleteProvider` في [`insurance.controller.ts`](../server/src/insurance/insurance.controller.ts) و[`insurance.service.ts`](../server/src/insurance/insurance.service.ts) تعمل بمعرف السجل فقط دون التحقق من ملكية المنشأة (`req.user.hospitalId`).
   - **الإصلاح**: تمرير `req.user.hospitalId` وإلزام التحقق من تبعية الشركة والخطة وقائمة الأسعار وفئة الخدمة والخدمة والمريض والموافقة المسبقة للمنشأة قبل أي قراءة أو تعديل.
2. **تطبيع نسب التحمل (`patientCopayRate` و`defaultCopayRate`) ومنع القيم السالبة والتواريخ المعكوسة**:
   - حقول `patientCopayRate` و`defaultCopayRate` معرفة في قاعدة البيانات بدقة `@db.Decimal(5, 4)` (`0.0000` إلى `1.0000`).
   - **الإصلاح**: إضافة `normalizeCopayFraction` لتطبيع المدخلات المئوية (`20` $\rightarrow$ `0.2000`) أو المعاملات العشرية (`0.20` $\rightarrow$ `0.2000`) ورفض القيم خارج النطاق `[0, 100]`، والتحقق من أن `endDate >= startDate` وأن السقوف المالية موجبة ومكتوبة عبر `Money.toDbString`.
3. **حماية التعطيل الناعم لشركة التأمين (`softDeleteProvider`)**:
   - **الإصلاح**: منع تعطيل شركة التأمين (`400 BadRequestException`) إذا كان عليها مطالبات فواتير معلقة أو مرسلة (`claimStatus IN ('PENDING', 'SUBMITTED')`) لم تُسوَّ بعد.

### ب) إحكام محرك حساب التغطية التأمينية والموافقات المسبقة (`InsuranceCalculationService` — `FLOW03` / `SEC03`)
- في [`insurance-calculation.service.ts`](../server/src/insurance/insurance-calculation.service.ts):
  1. لم يكن المحرك يتحقق من تاريخ بداية الوثيقة (`policy.startDate > now`) أو حالة تفعيل شركة التأمين (`policy.provider.isActive === false`) أو تطابق المنشأة (`hospitalId`) بين المريض والوثيقة والخدمة.
  2. عند التحقق من وجود موافقة مسبقة (`PreAuthorization`)، كان المحرك يقبل أي موافقة بحالة `APPROVED` حتى لو انتهت صلاحيتها (`expiresAt < now`)!
  - **الإصلاح**: التحقق الصارم من نشاط الشركة وصلاحية فترة الوثيقة (`startDate <= now <= endDate`) وتطابق المنشأة، واشتراط `OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]` مع `hospitalId` عند استعلام الموافقة المسبقة المعتمدة.

### ج) ذرية تسوية مطالبات التأمين ومنع الازدواجية المحاسبية (`InsuranceService.updateClaimsStatus` — `FLOW03` / `FLOW04` / `FIN02` / `OPS03`)
- في [`insurance.service.ts`](../server/src/insurance/insurance.service.ts):
  1. كانت الفواتير تُقرأ خارج المعاملة دون قفل، وتُجمع حصص التأمين بـ `Number(inv.insuranceShare)`، ولم يكن يتم منع إعادة تسوية مطالبة مسددة (`PAID`) أو ملغاة (`CANCELLED`).
  2. **الإصلاح**:
     - فرض قفل استشاري (`SELECT pg_advisory_xact_lock(27007, ${hospitalId}::int)`) وقفل صفوف الفواتير (`SELECT id FROM "Invoice" ... FOR UPDATE`) بترتيب معرفات تصاعدي لمنع الجمود (`Deadlock`) والتسوية المزدوجة المتزامنة.
     - حساب إجمالي التحصيل التأميني عبر `Money.sumPosted` و`Money.toDbString`، واستخدام `financialPeriod(tx, hospitalId, entryDate)` وإنشاء قيد محاسبي محمي بـ `postingKey = insurance-claim-settlement:${hospitalId}:${uniqueInvoiceIds.join(',')}`.
     - تحديث حالة كل فاتورة (`PAID` أو `PARTIALLY_PAID`) باستخدام `Money.decimal` و`Money.subtractDecimal` وفق سماحية الفروقات، وتسجيل تدقيق متسلسل ذري (`appendChainedAuditInTransaction`) داخل نفس المعاملة.
     - إضافة البادئة `'insurance-claim-settlement:'` إلى قائمة القيود المحمية من العكس اليدوي في [`accounting.service.ts`](../server/src/accounting/accounting.service.ts)، وإضافة ربط `SystemAccountKey.RECEIVABLE_INSURANCE` (`120200`) تلقائيًا في `AccountingService.ensureDefaultAccounts`.

### د) إحكام دورة الإيرادات (`ClaimController` / `ClaimService` / `DenialManagementService` — `FLOW03` / `FLOW04` / `SEC03`)
- في [`claim.controller.ts`](../server/src/rcm/claim.controller.ts) و[`claim.service.ts`](../server/src/rcm/claim.service.ts) و[`denial-management.service.ts`](../server/src/rcm/denials/denial-management.service.ts):
  1. تمرير `user.hospitalId` صراحةً إلى جميع مسارات `ClaimController` (`getClaimById`، `scrubClaim`، `updateStatus`، `postPayment`، `denyClaim`، `appealClaim`)، ورمي `NotFoundException` (`404`) عند طلب مطالبة غير موجودة أو تابعة لمنشأة أخرى.
  2. وضع `createClaim` داخل معاملة ذرية محمية بالقفل الاستشاري `pg_advisory_xact_lock(27008, ${hospitalId}::int)` لمنع إنشاء مطالبتين متزامنتين لنفس الفاتورة، ورفض الفواتير الملغاة أو التي لا تحمل حصة تأمينية موجبة (`Money.lte(invoice.insuranceShare, 0)`).
  3. في `postPayment`: التحقق من أن `paidAmount > 0` و`adjustmentAmount >= 0`، ورفض الدفع على المطالبات الملغاة (`VOID`) أو المرفوضة (`REJECTED`) أو المسددة (`PAID`)، ومنع تجاوز إجمالي المدفوع والتسويات التعاقدية لقيمة المطالبة (`Money.gt(totalSettled, claimedAmount)`).
  4. ترحيل حسابات لوحة تحكم المطالبات وتحليلات المرفوضات وشاشة [`InsuranceClaimsPage.tsx`](../client/src/pages/InsuranceClaimsPage.tsx) إلى `Money`.

---

## 3. التحقق والأدلة
- **ملف الاختبار التكاملي (E2E)**: [`server/test/e2e/insurance-claims-rcm-integrity.e2e-spec.ts`](../server/test/e2e/insurance-claims-rcm-integrity.e2e-spec.ts) — **ناجح بالكامل (`3 passed, 3 total` في `11.635 s`)** على PostgreSQL وRedis المعزولين (`scratch/insurance-rcm-20261108/e2e-focused.log`).
- **الحالات المغطاة**:
  1. عزل المستأجرين وتطبيع نسب التحمل والتحقق من تواريخ البوليصة وانتهاء صلاحية الموافقات المسبقة (`PreAuthorization.expiresAt`) وسقف التحمل (`maxCopayAmount`) في `InsuranceCalculationService`.
  2. تسوية مطالبات التأمين المتزامنة (`201` مقابل `400`)، والتراجع الكامل عند فشل التدقيق (`trg_fail_insurance_claim_audit`)، وتوازن القيد المحاسبي (`400.000 LYD`)، وحمايته من العكس اليدوي، ومنع تعطيل شركة التأمين بوجود مطالبات معلقة.
  3. منع ازدواجية إنشاء مطالبات `RCM` بالتوازي، وعزل المستأجرين على جميع المسارات (`404`)، والتحقق من الدفعات الجزئية والتسويات التعاقدية ومنع الدفع الزائد، ودقة مؤشرات لوحة التحكم وتحليلات الرفض.

---

## 4. المتبقي خارج نطاق هذه الدفعة
- تبقى اختبارات التكامل الخارجي الفعلي مع منصة `NPHIES` (`CAP13`) ومرفقات `PreAuth` الفعلية (`SEC05` / `UI07`) ومطابقة الكشوف البنكية (`CAP09`) مفتوحة وفق السجل الموحد.
