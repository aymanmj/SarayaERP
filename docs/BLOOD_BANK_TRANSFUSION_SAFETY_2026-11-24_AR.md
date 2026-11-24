# بنك الدم وسلامة نقل الدم واليقظة الدموية (CAP04 — الدفعة 18، الترحيل `#72`)

**التاريخ:** 2026-11-24  
**النطاق:** `CAP04` / `OPS02` / `OPS03` / `SEC03` / `QA01`  
**الترحيل:** `20261124100000_blood_bank_and_transfusion_safety` (الترحيل رقم `#72`)

## 1. الأهداف السريرية ومعايير السلامة (AABB / JCI IPSG.1 / Hemovigilance)
بناء منظومة متكاملة لبنك الدم وسلامة نقل الدم تمنع أخطاء فصائل الدم والوحدات غير المفحوصة مصليًا أو منتهية الصلاحية، وتفرض التحقق المزدوج بجانب السرير من ممرضين/أطباء مستقلين مع مسح باركود المريض وكيس الدم، وتربط تفاعلات نقل الدم تلقائيًا بوحدة الجودة وسلامة المرضى (`ClinicalIncident` بنوع `BLOOD_TRANSFUSION_REACTION`).

## 2. البنية التحتية وحماية قاعدة البيانات (الترحيل `#72`)
أُضيفت 4 جداول محمية في `server/prisma/schema.prisma` وترحيل `server/prisma/migrations/20261124100000_blood_bank_and_transfusion_safety/migration.sql`:
1. **`BloodUnit`:** مخزون وحدات الدم (`ISBT-128` فريد للمنشأة، `PRBC`/`WHOLE_BLOOD`/`FFP`/`PLATELETS`/`CRYOPRECIPITATE`، فصائل `O-`..`AB+`، الحجم، تواريخ السحب والانتهاء، موقع الحفظ، حالة الفحص المصلي `PENDING`/`CLEARED`/`REACTIVE_QUARANTINED`).
   - قيد `CHECK` (`BloodUnit_cleared_before_release_chk`) يمنع على مستوى PostgreSQL انتقال أي وحدة إلى `AVAILABLE`/`CROSSMATCHED`/`ISSUED`/`TRANSFUSED` ما لم يكن `screeningStatus = 'CLEARED'` مع توثيق `screenedById` و`screenedAt`.
   - محفّز `blood_unit_guard` يمنع `DELETE` وتغيير الهوية (`unitNumber`/`componentType`/`bloodGroup`/`collectedAt`) وتعديل الوحدات المتلفة.
2. **`BloodCrossmatch`:** سجل فحص التوافق المرتبط بالمريض والزيارة والوحدة بمدة صلاحية افتراضية `72` ساعة، وقيد 4 عيون (`verifiedById <> performedById`) ومحفّز `blood_crossmatch_guard` للتحقق من تطابق المنشأة والمريض والزيارة والوحدة ومنع `DELETE`.
3. **`BloodTransfusion`:** دورة الصرف والتحقق بجانب السرير والنقل والانتهاء/الإيقاف.
   - قيد `CHECK` (`BloodTransfusion_dual_verifier_chk` و`BloodTransfusion_bedside_interlock_chk`) يفرض على مستوى PostgreSQL عدم انتقال أي عملية نقل دم إلى `VERIFIED_BEDSIDE`/`IN_PROGRESS`/`COMPLETED` إلا بتوثيق **مُتحقّقَين مستقلَين (`bedsideVerifier2Id <> bedsideVerifier1Id`)** ومسح باركود إسوارة المريض وكيس الدم (`patientBandScanned = true AND bagBarcodeScanned = true`)!
   - محفّز `blood_transfusion_guard` يمنع `DELETE` وتعديل السجلات المنتهية بحالة `STOPPED_REACTION`/`RETURNED_UNUSED`.
4. **`BloodTransfusionEvent`:** سجل العلامات الحيوية والتفاعلات غير القابل للتعديل أو الحذف (`append-only`) بمحفّز `blood_transfusion_event_immutable_guard`.

