# الدفعة 28 (المرحلة السادسة) — استيراد كشوف البنك `CSV`/`MT940` وإعادة تقييم فروق العملة (`CAP09`)، وضبط الجودة `Westgard QC` (`CAP02`)، وتتبع الجرعة الإشعاعية `RDSR` (`CAP13`) — الترحيل `#82`

**التاريخ:** 2026-11-25  
**البنود المغطاة:** `CAP09` (استيراد كشوف البنك `CSV`/`MT940` وإعادة التقييم الدوري لفروق العملات غير المحققة)، `CAP02` (ضبط الجودة الداخلي للمختبر `Westgard QC` ومنحنيات `Levey-Jennings`)، `CAP13` (تتبع الجرعة الإشعاعية `RDSR` ومعاملات `ICRP-103` والتصعيد التراكمي للمريض)، `OPS03`، `SEC03`، `QA01`.

---

## 1. ما تم تنفيذه

### أ) قاعدة البيانات والترحيل `#82` (`20261125080000_cap09_fx_reval_cap02_westgard_qc_cap13_rdsr_dose`)
1. **`FxRevaluationRun` (`CAP09`):** سجل تشغيل إعادة التقييم الدوري للحسابات البنكية بالعملات الأجنبية بقيد تفرد `(hospitalId, bankAccountId, asOfDate)` وقيد `CHECK` على توازن `revaluedBalanceBase - bookBalanceBase = unrealizedGainLoss`، ومحفّز `trg_fx_revaluation_run_immutable` لمنع التعديل أو الحذف.
2. **`LabQcLot` و`LabQcRun` (`CAP02`):** تعريف تشغيلات ضبط الجودة (`LEVEL_1_LOW` / `LEVEL_2_NORMAL` / `LEVEL_3_HIGH`) بمتوسط وانحراف معياري موجب (`targetSd > 0`)، وسجل قراءات الجودة بحقول `zScore`/`status`/`violatedRules` ورقابة 4 عيون (`reviewedById <> performedById`) ومحفّز `trg_lab_qc_run_immutable` يمنع حذف القراءات أو التلاعب بالقياسات والقرارات.
3. **`RadiologyDoseRecord` (`CAP13`):** سجل الجرعة الإشعاعية المرتبط فريداً بـ `RadiologyOrder` مع حقول `CTDIvol` و`DLP` و`DAP` و`effectiveDoseMsv` و`kVp`/`mAs` و`exceedsDrl` والجرعة التراكمية لـ 12 شهراً (`cumulative12mMsv`)، ومحفّز `trg_radiology_dose_record_immutable` لمنع التعديل أو الحذف.

