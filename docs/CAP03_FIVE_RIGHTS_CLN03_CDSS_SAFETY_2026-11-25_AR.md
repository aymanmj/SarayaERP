# الدفعة 27 (المرحلة السادسة) — إغلاق الحلقة السريرية الخماسية لسلامة الدواء (`CAP03` / `UI14`) وتحصين محرك القرار السريري وحزم الطلبات (`CLN03`) — الترحيل `#81`

**التاريخ:** 2026-11-25  
**البنود المغطاة:** `CAP03` و`UI14` (التحقق الفعلي من الحقوق الخمسة `5 Rights`: المريض + الدواء + الجرعة + طريق الإعطاء + نافذة الوقت)، `CLN03` (فحص التفاعلات الدوائية مع الوصفات النشطة، فحص وظائف الكلى `eGFR` للنتائج الأحادية، وتنفيذ أدوية حزم الطلبات `OrderSets` كحزمة ذرية بفحص `CDSS` شامل)، `OPS03`، `QA01`.

---

## 1. ما تم تنفيذه

### أ) قاعدة البيانات والترحيل `#81` (`20261125050000_cap03_five_rights_clma_and_cln03_cdss_safety`)
- توسعة جدول `MedicationAdministration` بالأعمدة:
  - `verificationScope` (`MANUAL` | `PATIENT_AND_DRUG` | `FULL_FIVE_RIGHTS`)
  - `verifiedDose` (`VARCHAR(120)`)
  - `verifiedRoute` (`VARCHAR(60)`)
  - `timeVarianceMinutes` (`INTEGER` — الفارق الموقّع بالدقائق عن الموعد المجدول `scheduledFor`)
- قيدا `CHECK` على مستوى `PostgreSQL`:
  - `MedicationAdministration_scope_chk` لحصر قيم `verificationScope`.
  - `MedicationAdministration_five_rights_chk` الذي يجعل تعيين `isVerified5Rights = true` **مستحيلاً رياضياً على مستوى قاعدة البيانات** ما لم تكن مطابقة الباركود ناجحة (`isBarcodeMatch = true`) ونطاق التحقق `FULL_FIVE_RIGHTS` مع توثيق الجرعة والطريق والموعد المجدول وفارق الوقت.

