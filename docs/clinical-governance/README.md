# Clinical Governance Program for Saraya Medical System

هذه الحزمة تمثل نقطة البداية الرسمية لبرنامج `Clinical Governance Program` داخل نظام السرايا الطبي.  
وهي مبنية على مراجعة ما هو موجود فعليًا في المشروع، وليس على تصور نظري فقط.

## الأساس الحالي داخل النظام

المشروع يملك بالفعل قدرات يمكن البناء عليها مباشرة:

- `Order Sets` في [../../server/src/order-sets/order-sets.service.ts](../../server/src/order-sets/order-sets.service.ts)
- `Clinical Pathways` في [../../server/src/clinical-pathways/clinical-pathways.service.ts](../../server/src/clinical-pathways/clinical-pathways.service.ts)
- `CDSS` في [../../server/src/cdss/cdss.service.ts](../../server/src/cdss/cdss.service.ts)
- `Pharmacy + prescription safety checks` في [../../server/src/pharmacy/pharmacy.service.ts](../../server/src/pharmacy/pharmacy.service.ts)
- `Nursing MAR / administration / handover notes` في [../../server/src/nursing/nursing.service.ts](../../server/src/nursing/nursing.service.ts)
- `Inpatient rounds / care plan` في [../../server/src/clinical/inpatient/inpatient-rounds.service.ts](../../server/src/clinical/inpatient/inpatient-rounds.service.ts)
- `Admissions / discharge planning` في [../../server/src/admission](../../server/src/admission)
- `Audit log` في [../../server/prisma/schema.prisma](../../server/prisma/schema.prisma)
- `Consent forms` في [../../server/prisma/schema.prisma](../../server/prisma/schema.prisma)

## ماذا يعني ذلك عمليًا

النظام ليس فارغًا من الناحية السريرية. لدينا أساس جيد يسمح ببدء الحوكمة السريرية عبر:

- ضبط المحتوى السريري بدل إنشاء محتوى جديد من الصفر.
- فرض دورة اعتماد وتغيير على الوحدات السريرية عالية الخطورة.
- ربط التنبيهات، الأدوية، المسارات العلاجية، والتمريض بلوحات جودة ومخاطر واضحة.

## الفجوات الحالية التي يتم معالجتها (وتم حل بعضها)

اعتمادًا على المراجعة الحالية، تم معالجة أهم الفجوات المتعلقة بـ "حاكمية التشغيل":

- لا توجد دورة حياة معتمدة وواضحة للمحتوى السريري مثل `draft -> review -> approve -> publish -> retire`.
- `Order Sets` و`Clinical Pathways` بحاجة إلى ضبط versioning واعتماد رسمي قبل النشر.
- لا توجد خدمة مصطلحات سريرية موحدة `Terminology Service` لإدارة `ICD-10 / SNOMED CT / LOINC / RxNorm`.
- لا يوجد نموذج موحد لقياس الجودة السريرية ومخاطر السلامة عبر مؤشرات تشغيلية منتظمة.

**✅ فجوات تم سدها بنجاح:**

- **حوكمة ABAC كاملة (100%):** تم تفعيل `PermissionsGuard` + `@Permissions` على جميع الـ 89 Controller بالنظام. لا يوجد أي endpoint بدون حماية صلاحيات.
- **عزل المستأجرين (Tenant Isolation):** 84% من الوحدات تستخدم `hospitalId` من JWT لعزل البيانات بين المنشآت.
- **نظام دعم القرار السريري (CDSS):** محرك ذكي يشمل:
  - فحص التفاعلات الدوائية (24 تفاعل مبني على WHO/FDA/BNF)
  - حساب eGFR تلقائي عند تأكيد نتائج الكرياتينين (Event-Driven)
  - تنبيهات كلوية استباقية للمرضى ذوي eGFR < 60
  - تعديل الجرعات الكلوية وفق معايير KDIGO
- **حوكمة MPI الوطنية:** تم تفعيل:
  - واجهة إلغاء الموافقة (Consent Revocation API)
  - سجل تدقيق كامل لجميع طلبات الوصول والمنح والإلغاء
  - عزل الإلغاء حسب المنظمة (Organization-Scoped)
- **وحدة العناية المركزة (ICU):** تم تعزيزها بـ:
  - محرك توازن السوائل (Fluid Balance) مع تحليل اتجاه 7 أيام
  - إدارة إعدادات جهاز التنفس الصناعي مع تقييم جاهزية الفطام (SBT)
