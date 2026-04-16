# دليل التكامل العملي مع FHIR في نظام السرايا الطبي

هذا الدليل يشرح كيف تجعل الأنظمة والأجهزة الأخرى تتواصل مع نظام السرايا الطبي باستخدام واجهة `FHIR` المضمنة فعلياً في النظام.

يعتمد هذا الدليل على التنفيذ الموجود في:

- `server/src/integration/fhir/fhir.controller.ts`
- `server/src/integration/fhir/fhir.auth.service.ts`
- `server/src/integration/fhir/fhir.auth.guard.ts`
- `server/src/integration/fhir/fhir.service.ts`
- `server/src/integration/integration.service.ts`

## 1. متى نستخدم FHIR ومتى نستخدم HL7

استخدم `FHIR` عندما يكون الطرف الآخر:

- نظام معلومات صحي آخر
- بوابة مريض أو تطبيق موبايل أو portal
- منصة تكامل أو data platform
- خدمة ذكاء اصطناعي أو CDS
- نظام يحتاج REST API حديثة وJSON وOAuth2

استخدم `HL7/MLLP` عندما يكون الطرف الآخر:

- جهاز مختبر
- جهاز أشعة أو موداليتي
- نظام LIS/RIS قديم
- جهاز أو برنامج لا يدعم REST/FHIR لكن يدعم `ORM/ORU/ADT`

ملخص مهم:

- `FHIR` مناسب أكثر للأنظمة الحديثة
- `HL7/MLLP` مناسب أكثر للأجهزة والأنظمة التقليدية
- نظام السرايا يدعم الاثنين

## 2. عنوان الـ FHIR Base URL

القاعدة العامة في السرايا هي:

```text
https://your-domain/api/fhir
```

أمثلة endpoints عامة:

- `GET /api/fhir/metadata`
- `GET /api/fhir/.well-known/smart-configuration`
- `GET /api/fhir/cds-services`

## 3. الموارد المدعومة حالياً

الموارد التي يدعمها النظام الآن عبر FHIR:

- `Patient`
- `Practitioner`
- `Organization`
- `Encounter`
- `Observation`
- `Condition`
- `AllergyIntolerance`
- `MedicationRequest`
- `Procedure`
- `Subscription`

كما توجد واجهات `CDS Hooks` أيضاً.

## 4. التهيئة المطلوبة في بيئة التشغيل

قبل استخدام FHIR في الإنتاج، اضبط المتغيرات التالية:

```env
FHIR_CLIENT_ID=enterprise_fhir_client
FHIR_CLIENT_SECRET=CHANGE_THIS_TO_A_REAL_SECRET
FHIR_REGISTERED_APPS=[{"clientId":"lab_gateway","clientSecret":"lab_secret","name":"Lab Gateway","redirectUris":["https://lab.example.com/callback"],"grantTypes":["client_credentials"],"defaultScopes":"system/*.read system/Observation.write system/Subscription.write"}]
JWT_SECRET=CHANGE_THIS_TO_A_STRONG_SECRET
```

ملاحظات مهمة:

- في الوضع الحالي، التطبيقات الخارجية تسجل عبر البيئة `env` وليس من شاشة إدارة.
- لا تترك `FHIR_CLIENT_SECRET` فارغاً في الإنتاج.
- لا تعتمد على أسرار افتراضية أو أسرار قصيرة.

## 5. كيف يعمل التوثيق والمصادقة

السرايا يدعم:

- `client_credentials`
- `authorization_code`

غالبية التكاملات بين الأنظمة الخلفية ستستخدم:

- `client_credentials`

أما تطبيقات SMART on FHIR وواجهات الإطلاق السريري فتستخدم:

- `authorization_code`

## 6. اكتشاف قدرات الخادم

تحقق أولاً من أن الخادم يعلن نفسه بشكل صحيح:

```bash
curl "https://your-domain/api/fhir/metadata"
```

ولعرض إعدادات SMART:

```bash
curl "https://your-domain/api/fhir/.well-known/smart-configuration"
```

## 7. الحصول على Access Token

### 7.1 مثال client_credentials

```bash
curl -X POST "https://your-domain/api/fhir/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "enterprise_fhir_client",
    "client_secret": "YOUR_SECRET",
    "scope": "system/*.read system/Observation.write system/Subscription.write"
  }'
```

الناتج سيكون شبيهاً بهذا:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "system/*.read system/Observation.write system/Subscription.write"
}
```

### 7.2 مثال authorization_code

هذا النمط يستخدم غالباً لتطبيقات SMART:

1. افتح:

```text
GET /api/fhir/oauth/authorize?response_type=code&client_id=...&scope=...&redirect_uri=...&state=...&aud=...&launch=123
```

2. سيعيد النظام `code`
3. بدّل الـ `code` إلى `access_token` عبر:

```bash
curl -X POST "https://your-domain/api/fhir/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "client_id": "enterprise_fhir_client",
    "client_secret": "YOUR_SECRET",
    "code": "AUTH_CODE_HERE"
  }'
