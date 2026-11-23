# التوقيع الإلكتروني غير القابل للتعديل للملاحظات السريرية والملحقات (`CAP07`) — 2026-11-24

**المعرفات المرتبطة في السجل الموحد:** `CAP07`، `OPS02`، `OPS03`، `SEC03`، `QA01`  
**الدفعة:** الدفعة 13 (المرحلة 5 — التوقيع الإلكتروني الطبي غير القابل للإنكار، قفل قاعدة البيانات PostgreSQL، التوقيع المشترك بـ 4 عيون، والملحقات السريرية)

---

## 1. ملخص النطاق المنفّذ

1. **نموذج البيانات وقفل عدم القابلية للتعديل في PostgreSQL (الترحيل `#67`: `20261124000000_clinical_note_signature_immutability`):**
   - إضافة الحقول `addendumReason` (`VARCHAR(255)`) و`signatureHash` (`VARCHAR(64)`) و`coSignatureHash` (`VARCHAR(64)`) وفهرس `ClinicalNote_parentNoteId_idx` على جدول `ClinicalNote` في `server/prisma/schema.prisma`.
   - إضافة ثلاثة قيود تحقق صارمة (`CHECK`):
     - `ClinicalNote_sign_fields_chk`: إلزام اقتران `signedAt` و`signedById` وبصمة `signatureHash` سداسية عشرية بطول 64 محرفًا (`SHA-256`).
     - `ClinicalNote_cosign_fields_chk`: إلزام سبق التوقيع الأساسي، واستقلالية الموقّع المشترك (`coSignedById <> signedById` — رقابة 4 عيون على مستوى قاعدة البيانات)، واقتران `coSignatureHash` بطول 64 محرفًا.
     - `ClinicalNote_addendum_hierarchy_chk`: منع الملاحق اليتيمة أو الربط الذاتي (`parentNoteId <> id`).
   - إضافة محفّز PostgreSQL `clinical_note_immutability_guard` (`guard_clinical_note_immutability()`, `BEFORE INSERT OR UPDATE OR DELETE`):
     - يمنع تعديل محتوى أو نوع أو بيانات التوقيع الأساسي لأي ملاحظة موقّعة، ويمنع الحذف الفعلي لأي ملاحظة موقّعة أو مرتبط بها ملاحق.
     - يسمح بانتقال واحد فقط لحقول التوقيع المشترك من `NULL` إلى قيمة صالحة، ثم يقفل الصف بالكامل ضد أي تعديل لاحق.
     - يتحقق عند الإدراج من أن أي ملحق (`isAddendum = true`) مرتبط بملاحظة أصلية موقّعة في نفس الزيارة (`encounterId`) وليست بدورها ملحقًا.
   - التحقق من الترحيلات: `prisma migrate reset --force --skip-seed` نجح بتطبيق الترحيلات الـ 67 من الصفر، و`prisma migrate diff --exit-code` أعاد **`No difference detected.`** (صفر انحراف).

2. **منطق الخادم والتدقيق الذري وفصل الصلاحيات (`server/src/clinical-notes/` و`server/prisma/seed.ts`):**
   - تحديث `ClinicalNotesService` (`clinical-notes.service.ts`) بدوال التوقيع الرقمي `computeClinicalNoteSignatureHash` و`computeClinicalNoteCoSignatureHash` (`SHA-256` معياري على المحتوى والهوية والطابع الزمني).
   - إحكام دورة الحياة الكاملة داخل معاملات Prisma ذرية مع قفل `SELECT ... FOR UPDATE` وسلسلة التدقيق المترابطة `appendChainedAuditInTransaction` وبث `publishCommittedCriticalAudit`:
     - `POST /clinical-notes` (`create`): منع الملاحظات الفارغة، والتحقق من تراتبية الملحق وقفل الملاحظة الأصلية، وتسجيل `CLINICAL_NOTE_CREATED` أو `CLINICAL_NOTE_ADDENDUM_CREATED`.
     - `PATCH /clinical-notes/:id` (`updateDraft`) و`DELETE /clinical-notes/:id` (`deleteDraft`): محصوران بالمسودات غير الموقّعة ولكاتب المسودة فقط (`403` لغير الكاتب، `409` بعد التوقيع، `404` عبر المنشآت).
     - `POST /clinical-notes/:id/sign` (`signNote`): توقيع إلكتروني ذري مرة واحدة للكاتب (`409` عند التزامن أو إعادة المحاولة)، ونقل إطلاق حدث المتابعة الذكية `clinical.note.plan_saved` ليصدر **فقط بعد التوقيع الإلكتروني** (بدلاً من إطلاقه على المسودات غير المعتمدة).
     - `POST /clinical-notes/:id/cosign` (`coSignNote`): يتطلب صلاحية مستقلة `clinical-notes:cosign` ويفرض رقابة 4 عيون (`403` عند محاولة التوقيع المشترك الذاتي، `400` قبل التوقيع الأساسي، `409` عند إعادة التوقيع المشترك).
     - `GET /clinical-notes/:id/verify` (`verifyIntegrity`): إعادة احتساب البصمة الرقمية للتحقق الفوري من سلامة التوقيع والتوقيع المشترك.
   - إضافة الصلاحيات المفقودة في `server/prisma/seed.ts`: `clinical-notes:view` و`clinical-notes:manage` و`clinical-notes:cosign` وتوزيعها على `ADMIN` و`DOCTOR` و`NURSE` (دون منح `cosign` للتمريض).
   - تفعيل `@AuditInTransaction()` على جميع مسارات الكتابة في `ClinicalNotesController`، وتحديث `EncountersService.findOne` لإرجاع الملاحظات الأساسية مع `signedBy` و`coSignedBy` والملاحق المتداخلة `appendages`، وإضافة حارس في `FollowUpListener` لمنع نداءات Gemini الخارجية في بيئة الاختبار المعزولة ما لم يُفعّل `ALLOW_LIVE_AI_IN_TESTS=true`.

