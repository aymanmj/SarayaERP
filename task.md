# مهام التنفيذ - المرحلة 2 (الترقية السريرية العميقة)

## 1. ربط الواجهات بمحرك المصطلحات الموحد (Frontend Terminology UI)
- `[x]` تحديث `diagnosis.service.ts` للسماح بإنشاء (Lazy-load) للـ `DiagnosisCode` تلقائياً من الـ `TerminologyConcept` لو تم اختياره لأول مرة.
- `[x]` تحديث `DiagnosisPane.tsx` في `client` للبحث ضمن `/api/terminology/ICD10/search` بدال الـ `/diagnosis/search` القديم، لدعم إرسال `terminologySystem` و `terminologyCode`.

## 2. تقييد وبناء ميزات الحوكمة السريرية (Clinical Governance)
- `[x]` مراجعة النظام الحالي وتعديل الـ `Order Sets` للسماح بربط الـ (Items) بمصطلحات `LOINC/SNOMED` (عبر تحديث схема قاعدة البيانات وموجه الـ Service).
- `[x]` التحقق من الترابط الكامل بين المحرك الجديد ووصف الأدوية (RX) وتأكيد قراءة كود `ATC` في الـ `CDSS`.
- `[x]` تحديث `cdss.service.ts` بحاسبة الـ eGFR (Cockcroft-Gault) واعتمادها لتنبيهات تعديل الجرعات الكلوية.
- `[x]` تحديث فحص الوصفات `checkPrescription()` لتضمين التعديل الكلوي ومراجعة نطاق الجرعات (Dose Range Check).

## 🛌 مسارات العناية المرجعية (ICU/Nursing/OR Workflows)
- `[x]` ترقية `icu.service.ts` ليتضمن (Fluid Balance Flowsheet) وحساب تفصيلي وتتبع الخطوط.
- `[x]` هيكلة تدفق عمل غرفة العمليات (OR - Pre/Intra/Post-op) في `surgery.service.ts`.

## 1. اختبارات الوحدة (Unit Tests - CDSS)
- `[x]` إعداد ملف `server/src/cdss/cdss.service.spec.ts`.
- `[x]` برمجة (Mocking) متقدم لـ `PrismaService` لعزل بيئة قاعدة البيانات عن الاختبار.
- `[x]` إضافة سيناريوهات الدقة الحسابية لمعادلة (Cockcroft-Gault) و (Renal Adjustment).
- `[x]` تشغيل `npm run test` والتأكد من نجاحها بالكامل.

## 2. اختبارات التكامل (E2E Tests - FHIR)
- `[x]` إعداد ملف `server/test/e2e/fhir.e2e-spec.ts`.
- `[x]` اختبار مسار `SMART Configuration`.
- `[x]` اختبار العزل السريري بإرسال (Patient Context) ومحاولة اختراقه.
- `[x]` تشغيل `npm run test:e2e` وتأكيد النجاح (في بيئة CI/CD المحتوية على خوادم Redis).
