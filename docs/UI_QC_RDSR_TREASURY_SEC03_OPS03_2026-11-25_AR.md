# تقرير المرحلة السادسة — الدفعة 29: واجهات ضبط الجودة والجرعة الإشعاعية والخزينة + مصفوفة أمان عزل المستأجرين وذرية التدقيق (`UI + SEC03 + OPS02/OPS03`)

**التاريخ:** 2026-11-25  
**النطاق:** إغلاق الفجوات التشغيلية والأمنية للدفعة 28 على مستوى الواجهة (`CAP02` / `CAP13` / `CAP09`)، وإحكام صلاحيات المختبر، ومنع `IDOR` عبر المنشآت في السندات المحاسبية، واستكمال ذرية التدقيق `@AuditInTransaction()` على المسارات الحساسة، وإثبات عزل المستأجرين والرقابة بالصلاحيات (`RBAC`) عبر مصفوفة تكامل آلية (`SEC03`).

---

## 1. واجهات المستخدم والترجمة الثنائية (`ar.json` / `en.json`)

1. **مختبر ضبط الجودة الداخلي (`CAP02` — `Westgard QC` & `Levey-Jennings`):**
   - إنشاء [LabQcModal.tsx](file:///d:/SarayaERP/client/src/components/labs/LabQcModal.tsx) وربطه بزر **«ضبط الجودة (Westgard QC)»** في [LabWorklistPage.tsx](file:///d:/SarayaERP/client/src/pages/LabWorklistPage.tsx).
   - يدعم تسجيل تشغيلات QC جديدة (`POST /lab/qc/lots`)، وتسجيل القراءات والتقييم الآلي لقواعد `Westgard` (`POST /lab/qc/runs`)، وعرض مخطط `Levey-Jennings` تفاعلي عبر `SVG` بنطاقات `±1SD / ±2SD / ±3SD`، ومراجعة الإجراء التصحيحي برقابة **4 عيون** (`POST /lab/qc/runs/:id/review`).
   - اختبار الواجهة: [LabQcModal.test.tsx](file:///d:/SarayaERP/client/src/components/labs/LabQcModal.test.tsx) (كما كشف وأصلح خللاً في دورة اعتماديات `useEffect`/`useCallback` كان يعيد تحميل الحالة عند تحديد التشغيلة).

2. **سلامة الجرعة الإشعاعية (`CAP13` — `DICOM RDSR` & `ICRP-103`):**
   - إنشاء [RadiologyDoseModal.tsx](file:///d:/SarayaERP/client/src/components/radiology/RadiologyDoseModal.tsx) وربطه بزر **«☢️ الجرعة (RDSR)»** لكل طلب أشعة في [RadiologyWorklistPage.tsx](file:///d:/SarayaERP/client/src/pages/RadiologyWorklistPage.tsx).
   - يعرض لوحة التعرض الإشعاعي التراكمي للمريض خلال 12 شهراً ومدى الحياة (`GET /radiology/dose/patients/:patientId/summary`) مع شريط تقدم مرئي لعتبات التحذير (`50 mSv`) والتصعيد (`100 mSv`) وتجاوزات `DRL`، ونموذج تسجيل `RDSR` للطلب الحالي (`POST /radiology/dose/orders/:orderId`).
   - اختبار الواجهة: [RadiologyDoseModal.test.tsx](file:///d:/SarayaERP/client/src/components/radiology/RadiologyDoseModal.test.tsx).

3. **ترقية نافذة الخزينة (`CAP09` — استيراد `CSV / SWIFT MT940` وإعادة التقييم `FX Revaluation`):**
   - تحديث [TreasuryReconciliationModal.tsx](file:///d:/SarayaERP/client/src/components/accounting/TreasuryReconciliationModal.tsx) لإضافة:
     - رفع/لصق ملف كشف البنك (`CSV` أو `SWIFT MT940`) داخل جلسة التسوية البنكية (`POST /accounting/treasury/reconciliations/:id/import-file`).
     - تبويب ثالث **«إعادة التقييم»** لعرض سجل فروق العملة غير المحققة (`GET /accounting/treasury/fx-revaluations`) وتنفيذ إعادة تقييم جديدة (`POST /accounting/treasury/fx-revaluations`) مع عرض رقم القيد المرحّل بالأستاذ العام (`GL #id`).
   - تحديث اختبارات الواجهة: [TreasuryReconciliationModal.test.tsx](file:///d:/SarayaERP/client/src/components/accounting/TreasuryReconciliationModal.test.tsx).

4. **الترجمة الثنائية:** إضافة مفاتيح `lab.qc.*` و `radiology.dose.*` متوازنة في [ar.json](file:///d:/SarayaERP/client/src/locales/ar.json) و [en.json](file:///d:/SarayaERP/client/src/locales/en.json) (`7406` مفتاحاً).

---

## 2. التحصين الأمني وذرية التدقيق (`SEC03` / `OPS02` / `OPS03`)

1. **مواءمة صلاحيات `LabQcController` (`OPS02`):**
   - تصحيح [lab-qc.controller.ts](file:///d:/SarayaERP/server/src/labs/lab-qc.controller.ts) لقبول الصلاحيات المزرعة رسمياً (`labs:view` / `labs:manage`) إلى جانب (`lab:view` / `lab:manage`) لضمان عمل فني المختبر دون تعارض `403`.
2. **منع `IDOR` عبر المنشآت + ذرية التدقيق في السندات المحاسبية (`SEC03` / `OPS03`):**
   - إضافة `assertTenantAccounts` في [vouchers.service.ts](file:///d:/SarayaERP/server/src/accounting/vouchers/vouchers.service.ts) للتحقق من تبعية `accountId` و `cashAccountId` لمنشأة المستخدم عند الإنشاء والتعديل.
   - إضافة `appendChainedAuditInTransaction` + `publishCommittedCriticalAudit` لترحيل السند (`VOUCHER_POSTED`) وإلغائه (`VOUCHER_CANCELLED`) مع `@AuditInTransaction()` في [vouchers.controller.ts](file:///d:/SarayaERP/server/src/accounting/vouchers/vouchers.controller.ts).
3. **ذرية التدقيق في إعدادات النظام وعمليات الاستهلاك (`OPS03`):**
   - تغليف تحديث الإعدادات غير الغرفية في [system-settings.service.ts](file:///d:/SarayaERP/server/src/system-settings/system-settings.service.ts) داخل معاملة ذرية مع `appendChainedAuditInTransaction` (`UPDATE_SYSTEM_SETTING`) وإضافة `@AuditInTransaction()` في [system-settings.controller.ts](file:///d:/SarayaERP/server/src/system-settings/system-settings.controller.ts).
   - إضافة `@AuditInTransaction()` على `PUT /inventory/consumption-operations/source-policy` و `POST /inventory/consumption-operations/:id/retry` في [consumption-operations.controller.ts](file:///d:/SarayaERP/server/src/inventory/consumption-operations.controller.ts) لمنع ازدواجية سجلات التدقيق بعد التثبيت.
4. **مصفوفة أمان عزل المستأجرين و `RBAC` الآلية (`SEC03`):**
   - إنشاء [sec03-security-isolation-matrix.e2e-spec.ts](file:///d:/SarayaERP/server/test/e2e/sec03-security-isolation-matrix.e2e-spec.ts) الذي يثبت على PostgreSQL المعزول:
     - **عزل المستأجرين (14 مساراً حرجاً):** رفض محاولات منشأة أخرى (`403`/`404`) عبر المرضى (`ClinicalABACGuard`)، ضبط جودة المختبر، جرعات الأشعة، التسوية البنكية واستيراد الكشوف وإعادة التقييم، السندات المحاسبية (شاملاً محاولة تمرير حسابات منشأة أخرى)، وإعدادات النظام.
     - **فصل صلاحيات القراءة فقط (`RBAC`):** السماح للمشاهد بالوصول للقراءة (`200`) ومنعه قطعياً (`403`) على جميع عمليات الكتابة والاعتماد.
     - **ذرية التدقيق (`OPS03`):** إثبات تسجيل سجل متسلسل واحد (`hash` غير فارغ) لكل عملية مع صفر سجلات مكررة من `AuditInterceptor`.

---

## 3. أدلة التحقق (الاختبارات المنفذة مقابل الفحوص الساكنة)

- **الفحوص الساكنة:**
  - `check-i18n`: ناجح (`7406` مفتاح ويب + `40` موبايل).
  - `verify-tenant-isolation`: ناجح (`113` متحكماً).
  - `audit:check`: تغطية ABAC وعزل **`113/113`** (**`101/101`** فعّال = `100%`).
  - `server lint:ci`: **`0` أخطاء جديدة**، وانخفض الدين التاريخي بـ **24 خطأ** (من `4265` إلى **`4241`** عبر `717` ملفاً).
  - `server tsc --noEmit` و `nest build`: **`0` أخطاء**.
  - `client tsc --noEmit` و `vite build`: **`0` أخطاء** (`14.84s` + `PWA precache 246 entries`).
- **اختبارات الوحدة:**
  - **الخادم (Jest):** **`111/111`** مجموعة = **`830/830`** اختباراً ناجحاً (`0` متخطى).
  - **الواجهة (Vitest):** **`59/59`** ملفاً = **`287/287`** اختباراً ناجحاً (`LabQcModal` + `RadiologyDoseModal` + `TreasuryReconciliationModal` 3/3 + `RadiologyWorklistPage`).
- **اختبارات التكامل المعزولة على PostgreSQL (`scripts/test-isolated-repair.ps1`، متسلسلة `3/3` ناجحة، السجلات في `scratch/phase6-batch29-20261125/`):**
  - `test/e2e/sec03-security-isolation-matrix.e2e-spec.ts` (`PASS`)
  - `test/e2e/cap09-fx-reval-cap02-qc-cap13-rdsr.e2e-spec.ts` (`PASS`)
  - `test/e2e/multi-tenant-isolation.e2e-spec.ts` (`PASS`)

---

## 4. المتبقي المفتوح

- استكمال فحص الانحدار الشامل على كامل مجموعات التكامل (`49` مجموعة) على الترحيل `#82`، وتخفيض الدين التاريخي المتبقي في ESLint (`4241` خطأ ضمن `QA01`)، وتكامل `ClamAV` للمرفقات (`SEC05`)، والقبول البشري والميداني (`UAT01`).