### ب) محرك الحقوق الخمسة السريري (`CAP03` / `UI14` — `NursingModule`)
- بناء [five-rights.util.ts](file:///d:/SarayaERP/server/src/nursing/five-rights.util.ts) واختباراته في [five-rights.util.spec.ts](file:///d:/SarayaERP/server/src/nursing/five-rights.util.spec.ts):
  1. **الحق الثالث (الجرعة):** `compareClinicalDoses` بدقة `Money.decimal` لتحويل ومقارنة الوحدات المترية (`0.5 g === 500 mg`، `500 mcg === 0.5 mg`، `1 L === 1000 mL`) ورفض أي اختلاف في القيمة أو البُعد.
  2. **الحق الرابع (طريق الإعطاء):** `compareClinicalRoutes` بتطبيع المترادفات السريرية الإنجليزية والعربية (`PO`/`ORAL`/`فموي`، `IV`/`INTRAVENOUS`/`وريدي`، `IM`/`INTRAMUSCULAR`، `SC`/`SUBQ`...) ورفض تعارض الطريق (مثل `PO` مقابل `IV`).
  3. **الحق الخامس (نافذة الوقت):** `evaluateTimeWindow` بنافذة أمان معيارية `±60 دقيقة` حول `scheduledFor` وتصنيف `ON_TIME` / `EARLY` / `LATE`.
- دمج المحرك في `medication-administration.ts` و`NursingService` و`NursingController` و`clma.dto.ts`:
  - الحفاظ الكامل على التوافق العكسي (حفاظاً على `RV09`): مسح المريض والدواء فقط يُسجّل كـ `PATIENT_AND_DRUG` و`isVerified5Rights = false`.
  - عند تمرير الجرعة والطريق والموعد المجدول: أي تعارض في الجرعة أو الطريق أو خارج نافذة الوقت **يُحظر تلقائياً (`400`)** ما لم يُفعّل تجاوز طارئ معتمد بصلاحية `nursing:medications:override` ومبرر `varianceReason` (`10–500` حرف)، وعند استيفاء الحقوق الخمسة واعتماد الصيدلي يُسجَّل `isVerified5Rights = true` في الجدول وفي سلسلة `AuditLog`.
- تحديث واجهة [MedicationAdministrationPane.tsx](file:///d:/SarayaERP/client/src/components/nursing/MedicationAdministrationPane.tsx) بإضافة حقلي تأكيد الجرعة وطريق الإعطاء الاختياريين وشارة **«التحقق الخماسي الكامل (5/5 Rights)»**.

### ج) تحصين محرك القرار السريري وحزم الطلبات (`CLN03` — `CDSSModule` + `OrderSetsModule`)
1. **التفاعلات الدوائية مع الأدوية النشطة (`CDSSService.checkPrescription`):** جلب جميع الوصفات النشطة (`status: 'ACTIVE'`) للمريض ضمن نفس المنشأة وفحص التفاعلات بين الأدوية الجديدة والأدوية الجارية حالياً (مثل وصف `Aspirin` لمريض يتناول `Warfarin` حالياً).
2. **فحص وظائف الكلى `eGFR` للنتائج الأحادية (`CDSSService.checkRenalAdjustment`):** قراءة أحدث نتيجة كرياتينين من كلا المصدرين: النتائج متعددة البراميترات (`LabOrderResult`) والنتائج الأحادية (`LabOrder.resultValue` لرموز `CREA`/`CREAT`/`SCR`/`CREATININE`) مع اختيار الأحدث زمنياً.
3. **تنفيذ حزم الطلبات الدوائية كحزمة ذرية (`OrderSetsService.execute` + `OrderSetsController`):**
   - تجميع كافة بنود `MEDICATION` داخل حزمة الطلبات المنشورة في **استدعاء موحّد واحد** لـ `PharmacyService.createPrescriptionForEncounter` بدلاً من صرفها منفردة واحداً تلو الآخر، مما يكشف التفاعلات الدوائية المتبادلة داخل نفس الحزمة قبل إنشاء أي وصفة.
   - عدم ابتلاع خطأ `SAFETY_WARNING` (`BadRequestException`) وإرساله للطبيب مع دعم `overrideSafety` و`overrideReason` الصريحين، وإصلاح القيمة الافتراضية الخاطئة للطريق (`ORAL` بدلاً من `PO`) والتكرار (`DAILY` بدلاً من `OD`).

---

## 2. أدلة التحقق المنفذة

| الفحص / البوابة | النتيجة | التفاصيل |
|---|---|---|
| ترحيل PostgreSQL المعزول من الصفر | **ناجح** | `prisma migrate reset --force` طبّق **81/81** ترحيلاً + `prisma generate` (`v6.19.3`) |
| تطابق المخطط (`migrate diff`) | **ناجح** | `No difference detected.` (`drift = 0`) |
| فحوص التوطين وعزل المنشآت وتغطية ABAC | **ناجح** | `i18n`: `7401` + `40`؛ عزل المنشآت: `111`؛ `ABAC`: **`111/111`** (**`99/99`** فعّال = `100%`) |
| `server` `lint:ci` + `typecheck` + `nest build` | **ناجح** | `0` أخطاء جديدة وانخفاض الدين التاريخي إلى **`4265`** خطأً عبر `703` ملفات، `0` أخطاء TypeScript، بناء سليم |
| اختبارات وحدة الخادم (`jest --runInBand`) | **ناجح** | **`108/108`** حزمة = **`824/824`** اختباراً ناجحاً، `0` متخطى (`49.968 s`) |
| `client` `lint` + `Vitest` + `vite build` | **ناجح** | `0` أخطاء lint، **`57/57`** ملفاً = **`284/284`** اختباراً ناجحاً، بناء PWA سليم (`15.98 s`) |
| اختبارات التكامل `E2E` المعزولة (`scripts/test-isolated-repair.ps1`) | **ناجح** | `cap03-five-rights-cln03-cdss` + تراجع `CLMA` + `review-remediation` (`39/39` شاملة `RV02`/`RV03`/`RV09`) — السجلات في `scratch/phase6-batch27-20261125/` |

---

## 3. المتبقي المفتوح
- تجربة أجهزة قراءة الباركود الفعلية وقبول التمريض والصيدلة والأطباء ميدانياً (`UAT01`).
- إغلاق فجوة القبول السريري لمسارات المختبر والأشعة المتقدمة (`Westgard QC` / `RDSR`) وبقية بنود المرحلة السادسة.
