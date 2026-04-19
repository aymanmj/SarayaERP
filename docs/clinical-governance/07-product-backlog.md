# Backlog تنفيذي للمنتج لدعم الحوكمة السريرية

هذا الملف يحول برنامج الحوكمة السريرية إلى أعمال تنفيذية يمكن إدخالها في backlog التطوير.

## Epic 1: Clinical Content Versioning and Approval Workflow

### السبب

الوحدات الحالية مثل `order-sets` و`clinical-pathways` تدعم الإنشاء والتحديث، لكن لا تطبق بعد دورة اعتماد ونشر مؤسسية كاملة.

### النطاق

- versioning للمحتوى
- workflow states
- approval record
- publish/retire flow
- diff between versions

### نقاط الربط الحالية

- `server/src/order-sets`
- `server/src/clinical-pathways`
- `server/prisma/schema.prisma`
- `server/src/audit`

### المخرجات المتوقعة

- عدم تعديل المحتوى المنشور عالي الخطورة مباشرة
- إنشاء `draft version`
- سجل اعتماد رسمي
- ربط كامل مع `AuditLog`

## Epic 2: Clinical Incident, Near Miss, and CAPA Module

### السبب

لا توجد حاليًا وحدة مؤسسية داخل المنتج لهذا المسار، رغم أهميته الأساسية في الحوكمة السريرية.

### النطاق

- incident intake
- severity classification
- investigation workflow
- root cause summary
- CAPA actions
- closure and verification

### المخرجات المتوقعة

- incident register
- near miss register
- CAPA dashboard
- linkage to committees and releases

## Epic 3: Medication Reconciliation Workflow

### السبب

هناك وصف وصرف وإعطاء دواء، لكن لا توجد حتى الآن حوكمة مكتملة لمسار `medication reconciliation` عند الدخول والتنقل والخروج.

### النطاق

- admission medication history
- compare current/home meds
- transfer reconciliation
- discharge reconciliation
- discrepancy review

### نقاط الربط الحالية

- `server/src/pharmacy`
- `server/src/nursing`
- `server/src/admission`
- `server/src/clinical/inpatient`

## Epic 4: Critical Results Acknowledgment and Escalation

### السبب

يوجد تعريف للقيم الحرجة في `CDSS`, لكن الحوكمة المؤسسية تتطلب acknowledgment وتصعيدًا موثقًا.

### النطاق

- critical result notification workflow
- acknowledgment timestamps
- escalation ladder
- unresolved critical result queue
- audit trail

### نقاط الربط الحالية

- `server/src/cdss`
- `server/src/labs`
- `server/src/radiology`
- `server/src/notifications`

## Epic 5: Terminology Service and Governance

### السبب

لا يوجد حتى الآن محرك مصطلحات موحد يدير الربط بين الأكواد السريرية والتقارير والتنبيهات.

### النطاق

- terminology dictionary
- code system registry
- concept mapping
- versioning
- lifecycle management

### المعايير المستهدفة

- `ICD-10`
- `SNOMED CT`
- `LOINC`
- `RxNorm`

## Epic 6: Override Governance for Clinical Alerts

### السبب

التنبيهات السريرية لها قيمة فقط إذا كانت تجاوزاتها خاضعة للقياس والتحليل والمراجعة.

### النطاق

- standardized override reasons
- mandatory rationale for high severity
- periodic review queue
- repeat override detection
- committee reporting

### نقاط الربط الحالية

- `server/src/cdss`
- `server/src/pharmacy`
- `server/prisma/schema.prisma`

## Epic 7: Clinical Risk Register and Governance Dashboard

### السبب

إدارة البرنامج تحتاج مرئية موحدة للمخاطر والالتزام والقرارات.

### النطاق

- clinical risk register
- risk scoring
- owner assignment
- mitigation tracking
- executive dashboard

## Epic 8: Policy-Aware Permissions for High-Risk Clinical Actions

### السبب

الحوكمة لا تكتمل بدون صلاحيات وسياسات دقيقة للأفعال السريرية عالية الخطورة.

### النطاق

- policy checks
- dual approval scenarios
- separation of duties
- emergency override policy

### أمثلة

- تعديل `critical values`
- نشر `order set`
- تعطيل قاعدة دوائية
- سحب نموذج `consent`

## ترتيب التنفيذ المقترح

1. Epic 1
2. Epic 6
3. Epic 4
4. Epic 2
5. Epic 3
6. Epic 7
7. Epic 8
8. Epic 5

## تعريف الجاهزية لكل Epic

لا يبدأ أي Epic قبل توفر:

- مالك سريري
- owner تقني
- تعريف نجاح واضح
- مخاطر متوقعة
- خطة اختبار
- قرار لجنة معنية