- **قاعدة المعرفة السريرية:** 24 تفاعل دوائي موثق من مصادر طبية عالمية مع ترجمة عربية.

## مكونات الحزمة

- [01-program-charter.md](./01-program-charter.md)
- [02-operating-model.md](./02-operating-model.md)
- [03-committees-raci.md](./03-committees-raci.md)
- [04-clinical-content-lifecycle.md](./04-clinical-content-lifecycle.md)
- [05-roadmap-12-months.md](./05-roadmap-12-months.md)
- [06-kpis-kris.md](./06-kpis-kris.md)
- [07-product-backlog.md](./07-product-backlog.md)
- [templates/clinical-content-change-request.md](./templates/clinical-content-change-request.md)
- [templates/clinical-safety-review.md](./templates/clinical-safety-review.md)
- [templates/clinical-change-approval-record.md](./templates/clinical-change-approval-record.md)
- [templates/incident-near-miss-capa.md](./templates/incident-near-miss-capa.md)

## حالة الإنجاز (Epic Status)

بناءً على مسار التطوير وخطة الترقيات، تم تحديث حالة الملاحم (Epics):

| الملحمة (Epic) | الحالة | الملفات التنفيذية |
|----------------|--------|-------------------|
| Epic 1: Clinical Content Versioning | ✅ مُنجز (Done) | `server/src/order-sets`, `server/src/clinical-pathways` (Version History) |
| Epic 2: Incident, Near Miss, & CAPA | ✅ مُنجز + حوكمة صارمة | `server/src/quality/` (محمي بـ PermissionsGuard + إشعارات) |
| Epic 3: Medication Reconciliation | 🚧 قيد التنفيذ (In Progress) | `server/src/clinical-profile/` (Home Medications module exists) |
| Epic 4: Critical Results Acknowledgment | ✅ مُنجز (Done) | `server/src/cdss` (عبر نماذج `CDSSAlert` + auto-eGFR) |
| Epic 5: Terminology Service | ✅ مُنجز (Done) | `server/src/terminology/` (ICD-10/LOINC/SNOMED CT/RxNorm) |
| Epic 6: Override Governance for Alerts | ✅ مُنجز (Done) | `server/src/cdss` (تجاوز التنبيهات مع الأسباب `overrideReason`) |
| Epic 7: Clinical Risk Register | ⏳ مخطط (Planned) | `server/src/quality/` |
| Epic 8: Policy-Aware Permissions | ✅ مُنجز (100%) | ABAC كامل (89/89 Controller) + عزل المستأجرين (84%) |
| Epic 9: MPI Consent Governance | ✅ مُنجز (Done) | `server/src/patients/mpi.service.ts` (Revocation + Audit Trail) |
| Epic 10: ICU Clinical Workflows | ✅ مُنجز (Done) | `server/src/icu/` (Fluid Balance + Ventilator + Weaning) |
| Epic 11: Drug Interaction Knowledge Base | ✅ مُنجز (Done) | `server/prisma/seeds/seed-drug-interactions.cjs` (24 WHO/FDA) |
| Epic 12: Event-Driven CDSS | ✅ مُنجز (Done) | `server/src/cdss/cdss.listener.ts` (auto-eGFR on creatinine) |

## أول 30 يوم

إذا أردنا البدء وفق أعلى مستوى احترافي عملي، فهذه هي نقطة الانطلاق:

1. اعتماد `Clinical Safety Board` و`Medication Safety Committee` و`Clinical Content Committee`.
2. اعتماد هذا الملف كمرجع البرنامج وبدء تعبئة النماذج الرسمية من مجلد `templates`.
3. إيقاف أي تعديل عالي الخطورة على `order sets`, `clinical pathways`, `drug interaction rules`, `critical values`, `consent templates` بدون سجل تغيير واعتماد.
4. فتح `Epic backlog` تنفيذي بالاعتماد على [07-product-backlog.md](./07-product-backlog.md).
5. تشغيل مراجعة baseline للمحتوى السريري الحالي خلال 4 أسابيع.

## النتيجة المستهدفة

الهدف من هذه الحزمة هو نقل السرايا من:

- نظام غني وظيفيًا

إلى:

- منصة طبية ذات حوكمة سريرية واضحة، قابلة للتدقيق، قابلة للاعتماد المؤسسي، وأكثر أمانًا في التشغيل اليومي.
