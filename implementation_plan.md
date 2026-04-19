# تنفيذ المرحلة الأولى: التأسيس المعماري السريري (Phase 1)
بناءً على وثيقة الاستراتيجية المعتمدة (Architecture Blueprint)، سنبدأ بتنفيذ الحزمة الأولى المهتمة بتعزيز الاعتمادية السريرية وتوفير مراقبة عميقة للخدمات الحرجة.

## الهدف (Goal)
إرساء قواعد الحوكمة السريرية وتتبع الأداء العميق من خلال 3 تقنيات أساسية في السرايا: (OpenTelemetry, CDS Hooks, Audit Trails).

## User Review Required
> [!IMPORTANT]
> **مطلوب المراجعة والاعتماد:** نظرًا لأن إضافة الـ OpenTelemetry تتطلب تحديث حزم الـ `package.json` الخاصة بـ Node، وإعادة تفعيل الـ Audit Trails قد تؤثر على سرعة بعض العمليات، يرجى الاطلاع على الخطة أدناه قبل أن أبدأ بلمس الكود.

---

## 1. التغييرات المقترحة (Proposed Changes)

### 🩺 الجزء الأول: معيار CDS Hooks (Clinical Decision Support)
في الوقت الحالي، تعتمد وحدة `cdss` على مسارات (Endpoints) غير معيارية مخصصة للسرايا فقط (مثل `/cdss/check-prescription`). سنقوم بإحلال معيار عالمي.

#### [NEW] `server/src/cdss/cds-hooks.controller.ts`
سنبني واجهة متوافقة تماماً مع معيار CDS Hooks العالمي لدعم القرار السريري:
- `GET /cds-services`: لاكتشاف نوعية الخدمات الداعمة للقرار المتاحة بالسرايا.
- `POST /cds-services/{id}`: لاستدعاء خدمة معينة والرد بـ `Cards` (مثل Information, Suggestion, Smart App link).

#### [MODIFY] `server/src/cdss/cdss.service.ts`
تطوير المحرك الداخلي ليترجم استدعاءات المعيار (Hooks) إلى التحذيرات الموجودة حالياً (Allergies, Interactions).

---

### 📡 الجزء الثاني: التتبع الموزع (OpenTelemetry)
لن نكتفي بـ Prometheus للمقاييس. حان الوقت لمراقبة كل (Request) بدقة.

#### [MODIFY] `server/package.json`
إضافة مكتبات أوبن تيليمتري:
- `@opentelemetry/sdk-node`
- `@opentelemetry/auto-instrumentations-node`
- `@opentelemetry/exporter-trace-otlp-http` (لإرسال البيانات إلى Jaeger أو Tempo لاحقاً).

#### [NEW] `server/src/tracing.ts`
ملف يتم تشغيله قبل `main.ts` يقوم باعتراض وتسجيل كل شيء يحدث في (Express و Prisma و HTTP Requests).

---

### 🕵️ الجزء الثالث: فرض التدقيق الإلزامي (Strict Audit Trails)
حالياً `audit.service.ts` يلتهم الأخطاء (Swallows exceptions) حتى لا يعطل النظام (`catch (err) { }`). هذا آمن، ولكنه غير مقبول للحوكمة السريرية الحرجة!

#### [MODIFY] `server/src/audit/audit.service.ts`
- إضافة دالة `logCritical()` لا تتجاهل الأخطاء أبدًا (Fail-safe for clinical actions). إذا فشل تسجيل حفظ الـ (audit) لوصفة طبية أو تعديل جرعة، يجب أن يتم رفض الطلب الطارئ لضمان دقة السجل القانوني للمنظمة.

#### [MODIFY] `server/src/audit/audit.interceptor.ts`
- تعميمه لفرض رقابة صارمة على جميع وحدات: (`pharmacist`, `billing`, `encounters`).

---

## خطة التحقق والقياس (Verification Plan)
1. **CDS Hooks Testing:** سأطلب مسار الـ `/cds-services` للتأكد من أنه يفرز البيانات بصيغة JSON متوافقة مع Epic/Cerner JSON Schema.
2. **OpenTelemetry Validation:** سنتحقق من أن السيرفر يظهر Console Traces (أو يستطيع التحدث مع منفذ 4318 OTEL Exporter).
3. **Audit Trails Test:** سنحاكي تعديل وصفة طبية ونتأكد أن النظام يرفض العملية إذا كان الـ Database تلافاه لسبب التدقيق الطارئ.

هل نتوكل على الله وأبدأ بتنفيذ هذه المرحلة فوراً؟
