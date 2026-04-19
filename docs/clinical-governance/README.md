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

## الفجوات الحالية التي يعالجها هذا البرنامج

اعتمادًا على المراجعة الحالية، أهم الفجوات ليست في "وجود الوحدات" بل في "حاكمية تشغيلها":

- لا توجد دورة حياة معتمدة وواضحة للمحتوى السريري مثل `draft -> review -> approve -> publish -> retire`.
- `Order Sets` و`Clinical Pathways` بحاجة إلى ضبط versioning واعتماد رسمي قبل النشر.
- لا توجد حتى الآن وحدة مؤسسية داخل المنتج لإدارة `incident / near miss / CAPA`.
- لا توجد خدمة مصطلحات سريرية موحدة `Terminology Service` لإدارة `ICD-10 / SNOMED CT / LOINC / RxNorm`.
- لا توجد حوكمة كاملة لتجاوزات التنبيهات السريرية `override governance`.
- لا يوجد نموذج موحد لقياس الجودة السريرية ومخاطر السلامة عبر مؤشرات تشغيلية منتظمة.

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
