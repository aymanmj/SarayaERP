# تقرير المرحلة السادسة — الدفعة 31: تصفية دين ESLint التاريخي للوحدات الحرجة (`QA01`) وتشديد خط الأساس ومراجعة الاعتماديات (`DEP01`)

**التاريخ:** 2026-11-25  
**النطاق:** تصفير كامل أخطاء ESLint التاريخية (`480/480`) في 7 وحدات مالية وسريرية حرجة (`accounting`، `billing`، `cashier`، `labs`، `radiology`، `hr`، `payroll`)، وإصلاح استنتاج `any` الدائري في `createPrismaMock()` (`test-utils.ts`)، وإغلاق ثغرتين حقيقيتين كشفتهما تشديد الأنواع، وتقليص وتشديد `server/eslint-baseline.json` دون رفع أي حد، مع إعادة فحص `DEP01`.

---

## 1. الإنجازات التقنية (`QA01` + إصلاحات كشفتها الأنواع الصارمة)

1. **تصفير كامل أخطاء الإنتاج (`121 -> 0`) في 8 ملفات إنتاجية حرجة:**
   - [accounting.controller.ts](file:///d:/SarayaERP/server/src/accounting/accounting.controller.ts) (`14 -> 0`)
   - [accounting.service.ts](file:///d:/SarayaERP/server/src/accounting/accounting.service.ts) (`23 -> 0`)
   - [cost-centers.service.ts](file:///d:/SarayaERP/server/src/accounting/cost-centers.service.ts) (`1 -> 0`) + **إصلاح أمني (`SEC03`):** التحقق من ملكية مركز التكلفة للمنشأة (`findFirst({ where: { id, hospitalId } })`) قبل التحديث بدلاً من التحديث المباشر بـ `id` فقط.
   - [billing.service.ts](file:///d:/SarayaERP/server/src/billing/billing.service.ts) (`3 -> 0`)
   - [cashier.controller.ts](file:///d:/SarayaERP/server/src/cashier/cashier.controller.ts) (`15 -> 0`)
   - [cashier.service.ts](file:///d:/SarayaERP/server/src/cashier/cashier.service.ts) (`32 -> 0`) + **إصلاح عقد DTO:** توحيد `originalDrug` إلى `it.prescriptionItem?.product ?? null` بدلاً من `undefined`.
   - [hr.controller.ts](file:///d:/SarayaERP/server/src/hr/hr.controller.ts) (`26 -> 0`)
   - [payroll.controller.ts](file:///d:/SarayaERP/server/src/payroll/payroll.controller.ts) (`7 -> 0`)

2. **تصفير كامل أخطاء اختبارات الوحدة (`359 -> 0`) وإصلاح `createPrismaMock()`:**
   - إزالة المرجع الدائري الذاتي في [test-utils.ts](file:///d:/SarayaERP/server/src/test-utils.ts) و [billing.service.spec.ts](file:///d:/SarayaERP/server/src/billing/billing.service.spec.ts) و [labs.service.spec.ts](file:///d:/SarayaERP/server/src/labs/labs.service.spec.ts) الذي كان يُسقط نوع `mockPrismaService` بالكامل إلى `any`.
   - تصفير الأخطاء في [billing.controller.spec.ts](file:///d:/SarayaERP/server/src/billing/billing.controller.spec.ts) و [cashier.service.spec.ts](file:///d:/SarayaERP/server/src/cashier/cashier.service.spec.ts) و [cashier.controller.spec.ts](file:///d:/SarayaERP/server/src/cashier/cashier.controller.spec.ts) و [labs.controller.spec.ts](file:///d:/SarayaERP/server/src/labs/labs.controller.spec.ts) و [radiology.service.spec.ts](file:///d:/SarayaERP/server/src/radiology/radiology.service.spec.ts) و [radiology.controller.spec.ts](file:///d:/SarayaERP/server/src/radiology/radiology.controller.spec.ts).

3. **تقليص وتشديد خط أساس ESLint (`server/eslint-baseline.json`):**
   - تنفيذ `node scripts/check-lint-baseline.cjs --update-baseline` (الذي يمنع برمجياً تسجيل أي زيادة).
   - **الأخطاء الحية:** انخفضت بـ **`491` خطأ** في هذه الدفعة وحدها (من `4241` إلى **`3750`**)، وانخفضت التحذيرات من `624` إلى **`591`**.
   - **خط الأساس المسموح به (`eslint-baseline.json`):** تقلّص بـ **`1604` أخطاء** (من `5354` إلى **`3750`**)، ما يغلق أي إمكانية لعودة أخطاء `any` في الوحدات السبع الحرجة مستقبلاً.

4. **مراجعة `DEP01` (`npm audit --omit=dev`):**
   - **الخادم:** `0` حرجة، `19` عالية، `33` متوسطة (`52` إجمالاً — كافة المتبقي يتطلب ترقيات `semver-major` مؤجلة لحزم `@opentelemetry` و `nodemailer` و `prisma` و `puppeteer`).
   - **العميل:** `0` حرجة، `1` عالية عابرة، `10` متوسطة (`11` إجمالاً).

---

## 2. أدلة التحقق (المنفذ مقابل المؤجل)

- **الفحوص الساكنة المنفذة:**
  - `server lint:ci`: **`0` أخطاء جديدة**، الإرث التاريخي انخفض إلى **`3750` خطأً و `591` تحذيراً** عبر `720` ملفاً، مع تشديد `eslint-baseline.json`.
  - `server tsc --noEmit` و `nest build`: **`0` أخطاء**.
  - `verify-tenant-isolation` و `audit:check`: تغطية ABAC وعزل **`113/113`** (**`101/101`** فعّال = `100%`).
- **اختبارات الوحدة المنفذة (`Jest --runInBand`):**
  - **`112/112`** مجموعة = **`836/836`** اختباراً ناجحاً (`0` متخطى، `48.005 s`).
- **اختبارات التكامل المعزولة على PostgreSQL (مؤجلة لتشغيل Docker Desktop):**
  - تعذّر تشغيل `scripts/test-isolated-repair.ps1` في هذه الجلسة لأن خدمة **Docker Desktop** متوقفة بعد إعادة تشغيل الجهاز (`failed to connect to npipe:////./pipe/dockerDesktopLinuxEngine`). يُعاد تشغيل المجموعات المتأثرة (`hr-payroll-integrity` و `review-remediation` و `sec03-security-isolation-matrix`) فور تشغيل Docker Desktop.