### ب) الخزينة والعملات المتقدمة (`CAP09` — `AccountingModule`)
- **محلل كشوف البنك ([bank-statement-parser.util.ts](file:///d:/SarayaERP/server/src/accounting/bank-statement-parser.util.ts)):** دعم صيغتي `CSV` (العمود الموقّع `Amount` أو عمودَي `Debit`/`Credit` مع الفواصل المحصورة بعلامات تنصيص) و**`SWIFT MT940`** (سطور `:61:` وسطور السرد `:86:`) بدقة `Money` (`ROUND_HALF_EVEN`).
- **الاستيراد وإعادة التقييم (`TreasuryFxController` & `BankReconciliationService`):**
  - `POST /accounting/treasury/reconciliations/:id/import-file` (`CSV` / `MT940`).
  - `GET/POST /accounting/treasury/fx-revaluations`: جلب سعر الإغلاق الموثّق بـ `DECIMAL(19,6)` وحساب الرصيد الدفتري للأستاذ العام حتى تاريخ الإقفال وترحيل قيد `AccountingEntry` متوازن للأرباح/الخسائر غير المحققة (`Bank <-> FX_GAIN_LOSS 400950`) داخل معاملة ذرية واحدة مع `AuditLog` متسلسل وبث `SIEM`.

### ج) ضبط الجودة المخبري `Westgard QC` (`CAP02` — `LabModule`)
- **محرك قواعد Westgard ([westgard-qc.util.ts](file:///d:/SarayaERP/server/src/labs/westgard-qc.util.ts)):** تقييم القواعد المعيارية الست (`1-3s`، `2-2s`، `R-4s`، `4-1s`، `10x` -> `REJECT`؛ و`1-2s` -> `WARNING`) مقابل آخر 9 قراءات زمنية.
- **المسارات (`LabQcController` & `LabQcService` — `/lab/qc/*`):** إدارة تشغيلات QC، تسجيل القراءات وتقييمها لحظياً، استخراج بيانات مخطط `Levey-Jennings` (`±1SD`/`±2SD`/`±3SD`)، ومراجعة الإجراء التصحيحي برقابة 4 عيون (`POST /lab/qc/runs/:id/review`).

### د) تتبع الجرعة الإشعاعية `RDSR` (`CAP13` — `RadiologyModule`)
- **محرك `ICRP-103` و`DRL` ([radiation-dose.util.ts](file:///d:/SarayaERP/server/src/radiology/radiation-dose.util.ts)):** حساب الجرعة الفعّالة `mSv` آلياً من `DLP × k-factor` حسب المنطقة التشريحية (`HEAD`, `NECK`, `CHEST`, `ABDOMEN`, `PELVIS`, `SPINE`...)، وفحص تجاوز مستويات المرجع التشخيصي (`DRL`)، وتتبع الجرعة التراكمية للمريض خلال 12 شهراً (تحذير عند `>= 50 mSv` وتصعيد تلقائي لحادثة سريرية `ClinicalIncident` بدرجة `MAJOR` عند `>= 100 mSv`).
- **المسارات (`RadiologyDoseController` & `RadiologyDoseService` — `/radiology/dose/*`):** تسجيل الجرعة لطلب الأشعة وعرض ملخص تعرض المريض التراكمي لـ 12 شهراً ومدى الحياة.

---

## 2. أدلة التحقق المنفذة

| الفحص / البوابة | النتيجة | التفاصيل |
|---|---|---|
| ترحيل PostgreSQL المعزول من الصفر | **ناجح** | `prisma migrate reset --force` طبّق **82/82** ترحيلاً + `prisma generate` (`v6.19.3`) |
| تطابق المخطط (`migrate diff`) | **ناجح** | `No difference detected.` (`drift = 0`) |
| فحوص التوطين وعزل المنشآت وتغطية ABAC | **ناجح** | `i18n`: `7401` + `40`؛ عزل المنشآت: `113`؛ `ABAC`: **`113/113`** (**`101/101`** فعّال = `100%`) |
| `server` `lint:ci` + `typecheck` + `nest build` | **ناجح** | `0` أخطاء جديدة (`4265` دين تاريخي عبر `716` ملفاً)، `0` أخطاء TypeScript، بناء سليم |
| اختبارات وحدة الخادم (`jest --runInBand`) | **ناجح** | **`111/111`** حزمة = **`830/830`** اختباراً ناجحاً، `0` متخطى (`49.148 s`) |
| اختبارات التكامل `E2E` المعزولة (`scripts/test-isolated-repair.ps1`) | **ناجح** | `cap09-fx-reval-cap02-qc-cap13-rdsr` + `treasury-fx-reconciliation-cap09` + `lab-modernization-p0` + `radiology-modernization-p0` (`4/4` ناجحة في `scratch/phase6-batch28-20261125/`) |

---

## 3. المتبقي المفتوح
- شاشات عرض منحنيات `Levey-Jennings` التفاعلية في واجهة المختبر وملف `RDSR` في واجهة الأشعة وتكامل الاستيراد الآلي من بوابات البنوك وأجهزة `PACS/DICOM RDSR`.
- القبول المالي والسريري الميداني (`UAT01`).