## 3. طبقة الخدمات ومحرك التوافق والواجهة
- **محرك توافق `ABO/Rh`** (`server/src/blood-bank/blood-compatibility.util.ts`): يطبّق قواعد AABB المميّزة بين كريات الدم الحمراء `PRBC` (مع حظر نقل `Rh+` لمريض `Rh-`)، والدم الكامل `WHOLE_BLOOD` (تطابق `ABO` + `Rh`)، والبلازما والراسب القري `FFP`/`CRYOPRECIPITATE` (التوافق العكسي للبلازما)، والصفائح `PLATELETS`.
- **الخدمة والمتحكم (`BloodBankService` / `BloodBankController` / `BloodBankModule`):** مسارات `/blood-bank/*` محمية بـ `JwtAuthGuard` و`PermissionsGuard` و`@RequireFeature('LAB')` وصلاحيات `blood-bank:view` و`blood-bank:inventory:manage` و`blood-bank:crossmatch:manage` و`blood-bank:transfusion:manage` (المضافة في `seed.ts`) مع `@AuditInTransaction()` وسلسلة `AuditLog` وبث SIEM.
- **التصعيد التلقائي لليقظة الدموية (`reportTransfusionReaction`):** عند الإبلاغ عن تفاعل نقل دم، يُوقف النقل فورًا (`STOPPED_REACTION`)، وتُحجر وحدة الدم (`REACTED_QUARANTINED`)، ويُسجّل حدث غير قابل للتعديل، ويُنشأ تلقائيًا بلاغ `ClinicalIncident` من نوع `BLOOD_TRANSFUSION_REACTION` مرتبطًا بسجل النقل!
- **الواجهة الأمامية:** `client/src/components/labs/BloodBankModal.tsx` المدمجة في `client/src/pages/LabWorklistPage.tsx` مع اختبارات `BloodBankModal.test.tsx`.

## 4. أدلة التحقق والاختبارات المنفذة (بعد آخر تعديل)
- **الترحيلات والمخطط:** `prisma migrate reset --force` طبّق **`72/72`** ترحيلًا من الصفر، و`prisma migrate diff --exit-code` = **`No difference detected.`**.
- **تغطية ABAC والتفويض:** `node generate-audit-report.cjs --check` = **`105/105`** (`93/93` فعليًا، `100%`).
- **الخادم (`server`):**
  - `npm.cmd run lint:ci`: **`0` أخطاء جديدة** (`656` ملفًا، الدين التاريخي `4305` خطأً و`584` تحذيرًا دون رفع خط الأساس).
  - `npm.cmd run typecheck` و`npm.cmd run build`: `0` أخطاء.
  - `npm.cmd test -- --runInBand`: **`99/99` مجموعة = `791/791` اختبارًا ناجحًا** (`0` متخطى، `49.833 s`)، شاملة `blood-bank.service.spec.ts` (`3/3`).
- **العميل (`client`):**
  - `npm.cmd run lint`: `0` أخطاء (`88` تحذيرًا تاريخيًا).
  - `npm.cmd test -- --run` (`Vitest`): **`49/49` ملفًا = `269/269` اختبارًا ناجحًا** (`32.11 s`)، شاملة `BloodBankModal.test.tsx` (`2/2`).
  - `npm.cmd run build`: نجاح كامل خلال `12.10s`.
- **اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1` على الترحيل `#72`، السجلات في `scratch/phase5-batch18-20261124/`):**
  - `test/e2e/blood-bank-cap04.e2e-spec.ts`: **`1/1`** (`11.721 s`).
  - `test/e2e/lab-specimen-culture-cap02.e2e-spec.ts`: **`1/1`** (`9.604 s`).
  - `test/e2e/treasury-fx-reconciliation-cap09.e2e-spec.ts`: **`1/1`** (`10.222 s`).
  - **الإجمالي المركّز:** **`3/3`** مجموعات (`0` فاشل).

## 5. المتبقي المفتوح خارج نطاق هذه الدفعة
- بروتوكول النقل الإسعافي الطارئ غير المتوافق مسبقًا (`Emergency O- Uncrossmatched Release` بتوقيع طبيب الطوارئ وتوافق لاحق) وسجل التبرع/أهلية المتبرعين الكامل وطباعة ملصقات `ISBT-128`.
- القبول السريري والميداني (`UAT01`) مع فريقي بنك الدم والتمريض والجودة.
