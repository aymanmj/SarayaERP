# تقرير إحكام دورة حياة العمليات الجراحية وفوترة أجر العملية الأساسية وعمولة الجراح وعزل الطاقم (2026-11-08)

## 1. نطاق المرحلة وأهدافها

تستكمل هذه المرحلة (الدفعة 17) إغلاق الفجوات المتبقية في دورة العمليات الجراحية التي حُددت في ختام وثيقة [`docs/SURGERY_CONSUMABLE_INTEGRITY_2026-11-08_AR.md`](file:///d:/SarayaERP/docs/SURGERY_CONSUMABLE_INTEGRITY_2026-11-08_AR.md) والسجل المرجعي [`docs/REMEDIATION_REGISTER_2026-11-07_AR.md`](file:///d:/SarayaERP/docs/REMEDIATION_REGISTER_2026-11-07_AR.md) (`FLOW04`، `SEC03`، `OPS03`، و`FIN03B`):

1. **إلغاء ابتلاع الأخطاء المالية ودمج فوترة أجر العملية الأساسية وعمولة الجراح في معاملة ذرية واحدة (`updateStatus`)**:
   - كانت `updateStatus` في [`server/src/surgery/surgery.service.ts`](file:///d:/SarayaERP/server/src/surgery/surgery.service.ts) تحدث حالة العملية إلى `COMPLETED` خارج أي معاملة ثم تستدعي `createSurgeryCharge` داخل كتلة `try/catch` تبتلع الأخطاء (`// لا نمنع اكتمال العملية بسبب خطأ مالي`)، ما كان يسمح باكتمال العملية دون تسجيل رسمها على الزيارة (`EncounterCharge`) أو عمولة الجراح.
   - كانت `updateStatus` تفتقر إلى قفل صفي (`FOR UPDATE`) على `SurgeryCase` و`Encounter`، ما كان يسمح لطلبين متزامنين بإنشاء رسمي عملية مكررين (`ChargeSource.SURGERY`).
   - كانت عمولة الجراح تُحسب بالفاصلة العائمة `(Number(serviceItem.defaultPrice) * doctorRate) / 100` بدلاً من مكتبة `Money`.
2. **فرض آلة الحالة الجراحية (State Machine) ومنع التلاعب بعد الاكتمال أو الصرف**:
   - منع الانتقالات العكسية أو غير القانونية (مثل تحويل عملية `COMPLETED` أو `CANCELLED` إلى حالة أخرى) برمز `409 ConflictException`.
   - منع إلغاء عملية جراحية (`CANCELLED`) إذا كان قد صُرف لها مستلزمات مخزنية (`consumables > 0`) برمز `409 ConflictException`.
3. **إحكام عزل المستأجر (Tenant Isolation) في الجدولة والطاقم والتوثيق السريري (`SEC03`)**:
   - في `scheduleSurgery`: فرض معاملة ذرية تقفل غرفة العمليات (`OperatingTheatre FOR UPDATE`) لمنع الحجز المتضارب المتزامن، والتحقق من ملكية وحالة `Encounter` (`OPEN`) و`OperatingTheatre` و`ServiceItem` (`SURGERY`) وأعضاء الطاقم لنفس `hospitalId`.
   - في `addTeamMember` و`removeTeamMember`: كانت `addTeamMember` تتجاهل معامل `hospitalId` تماماً، وكانت `removeTeamMember(id)` تحذف أي سجل `SurgeryTeam` بدون التحقق من `hospitalId` أو حالة العملية؛ تم فرض قفل `SurgeryCase FOR UPDATE` والتحقق من ملكية العملية والمستخدم للمنشأة ومنع تعديل أو حذف أعضاء الطاقم بعد اكتمال العملية أو إلغائها (`409 ConflictException`).
   - في `updateNotes` و`recordPreOpChecklist` و`recordIntraOpLog` و`recordPostOpPACU`: إضافة تحقق صارم من ملكية `caseId` للمنشأة (`404 NotFoundException`) قبل القراءة أو التحديث.
   - في [`server/src/commission/commission.service.ts`](file:///d:/SarayaERP/server/src/commission/commission.service.ts): التحقق من ملكية الطبيب للمنشأة في `upsert`، وتنفيذ `bulkUpsert` داخل معاملة ذرية، ودعم تمرير `tx` الاختياري إلى `getDoctorRate`.

---

## 2. الملفات المعدلة والمضافة

- [`server/src/commission/commission.service.ts`](file:///d:/SarayaERP/server/src/commission/commission.service.ts)
- [`server/src/surgery/surgery.controller.ts`](file:///d:/SarayaERP/server/src/surgery/surgery.controller.ts)
- [`server/src/surgery/surgery.service.ts`](file:///d:/SarayaERP/server/src/surgery/surgery.service.ts)
- [`server/test/e2e/surgery-lifecycle-billing-integrity.e2e-spec.ts`](file:///d:/SarayaERP/server/test/e2e/surgery-lifecycle-billing-integrity.e2e-spec.ts)

---

## 3. الاختبارات والتحقق

- اجتازت مجموعة اختبارات التكامل [`server/test/e2e/surgery-lifecycle-billing-integrity.e2e-spec.ts`](file:///d:/SarayaERP/server/test/e2e/surgery-lifecycle-billing-integrity.e2e-spec.ts) بنجاح كامل (**3/3 اختبارات ناجحة** في `9.91 s` على PostgreSQL وRedis المعزولين — الدليل محفوظ في `scratch/surgery-lifecycle-20261108/e2e-focused.log`):
  1. رفض جدولة عملية بزيارة أو غرفة عمليات أو عضو طاقم من مستشفى آخر (`400`)، ومنع الحجز المتزامن المتضارب لنفس غرفة العمليات (`[201, 400]`)، وعزل مسارات الطاقم وقوائم التحقق السريرية (`404` للمستشفى الآخر و`409` لتكرار الدور).
  2. فرض آلة الحالة الجراحية، وحساب عمولة الجراح بدقة `Money.percentDecimal` (`333.330 * 17.5% = 58.333`)، ومنع تكرار رسم العملية الأساسية عند الإكمال المتزامن (`[201, 409]`)، ومنع إلغاء العملية أو تعديل طاقمها بعد اكتمالها (`409`).
  3. التراجع الذري الكامل (Rollback) عن إكمال العملية وعن عمولة الجراح عند فشل إدراج `EncounterCharge`، ثم نجاح الإكمال والفوترة والعمولة (`66.666`) بعد زوال سبب الفشل.

### أمر التشغيل للتحقق على PostgreSQL المعزول
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File d:\SarayaERP\scripts\test-isolated-repair.ps1 -LogPath "scratch/surgery-lifecycle-20261108/e2e-focused.log" -TestPath "test/e2e/surgery-lifecycle-billing-integrity.e2e-spec.ts"
```
