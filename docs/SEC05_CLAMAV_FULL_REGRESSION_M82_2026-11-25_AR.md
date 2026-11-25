# تقرير المرحلة السادسة — الدفعة 30: فحص الفيروسات للمرفقات (`ClamAV zINSTREAM` / `SEC05`) وخط أساس الانحدار الشامل على الترحيل `#82`

**التاريخ:** 2026-11-25  
**النطاق:** تنفيذ محرك فحص الفيروسات والبرمجيات الخبيثة للمرفقات (`SEC05`) عبر بروتوكول `ClamAV clamd TCP zINSTREAM` مع وضع `Fail-Closed` في الإنتاج ودمجه في مرفقات الموافقات المسبقة (`PreAuth`) وتحديث `docker-compose.production.yml` (`OPS06`)، متبوعاً بتثبيت خط أساس انحدار E2E كامل عبر جميع مجموعات التكامل النشطة (`50/50`) على الترحيل **`#82`**.

---

## 1. محرك فحص الفيروسات للمرفقات (`SEC05`)

1. **خدمة الفحص [attachment-av-scanner.service.ts](file:///d:/SarayaERP/server/src/common/security/attachment-av-scanner.service.ts):**
   - تنفيذ بروتوكول **`ClamAV clamd` TCP `zINSTREAM\0`** القياسي مباشرةً عبر `node:net` (تقسيم البيانات إلى كتل `64 KiB` مسبوقة بطول 4 بايت `Big-Endian` وإنهاء بتدفق صفري `0x00000000`) دون اعتماديات خارجية.
   - **سياسة `Fail-Closed` صارمة:** في وضع `clamd` (وهو الوضع الافتراضي في `NODE_ENV=production` أو عند ضبط `CLAMAV_HOST`)، أي تعذّر اتصال أو انتهاء مهلة (`CLAMAV_TIMEOUT_MS`) يرفض الرفع فوراً بـ **`503 ServiceUnavailableException`** ولا يقبل أي ملف غير مفحوص. كما يُمنع وضع `disabled` في الإنتاج إلا بتجاوز صريح `ALLOW_UNSCANNED_UPLOADS=true`.
   - **فحص توقيع `EICAR` الحتمي المدمج:** يلتقط توقيع الاختبار القياسي `EICAR` (المُركّب ديناميكياً في الذاكرة دون كتابة التوقيع الخام على القرص) في وضعي `eicar_builtin` و `clamd`.
2. **التكامل مع مرفقات الموافقة المسبقة [preauth-attachments.ts](file:///d:/SarayaERP/server/src/insurance/preauth-attachments.ts):**
   - فحص `Buffer` المرفق **قبل كتابة أي بايت على القرص أو إنشاء سجل قاعدة بيانات**.
   - عند اكتشاف ملف مصاب: تسجيل حدث تدقيق متسلسل **`SECURITY_MALWARE_BLOCKED`** مع بث `SIEM`، وحجب الرفع بـ **`422 UnprocessableEntityException`** دون إنشاء أي ملف مؤقت أو نهائي.
   - عند اجتياز الفحص: توثيق `avScanStatus: 'CLEAN'` و `avScanEngine` و `avScanDurationMs` داخل سجل التدقيق المتسلسل `UPLOAD_PREAUTH_ATTACHMENT`.
3. **تهيئة حزمة الإنتاج [docker-compose.production.yml](file:///d:/SarayaERP/docker-compose.production.yml) (`OPS06`):**
   - إضافة خدمة `clamav` بإصدار مثبّت (`clamav/clamav:1.4_base` دون `:latest`) داخل الشبكة المعزولة `saraya_net` فقط دون منافذ خارجية، مع فحص صحة `clamdcheck.sh` ووحدة تخزين `clamav_data`، وربط متغيرات `AV_SCANNER_MODE` و `CLAMAV_HOST` و `CLAMAV_PORT` بحاوية `backend`.
   - التحقق الساكن من صحة ملف Compose: `docker compose -f docker-compose.production.yml config -q` -> **`COMPOSE_PROD_CONFIG_OK`**.

---

## 2. أدلة التحقق وخط أساس الانحدار الشامل على الترحيل `#82`

- **اختبارات الوحدة للخادم (`Jest --runInBand`):**
  - **`112/112`** مجموعة = **`836/836`** اختباراً ناجحاً (`0` متخطى، `46.491 s`)، بما فيها 6 اختبارات في [attachment-av-scanner.service.spec.ts](file:///d:/SarayaERP/server/src/common/security/attachment-av-scanner.service.spec.ts) عبر خادم `clamd` TCP محلي حيّ يختبر `zINSTREAM` و `stream: OK` و `FOUND` و `Fail-Closed 503` و `EICAR`.
- **اختبارات الوحدة للواجهة (`Vitest`):**
  - **`59/59`** ملفاً = **`287/287`** اختباراً ناجحاً (تم التحقق منها في الدفعة 29 ولم تتغير ملفات العميل في الدفعة 30).
- **الفحوص الساكنة:**
  - `server lint:ci`: **`0` أخطاء جديدة** (`720` ملفاً، الإرث التاريخي `4241` خطأ).
  - `server tsc --noEmit` و `nest build`: **`0` أخطاء**.
  - `docker compose -f docker-compose.production.yml config -q`: ناجح (`0` أخطاء).
- **الانحدار الشامل المعزول على PostgreSQL و Redis (`scripts/test-isolated-repair.ps1` على الترحيل `#82`):**
  - السجل الكامل: `scratch/phase6-batch30-20261125/full-e2e-m82.log`.
  - النتيجة: **`50/50`** مجموعة نشطة ناجحة = **`577/577`** اختبار تكامل ناجح، **`0` فاشل** (`5` مجموعات حمل/بوابة اختيارية متخطاة بأعلام البيئة، الزمن الكلي `992.402 s`)، متضمنةً جميع دفعات المرحلة السادسة (`Batch 26` إلى `Batch 30` ومنها [sec05-av-attachment-scanning.e2e-spec.ts](file:///d:/SarayaERP/server/test/e2e/sec05-av-attachment-scanning.e2e-spec.ts)).

---

## 3. المتبقي المفتوح

- تشغيل حاوية `clamav/clamav:1.4_base` وتحديث قواعد التوقيع (`freshclam`) في بيئة النشر الفعلية (`OPS06`)، والتشفير وقت السكون لمجلد المرفقات (`SEC05`)، وتخفيض الدين التاريخي لـ ESLint (`4241` خطأ ضمن `QA01`)، والقبول البشري والميداني (`UAT01`).
