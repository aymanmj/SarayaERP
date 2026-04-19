# مهام التأسيس المعماري السريري (Phase 1)

## 📡 التتبع الموزع (OpenTelemetry)
- `[x]` إضافة حزم (`@opentelemetry/sdk-node` وما يتبعها) إلى `package.json`.
- `[x]` إنشاء ملف `server/src/tracing.ts` لتهيئة الأوبن تيليمتري.
- `[x]` حقن ملف التتبع في `main.ts` ليعمل مع إقلاع الخادم.

## 🩺 نظام دعم القرار المعياري (CDS Hooks)
- `[x]` إنشاء `cds-hooks.controller.ts` لتعريف المسارات المعيارية (`/cds-services`).
- `[x]` تحديث `cdss.service.ts` لمعالجة الطلبات وإرجاع البطاقات (Cards).

## 🛡️ مسارات التدقيق الحرجة (Audit Trails)
- `[x]` إضافة دالة `logCritical()` في `audit.service.ts` لا تتجاوز الأخطاء.
- `[x]` تحديث الـ `Interceptors` لاستخدام النسخة الصارمة في العمليات السريرية.