3. **واجهة المستخدم (`client/src/components/clinical/ClinicalNoteCard.tsx` و`EncounterDetailsPage.tsx`):**
   - بناء مكون `ClinicalNoteCard` لعرض حالة الملاحظة (`مسودة غير موقّعة` / `موقّعة ومقفلة` / `توقيع مشترك`)، وبصمة `SHA-256` المختصرة، وعمليات تعديل/حذف/توقيع المسودة، والتوقيع المشترك (مخفي عن الطبيب الموقّع ومقيد بصلاحية `clinical-notes:cosign`)، وإنشاء وتوقيع الملاحق السريرية (`Addenda`)، والتحقق الحي من سلامة البصمة الرقمية، وربطه في `EncounterDetailsPage.tsx`.
   - إنشاء اختبار مكون في `client/src/components/clinical/ClinicalNoteCard.test.tsx`.

---

## 2. نتائج التحقق والأدلة المنفّذة

### أ. بوابات الخادم والعميل والتدقيق الساكن

| البوابة | النتيجة | التفاصيل |
|---|---|---|
| ترحيلات Prisma + Diff | **نجاح (`0` انحراف)** | `67/67` ترحيلًا من الصفر و`prisma migrate diff --exit-code` = `No difference detected.` |
| `node generate-audit-report.cjs --check` | **نجاح (`100/100`)** | `88/88` فعليًا (`100%` تغطية ABAC وعزل المنشآت) |
| الخادم: `npm.cmd run lint:ci` | **نجاح (0 أخطاء جديدة)** | `4305` خطأً تاريخيًا و`584` تحذيرًا عبر `627` ملفًا |
| الخادم: `npm.cmd run typecheck` | **نجاح (0 أخطاء)** | — |
| الخادم: `npm.cmd run build` | **نجاح (0 أخطاء)** | — |
| الخادم: `npm.cmd test -- --runInBand` | **نجاح (`93/93` مجموعة)** | **`775/775` اختبارًا ناجحًا**، `0` متخطى، خلال `50.354 s` |
| العميل: `npm.cmd run lint` | **نجاح (`0` أخطاء)** | `88` تحذيرًا تاريخيًا |
| العميل: `npm.cmd test -- --run` (Vitest) | **نجاح (`44/44` ملفًا)** | **`260/260` اختبارًا ناجحًا** خلال `26.07 s` |
| العميل: `npm.cmd run build` | **نجاح (`11.37 s`)** | `PWA` precache `246` عنصرًا |

### ب. اختبارات التكامل المعزولة (`scripts/test-isolated-repair.ps1` على Docker PostgreSQL/Redis بـ 67 ترحيلًا)

السجلات محفوظة محليًا تحت `scratch/phase5-batch13-20261124/`:

| المجموعة | النتيجة | المدة |
|---|---|---|
| `test/e2e/clinical-notes-signature.e2e-spec.ts` | **`1/1` ناجح (14 سيناريو متكاملًا)** | `10.768 s` |
| `test/e2e/multi-tenant-isolation.e2e-spec.ts` | **`2/2` ناجح** | `9.907 s` |
| `test/e2e/review-remediation.e2e-spec.ts` | **`39/39` ناجح** | `45.269 s` |
| **الإجمالي المركّز** | **`42/42` (`3/3` مجموعات، `0` فاشل)** | — |

---

## 3. المتبقي خارج نطاق هذه الدفعة

- شهادة التوقيع الرقمي بالمفتاح العام (`PKI / X.509`) أو إعادة التحقق بكلمة المرور/PIN عند التوقيع إذا اشترطتها الجهة التنظيمية، وتوسيع طباعة الملاحظات والملاحق الموقّعة بختم التحقق في تقارير `PDF`.
- القبول السريري والقانوني الميداني (`UAT01`) بمشاركة الأطباء وإدارة الجودة والسجلات الطبية.