```

## 8. أهم الـ Scopes العملية

أمثلة Scopes شائعة:

- `patient/Patient.read`
- `patient/Encounter.read`
- `patient/Observation.read`
- `patient/Observation.write`
- `system/*.read`
- `system/Subscription.write`
- `user/*.read`

اقتراحات حسب نوع التكامل:

- بوابة مريض: `patient/*.read`
- تكامل تقارير أو ETL: `system/*.read`
- جهاز أو gateway يرسل vitals: `system/Observation.write`
- نظام خارجي يريد webhooks: `system/Subscription.write`

## 9. قراءة البيانات من السرايا

### 9.1 قراءة المرضى

```bash
curl "https://your-domain/api/fhir/Patient" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 9.2 قراءة مريض محدد

```bash
curl "https://your-domain/api/fhir/Patient/123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 9.3 قراءة Encounter

```bash
curl "https://your-domain/api/fhir/Encounter?patient=Patient/123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 9.4 قراءة Observations

```bash
curl "https://your-domain/api/fhir/Observation?patient=Patient/123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 9.5 قراءة الحساسية والأدوية والإجراءات

```bash
curl "https://your-domain/api/fhir/AllergyIntolerance?patient=Patient/123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

curl "https://your-domain/api/fhir/MedicationRequest?patient=Patient/123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

curl "https://your-domain/api/fhir/Procedure?patient=Patient/123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 10. كتابة بيانات إلى السرايا عبر FHIR

### 10.1 أهم نقطة حالياً: POST Observation

الكتابة الأكثر وضوحاً واكتمالاً حالياً في النظام هي:

- `POST /api/fhir/Observation`

هذا مناسب جداً لـ:

- أجهزة vital signs
- mobile nursing apps
- gateways تجمع قراءات سريرية

### 10.2 شروط نجاح Observation

لكي يقبل السرايا الـ `Observation`:

- يجب أن يكون `resourceType = Observation`
- يجب أن يوجد `subject.reference` بالشكل `Patient/{id}`
- يجب أن يكون لهذا المريض `Encounter` مفتوح
- إذا كان token مقيداً على مريض معين، لا يمكن الكتابة لمريض آخر

### 10.3 مثال عملي لإرسال vital signs

```bash
curl -X POST "https://your-domain/api/fhir/Observation" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Observation",
    "status": "final",
    "subject": {
      "reference": "Patient/123"
    },
    "component": [
      {
        "code": {
          "coding": [
            {
              "system": "http://loinc.org",
              "code": "8867-4",
              "display": "Heart rate"
            }
          ]
        },
        "valueQuantity": {
          "value": 88,
          "unit": "/min"
        }
      },
      {
        "code": {
          "coding": [
            {
              "system": "http://loinc.org",
              "code": "9279-1",
              "display": "Respiratory rate"
            }
          ]
        },
        "valueQuantity": {
          "value": 18,
          "unit": "/min"
        }
      },
      {
        "code": {
          "coding": [
            {
              "system": "http://loinc.org",
              "code": "8310-5",
              "display": "Body temperature"
            }
          ]
        },
        "valueQuantity": {
          "value": 37.1,
          "unit": "Cel"
        }
      }
    ]
  }'
```

### 10.4 أكواد مفيدة تدعمها طبقة التحويل الحالية

أمثلة واضحة من التنفيذ الحالي:

- `8867-4` نبض
- `9279-1` معدل التنفس
- `8310-5` الحرارة

ومن المنطقي اعتماد ترميز موحد بالأخص `LOINC` عند إرسال القياسات.

## 11. استقبال الأحداث من السرايا عبر Subscription

إذا أردت أن يدفع السرايا إشعارات تلقائية إلى نظام خارجي عند حدوث أحداث FHIR، فاستخدم:

- `POST /api/fhir/Subscription`

النظام يدعم حالياً:

- `rest-hook`

### 11.1 مثال إنشاء Subscription

```bash
curl -X POST "https://your-domain/api/fhir/Subscription" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Subscription",
    "criteria": "Observation?patient=Patient/123",
    "reason": "Notify external monitor system",
    "channel": {
      "type": "rest-hook",
      "endpoint": "https://external-system.example.com/fhir-webhook",
      "payload": "application/fhir+json",
      "header": [
        "Authorization: Bearer WEBHOOK_SECRET"
      ]
    }
  }'
```

### 11.2 أمثلة criteria

- `Observation`
- `Observation?patient=Patient/123`

### 11.3 ملاحظات مهمة

- الاشتراكات الحالية مخزنة في الذاكرة فقط
- هذا مناسب للتجارب والنسخ الأولى
- للإنتاج الكامل يفضّل نقلها إلى `DB` أو `Redis`

## 12. مثال عملي: ربط نظام LIS أو منصة خارجية

إذا كان لديك `LIS` حديث يدعم FHIR:

1. أعطه `client_id` و`client_secret`
2. اطلب token بنطاق:

```text
system/*.read system/Observation.write
```

3. اجعله يقرأ:

- `Patient`
- `Encounter`

4. بعد ظهور النتيجة أو القياس، اجعله يرسل:

- `POST /fhir/Observation`

إذا كان لديك `LIS` قديم أو جهاز analyzer لا يدعم FHIR:

- استخدم `HL7/MLLP`
- السرايا يدعم إرسال الطلبات للأجهزة واستقبال النتائج عبر `ORM/ORU`

## 13. مثال عملي: ربط جهاز مراقبة العلامات الحيوية

هناك 3 نماذج شائعة:

### النموذج 1: الجهاز يدعم FHIR مباشرة

- الجهاز أو gateway يحصل على token
- يرسل `Observation` مباشرة إلى السرايا

### النموذج 2: الجهاز لا يدعم FHIR لكن يوجد Middleware

- الجهاز يرسل بروتوكوله الخاص إلى middleware
- الـ middleware يحول البيانات إلى FHIR `Observation`
- ثم يرسلها إلى السرايا

### النموذج 3: الجهاز يدعم HL7 فقط

- اربطه عبر `HL7/MLLP`
- لا تحاول إجباره على FHIR إذا كان vendor لا يدعمه جيداً

## 14. مثال بسيط لـ Webhook Receiver

مثال Node.js بسيط يستقبل إشعارات Subscription:

```js
const express = require("express");
const app = express();

app.use(express.json());

app.post("/fhir-webhook", (req, res) => {
  console.log("FHIR webhook received:", JSON.stringify(req.body, null, 2));
  res.status(200).json({ ok: true });
});

app.listen(4000, () => {
  console.log("Webhook receiver running on port 4000");
});
```

## 15. أخطاء شائعة وكيف تعالجها

### 401 Unauthorized

الأسباب المعتادة:

- `client_id` غير مسجل
- `client_secret` غير صحيح
- token منتهي
- scope غير كاف

### 403 Forbidden

الأسباب المعتادة:

- token مقيد على `Patient` مختلف
- محاولة وصول أو كتابة cross-patient

### 400 Bad Request عند POST Observation

الأسباب المعتادة:

- لا يوجد `subject.reference`
- `subject.reference` ليس بالشكل `Patient/{id}`
- لا يوجد encounter مفتوح للمريض
- resourceType ليس `Observation`

## 16. أفضل ممارسات للإنتاج

- استخدم `HTTPS` فقط
- اضبط `FHIR_CLIENT_SECRET` دائماً
- اضبط `JWT_SECRET` قوي
- اعتمد `LOINC` للـ Observation قدر الإمكان
- لا تمنح `system/*.*` إلا عند الحاجة الحقيقية
- افصل حسابات التكامل بين:
  - بوابة مريض
  - نظام LIS
  - تكامل تقارير
  - webhook subscriber
- سجّل محاولات التكامل والأخطاء وراقبها
- إذا أصبحت `Subscription` جزءاً مهماً من التشغيل، انقلها من الذاكرة إلى تخزين دائم

## 17. خطة تطبيق موصى بها

### المرحلة 1

- تفعيل FHIR في بيئة الاختبار
- إعداد `FHIR_CLIENT_ID` و`FHIR_CLIENT_SECRET`
- اختبار `metadata`
- اختبار token
- اختبار `Patient` و`Encounter`

### المرحلة 2

- ربط نظام خارجي واحد
- تفعيل `Observation.write`
- التحقق من حفظ القياسات في النظام

### المرحلة 3

- تفعيل `Subscription`
- بناء webhook receiver
- مراقبة الـ events

### المرحلة 4

- توسيع الموارد حسب الحاجة
- إضافة إدارة applications من قاعدة البيانات
- نقل auth codes وsubscriptions إلى Redis أو DB

## 18. اقتراحات تحسين مستقبلية داخل السرايا

حتى يصبح FHIR في السرايا أقوى إنتاجياً:

- إنشاء جدول `RegisteredFhirApp` بدلاً من الاعتماد الكامل على env
- تخزين `authorization codes` في `Redis`
- تخزين `subscriptions` في `DB` أو `Redis`
- إضافة audit logs خاصة بطلبات FHIR
- إضافة rate limiting خاص بالـ FHIR
- توسيع عمليات الكتابة إلى موارد إضافية عند الحاجة

## 19. خلاصة عملية

إذا كان لديك نظام خارجي حديث:

- استخدم `FHIR`

إذا كان لديك جهاز مختبر أو أشعة قديم:

- استخدم `HL7/MLLP`

إذا كان لديك gateway أو middleware:

- اجعله يقرأ من السرايا عبر `FHIR`
- ويكتب إلى السرايا عبر `Observation`
- ويستقبل التحديثات عبر `Subscription`

هذا هو أفضل مسار عملي الآن وفقاً لما يدعمه نظام السرايا فعلياً.
